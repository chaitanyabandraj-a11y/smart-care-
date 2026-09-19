const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const EMERGENCY_DATA_DIR = path.join(__dirname, '../../data/emergency');

if (!fs.existsSync(EMERGENCY_DATA_DIR)) {
  fs.mkdirSync(EMERGENCY_DATA_DIR, { recursive: true });
}

const dbPath = path.join(EMERGENCY_DATA_DIR, 'emergency.db');
const emergencyDb = new DatabaseSync(dbPath);

// Initialize schema
emergencyDb.exec(`
  CREATE TABLE IF NOT EXISTS emergency_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    otp_code TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS emergency_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    symptoms TEXT NOT NULL,
    patient_lat REAL NOT NULL,
    patient_lng REAL NOT NULL,
    hospital_queue TEXT NOT NULL, -- JSON string of ranked hospital objects
    current_hospital_index INTEGER DEFAULT 0,
    current_hospital_id TEXT NOT NULL,
    step_started_at TEXT NOT NULL,
    step_expires_at TEXT NOT NULL,
    status TEXT NOT NULL, -- 'ROUTING', 'ACCEPTED', 'EXHAUSTED', 'CANCELLED'
    accepted_hospital_id TEXT,
    accepted_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emergency_routing_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    hospital_id TEXT NOT NULL,
    hospital_name TEXT NOT NULL,
    action TEXT NOT NULL, -- 'DISPATCHED', 'TIMEOUT', 'REJECTED', 'ACCEPTED'
    timestamp TEXT NOT NULL
  );
`);

try {
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN patient_address TEXT');
} catch (_) {}
try {
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN allotted_driver_id TEXT');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN allotted_driver_name TEXT');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN allotted_driver_phone TEXT');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN allotted_vehicle_plate TEXT');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN driver_lat REAL');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN driver_lng REAL');
  emergencyDb.exec('ALTER TABLE emergency_requests ADD COLUMN ride_stage TEXT');
} catch (_) {}
try {
  emergencyDb.exec("ALTER TABLE emergency_requests ADD COLUMN declined_driver_ids TEXT DEFAULT '[]'");
} catch (_) {}

// Auto-cleanup stale unallotted requests on startup
try {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET status = 'CANCELLED'
    WHERE status = 'ACCEPTED' AND (allotted_driver_id IS NULL OR allotted_driver_id = '') AND accepted_at < ?
  `).run(cutoff);
} catch (_) {}

console.log('[Emergency DB] Initialized emergency.db schema successfully');

// User Registration: Saves name, phone, email, password, generates initial OTP
function registerEmergencyUser({ name, phone, email, password }) {
  const existingByPhone = emergencyDb.prepare('SELECT id FROM emergency_users WHERE phone = ?').get(phone);
  if (existingByPhone) {
    return { success: false, error: 'Phone number already registered. Please log in.' };
  }

  const existingByEmail = emergencyDb.prepare('SELECT id FROM emergency_users WHERE email = ?').get(email);
  if (existingByEmail) {
    return { success: false, error: 'Email already registered. Please log in.' };
  }

  const userId = crypto.randomUUID();
  // Realistic 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  emergencyDb.prepare(`
    INSERT INTO emergency_users (id, name, phone, email, password, otp_code, is_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(userId, name, phone, email, password, otpCode, now);

  return {
    success: true,
    message: `Registration initiated. Verification OTP sent to ${phone} and ${email}.`,
    userId,
    phone,
    email,
    otpCode // Provided in response for easy demonstration & verification
  };
}

// Verify OTP for Registration
function verifyRegistrationOtp({ userId, otpCode }) {
  const user = emergencyDb.prepare('SELECT * FROM emergency_users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.otp_code !== otpCode) {
    return { success: false, error: 'Invalid verification OTP. Please check and try again.' };
  }

  const now = new Date().toISOString();
  emergencyDb.prepare(`
    UPDATE emergency_users
    SET is_verified = 1, otp_code = NULL, last_login_at = ?
    WHERE id = ?
  `).run(now, userId);

  return {
    success: true,
    message: 'OTP verified successfully! Account registered and authenticated.',
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      isVerified: true
    }
  };
}

// Login: Step 1 - Validate Phone/Email & Password, generate and send Login OTP
function requestLoginOtp({ identifier, password }) {
  const user = emergencyDb.prepare(`
    SELECT * FROM emergency_users
    WHERE phone = ? OR email = ?
  `).get(identifier, identifier);

  if (!user) {
    return { success: false, error: 'No account found with this phone number or email.' };
  }

  if (user.password !== password) {
    return { success: false, error: 'Incorrect password.' };
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  emergencyDb.prepare(`
    UPDATE emergency_users
    SET otp_code = ?
    WHERE id = ?
  `).run(otpCode, user.id);

  return {
    success: true,
    message: `Password verified. Security login OTP sent to ${user.phone}.`,
    userId: user.id,
    phone: user.phone,
    otpCode // Provided in response for interactive demonstration
  };
}

// Login: Step 2 - Verify Login OTP
function verifyLoginOtp({ userId, otpCode }) {
  const user = emergencyDb.prepare('SELECT * FROM emergency_users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  if (user.otp_code !== otpCode) {
    return { success: false, error: 'Invalid login OTP. Please check and try again.' };
  }

  const now = new Date().toISOString();
  emergencyDb.prepare(`
    UPDATE emergency_users
    SET otp_code = NULL, last_login_at = ?
    WHERE id = ?
  `).run(now, userId);

  return {
    success: true,
    message: 'Login successful! Welcome back.',
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      isVerified: true
    }
  };
}

// Emergency Requests queries
function createEmergencyRequest({ userId, patientName, phone, symptoms, lat, lng, address, hospitalQueue }) {
  const requestId = crypto.randomUUID();
  const now = new Date();
  const stepStartedAt = now.toISOString();
  const stepExpiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 minutes countdown
  const firstHospital = hospitalQueue[0];

  emergencyDb.prepare(`
    INSERT INTO emergency_requests (
      id, user_id, patient_name, phone, symptoms,
      patient_lat, patient_lng, patient_address, hospital_queue,
      current_hospital_index, current_hospital_id,
      step_started_at, step_expires_at, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'ROUTING', ?)
  `).run(
    requestId, userId, patientName, phone, symptoms,
    lat, lng, address || '', JSON.stringify(hospitalQueue),
    firstHospital.id, stepStartedAt, stepExpiresAt, stepStartedAt
  );

  emergencyDb.prepare(`
    INSERT INTO emergency_routing_logs (request_id, hospital_id, hospital_name, action, timestamp)
    VALUES (?, ?, ?, 'DISPATCHED', ?)
  `).run(requestId, firstHospital.id, firstHospital.name, stepStartedAt);

  return getEmergencyRequest(requestId);
}

function getEmergencyRequest(requestId) {
  const row = emergencyDb.prepare('SELECT * FROM emergency_requests WHERE id = ?').get(requestId);
  if (!row) return null;

  return {
    ...row,
    hospital_queue: JSON.parse(row.hospital_queue)
  };
}

function updateRequestRouting(requestId, { nextIndex, nextHospitalId, stepStartedAt, stepExpiresAt }) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET current_hospital_index = ?, current_hospital_id = ?,
        step_started_at = ?, step_expires_at = ?
    WHERE id = ?
  `).run(nextIndex, nextHospitalId, stepStartedAt, stepExpiresAt, requestId);
}

function markRequestAccepted(requestId, hospitalId) {
  const now = new Date().toISOString();
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET status = 'ACCEPTED', accepted_hospital_id = ?, accepted_at = ?
    WHERE id = ?
  `).run(hospitalId, now, requestId);
}

function markRequestExhausted(requestId) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET status = 'EXHAUSTED'
    WHERE id = ?
  `).run(requestId);
}

function logRoutingAction(requestId, hospitalId, hospitalName, action) {
  const now = new Date().toISOString();
  emergencyDb.prepare(`
    INSERT INTO emergency_routing_logs (request_id, hospital_id, hospital_name, action, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(requestId, hospitalId, hospitalName, action, now);
}

function getRoutingLogs(requestId) {
  return emergencyDb.prepare('SELECT * FROM emergency_routing_logs WHERE request_id = ? ORDER BY id ASC').all(requestId);
}

function assignDriverToRequest(requestId, { driverId, driverName, driverPhone, vehiclePlate, driverLat, driverLng }) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET allotted_driver_id = ?,
        allotted_driver_name = ?,
        allotted_driver_phone = ?,
        allotted_vehicle_plate = ?,
        driver_lat = ?,
        driver_lng = ?,
        ride_stage = 'ASSIGNED'
    WHERE id = ?
  `).run(driverId, driverName, driverPhone, vehiclePlate, driverLat || null, driverLng || null, requestId);
  return getEmergencyRequest(requestId);
}

function updateDriverLocationInRequest(requestId, lat, lng) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET driver_lat = ?, driver_lng = ?
    WHERE id = ?
  `).run(lat, lng, requestId);
}

function updateRideStageInRequest(requestId, rideStage) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET ride_stage = ?
    WHERE id = ?
  `).run(rideStage, requestId);
}

function completeEmergencyRide(requestId) {
  emergencyDb.prepare(`
    UPDATE emergency_requests
    SET ride_stage = 'COMPLETED'
    WHERE id = ?
  `).run(requestId);
}

function recordDriverDecline(requestId, driverId) {
  const req = emergencyDb.prepare('SELECT declined_driver_ids FROM emergency_requests WHERE id = ?').get(requestId);
  if (!req) return;
  let list = [];
  try {
    list = JSON.parse(req.declined_driver_ids || '[]');
  } catch (_) {}
  if (!Array.isArray(list)) list = [];
  if (!list.includes(driverId)) {
    list.push(driverId);
    emergencyDb.prepare(`
      UPDATE emergency_requests
      SET declined_driver_ids = ?
      WHERE id = ?
    `).run(JSON.stringify(list), requestId);
  }
}

module.exports = {
  emergencyDb,
  registerEmergencyUser,
  verifyRegistrationOtp,
  requestLoginOtp,
  verifyLoginOtp,
  createEmergencyRequest,
  getEmergencyRequest,
  updateRequestRouting,
  markRequestAccepted,
  markRequestExhausted,
  logRoutingAction,
  getRoutingLogs,
  assignDriverToRequest,
  updateDriverLocationInRequest,
  updateRideStageInRequest,
  completeEmergencyRide,
  recordDriverDecline
};
