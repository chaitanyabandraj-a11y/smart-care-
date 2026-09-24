import React, { useState, useEffect } from 'react';
import { Building2, Shield, HeartPulse, Stethoscope, RefreshCw, CheckCircle2, AlertCircle, Database, AlertOctagon, UserCheck, ShieldAlert, Truck, Users, ChevronRight, ArrowRight, Sparkles, Activity, MapPin } from 'lucide-react';
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
  const [activeModule, setActiveModule] = useState('hospital_admin');

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

  // Handle role selection with automatic smooth scroll to details
  const handleSelectRole = (moduleId) => {
    setActiveModule(moduleId);
    setTimeout(() => {
      const el = document.getElementById('active-portal-container');
      if (el) {
        const yOffset = -70;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }, 120);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fcfaf6' }}>
      
      {/* ========================================================= */}
      {/* KISHANFLOW-STYLE TOP NAVIGATION BAR */}
      {/* ========================================================= */}
      <header className="kishan-nav-bar">
        {/* Left: Logo & Platform Name */}
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <img 
            src="/logos/smartcare.svg" 
            alt="SmartCare Platform" 
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              objectFit: 'contain',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }} 
          />
          <span style={{ fontSize: '1.38rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            Smart<span style={{ color: '#0284c7' }}>Care</span>
          </span>
        </div>

        {/* Center: Navigation Links (Matching KishanFlow) */}
        <nav className="kishan-nav-links">
          <button 
            type="button" 
            className="kishan-nav-link active"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            Home
          </button>
          <button 
            type="button" 
            className="kishan-nav-link"
            onClick={() => {
              const el = document.getElementById('about-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            About
          </button>
          <button 
            type="button" 
            className="kishan-nav-link"
            onClick={() => {
              const el = document.getElementById('features-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Features
          </button>
          <button 
            type="button" 
            className="kishan-nav-link"
            onClick={() => {
              const el = document.getElementById('contact-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Contact
          </button>
        </nav>

        {/* Right: Slogan (Matching KishanFlow) */}
        <div className="kishan-nav-slogan" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Better Hospitals</span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span>Faster Response</span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span>A Stronger Tomorrow</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '24px 24px 48px 24px', maxWidth: '1260px', margin: '0 auto', width: '100%' }}>
        
        {/* ========================================================= */}
        {/* KISHANFLOW-STYLE HERO SECTION (WITH 3D FLOATING ISLAND) */}
        {/* ========================================================= */}
        <section id="about-section" className="kishan-hero-section">
          {/* Floating Subtle Leaves */}
          <div className="floating-leaf" style={{ top: '15%', left: '46%', fontSize: '1.2rem' }}>🍃</div>
          <div className="floating-leaf" style={{ bottom: '25%', left: '42%', animationDelay: '2s', fontSize: '1rem' }}>🍃</div>
          <div className="floating-leaf" style={{ top: '8%', right: '8%', animationDelay: '3.5s', fontSize: '1.1rem' }}>🍃</div>

          {/* Left Column: Brand, Tagline & CTAs */}
          <div>
            {/* Round Emblem Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              border: '2px solid #e2e8f0',
              boxShadow: '0 8px 24px rgba(2, 132, 199, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <img src="/logos/smartcare.svg" alt="SmartCare Emblem" style={{ width: '38px', height: '38px' }} />
            </div>

            {/* Brand Title */}
            <h1 style={{
              fontSize: '3rem',
              fontWeight: 900,
              color: 'var(--text-main)',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              marginBottom: '12px'
            }}>
              Smart <span style={{ color: '#0284c7' }}>Care</span>
            </h1>

            {/* Tagline with horizontal decorative lines */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '18px'
            }}>
              <div style={{ height: '1.5px', width: '36px', backgroundColor: '#d97706' }} />
              <span style={{ fontSize: '0.98rem', fontWeight: 700, color: '#d97706', letterSpacing: '0.04em' }}>
                From Emergency to Recovery
              </span>
              <div style={{ height: '1.5px', width: '36px', backgroundColor: '#d97706' }} />
            </div>

            {/* Subtitle Description */}
            <p style={{
              fontSize: '1.02rem',
              color: '#475569',
              lineHeight: 1.6,
              maxWidth: '520px',
              marginBottom: '28px'
            }}>
              Connecting hospitals, doctors, patients, and ambulance pilots for a smarter and stronger healthcare ecosystem.
            </p>

            {/* CTA Pill Buttons (Matching KishanFlow) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('portals-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  backgroundColor: '#064e3b',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  padding: '12px 28px',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(6, 78, 59, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#047857'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#064e3b'; e.currentTarget.style.transform = 'none'; }}
              >
                Explore Portals
              </button>

              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('features-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  padding: '12px 28px',
                  borderRadius: '9999px',
                  border: '1.5px solid #e2e8f0',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.transform = 'none'; }}
              >
                Learn More
              </button>
            </div>
          </div>

          {/* Right Column: 3D Floating Hospital Island & Handwritten Caveat Script */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.22)',
              border: '2.5px solid rgba(255, 255, 255, 0.85)',
              maxWidth: '460px',
              width: '100%',
              backgroundColor: '#ffffff'
            }}>
              <img
                src="/images/floating_hospital_island.jpg"
                alt="SmartCare 3D Hospital Island"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>

            {/* Handwritten Script Annotation in Caveat Font */}
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '-8px',
              transform: 'rotate(4deg)',
              pointerEvents: 'none'
            }}>
              <div style={{
                fontFamily: 'var(--font-script)',
                fontSize: '1.65rem',
                fontWeight: 700,
                color: '#b45309',
                lineHeight: 1.15,
                textAlign: 'right',
                textShadow: '0 2px 8px rgba(255, 255, 255, 0.9)'
              }}>
                Life-Saving<br />Care Starts with<br />Connection
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* KISHANFLOW-STYLE ROLE CARDS (WITH CHARACTER AVATARS) */}
        {/* ========================================================= */}
        <section id="portals-section" style={{ marginBottom: '38px' }} aria-label="Portal Selection">
          {/* Handwritten prompt matching Screenshot */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{
              fontFamily: 'var(--font-script)',
              fontSize: '1.35rem',
              fontWeight: 700,
              color: '#d97706',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              ✨ Click any role card to switch instant command module &amp; scroll down to fill details ↓
            </span>
          </div>

          <div className="kishan-role-grid">
            
            {/* Card 1: Doctor (Green Theme) */}
            <div
              className={`kishan-role-card theme-green ${activeModule === 'doctor_opd' ? 'active' : ''}`}
              onClick={() => handleSelectRole('doctor_opd')}
            >
              <div className="role-avatar-wrapper">
                <img src="/images/avatar_doctor.jpg" alt="Doctor" className="role-avatar-img" />
              </div>
              <div className="role-prefix">Login as</div>
              <h3 className="role-title">Doctor OPD Portal</h3>
              <p className="role-desc">
                Call patient tokens, issue digital e-prescriptions, view patient diagnostics &amp; vitals history.
              </p>
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: activeModule === 'doctor_opd' ? '#059669' : '#64748b'
              }}>
                <span>{activeModule === 'doctor_opd' ? '● Active Module' : 'Open Portal'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Card 2: Patient (Blue Theme) */}
            <div
              className={`kishan-role-card theme-blue ${activeModule === 'patient_opd' ? 'active' : ''}`}
              onClick={() => handleSelectRole('patient_opd')}
            >
              <div className="role-avatar-wrapper">
                <img src="/images/avatar_patient.jpg" alt="Patient" className="role-avatar-img" />
              </div>
              <div className="role-prefix">Login as</div>
              <h3 className="role-title">Patient OPD Portal</h3>
              <p className="role-desc">
                Self-service QR token generation, department live waitlist queue &amp; digital prescription downloads.
              </p>
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: activeModule === 'patient_opd' ? '#0284c7' : '#64748b'
              }}>
                <span>{activeModule === 'patient_opd' ? '● Active Module' : 'Book OPD Token'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Card 3: Admin (Purple Theme) */}
            <div
              className={`kishan-role-card theme-purple ${activeModule === 'hospital_admin' ? 'active' : ''}`}
              onClick={() => handleSelectRole('hospital_admin')}
            >
              <div className="role-avatar-wrapper">
                <img src="/images/avatar_admin.jpg" alt="Admin" className="role-avatar-img" />
              </div>
              <div className="role-prefix">Login as</div>
              <h3 className="role-title">Hospital Admin Portal</h3>
              <p className="role-desc">
                Manage dedicated SQLite database, real-time ICU &amp; inpatient bed telemetry, on-duty doctors.
              </p>
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: activeModule === 'hospital_admin' ? '#7c3aed' : '#64748b'
              }}>
                <span>{activeModule === 'hospital_admin' ? '● Active Module' : 'Open Admin Portal'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Card 4: Ambulance Pilot (Orange Theme) */}
            <div
              className={`kishan-role-card theme-orange ${activeModule === 'ambulance_module' ? 'active' : ''}`}
              onClick={() => handleSelectRole('ambulance_module')}
            >
              <div className="role-avatar-wrapper">
                <img src="/images/avatar_ambulance.jpg" alt="Ambulance Pilot" className="role-avatar-img" />
              </div>
              <div className="role-prefix">Login as</div>
              <h3 className="role-title">Ambulance Pilot Cockpit</h3>
              <p className="role-desc">
                Turn-by-turn routing, live hospital telemetry transmission &amp; instant ER arrival handoff.
              </p>
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: activeModule === 'ambulance_module' ? '#ea580c' : '#64748b'
              }}>
                <span>{activeModule === 'ambulance_module' ? '● Active Module' : 'Launch Pilot Desk'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

            {/* Card 5: Emergency SOS (Red Theme) */}
            <div
              className={`kishan-role-card theme-red ${activeModule === 'emergency_module' ? 'active' : ''}`}
              onClick={() => handleSelectRole('emergency_module')}
            >
              <div className="role-avatar-wrapper">
                <img src="/images/avatar_emergency.jpg" alt="Emergency SOS" className="role-avatar-img" />
              </div>
              <div className="role-prefix">Login as</div>
              <h3 className="role-title">Emergency 1-Tap SOS</h3>
              <p className="role-desc">
                Instant GPS emergency alert with sequential 2-minute ring across nearest 4 super-specialty hospitals.
              </p>
              <div style={{
                marginTop: 'auto',
                paddingTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: activeModule === 'emergency_module' ? '#dc2626' : '#64748b'
              }}>
                <span>{activeModule === 'emergency_module' ? '● Active Module' : 'Trigger SOS Alert'}</span>
                <ArrowRight size={14} />
              </div>
            </div>

          </div>
        </section>

        {/* Benefit / Trust Strip */}
        <div id="features-section" className="benefit-row" style={{ marginBottom: '32px' }}>
          <div className="benefit-chip">
            <div className="benefit-circle" style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>🏥</div>
            <span>5 Independent Hospital DBs</span>
          </div>
          <div className="benefit-chip">
            <div className="benefit-circle" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>🚨</div>
            <span>2-Min Sequential SOS Dispatch</span>
          </div>
          <div className="benefit-chip">
            <div className="benefit-circle" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>🚑</div>
            <span>50 Live GPS ALS Fleet</span>
          </div>
          <div className="benefit-chip">
            <div className="benefit-circle" style={{ backgroundColor: '#ccfbf1', color: '#0d9488' }}>🎫</div>
            <span>Zero-Wait OPD QR Tokens</span>
          </div>
          <div className="benefit-chip">
            <div className="benefit-circle" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>🩺</div>
            <span>Doctor Consultation Desk</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ACTIVE PORTAL WORKSPACE CONTAINER (AUTOMATIC SCROLL TARGET) */}
        {/* ========================================================= */}
        <div id="active-portal-container" style={{ scrollMarginTop: '80px', paddingTop: '10px' }}>

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
              <div className="animate-fade-in" style={{ maxWidth: '980px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <h2 style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    letterSpacing: '-0.02em',
                    marginBottom: '8px'
                  }}>
                    Select Your Hospital to Manage
                  </h2>
                  <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', maxWidth: '620px', margin: '0 auto' }}>
                    Select your hospital from the dropdown or click on any registered institute card below to access your dedicated database.
                  </p>
                </div>

                <div style={{ marginBottom: '32px' }}>
                  <HospitalSelector
                    hospitals={hospitals}
                    selectedHospital={selectedHospital}
                    onSelectHospital={handleSelectHospital}
                    loading={loadingHospitals}
                  />
                </div>

                {/* Quick Select Interactive Hospital Campus Cards */}
                {hospitals.length > 0 && (
                  <div style={{ marginTop: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={18} style={{ color: 'var(--primary)' }} />
                        <span>Registered Multi-Hospital Institutes ({hospitals.length})</span>
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Click any hospital to enter management cockpit
                      </span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '16px'
                    }}>
                      {hospitals.map((h) => (
                        <div
                          key={h.id}
                          onClick={() => handleSelectHospital(h)}
                          className="card-glass"
                          style={{
                            padding: '18px 20px',
                            cursor: 'pointer',
                            borderRadius: 'var(--radius-lg)',
                            border: '1.5px solid var(--border-light)',
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '14px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-xl)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.borderColor = 'var(--border-light)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <img
                              src={`/logos/${h.id}.svg`}
                              alt={h.name}
                              style={{ width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0 }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div>
                              <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.25 }}>
                                {h.name}
                              </h4>
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                                {h.address.split(',')[0]}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                              🛏️ {h.stats?.availableBeds ?? 0} Beds Free
                            </span>
                            <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>
                              🩺 {h.stats?.availableDoctors ?? 0} Doctors
                            </span>
                            <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                              ⚡ {h.id}.db
                            </span>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '10px',
                            borderTop: '1px solid var(--border-light)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--primary)'
                          }}>
                            <span>Enter Database Console</span>
                            <ChevronRight size={15} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
        </div> {/* End active-portal-container */}
      </main>

      {/* ========================================================= */}
      {/* KISHANFLOW-STYLE FOOTER */}
      {/* ========================================================= */}
      <footer id="contact-section" className="kishan-footer">
        <div className="kishan-footer-content">
          {/* Col 1: Brand Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <img src="/logos/smartcare.svg" alt="SmartCare" style={{ width: '38px', height: '38px', borderRadius: '10px' }} />
              <span style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-main)' }}>
                Smart<span style={{ color: '#0284c7' }}>Care</span>
              </span>
            </div>
            <p style={{ fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6, maxWidth: '340px', marginBottom: '18px' }}>
              National Decentralized Healthcare Coordination Network. Uniting super-specialty hospitals with dedicated databases, 2-minute golden hour emergency dispatch & digital ORS outpatient queues.
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              fontSize: '0.8rem',
              fontWeight: 800
            }}>
              <span className="status-indicator red"></span>
              <span>24/7 National Emergency Hotline: 108 / 102</span>
            </div>
          </div>

          {/* Col 2: Portals */}
          <div className="kishan-footer-col">
            <h4>Quick Portals</h4>
            <ul>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>Hospital Admin Cockpit</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('doctor_opd')}>Doctor OPD Consultation</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('patient_opd')}>Patient ORS Booking</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('ambulance_module')}>Ambulance Pilot Desk</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('emergency_module')}>1-Tap Emergency SOS</a></li>
            </ul>
          </div>

          {/* Col 3: Connected Hospitals */}
          <div className="kishan-footer-col">
            <h4>Connected Hubs</h4>
            <ul>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>AIIMS New Delhi</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>Apollo Hospital</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>Fortis Escorts Heart Inst.</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>Max Super Speciality</a></li>
              <li><a href="#active-portal-container" onClick={() => handleSelectRole('hospital_admin')}>Lok Nayak Hospital (LNJP)</a></li>
            </ul>
          </div>

          {/* Col 4: Platform Standards */}
          <div className="kishan-footer-col">
            <h4>Coordination</h4>
            <ul>
              <li style={{ fontSize: '0.84rem', color: '#64748b' }}>⚡ 2-Min Sequential Ring Routing</li>
              <li style={{ fontSize: '0.84rem', color: '#64748b' }}>🔒 Independent SQLite Database Isolation</li>
              <li style={{ fontSize: '0.84rem', color: '#64748b' }}>🫀 Live Telemetry Bed & ICU Counters</li>
              <li style={{ fontSize: '0.84rem', color: '#64748b' }}>🎫 Smart QR Outpatient Wait Queues</li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="kishan-footer-bottom">
          <span>© 2026 SmartCare Healthcare Coordination Network. Decentralized Super-Specialty Medical Infrastructure.</span>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
