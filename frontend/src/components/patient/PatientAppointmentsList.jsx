import React, { useState, useEffect } from 'react';
import { Search, Calendar, Clock, MapPin, User, FileText, ArrowRight, ShieldCheck, RefreshCw, AlertCircle, XCircle, CheckCircle2 } from 'lucide-react';
import { fetchOpdPatientAppointments, cancelOpdAppointment, logOpdInteraction } from '../../services/api';

export default function PatientAppointmentsList({
  activePatient,
  onSelectAppointmentForQueue,
  onSelectAppointmentForSlip,
  onBookNew,
  initialCancellationNotice = null,
  onClearCancellationNotice = null
}) {
  const [identifier, setIdentifier] = useState(activePatient?.id || activePatient?.mobile || '');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);

  // Cancellation State
  const [cancellingAppointment, setCancellingAppointment] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('Change of plans / Unable to visit');
  const [customReason, setCustomReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState(initialCancellationNotice || null);

  const searchAppointments = async (queryToSearch) => {
    const query = (queryToSearch || identifier).trim();
    if (!query) return;

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      // Log click with date, day, time
      logOpdInteraction({
        sessionId: 'patient_portal_session',
        stepName: 'PATIENT_SEARCH_APPOINTMENTS',
        actionData: { query },
        mobile: query.length === 10 ? query : null,
        uhid: query.startsWith('UHID') ? query : null
      });

      const res = await fetchOpdPatientAppointments(query);
      if (res.success) {
        setAppointments(res.appointments || []);
      } else {
        setError(res.error || 'No appointments found.');
      }
    } catch (err) {
      setError(err.message || 'Error searching appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activePatient?.id || activePatient?.mobile) {
      const id = activePatient.id || activePatient.mobile;
      setIdentifier(id);
      searchAppointments(id);
    }
  }, [activePatient]);

  useEffect(() => {
    if (initialCancellationNotice) {
      setCancelSuccessMsg(initialCancellationNotice);
      const timer = setTimeout(() => {
        setCancelSuccessMsg(null);
        if (onClearCancellationNotice) onClearCancellationNotice();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [initialCancellationNotice]);

  const handleConfirmCancel = async () => {
    if (!cancellingAppointment) return;
    try {
      setCancelLoading(true);
      setError(null);
      const finalReason = cancellationReason === 'Other' ? (customReason.trim() || 'Other reason') : cancellationReason;
      const res = await cancelOpdAppointment({
        appointmentId: cancellingAppointment.id,
        cancellationReason: finalReason,
        uhid: cancellingAppointment.uhid
      });
      if (res.success) {
        setCancelSuccessMsg(`Appointment #${cancellingAppointment.id} (Token #${cancellingAppointment.token_number}) has been cancelled successfully. Your consultation token has been released.`);
        // Update local appointment state immediately
        setAppointments(prev => prev.map(a => a.id === cancellingAppointment.id ? { ...a, status: 'CANCELLED', cancellation_reason: finalReason } : a));
        setCancellingAppointment(null);
        setTimeout(() => setCancelSuccessMsg(null), 8000);
      } else {
        setError(res.error || 'Failed to cancel appointment.');
      }
    } catch (err) {
      setError(err.message || 'Error cancelling appointment.');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Cancellation Success Notification */}
      {cancelSuccessMsg && (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1.5px solid #10b981',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          color: '#065f46',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <CheckCircle2 size={20} style={{ color: '#059669', flexShrink: 0 }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{cancelSuccessMsg}</span>
        </div>
      )}

      {/* Search Header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-light)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              My OPD Appointments & Virtual Queue
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Track live consultation queues, view official slips, or cancel appointments sitting at home.
            </p>
          </div>

          {onBookNew && (
            <button
              type="button"
              onClick={onBookNew}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span>+ Book New OPD</span>
            </button>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={(e) => { e.preventDefault(); searchAppointments(); }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter Mobile Number or UHID (e.g. UHID-2026-APOL-XXXXXX)"
                style={{
                  width: '100%',
                  padding: '11px 12px 11px 38px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0 22px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Searching...' : 'Find Appointments'}
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading your appointments...</p>
        </div>
      ) : error ? (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          color: '#b91c1c',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px'
        }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: '0.86rem' }}>{error}</span>
        </div>
      ) : hasSearched && appointments.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted)'
        }}>
          <Calendar size={40} style={{ color: '#94a3b8', marginBottom: '12px' }} />
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--text-main)' }}>No OPD Appointments Found</h4>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>
            There are no appointments registered under <strong>{identifier}</strong>. Click below to book an OPD appointment.
          </p>
          {onBookNew && (
            <button
              type="button"
              onClick={onBookNew}
              style={{
                marginTop: '16px',
                padding: '8px 18px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Book OPD Appointment Now
            </button>
          )}
        </div>
      ) : appointments.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {appointments.map((apt) => {
            const isCancelled = apt.status === 'CANCELLED';
            const isCompleted = apt.status === 'COMPLETED';

            return (
              <div
                key={apt.id}
                style={{
                  backgroundColor: isCancelled ? '#fafafa' : '#ffffff',
                  borderRadius: 'var(--radius-lg)',
                  border: isCancelled ? '1.5px dashed #cbd5e1' : '1.5px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  opacity: isCancelled ? 0.78 : 1,
                  transition: 'border-color 0.15s ease'
                }}
              >
                {/* Left Details */}
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                      {apt.hospital_name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      Ref: {apt.id}
                    </span>
                    {isCancelled && (
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: '#fee2e2',
                        color: '#b91c1c',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 800
                      }}>
                        CANCELLED
                      </span>
                    )}
                  </div>

                  <h4 style={{
                    margin: '2px 0 0 0',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: isCancelled ? '#64748b' : 'var(--text-main)',
                    textDecoration: isCancelled ? 'line-through' : 'none'
                  }}>
                    {apt.doctor_name}
                  </h4>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isCancelled ? '#94a3b8' : 'var(--primary)' }}>
                    {apt.department} · {apt.room_no}
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginTop: '10px',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} style={{ color: isCancelled ? '#94a3b8' : 'var(--primary)' }} />
                      <span>{apt.appointment_date} ({apt.appointment_day})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} style={{ color: isCancelled ? '#94a3b8' : 'var(--primary)' }} />
                      <span>{apt.time_slot}</span>
                    </div>
                  </div>

                  {isCancelled && apt.cancellation_reason && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic' }}>
                      Reason: {apt.cancellation_reason}
                    </div>
                  )}
                </div>

                {/* Center Token Badge */}
                <div style={{
                  backgroundColor: isCancelled ? '#f1f5f9' : '#f0f9ff',
                  border: isCancelled ? '1.5px solid #cbd5e1' : '1.5px solid #0284c7',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 18px',
                  textAlign: 'center',
                  minWidth: '100px'
                }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 700, color: isCancelled ? '#64748b' : '#0369a1', textTransform: 'uppercase' }}>
                    Virtual Token
                  </span>
                  <div style={{
                    fontSize: '1.6rem',
                    fontWeight: 900,
                    color: isCancelled ? '#94a3b8' : '#0284c7',
                    lineHeight: 1.1,
                    textDecoration: isCancelled ? 'line-through' : 'none'
                  }}>
                    #{apt.token_number}
                  </div>
                  <span style={{
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    color: isCancelled ? '#b91c1c' : isCompleted ? '#64748b' : '#059669'
                  }}>
                    {apt.status || 'CONFIRMED'}
                  </span>
                </div>

                {/* Right Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '160px' }}>
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={() => {
                        logOpdInteraction({
                          sessionId: 'patient_portal_session',
                          stepName: 'CLICK_TRACK_VIRTUAL_QUEUE',
                          actionData: { appointmentId: apt.id, token: apt.token_number },
                          mobile: apt.patient_phone,
                          uhid: apt.uhid
                        });
                        onSelectAppointmentForQueue(apt);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        backgroundColor: 'var(--primary)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <span>Track Virtual Queue</span>
                      <ArrowRight size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      logOpdInteraction({
                        sessionId: 'patient_portal_session',
                        stepName: 'CLICK_VIEW_OPD_SLIP',
                        actionData: { appointmentId: apt.id },
                        mobile: apt.patient_phone,
                        uhid: apt.uhid
                      });
                      onSelectAppointmentForSlip(apt);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-main)'
                    }}
                  >
                    <FileText size={14} />
                    <span>View OPD Slip</span>
                  </button>

                  {/* Cancel Appointment Button */}
                  {!isCancelled && !isCompleted && (
                    <button
                      type="button"
                      onClick={() => setCancellingAppointment(apt)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        backgroundColor: '#fff1f2',
                        border: '1px solid #fecdd3',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#e11d48',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <XCircle size={13} />
                      <span>Cancel Appointment</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Confirmation Modal for Appointment Cancellation */}
      {cancellingAppointment && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999,
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto'
            }}>
              <XCircle size={26} />
            </div>

            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 800, textAlign: 'center', color: '#1e293b' }}>
              Cancel OPD Appointment?
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: '#64748b', textAlign: 'center' }}>
              Are you sure you want to cancel your consultation with <strong>{cancellingAppointment.doctor_name}</strong> (Token #{cancellingAppointment.token_number}) on <strong>{cancellingAppointment.appointment_date}</strong>?
            </p>

            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: '#334155' }}>
                Select Cancellation Reason:
              </label>
              <select
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: '#ffffff',
                  marginBottom: cancellationReason === 'Other' ? '8px' : '0'
                }}
              >
                <option value="Change of plans / Unable to visit">Change of plans / Unable to visit</option>
                <option value="Health condition improved">Health condition improved</option>
                <option value="Scheduling conflict / Emergency">Scheduling conflict / Emergency</option>
                <option value="Booked by mistake">Booked by mistake</option>
                <option value="Other">Other reason</option>
              </select>

              {cancellationReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Specify reason..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box'
                  }}
                />
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={cancelLoading}
                onClick={() => setCancellingAppointment(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                No, Keep Appointment
              </button>

              <button
                type="button"
                disabled={cancelLoading}
                onClick={handleConfirmCancel}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#e11d48',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: cancelLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {cancelLoading ? 'Cancelling...' : 'Yes, Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
