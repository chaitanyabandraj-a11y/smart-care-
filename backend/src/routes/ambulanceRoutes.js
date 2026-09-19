const express = require('express');
const router = express.Router();
const ambulanceDbManager = require('../db/ambulanceDbManager');
const hospitalDbManager = require('../db/hospitalDbManager');
const emergencyDb = require('../db/emergencyDb');

// Helper to broadcast Socket.IO events
function broadcastTo(req, room, eventName, payload) {
  const io = req.app.get('io');
  if (io) {
    if (room) {
      io.to(room).emit(eventName, payload);
    } else {
      io.emit(eventName, payload);
    }
  }
}

// 1. Get hospitals for driver selection (only those in DB)
router.get('/hospitals', (req, res) => {
  try {
    const hospitals = hospitalDbManager.getAllHospitals();
    return res.json({ success: true, hospitals });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get all ambulance drivers for a specific hospital (for Admin Dashboard & fleet overview)
router.get('/hospital/:hospitalId/drivers', (req, res) => {
  try {
    const { hospitalId } = req.params;
    const result = ambulanceDbManager.getHospitalDrivers(hospitalId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2b. Get active emergency dispatches pending driver acceptance for a hospital
router.get('/:hospitalId/pending-dispatches', (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { driverId } = req.query;
    const dispatches = ambulanceDbManager.getPendingDispatchesForHospital(hospitalId, driverId || null);
    return res.json({ success: true, dispatches });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


// 3. Driver Registration (Step 1: Save & generate verification OTP)
router.post('/auth/register', (req, res) => {
  try {
    const { hospitalId, name, phone, email, driverId, vehiclePlate, password } = req.body;
    if (!hospitalId || !name || !phone || !email || !driverId || !vehiclePlate || !password) {
      return res.status(400).json({
        success: false,
        error: 'Hospital, Full Name, Phone, Email, Driver ID, Vehicle Plate, and Password are all required.'
      });
    }

    const result = ambulanceDbManager.registerDriver(hospitalId, {
      name,
      phone,
      email,
      driverId,
      vehiclePlate,
      password
    });

    if (!result.success) return res.status(400).json(result);

    // Notify hospital admin dashboard that fleet was modified
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:fleet_updated', {
      hospitalId,
      timestamp: new Date().toISOString()
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Verify Registration OTP (Step 2: Authenticate & activate driver account)
router.post('/auth/verify-otp', (req, res) => {
  try {
    const { hospitalId, driverId, otpCode } = req.body;
    if (!hospitalId || !driverId || !otpCode) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID, Driver ID, and OTP Code are required.'
      });
    }

    const result = ambulanceDbManager.verifyDriverOtp(hospitalId, { driverId, otpCode });
    if (!result.success) return res.status(400).json(result);

    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:fleet_updated', {
      hospitalId,
      timestamp: new Date().toISOString()
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Driver Login
router.post('/auth/login', (req, res) => {
  try {
    const { hospitalId, identifier, password } = req.body;
    if (!hospitalId || !identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID, Driver ID/Phone, and Password are required.'
      });
    }

    const result = ambulanceDbManager.loginDriver(hospitalId, { identifier, password });
    if (!result.success) return res.status(401).json(result);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Get Driver Profile & Active Ride
router.get('/driver/:hospitalId/:driverId', (req, res) => {
  try {
    const { hospitalId, driverId } = req.params;
    const driver = ambulanceDbManager.getDriverById(hospitalId, driverId);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found.' });

    return res.json({ success: true, driver });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Toggle Driver Duty Status (on_duty <-> off_duty)
router.put('/:hospitalId/:driverId/duty', (req, res) => {
  try {
    const { hospitalId, driverId } = req.params;
    const { dutyStatus } = req.body;

    const result = ambulanceDbManager.updateDutyStatus(hospitalId, driverId, dutyStatus);
    if (!result.success) return res.status(400).json(result);

    const fleet = ambulanceDbManager.getHospitalDrivers(hospitalId);

    // Broadcast real-time duty update to hospital admin dashboard and driver fleet room
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:duty_changed', {
      hospitalId,
      driverId,
      dutyStatus,
      counts: fleet.counts,
      timestamp: new Date().toISOString()
    });

    broadcastTo(req, `hospital_drivers_${hospitalId}`, 'ambulance:duty_changed', {
      hospitalId,
      driverId,
      dutyStatus,
      counts: fleet.counts
    });

    return res.json({ ...result, counts: fleet.counts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Stream Real-Time Ambulance GPS Location
router.put('/:hospitalId/:driverId/location', (req, res) => {
  try {
    const { hospitalId, driverId } = req.params;
    const { lat, lng, requestId } = req.body;

    const numLat = Number(lat);
    const numLng = Number(lng);

    ambulanceDbManager.updateDriverLocation(hospitalId, driverId, numLat, numLng);

    const driver = ambulanceDbManager.getDriverById(hospitalId, driverId);

    const payload = {
      hospitalId,
      driverId,
      driverName: driver?.name,
      vehiclePlate: driver?.vehicle_plate,
      lat: numLat,
      lng: numLng,
      timestamp: new Date().toISOString()
    };

    // Broadcast to emergency user tracking room
    if (requestId) {
      broadcastTo(req, `emergency_${requestId}`, 'ambulance:location_update', payload);
    }

    // Broadcast to hospital admin dashboard
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:driver_location', payload);

    return res.json({ success: true, lat: numLat, lng: numLng });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Driver Accepts Emergency Ride (Atomic First-Come First-Served)
router.post('/:hospitalId/:driverId/accept/:requestId', (req, res) => {
  try {
    const { hospitalId, driverId, requestId } = req.params;

    const result = ambulanceDbManager.acceptEmergencyRide(hospitalId, driverId, requestId);
    if (!result.success) {
      return res.status(result.alreadyAllotted ? 409 : 400).json(result);
    }

    const fleet = ambulanceDbManager.getHospitalDrivers(hospitalId);

    // 1. Notify all other drivers in this hospital fleet room that ride was allotted
    broadcastTo(req, `hospital_drivers_${hospitalId}`, 'ambulance:ride_allotted', {
      hospitalId,
      requestId,
      allottedDriverId: driverId,
      allottedDriverName: result.ride.driverName,
      message: `Emergency Ride #${requestId} was accepted by ${result.ride.driverName}.`
    });

    // 2. Notify Hospital Admin Dashboard
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:ride_assigned_to_driver', {
      hospitalId,
      requestId,
      driver: {
        id: result.ride.driverId,
        name: result.ride.driverName,
        phone: result.ride.driverPhone,
        vehiclePlate: result.ride.vehiclePlate
      },
      counts: fleet.counts,
      timestamp: new Date().toISOString()
    });

    // 3. Notify Emergency User tracking screen in real time
    broadcastTo(req, `emergency_${requestId}`, 'ambulance:driver_assigned', {
      requestId,
      driver: {
        id: result.ride.driverId,
        name: result.ride.driverName,
        phone: result.ride.driverPhone,
        vehiclePlate: result.ride.vehiclePlate,
        currentLat: result.ride.patientLat,
        currentLng: result.ride.patientLng
      },
      status: 'ASSIGNED',
      message: `Ambulance Driver ${result.ride.driverName} (${result.ride.vehiclePlate}) accepted your request and is en route!`
    });

    // 4. Broadcast driver status change to OFF DUTY (busy in ride)
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:duty_changed', {
      hospitalId,
      driverId,
      dutyStatus: 'off_duty',
      counts: fleet.counts
    });
    broadcastTo(req, `hospital_drivers_${hospitalId}`, 'ambulance:duty_changed', {
      hospitalId,
      driverId,
      dutyStatus: 'off_duty',
      counts: fleet.counts
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9b. Driver Declines Emergency Ride -> Records decline and forwards alert to other on-duty fleet drivers
router.post('/:hospitalId/:driverId/decline/:requestId', (req, res) => {
  try {
    const { hospitalId, driverId, requestId } = req.params;

    // Record decline in emergencyDb
    emergencyDb.recordDriverDecline(requestId, driverId);

    // Forward to other on-duty drivers of this hospital
    const onDutyDrivers = ambulanceDbManager.getOnDutyDrivers(hospitalId);
    const remainingDrivers = onDutyDrivers.filter(d => d.id !== driverId);

    const request = emergencyDb.getEmergencyRequest(requestId);
    if (request && !request.allotted_driver_id && request.status === 'ACCEPTED') {
      let declinedList = [];
      try {
        declinedList = JSON.parse(request.declined_driver_ids || '[]');
      } catch (_) {}

      const eligibleDrivers = remainingDrivers.filter(d => !declinedList.includes(d.id));

      if (eligibleDrivers.length > 0) {
        let queue = [];
        try { queue = JSON.parse(request.hospital_queue || '[]'); } catch (_) {}
        const hosp = queue.find(h => h.id === hospitalId) || {};

        const alertPayload = {
          requestId: request.id,
          patientName: request.patient_name,
          phone: request.phone,
          symptoms: request.symptoms,
          patientLat: request.patient_lat,
          patientLng: request.patient_lng,
          patientAddress: request.patient_address,
          hospitalId,
          hospitalName: hosp.name || 'Hospital Base',
          hospitalAddress: hosp.address || '',
          hospitalLat: hosp.lat,
          hospitalLng: hosp.lng,
          distanceKm: hosp.distanceKm || 5.0,
          isForwarded: true,
          dispatchedAt: new Date().toISOString()
        };

        // Emit to eligible drivers
        for (const drv of eligibleDrivers) {
          broadcastTo(req, `driver_${drv.id}`, 'ambulance:incoming_ride_alert', alertPayload);
        }
      }
    }

    return res.json({
      success: true,
      message: 'Ride declined. Alert automatically forwarded to other available drivers.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Update Ride Stage (EN_ROUTE_PICKUP -> ARRIVED_AT_PICKUP -> PATIENT_PICKED_UP)
router.put('/:hospitalId/:driverId/ride-stage/:requestId', (req, res) => {
  try {
    const { hospitalId, driverId, requestId } = req.params;
    const { stage } = req.body;

    const result = ambulanceDbManager.updateRideStage(hospitalId, driverId, requestId, stage);

    let stageMessage = 'Ambulance is en route to patient pickup.';
    if (stage === 'ARRIVED_AT_PICKUP') {
      stageMessage = 'Ambulance pilot has arrived outside your location!';
    } else if (stage === 'PATIENT_PICKED_UP') {
      stageMessage = 'Patient is onboard. Ambulance rushing to hospital ER trauma ward!';
    }

    const payload = {
      hospitalId,
      driverId,
      requestId,
      stage,
      message: stageMessage,
      timestamp: new Date().toISOString()
    };

    // Broadcast to emergency patient room
    broadcastTo(req, `emergency_${requestId}`, 'ambulance:stage_update', payload);
    // Broadcast to hospital admin
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:stage_update', payload);

    return res.json({ ...result, message: stageMessage });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Complete Emergency Ride (Driver arrived at hospital, status reverts to 'on_duty')
router.post('/:hospitalId/:driverId/complete-ride/:requestId', (req, res) => {
  try {
    const { hospitalId, driverId, requestId } = req.params;

    const result = ambulanceDbManager.completeEmergencyRide(hospitalId, driverId, requestId);
    if (!result.success) return res.status(400).json(result);

    const fleet = ambulanceDbManager.getHospitalDrivers(hospitalId);

    const payload = {
      hospitalId,
      driverId,
      requestId,
      status: 'COMPLETED',
      counts: fleet.counts,
      timestamp: new Date().toISOString(),
      message: 'Ambulance arrived at Hospital. Patient safely admitted. Driver returned to ON DUTY.'
    };

    // Notify patient
    broadcastTo(req, `emergency_${requestId}`, 'ambulance:ride_completed', payload);
    // Notify hospital admin
    broadcastTo(req, `hospital_${hospitalId}`, 'ambulance:ride_completed', payload);
    // Notify fleet room of count change
    broadcastTo(req, `hospital_drivers_${hospitalId}`, 'ambulance:duty_changed', {
      hospitalId,
      driverId,
      dutyStatus: 'on_duty',
      counts: fleet.counts
    });

    return res.json({ ...result, counts: fleet.counts });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
