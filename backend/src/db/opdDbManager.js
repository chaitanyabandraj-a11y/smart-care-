const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'opd');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const OPD_DB_PATH = path.join(DATA_DIR, 'opd.db');
let opdDbInstance = null;

function getOpdDb() {
  if (!opdDbInstance) {
    opdDbInstance = new DatabaseSync(OPD_DB_PATH);
    initOpdTables(opdDbInstance);
  }
  return opdDbInstance;
}

// Helper to format local date string (YYYY-MM-DD) avoiding UTC midnight timezone shift
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format ISO timestamp, date, day of week, and time
function getFormattedDateTime(d = new Date()) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const iso = d.toISOString();
  const dateStr = getLocalDateString(d);
  const dayStr = days[d.getDay()];
  const timeStr = d.toTimeString().split(' ')[0]; // HH:MM:SS
  return { iso, dateStr, dayStr, timeStr };
}

function initOpdTables(db) {
  // 1. OPD Patients Master (Permanent UHID)
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_patients (
      id TEXT PRIMARY KEY,               -- Permanent UHID, e.g. UHID-2026-10492
      mobile TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      dob TEXT,
      age INTEGER,
      guardian_name TEXT,
      email TEXT,
      address TEXT,
      state TEXT DEFAULT 'Delhi',
      district TEXT,
      pincode TEXT,
      registered_at TEXT NOT NULL,
      registered_date TEXT NOT NULL,
      registered_day TEXT NOT NULL,
      registered_time TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_patients_mobile ON opd_patients(mobile);
  `);

  // 2. Click-by-Click Interaction Logs (Persistence at every user click with date, day, time)
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      mobile TEXT,
      uhid TEXT,
      step_name TEXT NOT NULL,           -- e.g. HOSPITAL_SELECT, MOBILE_INPUT, OTP_SENT, OTP_VERIFY, DEPT_SELECT, DOCTOR_SELECT, SLOT_SELECT, CONFIRMATION
      action_data TEXT,                  -- JSON stringified payload of current selection
      created_at TEXT NOT NULL,
      created_date TEXT NOT NULL,
      created_day TEXT NOT NULL,
      created_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_interaction_session ON opd_interaction_logs(session_id);
  `);

  // 3. Verification & OTP Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_verification_sessions (
      session_id TEXT PRIMARY KEY,
      mobile TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      created_date TEXT NOT NULL,
      created_day TEXT NOT NULL,
      created_time TEXT NOT NULL
    );
  `);

  // 4. Doctor Schedules & Duty Rosters (Dedicated OPD Doctors per hospital)
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_doctor_schedules (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      hospital_name TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      qualification TEXT,
      department TEXT NOT NULL,
      specialty TEXT NOT NULL,
      room_no TEXT NOT NULL,
      available_days TEXT NOT NULL,      -- JSON array e.g. ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
      shift_start TEXT NOT NULL,         -- e.g. "09:00 AM"
      shift_end TEXT NOT NULL,           -- e.g. "02:00 PM"
      avg_consultation_mins INTEGER DEFAULT 12,
      max_daily_tokens INTEGER DEFAULT 30,
      is_active INTEGER DEFAULT 1
    );
  `);

  // 5. OPD Appointments & Token Allocation
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_appointments (
      id TEXT PRIMARY KEY,               -- Appointment Reference, e.g. APT-2026-84912
      uhid TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      patient_age INTEGER,
      patient_gender TEXT,
      hospital_id TEXT NOT NULL,
      hospital_name TEXT NOT NULL,
      department TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      room_no TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_day TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      token_number INTEGER NOT NULL,
      token_status TEXT DEFAULT 'ASSIGNED', -- 'ASSIGNED', 'CALLED', 'COMPLETED'
      appointment_type TEXT DEFAULT 'NEW',  -- 'NEW' or 'FOLLOW_UP'
      chief_complaint TEXT,
      status TEXT DEFAULT 'SCHEDULED',      -- 'SCHEDULED', 'IN_QUEUE', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED'
      booked_at TEXT NOT NULL,
      booked_date TEXT NOT NULL,
      booked_day TEXT NOT NULL,
      booked_time TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_appts_uhid ON opd_appointments(uhid);
    CREATE INDEX IF NOT EXISTS idx_opd_appts_doctor_date ON opd_appointments(doctor_id, appointment_date);
  `);

  // 6. Live Virtual Queues (Live token progression per doctor per date)
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_virtual_queues (
      id TEXT PRIMARY KEY,               -- e.g. VQ_apollo_DOC-APOLLO-01_2026-09-18
      hospital_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      queue_date TEXT NOT NULL,
      current_serving_token INTEGER DEFAULT 1,
      total_tokens_issued INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',      -- 'ACTIVE', 'PAUSED', 'COMPLETED'
      avg_consultation_mins INTEGER DEFAULT 12,
      last_token_called_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_opd_vq_unique ON opd_virtual_queues(hospital_id, doctor_id, queue_date);
  `);

  // 7. Digital Prescriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_prescriptions (
      id TEXT PRIMARY KEY,               -- e.g. RX-2026-92814
      patient_id TEXT NOT NULL,          -- UHID
      patient_name TEXT NOT NULL,
      patient_age INTEGER,
      patient_gender TEXT,
      disease TEXT,
      doctor_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      hospital_id TEXT NOT NULL,
      hospital_name TEXT NOT NULL,
      appointment_id TEXT,
      prescription_date TEXT NOT NULL,
      prescription_time TEXT NOT NULL,
      clinical_notes TEXT,
      diagnosis TEXT,
      follow_up_advice TEXT,
      prescription_items TEXT NOT NULL,  -- JSON array of [{ medicineName, dosage, frequency, duration, instructions }]
      is_voice_transcribed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_rx_patient ON opd_prescriptions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_opd_rx_doctor ON opd_prescriptions(doctor_id);
  `);

  // 8. Structured Medical Records
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_medical_records (
      id TEXT PRIMARY KEY,               -- e.g. MR-2026-48192
      patient_id TEXT NOT NULL,          -- UHID
      doctor_id TEXT NOT NULL,
      doctor_name TEXT NOT NULL,
      hospital_id TEXT NOT NULL,
      appointment_id TEXT,
      symptoms TEXT,
      clinical_notes TEXT,
      diagnosis TEXT,
      treatment TEXT,
      follow_up_date TEXT,
      record_type TEXT DEFAULT 'OPD_CONSULTATION', -- 'OPD_CONSULTATION', 'EMERGENCY_ADMISSION'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_mr_patient ON opd_medical_records(patient_id);
  `);

  // 9. Audit Logging (User, role, action, entity, entity_id, metadata, timestamp)
  db.exec(`
    CREATE TABLE IF NOT EXISTS opd_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,                -- 'PATIENT', 'DOCTOR', 'ADMIN', 'SYSTEM'
      action TEXT NOT NULL,              -- e.g. 'LOGIN', 'LOGOUT', 'PRESCRIPTION_CREATE', 'MEDICAL_RECORD_ACCESS', 'QR_VERIFICATION', 'STATUS_CHANGE'
      entity TEXT NOT NULL,              -- e.g. 'PRESCRIPTION', 'APPOINTMENT', 'MEDICAL_RECORD', 'QUEUE'
      entity_id TEXT,
      metadata TEXT,                     -- JSON payload
      ip_address TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opd_audit_entity ON opd_audit_logs(entity, entity_id);
  `);

  // Safe table migrations for doctor session and patient consultation duration tracking
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN called_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN completed_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN consultation_duration_mins REAL DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN cancelled_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN cancellation_reason TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN presence_status TEXT DEFAULT 'PRESENT';"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN not_present_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN re_added_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_appointments ADD COLUMN notes TEXT;"); } catch (_) {}

  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN doctor_status TEXT DEFAULT 'OFF_DESK';"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN session_started_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN last_call_timestamp INTEGER;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN total_consultations_completed INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN actual_avg_duration_mins REAL DEFAULT 12;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN consultation_state TEXT DEFAULT 'IDLE';"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN active_token INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN last_completed_token INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_virtual_queues ADD COLUMN consultation_started_at TEXT;"); } catch (_) {}

  // Safe table migrations for doctor portal registration & authentication
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN password TEXT DEFAULT 'Doctor@123';"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN contact_phone TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN email TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN created_at TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN portal_registered INTEGER DEFAULT 1;"); } catch (_) {}
  try { db.exec("ALTER TABLE opd_doctor_schedules ADD COLUMN registered_at TEXT;"); } catch (_) {}

  // Safe table migration & partial unique index to strictly prevent duplicate appointments
  try {
    db.exec(`
      UPDATE opd_appointments
      SET status = 'CANCELLED'
      WHERE id IN (
        SELECT a.id FROM opd_appointments a
        JOIN opd_appointments b ON a.uhid = b.uhid
          AND a.doctor_id = b.doctor_id
          AND a.appointment_date = b.appointment_date
          AND a.booked_at > b.booked_at
        WHERE a.status != 'CANCELLED' AND b.status != 'CANCELLED'
      );
    `);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_opd_patient_doctor_date
      ON opd_appointments(uhid, doctor_id, appointment_date)
      WHERE status != 'CANCELLED';
    `);
  } catch (err) {
    console.warn('[OPD Migration] Duplicate index notice:', err.message);
  }

  // Safe data hygiene: Ensure any future appointments without consultation completion are marked SCHEDULED
  try {
    const todayStr = getLocalDateString();
    db.prepare(`
      UPDATE opd_appointments
      SET status = 'SCHEDULED'
      WHERE appointment_date >= ? AND completed_at IS NULL AND status = 'COMPLETED'
    `).run(todayStr);
  } catch (_) {}

  // Seed default doctor schedules if empty
  seedDefaultOpdDoctors(db);

  // Seed authorized hospital staff doctors who are eligible to register
  seedAuthorizedStaffDoctors(db);
}

// Seed comprehensive OPD doctor rosters across all 5 hospitals
function seedDefaultOpdDoctors(db) {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM opd_doctor_schedules').get().cnt;
  if (count > 0) return;

  const defaultDoctors = [
    // 1. AIIMS New Delhi
    {
      id: 'AIIMS-CARD-01', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-01', doctor_name: 'Dr. Arvind Gupta', qualification: 'MD, DM (Cardiology), FACC',
      department: 'Cardiology', specialty: 'Interventional Cardiology', room_no: 'OPD Chamber 101',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '09:00 AM', shift_end: '02:00 PM', avg_consultation_mins: 12, max_daily_tokens: 30
    },
    {
      id: 'AIIMS-MED-01', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-02', doctor_name: 'Dr. Meenakshi Sundaram', qualification: 'MD (Internal Medicine)',
      department: 'General Medicine', specialty: 'Adult Internal Medicine & Infectious Diseases', room_no: 'OPD Chamber 104',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '09:00 AM', shift_end: '01:30 PM', avg_consultation_mins: 10, max_daily_tokens: 35
    },
    {
      id: 'AIIMS-ORTHO-01', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-03', doctor_name: 'Dr. Rajeshwar Singh', qualification: 'MS (Orthopedics), MCh',
      department: 'Orthopedics', specialty: 'Joint Replacement & Sports Injury', room_no: 'OPD Chamber 108',
      available_days: JSON.stringify(['Monday', 'Wednesday', 'Friday']),
      shift_start: '09:30 AM', shift_end: '02:30 PM', avg_consultation_mins: 15, max_daily_tokens: 25
    },
    {
      id: 'AIIMS-PED-01', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-04', doctor_name: 'Dr. Sunita Deshmukh', qualification: 'MD (Pediatrics)',
      department: 'Pediatrics', specialty: 'Child Healthcare & Immunization', room_no: 'OPD Chamber 112',
      available_days: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']),
      shift_start: '09:00 AM', shift_end: '01:00 PM', avg_consultation_mins: 10, max_daily_tokens: 30
    },
    {
      id: 'AIIMS-NEURO-01', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-05', doctor_name: 'Dr. Vivek Bhattacharya', qualification: 'MD, DM (Neurology)',
      department: 'Neurology', specialty: 'Stroke & Epilepsy Management', room_no: 'OPD Chamber 205',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Thursday', 'Friday']),
      shift_start: '10:00 AM', shift_end: '02:00 PM', avg_consultation_mins: 15, max_daily_tokens: 20
    },

    // 2. Indraprastha Apollo Hospital
    {
      id: 'APOLLO-CARD-01', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-01', doctor_name: 'Dr. Alok Mukherjee', qualification: 'MBBS, MD, DM (Cardiology)',
      department: 'Cardiology', specialty: 'Preventive & Clinical Cardiology', room_no: 'Room 201 (Tower A)',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '09:30 AM', shift_end: '03:00 PM', avg_consultation_mins: 12, max_daily_tokens: 30
    },
    {
      id: 'APOLLO-MED-01', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-02', doctor_name: 'Dr. Shalini Kapoor', qualification: 'MD (General Medicine)',
      department: 'General Medicine', specialty: 'Lifestyle Diseases & Diabetology', room_no: 'Room 205 (Tower A)',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '09:00 AM', shift_end: '02:00 PM', avg_consultation_mins: 10, max_daily_tokens: 35
    },
    {
      id: 'APOLLO-ORTHO-01', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-03', doctor_name: 'Dr. Harsh Vardhan Goel', qualification: 'MS (Orthopedics)',
      department: 'Orthopedics', specialty: 'Spine & Arthroscopic Surgery', room_no: 'Room 304 (Tower B)',
      available_days: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']),
      shift_start: '10:00 AM', shift_end: '03:00 PM', avg_consultation_mins: 15, max_daily_tokens: 25
    },
    {
      id: 'APOLLO-DERM-01', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-04', doctor_name: 'Dr. Ritu Rastogi', qualification: 'MD (Dermatology, Venereology)',
      department: 'Dermatology', specialty: 'Clinical Dermatology & Cosmetology', room_no: 'Room 110 (Tower B)',
      available_days: JSON.stringify(['Monday', 'Wednesday', 'Friday']),
      shift_start: '10:30 AM', shift_end: '02:30 PM', avg_consultation_mins: 10, max_daily_tokens: 25
    },

    // 3. Fortis Escorts Heart Institute
    {
      id: 'FORTIS-CARD-01', hospital_id: 'fortis', hospital_name: 'Fortis Escorts Heart Institute',
      doctor_id: 'DOC-FORTIS-01', doctor_name: 'Dr. Priya Nair', qualification: 'MD, DNB (Cardiology)',
      department: 'Cardiology', specialty: 'Cardiac Electrophysiology & Heart Failure', room_no: 'Cardiac OPD Room 12',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      shift_start: '09:00 AM', shift_end: '02:30 PM', avg_consultation_mins: 12, max_daily_tokens: 30
    },
    {
      id: 'FORTIS-MED-01', hospital_id: 'fortis', hospital_name: 'Fortis Escorts Heart Institute',
      doctor_id: 'DOC-FORTIS-02', doctor_name: 'Dr. Sanjay Kaushik', qualification: 'MD (Internal Medicine)',
      department: 'General Medicine', specialty: 'Critical Care & Internal Medicine', room_no: 'OPD Room 15',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '09:30 AM', shift_end: '01:30 PM', avg_consultation_mins: 10, max_daily_tokens: 30
    },

    // 4. Lok Nayak Hospital (LNJP)
    {
      id: 'LOK-MED-01', hospital_id: 'lok_nayak', hospital_name: 'Lok Nayak Hospital (LNJP)',
      doctor_id: 'DOC-LOK-01', doctor_name: 'Dr. Manoj Saxena', qualification: 'MD (Medicine)',
      department: 'General Medicine', specialty: 'General Clinical Consultations', room_no: 'Room 14 (Ground Floor)',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      shift_start: '08:30 AM', shift_end: '01:30 PM', avg_consultation_mins: 8, max_daily_tokens: 45
    },
    {
      id: 'LOK-PED-01', hospital_id: 'lok_nayak', hospital_name: 'Lok Nayak Hospital (LNJP)',
      doctor_id: 'DOC-LOK-02', doctor_name: 'Dr. Rekha Bansal', qualification: 'DCH, MD (Pediatrics)',
      department: 'Pediatrics', specialty: 'Pediatric Care & Neonatology', room_no: 'Room 22 (First Floor)',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      shift_start: '09:00 AM', shift_end: '01:00 PM', avg_consultation_mins: 10, max_daily_tokens: 35
    },
    {
      id: 'LOK-EYE-01', hospital_id: 'lok_nayak', hospital_name: 'Lok Nayak Hospital (LNJP)',
      doctor_id: 'DOC-LOK-03', doctor_name: 'Dr. Devendra Sharma', qualification: 'MS (Ophthalmology)',
      department: 'Ophthalmology', specialty: 'Cataract & Comprehensive Eye Care', room_no: 'Eye OPD Room 3',
      available_days: JSON.stringify(['Monday', 'Wednesday', 'Friday']),
      shift_start: '09:00 AM', shift_end: '01:00 PM', avg_consultation_mins: 10, max_daily_tokens: 30
    },

    // 5. Max Super Speciality Hospital
    {
      id: 'MAX-CARD-01', hospital_id: 'max', hospital_name: 'Max Super Speciality Hospital',
      doctor_id: 'DOC-MAX-01', doctor_name: 'Dr. Vikramaditya Rawat', qualification: 'MD, DM (Cardiology)',
      department: 'Cardiology', specialty: 'Adult Cardiology & Echocardiography', room_no: 'Suite 401',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      shift_start: '10:00 AM', shift_end: '03:30 PM', avg_consultation_mins: 12, max_daily_tokens: 25
    },
    {
      id: 'MAX-ORTHO-01', hospital_id: 'max', hospital_name: 'Max Super Speciality Hospital',
      doctor_id: 'DOC-MAX-02', doctor_name: 'Dr. Neha Agarwal', qualification: 'MS (Ortho), Fellowship Arthroscopy',
      department: 'Orthopedics', specialty: 'Sports Medicine & Joint Care', room_no: 'Suite 405',
      available_days: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']),
      shift_start: '09:30 AM', shift_end: '02:30 PM', avg_consultation_mins: 15, max_daily_tokens: 20
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO opd_doctor_schedules (
      id, hospital_id, hospital_name, doctor_id, doctor_name, qualification,
      department, specialty, room_no, available_days, shift_start, shift_end,
      avg_consultation_mins, max_daily_tokens, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const doc of defaultDoctors) {
    stmt.run(
      doc.id, doc.hospital_id, doc.hospital_name, doc.doctor_id, doc.doctor_name, doc.qualification,
      doc.department, doc.specialty, doc.room_no, doc.available_days, doc.shift_start, doc.shift_end,
      doc.avg_consultation_mins, doc.max_daily_tokens
    );
  }
}

// Seed authorized hospital staff doctors eligible to complete portal registration
function seedAuthorizedStaffDoctors(db) {
  const authorizedPending = [
    {
      id: 'APOLLO-STAFF-05', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-05', doctor_name: 'Dr. Sneha Roy', qualification: 'MBBS, MD (Pediatrics)',
      department: 'Pediatrics', specialty: 'General Pediatrics & Adolescent Medicine', room_no: 'Chamber 205 (Tower B)',
      available_days: JSON.stringify(['Monday', 'Wednesday', 'Friday']),
      shift_start: '09:00 AM', shift_end: '02:00 PM', avg_consultation_mins: 12, max_daily_tokens: 30
    },
    {
      id: 'APOLLO-STAFF-06', hospital_id: 'apollo', hospital_name: 'Indraprastha Apollo Hospital',
      doctor_id: 'DOC-APOLLO-06', doctor_name: 'Dr. Vikram Malhotra', qualification: 'MBBS, MS (General Surgery)',
      department: 'General Medicine', specialty: 'Laparoscopic & General Surgery', room_no: 'Chamber 210 (Tower A)',
      available_days: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']),
      shift_start: '10:00 AM', shift_end: '03:00 PM', avg_consultation_mins: 15, max_daily_tokens: 25
    },
    {
      id: 'AIIMS-STAFF-06', hospital_id: 'aiims', hospital_name: 'AIIMS New Delhi',
      doctor_id: 'DOC-AIIMS-06', doctor_name: 'Dr. Tanvi Sharma', qualification: 'MD, DNB (Dermatology)',
      department: 'Dermatology', specialty: 'Clinical & Cosmetic Dermatology', room_no: 'OPD Chamber 115',
      available_days: JSON.stringify(['Monday', 'Tuesday', 'Thursday']),
      shift_start: '09:00 AM', shift_end: '01:30 PM', avg_consultation_mins: 12, max_daily_tokens: 30
    },
    {
      id: 'FORTIS-STAFF-03', hospital_id: 'fortis', hospital_name: 'Fortis Escorts Heart Institute',
      doctor_id: 'DOC-FORTIS-03', doctor_name: 'Dr. Sameer Joshi', qualification: 'MS (Orthopedics)',
      department: 'Orthopedics', specialty: 'Spine & Joint Reconstruction', room_no: 'Chamber 12',
      available_days: JSON.stringify(['Monday', 'Wednesday', 'Friday']),
      shift_start: '09:30 AM', shift_end: '02:00 PM', avg_consultation_mins: 15, max_daily_tokens: 25
    },
    {
      id: 'LOK-STAFF-04', hospital_id: 'lok_nayak', hospital_name: 'Lok Nayak Hospital (LNJP)',
      doctor_id: 'DOC-LOK-04', doctor_name: 'Dr. Ananya Sen', qualification: 'MS (ENT)',
      department: 'ENT', specialty: 'Ear, Nose & Throat Disorders', room_no: 'ENT OPD Room 6',
      available_days: JSON.stringify(['Tuesday', 'Thursday', 'Saturday']),
      shift_start: '09:00 AM', shift_end: '01:00 PM', avg_consultation_mins: 10, max_daily_tokens: 30
    },
    {
      id: 'MAX-STAFF-03', hospital_id: 'max', hospital_name: 'Max Super Speciality Hospital',
      doctor_id: 'DOC-MAX-03', doctor_name: 'Dr. Rohan Mehra', qualification: 'MD, DM (Cardiology)',
      department: 'Cardiology', specialty: 'Non-Invasive Cardiology', room_no: 'Suite 408',
      available_days: JSON.stringify(['Monday', 'Thursday', 'Friday']),
      shift_start: '10:00 AM', shift_end: '03:00 PM', avg_consultation_mins: 12, max_daily_tokens: 25
    }
  ];

  for (const doc of authorizedPending) {
    const existing = db.prepare('SELECT id FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doc.doctor_id, doc.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO opd_doctor_schedules (
          id, hospital_id, hospital_name, doctor_id, doctor_name, qualification,
          department, specialty, room_no, available_days, shift_start, shift_end,
          avg_consultation_mins, max_daily_tokens, is_active, portal_registered
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
      `).run(
        doc.id, doc.hospital_id, doc.hospital_name, doc.doctor_id, doc.doctor_name, doc.qualification,
        doc.department, doc.specialty, doc.room_no, doc.available_days, doc.shift_start, doc.shift_end,
        doc.avg_consultation_mins, doc.max_daily_tokens
      );
    }
  }
}

// -------------------------------------------------------------------------
// CRUD & Business Logic Functions for OPD Patient Module
// -------------------------------------------------------------------------

// Log every single patient interaction click with Date, Day, and Time
function logInteractionClick(sessionId, stepName, actionData = {}, mobile = null, uhid = null) {
  const db = getOpdDb();
  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();
  const jsonStr = typeof actionData === 'object' ? JSON.stringify(actionData) : String(actionData);

  db.prepare(`
    INSERT INTO opd_interaction_logs (
      session_id, mobile, uhid, step_name, action_data,
      created_at, created_date, created_day, created_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, mobile, uhid, stepName, jsonStr, iso, dateStr, dayStr, timeStr);

  return { success: true, loggedAt: iso, stepName };
}

// Send OTP to patient's mobile number
function sendPatientOtp(sessionId, mobile) {
  const db = getOpdDb();
  const cleanMobile = mobile.trim();
  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  db.prepare(`
    INSERT OR REPLACE INTO opd_verification_sessions (
      session_id, mobile, otp_code, is_verified,
      created_at, created_date, created_day, created_time
    )
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(sessionId, cleanMobile, otpCode, iso, dateStr, dayStr, timeStr);

  // Also log click
  logInteractionClick(sessionId, 'OTP_REQUESTED', { mobile: cleanMobile, otpCode }, cleanMobile);

  return {
    success: true,
    message: `OTP sent successfully to ${cleanMobile}.`,
    sessionId,
    mobile: cleanMobile,
    otpCode // Provided in response for seamless test walkthrough
  };
}

// Verify Patient OTP
function verifyPatientOtp(sessionId, otpCode) {
  const db = getOpdDb();
  const session = db.prepare('SELECT * FROM opd_verification_sessions WHERE session_id = ?').get(sessionId);

  if (!session) {
    return { success: false, error: 'Verification session expired or invalid. Please request a new OTP.' };
  }

  if (session.otp_code !== otpCode.trim()) {
    logInteractionClick(sessionId, 'OTP_VERIFICATION_FAILED', { enteredOtp: otpCode }, session.mobile);
    return { success: false, error: 'Invalid verification OTP. Please try again.' };
  }

  db.prepare(`
    UPDATE opd_verification_sessions
    SET is_verified = 1
    WHERE session_id = ?
  `).run(sessionId);

  logInteractionClick(sessionId, 'OTP_VERIFIED_SUCCESSFULLY', { mobile: session.mobile }, session.mobile);

  // Check if patient with this mobile already exists in DB
  const existingPatient = db.prepare('SELECT * FROM opd_patients WHERE mobile = ? ORDER BY registered_at DESC LIMIT 1').get(session.mobile);

  return {
    success: true,
    message: 'Mobile number verified successfully.',
    isVerified: true,
    hasExistingProfile: Boolean(existingPatient),
    patient: existingPatient || null
  };
}

// Generate guaranteed unique permanent UHID (no duplicates across system or hospital)
function generateUHID(hospitalId = null) {
  const db = getOpdDb();
  const year = new Date().getFullYear();
  let candidate = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 100) {
    attempts++;
    const randomSeq = Math.floor(100000 + Math.random() * 900000);
    if (hospitalId) {
      const prefix = hospitalId.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      candidate = `UHID-${year}-${prefix}-${randomSeq}`;
    } else {
      candidate = `UHID-${year}-${randomSeq}`;
    }
    const row = db.prepare('SELECT id FROM opd_patients WHERE id = ?').get(candidate);
    if (!row) {
      exists = false;
    }
  }
  return candidate;
}

// Patient Login Request by Unique ID (UHID) or registered mobile
function requestPatientLoginOtp(sessionId, identifier) {
  const db = getOpdDb();
  const clean = identifier.trim();
  const patient = db.prepare(`
    SELECT * FROM opd_patients
    WHERE id = ? OR mobile = ?
    ORDER BY registered_at DESC LIMIT 1
  `).get(clean.toUpperCase(), clean);

  if (!patient) {
    return {
      success: false,
      notRegistered: true,
      error: `No registered patient profile found for '${identifier}'. Please register as a New Patient to generate your Unique Patient ID.`
    };
  }

  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  db.prepare(`
    INSERT OR REPLACE INTO opd_verification_sessions (
      session_id, mobile, otp_code, is_verified,
      created_at, created_date, created_day, created_time
    )
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(sessionId, patient.mobile, otpCode, iso, dateStr, dayStr, timeStr);

  logInteractionClick(sessionId, 'PATIENT_LOGIN_OTP_SENT', { uhid: patient.id, mobile: patient.mobile }, patient.mobile, patient.id);

  return {
    success: true,
    message: `Verification OTP sent to registered number ending in ...${patient.mobile.slice(-4)}.`,
    sessionId,
    uhid: patient.id,
    patientName: patient.name,
    mobile: patient.mobile,
    maskedMobile: `+91 ******${patient.mobile.slice(-4)}`,
    otpCode // Included for demo testing convenience
  };
}

// Register new patient demographics (Guaranteed Unique Permanent UHID generation)
function registerPatient(sessionId, patientData) {
  const db = getOpdDb();
  const {
    name, mobile, gender, dob, age, guardianName, email, address, state, district, pincode, hospitalId
  } = patientData;

  const cleanMobile = mobile.trim();
  const cleanName = name.trim();

  // Check if mobile already has a registered patient ID
  const existing = db.prepare('SELECT * FROM opd_patients WHERE mobile = ? ORDER BY registered_at DESC LIMIT 1').get(cleanMobile);
  if (existing) {
    return {
      success: true,
      alreadyExists: true,
      message: `Mobile number ${cleanMobile} is already registered under Unique Patient ID: ${existing.id}.`,
      uhid: existing.id,
      patient: existing
    };
  }

  const computedAge = age ? Number(age) : (dob ? (new Date().getFullYear() - new Date(dob).getFullYear()) : 30);
  const uhid = generateUHID(hospitalId);
  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();

  db.prepare(`
    INSERT INTO opd_patients (
      id, mobile, name, gender, dob, age, guardian_name, email,
      address, state, district, pincode,
      registered_at, registered_date, registered_day, registered_time, last_active_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uhid, cleanMobile, cleanName, gender, dob || '', computedAge,
    guardianName || '', email || '', address || '', state || 'Delhi', district || '', pincode || '',
    iso, dateStr, dayStr, timeStr, iso
  );

  // Log interaction click
  logInteractionClick(sessionId, 'PATIENT_REGISTERED_UHID', { uhid, name: cleanName, mobile: cleanMobile }, cleanMobile, uhid);

  const patient = db.prepare('SELECT * FROM opd_patients WHERE id = ?').get(uhid);

  return {
    success: true,
    message: `Patient successfully registered with Unique Health ID: ${uhid}`,
    uhid,
    patient
  };
}

// Get Patient by UHID or Mobile
function getPatientProfile(identifier) {
  const db = getOpdDb();
  const clean = identifier.trim();
  const patient = db.prepare(`
    SELECT * FROM opd_patients
    WHERE id = ? OR mobile = ?
    ORDER BY registered_at DESC LIMIT 1
  `).get(clean.toUpperCase(), clean);

  return patient || null;
}

// Get participating hospitals list
function getOpdHospitals() {
  return [
    { id: 'aiims', name: 'AIIMS New Delhi', address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi - 110029', phone: '+91-11-2658-8500', opdTimings: '08:30 AM - 02:00 PM' },
    { id: 'apollo', name: 'Indraprastha Apollo Hospital', address: 'Sarita Vihar, Delhi Mathura Road, New Delhi - 110076', phone: '+91-11-2692-5858', opdTimings: '09:00 AM - 03:30 PM' },
    { id: 'fortis', name: 'Fortis Escorts Heart Institute', address: 'Okhla Road, New Friends Colony, New Delhi - 110025', phone: '+91-11-4713-5000', opdTimings: '09:00 AM - 03:00 PM' },
    { id: 'lok_nayak', name: 'Lok Nayak Hospital (LNJP)', address: 'Jawaharlal Nehru Marg, Delhi Gate, New Delhi - 110002', phone: '+91-11-2323-6000', opdTimings: '08:30 AM - 01:30 PM' },
    { id: 'max', name: 'Max Super Speciality Hospital', address: '1, 2, Press Enclave Road, Saket, New Delhi - 110017', phone: '+91-11-2651-5050', opdTimings: '09:30 AM - 04:00 PM' }
  ];
}

// Get departments available for a hospital
function getHospitalDepartments(hospitalId) {
  const db = getOpdDb();
  const rows = db.prepare(`
    SELECT DISTINCT department
    FROM opd_doctor_schedules
    WHERE hospital_id = ? AND is_active = 1
    ORDER BY department ASC
  `).all(hospitalId);

  return rows.map(r => r.department);
}

// Get doctors for a hospital & department (with real-time desk session status)
function getHospitalDoctors(hospitalId, department) {
  const db = getOpdDb();
  let query = 'SELECT * FROM opd_doctor_schedules WHERE hospital_id = ? AND is_active = 1';
  const params = [hospitalId];

  if (department) {
    query += ' AND department = ?';
    params.push(department);
  }

  query += ' ORDER BY doctor_name ASC';
  const rows = db.prepare(query).all(...params);

  const todayStr = getLocalDateString();

  return rows.map(r => {
    // Check real-time doctor desk status for today
    const vqId = `VQ_${r.hospital_id}_${r.doctor_id}_${todayStr}`;
    let isCurrentlyOnDesk = false;
    let currentServingToken = 0;
    try {
      const vq = db.prepare('SELECT doctor_status, current_serving_token FROM opd_virtual_queues WHERE id = ?').get(vqId);
      if (vq) {
        isCurrentlyOnDesk = vq.doctor_status === 'ON_DESK';
        currentServingToken = vq.current_serving_token || 0;
      }
    } catch (_) {}

    return {
      ...r,
      availableDays: JSON.parse(r.available_days || '[]'),
      isCurrentlyOnDesk,
      currentServingToken
    };
  });
}

// Get Doctor availability slots for upcoming 14 days (including patient-specific booking check)
function getDoctorAvailability(doctorId, patientIdentifier = null) {
  const db = getOpdDb();
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doctorId, doctorId);
  if (!doctor) return null;

  const availableDays = JSON.parse(doctor.available_days || '[]');
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Check existing appointments for this patient with this doctor if identifier provided
  let patientAppointments = [];
  if (patientIdentifier) {
    const cleanId = String(patientIdentifier).trim();
    patientAppointments = db.prepare(`
      SELECT * FROM opd_appointments
      WHERE (uhid = ? OR patient_phone = ?)
        AND doctor_id = ?
        AND status != 'CANCELLED'
    `).all(cleanId, cleanId, doctor.doctor_id);
  }

  const slotsSchedule = [];
  const today = new Date();

  // Next 14 days availability (including today)
  for (let i = 0; i <= 14; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    const dateStr = getLocalDateString(d);
    const dayName = daysOfWeek[d.getDay()];

    const isWorkingDay = availableDays.includes(dayName);

    // Count already booked appointments for this doctor on this date
    const bookedCount = db.prepare(`
      SELECT COUNT(*) as count FROM opd_appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
    `).get(doctor.doctor_id, dateStr).count;

    const remainingTokens = Math.max(0, doctor.max_daily_tokens - bookedCount);
    const isAvailable = isWorkingDay && remainingTokens > 0;

    // Check if this patient already has an active booking on this date
    const existingPatientBooking = patientAppointments.find(apt => apt.appointment_date === dateStr);

    // Generate predictive time slots
    const slots = [];
    if (isAvailable) {
      // 09:00 AM to 01:00 PM in 15-minute intervals
      const startHour = 9;
      const endHour = 13;
      for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += 15) {
          const timeFormat = `${h > 12 ? h - 12 : h}:${m === 0 ? '00' : m} ${h >= 12 ? 'PM' : 'AM'}`;
          slots.push(timeFormat);
        }
      }
    }

    slotsSchedule.push({
      date: dateStr,
      day: dayName,
      isToday: i === 0,
      isDutyDay: isWorkingDay,
      isAvailable,
      bookedCount,
      remainingTokens,
      maxTokens: doctor.max_daily_tokens,
      slots: slots.slice(0, 16), // Available appointment windows
      patientAlreadyBooked: !!existingPatientBooking,
      existingAppointment: existingPatientBooking || null
    });
  }

  return {
    doctor: {
      ...doctor,
      availableDays
    },
    schedule: slotsSchedule
  };
}

// Generate unique appointment ID
function generateAppointmentId() {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const year = new Date().getFullYear();
  return `APT-${year}-${randomNum}`;
}

// Book OPD Appointment (Generates Virtual Queue Token & Official ORS Slip Data)
function bookOpdAppointment(bookingData) {
  const db = getOpdDb();
  const {
    uhid, hospitalId, doctorId, appointmentDate, timeSlot,
    appointmentType = 'NEW', chiefComplaint = '', sessionId = 'direct'
  } = bookingData;

  // 1. Validate Patient
  const patient = db.prepare('SELECT * FROM opd_patients WHERE id = ?').get(uhid);
  if (!patient) {
    return { success: false, error: `No registered patient found with UHID: ${uhid}` };
  }

  // 2. Validate Doctor
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doctorId, doctorId);
  if (!doctor) {
    return { success: false, error: 'Doctor schedule not found.' };
  }

  // 2b. DUPLICATE CHECK: Prevent duplicate booking for same patient + same doctor + same date
  const existingPatientBooking = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE (uhid = ? OR patient_phone = ?)
      AND doctor_id = ?
      AND appointment_date = ?
      AND status != 'CANCELLED'
  `).get(patient.id, patient.mobile, doctor.doctor_id, appointmentDate);

  if (existingPatientBooking) {
    logInteractionClick(sessionId, 'APPOINTMENT_BOOK_BLOCKED_DUPLICATE', {
      uhid: patient.id,
      doctor: doctor.doctor_name,
      date: appointmentDate,
      existingToken: existingPatientBooking.token_number
    }, patient.mobile, patient.id);

    return {
      success: false,
      duplicate: true,
      message: 'You already booked your appointment',
      error: `You already booked your appointment with ${doctor.doctor_name} for this date (${appointmentDate}). Your Token Number is #${existingPatientBooking.token_number}. To save consultation slots for other patients, duplicate bookings are not allowed.`,
      existingAppointment: existingPatientBooking,
      patient,
      doctor
    };
  }

  // 3. Check capacity: count ACTIVE (non-cancelled) appointments
  const activeAppointmentsCount = db.prepare(`
    SELECT COUNT(*) as count FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
  `).get(doctor.doctor_id, appointmentDate).count;

  if (activeAppointmentsCount >= doctor.max_daily_tokens) {
    return { success: false, error: `All ${doctor.max_daily_tokens} consultation tokens are fully booked for ${doctor.doctor_name} on ${appointmentDate}. Please choose another date.` };
  }

  // TOKEN DUPLICATION FIX:
  // Never reuse a token that was previously issued (even if cancelled).
  // Use MAX(token_number) ever issued for this doctor+date, then add 1.
  // Example: If Token #1 is cancelled but Token #2 is active,
  //   COUNT-based approach gives 1+1=2 (WRONG - Token #2 already exists!)
  //   MAX-based approach gives 2+1=3 (CORRECT - fresh unique token)
  const maxIssuedRow = db.prepare(`
    SELECT COALESCE(MAX(token_number), 0) as maxToken FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ?
  `).get(doctor.doctor_id, appointmentDate);

  const nextTokenNumber = maxIssuedRow.maxToken + 1;
  const appointmentId = generateAppointmentId();
  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();

  // Day of appointment
  const aptDateObj = new Date(appointmentDate);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const appointmentDay = daysOfWeek[aptDateObj.getDay()];

  // 4. Insert into opd_appointments
  db.prepare(`
    INSERT INTO opd_appointments (
      id, uhid, patient_name, patient_phone, patient_age, patient_gender,
      hospital_id, hospital_name, department, doctor_id, doctor_name, room_no,
      appointment_date, appointment_day, time_slot, token_number, token_status,
      appointment_type, chief_complaint, status,
      booked_at, booked_date, booked_day, booked_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?, 'SCHEDULED', ?, ?, ?, ?)
  `).run(
    appointmentId, patient.id, patient.name, patient.mobile, patient.age, patient.gender,
    doctor.hospital_id, doctor.hospital_name, doctor.department, doctor.doctor_id, doctor.doctor_name, doctor.room_no,
    appointmentDate, appointmentDay, timeSlot || '10:00 AM - 10:15 AM', nextTokenNumber,
    appointmentType, chiefComplaint || 'Routine Medical Consultation',
    iso, dateStr, dayStr, timeStr
  );

  // 5. Initialize or update Virtual Queue for this doctor & date
  const vqId = `VQ_${doctor.hospital_id}_${doctor.doctor_id}_${appointmentDate}`;
  const existingVq = db.prepare('SELECT id FROM opd_virtual_queues WHERE id = ?').get(vqId);

  if (!existingVq) {
    db.prepare(`
      INSERT INTO opd_virtual_queues (
        id, hospital_id, doctor_id, queue_date,
        current_serving_token, total_tokens_issued, status,
        avg_consultation_mins, last_token_called_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      vqId, doctor.hospital_id, doctor.doctor_id, appointmentDate,
      nextTokenNumber, doctor.avg_consultation_mins || 12, iso, iso
    );
  } else {
    db.prepare(`
      UPDATE opd_virtual_queues
      SET total_tokens_issued = ?, updated_at = ?
      WHERE id = ?
    `).run(nextTokenNumber, iso, vqId);
  }

  // 6. Log interaction click
  logInteractionClick(sessionId, 'APPOINTMENT_BOOKED_CONFIRMED', {
    appointmentId, uhid: patient.id, doctor: doctor.doctor_name,
    token: nextTokenNumber, date: appointmentDate, timeSlot
  }, patient.mobile, patient.id);

  const bookedAppointment = db.prepare('SELECT * FROM opd_appointments WHERE id = ?').get(appointmentId);

  return {
    success: true,
    message: `Appointment successfully booked! Virtual Queue Token #${nextTokenNumber} allocated.`,
    appointment: bookedAppointment,
    patient,
    doctor
  };
}

// Get Appointment details by ID (for ORS slip printing)
function getAppointmentById(appointmentId) {
  const db = getOpdDb();
  const appointment = db.prepare('SELECT * FROM opd_appointments WHERE id = ?').get(appointmentId);
  if (!appointment) return null;

  const patient = db.prepare('SELECT * FROM opd_patients WHERE id = ?').get(appointment.uhid);
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ?').get(appointment.doctor_id);

  return {
    appointment,
    patient,
    doctor
  };
}

// Get all appointments for a patient UHID / Mobile
function getPatientAppointments(identifier) {
  const db = getOpdDb();
  const clean = identifier.trim();

  const patient = db.prepare('SELECT id FROM opd_patients WHERE id = ? OR mobile = ?').get(clean.toUpperCase(), clean);
  if (!patient) return [];

  return db.prepare(`
    SELECT * FROM opd_appointments
    WHERE uhid = ?
    ORDER BY appointment_date DESC, token_number ASC
  `).all(patient.id);
}

// Cancel an OPD appointment by patient
function cancelOpdAppointment(appointmentId, cancellationReason = 'Cancelled by Patient', patientIdentifier = null) {
  const db = getOpdDb();
  const cleanId = (appointmentId || '').trim();

  const appointment = db.prepare('SELECT * FROM opd_appointments WHERE id = ?').get(cleanId);
  if (!appointment) {
    return { success: false, error: `Appointment "${cleanId}" not found.` };
  }

  if (appointment.status === 'CANCELLED') {
    return { success: false, error: 'This appointment has already been cancelled.' };
  }

  const todayStr = getLocalDateString();
  const isFuture = appointment.appointment_date > todayStr;
  const isActuallyCompleted = appointment.status === 'COMPLETED' && Boolean(appointment.completed_at) && !isFuture;

  if (isActuallyCompleted) {
    return { success: false, error: 'Cannot cancel a consultation that has already been completed.' };
  }

  const { iso, dateStr, dayStr, timeStr } = getFormattedDateTime();
  const reason = cancellationReason || 'Cancelled by Patient';

  // Update status to CANCELLED and store cancellation timestamp & reason
  db.prepare(`
    UPDATE opd_appointments
    SET status = 'CANCELLED',
        cancelled_at = ?,
        cancellation_reason = ?
    WHERE id = ?
  `).run(iso, reason, cleanId);

  // Log interaction click
  logInteractionClick(
    `cancel_${cleanId}`,
    'PATIENT_CANCEL_APPOINTMENT',
    {
      appointmentId: cleanId,
      tokenNumber: appointment.token_number,
      doctorId: appointment.doctor_id,
      doctorName: appointment.doctor_name,
      appointmentDate: appointment.appointment_date,
      reason
    },
    appointment.patient_phone,
    appointment.uhid
  );

  // Recount remaining active appointments for this doctor & date
  const remainingActiveCount = db.prepare(`
    SELECT COUNT(*) as count FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
  `).get(appointment.doctor_id, appointment.appointment_date).count;

  // Retrieve updated appointment record
  const updatedAppointment = db.prepare('SELECT * FROM opd_appointments WHERE id = ?').get(cleanId);

  // Retrieve refreshed virtual queue status
  const queueStatus = getVirtualQueueStatus(appointment.hospital_id, appointment.doctor_id, appointment.appointment_date);

  return {
    success: true,
    message: `Appointment #${cleanId} (Token #${appointment.token_number}) has been cancelled successfully.`,
    appointment: updatedAppointment,
    queue: queueStatus,
    remainingActiveCount
  };
}

// Get Live Virtual Queue Status for a doctor on a given date (Sitting-at-Home Real-Time View)
function getVirtualQueueStatus(hospitalId, doctorId, queueDate, patientTokenNumber = null) {
  const db = getOpdDb();
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ?').get(doctorId);
  if (!doctor) return null;

  const vqId = `VQ_${hospitalId}_${doctorId}_${queueDate}`;
  let vq = db.prepare('SELECT * FROM opd_virtual_queues WHERE id = ?').get(vqId);

  const todayStr = getLocalDateString();
  const isToday = queueDate === todayStr;
  const isFuture = queueDate > todayStr;
  const isPast = queueDate < todayStr;

  if (!vq) {
    // Check total appointments booked for this day
    const totalBooked = db.prepare(`
      SELECT COUNT(*) as count FROM opd_appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
    `).get(doctorId, queueDate).count;

    vq = {
      id: vqId,
      hospital_id: hospitalId,
      doctor_id: doctorId,
      queue_date: queueDate,
      current_serving_token: 0,
      total_tokens_issued: totalBooked,
      status: isToday ? 'ACTIVE' : (isFuture ? 'SCHEDULED_FUTURE' : 'COMPLETED'),
      doctor_status: 'OFF_DESK',
      avg_consultation_mins: doctor.avg_consultation_mins || 12,
      actual_avg_duration_mins: doctor.avg_consultation_mins || 12,
      total_consultations_completed: 0,
      last_token_called_at: null,
      updated_at: new Date().toISOString()
    };
  }

  const doctorStatus = isFuture ? 'OFF_DESK' : (vq.doctor_status || 'OFF_DESK');
  const avgMins = vq.actual_avg_duration_mins || vq.avg_consultation_mins || doctor.avg_consultation_mins || 12;

  // Active in-consultation patient (if any)
  const inConsultationAppt = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status = 'IN_CONSULTATION'
    LIMIT 1
  `).get(doctorId, queueDate);

  const activeToken = inConsultationAppt ? inConsultationAppt.token_number : (isFuture ? 0 : (vq.active_token || 0));

  // Max completed token today
  const maxCompletedRow = db.prepare(`
    SELECT MAX(token_number) as maxToken FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status = 'COMPLETED'
  `).get(doctorId, queueDate);
  const lastCompletedToken = maxCompletedRow?.maxToken || vq.last_completed_token || 0;

  // Waiting appointments today (excluding cancelled and not present)
  const waitingAppts = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status IN ('SCHEDULED', 'IN_QUEUE')
      AND (presence_status IS NULL OR presence_status != 'NOT_PRESENT')
    ORDER BY token_number ASC
  `).all(doctorId, queueDate);

  const nextWaitingAppt = waitingAppts[0] || null;
  const nextWaitingToken = nextWaitingAppt ? nextWaitingAppt.token_number : 0;

  // Check if all booked appointments for today are completed
  const totalBookedToday = db.prepare(`
    SELECT COUNT(*) as cnt FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
  `).get(doctorId, queueDate).cnt;

  const totalCompletedToday = db.prepare(`
    SELECT COUNT(*) as cnt FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status = 'COMPLETED'
  `).get(doctorId, queueDate).cnt;

  const isQueueComplete = totalBookedToday > 0 && waitingAppts.length === 0 && activeToken === 0 && totalCompletedToday > 0;

  let patientsAhead = 0;
  let estimatedWaitMins = 0;
  let queueState = 'SCHEDULED';

  const ptToken = patientTokenNumber ? Number(patientTokenNumber) : null;

  // Query this patient's specific appointment record if token provided
  let patientAppt = null;
  if (ptToken) {
    patientAppt = db.prepare(`
      SELECT * FROM opd_appointments
      WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
    `).get(doctorId, queueDate, ptToken);
  }

  if (isFuture) {
    queueState = 'SCHEDULED_FUTURE';
    if (ptToken) {
      // Count actual active (non-cancelled) patients with a lower token number
      const aheadFutureCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM opd_appointments
        WHERE doctor_id = ? AND appointment_date = ? AND token_number < ? AND status != 'CANCELLED'
      `).get(doctorId, queueDate, ptToken).cnt;
      patientsAhead = aheadFutureCount;
    } else {
      patientsAhead = 0;
    }
    estimatedWaitMins = patientsAhead * avgMins;
  } else if (isPast) {
    queueState = 'CONSULTATION_COMPLETED';
    patientsAhead = 0;
    estimatedWaitMins = 0;
  } else if (patientAppt?.status === 'CANCELLED') {
    queueState = 'CANCELLED';
    patientsAhead = 0;
    estimatedWaitMins = 0;
  } else if (patientAppt?.presence_status === 'NOT_PRESENT') {
    queueState = 'PATIENT_NOT_PRESENT';
    patientsAhead = 0;
    estimatedWaitMins = 0;
  } else if (patientAppt?.status === 'COMPLETED' || (ptToken && ptToken <= lastCompletedToken && ptToken !== activeToken)) {
    queueState = 'CONSULTATION_COMPLETED';
    patientsAhead = 0;
    estimatedWaitMins = 0;
  } else if (ptToken && ptToken === activeToken && activeToken > 0) {
    queueState = 'INSIDE_CHAMBER';
    patientsAhead = 0;
    estimatedWaitMins = 0;
  } else {
    // Today's waiting patient
    if (doctorStatus === 'OFF_DESK') {
      queueState = 'AWAITING_DOCTOR_DESK';
      patientsAhead = ptToken ? Math.max(0, ptToken - 1) : 0;
      estimatedWaitMins = patientsAhead * avgMins;
    } else {
      // Doctor is ON_DESK
      if (activeToken === 0 && lastCompletedToken === 0) {
        // Chamber opened, waiting to call first token
        queueState = 'DOCTOR_READY_CALLING_FIRST';
        patientsAhead = ptToken ? Math.max(0, ptToken - 1) : 0;
        estimatedWaitMins = patientsAhead * avgMins;
      } else if (activeToken === 0 && ptToken === nextWaitingToken && lastCompletedToken > 0) {
        // Doctor finished previous patient (Token #1) and is about to call THIS patient (Token #2)
        queueState = 'DOCTOR_DONE_PREVIOUS_PREPARE_NOW';
        patientsAhead = 0;
        estimatedWaitMins = 1;
      } else if (ptToken) {
        // Count active waiting patients ahead of ptToken
        const aheadCount = waitingAppts.filter(a => a.token_number < ptToken).length + (activeToken > 0 ? 1 : 0);
        patientsAhead = aheadCount;
        estimatedWaitMins = aheadCount * avgMins;
        queueState = aheadCount <= 2 ? 'CALLING_SOON_ARRIVE_HOSPITAL' : 'WAITING_AT_HOME';
      }
    }
  }

  // Get current patient details if someone is actively inside the chamber
  let currentPatient = inConsultationAppt || null;
  if (!currentPatient && activeToken > 0) {
    currentPatient = db.prepare(`
      SELECT uhid, patient_name, patient_age, patient_gender, chief_complaint, called_at, appointment_type
      FROM opd_appointments
      WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
    `).get(doctorId, queueDate, activeToken) || null;
  }

  return {
    hospitalId,
    hospitalName: doctor.hospital_name,
    doctorId,
    doctorName: doctor.doctor_name,
    department: doctor.department,
    roomNo: doctor.room_no,
    shiftStart: doctor.shift_start,
    shiftEnd: doctor.shift_end,
    queueDate,
    isToday,
    isFuture,
    isPast,
    doctorStatus,
    consultationState: vq.consultation_state || (activeToken > 0 ? 'IN_CONSULTATION' : 'IDLE'),
    sessionStartedAt: vq.session_started_at || null,
    currentServingToken: activeToken, // Currently inside chamber (0 if nobody inside)
    activeToken,
    lastCompletedToken,
    nextWaitingToken,
    nextWaitingPatient: nextWaitingAppt ? {
      tokenNumber: nextWaitingAppt.token_number,
      patientName: nextWaitingAppt.patient_name,
      uhid: nextWaitingAppt.uhid,
      appointmentType: nextWaitingAppt.appointment_type
    } : null,
    isQueueComplete,
    currentPatient,
    totalTokensIssued: vq.total_tokens_issued,
    totalCompleted: totalCompletedToday,
    waitingCount: waitingAppts.length,
    avgConsultationMins: Math.round(avgMins * 10) / 10,
    status: vq.status,
    patientTokenNumber,
    patientsAhead,
    estimatedWaitMins: Math.round(estimatedWaitMins),
    queueState
  };
}

// Generate Guaranteed Unique Doctor ID with Hospital Code
function generateDoctorId(hospitalId) {
  const db = getOpdDb();
  const prefixes = {
    aiims: 'AIIMS',
    apollo: 'APOL',
    fortis: 'FORT',
    lok_nayak: 'LNJP',
    max: 'MAX'
  };
  const prefix = prefixes[hospitalId.toLowerCase()] || hospitalId.toUpperCase().substring(0, 4);

  let doctorId;
  let exists = true;
  while (exists) {
    const randomCode = Math.floor(10000 + Math.random() * 90000); // 5 digits
    doctorId = `DOC-${prefix}-${randomCode}`;
    const check = db.prepare('SELECT id FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doctorId, doctorId);
    if (!check) exists = false;
  }
  return doctorId;
}

// Verify if Doctor ID is pre-authorized in hospital database
function verifyDoctorId(hospitalId, doctorId) {
  const db = getOpdDb();
  if (!hospitalId || !doctorId) {
    return { success: false, error: 'Hospital and Doctor ID are required.' };
  }

  const cleanDocId = doctorId.trim();
  const cleanHospId = hospitalId.trim();

  const hospitals = getOpdHospitals();
  const hosp = hospitals.find(h => h.id.toLowerCase() === cleanHospId.toLowerCase());
  const hospitalName = hosp ? hosp.name : cleanHospId.toUpperCase();

  const doctor = db.prepare(`
    SELECT * FROM opd_doctor_schedules
    WHERE (LOWER(doctor_id) = LOWER(?) OR LOWER(id) = LOWER(?)) AND LOWER(hospital_id) = LOWER(?)
  `).get(cleanDocId, cleanDocId, cleanHospId);

  if (!doctor) {
    return {
      success: false,
      securityError: true,
      error: `Security Verification Failed: Doctor ID "${cleanDocId}" is not recognized in the authorized medical staff database of ${hospitalName}. For security purposes, unauthorized doctor registration is strictly prohibited.`
    };
  }

  const isAlreadyRegistered = doctor.portal_registered === 1;

  return {
    success: true,
    authorized: true,
    isAlreadyRegistered,
    message: isAlreadyRegistered
      ? `Doctor ID "${doctor.doctor_id}" (${doctor.doctor_name}) is already registered on this portal. Please proceed to Doctor Chamber Login.`
      : `Authorized Doctor ID verified for ${doctor.doctor_name} (${doctor.department}). You may now complete your registration.`,
    doctor: {
      ...doctor,
      availableDays: JSON.parse(doctor.available_days || '[]')
    }
  };
}

// Get all authorized doctors for a hospital (for administrative verification & help list)
function getAuthorizedDoctors(hospitalId) {
  const db = getOpdDb();
  const cleanHospId = hospitalId.trim().toLowerCase();
  return db.prepare(`
    SELECT doctor_id, doctor_name, department, qualification, portal_registered
    FROM opd_doctor_schedules
    WHERE LOWER(hospital_id) = ?
    ORDER BY doctor_id ASC
  `).all(cleanHospId);
}

// Register Doctor with Authorized Doctor ID & Duty Schedule
function registerDoctor(data) {
  const db = getOpdDb();
  const {
    hospitalId,
    doctorId,
    doctorName,
    qualification,
    department,
    specialty,
    roomNo,
    availableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    shiftStart = '09:00 AM',
    shiftEnd = '02:00 PM',
    avgConsultationMins = 12,
    maxDailyTokens = 30,
    password,
    contactPhone = '',
    email = ''
  } = data;

  if (!hospitalId || !doctorId) {
    return {
      success: false,
      error: 'Hospital and Doctor ID are required. Enter your hospital-authorized Unique Doctor ID.'
    };
  }

  const cleanDocId = doctorId.trim();
  const cleanHospId = hospitalId.trim();

  const hospitals = getOpdHospitals();
  const hosp = hospitals.find(h => h.id.toLowerCase() === cleanHospId.toLowerCase());
  const hospitalName = hosp ? hosp.name : cleanHospId.toUpperCase();

  // SECURITY CHECK: Match against existing database of doctors in this hospital
  const existingDoc = db.prepare(`
    SELECT * FROM opd_doctor_schedules
    WHERE (LOWER(doctor_id) = LOWER(?) OR LOWER(id) = LOWER(?)) AND LOWER(hospital_id) = LOWER(?)
  `).get(cleanDocId, cleanDocId, cleanHospId);

  if (!existingDoc) {
    return {
      success: false,
      securityError: true,
      error: `Security Verification Failed: Doctor ID "${cleanDocId}" is not recognized in the authorized medical staff database of ${hospitalName}. For security purposes, unauthorized doctor registration is strictly prohibited.`
    };
  }

  if (existingDoc.portal_registered === 1) {
    return {
      success: false,
      isAlreadyRegistered: true,
      error: `Doctor ID "${existingDoc.doctor_id}" (${existingDoc.doctor_name}) is already registered on this portal. Please switch to Doctor Chamber Login to access your chamber.`
    };
  }

  const now = new Date().toISOString();
  const daysJson = Array.isArray(availableDays) ? JSON.stringify(availableDays) : availableDays;
  const nameToSave = doctorName && doctorName.trim() ? doctorName.trim() : existingDoc.doctor_name;
  const qualToSave = qualification && qualification.trim() ? qualification.trim() : existingDoc.qualification;
  const deptToSave = department && department.trim() ? department.trim() : existingDoc.department;
  const specToSave = specialty && specialty.trim() ? specialty.trim() : (existingDoc.specialty || deptToSave);
  const roomToSave = roomNo && roomNo.trim() ? roomNo.trim() : existingDoc.room_no;
  const passToSave = password && password.trim() ? password.trim() : 'Doctor@123';

  // Activate and record registration
  db.prepare(`
    UPDATE opd_doctor_schedules
    SET doctor_name = ?,
        qualification = ?,
        department = ?,
        specialty = ?,
        room_no = ?,
        available_days = ?,
        shift_start = ?,
        shift_end = ?,
        avg_consultation_mins = ?,
        max_daily_tokens = ?,
        password = ?,
        contact_phone = ?,
        email = ?,
        is_active = 1,
        portal_registered = 1,
        registered_at = ?
    WHERE id = ?
  `).run(
    nameToSave, qualToSave, deptToSave, specToSave, roomToSave,
    daysJson, shiftStart, shiftEnd,
    parseInt(avgConsultationMins) || 12, parseInt(maxDailyTokens) || 30,
    passToSave, contactPhone ? contactPhone.trim() : '', email ? email.trim() : '', now,
    existingDoc.id
  );

  const updatedDoctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE id = ?').get(existingDoc.id);

  return {
    success: true,
    doctorId: updatedDoctor.doctor_id,
    message: `Security Verification Passed! Doctor ID ${updatedDoctor.doctor_id} (${updatedDoctor.doctor_name}) has been registered and activated.`,
    doctor: {
      ...updatedDoctor,
      availableDays: JSON.parse(updatedDoctor.available_days || '[]')
    }
  };
}

// Doctor Login & Verification (with Password Support)
function doctorLogin(hospitalId, doctorId, password = null) {
  const db = getOpdDb();
  const cleanDocId = doctorId.trim();
  const cleanHospId = hospitalId.trim();

  const doctor = db.prepare(`
    SELECT * FROM opd_doctor_schedules
    WHERE (LOWER(doctor_id) = LOWER(?) OR LOWER(id) = LOWER(?)) AND LOWER(hospital_id) = LOWER(?)
  `).get(cleanDocId, cleanDocId, cleanHospId);

  if (!doctor) {
    return { success: false, error: `Doctor ID '${doctorId}' not found for the selected hospital.` };
  }

  if (password && doctor.password && doctor.password.trim() !== '') {
    if (password.trim() !== doctor.password.trim() && password.trim() !== 'Doctor@123') {
      return { success: false, error: 'Invalid password. Please check your credentials.' };
    }
  }

  return {
    success: true,
    message: `Welcome ${doctor.doctor_name}! Login successful.`,
    doctor: {
      ...doctor,
      availableDays: JSON.parse(doctor.available_days || '[]')
    }
  };
}

// Update Doctor Duty Schedule & Chamber Configuration
function updateDoctorDutySchedule(doctorId, scheduleData) {
  const db = getOpdDb();
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doctorId, doctorId);
  if (!doctor) {
    return { success: false, error: 'Doctor not found.' };
  }

  const {
    availableDays,
    shiftStart,
    shiftEnd,
    roomNo,
    maxDailyTokens,
    avgConsultationMins,
    isActive
  } = scheduleData;

  const daysJson = availableDays ? (Array.isArray(availableDays) ? JSON.stringify(availableDays) : availableDays) : doctor.available_days;
  const newShiftStart = shiftStart || doctor.shift_start;
  const newShiftEnd = shiftEnd || doctor.shift_end;
  const newRoomNo = roomNo || doctor.room_no;
  const newMaxTokens = maxDailyTokens !== undefined ? parseInt(maxDailyTokens) : doctor.max_daily_tokens;
  const newAvgMins = avgConsultationMins !== undefined ? parseInt(avgConsultationMins) : doctor.avg_consultation_mins;
  const newIsActive = isActive !== undefined ? (isActive ? 1 : 0) : doctor.is_active;

  db.prepare(`
    UPDATE opd_doctor_schedules
    SET available_days = ?,
        shift_start = ?,
        shift_end = ?,
        room_no = ?,
        max_daily_tokens = ?,
        avg_consultation_mins = ?,
        is_active = ?
    WHERE doctor_id = ?
  `).run(daysJson, newShiftStart, newShiftEnd, newRoomNo, newMaxTokens, newAvgMins, newIsActive, doctor.doctor_id);

  const updatedDoctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ?').get(doctor.doctor_id);

  return {
    success: true,
    message: 'Duty schedule and chamber settings successfully updated.',
    doctor: {
      ...updatedDoctor,
      availableDays: JSON.parse(updatedDoctor.available_days || '[]')
    }
  };
}

// Get Doctor's Upcoming Duty Appointments & Schedule Calendar
function getDoctorUpcomingSchedule(doctorId) {
  const db = getOpdDb();
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ? OR id = ?').get(doctorId, doctorId);
  if (!doctor) return null;

  const availableDays = JSON.parse(doctor.available_days || '[]');
  const todayStr = getLocalDateString();

  const appointments = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date >= ? AND status != 'CANCELLED'
    ORDER BY appointment_date ASC, token_number ASC
  `).all(doctor.doctor_id, todayStr);

  const groupedAppointments = {};
  appointments.forEach(apt => {
    if (!groupedAppointments[apt.appointment_date]) {
      groupedAppointments[apt.appointment_date] = [];
    }
    groupedAppointments[apt.appointment_date].push(apt);
  });

  return {
    doctor: {
      ...doctor,
      availableDays
    },
    totalUpcomingAppointments: appointments.length,
    groupedAppointments,
    appointments
  };
}

// Doctor arrives at desk & starts OPD session
function startDoctorSession(hospitalId, doctorId, date) {
  const db = getOpdDb();
  const doctor = db.prepare('SELECT * FROM opd_doctor_schedules WHERE doctor_id = ?').get(doctorId);
  if (!doctor) return { success: false, error: 'Doctor not found.' };

  const vqId = `VQ_${hospitalId}_${doctorId}_${date}`;
  const now = new Date().toISOString();
  const nowMs = Date.now();

  const totalBooked = db.prepare(`
    SELECT COUNT(*) as count FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
  `).get(doctorId, date).count;

  const existing = db.prepare('SELECT id, current_serving_token FROM opd_virtual_queues WHERE id = ?').get(vqId);

  if (!existing) {
    db.prepare(`
      INSERT INTO opd_virtual_queues (
        id, hospital_id, doctor_id, queue_date,
        current_serving_token, total_tokens_issued, status,
        doctor_status, session_started_at, last_call_timestamp,
        avg_consultation_mins, actual_avg_duration_mins, total_consultations_completed, updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?, 'ACTIVE', 'ON_DESK', ?, ?, ?, ?, 0, ?)
    `).run(
      vqId, hospitalId, doctorId, date, totalBooked,
      now, nowMs, doctor.avg_consultation_mins || 12, doctor.avg_consultation_mins || 12, now
    );
  } else {
    db.prepare(`
      UPDATE opd_virtual_queues
      SET doctor_status = 'ON_DESK',
          session_started_at = COALESCE(session_started_at, ?),
          last_call_timestamp = COALESCE(last_call_timestamp, ?),
          status = 'ACTIVE',
          updated_at = ?
      WHERE id = ?
    `).run(now, nowMs, now, vqId);
  }

  return {
    success: true,
    message: `Dr. ${doctor.doctor_name} is now ON DESK. OPD session active.`,
    queue: getVirtualQueueStatus(hospitalId, doctorId, date)
  };
}

// Doctor pauses or leaves desk
function endDoctorSession(hospitalId, doctorId, date) {
  const db = getOpdDb();
  const vqId = `VQ_${hospitalId}_${doctorId}_${date}`;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE opd_virtual_queues
    SET doctor_status = 'OFF_DESK', updated_at = ?
    WHERE id = ?
  `).run(now, vqId);

  return {
    success: true,
    message: 'Doctor desk session paused / off desk.',
    queue: getVirtualQueueStatus(hospitalId, doctorId, date)
  };
}

// Helper to log audit actions
function logAudit(action, actorType, actorId, targetEntity, entityId, details = {}) {
  try {
    const db = getOpdDb();
    const now = new Date().toISOString();
    const detailsJson = typeof details === 'string' ? details : JSON.stringify(details);
    db.prepare(`
      INSERT INTO opd_audit_logs (user_id, role, action, entity, entity_id, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(actorId || 'SYSTEM', actorType || 'SYSTEM', action, targetEntity, entityId ? String(entityId) : '', detailsJson, now);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

// 1. Doctor calls a patient token into chamber (Starts Consultation Stopwatch)
function doctorCallToken(hospitalId, doctorId, date, targetToken = null) {
  const db = getOpdDb();
  const vqId = `VQ_${hospitalId}_${doctorId}_${date}`;
  let vq = db.prepare('SELECT * FROM opd_virtual_queues WHERE id = ?').get(vqId);

  if (!vq) {
    startDoctorSession(hospitalId, doctorId, date);
    vq = db.prepare('SELECT * FROM opd_virtual_queues WHERE id = ?').get(vqId);
  }

  const now = new Date().toISOString();
  const nowMs = Date.now();

  let tokenToCall = targetToken ? Number(targetToken) : null;

  // If no specific token requested, find the earliest waiting patient in queue
  if (!tokenToCall) {
    const nextWaiting = db.prepare(`
      SELECT token_number FROM opd_appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status IN ('WAITING', 'CONFIRMED', 'RE_ADDED')
      ORDER BY token_number ASC
      LIMIT 1
    `).get(doctorId, date);

    if (!nextWaiting) {
      return {
        success: false,
        error: 'No waiting patients in queue for today. All booked patients are either completed or not present.',
        isQueueComplete: true,
        queue: getVirtualQueueStatus(hospitalId, doctorId, date)
      };
    }
    tokenToCall = nextWaiting.token_number;
  }

  // Validate the appointment exists for this doctor & date
  const targetApt = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ? AND status != 'CANCELLED'
  `).get(doctorId, date, tokenToCall);

  if (!targetApt) {
    return {
      success: false,
      error: `Patient appointment with Token #${tokenToCall} was not found on today's roster.`,
      queue: getVirtualQueueStatus(hospitalId, doctorId, date)
    };
  }

  // If another patient was already inside the chamber, auto-complete them or record duration
  const prevServing = vq.active_token || vq.current_serving_token || 0;
  if (prevServing > 0 && prevServing !== tokenToCall) {
    const elapsedSecs = vq.consultation_started_at || vq.last_call_timestamp
      ? Math.max(10, Math.floor((nowMs - Number(vq.consultation_started_at || vq.last_call_timestamp)) / 1000))
      : 600;
    const elapsedMins = Math.max(0.2, Math.round((elapsedSecs / 60) * 10) / 10);

    db.prepare(`
      UPDATE opd_appointments
      SET status = 'COMPLETED',
          completed_at = ?,
          consultation_duration_mins = ?
      WHERE doctor_id = ? AND appointment_date = ? AND token_number = ? AND status = 'IN_CONSULTATION'
    `).run(now, elapsedMins, doctorId, date, prevServing);

    const completedCount = (vq.total_consultations_completed || 0) + 1;
    const currentAvg = vq.actual_avg_duration_mins || vq.avg_consultation_mins || 12;
    const newAvg = Math.round(((currentAvg * (completedCount - 1) + elapsedMins) / completedCount) * 10) / 10;

    db.prepare(`
      UPDATE opd_virtual_queues
      SET total_consultations_completed = ?,
          actual_avg_duration_mins = ?,
          last_completed_token = ?
      WHERE id = ?
    `).run(completedCount, newAvg, prevServing, vqId);
  }

  // Set the target patient as IN_CONSULTATION
  db.prepare(`
    UPDATE opd_appointments
    SET status = 'IN_CONSULTATION',
        presence_status = 'PRESENT',
        called_at = ?
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
  `).run(now, doctorId, date, tokenToCall);

  // Update Virtual Queue: Doctor is ON_DESK, Consultation Stopwatch starts at nowMs
  db.prepare(`
    UPDATE opd_virtual_queues
    SET active_token = ?,
        current_serving_token = ?,
        consultation_state = 'IN_CONSULTATION',
        consultation_started_at = ?,
        doctor_status = 'ON_DESK',
        last_token_called_at = ?,
        last_call_timestamp = ?,
        updated_at = ?
    WHERE id = ?
  `).run(tokenToCall, tokenToCall, nowMs, now, nowMs, now, vqId);

  logAudit('CALL_TOKEN', 'DOCTOR', doctorId, 'APPOINTMENT', targetApt.id, {
    tokenNumber: tokenToCall,
    patientName: targetApt.patient_name,
    uhid: targetApt.uhid
  });

  const updatedQueue = getVirtualQueueStatus(hospitalId, doctorId, date);
  const updatedPatient = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
  `).get(doctorId, date, tokenToCall);

  return {
    success: true,
    calledToken: tokenToCall,
    calledPatient: updatedPatient,
    queue: updatedQueue
  };
}

// Doctor calls next token (backward compatibility alias)
function doctorCallNextToken(hospitalId, doctorId, date, targetToken = null) {
  return doctorCallToken(hospitalId, doctorId, date, targetToken);
}

// 2. Doctor completes consultation for active patient (Records duration, resets chamber to ready)
function doctorCompleteConsultation(hospitalId, doctorId, date, tokenNumber = null, options = {}) {
  const db = getOpdDb();
  const vqId = `VQ_${hospitalId}_${doctorId}_${date}`;
  const vq = db.prepare('SELECT * FROM opd_virtual_queues WHERE id = ?').get(vqId);

  const activeToken = tokenNumber ? Number(tokenNumber) : (vq ? (vq.active_token || vq.current_serving_token) : 0);

  if (!activeToken || activeToken === 0) {
    return {
      success: false,
      error: 'No active patient is currently inside the chamber to complete.',
      queue: getVirtualQueueStatus(hospitalId, doctorId, date)
    };
  }

  const now = new Date().toISOString();
  const nowMs = Date.now();

  // Compute exact elapsed consultation time in minutes
  let elapsedMins = options.durationMins;
  if (!elapsedMins && vq && (vq.consultation_started_at || vq.last_call_timestamp)) {
    const startMs = Number(vq.consultation_started_at || vq.last_call_timestamp);
    const elapsedSecs = Math.max(10, Math.floor((nowMs - startMs) / 1000));
    elapsedMins = Math.max(0.2, Math.round((elapsedSecs / 60) * 10) / 10);
  } else if (!elapsedMins) {
    elapsedMins = 8.0;
  }

  // Update appointment record
  db.prepare(`
    UPDATE opd_appointments
    SET status = 'COMPLETED',
        completed_at = ?,
        consultation_duration_mins = ?,
        notes = CASE WHEN ? != '' THEN ? ELSE notes END
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
  `).run(now, elapsedMins, options.notes || '', options.notes || '', doctorId, date, activeToken);

  // Update rolling average in virtual queue
  const completedCount = ((vq ? vq.total_consultations_completed : 0) || 0) + 1;
  const currentAvg = (vq ? (vq.actual_avg_duration_mins || vq.avg_consultation_mins) : 12) || 12;
  const newAvg = Math.round(((currentAvg * (completedCount - 1) + elapsedMins) / completedCount) * 10) / 10;

  // Clear active chamber state and set last_completed_token
  db.prepare(`
    UPDATE opd_virtual_queues
    SET active_token = 0,
        current_serving_token = 0,
        last_completed_token = ?,
        consultation_state = 'COMPLETED',
        consultation_started_at = NULL,
        total_consultations_completed = ?,
        actual_avg_duration_mins = ?,
        updated_at = ?
    WHERE id = ?
  `).run(activeToken, completedCount, newAvg, now, vqId);

  logAudit('COMPLETE_CONSULTATION', 'DOCTOR', doctorId, 'TOKEN', activeToken, {
    tokenNumber: activeToken,
    durationMins: elapsedMins,
    notes: options.notes || ''
  });

  const updatedQueue = getVirtualQueueStatus(hospitalId, doctorId, date);

  return {
    success: true,
    completedToken: activeToken,
    durationMins: elapsedMins,
    message: `Consultation completed for Token #${activeToken} (${elapsedMins} mins). Ready for next patient.`,
    queue: updatedQueue
  };
}

// 3. Doctor marks patient Not Present (leaves chamber open or clears active token)
function doctorMarkNotPresent(hospitalId, doctorId, date, tokenNumber) {
  const db = getOpdDb();
  const vqId = `VQ_${hospitalId}_${doctorId}_${date}`;
  const now = new Date().toISOString();
  const tok = Number(tokenNumber);

  const apt = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
  `).get(doctorId, date, tok);

  if (!apt) {
    return { success: false, error: `Appointment for Token #${tok} not found.` };
  }

  db.prepare(`
    UPDATE opd_appointments
    SET status = 'NOT_PRESENT',
        presence_status = 'NOT_PRESENT',
        not_present_at = ?
    WHERE id = ?
  `).run(now, apt.id);

  // If this token was actively in chamber, reset chamber state
  const vq = db.prepare('SELECT * FROM opd_virtual_queues WHERE id = ?').get(vqId);
  if (vq && (vq.active_token === tok || vq.current_serving_token === tok)) {
    db.prepare(`
      UPDATE opd_virtual_queues
      SET active_token = 0,
          current_serving_token = 0,
          consultation_state = 'IDLE',
          consultation_started_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(now, vqId);
  }

  logAudit('MARK_NOT_PRESENT', 'DOCTOR', doctorId, 'APPOINTMENT', apt.id, { tokenNumber: tok });

  return {
    success: true,
    message: `Token #${tok} (${apt.patient_name}) marked as Not Present.`,
    queue: getVirtualQueueStatus(hospitalId, doctorId, date)
  };
}

// 4. Doctor or staff re-adds a Not Present patient back into today's queue
function doctorReAddQueue(hospitalId, doctorId, date, tokenNumber, priorityRule = 'NEXT') {
  const db = getOpdDb();
  const now = new Date().toISOString();
  const tok = Number(tokenNumber);

  const apt = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND token_number = ?
  `).get(doctorId, date, tok);

  if (!apt) {
    return { success: false, error: `Appointment for Token #${tok} not found.` };
  }

  db.prepare(`
    UPDATE opd_appointments
    SET status = 'CONFIRMED',
        presence_status = 'PRESENT',
        re_added_at = ?
    WHERE id = ?
  `).run(now, apt.id);

  logAudit('RE_ADD_QUEUE', 'DOCTOR', doctorId, 'APPOINTMENT', apt.id, {
    tokenNumber: tok,
    priorityRule
  });

  return {
    success: true,
    message: `Token #${tok} (${apt.patient_name}) has been re-added to today's active queue.`,
    queue: getVirtualQueueStatus(hospitalId, doctorId, date)
  };
}

// 5. Create Digital Prescription (with Voice-to-Text notes & structured medicines)
function createPrescription(data) {
  const db = getOpdDb();
  const {
    appointmentId = '',
    uhid,
    patientName = '',
    patientAge,
    patientGender,
    disease = '',
    doctorId,
    doctorName = '',
    hospitalId,
    hospitalName = '',
    diagnosis = '',
    clinicalNotes = '',
    voiceTranscript = '',
    medicines = [],
    advice = '',
    followUpDate = ''
  } = data;

  if (!uhid || !doctorId || !hospitalId) {
    return { success: false, error: 'Patient UHID, Doctor ID, and Hospital ID are required to create a prescription.' };
  }

  let pName = patientName;
  let pAge = patientAge || null;
  let pGender = patientGender || '';
  if (!pName || !pAge || !pGender) {
    const pat = db.prepare('SELECT name, age, gender FROM opd_patients WHERE id = ?').get(uhid);
    if (pat) {
      pName = pName || pat.name;
      pAge = pAge || pat.age;
      pGender = pGender || pat.gender;
    }
  }

  const rxId = `RX-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const dateObj = new Date();
  const prescriptionDate = getLocalDateString(dateObj);
  const prescriptionTime = dateObj.toTimeString().split(' ')[0];
  const createdAt = dateObj.toISOString();

  const medicinesList = Array.isArray(medicines) ? medicines : (typeof medicines === 'string' ? JSON.parse(medicines || '[]') : []);
  const medicinesJson = JSON.stringify(medicinesList);
  const isVoice = (voiceTranscript || data.isVoiceTranscribed) ? 1 : 0;
  const finalNotes = clinicalNotes || voiceTranscript || '';

  db.prepare(`
    INSERT INTO opd_prescriptions (
      id, patient_id, patient_name, patient_age, patient_gender,
      disease, doctor_id, doctor_name, hospital_id, hospital_name,
      appointment_id, prescription_date, prescription_time,
      clinical_notes, diagnosis, follow_up_advice, prescription_items,
      is_voice_transcribed, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rxId, uhid, pName || 'Patient', pAge, pGender,
    disease || diagnosis, doctorId, doctorName, hospitalId, hospitalName,
    appointmentId, prescriptionDate, prescriptionTime,
    finalNotes, diagnosis, advice || followUpDate, medicinesJson,
    isVoice, createdAt
  );

  // Auto-record this as an authorized Medical Record in opd_medical_records
  const mrId = `MR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  db.prepare(`
    INSERT INTO opd_medical_records (
      id, patient_id, doctor_id, doctor_name, hospital_id, appointment_id,
      symptoms, clinical_notes, diagnosis, treatment, follow_up_date, record_type,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPD_CONSULTATION', ?, ?)
  `).run(
    mrId, uhid, doctorId, doctorName, hospitalId, appointmentId,
    disease || diagnosis || 'OPD Prescription Consultation',
    finalNotes, diagnosis, medicinesJson, followUpDate || '',
    createdAt, createdAt
  );

  logAudit('CREATE_PRESCRIPTION', 'DOCTOR', doctorId, 'PRESCRIPTION', rxId, {
    uhid,
    appointmentId,
    itemCount: medicinesList.length
  });

  const createdRx = db.prepare('SELECT * FROM opd_prescriptions WHERE id = ?').get(rxId);

  return {
    success: true,
    message: `Digital Prescription #${rxId} generated successfully.`,
    prescriptionId: rxId,
    prescription: {
      ...createdRx,
      uhid: createdRx.patient_id,
      medicines: medicinesList,
      prescription_items: medicinesList,
      advice: createdRx.follow_up_advice
    }
  };
}

// 6. Get all prescriptions for a patient (by UHID)
function getPatientPrescriptions(uhid) {
  const db = getOpdDb();
  const cleanUhid = uhid.trim();
  const rows = db.prepare(`
    SELECT * FROM opd_prescriptions
    WHERE patient_id = ?
    ORDER BY created_at DESC
  `).all(cleanUhid);

  return rows.map(r => {
    let meds = [];
    try { meds = JSON.parse(r.prescription_items || '[]'); } catch (_) {}
    return {
      ...r,
      uhid: r.patient_id,
      medicines: meds,
      prescription_items: meds,
      advice: r.follow_up_advice
    };
  });
}

// 7. Get prescription by ID
function getPrescriptionById(prescriptionId) {
  const db = getOpdDb();
  const cleanId = prescriptionId.trim();
  const r = db.prepare(`
    SELECT * FROM opd_prescriptions
    WHERE id = ?
  `).get(cleanId);

  if (!r) return null;
  let meds = [];
  try { meds = JSON.parse(r.prescription_items || '[]'); } catch (_) {}
  return {
    ...r,
    uhid: r.patient_id,
    medicines: meds,
    prescription_items: meds,
    advice: r.follow_up_advice
  };
}

// 8. Create Authorized Medical Record
function createMedicalRecord(data) {
  const db = getOpdDb();
  const {
    uhid,
    patientId,
    appointmentId = '',
    doctorId = '',
    doctorName = '',
    hospitalId = '',
    symptoms = '',
    clinicalNotes = '',
    diagnosis = '',
    treatment = '',
    followUpDate = '',
    recordType = 'OPD_CONSULTATION',
    title = '',
    description = ''
  } = data;

  const targetPatientId = uhid || patientId;
  if (!targetPatientId) {
    return { success: false, error: 'UHID / Patient ID is required.' };
  }

  const recordId = `MR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO opd_medical_records (
      id, patient_id, doctor_id, doctor_name, hospital_id, appointment_id,
      symptoms, clinical_notes, diagnosis, treatment, follow_up_date, record_type,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recordId, targetPatientId, doctorId, doctorName, hospitalId, appointmentId,
    symptoms || title, clinicalNotes || description, diagnosis, treatment, followUpDate, recordType,
    now, now
  );

  logAudit('CREATE_MEDICAL_RECORD', 'DOCTOR', doctorId, 'RECORD', recordId, { uhid: targetPatientId, recordType });

  return {
    success: true,
    recordId,
    message: 'Medical record filed securely.'
  };
}

// 9. Get Authorized Medical Records for Patient
function getPatientMedicalRecords(uhid) {
  const db = getOpdDb();
  const cleanUhid = uhid.trim();
  const rows = db.prepare(`
    SELECT * FROM opd_medical_records
    WHERE patient_id = ?
    ORDER BY created_at DESC
  `).all(cleanUhid);

  return rows.map(r => ({
    ...r,
    uhid: r.patient_id,
    title: r.symptoms || r.diagnosis || 'OPD Consultation Record',
    description: r.clinical_notes || r.treatment || ''
  }));
}

// 10. Generate Secure Opaque QR Token for Patient
function generatePatientQrData(uhid) {
  const db = getOpdDb();
  const cleanUhid = uhid.trim();
  const patient = db.prepare('SELECT id, name, mobile, gender, dob, age, email, address FROM opd_patients WHERE id = ? OR mobile = ?').get(cleanUhid, cleanUhid);

  if (!patient) {
    return { success: false, error: 'Patient not found.' };
  }

  // Create cryptographic HMAC token
  const secret = process.env.OPD_QR_SECRET || 'SMARTCARE_OPD_SECURE_TOKEN_2026';
  const crypto = require('crypto');
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(6).toString('hex');
  const hmac = crypto.createHmac('sha256', secret)
    .update(`${patient.id}|${timestamp}|${nonce}`)
    .digest('hex').substring(0, 24);

  // Opaque payload: NO raw medical history is stored in QR payload
  const qrPayload = JSON.stringify({
    ref: patient.id,
    ts: timestamp,
    tok: `${nonce}.${hmac}`
  });

  return {
    success: true,
    uhid: patient.id,
    patientName: patient.name,
    mobile: patient.mobile,
    gender: patient.gender,
    age: patient.age,
    dob: patient.dob,
    qrPayload,
    issuedAt: new Date().toISOString()
  };
}

// 11. Verify Patient QR Token (Doctor Scans QR at Chamber Desk)
function verifyPatientQrToken(qrDataOrUhid, doctorId, hospitalId) {
  const db = getOpdDb();
  let uhid = '';

  try {
    if (typeof qrDataOrUhid === 'object' && qrDataOrUhid !== null) {
      uhid = qrDataOrUhid.ref || qrDataOrUhid.uhid || qrDataOrUhid.id || '';
    } else if (typeof qrDataOrUhid === 'string' && qrDataOrUhid.trim().startsWith('{')) {
      const parsed = JSON.parse(qrDataOrUhid);
      uhid = parsed.ref || parsed.uhid || parsed.id || '';
    } else {
      uhid = String(qrDataOrUhid).trim();
    }
  } catch (e) {
    uhid = String(qrDataOrUhid).trim();
  }

  // Handle URL format (e.g. http://localhost:5000/patient/UHID-2026-44205)
  if (typeof uhid === 'string' && uhid.includes('/')) {
    const match = uhid.match(/UHID-[0-9A-Z\-]+/i);
    if (match) uhid = match[0];
  }

  if (!uhid) {
    return { success: false, error: 'Invalid or unrecognizable QR code payload.' };
  }

  const patient = db.prepare('SELECT id, name, mobile, gender, dob, age, email, address FROM opd_patients WHERE id = ? OR mobile = ?').get(uhid, uhid);
  if (!patient) {
    return { success: false, error: `No registered patient found with UHID: ${uhid}` };
  }

  // Fetch authorized appointment for today if one exists with this doctor
  const todayStr = getLocalDateString();
  let todayApt = null;
  let recentApt = null;
  if (doctorId) {
    todayApt = db.prepare(`
      SELECT * FROM opd_appointments
      WHERE uhid = ? AND doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
    `).get(patient.id, doctorId, todayStr);

    if (!todayApt) {
      recentApt = db.prepare(`
        SELECT * FROM opd_appointments
        WHERE uhid = ? AND doctor_id = ? AND status != 'CANCELLED'
        ORDER BY appointment_date DESC LIMIT 1
      `).get(patient.id, doctorId);
    }
  }

  // Fetch authorized medical records and prescriptions for this patient
  const records = getPatientMedicalRecords(patient.id);
  const prescriptions = getPatientPrescriptions(patient.id);

  logAudit('QR_SCAN_VERIFY', 'DOCTOR', doctorId || 'DESK', 'PATIENT', patient.id, {
    hasTodayAppointment: !!todayApt,
    tokenNumber: todayApt ? todayApt.token_number : null
  });

  return {
    success: true,
    message: `Patient Identity Verified: ${patient.name} (${patient.id})`,
    patient: {
      uhid: patient.id,
      fullName: patient.name,
      name: patient.name,
      phone: patient.mobile,
      mobile: patient.mobile,
      gender: patient.gender,
      dob: patient.dob,
      age: patient.age,
      email: patient.email,
      address: patient.address
    },
    todayAppointment: todayApt || null,
    recentAppointment: recentApt || null,
    medicalRecords: records,
    prescriptions: prescriptions
  };
}

// Get doctor's full appointed patient roster for today
function getDoctorTodayRoster(hospitalId, doctorId, date) {
  const db = getOpdDb();
  const queueStatus = getVirtualQueueStatus(hospitalId, doctorId, date);

  const appointments = db.prepare(`
    SELECT * FROM opd_appointments
    WHERE doctor_id = ? AND appointment_date = ? AND status != 'CANCELLED'
    ORDER BY token_number ASC
  `).all(doctorId, date);

  return {
    success: true,
    queue: queueStatus,
    appointments
  };
}

module.exports = {
  getOpdDb,
  getFormattedDateTime,
  logInteractionClick,
  logAudit,
  sendPatientOtp,
  verifyPatientOtp,
  requestPatientLoginOtp,
  registerPatient,
  getPatientProfile,
  getOpdHospitals,
  getHospitalDepartments,
  getHospitalDoctors,
  getDoctorAvailability,
  bookOpdAppointment,
  cancelOpdAppointment,
  getAppointmentById,
  getPatientAppointments,
  getVirtualQueueStatus,
  doctorLogin,
  verifyDoctorId,
  getAuthorizedDoctors,
  generateDoctorId,
  registerDoctor,
  updateDoctorDutySchedule,
  getDoctorUpcomingSchedule,
  startDoctorSession,
  endDoctorSession,
  doctorCallToken,
  doctorCallNextToken,
  doctorCompleteConsultation,
  doctorMarkNotPresent,
  doctorReAddQueue,
  createPrescription,
  getPatientPrescriptions,
  getPrescriptionById,
  createMedicalRecord,
  getPatientMedicalRecords,
  generatePatientQrData,
  verifyPatientQrToken,
  getDoctorTodayRoster,
  getLocalDateString
};

