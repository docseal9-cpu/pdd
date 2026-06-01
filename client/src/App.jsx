import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import logo from './assets/logo.png';
import Profile from './components/Profile';
import Uploader from './components/Uploader';
import FileList from './components/FileList';
import EmergencyAssets from './components/EmergencyAssets';
import AuditLogs from './components/AuditLogs';
import { supabase } from './supabaseClient';

function VaultDashboard({ session }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    fetchFiles();
  }, [session]);

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/files`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleUploadComplete = (newFile) => {
    setFiles([newFile, ...files]);
  };

  const handleDelete = async (fileId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        setFiles(files.filter(f => f.id !== fileId));
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/profile" replace />} />
          <Route path="/profile" element={<Profile session={session} />} />
          <Route path="/ingestion" element={
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 className="page-header" style={{ marginBottom: 0 }}>Secure Ingestion</h2>
                <Link to="/archives" className="btn btn-outline-cyan" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  Close
                </Link>
              </div>
              <Uploader onUploadComplete={handleUploadComplete} session={session} />
            </>
          } />
          <Route path="/archives" element={
            <>
              <h2 className="page-header">Encrypted Archives</h2>
              <FileList files={files.filter(f => !f.is_emergency)} onDelete={handleDelete} session={session} />
            </>
          } />
          <Route path="/emergency" element={
            <EmergencyAssets files={files.filter(f => f.is_emergency)} onDelete={handleDelete} session={session} />
          } />
          <Route path="/logs" element={<AuditLogs session={session} />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      // Ensure splash screen is visible for at least 2 seconds for the animation
      const minDelay = new Promise(resolve => setTimeout(resolve, 2000));
      const sessionPromise = supabase.auth.getSession();
      
      const [_, { data: { session } }] = await Promise.all([minDelay, sessionPromise]);
      setSession(session);
      setLoading(false);
    };
    
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <img src={logo} alt="DocSeal Logo" className="splash-logo" />
          <h1 className="splash-text">DocSeal</h1>
          <div className="splash-progress-container">
            <div className="splash-progress-fill"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      {!session ? (
        <Auth />
      ) : (
        <VaultDashboard session={session} />
      )}
    </Router>
  );
}

export default App;
