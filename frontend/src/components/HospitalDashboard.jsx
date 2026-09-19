import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Phone, ShieldCheck, LogOut, Activity, Database, HeartPulse, Stethoscope, RefreshCw, AlertOctagon, Check, X, Clock, User, Truck, Radio, ChevronRight } from 'lucide-react';
import { fetchHospitalDashboard, fetchHospitalActiveEmergencies, fetchHospitalPendingEmergency, acceptHospitalEmergency, rejectHospitalEmergency, fetchHospitalAmbulanceFleet } from '../services/api';
import { getSocket, joinHospitalRoom, leaveHospitalRoom } from '../services/socket';
import BedManager from './BedManager';
import DoctorManager from './DoctorManager';
import ActivityLog from './ActivityLog';

export default function HospitalDashboard({ hospitalId, admin, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveSocketActive, setLiveSocketActive] = useState(false);

  // Incoming Emergency Alert State (2-min window)
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [responding, setResponding] = useState(false);

  // Active / Accepted emergencies for this hospital
  const [activeEmergencies, setActiveEmergencies] = useState([]);

  // Dedicated Ambulance Fleet State
  const [fleetData, setFleetData] = useState({
    counts: { total: 10, onDuty: 4, offDuty: 4, onService: 2 },
    drivers: []
  });
  const [fleetModalOpen, setFleetModalOpen] = useState(false);
  const [fleetFilter, setFleetFilter] = useState('ALL');
  const [assignedDriversMap, setAssignedDriversMap] = useState({});
  const [ambulanceDispatchStatus, setAmbulanceDispatchStatus] = useState({});
  const [rideStagesMap, setRideStagesMap] = useState({});

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const res = await fetchHospitalDashboard(hospitalId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load hospital dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const loadActiveEmergencies = async () => {
    try {
      const res = await fetchHospitalActiveEmergencies(hospitalId);
      if (res.success) {
        setActiveEmergencies(res.emergencies);
      }
    } catch (_) {}
  };

  const loadFleetData = async () => {
    try {
      const res = await fetchHospitalAmbulanceFleet(hospitalId);
      if (res.success) {
        setFleetData(res);
      }
    } catch (_) {}
  };

  const checkPendingAlert = async () => {
    try {
      const res = await fetchHospitalPendingEmergency(hospitalId);
      if (res && res.success && res.pendingAlert) {
        setIncomingAlert(res.pendingAlert);
        setSecondsLeft(res.pendingAlert.remainingSeconds || 120);
      } else {
        setIncomingAlert(null);
      }
    } catch (_) {}
  };

  // Initial data load + 2-second guaranteed polling interval
  useEffect(() => {
    loadDashboardData();
    loadActiveEmergencies();
    loadFleetData();
    checkPendingAlert();

    const pollInterval = setInterval(() => {
      checkPendingAlert();
      loadActiveEmergencies();
      loadFleetData();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [hospitalId]);

  // Socket.IO Real-time connectivity & Emergency alert listeners
  useEffect(() => {
    const socket = getSocket();
    joinHospitalRoom(hospitalId);

    if (socket.connected) {
      setLiveSocketActive(true);
    }

    const onConnect = () => {
      setLiveSocketActive(true);
      joinHospitalRoom(hospitalId);
    };
    const onDisconnect = () => setLiveSocketActive(false);

    // Bed updates from other admins / self
    const onBedsUpdated = (payload) => {
      if (payload.hospitalId === hospitalId) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            beds: payload.beds,
            logs: [
              {
                id: Date.now(),
                timestamp: payload.lastUpdated,
                category: 'BED_UPDATE',
                admin_name: payload.adminName || 'Admin',
                description: `Beds updated in real time: ${payload.beds.availableBeds}/${payload.beds.totalBeds} available.`
              },
              ...prev.logs
            ].slice(0, 20)
          };
        });
      }
    };

    // Doctor updates
    const onDoctorsUpdated = (payload) => {
      if (payload.hospitalId === hospitalId) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            doctors: payload.doctors,
            logs: [
              {
                id: Date.now(),
                timestamp: payload.lastUpdated,
                category: 'DOCTOR_UPDATE',
                admin_name: payload.adminName || 'Admin',
                description: `Doctors updated in real time: ${payload.doctors.availableDoctors}/${payload.doctors.totalDoctors} available.`
              },
              ...prev.logs
            ].slice(0, 20)
          };
        });
      }
    };

    // Incoming 2-minute emergency request alert
    const onEmergencyAlert = (payload) => {
      setIncomingAlert(payload);
      if (payload.stepExpiresAt) {
        const diff = Math.max(0, Math.floor((new Date(payload.stepExpiresAt).getTime() - Date.now()) / 1000));
        setSecondsLeft(diff || 120);
      } else {
        setSecondsLeft(120);
      }
    };

    // Request timed out or rejected (disappears immediately from dashboard)
    const onRequestDisappeared = (payload) => {
      setIncomingAlert((prev) => {
        if (prev && prev.requestId === payload.requestId) {
          return null;
        }
        return prev;
      });
      loadActiveEmergencies();
    };

    // Confirmed accepted case
    const onConfirmedCase = () => {
      setIncomingAlert(null);
      loadActiveEmergencies();
    };

    // Any queue change across hospitals (advance, reject, timeout)
    const onQueueUpdated = () => {
      checkPendingAlert();
      loadActiveEmergencies();
    };

    // Ambulance Fleet real-time listeners
    const onAmbulanceDutyChanged = (payload) => {
      if (payload.hospitalId === hospitalId) {
        if (payload.counts) {
          setFleetData(prev => ({ ...prev, counts: payload.counts }));
        }
        loadFleetData();
      }
    };

    const onAmbulanceFleetUpdated = (payload) => {
      if (payload.hospitalId === hospitalId) {
        loadFleetData();
      }
    };

    const onAmbulanceDispatchInitiated = (payload) => {
      setAmbulanceDispatchStatus(prev => ({ ...prev, [payload.requestId]: payload }));
    };

    const onAmbulanceRideAssigned = (payload) => {
      if (payload.hospitalId === hospitalId) {
        setAssignedDriversMap(prev => ({ ...prev, [payload.requestId]: payload.driver }));
        if (payload.counts) {
          setFleetData(prev => ({ ...prev, counts: payload.counts }));
        }
        loadFleetData();
        loadActiveEmergencies();
      }
    };

    const onAmbulanceRideCompleted = (payload) => {
      if (payload.hospitalId === hospitalId) {
        setRideStagesMap(prev => ({ ...prev, [payload.requestId]: 'COMPLETED' }));
        if (payload.counts) {
          setFleetData(prev => ({ ...prev, counts: payload.counts }));
        }
        loadFleetData();
        loadActiveEmergencies();
      }
    };

    const onAmbulanceStageUpdated = (payload) => {
      if (payload.hospitalId === hospitalId) {
        setRideStagesMap(prev => ({ ...prev, [payload.requestId]: payload.stage }));
        loadActiveEmergencies();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('hospital:beds_updated', onBedsUpdated);
    socket.on('hospital:doctors_updated', onDoctorsUpdated);
    socket.on('emergency:incoming_alert', onEmergencyAlert);
    socket.on('emergency:request_disappeared', onRequestDisappeared);
    socket.on('emergency:confirmed_case', onConfirmedCase);
    socket.on('emergency:queue_updated', onQueueUpdated);
    socket.on('ambulance:duty_changed', onAmbulanceDutyChanged);
    socket.on('ambulance:fleet_updated', onAmbulanceFleetUpdated);
    socket.on('ambulance:dispatch_initiated', onAmbulanceDispatchInitiated);
    socket.on('ambulance:ride_assigned_to_driver', onAmbulanceRideAssigned);
    socket.on('ambulance:ride_completed', onAmbulanceRideCompleted);
    socket.on('ambulance:stage_update', onAmbulanceStageUpdated);

    return () => {
      leaveHospitalRoom(hospitalId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('hospital:beds_updated', onBedsUpdated);
      socket.off('hospital:doctors_updated', onDoctorsUpdated);
      socket.off('emergency:incoming_alert', onEmergencyAlert);
      socket.off('emergency:request_disappeared', onRequestDisappeared);
      socket.off('emergency:confirmed_case', onConfirmedCase);
      socket.off('emergency:queue_updated', onQueueUpdated);
      socket.off('ambulance:duty_changed', onAmbulanceDutyChanged);
      socket.off('ambulance:fleet_updated', onAmbulanceFleetUpdated);
      socket.off('ambulance:dispatch_initiated', onAmbulanceDispatchInitiated);
      socket.off('ambulance:ride_assigned_to_driver', onAmbulanceRideAssigned);
      socket.off('ambulance:ride_completed', onAmbulanceRideCompleted);
      socket.off('ambulance:stage_update', onAmbulanceStageUpdated);
    };
  }, [hospitalId]);

  // Live Countdown Timer for Incoming Emergency Alert (2 minutes)
  useEffect(() => {
    if (!incomingAlert) return;

    const tick = () => {
      if (incomingAlert.stepExpiresAt) {
        const diff = Math.max(0, Math.floor((new Date(incomingAlert.stepExpiresAt).getTime() - Date.now()) / 1000));
        setSecondsLeft(diff);
        if (diff <= 0) {
          setIncomingAlert(null);
          loadActiveEmergencies();
        }
      } else {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            setIncomingAlert(null);
            loadActiveEmergencies();
            return 0;
          }
          return prev - 1;
        });
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [incomingAlert?.requestId, incomingAlert?.stepExpiresAt]);

  // Admin Accept Action
  const handleAccept = async () => {
    if (!incomingAlert) return;
    setResponding(true);
    try {
      const res = await acceptHospitalEmergency(hospitalId, incomingAlert.requestId);
      if (res.success) {
        setIncomingAlert(null);
        loadActiveEmergencies();
      } else {
        alert(res.error || 'Failed to accept emergency request.');
      }
    } catch (err) {
      alert('Error accepting emergency: ' + err.message);
    } finally {
      setResponding(false);
    }
  };

  // Admin Reject Action
  const handleReject = async () => {
    if (!incomingAlert) return;
    setResponding(true);
    try {
      const res = await rejectHospitalEmergency(hospitalId, incomingAlert.requestId);
      if (res.success) {
        setIncomingAlert(null);
        loadActiveEmergencies();
      }
    } catch (err) {
      alert('Error rejecting emergency: ' + err.message);
    } finally {
      setResponding(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
        <p style={{ fontWeight: 600 }}>Loading real-time hospital database records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '16px' }}>{error}</div>
        <button onClick={loadDashboardData} className="btn btn-secondary">Retry</button>
      </div>
    );
  }

  const { hospital, beds, doctors, logs } = data;
  const timerMin = Math.floor(secondsLeft / 60);
  const timerSec = secondsLeft % 60;
  const formattedTimer = `${timerMin}:${timerSec < 10 ? '0' : ''}${timerSec}`;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* INCOMING EMERGENCY ALERT BANNER (2-Minute Live Window or Queued in Pipeline) */}
      {incomingAlert && (
        incomingAlert.isQueued ? (
          <div className="card-glass animate-slide-down" style={{
            padding: '20px 24px',
            backgroundColor: '#eff6ff',
            border: '2px solid #93c5fd',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.12)',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Clock size={22} />
                </div>
                <div>
                  <span className="badge badge-blue" style={{ marginBottom: '3px' }}>
                    INCOMING PIPELINE CASE (POSITION #{incomingAlert.myQueuePosition} OF {incomingAlert.totalHospitals})
                  </span>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e3a8a' }}>
                    Emergency SOS Dispatched Nearby
                  </h3>
                </div>
              </div>

              <div style={{
                backgroundColor: '#dbeafe',
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                color: '#1d4ed8',
                fontWeight: 700
              }}>
                Currently with: {incomingAlert.currentHospitalName} (Hospital #{incomingAlert.currentQueuePosition})
              </div>
            </div>

            <div style={{
              backgroundColor: '#ffffff',
              padding: '14px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #bfdbfe',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '0.84rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem', display: 'block' }}>PATIENT</span>
                <strong style={{ color: 'var(--text-main)' }}>{incomingAlert.patientName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem', display: 'block' }}>PHONE</span>
                <strong style={{ color: 'var(--text-main)' }}>{incomingAlert.phone}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem', display: 'block' }}>DISTANCE TO THIS HOSPITAL</span>
                <strong style={{ color: '#2563eb' }}>{incomingAlert.distanceKm} km away</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem', display: 'block' }}>REPORTED SYMPTOMS</span>
                <span style={{ color: '#b91c1c', fontWeight: 700 }}>{incomingAlert.symptoms}</span>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #bfdbfe', paddingTop: '8px' }}>
                <span style={{ color: '#1d4ed8', fontSize: '0.74rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} /> EMERGENCY PATIENT REAL-TIME LOCATION
                </span>
                <strong style={{ fontSize: '0.90rem', color: 'var(--text-main)', display: 'block' }}>
                  {incomingAlert.patientAddress || 'Patient Device Real-Time Location'}
                </strong>
                {incomingAlert.patientLat && (
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    GPS: {incomingAlert.patientLat?.toFixed(4)}° N, {incomingAlert.patientLng?.toFixed(4)}° E ({incomingAlert.distanceKm} km from our hospital)
                  </span>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#1e40af', marginTop: '12px', marginBottom: 0 }}>
              ℹ️ This patient's request was dispatched to Hospital #{incomingAlert.currentQueuePosition} (<strong>{incomingAlert.currentHospitalName}</strong>) first due to proximity. If they decline or do not respond within their 2-minute window, this alert will automatically transfer to your dashboard with full Accept/Decline controls.
            </p>
          </div>
        ) : (
          <div className="card-glass animate-pulse" style={{
            padding: '24px 28px',
            backgroundColor: '#fff1f2',
            border: '2.5px solid #f43f5e',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 8px 30px rgba(244, 63, 94, 0.22)',
            marginBottom: '24px'
          }}>
            {/* Header with Title and Countdown Timer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  backgroundColor: '#e11d48',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 0 15px rgba(225, 29, 72, 0.5)'
                }}>
                  <AlertOctagon size={30} />
                </div>
                <div>
                  <span className="badge badge-red" style={{ marginBottom: '4px' }}>
                    🚨 URGENT INCOMING EMERGENCY (QUEUE POSITION #{incomingAlert.queuePosition} OF {incomingAlert.totalHospitals})
                  </span>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#881337' }}>
                    Emergency Patient Dispatch Request
                  </h2>
                </div>
              </div>

              {/* Live 2-minute countdown timer */}
              <div style={{
                backgroundColor: '#ffe4e6',
                border: '2px solid #fb7185',
                padding: '8px 18px',
                borderRadius: 'var(--radius-lg)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239', textTransform: 'uppercase' }}>
                  Admin Response Countdown
                </div>
                <div style={{
                  fontSize: '1.9rem',
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono)',
                  color: '#be123c',
                  lineHeight: 1.1
                }}>
                  {formattedTimer}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9f1239' }}>
                  Auto-routes to next hospital upon 0:00
                </div>
              </div>
            </div>

            {/* Patient info details */}
            <div style={{
              backgroundColor: '#ffffff',
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #fecdd3',
              marginBottom: '18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
              fontSize: '0.86rem'
            }}>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>PATIENT NAME</span>
                <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>{incomingAlert.patientName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>PHONE NUMBER</span>
                <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>{incomingAlert.phone}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>DISTANCE FROM HOSPITAL</span>
                <strong style={{ fontSize: '0.98rem', color: 'var(--primary)' }}>{incomingAlert.distanceKm} km away</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', display: 'block' }}>REPORTED DISEASE / SYMPTOMS</span>
                <span style={{ color: '#be123c', fontWeight: 700, fontSize: '0.95rem' }}>{incomingAlert.symptoms}</span>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #fecdd3', paddingTop: '10px' }}>
                <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={13} /> EMERGENCY PATIENT REAL-TIME LOCATION
                </span>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)', display: 'block' }}>
                  {incomingAlert.patientAddress || 'Patient Device Real-Time Location'}
                </strong>
                {incomingAlert.patientLat && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    GPS: {incomingAlert.patientLat?.toFixed(4)}° N, {incomingAlert.patientLng?.toFixed(4)}° E ({incomingAlert.distanceKm} km from our hospital)
                  </span>
                )}
              </div>
            </div>

            {/* REAL-TIME AMBULANCE DRIVER AVAILABILITY CHECK */}
            <div style={{
              backgroundColor: '#ffffff',
              border: '1.5px solid #fbcfe8',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px'
                }}>
                  🚑
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    Ambulance Driver Fleet Availability ({hospital.name})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                      {fleetData.counts?.onDuty || 0} Drivers ON DUTY (Available)
                    </span>
                    <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                      {fleetData.counts?.onService || 0} On Service (Busy)
                    </span>
                    <span className="badge" style={{ fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569' }}>
                      {fleetData.counts?.offDuty || 0} Off Duty
                    </span>
                  </div>
                </div>
              </div>

              <span style={{ fontSize: '0.76rem', color: '#047857', fontWeight: 700 }}>
                ⚡ Auto-dispatches to on-duty fleet upon accept
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleReject}
                disabled={responding}
                style={{
                  padding: '11px 20px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #f43f5e',
                  color: '#e11d48',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <X size={16} />
                <span>Decline / Pass to Next Hospital</span>
              </button>

              <button
                type="button"
                onClick={handleAccept}
                disabled={responding}
                style={{
                  padding: '11px 26px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
                }}
              >
                <Check size={18} />
                <span>ACCEPT EMERGENCY CASE NOW</span>
              </button>
            </div>
          </div>
        )
      )}

      {/* Top Hospital Header Card */}
      <div className="card-glass" style={{
        padding: '24px 28px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '18px' }}>
          {/* Hospital Identity */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Building2 size={30} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {hospital.name}
                </h1>
                <span className="badge badge-teal" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Database size={12} />
                  <span>{hospital.id}.db</span>
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginTop: '6px',
                fontSize: '0.84rem',
                color: 'var(--text-muted)',
                flexWrap: 'wrap'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <MapPin size={14} style={{ color: 'var(--primary)' }} />
                  {hospital.address}
                </span>
                {hospital.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={14} style={{ color: 'var(--secondary)' }} />
                    {hospital.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Admin Info & Logout Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              backgroundColor: 'var(--bg-surface-soft)',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              textAlign: 'right'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                <span className={`status-indicator ${liveSocketActive ? 'active' : 'amber'}`} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {admin?.adminName || data.admin.adminName}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                ID: {admin?.adminId || data.admin.adminId}
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--danger)' }}
              title="Log out from this hospital"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Live Overview Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginTop: '22px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-light)'
        }}>
          {/* Bed Availability */}
          <div style={{
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Bed Availability</span>
              <span className="badge badge-green">Real-time</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {beds.availableBeds} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 500 }}>/ {beds.totalBeds}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {Math.round((beds.availableBeds / (beds.totalBeds || 1)) * 100)}% Available Capacity
            </div>
          </div>

          {/* ICU Beds */}
          <div style={{
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ICU Availability</span>
              <HeartPulse size={16} style={{ color: 'var(--danger)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
              {beds.icuAvailable} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 500 }}>/ {beds.icuTotal}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Critical Care Units
            </div>
          </div>

          {/* Oxygen Beds */}
          <div style={{
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Oxygen Beds</span>
              <span className="badge badge-blue">O2 Supported</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
              {beds.oxygenAvailable} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 500 }}>/ {beds.oxygenTotal}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Oxygen Supply Functional
            </div>
          </div>

          {/* Doctors On Duty */}
          <div style={{
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Doctors Available</span>
              <Stethoscope size={16} style={{ color: 'var(--secondary)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--secondary)', fontFamily: 'var(--font-mono)' }}>
              {doctors.availableDoctors} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 500 }}>/ {doctors.totalDoctors}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {doctors.emergencyDuty} ER · {doctors.opdDuty} OPD Clinics
            </div>
          </div>

          {/* Dedicated Ambulance Fleet */}
          <div style={{
            backgroundColor: 'var(--bg-surface-soft)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ambulance Fleet</span>
              <button
                type="button"
                onClick={() => { setFleetFilter('ALL'); setFleetModalOpen(true); }}
                style={{
                  backgroundColor: '#ffffff',
                  color: 'var(--primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '20px',
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
              >
                View Roster ({fleetData.counts?.total || 10})
              </button>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', fontFamily: 'var(--font-mono)' }}>
              {fleetData.counts?.onDuty || 0} <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontWeight: 500 }}>On Duty (Ready)</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#d97706', fontWeight: 600 }}>● {fleetData.counts?.onService || 0} On Service</span>
              <span style={{ color: '#64748b', fontWeight: 600 }}>● {fleetData.counts?.offDuty || 0} Off Duty</span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE ACCEPTED EMERGENCY CASES SECTION */}
      <div className="card-glass" style={{
        padding: '24px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#fee2e2',
              color: '#e11d48',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertOctagon size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Active Emergency Patient Intake Cases ({activeEmergencies.filter(e => e.status === 'ACCEPTED').length})
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Emergency patients accepted and allocated to this hospital
              </p>
            </div>
          </div>

          <button onClick={loadActiveEmergencies} className="btn btn-secondary btn-sm" title="Refresh Active Cases">
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>

        {activeEmergencies.filter(e => e.status === 'ACCEPTED').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            No active emergency patients currently accepted at this hospital.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeEmergencies.filter(e => e.status === 'ACCEPTED').map((em) => (
              <div
                key={em.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  backgroundColor: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.86rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ fontSize: '1rem', color: '#065f46' }}>{em.patient_name}</strong>
                    <span className="badge badge-green">ACCEPTED & EN ROUTE</span>
                  </div>
                  <div style={{ color: '#047857', marginTop: '4px' }}>
                    Phone: <strong>{em.phone}</strong> · Distance: <strong>{em.distance_km} km</strong>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '2px', fontSize: '0.82rem' }}>
                    Condition: <span style={{ color: '#b91c1c', fontWeight: 600 }}>{em.symptoms}</span>
                  </div>

                  {/* Allocated Ambulance Driver Information */}
                  {(() => {
                    const allotted = assignedDriversMap[em.request_id || em.id] || (em.allotted_driver_name ? {
                      name: em.allotted_driver_name,
                      phone: em.allotted_driver_phone,
                      vehiclePlate: em.allotted_vehicle_plate,
                      id: em.allotted_driver_id
                    } : null);

                    if (allotted) {
                      return (
                        <div style={{
                          marginTop: '8px',
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #86efac',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                          fontSize: '0.82rem',
                          color: '#065f46',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                        }}>
                          <span>🚑 <strong>Ambulance Allotted:</strong> {allotted.name} ({allotted.vehiclePlate})</span>
                          <span>·</span>
                          <span>📞 <strong>Contact:</strong> {allotted.phone}</span>
                          {allotted.id && (
                            <>
                              <span>·</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', backgroundColor: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', color: '#1e293b' }}>
                                ID: {allotted.id}
                              </span>
                            </>
                          )}
                          <span>·</span>
                          {(() => {
                            const currentStage = rideStagesMap[em.request_id || em.id] || em.ride_stage || 'ASSIGNED';
                            if (currentStage === 'COMPLETED') {
                              return <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>PATIENT ADMITTED</span>;
                            }
                            if (currentStage === 'PATIENT_PICKED_UP') {
                              return <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>TRANSPORTING TO ER</span>;
                            }
                            if (currentStage === 'ARRIVED_AT_PICKUP') {
                              return <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>AT PATIENT SITE</span>;
                            }
                            return <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>EN ROUTE TO PATIENT</span>;
                          })()}
                        </div>
                      );
                    }

                    return (
                      <div style={{
                        marginTop: '6px',
                        fontSize: '0.78rem',
                        color: '#047857',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Truck size={14} className="animate-pulse" />
                        <span>Dispatched to on-duty ambulance fleet · Waiting for pilot acceptance</span>
                      </div>
                    );
                  })()}
                </div>


                <div style={{ textAlign: 'right', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} />
                    <span>Accepted: {new Date(em.responded_at || em.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Grid: Bed Management & Doctor Management */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
        <BedManager
          hospitalId={hospital.id}
          adminName={admin?.adminName || data.admin.adminName}
          bedsData={beds}
          onUpdateSuccess={(newBeds) => {
            setData((prev) => ({ ...prev, beds: newBeds }));
          }}
        />

        <DoctorManager
          hospitalId={hospital.id}
          adminName={admin?.adminName || data.admin.adminName}
          doctorsData={doctors}
          onUpdateSuccess={(newDoctors) => {
            setData((prev) => ({ ...prev, doctors: newDoctors }));
          }}
        />
      </div>

      {/* Real-time Activity Logs */}
      <ActivityLog
        logs={logs}
        hospitalName={hospital.name}
        dbName={`${hospital.id}.db`}
      />

      {/* DEDICATED AMBULANCE FLEET ROSTER MODAL */}
      {fleetModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            maxWidth: '820px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)',
            border: '1.5px solid var(--border-light)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#ecfdf5',
                  color: '#059669',
                  border: '1.5px solid #a7f3d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px'
                }}>
                  🚑
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                    Ambulance Driver Roster — {hospital.name}
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Dedicated Pilots · Real-Time Availability & Automatic Dispatch
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFleetModalOpen(false)}
                style={{
                  backgroundColor: 'var(--bg-surface-soft)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Tabs & Summary Row */}
            <div style={{
              padding: '10px 20px',
              backgroundColor: 'var(--bg-surface-soft)',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setFleetFilter('ALL')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: fleetFilter === 'ALL' ? 'var(--primary)' : 'var(--border-light)',
                    backgroundColor: fleetFilter === 'ALL' ? '#eff6ff' : '#ffffff',
                    color: fleetFilter === 'ALL' ? 'var(--primary)' : 'var(--text-muted)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  All ({fleetData.counts?.total || (fleetData.drivers || []).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFleetFilter('ON_DUTY')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: fleetFilter === 'ON_DUTY' ? '#059669' : 'var(--border-light)',
                    backgroundColor: fleetFilter === 'ON_DUTY' ? '#ecfdf5' : '#ffffff',
                    color: fleetFilter === 'ON_DUTY' ? '#059669' : 'var(--text-muted)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ● On Duty ({fleetData.counts?.onDuty || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFleetFilter('ON_SERVICE')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: fleetFilter === 'ON_SERVICE' ? '#d97706' : 'var(--border-light)',
                    backgroundColor: fleetFilter === 'ON_SERVICE' ? '#fffbeb' : '#ffffff',
                    color: fleetFilter === 'ON_SERVICE' ? '#d97706' : 'var(--text-muted)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ● On Service ({fleetData.counts?.onService || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFleetFilter('OFF_DUTY')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: fleetFilter === 'OFF_DUTY' ? '#64748b' : 'var(--border-light)',
                    backgroundColor: fleetFilter === 'OFF_DUTY' ? '#f1f5f9' : '#ffffff',
                    color: fleetFilter === 'OFF_DUTY' ? '#475569' : 'var(--text-muted)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ● Off Duty ({fleetData.counts?.offDuty || 0})
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                ⚡ Auto-dispatched on emergency accept
              </div>
            </div>

            {/* Zero-Scroll Compact Table */}
            <div style={{ padding: '8px 20px 14px 20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-light)', color: 'var(--text-dim)', textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Pilot ID</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Pilot Name</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Phone</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Vehicle Plate</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700, textAlign: 'right' }}>Duty Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(fleetData.drivers || [])
                    .filter(drv => {
                      if (fleetFilter === 'ON_DUTY') return drv.duty_status === 'on_duty';
                      if (fleetFilter === 'ON_SERVICE') return drv.duty_status === 'on_service';
                      if (fleetFilter === 'OFF_DUTY') return drv.duty_status === 'off_duty';
                      return true;
                    })
                    .map((drv) => (
                      <tr
                        key={drv.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: drv.duty_status === 'on_duty' ? '#f0fdf4' : drv.duty_status === 'on_service' ? '#fffbeb' : 'transparent',
                          transition: 'background-color 0.1s ease'
                        }}
                      >
                        <td style={{ padding: '7px 6px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                          {drv.id}
                        </td>
                        <td style={{ padding: '7px 6px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {drv.name}
                        </td>
                        <td style={{ padding: '7px 6px', color: 'var(--text-muted)' }}>
                          {drv.phone}
                        </td>
                        <td style={{ padding: '7px 6px' }}>
                          <span style={{
                            backgroundColor: '#ffffff',
                            border: '1px solid var(--border-light)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: 'var(--text-main)'
                          }}>
                            {drv.vehicle_plate}
                          </span>
                        </td>
                        <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                          {drv.duty_status === 'on_duty' ? (
                            <span className="badge badge-green" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                              ● On Duty
                            </span>
                          ) : drv.duty_status === 'on_service' ? (
                            <span className="badge badge-amber" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                              ● On Service
                            </span>
                          ) : (
                            <span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#64748b', fontSize: '0.72rem', padding: '2px 8px' }}>
                              ● Off Duty
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {(!fleetData.drivers || fleetData.drivers.length === 0) && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  No drivers matching this filter.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--border-light)',
              backgroundColor: 'var(--bg-surface-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Showing {(fleetData.drivers || []).filter(drv => {
                  if (fleetFilter === 'ON_DUTY') return drv.duty_status === 'on_duty';
                  if (fleetFilter === 'ON_SERVICE') return drv.duty_status === 'on_service';
                  if (fleetFilter === 'OFF_DUTY') return drv.duty_status === 'off_duty';
                  return true;
                }).length} of {(fleetData.drivers || []).length} drivers
              </span>
              <button
                type="button"
                onClick={() => setFleetModalOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '5px 14px', fontSize: '0.78rem' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
