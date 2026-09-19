import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, MapPin, Phone, CheckCircle2, Navigation, AlertCircle, Building2, User, Activity, Clock, ShieldCheck, HeartPulse, ChevronRight, Radio } from 'lucide-react';
import { updateAmbulanceRideStage, completeAmbulanceRide, updateAmbulanceLocation } from '../../services/api';
import { getSocket } from '../../services/socket';

export default function AmbulanceActiveRide({
  driver,
  hospital,
  ride,
  onRideCompleted
}) {
  // Stages: 'ASSIGNED' | 'EN_ROUTE_PICKUP' | 'PATIENT_PICKED_UP' | 'COMPLETED'
  const [stage, setStage] = useState(ride.status || 'EN_ROUTE_PICKUP');
  const [updating, setUpdating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(15);

  // Dynamic driver location along the trip
  const [driverPos, setDriverPos] = useState({
    lat: driver.currentLat || hospital.lat || 28.5355,
    lng: driver.currentLng || hospital.lng || 77.2874
  });

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const polylineRef = useRef(null);

  const patientName = ride.patientName || ride.patient_name || 'Emergency Patient';
  const patientPhone = ride.patientPhone || ride.patient_phone || ride.phone || '911-000-0000';
  const patientAddress = ride.patientAddress || ride.patient_address || ride.address || 'GPS Pickup Location';
  const symptoms = ride.symptoms || ride.reported_symptoms || 'Acute Medical Emergency';
  const rideId = ride.requestId || ride.request_id || ride.id || 'EMERGENCY-TRIP';

  const patientLat = ride.patientLat || ride.patient_lat || 28.6139;
  const patientLng = ride.patientLng || ride.patient_lng || 77.2090;
  const hospitalLat = hospital.lat || 28.5355;
  const hospitalLng = hospital.lng || 77.2874;

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [patientLat, patientLng],
        zoom: 13,
        zoomControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Patient Marker
      const patientIcon = L.divIcon({
        className: 'patient-icon',
        html: `
          <div style="text-align: center;">
            <div style="background: #dc2626; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.25);">
              🚨
            </div>
            <div style="background: #991b1b; color: white; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-top: 2px; white-space: nowrap;">
              PICKUP
            </div>
          </div>
        `,
        iconSize: [38, 52],
        iconAnchor: [19, 26]
      });
      L.marker([patientLat, patientLng], { icon: patientIcon }).addTo(map);

      // Hospital Marker
      const hospIcon = L.divIcon({
        className: 'hosp-icon',
        html: `
          <div style="text-align: center;">
            <div style="background: #0284c7; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.25);">
              🏥
            </div>
            <div style="background: #0369a1; color: white; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-top: 2px; white-space: nowrap;">
              BASE
            </div>
          </div>
        `,
        iconSize: [38, 52],
        iconAnchor: [19, 26]
      });
      L.marker([hospitalLat, hospitalLng], { icon: hospIcon }).addTo(map);

      // Ambulance Marker
      const ambIcon = L.divIcon({
        className: 'amb-active-icon',
        html: `
          <div style="background: #059669; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 3px solid white; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.45); animation: pulseSubtle 1.8s infinite;">
            🚑
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
      const ambMarker = L.marker([driverPos.lat, driverPos.lng], { icon: ambIcon }).addTo(map);
      ambulanceMarkerRef.current = ambMarker;

      // Draw route polyline
      const line = L.polyline([[driverPos.lat, driverPos.lng], [patientLat, patientLng]], {
        color: '#0284c7',
        weight: 5,
        dashArray: '8, 8',
        opacity: 0.85
      }).addTo(map);
      polylineRef.current = line;

      mapInstanceRef.current = map;
      map.fitBounds([[driverPos.lat, driverPos.lng], [patientLat, patientLng], [hospitalLat, hospitalLng]], {
        padding: [50, 50]
      });
    }
  }, []);

  // Real-Time GPS Simulation ticker (moves ambulance progressively and streams to user & admin)
  useEffect(() => {
    if (stage === 'COMPLETED') return;

    let step = 0;
    const totalSteps = 40;

    const interval = setInterval(() => {
      step += 1;
      let startLat, startLng, targetLat, targetLng;

      if (stage === 'ASSIGNED' || stage === 'EN_ROUTE_PICKUP') {
        startLat = hospitalLat;
        startLng = hospitalLng;
        targetLat = patientLat;
        targetLng = patientLng;
      } else {
        startLat = patientLat;
        startLng = patientLng;
        targetLat = hospitalLat;
        targetLng = hospitalLng;
      }

      const fraction = Math.min(1, step / totalSteps);
      const currentLat = startLat + (targetLat - startLat) * fraction;
      const currentLng = startLng + (targetLng - startLng) * fraction;

      setDriverPos({ lat: currentLat, lng: currentLng });
      setProgressPercent(Math.round(fraction * 100));

      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.setLatLng([currentLat, currentLng]);
      }

      if (polylineRef.current) {
        polylineRef.current.setLatLngs([[currentLat, currentLng], [targetLat, targetLng]]);
      }

      // Stream location via REST & Socket.IO
      updateAmbulanceLocation(driver.hospitalId, driver.id, currentLat, currentLng, rideId);

      const socket = getSocket();
      socket.emit('driver_ping_location', {
        hospitalId: driver.hospitalId,
        driverId: driver.id,
        requestId: rideId,
        lat: currentLat,
        lng: currentLng
      });

      if (fraction >= 1) {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [stage, patientLat, patientLng, hospitalLat, hospitalLng, rideId]);

  // Helper to persist updated stage in localStorage
  const updateSavedRideStage = (newStage) => {
    try {
      const saved = localStorage.getItem('smartcare_ambulance_active_ride');
      if (saved) {
        const obj = JSON.parse(saved);
        obj.status = newStage;
        localStorage.setItem('smartcare_ambulance_active_ride', JSON.stringify(obj));
      }
    } catch (_) {}
  };

  // Stage 1 -> Stage 2: Arrived at Patient Pickup Site (Rapido Step 1)
  const handleArrivedAtPickup = async () => {
    setUpdating(true);
    try {
      const res = await updateAmbulanceRideStage(driver.hospitalId, driver.id, rideId, 'ARRIVED_AT_PICKUP');
      if (res.success) {
        setStage('ARRIVED_AT_PICKUP');
        updateSavedRideStage('ARRIVED_AT_PICKUP');
      } else {
        alert(res.error || 'Failed to update ride stage.');
      }
    } catch (err) {
      alert(err.message || 'Error updating stage.');
    } finally {
      setUpdating(false);
    }
  };

  // Stage 2 -> Stage 3: Patient Picked Up / Onboard (Rapido Step 2)
  const handlePatientPickedUp = async () => {
    setUpdating(true);
    try {
      const res = await updateAmbulanceRideStage(driver.hospitalId, driver.id, rideId, 'PATIENT_PICKED_UP');
      if (res.success) {
        setStage('PATIENT_PICKED_UP');
        updateSavedRideStage('PATIENT_PICKED_UP');
        // Update polyline from patient to hospital
        if (polylineRef.current) {
          polylineRef.current.setLatLngs([[patientLat, patientLng], [hospitalLat, hospitalLng]]);
        }
      } else {
        alert(res.error || 'Failed to update ride stage.');
      }
    } catch (err) {
      alert(err.message || 'Error updating stage.');
    } finally {
      setUpdating(false);
    }
  };

  // Stage 3 -> Stage 4: Arrived at Hospital & Admitted (Rapido Step 3)
  const handleCompleteRide = async () => {
    setUpdating(true);
    try {
      const res = await completeAmbulanceRide(driver.hospitalId, driver.id, rideId);
      if (res.success) {
        setStage('COMPLETED');
        updateSavedRideStage('COMPLETED');
      } else {
        alert(res.error || 'Failed to complete ride.');
      }
    } catch (err) {
      alert(err.message || 'Error completing ride.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{
      maxWidth: '880px',
      margin: '0 auto',
      backgroundColor: '#ffffff',
      borderRadius: 'var(--radius-xl)',
      border: '1.5px solid var(--border-light)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }}>
      {/* RAPIDO CAPTAIN TOP TELEMETRY BAR */}
      <div style={{
        padding: '16px 22px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Captain Vehicle Badge */}
          <div style={{
            backgroundColor: '#fef08a',
            border: '2px solid #ca8a04',
            borderRadius: '8px',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Truck size={18} style={{ color: '#854d0e' }} />
            <strong style={{ fontSize: '0.88rem', color: '#713f12', fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>
              {driver.vehiclePlate}
            </strong>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Pilot {driver.name}
              </span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: stage === 'COMPLETED' ? '#ecfdf5' : stage === 'PATIENT_PICKED_UP' ? '#eff6ff' : '#fffbeb',
                color: stage === 'COMPLETED' ? '#059669' : stage === 'PATIENT_PICKED_UP' ? '#0284c7' : '#d97706',
                border: `1px solid ${stage === 'COMPLETED' ? '#a7f3d0' : stage === 'PATIENT_PICKED_UP' ? '#bfdbfe' : '#fde68a'}`
              }}>
                {stage === 'COMPLETED'
                  ? '● TRIP COMPLETED'
                  : stage === 'PATIENT_PICKED_UP'
                  ? '● TRANSPORTING TO BASE'
                  : stage === 'ARRIVED_AT_PICKUP'
                  ? '● AT PICKUP LOCATION'
                  : '● REACHING PICKUP'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Emergency ID: #{rideId.slice(0, 8)} · Base: {hospital.name}
            </div>
          </div>
        </div>

        {/* Call Patient Direct Quick Dial */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href={`tel:${patientPhone}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#059669',
              color: '#ffffff',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: '24px',
              fontSize: '0.84rem',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            <Phone size={15} />
            <span>Call Patient ({patientPhone})</span>
          </a>
        </div>
      </div>

      {/* RAPIDO CAPTAIN 4-STEP JOURNEY TRACKER */}
      <div style={{
        padding: '10px 20px',
        backgroundColor: 'var(--bg-surface-soft)',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div style={{
          padding: '7px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: stage === 'ASSIGNED' || stage === 'EN_ROUTE_PICKUP' ? '#ffffff' : 'transparent',
          border: `1.5px solid ${stage === 'ASSIGNED' || stage === 'EN_ROUTE_PICKUP' ? 'var(--primary)' : 'transparent'}`,
          fontSize: '0.73rem',
          fontWeight: 800,
          color: stage === 'ASSIGNED' || stage === 'EN_ROUTE_PICKUP' ? 'var(--primary)' : 'var(--text-dim)',
          textAlign: 'center'
        }}>
          1. Reaching Pickup
        </div>
        <div style={{
          padding: '7px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: stage === 'ARRIVED_AT_PICKUP' ? '#ffffff' : 'transparent',
          border: `1.5px solid ${stage === 'ARRIVED_AT_PICKUP' ? '#d97706' : 'transparent'}`,
          fontSize: '0.73rem',
          fontWeight: 800,
          color: stage === 'ARRIVED_AT_PICKUP' ? '#d97706' : 'var(--text-dim)',
          textAlign: 'center'
        }}>
          2. At Location
        </div>
        <div style={{
          padding: '7px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: stage === 'PATIENT_PICKED_UP' ? '#ffffff' : 'transparent',
          border: `1.5px solid ${stage === 'PATIENT_PICKED_UP' ? '#0284c7' : 'transparent'}`,
          fontSize: '0.73rem',
          fontWeight: 800,
          color: stage === 'PATIENT_PICKED_UP' ? '#0284c7' : 'var(--text-dim)',
          textAlign: 'center'
        }}>
          3. Patient Onboard
        </div>
        <div style={{
          padding: '7px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: stage === 'COMPLETED' ? '#ffffff' : 'transparent',
          border: `1.5px solid ${stage === 'COMPLETED' ? '#059669' : 'transparent'}`,
          fontSize: '0.73rem',
          fontWeight: 800,
          color: stage === 'COMPLETED' ? '#059669' : 'var(--text-dim)',
          textAlign: 'center'
        }}>
          4. Admitted to Base
        </div>
      </div>

      {/* FULL INTERACTIVE CAPTAIN NAVIGATION MAP */}
      <div style={{ position: 'relative', height: '360px', width: '100%', backgroundColor: '#f1f5f9' }}>
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />

        {/* Floating Route Guidance Pill (Rapido Style) */}
        <div style={{
          position: 'absolute',
          top: '14px',
          left: '14px',
          zIndex: 1000,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(4px)',
          border: '1.5px solid var(--border-light)',
          borderRadius: '24px',
          padding: '8px 16px',
          fontSize: '0.8rem',
          color: 'var(--text-main)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <Navigation size={15} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span>
            {stage === 'PATIENT_PICKED_UP'
              ? `Transporting to ${hospital.name} Emergency Ward (${progressPercent}%)`
              : `Navigating to patient pickup site (${progressPercent}%)`}
          </span>
        </div>

        {/* GPS Live Stream Tag */}
        <div style={{
          position: 'absolute',
          bottom: '14px',
          right: '14px',
          zIndex: 1000,
          backgroundColor: '#059669',
          color: '#ffffff',
          borderRadius: '20px',
          padding: '4px 12px',
          fontSize: '0.74rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          <Radio size={12} className="animate-pulse" />
          <span>Live GPS Telemetry</span>
        </div>
      </div>

      {/* BOTTOM SHEET: RAPIDO CAPTAIN PASSENGER & TRIP DETAILS */}
      <div style={{ padding: '20px 22px' }}>
        {stage !== 'COMPLETED' ? (
          <>
            {/* Passenger Info & Condition Box */}
            <div style={{
              backgroundColor: 'var(--bg-surface-soft)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 18px',
              marginBottom: '16px',
              border: '1.5px solid var(--border-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    border: '1.5px solid #fca5a5'
                  }}>
                    <User size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {patientName}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Phone: <strong style={{ color: 'var(--primary)' }}>{patientPhone}</strong>
                    </div>
                  </div>
                </div>

                <a
                  href={`tel:${patientPhone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  <Phone size={15} />
                  <span>Call Patient</span>
                </a>
              </div>

              {/* Reported Disease / Symptoms Badge */}
              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                padding: '9px 13px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '14px'
              }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  CHIEF MEDICAL COMPLAINT / REPORTED SYMPTOMS
                </span>
                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#b91c1c', marginTop: '2px' }}>
                  🚨 {symptoms}
                </div>
              </div>

              {/* Route Itinerary (Rapido Pick & Drop style) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#059669', marginTop: '5px', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.84rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>PICKUP POINT</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{patientAddress}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#0284c7', marginTop: '5px', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.84rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>DESTINATION HOSPITAL BASE</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{hospital.name} Emergency Trauma Center</div>
                  </div>
                </div>
              </div>
            </div>

            {/* RAPIDO CAPTAIN TACTILE ACTION BUTTON */}
            {stage === 'ASSIGNED' || stage === 'EN_ROUTE_PICKUP' ? (
              <div>
                <button
                  type="button"
                  onClick={handleArrivedAtPickup}
                  disabled={updating}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    cursor: updating ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <MapPin size={20} />
                  <span>{updating ? 'Updating Stage...' : '1. ARRIVED AT PICKUP LOCATION'}</span>
                </button>
              </div>
            ) : stage === 'ARRIVED_AT_PICKUP' ? (
              <div>
                <button
                  type="button"
                  onClick={handlePatientPickedUp}
                  disabled={updating}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    cursor: updating ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CheckCircle2 size={20} />
                  <span>{updating ? 'Starting Transport...' : '2. PATIENT ON BOARD — START TRIP TO HOSPITAL'}</span>
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={handleCompleteRide}
                  disabled={updating}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '1.02rem',
                    fontWeight: 800,
                    cursor: updating ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CheckCircle2 size={20} />
                  <span>{updating ? 'Admitting Patient...' : '3. ARRIVED AT HOSPITAL — ADMIT PATIENT & COMPLETE TRIP'}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          /* STAGE 4: COMPLETED VIEW */
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              Patient Safely Admitted to Hospital!
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px auto' }}>
              Patient <strong>{patientName}</strong> has been safely transferred to {hospital.name} triage. Your system status has automatically reverted to <strong>ON DUTY (AVAILABLE)</strong>.
            </p>

            <button
              type="button"
              onClick={onRideCompleted}
              className="btn btn-primary"
              style={{
                padding: '12px 28px',
                fontSize: '0.95rem',
                fontWeight: 800
              }}
            >
              Return to Driver Cockpit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
