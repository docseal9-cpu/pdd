import { NavLink } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import logo from '../assets/logo.png';

export default function Sidebar() {
  const handleSignOut = async () => {
    sessionStorage.removeItem('recoveryPassword');
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    }
    localStorage.clear();
    window.location.href = '/';
  };

  return (
    <div className="sidebar animated">
      <div className="sidebar-header">
        <img src={logo} alt="DocSeal Logo" style={{ height: '32px', width: '32px', borderRadius: '6px', objectFit: 'cover' }} />
        DocSeal
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/profile" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          My Profile
        </NavLink>

        <NavLink to="/ingestion" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Secure Ingestion
        </NavLink>

        <NavLink to="/archives" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><path d="M10 4v4"></path><path d="M2 8h20"></path><path d="M6 4v4"></path></svg>
          Encrypted Archives
        </NavLink>

        <NavLink to="/emergency" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} style={{ color: '#ef4444' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Emergency Assets
        </NavLink>

        <NavLink to="/logs" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Security Audit Logs
        </NavLink>
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <button className="nav-item" onClick={handleSignOut} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span style={{ color: '#ef4444' }}>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
