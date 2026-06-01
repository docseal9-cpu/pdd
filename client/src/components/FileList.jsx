import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { decryptFile } from '../crypto';
import { API_BASE } from '../config';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function FileList({ files, onDelete, session, requirePasswordForDelete, isEmergencyVault }) {
  const [pendingAction, setPendingAction] = useState(null); // { type: 'download' | 'delete' | 'secure-download', fileId: string, fileName: string }
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyError, setVerifyError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Preview State
  const [previewFile, setPreviewFile] = useState(null); // { url, name, type, fileId, blob, cachedPassword }

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('text')) return '📝';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
    return '📁';
  };

  const initiateAction = async (type, fileId, fileName) => {
    const recoveryPassword = sessionStorage.getItem('recoveryPassword');
    
    // Always force password verification for deletes, but allow cached passwords for downloads
    if (recoveryPassword && type !== 'delete') {
      if (type === 'download') {
        await executeDecryptForPreview(fileId, fileName, recoveryPassword);
      } else if (type === 'secure-download') {
        triggerBrowserDownload(previewFile.blob, previewFile.name);
        closePreview();
      }
      return;
    }

    setPendingAction({ type, fileId, fileName });
    setVerifyPassword('');
    setVerifyError(null);
  };

  const cancelAction = () => {
    setPendingAction(null);
    setVerifyPassword('');
    setVerifyError(null);
  };

  const getMimeTypeFromName = (filename, defaultType) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    if (ext === 'pdf') return 'application/pdf';
    if (['txt', 'csv', 'md'].includes(ext)) return 'text/plain';
    if (ext === 'json') return 'application/json';
    return defaultType;
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerifyError(null);

    try {
      if (pendingAction.type === 'secure-download') {
        // Fast-path for double authentication: check against the cached password
        // used to decrypt the preview, avoiding a redundant network call that can hang.
        if (verifyPassword !== previewFile.cachedPassword) {
          throw new Error('Incorrect Master Password');
        }
      } else {
        // Full verification for initial decrypt or delete
        const { error } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: verifyPassword
        });

        if (error) {
          throw new Error('Incorrect Master Password');
        }
      }

      // Password verified!
      const actionToExecute = pendingAction;
      const cachedPassword = verifyPassword;
      cancelAction();

      if (actionToExecute.type === 'download') {
        // Initial decrypt for preview
        await executeDecryptForPreview(actionToExecute.fileId, actionToExecute.fileName, cachedPassword);
      } else if (actionToExecute.type === 'delete') {
        onDelete(actionToExecute.fileId);
      } else if (actionToExecute.type === 'secure-download') {
        // Second authentication passed, trigger actual download
        triggerBrowserDownload(previewFile.blob, previewFile.name);
        closePreview();
      }
      
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const executeDecryptForPreview = async (fileId, fileName, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/download/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      // 1. Get the encrypted data from the server
      const encryptedBuffer = await response.arrayBuffer();
      
      // 2. Client-Side Decryption
      const decryptedBlob = await decryptFile(encryptedBuffer, password);
      
      // 3. Find MIME type from original files list or filename
      const fileRecord = files.find(f => f.id === fileId);
      let mimeType = fileRecord ? fileRecord.mimeType : 'application/octet-stream';
      if (!mimeType || mimeType === 'application/octet-stream') {
        mimeType = getMimeTypeFromName(fileName, mimeType);
      }
      
      // We must explicitly set the correct type so the browser knows how to preview it
      const typedBlob = new Blob([decryptedBlob], { type: mimeType });
      
      // 4. Create Object URL and set Preview State
      const url = window.URL.createObjectURL(typedBlob);
      setPreviewFile({
        url,
        name: fileName,
        type: mimeType,
        fileId,
        cachedPassword: password, // Storing for future if needed, though we challenge again
        blob: typedBlob
      });
      
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to decrypt file. Incorrect password or corrupted data.');
    }
  };

  const triggerBrowserDownload = async (blob, fileName) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result;
            if (typeof result === 'string') {
              resolve(result.split(',')[1]);
            } else {
              reject(new Error('Failed to read file as Base64'));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        });
        
        await Share.share({
          title: fileName,
          url: result.uri
        });
      } catch (e) {
        console.error('Save error', e);
        alert('Failed to save file to device');
      }
    } else {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const closePreview = () => {
    if (previewFile && previewFile.url) {
      window.URL.revokeObjectURL(previewFile.url);
    }
    setPreviewFile(null);
  };

  const renderPreviewContent = () => {
    if (!previewFile) return null;
    const { type, url } = previewFile;

    if (type.includes('image')) {
      return <img src={url} alt="Preview" />;
    } else if (type.includes('pdf')) {
      return <embed src={url} type="application/pdf" />;
    } else if (type.includes('text') || type.includes('json')) {
      return <iframe src={url} title="Text Preview" style={{ background: 'white' }}></iframe>;
    } else {
      return (
        <div className="preview-unsupported">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
            <polyline points="13 2 13 9 20 9"></polyline>
          </svg>
          <p>Preview not available for this file type.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>You can still download it securely.</p>
        </div>
      );
    }
  };

  return (
    <div className="animated">
      <ul className="file-list">
        {files.map((file) => (
          <li key={file.id} className="file-item">
            <div className="file-info">
              <span className="file-icon">{getFileIcon(file.mimeType)}</span>
              <div className="file-details">
                <p className="file-name">{file.originalName}</p>
                <p className="file-meta">
                  {formatSize(file.size)} • {new Date(file.uploadDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="file-actions">
              <button 
                className="btn btn-primary"
                onClick={() => initiateAction('download', file.id, file.originalName)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                View / Decrypt
              </button>
              <button 
                className="btn btn-danger"
                onClick={() => initiateAction('delete', file.id, file.originalName)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Password Verification Modal (Used for Decrypt, Delete, AND Secure Download) */}
      {pendingAction && (
        <div className="modal-overlay animated" style={{ zIndex: 1100 }}>
          <div className="modal-card">
            <h3 className="modal-header">Verify Identity</h3>
            <p className="modal-description">
              Please enter your Master Password to authorize the <strong>{pendingAction.type.replace('-', ' ')}</strong> of <strong>{pendingAction.fileName}</strong>.
            </p>
            
            {verifyError && <div className="alert-error" style={{ marginBottom: '1rem', padding: '0.75rem' }}>{verifyError}</div>}
            
            <form onSubmit={handleVerificationSubmit}>
              <input
                type="password"
                className="input-field"
                placeholder="Master Password"
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                required
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-danger" onClick={cancelAction} disabled={isVerifying}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isVerifying}>
                  {isVerifying ? 'Verifying...' : 'Verify & Proceed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="modal-overlay animated">
          <div className="preview-modal-card">
            <div className="preview-header">
              <span className="preview-title">{previewFile.name}</span>
            </div>
            
            <div className="preview-content">
              {renderPreviewContent()}
            </div>
            
            <div className="preview-footer">
              <button className="btn" style={{ background: '#374151', color: 'white' }} onClick={closePreview}>
                Close
              </button>
              {!isEmergencyVault && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => initiateAction('secure-download', previewFile.fileId, previewFile.name)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Secure Download
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
