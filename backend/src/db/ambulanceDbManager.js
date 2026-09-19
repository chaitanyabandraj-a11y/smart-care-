const hospitalDbManager = require('./hospitalDbManager');
const emergencyDb = require('./emergencyDb');
const crypto = require('crypto');

// Ensure tables exist in the given hospital database
function initHospitalAmbulanceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ambulance_drivers (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      vehicle_type TEXT DEFAULT 'Advanced Life Support (ALS) Ambulance',
      password TEXT NOT NULL,
      otp_code TEXT,
      is_verified INTEGER DEFAULT 1,
      duty_status TEXT DEFAULT 'off_duty', -- 'on_duty', 'off_duty', 'on_service'
      current_lat REAL,
      current_lng REAL,
      current_ride_id TEXT,
      registered_at TEXT,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ambulance_rides (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      patient_lat REAL NOT NULL,
      patient_lng REAL NOT NULL,
      patient_address TEXT,
      symptoms TEXT,
      status TEXT NOT NULL, -- 'ASSIGNED', 'EN_ROUTE_PICKUP', 'PATIENT_PICKED_UP', 'COMPLETED'
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  // Ensure incoming_emergencies has columns for allotted driver
  try { db.exec("ALTER TABLE incoming_emergencies ADD COLUMN allotted_driver_id TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE incoming_emergencies ADD COLUMN allotted_driver_name TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE incoming_emergencies ADD COLUMN allotted_driver_phone TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE incoming_emergencies ADD COLUMN allotted_vehicle_plate TEXT;"); } catch (_) {}
}

// Get all drivers for a specific hospital with real-time status counts
function getHospitalDrivers(hospitalId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const drivers = db.prepare(`
    SELECT id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
           is_verified, duty_status, current_lat, current_lng, current_ride_id,
           registered_at, last_login_at
    FROM ambulance_drivers
    ORDER BY duty_status ASC, name ASC
  `).all();

  const onDutyCount = drivers.filter(d => d.duty_status === 'on_duty').length;
  const offDutyCount = drivers.filter(d => d.duty_status === 'off_duty').length;
  const onServiceCount = drivers.filter(d => d.duty_status === 'on_service').length;

  return {
    success: true,
    hospitalId,
    counts: {
      total: drivers.length,
      onDuty: onDutyCount,
      offDuty: offDutyCount,
      onService: onServiceCount
    },
    drivers
  };
}

// Get driver by ID
function getDriverById(hospitalId, driverId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const driver = db.prepare(`
    SELECT id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
           is_verified, duty_status, current_lat, current_lng, current_ride_id,
           registered_at, last_login_at
    FROM ambulance_drivers
    WHERE id = ?
  `).get(driverId);

  if (!driver) return null;

  let activeRide = null;
  if (driver.current_ride_id) {
    const rideRow = db.prepare(`
      SELECT * FROM ambulance_rides WHERE id = ?
    `).get(driver.current_ride_id);
    if (rideRow && rideRow.status !== 'COMPLETED') {
      activeRide = formatRideRow(rideRow);
    }
  }

  return {
    ...driver,
    activeRide
  };
}

// Helper to format ride rows consistently with both camelCase and snake_case properties
function formatRideRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id || row.id,
    request_id: row.request_id || row.id,
    driverId: row.driver_id,
    driver_id: row.driver_id,
    patientName: row.patient_name,
    patient_name: row.patient_name,
    patientPhone: row.patient_phone,
    patient_phone: row.patient_phone,
    phone: row.patient_phone,
    patientLat: row.patient_lat,
    patient_lat: row.patient_lat,
    patientLng: row.patient_lng,
    patient_lng: row.patient_lng,
    patientAddress: row.patient_address,
    patient_address: row.patient_address,
    address: row.patient_address,
    symptoms: row.symptoms,
    status: row.status,
    startedAt: row.started_at,
    started_at: row.started_at
  };
}

// Driver Registration (Step 1: Check uniqueness & generate OTP)
function registerDriver(hospitalId, { name, phone, email, driverId, vehiclePlate, password }) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const cleanDriverId = driverId.trim().toUpperCase();
  const cleanPhone = phone.trim();
  const cleanEmail = email.trim().toLowerCase();

  // Check if driver ID or phone exists
  const existingById = db.prepare('SELECT id FROM ambulance_drivers WHERE id = ?').get(cleanDriverId);
  if (existingById) {
    return { success: false, error: `Driver ID '${cleanDriverId}' is already registered at this hospital.` };
  }

  const existingByPhone = db.prepare('SELECT id FROM ambulance_drivers WHERE phone = ?').get(cleanPhone);
  if (existingByPhone) {
    return { success: false, error: `Phone number '${cleanPhone}' is already registered.` };
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ambulance_drivers (
      id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
      password, otp_code, is_verified, duty_status, registered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'Advanced Life Support (ALS) Ambulance', ?, ?, 0, 'off_duty', ?)
  `).run(
    cleanDriverId, hospitalId, name.trim(), cleanPhone, cleanEmail,
    vehiclePlate.trim().toUpperCase(), password, otpCode, now
  );

  return {
    success: true,
    message: `Driver registration initiated. Verification OTP sent to ${cleanPhone} and ${cleanEmail}.`,
    driverId: cleanDriverId,
    phone: cleanPhone,
    email: cleanEmail,
    otpCode // Sent in response for interactive demo testing
  };
}

// Verify Driver OTP (Step 2: Activates account)
function verifyDriverOtp(hospitalId, { driverId, otpCode }) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const cleanDriverId = driverId.trim().toUpperCase();
  const driver = db.prepare('SELECT * FROM ambulance_drivers WHERE id = ?').get(cleanDriverId);

  if (!driver) {
    return { success: false, error: 'Driver record not found.' };
  }

  if (driver.otp_code !== otpCode) {
    return { success: false, error: 'Invalid verification OTP code. Please try again.' };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ambulance_drivers
    SET is_verified = 1, otp_code = NULL, last_login_at = ?
    WHERE id = ?
  `).run(now, cleanDriverId);

  return {
    success: true,
    message: 'OTP verified successfully! Driver account activated and authenticated.',
    driver: {
      id: driver.id,
      hospitalId: driver.hospital_id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      vehiclePlate: driver.vehicle_plate,
      vehicleType: driver.vehicle_type,
      dutyStatus: driver.duty_status,
      isVerified: true
    }
  };
}

// Driver Login (Credentials: ID/Phone + Password)
function loginDriver(hospitalId, { identifier, password }) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const cleanIdentifier = identifier.trim();
  const driver = db.prepare(`
    SELECT * FROM ambulance_drivers
    WHERE (id = ? OR phone = ? OR email = ?) AND hospital_id = ?
  `).get(cleanIdentifier.toUpperCase(), cleanIdentifier, cleanIdentifier.toLowerCase(), hospitalId);

  if (!driver) {
    return { success: false, error: `No registered driver found with ID/phone '${cleanIdentifier}' at this hospital.` };
  }

  if (driver.password !== password) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  if (driver.is_verified === 0) {
    return {
      success: false,
      needsVerification: true,
      driverId: driver.id,
      error: 'Account requires OTP verification. Please verify your phone and email.'
    };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE ambulance_drivers
    SET last_login_at = ?
    WHERE id = ?
  `).run(now, driver.id);

  let activeRide = null;
  if (driver.current_ride_id) {
    const rideRow = db.prepare('SELECT * FROM ambulance_rides WHERE id = ?').get(driver.current_ride_id);
    if (rideRow && rideRow.status !== 'COMPLETED') {
      activeRide = formatRideRow(rideRow);
    }
  }

  return {
    success: true,
    message: `Welcome back, Captain ${driver.name}!`,
    driver: {
      id: driver.id,
      hospitalId: driver.hospital_id,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      vehiclePlate: driver.vehicle_plate,
      vehicleType: driver.vehicle_type,
      dutyStatus: driver.duty_status,
      currentLat: driver.current_lat,
      currentLng: driver.current_lng,
      currentRideId: driver.current_ride_id,
      isVerified: true
    },
    activeRide
  };
}

// Update Driver Duty Status (on_duty <-> off_duty)
function updateDutyStatus(hospitalId, driverId, dutyStatus) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  if (!['on_duty', 'off_duty'].includes(dutyStatus)) {
    return { success: false, error: 'Duty status must be either on_duty or off_duty.' };
  }

  const driver = db.prepare('SELECT * FROM ambulance_drivers WHERE id = ?').get(driverId);
  if (!driver) return { success: false, error: 'Driver not found.' };

  if (driver.duty_status === 'on_service' && dutyStatus === 'off_duty') {
    return { success: false, error: 'Cannot go off duty while an emergency ride is currently active.' };
  }

  db.prepare(`
    UPDATE ambulance_drivers
    SET duty_status = ?
    WHERE id = ?
  `).run(dutyStatus, driverId);

  // Log in hospital realtime_logs
  const now = new Date().toISOString();
  const desc = `Ambulance Driver ${driver.name} (${driver.vehicle_plate}) switched duty to ${dutyStatus === 'on_duty' ? 'ON DUTY (Available)' : 'OFF DUTY'}`;
  try {
    db.prepare(`
      INSERT INTO realtime_logs (timestamp, category, admin_name, description)
      VALUES (?, 'AMBULANCE_DUTY', ?, ?)
    `).run(now, driver.name, desc);
  } catch (_) {}

  return {
    success: true,
    driverId,
    dutyStatus,
    message: `Duty switched to ${dutyStatus === 'on_duty' ? 'ON DUTY' : 'OFF DUTY'}.`
  };
}

// Update Driver Location Ping
function updateDriverLocation(hospitalId, driverId, lat, lng) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  db.prepare(`
    UPDATE ambulance_drivers
    SET current_lat = ?, current_lng = ?
    WHERE id = ?
  `).run(lat, lng, driverId);

  // If driver has an active ride, also update in emergencyDb
  const driver = db.prepare('SELECT current_ride_id FROM ambulance_drivers WHERE id = ?').get(driverId);
  if (driver?.current_ride_id) {
    emergencyDb.updateDriverLocationInRequest(driver.current_ride_id, lat, lng);
  }

  return { success: true, lat, lng };
}

// Driver Accepts Emergency Ride (Atomic first-come first-served)
function acceptEmergencyRide(hospitalId, driverId, requestId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  // 1. Check emergency request status in emergencyDb
  const request = emergencyDb.getEmergencyRequest(requestId);
  if (!request) {
    return { success: false, error: 'Emergency request not found.' };
  }

  if (request.allotted_driver_id) {
    return {
      success: false,
      alreadyAllotted: true,
      error: `This emergency has already been accepted by Driver ${request.allotted_driver_name} (${request.allotted_vehicle_plate}).`
    };
  }

  // 2. Fetch driver record
  const driver = db.prepare('SELECT * FROM ambulance_drivers WHERE id = ?').get(driverId);
  if (!driver) {
    return { success: false, error: 'Driver record not found.' };
  }

  const now = new Date().toISOString();
  const rideId = requestId; // 1:1 mapping

  // 3. Insert into ambulance_rides in hospital DB
  db.prepare(`
    INSERT OR REPLACE INTO ambulance_rides (
      id, request_id, driver_id, patient_name, patient_phone,
      patient_lat, patient_lng, patient_address, symptoms,
      status, started_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?)
  `).run(
    rideId, requestId, driver.id, request.patient_name, request.phone,
    request.patient_lat, request.patient_lng, request.patient_address || '',
    request.symptoms, now
  );

  // 4. Update driver status to 'off_duty' (busy in ride / unavailable for other dispatches)
  db.prepare(`
    UPDATE ambulance_drivers
    SET duty_status = 'off_duty', current_ride_id = ?
    WHERE id = ?
  `).run(rideId, driverId);

  // 5. Update incoming_emergencies in hospital DB with allotted driver details
  try {
    db.prepare(`
      UPDATE incoming_emergencies
      SET allotted_driver_id = ?, allotted_driver_name = ?, allotted_driver_phone = ?, allotted_vehicle_plate = ?
      WHERE request_id = ?
    `).run(driver.id, driver.name, driver.phone, driver.vehicle_plate, requestId);
  } catch (_) {}

  // 6. Update emergency_requests in central emergencyDb
  emergencyDb.assignDriverToRequest(requestId, {
    driverId: driver.id,
    driverName: driver.name,
    driverPhone: driver.phone,
    vehiclePlate: driver.vehicle_plate,
    driverLat: driver.current_lat || null,
    driverLng: driver.current_lng || null
  });

  // 7. Log in hospital realtime_logs
  try {
    db.prepare(`
      INSERT INTO realtime_logs (timestamp, category, admin_name, description)
      VALUES (?, 'AMBULANCE_ASSIGNED', ?, ?)
    `).run(now, driver.name, `Driver ${driver.name} (${driver.vehicle_plate}) accepted Emergency Ride #${requestId} for patient ${request.patient_name}.`);
  } catch (_) {}

  return {
    success: true,
    message: `Emergency Ride #${requestId} successfully allotted to you!`,
    ride: {
      id: rideId,
      requestId,
      request_id: requestId,
      driverId: driver.id,
      driver_id: driver.id,
      driverName: driver.name,
      driver_name: driver.name,
      driverPhone: driver.phone,
      driver_phone: driver.phone,
      vehiclePlate: driver.vehicle_plate,
      vehicle_plate: driver.vehicle_plate,
      patientName: request.patient_name,
      patient_name: request.patient_name,
      patientPhone: request.phone,
      patient_phone: request.phone,
      phone: request.phone,
      patientLat: request.patient_lat,
      patient_lat: request.patient_lat,
      patientLng: request.patient_lng,
      patient_lng: request.patient_lng,
      patientAddress: request.patient_address,
      patient_address: request.patient_address,
      address: request.patient_address,
      symptoms: request.symptoms,
      status: 'ASSIGNED',
      startedAt: now,
      started_at: now
    }
  };
}

// Update Ride Stage (EN_ROUTE_PICKUP, PATIENT_PICKED_UP, etc.)
function updateRideStage(hospitalId, driverId, rideId, stage) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  db.prepare(`
    UPDATE ambulance_rides
    SET status = ?
    WHERE id = ? AND driver_id = ?
  `).run(stage, rideId, driverId);

  emergencyDb.updateRideStageInRequest(rideId, stage);

  return { success: true, rideId, stage };
}

// Complete Ride -> Status reverts to 'on_duty'
function completeEmergencyRide(hospitalId, driverId, rideId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  const now = new Date().toISOString();

  // 1. Mark ride completed in hospital DB
  db.prepare(`
    UPDATE ambulance_rides
    SET status = 'COMPLETED', completed_at = ?
    WHERE id = ? AND driver_id = ?
  `).run(now, rideId, driverId);

  // 2. Reset driver status back to 'on_duty'
  db.prepare(`
    UPDATE ambulance_drivers
    SET duty_status = 'on_duty', current_ride_id = NULL
    WHERE id = ?
  `).run(driverId);

  // 3. Mark completed in emergencyDb
  emergencyDb.completeEmergencyRide(rideId);

  // 4. Log in hospital realtime_logs
  const driver = db.prepare('SELECT name, vehicle_plate FROM ambulance_drivers WHERE id = ?').get(driverId);
  if (driver) {
    try {
      db.prepare(`
        INSERT INTO realtime_logs (timestamp, category, admin_name, description)
        VALUES (?, 'AMBULANCE_COMPLETED', ?, ?)
      `).run(now, driver.name, `Driver ${driver.name} completed Emergency Ride #${rideId}. Arrived at hospital. Driver is now ON DUTY (Available).`);
    } catch (_) {}
  }

  return {
    success: true,
    message: 'Emergency ride completed successfully! Welcome back to hospital base. Status is now ON DUTY.',
    driverId,
    dutyStatus: 'on_duty'
  };
}

// Query on-duty drivers for dispatch
function getOnDutyDrivers(hospitalId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  return db.prepare(`
    SELECT id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
           current_lat, current_lng, duty_status
    FROM ambulance_drivers
    WHERE duty_status = 'on_duty' AND is_verified = 1
  `).all();
}

// Query on-service drivers for fallback dispatch
function getOnServiceDrivers(hospitalId) {
  const db = hospitalDbManager.getHospitalDb(hospitalId);
  initHospitalAmbulanceTables(db);

  return db.prepare(`
    SELECT id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
           current_lat, current_lng, current_ride_id, duty_status
    FROM ambulance_drivers
    WHERE duty_status = 'on_service' AND is_verified = 1
  `).all();
}

// Query pending emergency dispatches for a hospital waiting for driver acceptance
function getPendingDispatchesForHospital(hospitalId, driverId = null) {
  try {
    const list = emergencyDb.emergencyDb.prepare(`
      SELECT * FROM emergency_requests
      WHERE accepted_hospital_id = ? AND status = 'ACCEPTED' AND (allotted_driver_id IS NULL OR allotted_driver_id = '')
      ORDER BY accepted_at DESC
    `).all(hospitalId);

    const now = Date.now();
    const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes window

    return list
      .filter(req => {
        // Exclude if accepted more than 30 minutes ago
        if (req.accepted_at) {
          const age = now - new Date(req.accepted_at).getTime();
          if (age > MAX_AGE_MS) return false;
        }

        // Exclude if driverId has declined this request
        if (driverId && req.declined_driver_ids) {
          try {
            const declinedList = JSON.parse(req.declined_driver_ids);
            if (Array.isArray(declinedList) && declinedList.includes(driverId)) {
              return false;
            }
          } catch (_) {}
        }
        return true;
      })
      .map(req => {
        let queue = [];
        try {
          queue = JSON.parse(req.hospital_queue || req.hospital_queue_json || '[]');
        } catch (_) {}
        const myHospital = queue.find(h => h.id === hospitalId) || {};

        return {
          requestId: req.id,
          patientName: req.patient_name,
          phone: req.phone,
          symptoms: req.symptoms,
          patientLat: req.patient_lat,
          patientLng: req.patient_lng,
          patientAddress: req.patient_address,
          hospitalId: myHospital.id || hospitalId,
          hospitalName: myHospital.name || 'Hospital Base',
          hospitalAddress: myHospital.address || '',
          hospitalLat: myHospital.lat,
          hospitalLng: myHospital.lng,
          distanceKm: myHospital.distanceKm || 5.0,
          acceptedAt: req.accepted_at,
          dispatchedAt: req.accepted_at
        };
      });
  } catch (err) {
    console.error('Error in getPendingDispatchesForHospital:', err.message);
    return [];
  }
}

module.exports = {
  initHospitalAmbulanceTables,
  getHospitalDrivers,
  getDriverById,
  registerDriver,
  verifyDriverOtp,
  loginDriver,
  updateDutyStatus,
  updateDriverLocation,
  acceptEmergencyRide,
  updateRideStage,
  completeEmergencyRide,
  getOnDutyDrivers,
  getOnServiceDrivers,
  getPendingDispatchesForHospital
};

