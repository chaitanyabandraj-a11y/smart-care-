import React, { useState } from 'react';
import { User, Phone, Mail, Lock, ShieldCheck, KeyRound, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { registerEmergencyUser, verifyRegistrationOtp, requestLoginOtp, verifyLoginOtp } from '../services/api';

export default function EmergencyAuth({ onAuthSuccess }) {
  const [mode, setMode] = useState('register'); // 'register' or 'login'
  const [step, setStep] = useState('credentials'); // 'credentials' or 'otp'

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // OTP flow state
  const [pendingUserId, setPendingUserId] = useState(null);
  const [simulatedOtpDisplay, setSimulatedOtpDisplay] = useState(null);

  // Status messages
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const resetForm = (newMode) => {
    setMode(newMode);
    setStep('credentials');
    setErrorMsg('');
    setSuccessMsg('');
    setOtpCode('');
    setSimulatedOtpDisplay(null);
  };

  // Submit Registration Credentials
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await registerEmergencyUser({ name, phone, email, password });
      if (!res.success) {
        setErrorMsg(res.error || 'Registration failed.');
        setLoading(false);
        return;
      }

      setPendingUserId(res.userId);
      setSimulatedOtpDisplay(res.otpCode);
      setSuccessMsg(res.message);
      setStep('otp');
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with server.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Registration OTP
  const handleVerifyRegistrationOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await verifyRegistrationOtp({ userId: pendingUserId, otpCode });
      if (!res.success) {
        setErrorMsg(res.error || 'OTP verification failed.');
        setLoading(false);
        return;
      }

      setSuccessMsg('Registration verified! Entering Emergency SOS Console...');
      setTimeout(() => {
        onAuthSuccess(res.user);
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying OTP.');
      setLoading(false);
    }
  };

  // Submit Login Credentials
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await requestLoginOtp({ identifier: phone || email, password });
      if (!res.success) {
        setErrorMsg(res.error || 'Login failed.');
        setLoading(false);
        return;
      }

      setPendingUserId(res.userId);
      setSimulatedOtpDisplay(res.otpCode);
      setSuccessMsg(res.message);
      setStep('otp');
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with server.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Login OTP
  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await verifyLoginOtp({ userId: pendingUserId, otpCode });
      if (!res.success) {
        setErrorMsg(res.error || 'OTP verification failed.');
        setLoading(false);
        return;
      }

      setSuccessMsg('Identity verified! Entering Emergency SOS Console...');
      setTimeout(() => {
        onAuthSuccess(res.user);
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying OTP.');
      setLoading(false);
    }
  };

  return (
    <div className="card-glass animate-fade-in" style={{
      maxWidth: '520px',
      margin: '24px auto',
      padding: '32px',
      backgroundColor: '#ffffff',
      border: '1.5px solid var(--border-light)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)'
    }}>
      {/* Visual Hospital Emergency Trauma Bay Banner */}
      <div style={{
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        height: '135px',
        backgroundImage: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.35) 0%, rgba(15, 23, 42, 0.88) 100%), url(/images/ambulance_emergency_bay.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '16px',
        color: '#ffffff',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span className="badge badge-red" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>
            24x7 Critical Trauma Care
          </span>
          <span style={{ fontSize: '0.74rem', color: '#fca5a5', fontWeight: 600 }}>
            5 Trauma Centers Active
          </span>
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
          Real-Time Emergency SOS & ALS Ambulance Network
        </div>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <img 
          src="/logos/emergency.svg" 
          alt="Emergency SOS" 
          style={{
            width: '56px',
            height: '56px',
            marginBottom: '10px',
            filter: 'drop-shadow(0 6px 14px rgba(220, 38, 38, 0.35))'
          }}
        />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Emergency Patient Portal Access
        </h2>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Secure authentication with mandatory OTP verification for emergency dispatch
        </p>
      </div>

      {/* Tabs */}
      {step === 'credentials' && (
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-surface-soft)',
          borderRadius: 'var(--radius-md)',
          padding: '4px',
          marginBottom: '20px'
        }}>
          <button
            type="button"
            onClick={() => resetForm('register')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: mode === 'register' ? '#ffffff' : 'transparent',
              color: mode === 'register' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: mode === 'register' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            New Registration
          </button>
          <button
            type="button"
            onClick={() => resetForm('login')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: mode === 'login' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Patient Login
          </button>
        </div>
      )}

      {/* Feedback Alerts */}
      {errorMsg && (
        <div className="animate-fade-in" style={{
          backgroundColor: 'var(--danger-light)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          color: 'var(--danger)',
          padding: '11px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="animate-fade-in" style={{
          backgroundColor: 'var(--success-light)',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          color: 'var(--success)',
          padding: '11px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Simulated OTP Notification Banner (for effortless user verification) */}
      {step === 'otp' && simulatedOtpDisplay && (
        <div className="animate-slide-down" style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>
              Simulated SMS/Email Gateway:
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#1e40af', letterSpacing: '3px' }}>
              {simulatedOtpDisplay}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOtpCode(simulatedOtpDisplay)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Auto-fill OTP
          </button>
        </div>
      )}

      {/* STEP 1: Registration Form */}
      {step === 'credentials' && mode === 'register' && (
        <form onSubmit={handleRegisterSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mobile Phone Number</label>
            <div style={{ position: 'relative' }}>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <Phone size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                placeholder="e.g. rahul@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Create secure password"
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
            {loading ? 'Sending OTP Code...' : 'Register & Send OTP Verification'}
          </button>
        </form>
      )}

      {/* STEP 1: Login Form */}
      {step === 'credentials' && mode === 'login' && (
        <form onSubmit={handleLoginSubmit}>
          <div className="form-group">
            <label className="form-label">Phone Number or Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter registered mobile or email"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
              <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
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
            {loading ? 'Verifying Password...' : 'Verify Password & Request OTP'}
          </button>
        </form>
      )}

      {/* STEP 2: OTP Verification Form (for both Registration and Login) */}
      {step === 'otp' && (
        <form onSubmit={mode === 'register' ? handleVerifyRegistrationOtp : handleVerifyLoginOtp}>
          <div style={{
            fontSize: '0.84rem',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            Enter the 6-digit security OTP code sent to verify your identity.
          </div>

          <div className="form-group">
            <label className="form-label" style={{ justifyContent: 'center' }}>
              6-Digit OTP Code
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter 6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                maxLength={6}
                required
                style={{
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.3rem',
                  letterSpacing: '4px',
                  fontWeight: 700
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || otpCode.length < 6}
            style={{ width: '100%', padding: '12px', marginTop: '8px' }}
          >
            {loading ? 'Verifying OTP Code...' : 'Verify OTP & Enter Emergency Console'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => setStep('credentials')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Back to credentials
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
