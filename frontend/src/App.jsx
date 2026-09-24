import React, { useState, useEffect } from 'react';
import { Building2, Shield, HeartPulse, Stethoscope, RefreshCw, CheckCircle2, AlertCircle, Database, AlertOctagon, UserCheck, ShieldAlert, Truck, Users } from 'lucide-react';
import { fetchHospitals } from './services/api';
import HospitalSelector from './components/HospitalSelector';
import AdminAuthModal from './components/AdminAuthModal';
import HospitalDashboard from './components/HospitalDashboard';
import EmergencyAuth from './components/EmergencyAuth';
import EmergencySOSForm from './components/EmergencySOSForm';
import EmergencyLiveTracking from './components/EmergencyLiveTracking';
import AmbulanceModule from './components/ambulance/AmbulanceModule';
import PatientModule from './components/patient/PatientModule';
import DoctorOpdPortal from './components/doctor/DoctorOpdPortal';

export default function App() {
  // Navigation Module Switcher: 'hospital_admin' | 'emergency_module' | 'ambulance_module' | 'patient_opd' | 'doctor_opd'
  const [activeModule, setActiveModule] = useState('patient_opd');

  // --- Hospital Admin State ---
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [authenticatedAdmin, setAuthenticatedAdmin] = useState(null);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [hospitalError, setHospitalError] = useState(null);

  // --- Emergency Module State ---
  const [emergencyUser, setEmergencyUser] = useState(() => {
    try {
      const cached = localStorage.getItem('smartcare_emergency_user');
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });
  const [activeEmergencyRequest, setActiveEmergencyRequest] = useState(null);

  const loadHospitals = async (keepSelectionId = null) => {
    try {
      setLoadingHospitals(true);
      const res = await fetchHospitals();
      if (res.success) {
        setHospitals(res.hospitals);
        if (keepSelectionId) {
          const found = res.hospitals.find((h) => h.id === keepSelectionId);
          if (found) setSelectedHospital(found);
        }
      }
    } catch (err) {
      setHospitalError(err.message || 'Failed to connect to hospital service.');
    } finally {
      setLoadingHospitals(false);
    }
  };

  useEffect(() => {
    loadHospitals();
  }, []);

  const handleSelectHospital = (hospital) => {
    setSelectedHospital(hospital);
    if (authenticatedAdmin && authenticatedAdmin.hospitalId !== hospital.id) {
      setAuthenticatedAdmin(null);
    }
  };

  const handleAuthSuccess = (adminData) => {
    setAuthenticatedAdmin({
      ...adminData,
      hospitalId: selectedHospital.id
    });
    loadHospitals(selectedHospital.id);
  };

  const handleAdminLogout = () => {
    setAuthenticatedAdmin(null);
    loadHospitals(selectedHospital?.id);
  };

  // Emergency User Auth handlers
  const handleEmergencyAuthSuccess = (user) => {
    setEmergencyUser(user);
    try {
      localStorage.setItem('smartcare_emergency_user', JSON.stringify(user));
    } catch (_) {}
  };

  const handleEmergencyUserLogout = () => {
    setEmergencyUser(null);
    setActiveEmergencyRequest(null);
    try {
      localStorage.removeItem('smartcare_emergency_user');
    } catch (_) {}
  };

  // When emergency ride is completed, remove all details and return to login or register page
  const handleEmergencyRideCompleted = () => {
    setActiveEmergencyRequest(null);
    setEmergencyUser(null);
    try {
      localStorage.removeItem('smartcare_emergency_user');
      localStorage.removeItem('smartcare_emergency_request');
    } catch (_) {}
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Main Navbar */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1.5px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          {/* Logo & Platform Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img 
              src="/logos/smartcare.svg" 
              alt="SmartCare Platform" 
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                objectFit: 'contain',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                flexShrink: 0
              }} 
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  SmartCare
                </span>
                <span className="badge badge-blue">Healthcare Coordination Platform</span>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Decentralized Multi-Hospital Databases & Real-Time Emergency Coordination
              </p>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setActiveModule('hospital_admin')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeModule === 'hospital_admin' ? '#ffffff' : 'transparent',
                color: activeModule === 'hospital_admin' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeModule === 'hospital_admin' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Building2 size={16} />
              <span>Hospital Admin Module</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('emergency_module')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeModule === 'emergency_module' ? '#ffffff' : 'transparent',
                color: activeModule === 'emergency_module' ? '#dc2626' : 'var(--text-muted)',
                boxShadow: activeModule === 'emergency_module' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <AlertOctagon size={16} style={{ color: activeModule === 'emergency_module' ? '#dc2626' : 'inherit' }} />
              <span>Emergency Module (1-Tap SOS)</span>
              {activeEmergencyRequest && (
                <span className="status-indicator active" style={{ backgroundColor: '#dc2626' }} />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('ambulance_module')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeModule === 'ambulance_module' ? '#ffffff' : 'transparent',
                color: activeModule === 'ambulance_module' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeModule === 'ambulance_module' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Truck size={16} style={{ color: activeModule === 'ambulance_module' ? 'var(--primary)' : 'inherit' }} />
              <span>Ambulance Driver Module</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('patient_opd')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeModule === 'patient_opd' ? '#ffffff' : 'transparent',
                color: activeModule === 'patient_opd' ? '#0284c7' : 'var(--text-muted)',
                boxShadow: activeModule === 'patient_opd' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={16} style={{ color: activeModule === 'patient_opd' ? '#0284c7' : 'inherit' }} />
              <span>Patient OPD (ORS)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('doctor_opd')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeModule === 'doctor_opd' ? '#ffffff' : 'transparent',
                color: activeModule === 'doctor_opd' ? '#16a34a' : 'var(--text-muted)',
                boxShadow: activeModule === 'doctor_opd' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Stethoscope size={16} style={{ color: activeModule === 'doctor_opd' ? '#16a34a' : 'inherit' }} />
              <span>Doctor OPD Portal</span>
            </button>

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px 20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* ========================================================= */}
        {/* MODULE 1: HOSPITAL ADMIN MODULE */}
        {/* ========================================================= */}
        {activeModule === 'hospital_admin' && (
          <>
            {loadingHospitals && hospitals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Loading Hospital Databases...
                </h3>
              </div>
            ) : hospitalError ? (
              <div style={{
                maxWidth: '520px',
                margin: '60px auto',
                padding: '24px',
                backgroundColor: 'var(--danger-light)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: 'var(--radius-lg)',
                textAlign: 'center'
              }}>
                <h3 style={{ color: 'var(--danger)', fontWeight: 800, marginBottom: '8px' }}>Connection Issue</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '16px' }}>{hospitalError}</p>
                <button onClick={() => loadHospitals()} className="btn btn-primary btn-sm">Retry Connection</button>
              </div>
            ) : !selectedHospital ? (
              /* Step 1: Hospital Dropdown Selection Portal */
              <div className="animate-fade-in" style={{ maxWidth: '780px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    backgroundColor: 'var(--primary-light)',
                    borderRadius: 'var(--radius-full)',
                    color: 'var(--primary)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    marginBottom: '14px'
                  }}>
                    <Shield size={14} />
                    <span>Hospital Administration Portal</span>
                  </div>
                  <h1 style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    letterSpacing: '-0.02em',
                    marginBottom: '10px'
                  }}>
                    Select Your Hospital to Manage
                  </h1>
                  <p style={{ fontSize: '0.94rem', color: 'var(--text-muted)', maxWidth: '620px', margin: '0 auto' }}>
                    Select your hospital from the dropdown below to complete your one-time admin registration or log in directly to your dedicated hospital database.
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <HospitalSelector
                    hospitals={hospitals}
                    selectedHospital={selectedHospital}
                    onSelectHospital={handleSelectHospital}
                    loading={loadingHospitals}
                  />
                </div>
              </div>
            ) : !authenticatedAdmin ? (
              /* Step 2: 1-Time Registration / Login Window for Selected Hospital */
              <AdminAuthModal
                hospital={selectedHospital}
                onAuthSuccess={handleAuthSuccess}
                onBackToSelection={() => setSelectedHospital(null)}
              />
            ) : (
              /* Step 3: Hospital Admin Dashboard */
              <HospitalDashboard
                hospitalId={selectedHospital.id}
                admin={authenticatedAdmin}
                onLogout={handleAdminLogout}
              />
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* MODULE 2: EMERGENCY PATIENT MODULE */}
        {/* ========================================================= */}
        {activeModule === 'emergency_module' && (
          <>
            {!emergencyUser ? (
              /* Step 1: Emergency User Registration & Login with OTP */
              <EmergencyAuth onAuthSuccess={handleEmergencyAuthSuccess} />
            ) : !activeEmergencyRequest ? (
              /* Step 2: Emergency SOS Submission with Live GPS & 4 Nearest Hospitals */
              <EmergencySOSForm
                user={emergencyUser}
                onEmergencyTriggered={(request) => setActiveEmergencyRequest(request)}
                onLogout={handleEmergencyUserLogout}
              />
            ) : (
              /* Step 3: Sequential 2-Minute Routing Live Tracking & Acceptance Monitor */
              <EmergencyLiveTracking
                initialRequest={activeEmergencyRequest}
                onNewEmergency={() => setActiveEmergencyRequest(null)}
                onRideCompleted={handleEmergencyRideCompleted}
              />
            )}
          </>
        )}

        {/* ========================================================= */}
        {/* MODULE 3: AMBULANCE DRIVER MODULE (RAPIDO EDITION) */}
        {/* ========================================================= */}
        {activeModule === 'ambulance_module' && (
          <AmbulanceModule />
        )}

        {/* ========================================================= */}
        {/* MODULE 4: PATIENT OPD MODULE (ORS MODEL & VIRTUAL QUEUE) */}
        {/* ========================================================= */}
        <div style={{ display: activeModule === 'patient_opd' ? 'block' : 'none' }}>
          <PatientModule />
        </div>

        {/* ========================================================= */}
        {/* MODULE 5: DOCTOR OPD PORTAL (CHAMBER CONSOLE) */}
        {/* ========================================================= */}
        <div style={{ display: activeModule === 'doctor_opd' ? 'block' : 'none' }}>
          <DoctorOpdPortal />
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid var(--border-light)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-dim)'
      }}>
        <span>SmartCare Healthcare Platform · Dedicated Multi-Hospital Databases · Real-Time 2-Minute Sequential Emergency Dispatch</span>
      </footer>
    </div>
  );
}
