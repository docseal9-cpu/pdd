import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { encryptFile } from '../crypto';
import { API_BASE } from '../config';

export default function Uploader({ onUploadComplete, session }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isEmergency, setIsEmergency] = useState(false);
  
  // Password Verification State
  const [pendingFile, setPendingFile] = useState(null);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyError, setVerifyError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelection = async (file) => {
    const recoveryPassword = sessionStorage.getItem('recoveryPassword');
    if (recoveryPassword) {
      setIsUploading(true);
      setUploadProgress(10);
      try {
        const encryptedBlob = await encryptFile(file, recoveryPassword);
        setUploadProgress(40);
        uploadFile(encryptedBlob, file.name, file.type);
      } catch (err) {
        console.error('Encryption failed', err);
        alert('Encryption failed during recovery mode.');
        setIsUploading(false);
      }
    } else {
      setPendingFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerifyError(null);

    try {
      // Verify password by attempting to sign in again
      const { error } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: verifyPassword
      });

      if (error) {
        throw new Error('Incorrect Master Password');
      }

      // Password is correct, proceed with encryption and upload
      const fileToUpload = pendingFile;
      setPendingFile(null);
      
      setIsUploading(true);
      setUploadProgress(10);
      
      // 1. Client-Side Encryption
      const encryptedBlob = await encryptFile(fileToUpload, verifyPassword);
      setVerifyPassword('');
      setUploadProgress(40);

      // 2. Upload Encrypted Blob
      uploadFile(encryptedBlob, fileToUpload.name, fileToUpload.type);
      
    } catch (err) {
      setVerifyError(err.message);
      setIsVerifying(false);
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setVerifyPassword('');
    setVerifyError(null);
    setIsVerifying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (encryptedBlob, originalName, originalType) => {
    const formData = new FormData();
    const typedBlob = new Blob([encryptedBlob], { type: originalType });
    formData.append('file', typedBlob, originalName);
    formData.append('is_emergency', isEmergency);

    try {
      // Simulate slow upload for UI aesthetics
      const uploadInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(uploadInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData,
      });

      clearInterval(uploadInterval);
      setUploadProgress(100);

      if (response.ok) {
        const data = await response.json();
        setTimeout(() => {
          onUploadComplete(data.file);
          setIsUploading(false);
          setIsVerifying(false);
          setUploadProgress(0);
        }, 500);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Upload failed. Please try again.');
      setIsUploading(false);
      setIsVerifying(false);
      setUploadProgress(0);
    }
  };

  return (
    <>
      <div className="glass-card animated">
        <div 
          className={`uploader ${isDragging ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="upload-input"
          />
          <div className="upload-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <h3 className="upload-text">Drag & Drop to Securely Upload</h3>
          <p className="upload-subtext">Files are encrypted instantly using AES-256 before storage</p>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <input 
            type="checkbox" 
            id="emergency-toggle" 
            checked={isEmergency}
            onChange={(e) => setIsEmergency(e.target.checked)}
            style={{ width: '1.2rem', height: '1.2rem', accentColor: '#ef4444', cursor: 'pointer' }}
          />
          <label htmlFor="emergency-toggle" style={{ color: '#fca5a5', cursor: 'pointer', userSelect: 'none', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            Mark as Emergency Asset
          </label>
        </div>

        {isUploading && (
          <div className="upload-status animated">
            <p>Encrypting & Storing...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          </div>
        )}
      </div>

      {/* Password Verification Modal */}
      {pendingFile && (
        <div className="modal-overlay animated">
          <div className="modal-card">
            <h3 className="modal-header">Verify Identity</h3>
            <p className="modal-description">
              Please enter your Master Password to authorize the upload of <strong>{pendingFile.name}</strong> into your vault.
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
                <button type="button" className="btn btn-danger" onClick={cancelUpload} disabled={isVerifying}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isVerifying}>
                  {isVerifying ? 'Verifying...' : 'Verify & Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
