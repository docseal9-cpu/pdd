require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const authenticateToken = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const upload = multer({ dest: tempDir });

// Unauthenticated endpoints
app.post('/api/recovery-payload', async (req, res) => {
    const { email, contact1, contact2 } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        // Find user by email using Admin API
        const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const user = usersData.users.find(u => u.email === email);
        if (!user) return res.status(404).json({ error: 'Vault not found' });

        // --- Identity Verification ---
        const trustedContacts = user.user_metadata?.trusted_contacts || [];
        if (trustedContacts.length === 0) {
             return res.status(400).json({ error: 'Vault does not have any trusted contacts configured.' });
        }

        const normalizePhone = (p) => (p || '').replace(/[\s\-\(\)\+]/g, ''); // strip spaces and common symbols
        const normalizeName = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');

        const verifyContact = (input, registered) => {
            if (!input || !registered) return false;
            return normalizeName(input.name) === normalizeName(registered.name) && 
                   (input.email || '').trim().toLowerCase() === (registered.email || '').trim().toLowerCase() && 
                   normalizePhone(input.phone) === normalizePhone(registered.phone);
        };

        let isVerified = false;

        if (trustedContacts.length === 1) {
            // Only one contact configured, check if either input matches it
            isVerified = verifyContact(contact1, trustedContacts[0]) || verifyContact(contact2, trustedContacts[0]);
        } else if (trustedContacts.length >= 2) {
            // Two contacts configured, both must match
            const matchForward = verifyContact(contact1, trustedContacts[0]) && verifyContact(contact2, trustedContacts[1]);
            const matchReverse = verifyContact(contact1, trustedContacts[1]) && verifyContact(contact2, trustedContacts[0]);
            isVerified = matchForward || matchReverse;
        }

        if (!isVerified) {
            return res.status(403).json({ error: 'Identity Verification Failed. The provided details do not exactly match the registered trusted contacts.' });
        }
        // -----------------------------

        const payload = user.user_metadata?.recovery_payload;
        if (!payload) return res.status(400).json({ error: 'No recovery payload configured for this vault.' });

        res.json(payload);
    } catch (error) {
        console.error('Recovery error:', error);
        res.status(500).json({ error: 'Failed to fetch recovery data' });
    }
});

// Protect all other /api endpoints with Supabase JWT verification
app.use('/api', authenticateToken);

// Helper function to insert logs
async function logAction(userId, action, targetFile) {
    try {
        await supabase
            .from('logs')
            .insert([{ user_id: userId, action, target_file: targetFile }]);
    } catch (e) {
        console.error('Failed to log action:', e.message);
    }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const fileId = Date.now().toString();
        const isEmergency = req.body.is_emergency === 'true';
        
        const newFileRecord = {
            id: fileId,
            user_id: req.user.id,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadDate: new Date().toISOString(),
            is_emergency: isEmergency
        };

        // Since encryption is now done entirely on the client, the uploaded file IS the encrypted file!
        // We just move it from the temp directory to the permanent uploads directory.
        const encryptedFilePath = path.join(uploadDir, `${newFileRecord.id}.enc`);
        fs.renameSync(req.file.path, encryptedFilePath);

        // Insert metadata into Supabase 'files' table
        const { data, error } = await supabase
            .from('files')
            .insert([newFileRecord])
            .select();

        if (error) throw error;

        await logAction(req.user.id, 'UPLOAD', req.file.originalname);

        res.json({ message: 'File uploaded and encrypted successfully', file: data[0] });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process file' });
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', req.user.id);

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

app.get('/api/download/:id', async (req, res) => {
    const fileId = req.params.id;

    try {
        // Verify ownership
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .eq('user_id', req.user.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'File not found or unauthorized' });
        }

        const encryptedFilePath = path.join(uploadDir, `${fileId}.enc`);
        
        if (!fs.existsSync(encryptedFilePath)) {
            return res.status(404).json({ error: 'Encrypted file is missing on server' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${data.originalName}"`);
        res.setHeader('Content-Type', 'application/octet-stream'); // It's an encrypted blob now

        await logAction(req.user.id, 'DECRYPT', data.originalName);

        // Serve the encrypted blob directly back to the client
        const fileStream = fs.createReadStream(encryptedFilePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to decrypt and download file' });
        }
    }
});

app.delete('/api/files/:id', async (req, res) => {
    const fileId = req.params.id;

    try {
        // Verify ownership and delete from DB
        const { data, error } = await supabase
            .from('files')
            .delete()
            .eq('id', fileId)
            .eq('user_id', req.user.id)
            .select();

        if (error || data.length === 0) {
            return res.status(404).json({ error: 'File not found or unauthorized' });
        }

        // Delete from local disk
        const encryptedFilePath = path.join(uploadDir, `${fileId}.enc`);
        if (fs.existsSync(encryptedFilePath)) {
            fs.unlinkSync(encryptedFilePath);
        }

        await logAction(req.user.id, 'DELETE', data[0].originalName);

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Fetch logs error:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

app.listen(PORT, () => {
    console.log(`Secure Vault backend running on http://localhost:${PORT}`);
});
