import React, { useState, useEffect } from 'react';
import { Truck, ShieldCheck, Phone, Mail, User, Lock, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, Hash, Building2 } from 'lucide-react';
import { fetchAmbulanceHospitals, registerAmbulanceDriver, verifyAmbulanceDriverOtp, loginAmbulanceDriver } from '../../services/api';

export default function AmbulanceAuth({ onAuthSuccess }) {
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regDriverId, setRegDriverId] = useState('');
  const [regVehiclePlate, setRegVehiclePlate] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // OTP Verification Modal
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [pendingDriverId, setPendingDriverId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  useEffect(() => {
    async function loadHospitals() {
      try {
        setLoadingHospitals(true);
        const res = await fetchAmbulanceHospitals();
        if (res.success && res.hospitals.length > 0) {
          setHospitals(res.hospitals);
          setSelectedHospitalId(res.hospitals[0].id);
        }
      } catch (err) {
        setLoginError('Failed to load hospitals list.');
      } finally {
        setLoadingHospitals(false);
      }
    }
    loadHospitals();
  }, []);

  const handleHospitalChange = (e) => {
    setSelectedHospitalId(e.target.value);
  };

  // Login Submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!selectedHospitalId || !loginIdentifier.trim() || !loginPassword) {
      setLoginError('Base Hospital, Driver ID / Phone Number, and Password are all required.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await loginAmbulanceDriver({
        hospitalId: selectedHospitalId,
        identifier: loginIdentifier.trim(),
        password: loginPassword
      });

      if (res.success) {
        onAuthSuccess(res.driver, res.activeRide);
      } else if (res.needsVerification) {
        setPendingDriverId(res.driverId);
        setOtpModalOpen(true);
      } else {
        setLoginError(res.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err) {
      setLoginError(err.message || 'Server communication error.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Register Submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!selectedHospitalId || !regName.trim() || !regPhone.trim() || !regEmail.trim() || !regDriverId.trim() || !regVehiclePlate.trim() || !regPassword) {
      setRegError('All registration fields including Unique Driver ID and Vehicle Plate are mandatory.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await registerAmbulanceDriver({
        hospitalId: selectedHospitalId,
        name: regName.trim(),
        phone: regPhone.trim(),
        email: regEmail.trim(),
        driverId: regDriverId.trim().toUpperCase(),
        vehiclePlate: regVehiclePlate.trim().toUpperCase(),
        password: regPassword
      });

      if (res.success) {
        setPendingDriverId(res.driverId);
        setOtpModalOpen(true);
      } else {
        setRegError(res.error || 'Registration failed.');
      }
    } catch (err) {
      setRegError(err.message || 'Server communication error.');
    } finally {
      setRegLoading(false);
    }
  };

  // OTP Verification Submit
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setOtpError('');
    if (!otpCode || otpCode.trim().length < 4) {
      setOtpError('Please enter a valid 6-digit verification OTP.');
      return;
    }

    setOtpLoading(true);
    try {
      const res = await verifyAmbulanceDriverOtp({
        hospitalId: selectedHospitalId,
        driverId: pendingDriverId,
        otpCode: otpCode.trim()
      });

      if (res.success) {
        setOtpModalOpen(false);
        onAuthSuccess(res.driver, null);
      } else {
        setOtpError(res.error || 'Invalid or expired OTP code. Please try again.');
      }
    } catch (err) {
      setOtpError(err.message || 'OTP verification error.');
    } finally {
      setOtpLoading(false);
    }
  };

  const currentHospital = hospitals.find(h => h.id === selectedHospitalId);

  return (
    <div style={{
      maxWidth: '540px',
      margin: '0 auto',
      backgroundColor: '#ffffff',
      borderRadius: 'var(--radius-xl)',
      border: '1.5px solid var(--border-light)',
      boxShadow: 'var(--shadow-md)',
      overflow: 'hidden'
    }}>
      {/* SmartCare Clean Medical Header */}
      <div style={{
        padding: '24px 28px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <img 
          src="/logos/ambulance.svg" 
          alt="Ambulance Pilot Portal" 
          style={{
            width: '50px',
            height: '50px',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            flexShrink: 0
          }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Ambulance Pilot Portal
            </h2>
            <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>
              Hospital Fleet
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
            Authorized Ambulance Driver & First Responder Command Station
          </p>
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {/* Visual Fleet Command Banner */}
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
          <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            GPS Live Telemetry & 10-Driver Hospital Fleet
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
            Authorized Ambulance Driver Command Cockpit
          </div>
        </div>

        {/* Base Hospital Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            <Building2 size={14} style={{ color: 'var(--primary)' }} /> Select Your Base Hospital
          </label>
          {loadingHospitals ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Loading hospital fleet registry...</div>
          ) : (
            <select
              value={selectedHospitalId}
              onChange={handleHospitalChange}
              style={{
                width: '100%',
                padding: '11px 14px',
                backgroundColor: 'var(--bg-surface-soft)',
                color: 'var(--text-main)',
                border: '1.5px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.92rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} — {h.address.split(',')[0]}
                </option>
              ))}
            </select>
          )}
          {currentHospital && (
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--text-dim)',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-surface-soft)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <img 
                src={`/logos/${currentHospital.id}.svg`} 
                alt="" 
                style={{ width: '22px', height: '22px', objectFit: 'contain' }} 
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span>Station Base: <strong>{currentHospital.name}</strong> — {currentHospital.address}</span>
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          backgroundColor: 'var(--bg-surface-soft)',
          borderRadius: 'var(--radius-md)',
          padding: '4px',
          marginBottom: '20px',
          border: '1px solid var(--border-light)'
        }}>
          <button
            type="button"
            onClick={() => setTab('login')}
            style={{
              padding: '9px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: tab === 'login' ? '#ffffff' : 'transparent',
              color: tab === 'login' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              boxShadow: tab === 'login' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Driver Login
          </button>
          <button
            type="button"
            onClick={() => setTab('register')}
            style={{
              padding: '9px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: tab === 'register' ? '#ffffff' : 'transparent',
              color: tab === 'register' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              boxShadow: tab === 'register' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Register New Driver
          </button>
        </div>

        {/* LOGIN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit}>
            {loginError && (
              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{loginError}</span>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Unique Driver ID or Phone Number
              </label>
              <div style={{ position: 'relative' }}>
                <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. DRV-APOLLO-01 or 987101010"
                  style={{
                    width: '100%',
                    padding: '11px 14px 11px 38px',
                    backgroundColor: 'var(--bg-surface-soft)',
                    border: '1.5px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Driver Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your driver password"
                  style={{
                    width: '100%',
                    padding: '11px 14px 11px 38px',
                    backgroundColor: 'var(--bg-surface-soft)',
                    border: '1.5px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '0.95rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {loginLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Driver Cockpit</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* REGISTER FORM */}
        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit}>
            {regError && (
              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{regError}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                  PILOT FULL NAME
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 32px',
                      backgroundColor: 'var(--bg-surface-soft)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                  MOBILE PHONE
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="e.g. 9871010101"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 32px',
                      backgroundColor: 'var(--bg-surface-soft)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                OFFICIAL EMAIL ADDRESS
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="e.g. driver@apollo.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 32px',
                    backgroundColor: 'var(--bg-surface-soft)',
                    border: '1.5px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                  UNIQUE DRIVER ID
                </label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="text"
                    value={regDriverId}
                    onChange={(e) => setRegDriverId(e.target.value.toUpperCase())}
                    placeholder="e.g. DRV-APOLLO-11"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 32px',
                      backgroundColor: 'var(--bg-surface-soft)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      outline: 'none',
                      fontFamily: 'var(--font-mono)'
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                  VEHICLE PLATE NO.
                </label>
                <div style={{ position: 'relative' }}>
                  <Truck size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="text"
                    value={regVehiclePlate}
                    onChange={(e) => setRegVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="e.g. DL-01-EA-1011"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 32px',
                      backgroundColor: 'var(--bg-surface-soft)',
                      border: '1.5px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      outline: 'none',
                      fontFamily: 'var(--font-mono)'
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px' }}>
                ACCOUNT PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Set account password"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 32px',
                    backgroundColor: 'var(--bg-surface-soft)',
                    border: '1.5px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={regLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '0.95rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {regLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Processing Registration...</span>
                </>
              ) : (
                <>
                  <span>Submit & Verify via OTP</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* OTP VERIFICATION MODAL */}
      {otpModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '400px',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1.5px solid var(--border-light)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px',
            boxShadow: 'var(--shadow-xl)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto'
            }}>
              <ShieldCheck size={28} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>
              Security OTP Verification
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Enter the 6-digit authentication OTP sent to the registered contact for Driver <strong>{pendingDriverId}</strong>.
            </p>

            {otpError && (
              <div style={{
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                marginBottom: '14px'
              }}>
                {otpError}
              </div>
            )}

            <form onSubmit={handleOtpSubmit}>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="000000"
                style={{
                  width: '100%',
                  padding: '12px',
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.25em',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-main)',
                  border: '1.5px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '18px',
                  outline: 'none'
                }}
                required
                autoFocus
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setOtpModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ padding: '11px', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="btn btn-primary"
                  style={{ padding: '11px', fontWeight: 800 }}
                >
                  {otpLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
