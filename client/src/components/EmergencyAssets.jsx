import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import FileList from './FileList';

export default function EmergencyAssets({ files, onDelete, session }) {
  const metadata = session?.user?.user_metadata || {};
  const [trustedContacts, setTrustedContacts] = useState(metadata.trusted_contacts || []);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    relationship: ''
  });

  // Code Generation State
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showGeneratedCodesModal, setShowGeneratedCodesModal] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const newContacts = [...trustedContacts, formData];
      
      const { data, error } = await supabase.auth.updateUser({
        data: { trusted_contacts: newContacts }
      });

      if (error) throw error;
      
      setTrustedContacts(newContacts);
      setIsAdding(false);
      setFormData({ name: '', email: '', phone: '', relationship: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContact = async (indexToRemove) => {
    try {
      const newContacts = trustedContacts.filter((_, i) => i !== indexToRemove);
      const { data, error } = await supabase.auth.updateUser({
        data: { trusted_contacts: newContacts }
      });

      if (error) throw error;
      setTrustedContacts(newContacts);
    } catch (err) {
      alert('Failed to remove contact: ' + err.message);
    }
  };

  const generateSecureKey = () => {
    // Generate a 256-bit (32 byte) secure random key using Web Crypto API
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    // Convert to a hexadecimal string ("cipher text")
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const handleGenerateCodesSubmit = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerifyError(null);

    try {
      // 1. Verify Master Password
      const { error } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: verifyPassword
      });

      if (error) throw new Error('Incorrect Master Password');

      // 2. Generate new keys for all existing contacts
      const updatedContacts = trustedContacts.map(contact => ({
        ...contact,
        recovery_code: generateSecureKey()
      }));

      // 2.5 Encrypt the Master Password using the combined keys
      const combinedKeyStr = updatedContacts.map(c => c.recovery_code).join('');
      const enc = new TextEncoder();
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(combinedKeyStr),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      const aesKey = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        enc.encode(verifyPassword)
      );

      const recovery_payload = {
        ciphertext: Array.from(new Uint8Array(encryptedBuffer)).map(b => b.toString(16).padStart(2, '0')).join(''),
        iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
        salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
      };

      // 3. Save to Supabase metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { 
          trusted_contacts: updatedContacts,
          recovery_payload: recovery_payload
        }
      });

      if (updateError) throw updateError;

      setTrustedContacts(updatedContacts);
      setShowVerificationModal(false);
      setVerifyPassword('');
      setShowGeneratedCodesModal(true);

    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="animated">
      <h2 className="page-header" style={{ color: '#ef4444' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        Emergency Assets
      </h2>
      <p style={{ color: '#fca5a5', marginBottom: '2rem' }}>Highly classified documents flagged for emergency access.</p>

      {/* Trusted Contacts Section */}
      <h3 style={{ color: '#fff', marginBottom: '1rem', fontSize: '1.1rem' }}>Trusted Persons (Dead Man's Switch)</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Add up to 2 trusted contacts. In the event of an emergency, these contacts may be authorized to receive access to your Emergency Assets.
      </p>

      <div className="contacts-grid">
        {trustedContacts.map((contact, index) => (
          <div key={index} className="contact-card animated">
            <button className="contact-remove" onClick={() => handleRemoveContact(index)} title="Remove Contact">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
            </button>
            <div className="contact-header">
              <div className="contact-avatar">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="contact-name">{contact.name}</h4>
                <span className="contact-relation">{contact.relationship}</span>
              </div>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <div className="contact-detail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
                {contact.email}
              </div>
              <div className="contact-detail" style={{ marginTop: '0.25rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                {contact.phone}
              </div>
            </div>
          </div>
        ))}

        {trustedContacts.length < 2 && !isAdding && (
          <div className="contact-card add-contact-card" onClick={() => setIsAdding(true)}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>Add Trusted Person</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>({2 - trustedContacts.length} remaining)</span>
          </div>
        )}
      </div>

      {trustedContacts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowVerificationModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#6366f1' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Generate Emergency Codes
          </button>
        </div>
      )}

      {isAdding && (
        <div className="modal-overlay animated">
          <div className="modal-card">
            <h3 className="modal-header">Add Trusted Person</h3>
            <p className="modal-description">Enter the personal details of the trusted contact.</p>
            
            {error && <div className="alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
            
            <form onSubmit={handleSaveContact} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Full Name</label>
                <input name="name" className="input-field" value={formData.name} onChange={handleInputChange} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Email Address</label>
                <input name="email" type="email" className="input-field" value={formData.email} onChange={handleInputChange} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Phone Number</label>
                <input name="phone" type="tel" className="input-field" value={formData.phone} onChange={handleInputChange} required />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Relationship</label>
                <input name="relationship" className="input-field" placeholder="e.g. Spouse, Sibling, Attorney" value={formData.relationship} onChange={handleInputChange} required />
              </div>
              
              <div className="modal-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-danger" onClick={() => setIsAdding(false)} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verification Modal for Generating Codes */}
      {showVerificationModal && (
        <div className="modal-overlay animated">
          <div className="modal-card">
            <h3 className="modal-header">Security Authorization</h3>
            <p className="modal-description">Please enter your Master Password to authorize the generation of cryptographic emergency codes.</p>
            
            <form onSubmit={handleGenerateCodesSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="Master Password"
                  value={verifyPassword}
                  onChange={(e) => setVerifyPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {verifyError && <div className="alert-error" style={{ marginBottom: '1.5rem' }}>{verifyError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn btn-danger" onClick={() => setShowVerificationModal(false)} disabled={isVerifying}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isVerifying}>
                  {isVerifying ? 'Verifying...' : 'Authorize & Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Display Generated Codes Modal */}
      {showGeneratedCodesModal && (
        <div className="modal-overlay animated">
          <div className="modal-card" style={{ maxWidth: '600px' }}>
            <h3 className="modal-header" style={{ color: '#10b981' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', verticalAlign: 'middle' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Emergency Codes Generated
            </h3>
            <p className="modal-description" style={{ marginBottom: '1.5rem' }}>
              Secure cryptographic cipher text keys have been generated for your trusted contacts. 
              <strong> You must securely transmit these to them now. They will not be displayed again.</strong>
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
              {trustedContacts.map((contact, idx) => (
                <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#fca5a5' }}>{contact.name}</strong>
                    <button 
                      onClick={() => copyToClipboard(contact.recovery_code, idx)}
                      style={{ background: 'none', border: 'none', color: copiedIndex === idx ? '#10b981' : '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', transition: 'color 0.2s' }}
                    >
                      {copiedIndex === idx ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>
                          Copy Full Code
                        </>
                      )}
                    </button>
                  </div>
                  <code style={{ display: 'block', padding: '0.75rem', background: '#000', borderRadius: '4px', color: '#10b981', wordBreak: 'break-all', fontSize: '0.9rem', fontFamily: 'monospace', letterSpacing: '1px' }}>
                    {contact.recovery_code.substring(0, 4)}{'.'.repeat(56)}
                  </code>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowGeneratedCodesModal(false)}>
                I have saved these codes securely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusing the FileList for Emergency Assets */}
      <FileList files={files} onDelete={onDelete} session={session} requirePasswordForDelete={true} />
    </div>
  );
}
