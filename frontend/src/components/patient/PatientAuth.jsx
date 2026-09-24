import React, { useState } from 'react';
import { User, Phone, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, KeyRound, UserPlus } from 'lucide-react';
import { requestPatientLoginOtp, verifyOpdOtp, sendOpdOtp, registerOpdPatient, logOpdInteraction } from '../../services/api';

export default function PatientAuth({ onAuthSuccess }) {
  // 'login' | 'register'
  const [authMode, setAuthMode] = useState('login');
  const [sessionId] = useState(() => 'ses_auth_' + Math.random().toString(36).substring(2, 10));

  // --- Login State ---
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState('');
  const [loginOtpHint, setLoginOtpHint] = useState(null);
  const [loginPatientInfo, setLoginPatientInfo] = useState(null);

  // --- Registration State ---
  const [regMobile, setRegMobile] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [regOtpCode, setRegOtpCode] = useState('');
  const [regOtpVerified, setRegOtpVerified] = useState(false);
  const [regOtpHint, setRegOtpHint] = useState(null);

  const [regForm, setRegForm] = useState({
    name: '',
    gender: 'Male',
    age: '',
    guardianName: '',
    state: 'Delhi',
    district: 'South Delhi',
    pincode: '110029'
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // ==========================================
  // EXISTING PATIENT LOGIN HANDLERS
  // ==========================================
  const handleRequestLoginOtp = async (e) => {
    e.preventDefault();
    const clean = loginIdentifier.trim();
    if (!clean) {
      setErrorMsg('Please enter your Unique Patient ID (UHID) or registered mobile number.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      logOpdInteraction({
        sessionId,
        stepName: 'PATIENT_LOGIN_REQUEST',
        actionData: { identifier: clean }
      });

      const res = await requestPatientLoginOtp({ sessionId, identifier: clean });
      if (res.success) {
        setLoginOtpSent(true);
        setLoginPatientInfo(res);
        setLoginOtpHint(res.otpCode);
      } else {
        setErrorMsg(res.error || 'Patient ID not found. If you are a new patient, please register.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error requesting login OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    if (!loginOtpCode || loginOtpCode.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP code.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await verifyOpdOtp({ sessionId, otpCode: loginOtpCode.trim() });
      if (res.success && res.patient) {
        logOpdInteraction({
          sessionId,
          stepName: 'PATIENT_LOGGED_IN_SUCCESS',
          actionData: { uhid: res.patient.id, name: res.patient.name },
          mobile: res.patient.mobile,
          uhid: res.patient.id
        });
        onAuthSuccess(res.patient);
      } else {
        setErrorMsg(res.error || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // NEW PATIENT REGISTRATION HANDLERS
  // ==========================================
  const handleSendRegOtp = async (e) => {
    e.preventDefault();
    if (!regMobile || regMobile.trim().length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await sendOpdOtp({ sessionId, mobile: regMobile.trim() });
      if (res.success) {
        setRegOtpSent(true);
        setRegOtpHint(res.otpCode);
      } else {
        setErrorMsg(res.error || 'Failed to send OTP.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error sending registration OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRegOtp = async (e) => {
    e.preventDefault();
    if (!regOtpCode || regOtpCode.trim().length !== 6) {
      setErrorMsg('Please enter 6-digit OTP code.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await verifyOpdOtp({ sessionId, otpCode: regOtpCode.trim() });
      if (res.success) {
        if (res.hasExistingProfile && res.patient) {
          // If already registered, log them straight in
          onAuthSuccess(res.patient);
        } else {
          setRegOtpVerified(true);
        }
      } else {
        setErrorMsg(res.error || 'Invalid OTP code.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying registration OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    if (!regForm.name.trim()) {
      setErrorMsg('Patient Name is required.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await registerOpdPatient({
        sessionId,
        patientData: {
          ...regForm,
          mobile: regMobile.trim()
        }
      });

      if (res.success && res.patient) {
        onAuthSuccess(res.patient);
      } else {
        setErrorMsg(res.error || 'Failed to generate Unique Patient ID.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error completing registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scenic-auth-wrapper" style={{ backgroundImage: 'url(/images/hospital_hero_lobby.jpg)', margin: '10px auto' }}>
      <div className="scenic-auth-backdrop"></div>
      <div className="scenic-auth-card" style={{ maxWidth: authMode === 'register' && regOtpVerified ? '680px' : '480px' }}>
        {/* Top Emblem Logo (Matching Screenshot 2) */}
        <div className="scenic-auth-emblem" style={{ backgroundColor: '#e0f2fe', border: '2px solid #bae6fd' }}>
          <img src="/logos/smartcare.svg" alt="Patient" style={{ width: '32px', height: '32px' }} />
        </div>

        <h2 className="scenic-auth-title" style={{ color: '#0284c7' }}>
          {authMode === 'login' ? 'Patient Login' : 'Patient Registration'}
        </h2>
        <p className="scenic-auth-subtitle">
          {authMode === 'login' ? 'Access your digital ORS tokens, appointments & prescriptions' : 'Register for an instant Unique Health ID (UHID)'}
        </p>

        {/* Mode Switcher */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-surface-soft)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setErrorMsg(null);
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: authMode === 'login' ? '#ffffff' : 'transparent',
              color: authMode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: authMode === 'login' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <KeyRound size={15} />
            <span>Existing Patient Login</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setErrorMsg(null);
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: authMode === 'register' ? '#ffffff' : 'transparent',
              color: authMode === 'register' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: authMode === 'register' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <UserPlus size={15} />
            <span>New Registration</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            color: '#b91c1c',
            fontSize: '0.82rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODE 1: EXISTING PATIENT LOGIN */}
        {/* ========================================================= */}
        {authMode === 'login' && (
          <div>
            {!loginOtpSent ? (
              <form onSubmit={handleRequestLoginOtp}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    Enter Unique Patient ID (UHID) or Registered Mobile
                  </label>
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="e.g. UHID-2026-30947 or 9811099234"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--border-light)',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                    Registered patients can log in directly with their system-assigned ID.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="scenic-pill-btn"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Finding Patient ID...' : 'Send Verification OTP →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyLoginOtp}>
                <div style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '0.8rem',
                  color: '#166534'
                }}>
                  Patient Found: <strong>{loginPatientInfo?.patientName}</strong> (UHID: {loginPatientInfo?.uhid})
                  <br />
                  OTP sent to <strong>{loginPatientInfo?.maskedMobile}</strong>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    Enter 6-digit OTP Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={loginOtpCode}
                    onChange={(e) => setLoginOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 123456"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--border-light)',
                      fontSize: '1.05rem',
                      letterSpacing: '4px',
                      textAlign: 'center',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  {loginOtpHint && (
                    <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#0284c7' }}>
                      Auto-generated Demo OTP: <strong>{loginOtpHint}</strong>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="scenic-pill-btn"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Verifying OTP...' : 'Verify OTP & Access OPD Portal'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* MODE 2: NEW PATIENT REGISTRATION */}
        {/* ========================================================= */}
        {authMode === 'register' && (
          <div>
            {!regOtpVerified ? (
              <form onSubmit={!regOtpSent ? handleSendRegOtp : handleVerifyRegOtp}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    Patient 10-digit Mobile Number
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    disabled={regOtpSent}
                    value={regMobile}
                    onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 9876543210"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--border-light)',
                      fontSize: '0.92rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {regOtpSent && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                      Enter 6-digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={regOtpCode}
                      onChange={(e) => setRegOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 123456"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--border-light)',
                        fontSize: '1rem',
                        letterSpacing: '4px',
                        textAlign: 'center',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {regOtpHint && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#0284c7' }}>
                        Auto-generated Demo OTP: <strong>{regOtpHint}</strong>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="scenic-pill-btn"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {!regOtpSent ? 'Send Verification OTP' : 'Verify Mobile & Continue'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleCompleteRegistration}>
                <div style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '0.8rem',
                  color: '#166534'
                }}>
                  Mobile <strong>{regMobile}</strong> verified! Enter demographics for guaranteed unique ID generation.
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    placeholder="As per Government Photo ID"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                      Gender *
                    </label>
                    <select
                      value={regForm.gender}
                      onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.86rem',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                      Age (Years) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      required
                      value={regForm.age}
                      onChange={(e) => setRegForm({ ...regForm, age: e.target.value })}
                      placeholder="e.g. 42"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    State / UT
                  </label>
                  <input
                    type="text"
                    value={regForm.state}
                    onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="scenic-pill-btn"
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Generating Unique ID...' : 'Generate Unique ID & Access Portal'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
