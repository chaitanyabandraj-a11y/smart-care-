import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Power, MapPin, Phone, AlertOctagon, Clock, ShieldCheck, User, CheckCircle2, XCircle, Navigation, Radio, Compass, AlertTriangle, LogOut, ArrowRight, HeartPulse, Building2 } from 'lucide-react';
import { updateAmbulanceDuty, acceptAmbulanceRide, updateAmbulanceLocation } from '../../services/api';

// Custom Ambulance Marker for Leaflet
function createAmbulanceIcon(isDuty) {
  return L.divIcon({
    className: 'custom-ambulance-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: ${isDuty ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)'};
          animation: ${isDuty ? 'pulseSubtle 1.8s infinite ease-in-out' : 'none'};
        "></div>
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: ${isDuty ? '#059669' : '#64748b'};
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
          border: 2.5px solid #ffffff;
          font-size: 16px;
        ">
          🚑
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
}

function createHospitalIcon() {
  return L.divIcon({
    className: 'custom-hospital-marker',
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: #0284c7;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 17px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.2);
        border: 2px solid #ffffff;
      ">
        🏥
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

export default function AmbulanceCockpit({
  driver,
  hospital,
  dutyStatus,
  onDutyChange,
  incomingAlert,
  onAcceptAlert,
  onDismissAlert,
  onLogout
}) {
  const [updatingDuty, setUpdatingDuty] = useState(false);
  const [alertSecondsLeft, setAlertSecondsLeft] = useState(45);
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [currentCoords, setCurrentCoords] = useState({
    lat: driver.currentLat || hospital.lat || 28.6139,
    lng: driver.currentLng || hospital.lng || 77.2090
  });

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);

  // Leaflet Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentCoords.lat, currentCoords.lng],
        zoom: 14,
        zoomControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Hospital Base Marker
      if (hospital.lat && hospital.lng) {
        L.marker([hospital.lat, hospital.lng], { icon: createHospitalIcon() })
          .addTo(map)
          .bindPopup(`<b>${hospital.name}</b><br/>Emergency Base Station`);
      }

      // Ambulance Driver Marker
      const marker = L.marker([currentCoords.lat, currentCoords.lng], {
        icon: createAmbulanceIcon(dutyStatus === 'on_duty')
      }).addTo(map);

      marker.bindPopup(`<b>${driver.name}</b><br/>Plate: ${driver.vehiclePlate}<br/>Status: ${dutyStatus.toUpperCase()}`);
      driverMarkerRef.current = marker;
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([currentCoords.lat, currentCoords.lng]);
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([currentCoords.lat, currentCoords.lng]);
        driverMarkerRef.current.setIcon(createAmbulanceIcon(dutyStatus === 'on_duty'));
      }
    }
  }, [currentCoords.lat, currentCoords.lng, dutyStatus, hospital]);

  // Alert Countdown Timer
  useEffect(() => {
    if (!incomingAlert) return;
    setAlertSecondsLeft(45);

    const timer = setInterval(() => {
      setAlertSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismissAlert();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [incomingAlert?.requestId]);

  // Toggle Duty
  const handleToggleDuty = async () => {
    if (dutyStatus === 'on_service') {
      alert('Cannot change duty status while you are actively on an emergency ride.');
      return;
    }

    const nextStatus = dutyStatus === 'on_duty' ? 'off_duty' : 'on_duty';
    setUpdatingDuty(true);
    try {
      const res = await updateAmbulanceDuty(driver.hospitalId, driver.id, nextStatus);
      if (res.success) {
        onDutyChange(nextStatus);
      } else {
        alert(res.error || 'Failed to update duty status.');
      }
    } catch (err) {
      alert(err.message || 'Error updating duty status.');
    } finally {
      setUpdatingDuty(false);
    }
  };

  // Accept Ride Click
  const handleAcceptClick = async () => {
    if (!incomingAlert) return;
    setAcceptingRide(true);
    try {
      const res = await acceptAmbulanceRide(driver.hospitalId, driver.id, incomingAlert.requestId);
      if (res.success) {
        onAcceptAlert(res.ride);
      } else if (res.alreadyAllotted) {
        alert(res.error || 'This emergency ride has already been accepted by another driver.');
        onDismissAlert(incomingAlert.requestId);
      } else {
        alert(res.error || 'Failed to accept ride.');
      }
    } catch (err) {
      alert(err.message || 'Error accepting ride.');
    } finally {
      setAcceptingRide(false);
    }
  };

  const isOnDuty = dutyStatus === 'on_duty';

  return (
    <div style={{
      maxWidth: '860px',
      margin: '0 auto',
      backgroundColor: '#ffffff',
      borderRadius: 'var(--radius-xl)',
      border: '1.5px solid var(--border-light)',
      boxShadow: 'var(--shadow-md)',
      overflow: 'hidden'
    }}>
      {/* Driver Cockpit Header */}
      <div style={{
        padding: '20px 24px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: isOnDuty ? '#ecfdf5' : '#f1f5f9',
            color: isOnDuty ? '#059669' : '#64748b',
            border: `1.5px solid ${isOnDuty ? '#a7f3d0' : '#cbd5e1'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            🚑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                {driver.name}
              </h3>
              <span className="badge badge-teal" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                {driver.id}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Vehicle: <strong style={{ color: 'var(--text-main)' }}>{driver.vehiclePlate}</strong></span>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={13} style={{ color: 'var(--primary)' }} /> {hospital.name}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={onLogout}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--danger)' }}
            title="Sign out from driver session"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* TACTILE PERSONAL DUTY SWITCH (NO FLEET-WIDE STAT BOXES) */}
      <div style={{
        padding: '20px 24px',
        backgroundColor: 'var(--bg-surface-soft)',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          backgroundColor: isOnDuty ? '#ffffff' : '#ffffff',
          border: `1.5px solid ${isOnDuty ? '#86efac' : '#cbd5e1'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          boxShadow: isOnDuty ? '0 2px 8px rgba(16, 185, 129, 0.12)' : 'var(--shadow-sm)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isOnDuty ? '#10b981' : dutyStatus === 'on_service' ? '#f59e0b' : '#94a3b8',
                boxShadow: isOnDuty ? '0 0 8px #10b981' : 'none'
              }} />
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: isOnDuty ? '#059669' : dutyStatus === 'on_service' ? '#d97706' : '#64748b'
              }}>
                {isOnDuty
                  ? 'ON DUTY (AVAILABLE FOR EMERGENCY DISPATCH)'
                  : dutyStatus === 'on_service'
                  ? 'ON SERVICE (CURRENTLY HANDLING EMERGENCY)'
                  : 'OFF DUTY (OFFLINE)'}
              </span>
            </div>
            <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              {isOnDuty
                ? 'Your ambulance is active. You will immediately receive incoming emergency dispatches from hospital admin.'
                : dutyStatus === 'on_service'
                ? 'Active emergency ride in progress. Arrive at hospital and complete ride to return to On Duty.'
                : 'Turn ON your duty switch to start receiving emergency dispatches from your hospital admin.'}
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleDuty}
            disabled={updatingDuty || dutyStatus === 'on_service'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 22px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: isOnDuty ? '#dc2626' : '#059669',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: dutyStatus === 'on_service' ? 'not-allowed' : 'pointer',
              boxShadow: isOnDuty ? '0 3px 10px rgba(220, 38, 38, 0.25)' : '0 3px 10px rgba(5, 150, 105, 0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            <Power size={17} />
            <span>
              {updatingDuty
                ? 'Updating...'
                : isOnDuty
                ? 'Go Off Duty'
                : 'Go On Duty'}
            </span>
          </button>
        </div>
      </div>

      {/* Interactive Map View */}
      <div style={{ position: 'relative', height: '380px', width: '100%', backgroundColor: '#f1f5f9' }}>
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 1000,
          backgroundColor: '#ffffff',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 14px',
          fontSize: '0.78rem',
          color: 'var(--text-main)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <Radio size={14} style={{ color: isOnDuty ? '#059669' : '#64748b', animation: isOnDuty ? 'pulse 1.5s infinite' : 'none' }} />
          <span>
            <strong>GPS Live:</strong> {currentCoords.lat.toFixed(4)}° N, {currentCoords.lng.toFixed(4)}° E
          </span>
        </div>
      </div>

      {/* INCOMING EMERGENCY RIDE ALERT MODAL */}
      {incomingAlert && (
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
            maxWidth: '500px',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '2px solid #ef4444',
            borderRadius: 'var(--radius-xl)',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(239, 68, 68, 0.25)',
            animation: 'pulseSubtle 1.8s infinite'
          }}>
            {/* Header Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              borderBottom: '1px solid var(--border-light)',
              paddingBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <AlertOctagon size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    Incoming Emergency Dispatch
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700 }}>
                    {incomingAlert.isFallback
                      ? '⚠️ PRIORITY FALLBACK DISPATCH (STANDBY / ON-SERVICE)'
                      : '⚡ HIGH-PRIORITY FIRST RESPONDER DISPATCH'}
                  </div>
                </div>
              </div>

              {/* Countdown badge */}
              <div style={{
                backgroundColor: alertSecondsLeft <= 10 ? '#fee2e2' : '#fef3c7',
                color: alertSecondsLeft <= 10 ? '#b91c1c' : '#b45309',
                border: `1px solid ${alertSecondsLeft <= 10 ? '#fca5a5' : '#fde68a'}`,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 800,
                fontSize: '0.95rem',
                fontFamily: 'var(--font-mono)'
              }}>
                {alertSecondsLeft}s left
              </div>
            </div>

            {/* Patient & Condition Details */}
            <div style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              marginBottom: '18px',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>PATIENT NAME</span>
                  <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {incomingAlert.patientName || incomingAlert.patient_name || 'Emergency Patient'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>CONTACT</span>
                  <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {incomingAlert.phone || incomingAlert.patientPhone || incomingAlert.patient_phone || 'N/A'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>REPORTED SYMPTOMS / DISEASE</span>
                <div style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#b91c1c',
                  backgroundColor: '#fee2e2',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  marginTop: '2px'
                }}>
                  {incomingAlert.symptoms || 'Critical Medical Emergency'}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <MapPin size={16} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>PICKUP LOCATION</span>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', fontWeight: 600 }}>
                      {incomingAlert.patientAddress || 'GPS Patient Coordinates'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <Building2 size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>DESTINATION HOSPITAL</span>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', fontWeight: 600 }}>
                      {incomingAlert.hospitalName} ({incomingAlert.distanceKm} km away)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleAcceptClick}
                disabled={acceptingRide}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1rem',
                  fontWeight: 800,
                  cursor: acceptingRide ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <CheckCircle2 size={20} />
                <span>{acceptingRide ? 'Allotting Ride...' : 'ACCEPT EMERGENCY RIDE'}</span>
              </button>

              <button
                type="button"
                onClick={() => onDismissAlert(incomingAlert.requestId)}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', padding: '10px', fontWeight: 600, borderRadius: 'var(--radius-md)' }}
              >
                Decline (Pass to other available fleet drivers)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
