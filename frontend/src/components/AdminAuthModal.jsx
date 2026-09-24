import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogIn, UserPlus, KeyRound, User, Lock, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { registerAdmin, loginAdmin } from '../services/api';

const DEMO_HOSPITAL_CREDENTIALS = {
  apollo: { id: 'ADMIN-APOLLO-01', pass: 'Apollo@2026', name: 'Dr. Rajesh Sharma' },
  lok_nayak: { id: 'ADMIN-LNJP-01', pass: 'LNJP@2026', name: 'Dr. Suresh Kumar' },
  aiims: { id: 'ADMIN-AIIMS-01', pass: 'AIIMS@2026', name: 'Dr. Randeep Guleria' },
  fortis: { id: 'ADMIN-FORTIS-01', pass: 'Fortis@2026', name: 'Dr. Ashok Seth' },
  max: { id: 'ADMIN-MAX-01', pass: 'Max@2026', name: 'Dr. Balbir Singh' }
};

export default function AdminAuthModal({ hospital, onAuthSuccess, onBackToSelection }) {
  const [activeTab, setActiveTab] = useState(hospital.isRegistered ? 'login' : 'register');
  const [adminName, setAdminName] = useState('');
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fillDemoCredentials = () => {
    const creds = DEMO_HOSPITAL_CREDENTIALS[hospital.id] || {
      id: `ADMIN-${hospital.id.toUpperCase()}-01`,
      pass: 'Apollo@2026',
      name: 'Dr. Rajesh Sharma'
    };
    setAdminId(creds.id);
    setPassword(creds.pass);
    setAdminName(creds.name);
    setErrorMessage('');
  };

  // Auto-adapt tab when hospital prop changes
  useEffect(() => {
    setActiveTab(hospital.isRegistered ? 'login' : 'register');
    setErrorMessage('');
    setSuccessMessage('');
    setAdminName('');
    setAdminId('');
    setPassword('');
  }, [hospital]);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await registerAdmin(hospital.id, {
        adminName,
        adminId,
        password
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Registration failed.');
        setLoading(false);
        return;
      }

      setSuccessMessage(res.message || 'Registration successful! Directing to dashboard...');
      setTimeout(() => {
        onAuthSuccess(res.admin);
      }, 700);
    } catch (err) {
      setErrorMessage(err.message || 'Network error during registration.');
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await loginAdmin(hospital.id, {
        adminId,
        password
      });

      if (!res.success) {
        if (res.needsRegistration) {
          setErrorMessage(res.error);
          setActiveTab('register');
        } else {
          setErrorMessage(res.error || 'Login failed.');
        }
        setLoading(false);
        return;
      }

      setSuccessMessage('Login verified! Directing to dashboard...');
      setTimeout(() => {
        onAuthSuccess(res.admin);
      }, 700);
    } catch (err) {
      setErrorMessage(err.message || 'Network error during login.');
      setLoading(false);
    }
  };

  return (
    <div className="card-glass animate-fade-in" style={{
      maxWidth: '560px',
      margin: '28px auto 0 auto',
      padding: '32px',
      backgroundColor: '#ffffff',
      border: '1.5px solid var(--border-light)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)'
    }}>
      {/* Hospital Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '18px',
        borderBottom: '1px solid var(--border-light)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Building2 size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {hospital.name}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {hospital.address}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToSelection}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.78rem' }}
        >
          Change
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        backgroundColor: 'var(--bg-surface-soft)',
        borderRadius: 'var(--radius-md)',
        padding: '4px',
        marginBottom: '22px'
      }}>
        <button
          type="button"
          onClick={() => {
            if (hospital.isRegistered) {
              setErrorMessage('Registration has already been completed once for this hospital. Please log in directly.');
            } else {
              setActiveTab('register');
              setErrorMessage('');
            }
          }}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'register' ? '#ffffff' : 'transparent',
            color: activeTab === 'register' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'register' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <UserPlus size={16} />
          <span>1-Time Registration</span>
          {!hospital.isRegistered && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--warning)'
            }} />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('login');
            setErrorMessage('');
          }}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: activeTab === 'login' ? '#ffffff' : 'transparent',
            color: activeTab === 'login' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'login' ? 'var(--shadow-sm)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <LogIn size={16} />
          <span>Admin Login</span>
        </button>
      </div>

      {/* Error & Success Feedback Alerts */}
      {errorMessage && (
        <div className="animate-fade-in" style={{
          backgroundColor: 'var(--danger-light)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          color: 'var(--danger)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '18px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="animate-fade-in" style={{
          backgroundColor: 'var(--success-light)',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          color: 'var(--success)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '18px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* FORM: 1-Time Registration */}
      {activeTab === 'register' ? (
        <form onSubmit={handleRegisterSubmit}>
          <div style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            marginBottom: '14px',
            lineHeight: 1.4
          }}>
            Please enter your pre-allotted credentials matching the developer data entry in <strong>{hospital.name}</strong>'s database. Registration occurs <strong>one time only</strong>.
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Admin Full Name</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Must match pre-entry</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Dr. Rajesh Sharma"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Admin ID</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Pre-allotted ID</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. ADMIN-APOLLO-01"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <span>Password</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Pre-allotted Password</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px', marginTop: '6px' }}
          >
            {loading ? 'Verifying Developer Entry...' : 'Complete 1-Time Registration & Enter'}
          </button>
        </form>
      ) : (
        /* FORM: Admin Login */
        <form onSubmit={handleLoginSubmit}>
          <div style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            marginBottom: '14px',
            lineHeight: 1.4
          }}>
            Log in to <strong>{hospital.name}</strong> Hospital Dashboard using your registered Admin ID and password.
          </div>

          <div className="form-group">
            <label className="form-label">Admin ID</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. ADMIN-APOLLO-01"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px', marginTop: '6px' }}
          >
            {loading ? 'Authenticating...' : 'Log In to Hospital Dashboard'}
          </button>
        </form>
      )}
    </div>
  );
}
