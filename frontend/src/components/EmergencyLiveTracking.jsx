import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ShieldCheck, AlertCircle, Clock, CheckCircle2, Building2, MapPin, Phone, RefreshCw, AlertTriangle, ArrowLeft, AlertOctagon, Truck, Navigation, User, Radio, ArrowRight } from 'lucide-react';
import { getSocket } from '../services/socket';
import { fetchEmergencyRequest } from '../services/api';

export default function EmergencyLiveTracking({ initialRequest, onNewEmergency, onRideCompleted }) {
  const [request, setRequest] = useState(initialRequest);
  const [remainingSeconds, setRemainingSeconds] = useState(120);
  const [isAccepted, setIsAccepted] = useState(initialRequest.status === 'ACCEPTED');
  const [acceptedData, setAcceptedData] = useState(
    initialRequest.status === 'ACCEPTED'
      ? (initialRequest.hospital_queue?.find(h => h.id === initialRequest.accepted_hospital_id) || null)
      : null
  );

  const requestId = initialRequest.id;

  // Allocated Ambulance Driver Details & Live GPS
  const [assignedDriver, setAssignedDriver] = useState(
    initialRequest.allotted_driver_name ? {
      id: initialRequest.allotted_driver_id,
      name: initialRequest.allotted_driver_name,
      phone: initialRequest.allotted_driver_phone,
      vehiclePlate: initialRequest.allotted_vehicle_plate
    } : null
  );
  const [rideStage, setRideStage] = useState(initialRequest.ride_stage || 'ASSIGNED');
  const [completionCountdown, setCompletionCountdown] = useState(6);
  const [driverLocation, setDriverLocation] = useState(
    initialRequest.driver_lat && initialRequest.driver_lng ? {
      lat: initialRequest.driver_lat,
      lng: initialRequest.driver_lng
    } : null
  );

  const trackingMapContainerRef = useRef(null);
  const trackingMapInstanceRef = useRef(null);
  const trackingAmbMarkerRef = useRef(null);
  const trackingPolylineRef = useRef(null);

  const handleFinishAndExit = () => {
    if (onRideCompleted) {
      onRideCompleted();
    } else if (onNewEmergency) {
      onNewEmergency();
    }
  };

  // Auto-redirect countdown when ride is marked COMPLETED
  useEffect(() => {
    if (rideStage !== 'COMPLETED') return;

    setCompletionCountdown(6);
    const timer = setInterval(() => {
      setCompletionCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinishAndExit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rideStage]);

  // Socket.IO Room Joining and Live Status Listener
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join_emergency', requestId);

    const onStatusUpdate = (payload) => {
      if (payload.requestId === requestId) {
        setRequest((prev) => ({
          ...prev,
          status: payload.status,
          current_hospital_index: payload.currentHospitalIndex ?? prev.current_hospital_index,
          current_hospital_id: payload.currentHospital?.id ?? prev.current_hospital_id,
          step_started_at: payload.stepStartedAt ?? prev.step_started_at,
          step_expires_at: payload.stepExpiresAt ?? prev.step_expires_at
        }));

        if (payload.stepExpiresAt) {
          const diff = Math.max(0, Math.floor((new Date(payload.stepExpiresAt).getTime() - Date.now()) / 1000));
          setRemainingSeconds(diff);
        }
      }
    };

    const onAccepted = (payload) => {
      if (payload.requestId === requestId) {
        setIsAccepted(true);
        setAcceptedData(payload.acceptedHospital);
        setRequest((prev) => ({
          ...prev,
          status: 'ACCEPTED',
          accepted_hospital_id: payload.acceptedHospital.id,
          accepted_at: payload.acceptedAt
        }));
      }
    };

    // Driver Allotment & GPS Location Stream Listeners
    const onDriverAssigned = (payload) => {
      if (payload.requestId === requestId) {
        setAssignedDriver(payload.driver);
        setRideStage(payload.status || 'ASSIGNED');
        if (payload.driver?.currentLat && payload.driver?.currentLng) {
          setDriverLocation({ lat: payload.driver.currentLat, lng: payload.driver.currentLng });
        }
      }
    };

    const onLocationUpdate = (payload) => {
      if (payload.requestId === requestId || !payload.requestId) {
        setDriverLocation({ lat: payload.lat, lng: payload.lng });
      }
    };

    const onStageUpdate = (payload) => {
      if (payload.requestId === requestId) {
        setRideStage(payload.stage);
      }
    };

    const onRideCompleted = (payload) => {
      if (payload.requestId === requestId) {
        setRideStage('COMPLETED');
      }
    };

    socket.on('emergency:status_update', onStatusUpdate);
    socket.on('emergency:accepted', onAccepted);
    socket.on('ambulance:driver_assigned', onDriverAssigned);
    socket.on('ambulance:location_update', onLocationUpdate);
    socket.on('ambulance:stage_update', onStageUpdate);
    socket.on('ambulance:ride_completed', onRideCompleted);

    return () => {
      socket.emit('leave_emergency', requestId);
      socket.off('emergency:status_update', onStatusUpdate);
      socket.off('emergency:accepted', onAccepted);
      socket.off('ambulance:driver_assigned', onDriverAssigned);
      socket.off('ambulance:location_update', onLocationUpdate);
      socket.off('ambulance:stage_update', onStageUpdate);
      socket.off('ambulance:ride_completed', onRideCompleted);
    };
  }, [requestId]);

  // Real-time Countdown Timer (2 minutes)
  useEffect(() => {
    if (isAccepted || request.status !== 'ROUTING') return;

    const tick = () => {
      if (request.step_expires_at) {
        const diff = Math.max(0, Math.floor((new Date(request.step_expires_at).getTime() - Date.now()) / 1000));
        setRemainingSeconds(diff);
        if (diff <= 0) {
          // Immediately fetch status to trigger backend auto-advance to next hospital
          fetchEmergencyRequest(requestId).then((res) => {
            if (res?.success && res.request) {
              const req = res.request;
              setRequest(req);
              if (req.status === 'ACCEPTED') {
                setIsAccepted(true);
                setAcceptedData(req.hospital_queue?.find(h => h.id === req.accepted_hospital_id) || null);
              }
            }
          }).catch(() => {});
        }
      } else {
        setRemainingSeconds((prev) => Math.max(0, prev - 1));
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [request.step_expires_at, isAccepted, request.status, requestId]);

  // Guaranteed Periodic Polling (every 2.5s) to guarantee UI sync even if socket disconnects or tabs switch
  useEffect(() => {
    if (rideStage === 'COMPLETED' || request.status === 'EXHAUSTED') return;

    const poll = async () => {
      try {
        const res = await fetchEmergencyRequest(requestId);
        if (res?.success && res.request) {
          const req = res.request;
          setRequest(req);
          if (req.status === 'ACCEPTED') {
            setIsAccepted(true);
            setAcceptedData(req.hospital_queue?.find(h => h.id === req.accepted_hospital_id) || null);
            if (req.allotted_driver_name) {
              setAssignedDriver({
                id: req.allotted_driver_id,
                name: req.allotted_driver_name,
                phone: req.allotted_driver_phone,
                vehiclePlate: req.allotted_vehicle_plate
              });
            }
            if (req.ride_stage) setRideStage(req.ride_stage);
            if (req.driver_lat && req.driver_lng) {
              setDriverLocation({ lat: req.driver_lat, lng: req.driver_lng });
            }
          } else if (req.step_expires_at) {
            const diff = Math.max(0, Math.floor((new Date(req.step_expires_at).getTime() - Date.now()) / 1000));
            setRemainingSeconds(diff);
          }
        }
      } catch (_) {}
    };

    const interval = setInterval(poll, 2500);
    return () => clearInterval(interval);
  }, [requestId, rideStage, request.status]);

  // Leaflet Live Ambulance GPS Tracking Map
  useEffect(() => {
    if (!isAccepted || !trackingMapContainerRef.current) return;

    const pLat = request.patient_lat || 28.6139;
    const pLng = request.patient_lng || 77.2090;
    const dLat = driverLocation?.lat || acceptedData?.lat || pLat + 0.01;
    const dLng = driverLocation?.lng || acceptedData?.lng || pLng + 0.01;

    if (!trackingMapInstanceRef.current) {
      const map = L.map(trackingMapContainerRef.current, {
        center: [pLat, pLng],
        zoom: 14,
        zoomControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Patient Pin
      const pIcon = L.divIcon({
        className: 'patient-pin',
        html: `
          <div style="background: #dc2626; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
            🚨
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      L.marker([pLat, pLng], { icon: pIcon }).addTo(map).bindPopup('<b>Your Location</b><br/>Emergency Pickup Point');

      // Ambulance Pin
      const aIcon = L.divIcon({
        className: 'amb-pin',
        html: `
          <div style="background: #10b981; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid white; box-shadow: 0 4px 12px rgba(16,185,129,0.5); animation: pulseSubtle 1.8s infinite;">
            🚑
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
      const ambMarker = L.marker([dLat, dLng], { icon: aIcon }).addTo(map);
      trackingAmbMarkerRef.current = ambMarker;

      const poly = L.polyline([[dLat, dLng], [pLat, pLng]], {
        color: '#10b981',
        weight: 4,
        dashArray: '6, 6'
      }).addTo(map);
      trackingPolylineRef.current = poly;

      trackingMapInstanceRef.current = map;
      map.fitBounds([[dLat, dLng], [pLat, pLng]], { padding: [40, 40] });
    } else {
      if (trackingAmbMarkerRef.current && driverLocation) {
        trackingAmbMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      }
      if (trackingPolylineRef.current && driverLocation) {
        trackingPolylineRef.current.setLatLngs([[driverLocation.lat, driverLocation.lng], [pLat, pLng]]);
      }
    }
  }, [isAccepted, driverLocation?.lat, driverLocation?.lng, request.patient_lat, request.patient_lng]);

  const currentHospital = (request.hospital_queue && request.hospital_queue[request.current_hospital_index]) || (request.hospital_queue && request.hospital_queue[0]) || { name: 'Hospital', address: 'Nearest Emergency Care', distanceKm: 1 };
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={rideStage === 'COMPLETED' ? handleFinishAndExit : onNewEmergency}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={14} />
          <span>{rideStage === 'COMPLETED' ? 'Back to Login / Register' : 'New Emergency SOS'}</span>
        </button>

        <span className="badge badge-red" style={{ fontSize: '0.82rem', padding: '5px 12px' }}>
          {isAccepted ? 'Emergency Request Accepted' : request.status === 'EXHAUSTED' ? 'Emergency Request Exhausted' : 'Live Sequential Routing Active'}
        </span>
      </div>

      {/* SUCCESS CONFIRMATION BANNER (If accepted) */}
      {isAccepted && (
        <div className="card-glass animate-slide-down" style={{
          padding: '28px',
          backgroundColor: '#ecfdf5',
          border: '2px solid #34d399',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 8px 30px rgba(5, 150, 105, 0.15)',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircle2 size={32} />
            </div>
            <div>
              <span className="badge badge-green" style={{ marginBottom: '4px' }}>EMERGENCY ACCEPTED</span>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#065f46' }}>
                {acceptedData?.name || currentHospital.name} Accepted Your Request!
              </h2>
            </div>
          </div>

          <div style={{
            backgroundColor: '#ffffff',
            padding: '18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #a7f3d0',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
              <MapPin size={18} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#065f46', fontSize: '0.94rem' }}>Hospital Address:</strong>
                <div style={{ color: '#047857', fontSize: '0.88rem' }}>
                  {acceptedData?.address || currentHospital.address}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Phone size={18} style={{ color: '#059669', flexShrink: 0 }} />
              <div>
                <strong style={{ color: '#065f46', fontSize: '0.94rem' }}>Emergency Contact:</strong>
                <span style={{ color: '#047857', fontSize: '0.88rem', marginLeft: '6px' }}>
                  {acceptedData?.phone || currentHospital.phone} / {acceptedData?.emergencyContact || currentHospital.emergencyContact}
                </span>
              </div>
            </div>
          </div>

          <div style={{
            fontSize: '0.88rem',
            color: '#065f46',
            backgroundColor: '#d1fae5',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            marginBottom: '16px'
          }}>
            🏥 An emergency medical team and trauma bed have been pre-allocated at {acceptedData?.name || currentHospital.name}. Keep your line open for coordination.
          </div>

          {/* DEDICATED AMBULANCE DRIVER ASSIGNMENT & REAL-TIME GPS TRACKING (RAPIDO USER APP STYLE) */}
          {assignedDriver ? (
            <div style={{
              backgroundColor: '#ffffff',
              color: 'var(--text-main)',
              borderRadius: 'var(--radius-xl)',
              padding: '20px 24px',
              border: '1.5px solid #86efac',
              boxShadow: 'var(--shadow-lg)'
            }}>
              {/* Rapido Pilot Header Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                marginBottom: '16px',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {/* Pilot Avatar */}
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      backgroundColor: '#ecfdf5',
                      color: '#059669',
                      border: '2px solid #34d399',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px'
                    }}>
                      👨‍✈️
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: '-2px',
                      right: '-2px',
                      backgroundColor: '#fbbf24',
                      color: '#78350f',
                      borderRadius: '10px',
                      padding: '1px 5px',
                      fontSize: '0.65rem',
                      fontWeight: 900,
                      border: '1px solid #ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                      ★ 4.9
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {assignedDriver.name}
                      </span>
                      <span style={{
                        backgroundColor: '#f1f5f9',
                        color: 'var(--text-muted)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {assignedDriver.id}
                      </span>
                    </div>

                    {/* Rapido Yellow Vehicle Number Plate Pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{
                        backgroundColor: '#fef08a',
                        border: '1.5px solid #ca8a04',
                        color: '#713f12',
                        fontWeight: 900,
                        fontSize: '0.82rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        letterSpacing: '0.5px'
                      }}>
                        🚑 {assignedDriver.vehiclePlate}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        ALS Life-Support Ambulance
                      </span>
                    </div>
                  </div>
                </div>

                {/* Call Pilot Action Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <a
                    href={`tel:${assignedDriver.phone}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#059669',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '10px 20px',
                      borderRadius: '24px',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      boxShadow: '0 3px 12px rgba(5, 150, 105, 0.35)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Phone size={16} />
                    <span>Call Pilot ({assignedDriver.phone})</span>
                  </a>
                </div>
              </div>

              {/* Rapido 4-Step Trip Progression Timeline */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                marginBottom: '16px',
                backgroundColor: 'var(--bg-surface-soft)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)'
              }}>
                <div style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: rideStage === 'ASSIGNED' || rideStage === 'EN_ROUTE_PICKUP' ? '#ffffff' : 'transparent',
                  border: `1.5px solid ${rideStage === 'ASSIGNED' || rideStage === 'EN_ROUTE_PICKUP' ? 'var(--primary)' : 'transparent'}`,
                  boxShadow: rideStage === 'ASSIGNED' || rideStage === 'EN_ROUTE_PICKUP' ? 'var(--shadow-sm)' : 'none'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: rideStage === 'ASSIGNED' || rideStage === 'EN_ROUTE_PICKUP' ? 'var(--primary)' : 'var(--text-dim)' }}>
                    1. En Route
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: rideStage === 'ARRIVED_AT_PICKUP' ? '#ffffff' : 'transparent',
                  border: `1.5px solid ${rideStage === 'ARRIVED_AT_PICKUP' ? '#d97706' : 'transparent'}`,
                  boxShadow: rideStage === 'ARRIVED_AT_PICKUP' ? 'var(--shadow-sm)' : 'none'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: rideStage === 'ARRIVED_AT_PICKUP' ? '#d97706' : 'var(--text-dim)' }}>
                    2. Arrived Outside
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: rideStage === 'PATIENT_PICKED_UP' ? '#ffffff' : 'transparent',
                  border: `1.5px solid ${rideStage === 'PATIENT_PICKED_UP' ? '#0284c7' : 'transparent'}`,
                  boxShadow: rideStage === 'PATIENT_PICKED_UP' ? 'var(--shadow-sm)' : 'none'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: rideStage === 'PATIENT_PICKED_UP' ? '#0284c7' : 'var(--text-dim)' }}>
                    3. Onboard (To Base)
                  </div>
                </div>
                <div style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: rideStage === 'COMPLETED' ? '#ffffff' : 'transparent',
                  border: `1.5px solid ${rideStage === 'COMPLETED' ? '#059669' : 'transparent'}`,
                  boxShadow: rideStage === 'COMPLETED' ? 'var(--shadow-sm)' : 'none'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: rideStage === 'COMPLETED' ? '#059669' : 'var(--text-dim)' }}>
                    4. Admitted to ER
                  </div>
                </div>
              </div>

              {/* Real-Time Stage Guidance Banner */}
              <div style={{
                backgroundColor: rideStage === 'COMPLETED' ? '#ecfdf5' : rideStage === 'PATIENT_PICKED_UP' ? '#eff6ff' : rideStage === 'ARRIVED_AT_PICKUP' ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${rideStage === 'COMPLETED' ? '#a7f3d0' : rideStage === 'PATIENT_PICKED_UP' ? '#bfdbfe' : rideStage === 'ARRIVED_AT_PICKUP' ? '#fde68a' : '#bbf7d0'}`,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '14px',
                fontSize: '0.84rem',
                color: rideStage === 'COMPLETED' ? '#065f46' : rideStage === 'PATIENT_PICKED_UP' ? '#1e40af' : rideStage === 'ARRIVED_AT_PICKUP' ? '#92400e' : '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Truck size={16} className="flex-shrink-0" />
                <span>
                  {rideStage === 'COMPLETED'
                    ? 'Patient safely arrived at hospital emergency ward and admitted to trauma care.'
                    : rideStage === 'PATIENT_PICKED_UP'
                    ? `Patient safely onboard. Ambulance is rushing towards ${acceptedData?.name || 'Hospital Base'} Emergency Room.`
                    : rideStage === 'ARRIVED_AT_PICKUP'
                    ? `Ambulance pilot ${assignedDriver.name} has arrived outside your location! Medical team is ready with equipment.`
                    : `Ambulance pilot ${assignedDriver.name} (${assignedDriver.vehiclePlate}) is en route to your pickup location.`}
                </span>
              </div>

              {/* Real-time Tracking Map Canvas */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 700 }}>
                    <Navigation size={14} className="animate-spin" />
                    <span>LIVE AMBULANCE GPS STREAMING</span>
                  </span>
                  <span>
                    {rideStage === 'COMPLETED'
                      ? 'Trip completed at Hospital Base'
                      : rideStage === 'PATIENT_PICKED_UP'
                      ? 'Heading to Hospital Emergency Ward'
                      : rideStage === 'ARRIVED_AT_PICKUP'
                      ? 'Ambulance standing by at your pickup point'
                      : 'Ambulance moving to pickup location'}
                  </span>
                </div>

                <div
                  ref={trackingMapContainerRef}
                  style={{
                    height: '300px',
                    width: '100%',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    border: '1.5px solid var(--border-light)'
                  }}
                />
              </div>
            </div>

          ) : (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1.5px dashed #10b981',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <RefreshCw size={22} className="animate-spin" style={{ color: '#059669', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#065f46', display: 'block' }}>
                  Dispatched to On-Duty Ambulance Fleet
                </strong>
                <span style={{ fontSize: '0.82rem', color: '#047857' }}>
                  The hospital admin has accepted your emergency. Broadcast alert sent to all on-duty ambulance pilots. Assigned driver details and live GPS tracking will appear here instantly upon acceptance.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EXHAUSTED CARD (If all 4 hospitals timed out or declined) */}
      {!isAccepted && request.status === 'EXHAUSTED' && (
        <div className="card-glass animate-slide-down" style={{
          padding: '28px',
          backgroundColor: '#fef2f2',
          border: '2px solid #ef4444',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 8px 30px rgba(239, 68, 68, 0.15)',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            border: '2px solid #f87171'
          }}>
            <AlertOctagon size={32} />
          </div>
          <span className="badge badge-red" style={{ marginBottom: '8px' }}>ALL HOSPITALS EXHAUSTED</span>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#991b1b', marginBottom: '8px' }}>
            Emergency Response Window Expired
          </h2>
          <p style={{ color: '#7f1d1d', maxWidth: '580px', margin: '0 auto 20px auto', fontSize: '0.92rem' }}>
            All nearest qualifying hospitals in your queue were contacted and could not accept in time due to current emergency ward capacity. Please contact Central Ambulance Dispatch immediately.
          </p>
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="tel:112"
              className="btn btn-primary"
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', padding: '12px 28px', fontSize: '1rem', fontWeight: 800 }}
            >
              📞 Call National Emergency (112 / 102)
            </a>
            <button
              type="button"
              onClick={onNewEmergency}
              className="btn btn-secondary"
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              Start New Emergency Search
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE SEQUENTIAL ROUTING CARD (If still routing) */}
      {!isAccepted && request.status === 'ROUTING' && (
        <div className="card-glass" style={{
          padding: '28px',
          backgroundColor: '#ffffff',
          border: '2px solid #fda4af',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          marginBottom: '24px'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span className="badge badge-amber" style={{ marginBottom: '6px' }}>
                QUEUE POSITION #{request.current_hospital_index + 1} OF {request.hospital_queue?.length || 4}
              </span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Contacting: {currentHospital.name}
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                {currentHospital.address} ({currentHospital.distanceKm} km away)
              </p>
            </div>

            {/* 2-Minute Live Countdown Timer Clock */}
            <div style={{
              backgroundColor: remainingSeconds < 30 ? '#fee2e2' : '#fef3c7',
              border: remainingSeconds < 30 ? '2px solid #ef4444' : '2px solid #f59e0b',
              padding: '12px 20px',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: remainingSeconds < 30 ? '#b91c1c' : '#b45309', textTransform: 'uppercase' }}>
                Admin Response Timer
              </div>
              <div style={{
                fontSize: '2rem',
                fontWeight: 900,
                fontFamily: 'var(--font-mono)',
                color: remainingSeconds < 30 ? '#dc2626' : '#d97706',
                lineHeight: 1.1,
                marginTop: '2px'
              }}>
                {formattedTime}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Auto-routes to next hospital if not accepted in 2 mins
              </div>
            </div>
          </div>

          {/* Sequential Routing Explanation Alert */}
          <div style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.84rem',
            color: '#1e40af',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <RefreshCw size={18} className="animate-spin" style={{ flexShrink: 0 }} />
            <span>
              Request dispatched to <strong>{currentHospital.name}</strong> admin dashboard. Waiting for admin approval. If rejected or timed out under 2 minutes, request automatically shifts to Hospital #{request.current_hospital_index + 2}.
            </span>
          </div>
        </div>
      )}

      {/* 4 HOSPITALS QUEUE BREAKDOWN */}
      <div className="card-glass" style={{
        padding: '24px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px' }}>
          Sequential Hospital Routing Queue Status (4 Nearest Hospitals)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {request.hospital_queue?.map((h, idx) => {
            const isTheAcceptedOne = isAccepted && h.id === request.accepted_hospital_id;
            const isCurrentlyContacted = !isAccepted && request.status === 'ROUTING' && idx === request.current_hospital_index;
            const isPast = (request.status === 'ROUTING' && idx < request.current_hospital_index) || (request.status === 'EXHAUSTED');
            const isFuture = request.status === 'ROUTING' && idx > request.current_hospital_index;

            let statusBadge = null;
            if (isTheAcceptedOne) {
              statusBadge = <span className="badge badge-green">ACCEPTED</span>;
            } else if (isCurrentlyContacted) {
              statusBadge = <span className="badge badge-amber animate-pulse">Contacting (Active 2-Min Window)</span>;
            } else if (isPast) {
              statusBadge = <span className="badge badge-red">Timed out / Passed</span>;
            } else {
              statusBadge = <span className="badge badge-blue">Waiting in Queue</span>;
            }

            return (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: isTheAcceptedOne ? '#f0fdf4' : isCurrentlyContacted ? '#fffbeb' : 'var(--bg-surface-soft)',
                  border: isTheAcceptedOne ? '1.5px solid #86efac' : isCurrentlyContacted ? '1.5px solid #fde68a' : '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  opacity: isPast ? 0.7 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: isTheAcceptedOne ? '#10b981' : isCurrentlyContacted ? '#f59e0b' : '#94a3b8',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem'
                  }}>
                    {idx + 1}
                  </span>

                  <div>
                    <strong style={{ fontSize: '0.94rem', color: 'var(--text-main)' }}>{h.name}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {h.distanceKm} km away · {h.address.slice(0, 42)}...
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {statusBadge}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Patient Information Summary Card */}
      <div className="card-glass" style={{
        padding: '20px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)'
      }}>
        <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Emergency Patient Record
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.84rem' }}>
          <div>
            <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.75rem' }}>PATIENT NAME</span>
            <strong>{request.patient_name}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.75rem' }}>CONTACT PHONE</span>
            <strong>{request.phone}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.75rem' }}>SYMPTOMS / CONDITION</span>
            <strong>{request.symptoms}</strong>
          </div>
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '10px', marginTop: '4px' }}>
            <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
              <MapPin size={13} /> PATIENT PICKUP LOCATION (REAL-TIME GPS)
            </span>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.88rem' }}>
              {request.patient_address || 'Patient Device GPS Location'}
            </strong>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              GPS: {request.patient_lat?.toFixed(4)}° N, {request.patient_lng?.toFixed(4)}° E
            </div>
          </div>
        </div>
      </div>

      {/* RIDE COMPLETED & ADMITTED MODAL */}
      {rideStage === 'COMPLETED' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-xl)',
            padding: '32px 28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '2px solid #10b981',
            textAlign: 'center'
          }}>
            <div style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
              border: '2.5px solid #34d399'
            }}>
              <CheckCircle2 size={38} />
            </div>

            <div className="badge badge-green" style={{ marginBottom: '10px', fontSize: '0.82rem', padding: '4px 12px' }}>
              EMERGENCY RIDE COMPLETED
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px' }}>
              Patient Safely Admitted to Hospital!
            </h2>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
              Ambulance pilot <strong>{assignedDriver?.name || 'Driver'}</strong> ({assignedDriver?.vehiclePlate || 'ALS Ambulance'}) has safely delivered the patient to <strong>{acceptedData?.name || currentHospital.name}</strong> Emergency Trauma Ward.
            </p>

            <div style={{
              backgroundColor: '#f8fafc',
              border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              marginBottom: '22px',
              fontSize: '0.84rem',
              color: 'var(--text-dim)'
            }}>
              🔒 All emergency session details are being cleared. Auto-returning to Login / Register in <strong style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{completionCountdown}s</strong>...
            </div>

            <button
              type="button"
              onClick={handleFinishAndExit}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '0.98rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
              }}
            >
              <span>Done & Back to Login / Register</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
