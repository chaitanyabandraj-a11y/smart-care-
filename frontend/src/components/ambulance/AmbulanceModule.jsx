import React, { useState, useEffect } from 'react';
import AmbulanceAuth from './AmbulanceAuth';
import AmbulanceCockpit from './AmbulanceCockpit';
import AmbulanceActiveRide from './AmbulanceActiveRide';
import { getSocket } from '../../services/socket';
import { fetchAmbulanceHospitals, fetchAmbulanceDriverProfile, fetchAmbulancePendingDispatches, declineAmbulanceRide } from '../../services/api';

const SESSION_KEY = 'smartcare_ambulance_driver_session';
const ACTIVE_RIDE_KEY = 'smartcare_ambulance_active_ride';
const DECLINED_REQUESTS_KEY = 'smartcare_ambulance_declined_requests';

export default function AmbulanceModule() {
  const [driver, setDriver] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  const [hospital, setHospital] = useState(null);
  const [dutyStatus, setDutyStatus] = useState(driver?.dutyStatus || 'off_duty');

  // Persisted Active Ride so navigating tabs or reloading never loses active trip
  const [activeRide, setActiveRide] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_RIDE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  // Locally declined request IDs to guarantee no repeated popups for this driver
  const [declinedIds, setDeclinedIds] = useState(() => {
    try {
      const saved = localStorage.getItem(DECLINED_REQUESTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const [incomingAlert, setIncomingAlert] = useState(null);

  // Load hospital metadata for the active driver
  useEffect(() => {
    if (!driver?.hospitalId) return;

    fetchAmbulanceHospitals().then((res) => {
      if (res.success) {
        const found = res.hospitals.find(h => h.id === driver.hospitalId);
        if (found) setHospital(found);
      }
    }).catch(() => {});

    // Also fetch latest driver profile to verify active ride and duty status
    fetchAmbulanceDriverProfile(driver.hospitalId, driver.id).then((res) => {
      if (res.success && res.driver) {
        const currentDuty = res.driver.duty_status || res.driver.dutyStatus || 'off_duty';
        setDutyStatus(currentDuty);

        if (res.driver.activeRide && res.driver.activeRide.status !== 'COMPLETED') {
          setActiveRide(res.driver.activeRide);
          try {
            localStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(res.driver.activeRide));
          } catch (_) {}
        } else if (!res.driver.activeRide && activeRide && activeRide.status === 'COMPLETED') {
          // Completed on backend
          setActiveRide(null);
          try {
            localStorage.removeItem(ACTIVE_RIDE_KEY);
          } catch (_) {}
        }
      }
    }).catch(() => {});
  }, [driver?.hospitalId, driver?.id]);

  // Socket.IO Room Joining & Real-Time Listeners
  useEffect(() => {
    if (!driver) return;

    const socket = getSocket();
    socket.emit('join_driver', driver.id);
    socket.emit('join_hospital_drivers', driver.hospitalId);

    // Incoming Emergency Ride Alert via Socket.IO
    const onIncomingAlert = (payload) => {
      // Never show alert if driver is currently in an active ride or already declined this request
      if (activeRide) return;
      // Driver can receive alerts if on_duty, or on_service, or if this is an urgent fallback dispatch
      const isEligible = dutyStatus === 'on_duty' || dutyStatus === 'on_service' || payload?.isFallback;
      if (!isEligible) return;
      if (declinedIds.includes(payload.requestId)) return;

      setIncomingAlert(payload);
    };

    // Another driver accepted the ride -> dismiss alert immediately
    const onRideAllotted = (payload) => {
      if (incomingAlert && incomingAlert.requestId === payload.requestId && payload.allottedDriverId !== driver.id) {
        setIncomingAlert(null);
      }
    };

    socket.on('ambulance:incoming_ride_alert', onIncomingAlert);
    socket.on('ambulance:ride_allotted', onRideAllotted);

    return () => {
      socket.emit('leave_driver', driver.id);
      socket.emit('leave_hospital_drivers', driver.hospitalId);
      socket.off('ambulance:incoming_ride_alert', onIncomingAlert);
      socket.off('ambulance:ride_allotted', onRideAllotted);
    };
  }, [driver?.id, driver?.hospitalId, activeRide, dutyStatus, declinedIds, incomingAlert]);

  // Periodic Polling to discover pending emergency dispatches for this hospital
  // Polls if driver is in cockpit (ON DUTY or ON SERVICE standby) and NOT in an active ride
  useEffect(() => {
    if (!driver?.hospitalId || activeRide) {
      if (incomingAlert) setIncomingAlert(null);
      return;
    }

    const checkPendingDispatches = async () => {
      try {
        const res = await fetchAmbulancePendingDispatches(driver.hospitalId, driver.id);
        if (res.success && res.dispatches && res.dispatches.length > 0) {
          // Filter out locally declined IDs
          const viable = res.dispatches.filter(d => !declinedIds.includes(d.requestId));
          if (viable.length > 0) {
            const latest = viable[0];
            setIncomingAlert((prev) => {
              if (!prev || prev.requestId !== latest.requestId) {
                return latest;
              }
              return prev;
            });
          } else {
            setIncomingAlert(null);
          }
        } else {
          setIncomingAlert(null);
        }
      } catch (_) {}
    };

    checkPendingDispatches();
    const interval = setInterval(checkPendingDispatches, 2500);
    return () => clearInterval(interval);
  }, [driver?.hospitalId, driver?.id, activeRide, dutyStatus, declinedIds]);

  // Handle successful login or registration
  const handleAuthSuccess = (driverData, existingRide = null) => {
    setDriver(driverData);
    setDutyStatus(driverData.dutyStatus || 'off_duty');
    if (existingRide && existingRide.status !== 'COMPLETED') {
      setActiveRide(existingRide);
      try {
        localStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(existingRide));
      } catch (_) {}
    }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(driverData));
    } catch (_) {}
  };

  // Handle voluntary logout
  const handleLogout = () => {
    setDriver(null);
    setHospital(null);
    setActiveRide(null);
    setIncomingAlert(null);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACTIVE_RIDE_KEY);
    } catch (_) {}
  };

  // Handle duty status change
  const handleDutyChange = (newStatus) => {
    setDutyStatus(newStatus);
    if (newStatus !== 'on_duty') {
      setIncomingAlert(null);
    }
    setDriver(prev => prev ? ({ ...prev, dutyStatus: newStatus }) : prev);
    try {
      const updated = { ...driver, dutyStatus: newStatus };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  // Handle ride acceptance: Status transitions to off duty (busy) and ride is persisted
  const handleAcceptAlert = (allottedRide) => {
    setIncomingAlert(null);
    setActiveRide(allottedRide);
    setDutyStatus('off_duty');
    try {
      localStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(allottedRide));
    } catch (_) {}
    setDriver(prev => {
      const updated = prev ? ({ ...prev, dutyStatus: 'off_duty' }) : prev;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
  };

  // Handle decline alert: Driver declines -> never receives it again, routed to others
  const handleDismissAlert = (requestIdToDecline) => {
    const reqId = requestIdToDecline || incomingAlert?.requestId;
    setIncomingAlert(null);

    if (reqId) {
      setDeclinedIds(prev => {
        const updated = [...new Set([...prev, reqId])];
        try {
          localStorage.setItem(DECLINED_REQUESTS_KEY, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      // Call backend to record decline and forward to other drivers
      if (driver?.hospitalId && driver?.id) {
        declineAmbulanceRide(driver.hospitalId, driver.id, reqId).catch(() => {});
      }
    }
  };

  // Handle ride completed: Status automatically reverts back to on duty
  const handleRideCompleted = () => {
    setActiveRide(null);
    try {
      localStorage.removeItem(ACTIVE_RIDE_KEY);
    } catch (_) {}
    setDutyStatus('on_duty');
    setDriver(prev => {
      const updated = prev ? ({ ...prev, dutyStatus: 'on_duty' }) : prev;
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
  };

  // If not logged in, show Auth
  if (!driver) {
    return <AmbulanceAuth onAuthSuccess={handleAuthSuccess} />;
  }

  // If in an active ride, show In-Ride cockpit immediately (never falls through to standby cockpit)
  if (activeRide) {
    return (
      <AmbulanceActiveRide
        driver={driver}
        hospital={hospital || { name: driver.hospitalName || 'Hospital Base', id: driver.hospitalId }}
        ride={activeRide}
        onRideCompleted={handleRideCompleted}
      />
    );
  }

  // Otherwise show Standby Cockpit
  return (
    <AmbulanceCockpit
      driver={driver}
      hospital={hospital || { name: 'Hospital Base', id: driver.hospitalId }}
      dutyStatus={dutyStatus}
      onDutyChange={handleDutyChange}
      incomingAlert={incomingAlert}
      onAcceptAlert={handleAcceptAlert}
      onDismissAlert={handleDismissAlert}
      onLogout={handleLogout}
    />
  );
}
