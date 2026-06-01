import { useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import logo from '../assets/logo.png';

export default function Auth() {
  // 'landing', 'signin', 'signup', 'recover'
  const [view, setView] = useState('landing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Form State
  const [avatar, setAvatar] = useState(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Recovery State
  const [recoveryCode1, setRecoveryCode1] = useState('');
  const [contact1Name, setContact1Name] = useState('');
  const [contact1Email, setContact1Email] = useState('');
  const [contact1Phone, setContact1Phone] = useState('');

  const [recoveryCode2, setRecoveryCode2] = useState('');
  const [contact2Name, setContact2Name] = useState('');
  const [contact2Email, setContact2Email] = useState('');
  const [contact2Phone, setContact2Phone] = useState('');

  const handleAvatarClick = () => {
    fileInputRef.current.click();
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Limit base64 size roughly by checking length, but here we just accept it
        // In a production app you'd want to resize it on a canvas first
        setAvatar(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const validatePassword = (pwd) => {
    // 12+ chars, uppercase, number, special character
    const re = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;
    return re.test(pwd);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (view === 'recover') {
        // Fetch the payload from the server with identity verification
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/recovery-payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email,
            contact1: { name: contact1Name, email: contact1Email, phone: contact1Phone },
            contact2: { name: contact2Name, email: contact2Email, phone: contact2Phone }
          })
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch recovery data.');
        }

        const payload = await response.json();
        const { ciphertext, iv, salt } = payload;

        // Reconstruct keys
        const combinedKeyStr = recoveryCode1 + recoveryCode2;
        const enc = new TextEncoder();
        
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
            salt: new Uint8Array(salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16))),
            iterations: 100000,
            hash: "SHA-256"
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );

        let decryptedBuffer;
        try {
          decryptedBuffer = await window.crypto.subtle.decrypt(
            { 
              name: "AES-GCM", 
              iv: new Uint8Array(iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
            },
            aesKey,
            new Uint8Array(ciphertext.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
          );
        } catch (e) {
            throw new Error("Invalid Emergency Codes. Decryption failed.");
        }

        const dec = new TextDecoder();
        const masterPassword = dec.decode(decryptedBuffer);

        // Finally, log them in!
        const { error } = await supabase.auth.signInWithPassword({
          email: email,
          password: masterPassword
        });

        if (error) throw error;
        // User successfully recovered!
        sessionStorage.setItem('recoveryPassword', masterPassword);
      } else if (view === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        sessionStorage.removeItem('recoveryPassword');
      } else if (view === 'signup') {
        // Validation for Signup
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (!validatePassword(password)) {
          throw new Error('Password does not meet the strict security requirements.');
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              username,
              dob,
              mobile,
              gender,
              avatar_base64: avatar
            }
          }
        });
        
        if (error) throw error;
        sessionStorage.removeItem('recoveryPassword');
        // If email confirmation is off in Supabase, the user is logged in automatically.
        // The onAuthStateChange listener in App.jsx will handle the redirect.
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {view === 'landing' ? (
        <div className="landing-page-simple animated">
          <nav className="landing-nav-simple">
            <div className="landing-logo">
              <img src={logo} alt="DocSeal Logo" className="landing-logo-img" />
              <span>DocSeal</span>
            </div>
            <button className="btn btn-outline" onClick={() => setView('signin')}>Login</button>
            <button className="btn btn-primary" onClick={() => { setView('signup'); setError(null); }}>Get Started</button>
          </nav>

          <main className="landing-hero-simple">
            <h1 className="hero-headline-simple">
              Your Digital Legacy,<br />
              <span className="text-cyan">Secured.</span>
            </h1>
            <p className="hero-subtext-simple">
              Protect your sensitive assets with military-grade encryption and
              intelligent emergency access management. Zero-knowledge.
              Total privacy.
            </p>
            <div className="hero-cta-group-simple">
              <button className="btn btn-gradient-cyan" onClick={() => { setView('signup'); setError(null); }}>
                Create Your Vault
              </button>
              <button className="btn btn-gradient-cyan" onClick={() => setView('signin')}>
                Login to Vault
              </button>
              <button className="btn btn-gradient-red" onClick={() => setView('recover')}>
                Recover Emergency Vault
              </button>
            </div>
          </main>
        </div>
      ) : (
        <div className="auth-container animated">
          <div className={`auth-card animated ${view === 'signup' ? 'signup-mode' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
            <button className="back-btn" onClick={() => setView('landing')} title="Back to menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"></path></svg>
            </button>
            <h2 className="auth-header" style={{ margin: 0 }}>
              {view === 'signin' && 'Sign In to DocSeal'}
              {view === 'signup' && 'Create DocSeal Vault'}
              {view === 'recover' && 'Emergency Recovery'}
            </h2>
          </div>
          
          {error && <div className="alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          <form onSubmit={handleAuth}>
            {view === 'signup' && (
            <>
              <div className="avatar-upload-container">
                <input 
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                />
                <div className="avatar-circle" onClick={handleAvatarClick}>
                  {avatar ? (
                    <img src={avatar} alt="Avatar Preview" className="avatar-preview" />
                  ) : (
                    <span className="avatar-placeholder">Upload Photo</span>
                  )}
                </div>
                <span className="avatar-subtext">Recommended ratio 1:1 (Square)</span>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="input-field"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    className="input-field"
                    type="text"
                    placeholder="johndoe_secure"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    className="input-field"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input
                    className="input-field"
                    type="tel"
                    placeholder="+1 234 567 890"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Gender</label>
                  <select 
                    className="input-field" 
                    value={gender} 
                    onChange={(e) => setGender(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </>
          )}

            {view === 'recover' ? (
              <div className="form-grid" style={{ marginBottom: 0 }}>
                <div className="form-group full-width">
                  <label className="form-label">Vault Owner's Email Address</label>
                  <input
                    className="input-field"
                    type="email"
                    placeholder="name@secure.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>The email address of the vault you are trying to recover.</p>
                </div>

                <div className="form-group full-width" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Contact #1 Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Name</label>
                      <input className="input-field" value={contact1Name} onChange={(e) => setContact1Name(e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Email</label>
                      <input className="input-field" type="email" value={contact1Email} onChange={(e) => setContact1Email(e.target.value)} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Phone</label>
                      <input className="input-field" type="tel" value={contact1Phone} onChange={(e) => setContact1Phone(e.target.value)} required />
                    </div>
                  </div>
                  <label className="form-label">Contact #1 Emergency Code (Access Token)</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Enter the 64-character cipher text key..."
                    value={recoveryCode1}
                    onChange={(e) => setRecoveryCode1(e.target.value)}
                    style={{ fontFamily: 'monospace' }}
                    required
                  />
                </div>

                <div className="form-group full-width" style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Contact #2 Details</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Name</label>
                      <input className="input-field" value={contact2Name} onChange={(e) => setContact2Name(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Email</label>
                      <input className="input-field" type="email" value={contact2Email} onChange={(e) => setContact2Email(e.target.value)} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Phone</label>
                      <input className="input-field" type="tel" value={contact2Phone} onChange={(e) => setContact2Phone(e.target.value)} />
                    </div>
                  </div>
                  <label className="form-label">Contact #2 Emergency Code (Optional)</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Enter the 64-character cipher text key..."
                    value={recoveryCode2}
                    onChange={(e) => setRecoveryCode2(e.target.value)}
                    style={{ fontFamily: 'monospace' }}
                  />
                  <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: '-1px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path></svg>
                    Strict Identity Verification is enforced. All details must exactly match the registered contacts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="form-grid" style={{ marginBottom: 0 }}>
                <div className="form-group full-width">
                  <label className="form-label">{view === 'signin' ? 'Email Address' : 'Security Email'}</label>
                  <input
                    className="input-field"
                    type="email"
                    placeholder="name@secure.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group full-width" style={{ marginTop: '0.5rem' }}>
                  <label className="form-label">{view === 'signin' ? 'Password' : 'Master Password'}</label>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {view === 'signup' && password.length > 0 && !validatePassword(password) && (
                    <p className="password-warning">
                      Password must be at least 12 characters, include uppercase, numbers, and a special character.
                    </p>
                  )}
                </div>

                {view === 'signup' && (
                  <div className="form-group full-width" style={{ marginTop: '0.5rem' }}>
                    <label className="form-label">Confirm Master Password</label>
                    <input
                      className="input-field"
                      type="password"
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>
            )}

            <button className="btn-auth" type="submit" disabled={loading || (view === 'signup' && password.length > 0 && !validatePassword(password))}>
              {loading ? 'Processing...' : (view === 'recover' ? 'Initiate Recovery' : 'Authenticate')}
            </button>
          </form>

          {view !== 'recover' && (
            <p className="auth-footer">
              {view === 'signin' ? "Don't have a vault? " : "Already have a vault? "}
              <button 
                type="button" 
                className="auth-link"
                onClick={() => {
                  setView(view === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
              >
                {view === 'signin' ? 'Sign Up' : 'Login'}
              </button>
            </p>
          )}
          </div>
        </div>
      )}
    </>
  );
}
