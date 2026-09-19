import React, { useState, useEffect } from 'react';
import { Calendar, Users, FileText, Activity, ShieldCheck, LogOut, User, QrCode, RefreshCw, Printer, CheckCircle2, Copy, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';
import PatientAuth from './PatientAuth';
import OrsBookingWizard from './OrsBookingWizard';
import PatientAppointmentsList from './PatientAppointmentsList';
import PatientVirtualQueue from './PatientVirtualQueue';
import OrsAppointmentSlip from './OrsAppointmentSlip';
import { fetchPatientPrescriptions, fetchPatientMedicalRecords, generatePatientQr } from '../../services/api';

export default function PatientModule() {
  const [activePatient, setActivePatient] = useState(() => {
    try {
      const cached = localStorage.getItem('smartcare_opd_patient');
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });

  // 'book' | 'appointments' | 'queue' | 'slip' | 'prescriptions' | 'records'
  const [activeTab, setActiveTab] = useState('book');
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Prescriptions state
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingRx, setLoadingRx] = useState(false);

  // Medical records & QR state
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedUhid, setCopiedUhid] = useState(false);
  const [cancellationNotice, setCancellationNotice] = useState(null);

  const handleAuthSuccess = (patient) => {
    setActivePatient(patient);
    try {
      localStorage.setItem('smartcare_opd_patient', JSON.stringify(patient));
    } catch (_) {}
  };

  const handleLogout = () => {
    setActivePatient(null);
    setSelectedAppointment(null);
    try {
      localStorage.removeItem('smartcare_opd_patient');
    } catch (_) {}
  };

  // Switch to Queue View
  const handleOpenQueue = (appointment) => {
    setSelectedAppointment(appointment);
    setActiveTab('queue');
  };

  // Switch to Slip View
  const handleOpenSlip = (appointment) => {
    setSelectedAppointment(appointment);
    setActiveTab('slip');
  };

  // Booking Finished
  const handleBookingComplete = (result) => {
    if (result?.appointment) {
      setSelectedAppointment(result.appointment);
    }
  };

  // Load Prescriptions
  const loadPrescriptions = async () => {
    if (!activePatient?.id) return;
    try {
      setLoadingRx(true);
      const res = await fetchPatientPrescriptions(activePatient.id);
      if (res.success) {
        setPrescriptions(res.prescriptions || []);
      }
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setLoadingRx(false);
    }
  };

  // Load Records & QR
  const loadRecordsAndQr = async () => {
    if (!activePatient?.id) return;
    try {
      setLoadingRecords(true);
      setLoadingQr(true);
      const [recRes, qrRes] = await Promise.all([
        fetchPatientMedicalRecords(activePatient.id),
        generatePatientQr(activePatient.id)
      ]);
      if (recRes.success) setMedicalRecords(recRes.records || []);
      if (qrRes.success) {
        setQrData(qrRes);
        const payload = qrRes.qrPayload || JSON.stringify({ ref: activePatient.id, ts: Date.now() });
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' }
        });
        setQrCodeDataUrl(dataUrl);
      }
    } catch (err) {
      console.error('Failed to load medical records or QR:', err);
      try {
        const fallbackUrl = await QRCode.toDataURL(activePatient.id, { width: 280, margin: 1 });
        setQrCodeDataUrl(fallbackUrl);
      } catch (_) {}
    } finally {
      setLoadingRecords(false);
      setLoadingQr(false);
    }
  };

  useEffect(() => {
    if (activePatient?.id && !qrCodeDataUrl) {
      const payload = qrData?.qrPayload || JSON.stringify({ ref: activePatient.id, ts: Date.now() });
      QRCode.toDataURL(payload, {
        width: 280,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      })
        .then(url => setQrCodeDataUrl(url))
        .catch(() => {});
    }
  }, [activePatient?.id, qrData]);

  useEffect(() => {
    if (activeTab === 'prescriptions') {
      loadPrescriptions();
    } else if (activeTab === 'records') {
      loadRecordsAndQr();
    }
  }, [activeTab, activePatient?.id]);

  // If patient not authenticated, show PatientAuth gateway (Existing Login vs New Registration)
  if (!activePatient) {
    return <PatientAuth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Patient Profile Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 20px',
        marginBottom: '20px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: '#e0f2fe',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800
          }}>
            <User size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {activePatient.name}
              </h3>
              <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>Verified Patient</span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Unique Health ID (UHID): <strong style={{ color: 'var(--text-main)', letterSpacing: '0.04em' }}>{activePatient.id}</strong> · Mobile: <strong>{activePatient.mobile}</strong>
            </p>
          </div>
        </div>

        {/* Tab Switcher & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('book')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'book' ? '#ffffff' : 'transparent',
                color: activeTab === 'book' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'book' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              <Calendar size={14} />
              <span>+ Book OPD</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'appointments' || activeTab === 'queue' || activeTab === 'slip' ? '#ffffff' : 'transparent',
                color: activeTab === 'appointments' || activeTab === 'queue' || activeTab === 'slip' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'appointments' || activeTab === 'queue' || activeTab === 'slip' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              <Users size={14} />
              <span>My Queue & Slips</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('prescriptions')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'prescriptions' ? '#ffffff' : 'transparent',
                color: activeTab === 'prescriptions' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'prescriptions' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              <FileText size={14} />
              <span>Digital Prescriptions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('records')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'records' ? '#ffffff' : 'transparent',
                color: activeTab === 'records' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'records' ? 'var(--shadow-sm)' : 'none'
              }}
            >
              <QrCode size={14} />
              <span>Medical Records & QR</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '7px 12px',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: '#dc2626'
            }}
          >
            <LogOut size={13} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'book' && (
        <OrsBookingWizard
          activePatient={activePatient}
          onBookingComplete={handleBookingComplete}
          onTrackQueue={(apt) => handleOpenQueue(apt)}
        />
      )}

      {activeTab === 'appointments' && (
        <PatientAppointmentsList
          activePatient={activePatient}
          onSelectAppointmentForQueue={handleOpenQueue}
          onSelectAppointmentForSlip={handleOpenSlip}
          onBookNew={() => setActiveTab('book')}
          initialCancellationNotice={cancellationNotice}
          onClearCancellationNotice={() => setCancellationNotice(null)}
        />
      )}

      {activeTab === 'queue' && selectedAppointment && (
        <PatientVirtualQueue
          appointment={selectedAppointment}
          onBack={() => setActiveTab('appointments')}
          onCancelled={(msg) => {
            setCancellationNotice(msg);
            setActiveTab('appointments');
          }}
          onViewSlip={handleOpenSlip}
        />
      )}

      {activeTab === 'slip' && selectedAppointment && (
        <OrsAppointmentSlip
          appointmentData={selectedAppointment}
          onTrackQueue={handleOpenQueue}
          onBookAnother={() => setActiveTab('book')}
        />
      )}

      {/* TAB: DIGITAL PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Digital OPD Prescriptions
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Official electronic prescriptions issued by consulting doctors for UHID: <strong>{activePatient.id}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={loadPrescriptions}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={13} className={loadingRx ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingRx ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
              <p style={{ fontSize: '0.84rem' }}>Loading prescriptions...</p>
            </div>
          ) : prescriptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <FileText size={36} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
              <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800 }}>No Digital Prescriptions Yet</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem' }}>
                When your consulting doctor issues a digital prescription in the chamber, it will appear here instantly.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {prescriptions.map((rx) => (
                <div key={rx.id} style={{
                  backgroundColor: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase' }}>
                        {rx.hospital_name}
                      </div>
                      <h4 style={{ margin: '2px 0 0 0', fontSize: '1rem', fontWeight: 800 }}>
                        Dr. {rx.doctor_name}
                      </h4>
                      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        Prescription ID: <strong>{rx.prescription_id}</strong> · {new Date(rx.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Printer size={13} />
                      <span>Print Slip</span>
                    </button>
                  </div>

                  <div style={{ marginTop: '12px', fontSize: '0.84rem' }}>
                    <strong>Diagnosis:</strong> <span style={{ color: '#0f172a' }}>{rx.diagnosis || 'General Consultation'}</span>
                  </div>

                  {rx.clinical_notes && (
                    <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                      <strong>Doctor Notes:</strong> {rx.clinical_notes}
                    </div>
                  )}

                  {rx.medicines && rx.medicines.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0369a1', marginBottom: '6px' }}>
                        Prescribed Medicines:
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                              <th style={{ padding: '6px 8px' }}>Medicine</th>
                              <th style={{ padding: '6px 8px' }}>Dosage</th>
                              <th style={{ padding: '6px 8px' }}>Frequency</th>
                              <th style={{ padding: '6px 8px' }}>Duration</th>
                              <th style={{ padding: '6px 8px' }}>Instructions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rx.medicines.map((m, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{m.name}</td>
                                <td style={{ padding: '6px 8px' }}>{m.dosage}</td>
                                <td style={{ padding: '6px 8px' }}>{m.frequency}</td>
                                <td style={{ padding: '6px 8px' }}>{m.duration}</td>
                                <td style={{ padding: '6px 8px', color: '#059669', fontWeight: 600 }}>{m.instructions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {rx.advice && (
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#334155' }}>
                      <strong>Diet & Advice:</strong> {rx.advice}
                    </div>
                  )}

                  {rx.follow_up_date && (
                    <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#b45309', fontWeight: 700 }}>
                      Next Follow-up Date: {rx.follow_up_date}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: MEDICAL RECORDS & PATIENT QR */}
      {activeTab === 'records' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* Digital QR ID Card */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-light)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Ministry of Health & Hospital Network Model
            </div>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>
              Digital Patient QR Identification
            </h3>
            <p style={{ margin: '4px 0 16px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Scan at the OPD chamber desk for instant verification and authorized access to your records.
            </p>

            {/* QR Code Canvas / Visual Badge */}
            <div style={{
              width: '190px',
              height: '190px',
              margin: '0 auto 14px auto',
              backgroundColor: '#ffffff',
              border: '2px solid #0284c7',
              borderRadius: 'var(--radius-md)',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(2,132,199,0.15)',
              position: 'relative'
            }}>
              {loadingQr ? (
                <div style={{ textAlign: 'center' }}>
                  <RefreshCw size={26} className="animate-spin" style={{ color: '#0284c7', margin: '0 auto 6px auto' }} />
                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Generating QR...</div>
                </div>
              ) : qrCodeDataUrl ? (
                <>
                  <img
                    src={qrCodeDataUrl}
                    alt={`Patient QR: ${activePatient.id}`}
                    style={{
                      width: '155px',
                      height: '155px',
                      display: 'block',
                      borderRadius: '4px'
                    }}
                  />
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>
                    {activePatient.id}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <QrCode size={90} style={{ color: '#0f172a' }} />
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>
                    {activePatient.id}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Copy Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const payload = qrData?.qrPayload || JSON.stringify({ ref: activePatient.id, ts: Date.now() });
                  navigator.clipboard.writeText(payload);
                  setCopiedPayload(true);
                  setTimeout(() => setCopiedPayload(false), 2500);
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {copiedPayload ? <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                <span>{copiedPayload ? 'QR Payload Copied!' : 'Copy QR Payload'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activePatient.id);
                  setCopiedUhid(true);
                  setTimeout(() => setCopiedUhid(false), 2500);
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {copiedUhid ? <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                <span>{copiedUhid ? 'UHID Copied!' : 'Copy UHID'}</span>
              </button>
            </div>

            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: '16px', fontSize: '0.8rem', color: '#166534', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '2px' }}>
                <CheckCircle2 size={16} />
                <span>Cryptographically Signed & Secure</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#15803d' }}>
                No raw medical history is stored in this QR code. Only authorized doctors in the hospital chamber network can unlock patient history.
              </div>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#334155', textAlign: 'left', lineHeight: 1.6 }}>
              <div>Patient: <strong>{activePatient.name}</strong></div>
              <div>Permanent UHID: <code>{activePatient.id}</code></div>
              <div>Registered Phone: <strong>{activePatient.mobile}</strong></div>
              <div>Gender: <strong>{activePatient.gender || 'Not specified'}</strong></div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={15} />
                <span>Print Digital QR Card</span>
              </button>
            </div>
          </div>

          {/* Medical Records List */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-light)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Authorized Medical Records
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Consultation notes and clinical records linked to UHID: {activePatient.id}
                </p>
              </div>
              <button
                type="button"
                onClick={loadRecordsAndQr}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.76rem',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} className={loadingRecords ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingRecords ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <p style={{ fontSize: '0.82rem' }}>Loading records...</p>
              </div>
            ) : medicalRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                <FileText size={32} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700 }}>No medical records filed yet.</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                  Consultation notes recorded by your doctor in the OPD chamber will be stored securely here.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {medicalRecords.map((rec) => (
                  <div key={rec.id} style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>{rec.record_type}</span>
                      <span style={{ color: '#64748b' }}>{new Date(rec.created_at).toLocaleDateString()}</span>
                    </div>
                    <h5 style={{ margin: '6px 0 2px 0', fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {rec.title}
                    </h5>
                    {rec.description && (
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#475569' }}>
                        {rec.description}
                      </p>
                    )}
                    {rec.doctor_name && (
                      <div style={{ fontSize: '0.74rem', color: '#0369a1', marginTop: '4px' }}>
                        Consulting Specialist: Dr. {rec.doctor_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

