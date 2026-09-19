import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Users, Clock, MapPin, Stethoscope, CheckCircle,
  ShieldCheck, RefreshCw, Home, Compass, UserCheck, Calendar, Info, XCircle
} from 'lucide-react';
import { fetchOpdVirtualQueue, cancelOpdAppointment } from '../../services/api';

export default function PatientVirtualQueue({
  appointment,
  onBack,
  onCancelled,
  onViewSlip
}) {
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCancelled, setIsCancelled] = useState(appointment?.status === 'CANCELLED');
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const socketRef = useRef(null);

  const hospitalId = appointment?.hospital_id;
  const doctorId = appointment?.doctor_id;
  const queueDate = appointment?.appointment_date;
  const patientToken = appointment?.token_number;

  // Load queue status from backend
  const loadQueueStatus = async () => {
    if (!hospitalId || !doctorId || !queueDate) return;
    try {
      const res = await fetchOpdVirtualQueue(hospitalId, doctorId, queueDate, patientToken);
      if (res.success) {
        setQueueData(res.queue);
        setError(null);
      } else {
        setError(res.error || 'Failed to fetch virtual queue.');
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to OPD queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueueStatus();

    // Setup Socket.IO subscription
    const socket = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_opd_queue', { hospitalId, doctorId, date: queueDate });
    });

    socket.on('opd:queue_updated', (updatedQueue) => {
      if (
        updatedQueue.hospitalId === hospitalId &&
        updatedQueue.doctorId === doctorId &&
        updatedQueue.queueDate === queueDate
      ) {
        setQueueData(updatedQueue);
      }
    });

    socket.on('opd:appointment_cancelled', (data) => {
      if (data?.appointmentId === appointment?.id || data?.appointment?.id === appointment?.id) {
        setIsCancelled(true);
      }
      loadQueueStatus();
    });

    // Safeguard poll every 8 seconds
    const interval = setInterval(loadQueueStatus, 8000);

    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.emit('leave_opd_queue', { hospitalId, doctorId, date: queueDate });
        socketRef.current.disconnect();
      }
    };
  }, [hospitalId, doctorId, queueDate, patientToken]);

  const handleCancelCurrentAppointment = async () => {
    try {
      setCancelling(true);
      setCancelError(null);
      const res = await cancelOpdAppointment({
        appointmentId: appointment.id,
        cancellationReason: 'Cancelled by patient from virtual queue monitor',
        uhid: appointment.uhid
      });
      if (res.success) {
        setIsCancelled(true);
        setShowCancelConfirm(false);
        const successMessage = res.message || `Appointment #${appointment.id} (Token #${patientToken}) cancelled successfully.`;
        if (onCancelled) {
          onCancelled(successMessage);
        } else if (onBack) {
          onBack();
        }
      } else {
        setCancelError(res.error || 'Failed to cancel appointment.');
      }
    } catch (err) {
      setCancelError(err.message || 'Error cancelling appointment.');
    } finally {
      setCancelling(false);
    }
  };

  const currentServing = queueData?.currentServingToken || 0;
  const doctorStatus = queueData?.doctorStatus || 'OFF_DESK';
  const isFuture = queueData?.isFuture;
  const isToday = queueData?.isToday;
  const avgMins = queueData?.avgConsultationMins || 12;
  const patientsAhead = queueData?.patientsAhead ?? 0;
  const estimatedWaitMins = queueData?.estimatedWaitMins ?? 0;
  const queueState = queueData?.queueState || 'SCHEDULED';

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto' }}>
      {/* Top Header & Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--text-main)'
              }}
            >
              ← Back
            </button>
          )}
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            Live Sitting-at-Home Virtual Queue Monitor
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {onViewSlip && (
            <button
              type="button"
              onClick={() => onViewSlip(appointment)}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--primary)'
              }}
            >
              View OPD Slip
            </button>
          )}
          {!isCancelled && queueState !== 'CONSULTATION_COMPLETED' && (
            <button
              type="button"
              onClick={() => {
                setCancelError(null);
                setShowCancelConfirm(true);
              }}
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <XCircle size={14} />
              <span>Cancel Appointment</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadQueueStatus}
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Cancellation Confirmation Modal */}
      {showCancelConfirm && (
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
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <XCircle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Cancel Appointment?
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Token #{patientToken} · {appointment?.doctor_name}
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to cancel this appointment for <strong>{appointment?.appointment_date}</strong>? Your token will be released and removed from the doctor's active queue.
            </p>

            {cancelError && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecdd3',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                color: '#b91c1c',
                fontSize: '0.82rem',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                <span>{cancelError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  padding: '9px 16px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelCurrentAppointment}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#dc2626',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  color: '#ffffff'
                }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Notice Banner */}
      {isCancelled && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '2px solid #ef4444',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <XCircle size={28} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#991b1b' }}>
                This Appointment Has Been Cancelled
              </h4>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#b91c1c' }}>
                Your token #{patientToken} has been released. The doctor's desk roster has been updated and the slot is open for re-booking.
              </p>
            </div>
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer'
              }}
            >
              ← Back to Appointments
            </button>
          )}
        </div>
      )}

      {/* Doctor & Hospital Context Strip */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-light)',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: '#e0f2fe',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Stethoscope size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {appointment.doctor_name || queueData?.doctorName}
              </h3>
              {doctorStatus === 'ON_DESK' && isToday ? (
                <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>● Doctor On Desk</span>
              ) : (
                <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b', fontSize: '0.7rem' }}>
                  Shift: {queueData?.shiftStart || '09:30 AM'} - {queueData?.shiftEnd || '03:00 PM'}
                </span>
              )}
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {appointment.department || queueData?.department} · {appointment.hospital_name || queueData?.hospitalName}
            </p>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>
            Chamber: {appointment.room_no || queueData?.roomNo || 'OPD Room 101'}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Consultation Date: <strong>{appointment.appointment_date}</strong> ({appointment.appointment_day})
          </div>
        </div>
      </div>

      {/* Main Dynamic Virtual Queue Dashboard */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        border: '2px solid #0284c7',
        padding: '24px',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '20px'
      }}>
        {/* Status Callout Banner */}
        <div style={{
          backgroundColor:
            isFuture
              ? '#eff6ff'
              : queueState === 'INSIDE_CHAMBER'
              ? '#ecfdf5'
              : queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW'
              ? '#f0fdf4'
              : queueState === 'PATIENT_NOT_PRESENT'
              ? '#fef2f2'
              : queueState === 'CALLING_SOON_ARRIVE_HOSPITAL'
              ? '#fffbeb'
              : queueState === 'AWAITING_DOCTOR_DESK'
              ? '#fefce8'
              : queueState === 'CONSULTATION_COMPLETED'
              ? '#f1f5f9'
              : '#eff6ff',
          border: `1.5px solid ${
            isFuture
              ? '#bfdbfe'
              : queueState === 'INSIDE_CHAMBER'
              ? '#6ee7b7'
              : queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW'
              ? '#86efac'
              : queueState === 'PATIENT_NOT_PRESENT'
              ? '#fecaca'
              : queueState === 'CALLING_SOON_ARRIVE_HOSPITAL'
              ? '#fcd34d'
              : queueState === 'AWAITING_DOCTOR_DESK'
              ? '#fef08a'
              : queueState === 'CONSULTATION_COMPLETED'
              ? '#cbd5e1'
              : '#bfdbfe'
          }`,
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          {isFuture ? (
            <Calendar size={28} style={{ color: '#0284c7', flexShrink: 0 }} />
          ) : queueState === 'INSIDE_CHAMBER' || queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW' ? (
            <CheckCircle size={28} style={{ color: '#059669', flexShrink: 0 }} />
          ) : queueState === 'PATIENT_NOT_PRESENT' ? (
            <XCircle size={28} style={{ color: '#dc2626', flexShrink: 0 }} />
          ) : queueState === 'CALLING_SOON_ARRIVE_HOSPITAL' ? (
            <Compass size={28} style={{ color: '#d97706', flexShrink: 0 }} />
          ) : queueState === 'AWAITING_DOCTOR_DESK' ? (
            <Clock size={28} style={{ color: '#ca8a04', flexShrink: 0 }} />
          ) : queueState === 'CONSULTATION_COMPLETED' ? (
            <UserCheck size={28} style={{ color: '#64748b', flexShrink: 0 }} />
          ) : (
            <Home size={28} style={{ color: '#2563eb', flexShrink: 0 }} />
          )}

          <div>
            <h4 style={{
              margin: 0,
              fontSize: '0.98rem',
              fontWeight: 800,
              color:
                isFuture
                  ? '#1e40af'
                  : queueState === 'INSIDE_CHAMBER' || queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW'
                  ? '#065f46'
                  : queueState === 'PATIENT_NOT_PRESENT'
                  ? '#991b1b'
                  : queueState === 'CALLING_SOON_ARRIVE_HOSPITAL'
                  ? '#92400e'
                  : queueState === 'AWAITING_DOCTOR_DESK'
                  ? '#854d0e'
                  : queueState === 'CONSULTATION_COMPLETED'
                  ? '#334155'
                  : '#1e40af'
            }}>
              {isFuture && `Appointment Confirmed for ${appointment.appointment_date} (${appointment.appointment_day})`}
              {!isFuture && queueState === 'AWAITING_DOCTOR_DESK' && `Awaiting Doctor Arrival · OPD Shift Starts at ${queueData?.shiftStart || '09:30 AM'}`}
              {!isFuture && queueState === 'DOCTOR_READY_CALLING_FIRST' && 'Doctor Arrived on Desk — Calling First Token Shortly'}
              {!isFuture && queueState === 'INSIDE_CHAMBER' && 'Your Token is Active — Please Proceed into Consultation Chamber!'}
              {!isFuture && queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW' && `Doctor Completed Previous Patient — You are NEXT! Stand by Chamber Door`}
              {!isFuture && queueState === 'PATIENT_NOT_PRESENT' && 'Marked Not Present by Doctor Chamber Desk'}
              {!isFuture && queueState === 'CALLING_SOON_ARRIVE_HOSPITAL' && `Time to Depart for Hospital! (Only ${patientsAhead} Patient Ahead)`}
              {!isFuture && queueState === 'WAITING_AT_HOME' && 'Wait Comfortably At Home — No Need to Stand in Corridor Queues'}
              {!isFuture && queueState === 'CONSULTATION_COMPLETED' && 'Consultation Completed for Today'}
            </h4>
            <p style={{
              margin: '3px 0 0 0',
              fontSize: '0.8rem',
              color:
                isFuture
                  ? '#1d4ed8'
                  : queueState === 'INSIDE_CHAMBER' || queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW'
                  ? '#047857'
                  : queueState === 'PATIENT_NOT_PRESENT'
                  ? '#b91c1c'
                  : queueState === 'CALLING_SOON_ARRIVE_HOSPITAL'
                  ? '#b45309'
                  : queueState === 'AWAITING_DOCTOR_DESK'
                  ? '#a16207'
                  : queueState === 'CONSULTATION_COMPLETED'
                  ? '#475569'
                  : '#1d4ed8'
            }}>
              {isFuture && `Your Virtual Token #${patientToken} is officially registered in ${appointment.doctor_name}'s roster. Live queue tracking will activate on the morning of consultation day so you can monitor the room live from home.`}
              {!isFuture && queueState === 'AWAITING_DOCTOR_DESK' && `Dr. ${appointment.doctor_name} has not yet logged into the desk. Please relax at home; live token calling will commence once doctor arrives.`}
              {!isFuture && queueState === 'DOCTOR_READY_CALLING_FIRST' && `Dr. ${appointment.doctor_name} is now seated in ${appointment.room_no}. Prepare for your turn.`}
              {!isFuture && queueState === 'INSIDE_CHAMBER' && `Token #${patientToken} is currently inside consultation chamber with ${appointment.doctor_name}.`}
              {!isFuture && queueState === 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW' && `Doctor has completed Token #${queueData?.lastCompletedToken || 1}. You are Token #${patientToken}. Please stand right at Chamber ${appointment.room_no} door; doctor is calling you now.`}
              {!isFuture && queueState === 'PATIENT_NOT_PRESENT' && 'You were not present when your token was called. Please speak to the room attendant or OPD helpdesk to re-add your token to today\'s active queue.'}
              {!isFuture && queueState === 'CALLING_SOON_ARRIVE_HOSPITAL' && `There are only ${patientsAhead} patient(s) ahead of you. Please head toward ${appointment.hospital_name} OPD Chamber ${appointment.room_no}.`}
              {!isFuture && queueState === 'WAITING_AT_HOME' && `There are ${patientsAhead} patients ahead of you. Estimated wait is approx. ${estimatedWaitMins} minutes. Relax at home; we will prompt you when it's time to head out.`}
              {!isFuture && queueState === 'CONSULTATION_COMPLETED' && 'This appointment token has already been completed. Thank you for using SmartCare ORS.'}
            </p>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px',
          marginBottom: '20px'
        }}>
          {/* Card 1: Now Serving Token */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Now Serving Token
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0284c7', marginTop: '4px' }}>
              {isFuture || currentServing === 0 ? '--' : `#${currentServing}`}
            </div>
            <span className="badge badge-blue" style={{ fontSize: '0.66rem' }}>
              {isFuture ? 'Scheduled Future' : currentServing === 0 ? 'Not Started' : 'Live in OPD Room'}
            </span>
          </div>

          {/* Card 2: Your Token */}
          <div style={{
            backgroundColor: '#f0f9ff',
            border: '2px solid #0284c7',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
              Your Token Number
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0369a1', marginTop: '4px' }}>
              #{patientToken}
            </div>
            <span className="badge badge-green" style={{ fontSize: '0.66rem' }}>Confirmed Slot</span>
          </div>

          {/* Card 3: Patients Ahead */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Patients Ahead
            </div>
            <div style={{
              fontSize: '2.2rem',
              fontWeight: 900,
              color: patientsAhead <= 2 && !isFuture ? '#d97706' : 'var(--text-main)',
              marginTop: '4px'
            }}>
              {patientsAhead}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>In Virtual Queue</span>
          </div>

          {/* Card 4: Estimated Wait Time */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Estimated Wait Time
            </div>
            <div style={{
              fontSize: '2.2rem',
              fontWeight: 900,
              color: estimatedWaitMins <= 20 ? '#16a34a' : 'var(--text-main)',
              marginTop: '4px'
            }}>
              ~{estimatedWaitMins}
              <span style={{ fontSize: '1rem', fontWeight: 600 }}> min</span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Dynamic estimate</span>
          </div>
        </div>

        {/* Doctor Consultation Duration Live Telemetry (User audio requirement) */}
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.78rem',
          color: '#166534'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} />
            <span>
              <strong>Doctor Consultation Speed:</strong> Recorded average time per patient is <strong>~{avgMins} mins</strong>.
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#15803d' }}>
            Based on {queueData?.totalCompleted || 0} consultations completed today
          </span>
        </div>

        {/* Read-Only Policy Clarification */}
        <div style={{
          backgroundColor: '#fafaf9',
          border: '1px solid #e7e5e4',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          fontSize: '0.76rem',
          color: '#57534e',
          lineHeight: 1.45
        }}>
          <ShieldCheck size={18} style={{ color: '#0284c7', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>SmartCare Sitting-at-Home Monitor (Read-Only):</strong>
            {" "}Only the consulting doctor in their OPD chamber can call tokens and advance the consultation queue. This screen updates live in real-time as the doctor admits each patient.
          </div>
        </div>
      </div>
    </div>
  );
}
