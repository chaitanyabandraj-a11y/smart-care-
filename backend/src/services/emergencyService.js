const emergencyDb = require('../db/emergencyDb');
const hospitalDbManager = require('../db/hospitalDbManager');
const ambulanceDbManager = require('../db/ambulanceDbManager');
const { HOSPITALS_CONFIG } = require('../db/seedHospitals');

// Haversine formula to calculate accurate distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal place
}

// Find top 4 candidate hospitals matching constraints
function getRankedCandidateHospitals(patientLat, patientLng) {
  const candidates = [];

  for (const config of HOSPITALS_CONFIG) {
    try {
      const db = hospitalDbManager.getHospitalDb(config.id);
      const profile = db.prepare('SELECT * FROM hospital_profile WHERE id = ?').get(config.id);
      const beds = db.prepare('SELECT total_beds, available_beds, icu_available, oxygen_available, general_available FROM bed_inventory WHERE id = 1').get();
      const doctors = db.prepare('SELECT total_doctors, available_doctors, emergency_duty, opd_duty FROM doctor_inventory WHERE id = 1').get();

      const hLat = profile?.lat || config.lat;
      const hLng = profile?.lng || config.lng;
      const ambulances = profile?.ambulances_available || config.ambulancesAvailable || 4;

      const distanceKm = calculateDistance(patientLat, patientLng, hLat, hLng);

      candidates.push({
        id: config.id,
        name: profile?.name || config.name,
        address: profile?.address || config.address,
        phone: profile?.phone || config.phone,
        emergencyContact: profile?.emergency_contact || config.emergencyContact,
        distanceKm,
        beds: {
          totalBeds: beds?.total_beds || 0,
          availableBeds: beds?.available_beds || 0,
          icuAvailable: beds?.icu_available || 0
        },
        doctors: {
          totalDoctors: doctors?.total_doctors || 0,
          availableDoctors: doctors?.available_doctors || 0,
          emergencyDuty: doctors?.emergency_duty || 0
        },
        ambulancesAvailable: ambulances,
        // Constraint check: has beds, doctors, and ambulance available
        isQualified: (beds?.available_beds > 0) && (doctors?.available_doctors > 0) && (ambulances > 0)
      });
    } catch (err) {
      console.error(`Error querying candidate hospital ${config.id}:`, err.message);
    }
  }

  // Sort primarily by qualification (qualified first), then by distance ascending
  candidates.sort((a, b) => {
    if (a.isQualified && !b.isQualified) return -1;
    if (!a.isQualified && b.isQualified) return 1;
    return a.distanceKm - b.distanceKm;
  });

  // Pick top 4 hospitals
  return candidates.slice(0, 4);
}

// Dispatch to current hospital
function dispatchToCurrentHospital(io, request) {
  const currentHospital = request.hospital_queue[request.current_hospital_index];
  if (!currentHospital) return;

  const db = hospitalDbManager.getHospitalDb(currentHospital.id);
  const now = new Date().toISOString();

  // Insert into incoming_emergencies table for this hospital
  try {
    const existing = db.prepare('SELECT id FROM incoming_emergencies WHERE request_id = ?').get(request.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO incoming_emergencies (id, request_id, patient_name, phone, symptoms, distance_km, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?)
      `).run(request.id, request.id, request.patient_name, request.phone, request.symptoms, currentHospital.distanceKm, now);
    } else {
      db.prepare(`
        UPDATE incoming_emergencies
        SET status = 'PENDING_APPROVAL'
        WHERE request_id = ?
      `).run(request.id);
    }
  } catch (e) {
    console.error(`Error writing incoming emergency to ${currentHospital.id}.db:`, e.message);
  }

  // Broadcast to this hospital's admin dashboard room
  if (io) {
    io.to(`hospital_${currentHospital.id}`).emit('emergency:incoming_alert', {
      requestId: request.id,
      patientName: request.patient_name,
      phone: request.phone,
      symptoms: request.symptoms,
      patientLat: request.patient_lat,
      patientLng: request.patient_lng,
      patientAddress: request.patient_address,
      distanceKm: currentHospital.distanceKm,
      queuePosition: request.current_hospital_index + 1,
      totalHospitals: request.hospital_queue.length,
      stepStartedAt: request.step_started_at,
      stepExpiresAt: request.step_expires_at,
      durationSeconds: 120
    });

    // Also notify all connected hospital dashboards so pipeline queue updates immediately
    io.emit('emergency:queue_updated', {
      requestId: request.id,
      currentHospitalId: currentHospital.id,
      queuePosition: request.current_hospital_index + 1
    });

    // Notify patient's room
    io.to(`emergency_${request.id}`).emit('emergency:status_update', {
      requestId: request.id,
      status: 'ROUTING',
      currentHospital: {
        id: currentHospital.id,
        name: currentHospital.name,
        address: currentHospital.address,
        distanceKm: currentHospital.distanceKm
      },
      currentHospitalIndex: request.current_hospital_index,
      totalHospitals: request.hospital_queue.length,
      stepStartedAt: request.step_started_at,
      stepExpiresAt: request.step_expires_at
    });
  }

  console.log(`[Emergency Routing] Dispatched request ${request.id} to Hospital #${request.current_hospital_index + 1}: ${currentHospital.name} (2-min timer active)`);
}

// Advance to next hospital in queue
function advanceRouting(io, requestId, reason) {
  const request = emergencyDb.getEmergencyRequest(requestId);
  if (!request || request.status !== 'ROUTING') return;

  const currentHospital = request.hospital_queue[request.current_hospital_index];

  // 1. Mark current hospital as TIMEOUT or REJECTED
  try {
    const db = hospitalDbManager.getHospitalDb(currentHospital.id);
    db.prepare(`
      UPDATE incoming_emergencies
      SET status = ?, responded_at = ?
      WHERE request_id = ?
    `).run(reason, new Date().toISOString(), requestId);
  } catch (_) {}

  // 2. Clear request from current hospital's dashboard
  if (io) {
    io.to(`hospital_${currentHospital.id}`).emit('emergency:request_disappeared', {
      requestId,
      reason,
      message: `Emergency request for ${request.patient_name} has ${reason === 'TIMEOUT' ? 'timed out after 2 minutes' : 'been rejected'}. Removed from dashboard.`
    });
  }

  emergencyDb.logRoutingAction(requestId, currentHospital.id, currentHospital.name, reason);

  // 3. Check if next hospital exists
  const nextIndex = request.current_hospital_index + 1;
  if (nextIndex < request.hospital_queue.length) {
    const nextHospital = request.hospital_queue[nextIndex];
    const now = new Date();
    const stepStartedAt = now.toISOString();
    const stepExpiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

    emergencyDb.updateRequestRouting(requestId, {
      nextIndex,
      nextHospitalId: nextHospital.id,
      stepStartedAt,
      stepExpiresAt
    });

    emergencyDb.logRoutingAction(requestId, nextHospital.id, nextHospital.name, 'DISPATCHED');

    const updatedRequest = emergencyDb.getEmergencyRequest(requestId);
    dispatchToCurrentHospital(io, updatedRequest);
  } else {
    // All 4 hospitals exhausted
    emergencyDb.markRequestExhausted(requestId);
    if (io) {
      io.to(`emergency_${requestId}`).emit('emergency:status_update', {
        requestId,
        status: 'EXHAUSTED',
        message: 'All 4 nearest hospitals in queue were either busy or did not respond within the 2-minute emergency window. Please contact Central SOS helpline 112.'
      });
    }
    console.log(`[Emergency Routing] Request ${requestId} exhausted all 4 hospitals in queue.`);
  }
}

// Admin Accept
function acceptEmergencyRequest(io, hospitalId, requestId) {
  const request = emergencyDb.getEmergencyRequest(requestId);
  if (!request) return { success: false, error: 'Request not found.' };

  if (request.status === 'ACCEPTED') {
    return { success: false, error: 'Request was already accepted by another hospital.' };
  }

  if (request.current_hospital_id !== hospitalId) {
    return { success: false, error: 'This request is no longer routed to your hospital.' };
  }

  // Update in hospital's database
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE incoming_emergencies
    SET status = 'ACCEPTED', responded_at = ?
    WHERE request_id = ?
  `).run(now, requestId);

  // Mark in emergency.db
  emergencyDb.markRequestAccepted(requestId, hospitalId);
  emergencyDb.logRoutingAction(requestId, hospitalId, request.hospital_queue[request.current_hospital_index].name, 'ACCEPTED');

  const acceptedHospital = request.hospital_queue[request.current_hospital_index];

  // Notify patient
  if (io) {
    io.to(`emergency_${requestId}`).emit('emergency:accepted', {
      requestId,
      status: 'ACCEPTED',
      acceptedHospital: {
        id: acceptedHospital.id,
        name: acceptedHospital.name,
        address: acceptedHospital.address,
        phone: acceptedHospital.phone,
        emergencyContact: acceptedHospital.emergencyContact
      },
      patient: {
        name: request.patient_name,
        phone: request.phone,
        symptoms: request.symptoms
      },
      acceptedAt: now
    });

    // Notify hospital admin
    io.to(`hospital_${hospitalId}`).emit('emergency:confirmed_case', {
      requestId,
      patientName: request.patient_name,
      phone: request.phone,
      symptoms: request.symptoms,
      distanceKm: acceptedHospital.distanceKm,
      acceptedAt: now
    });

    io.emit('emergency:queue_updated', {
      requestId,
      status: 'ACCEPTED',
      acceptedHospitalId: hospitalId
    });

    // 4. Trigger Automatic Dispatch to Ambulance Drivers of this Hospital
    try {
      const onDutyDrivers = ambulanceDbManager.getOnDutyDrivers(hospitalId);
      const onServiceDrivers = ambulanceDbManager.getOnServiceDrivers(hospitalId);
      const isFallback = onDutyDrivers.length === 0;
      let targetDrivers = isFallback ? onServiceDrivers : onDutyDrivers;

      // If both on-duty and on-service are 0 (e.g. all drivers are off duty), notify all registered drivers as urgent standby fallback
      if (targetDrivers.length === 0) {
        const allDrivers = ambulanceDbManager.getHospitalDrivers(hospitalId).drivers || [];
        targetDrivers = allDrivers.filter(d => d.is_verified === 1);
      }

      // Sort fallback drivers by closest distance to hospital
      if (isFallback && targetDrivers.length > 0) {
        targetDrivers.sort((a, b) => {
          const distA = calculateDistance(a.current_lat || acceptedHospital.lat, a.current_lng || acceptedHospital.lng, acceptedHospital.lat, acceptedHospital.lng);
          const distB = calculateDistance(b.current_lat || acceptedHospital.lat, b.current_lng || acceptedHospital.lng, acceptedHospital.lat, acceptedHospital.lng);
          return distA - distB;
        });
      }

      const alertPayload = {
        requestId,
        patientName: request.patient_name,
        phone: request.phone,
        symptoms: request.symptoms,
        patientLat: request.patient_lat,
        patientLng: request.patient_lng,
        patientAddress: request.patient_address,
        hospitalId: acceptedHospital.id,
        hospitalName: acceptedHospital.name,
        hospitalAddress: acceptedHospital.address,
        hospitalLat: acceptedHospital.lat,
        hospitalLng: acceptedHospital.lng,
        distanceKm: acceptedHospital.distanceKm,
        isFallback,
        targetDriversCount: targetDrivers.length,
        dispatchedAt: now,
        expiresInSeconds: 60
      };

      // Broadcast to dedicated hospital driver fleet room
      io.to(`hospital_drivers_${hospitalId}`).emit('ambulance:incoming_ride_alert', alertPayload);

      // Also emit to individual driver rooms for guaranteed receipt
      for (const drv of targetDrivers) {
        io.to(`driver_${drv.id}`).emit('ambulance:incoming_ride_alert', alertPayload);
      }

      // Notify Hospital Admin Dashboard of active dispatch
      io.to(`hospital_${hospitalId}`).emit('ambulance:dispatch_initiated', {
        requestId,
        isFallback,
        targetDriversCount: targetDrivers.length,
        message: isFallback
          ? `Dispatched fallback alert to ${targetDrivers.length} active/standby fleet pilots. Waiting for acceptance...`
          : `Dispatched alert to ${targetDrivers.length} ON-DUTY ambulance drivers. Waiting for acceptance...`
      });

      console.log(`[Ambulance Dispatch] Alert sent to ${targetDrivers.length} drivers (${isFallback ? 'FALLBACK: ON-SERVICE' : 'PRIMARY: ON-DUTY'}) for ${acceptedHospital.name}`);
    } catch (dispatchErr) {
      console.error(`[Ambulance Dispatch] Error dispatching to drivers for ${hospitalId}:`, dispatchErr.message);
    }
  }

  return {
    success: true,
    message: `Emergency request for ${request.patient_name} successfully accepted!`,
    acceptedHospital
  };
}

// Admin Reject
function rejectEmergencyRequest(io, hospitalId, requestId) {
  const request = emergencyDb.getEmergencyRequest(requestId);
  if (!request) return { success: false, error: 'Request not found.' };

  if (request.current_hospital_id !== hospitalId) {
    return { success: false, error: 'Request is no longer routed to your hospital.' };
  }

  advanceRouting(io, requestId, 'REJECTED');
  return { success: true, message: 'Emergency request declined. Routed to next nearest hospital.' };
}

// Get currently pending or queued incoming emergency for a hospital admin dashboard
function getHospitalPendingEmergency(hospitalId) {
  try {
    const now = new Date();
    // 1. Check if there is an active emergency currently routed to this hospital
    const row = emergencyDb.emergencyDb.prepare(`
      SELECT * FROM emergency_requests
      WHERE current_hospital_id = ? AND status = 'ROUTING'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(hospitalId);

    if (row) {
      const expiresAt = new Date(row.step_expires_at).getTime();
      if (now.getTime() < expiresAt) {
        const queue = JSON.parse(row.hospital_queue);
        const currentHospital = queue[row.current_hospital_index] || queue[0];
        const remainingSeconds = Math.max(0, Math.floor((expiresAt - now.getTime()) / 1000));

        return {
          isCurrentTarget: true,
          requestId: row.id,
          patientName: row.patient_name,
          phone: row.phone,
          symptoms: row.symptoms,
          patientLat: row.patient_lat,
          patientLng: row.patient_lng,
          patientAddress: row.patient_address,
          distanceKm: currentHospital.distanceKm,
          queuePosition: row.current_hospital_index + 1,
          totalHospitals: queue.length,
          stepStartedAt: row.step_started_at,
          stepExpiresAt: row.step_expires_at,
          remainingSeconds
        };
      }
    }

    // 2. Check if there is an active emergency where this hospital is waiting downstream in the queue
    const activeRequests = emergencyDb.emergencyDb.prepare(`
      SELECT * FROM emergency_requests
      WHERE status = 'ROUTING'
      ORDER BY created_at DESC
    `).all();

    for (const r of activeRequests) {
      const queue = JSON.parse(r.hospital_queue);
      const myIndex = queue.findIndex(h => h.id === hospitalId);
      if (myIndex > r.current_hospital_index) {
        // This hospital is waiting in the queue
        const currentHospital = queue[r.current_hospital_index];
        const myHospital = queue[myIndex];
        return {
          isCurrentTarget: false,
          isQueued: true,
          requestId: r.id,
          patientName: r.patient_name,
          phone: r.phone,
          symptoms: r.symptoms,
          patientLat: r.patient_lat,
          patientLng: r.patient_lng,
          patientAddress: r.patient_address,
          distanceKm: myHospital?.distanceKm || 0,
          myQueuePosition: myIndex + 1,
          currentQueuePosition: r.current_hospital_index + 1,
          totalHospitals: queue.length,
          currentHospitalName: currentHospital?.name || 'Earlier Hospital in Queue',
          stepExpiresAt: r.step_expires_at
        };
      }
    }

    return null;
  } catch (e) {
    console.error(`Error querying pending emergency for ${hospitalId}:`, e.message);
    return null;
  }
}

// Background Worker: Checks timeouts every 1 second
let timerInterval = null;

function initTimeoutWorker(io) {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    try {
      const activeRequests = emergencyDb.emergencyDb.prepare(`
        SELECT id, step_expires_at, current_hospital_id FROM emergency_requests
        WHERE status = 'ROUTING'
      `).all();

      const now = Date.now();
      for (const row of activeRequests) {
        const expiresAt = new Date(row.step_expires_at).getTime();
        if (now >= expiresAt) {
          console.log(`[Emergency Timeout] Request ${row.id} 2-minute window expired for hospital: ${row.current_hospital_id}. Advancing to next hospital.`);
          advanceRouting(io, row.id, 'TIMEOUT');
        }
      }
    } catch (err) {
      console.error('[Emergency Worker Error]:', err.message);
    }
  }, 1000);

  console.log('[Emergency Worker] 2-Minute sequential routing supervisor active (1-sec pulse)');
}

// Get active emergencies for a hospital admin dashboard (with driver info enriched)
function getHospitalIncomingEmergencies(hospitalId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  try {
    const list = db.prepare(`
      SELECT * FROM incoming_emergencies
      ORDER BY created_at DESC
      LIMIT 20
    `).all();

    return list.map(item => {
      if (!item.allotted_driver_id && item.status === 'ACCEPTED') {
        const centralReq = emergencyDb.getEmergencyRequest(item.request_id);
        if (centralReq && centralReq.allotted_driver_id) {
          return {
            ...item,
            allotted_driver_id: centralReq.allotted_driver_id,
            allotted_driver_name: centralReq.allotted_driver_name,
            allotted_driver_phone: centralReq.allotted_driver_phone,
            allotted_vehicle_plate: centralReq.allotted_vehicle_plate
          };
        }
      }
      return item;
    });
  } catch (e) {
    return [];
  }
}


module.exports = {
  calculateDistance,
  getRankedCandidateHospitals,
  dispatchToCurrentHospital,
  advanceRouting,
  acceptEmergencyRequest,
  rejectEmergencyRequest,
  initTimeoutWorker,
  getHospitalIncomingEmergencies,
  getHospitalPendingEmergency
};
