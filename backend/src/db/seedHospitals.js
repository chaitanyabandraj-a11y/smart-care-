const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '../../data/hospitals');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 5 Hospitals developer seed data
const HOSPITALS_CONFIG = [
  {
    id: 'apollo',
    name: 'Apollo Hospital',
    address: 'Sarita Vihar, Delhi Mathura Road, New Delhi - 110076',
    phone: '+91-11-2692-5858',
    emergencyContact: '1066 / +91-11-2692-5801',
    lat: 28.5355,
    lng: 77.2874,
    ambulancesAvailable: 4,
    admin: {
      name: 'Dr. Rajesh Sharma',
      id: 'ADMIN-APOLLO-01',
      password: 'Apollo@2026'
    },
    beds: {
      totalBeds: 350,
      availableBeds: 142,
      icuTotal: 40,
      icuAvailable: 24,
      oxygenTotal: 80,
      oxygenAvailable: 58,
      generalTotal: 230,
      generalAvailable: 60
    },
    doctors: {
      totalDoctors: 85,
      availableDoctors: 32,
      emergencyDuty: 8,
      opdDuty: 24
    }
  },
  {
    id: 'lok_nayak',
    name: 'Lok Nayak Hospital (LNJP)',
    address: 'Jawaharlal Nehru Marg, Delhi Gate, New Delhi - 110002',
    phone: '+91-11-2323-6000',
    emergencyContact: '102 / +91-11-2323-3000',
    lat: 28.6369,
    lng: 77.2410,
    ambulancesAvailable: 6,
    admin: {
      name: 'Dr. Sunita Verma',
      id: 'ADMIN-LOKNAYAK-02',
      password: 'LokNayak@2026'
    },
    beds: {
      totalBeds: 500,
      availableBeds: 210,
      icuTotal: 60,
      icuAvailable: 30,
      oxygenTotal: 120,
      oxygenAvailable: 80,
      generalTotal: 320,
      generalAvailable: 100
    },
    doctors: {
      totalDoctors: 120,
      availableDoctors: 45,
      emergencyDuty: 12,
      opdDuty: 33
    }
  },
  {
    id: 'aiims',
    name: 'AIIMS New Delhi',
    address: 'Sri Aurobindo Marg, Ansari Nagar, New Delhi - 110029',
    phone: '+91-11-2658-8500',
    emergencyContact: '+91-11-2659-4405',
    lat: 28.5672,
    lng: 77.2100,
    ambulancesAvailable: 8,
    admin: {
      name: 'Dr. Arvind Gupta',
      id: 'ADMIN-AIIMS-03',
      password: 'Aiims@2026'
    },
    beds: {
      totalBeds: 650,
      availableBeds: 280,
      icuTotal: 80,
      icuAvailable: 45,
      oxygenTotal: 150,
      oxygenAvailable: 95,
      generalTotal: 420,
      generalAvailable: 140
    },
    doctors: {
      totalDoctors: 180,
      availableDoctors: 62,
      emergencyDuty: 18,
      opdDuty: 44
    }
  },
  {
    id: 'fortis',
    name: 'Fortis Escorts Heart Institute',
    address: 'Okhla Road, New Friends Colony, New Delhi - 110025',
    phone: '+91-11-4713-5000',
    emergencyContact: '105010 / +91-11-4713-5200',
    lat: 28.5603,
    lng: 77.2766,
    ambulancesAvailable: 5,
    admin: {
      name: 'Dr. Priya Nair',
      id: 'ADMIN-FORTIS-04',
      password: 'Fortis@2026'
    },
    beds: {
      totalBeds: 310,
      availableBeds: 98,
      icuTotal: 35,
      icuAvailable: 20,
      oxygenTotal: 65,
      oxygenAvailable: 38,
      generalTotal: 210,
      generalAvailable: 40
    },
    doctors: {
      totalDoctors: 75,
      availableDoctors: 28,
      emergencyDuty: 6,
      opdDuty: 22
    }
  },
  {
    id: 'max',
    name: 'Max Super Speciality Hospital',
    address: '1, 2, Press Enclave Marg, Saket, New Delhi - 110017',
    phone: '+91-11-2651-5050',
    emergencyContact: '+91-11-4055-4055',
    lat: 28.5283,
    lng: 77.2120,
    ambulancesAvailable: 4,
    admin: {
      name: 'Dr. Vikram Malhotra',
      id: 'ADMIN-MAX-05',
      password: 'MaxSaket@2026'
    },
    beds: {
      totalBeds: 420,
      availableBeds: 165,
      icuTotal: 50,
      icuAvailable: 28,
      oxygenTotal: 90,
      oxygenAvailable: 52,
      generalTotal: 280,
      generalAvailable: 85
    },
    doctors: {
      totalDoctors: 95,
      availableDoctors: 36,
      emergencyDuty: 10,
      opdDuty: 26
    }
  }
];

// Seed each hospital's independent database file
function seedDatabase(hospital) {
  const dbFile = path.join(DATA_DIR, `${hospital.id}.db`);
  const isNew = !fs.existsSync(dbFile);
  const db = new DatabaseSync(dbFile);

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_profile (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT,
      emergency_contact TEXT,
      lat REAL,
      lng REAL,
      ambulances_available INTEGER DEFAULT 4,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incoming_emergencies (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      symptoms TEXT NOT NULL,
      distance_km REAL,
      status TEXT NOT NULL, -- PENDING_APPROVAL, ACCEPTED, REJECTED, TIMEOUT
      created_at TEXT NOT NULL,
      responded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_credentials (
      admin_id TEXT PRIMARY KEY,
      admin_name TEXT NOT NULL,
      allotted_password TEXT NOT NULL,
      is_registered INTEGER DEFAULT 0,
      registered_at TEXT,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bed_inventory (
      id INTEGER PRIMARY KEY,
      total_beds INTEGER NOT NULL,
      available_beds INTEGER NOT NULL,
      icu_total INTEGER NOT NULL,
      icu_available INTEGER NOT NULL,
      oxygen_total INTEGER NOT NULL,
      oxygen_available INTEGER NOT NULL,
      general_total INTEGER NOT NULL,
      general_available INTEGER NOT NULL,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doctor_inventory (
      id INTEGER PRIMARY KEY,
      total_doctors INTEGER NOT NULL,
      available_doctors INTEGER NOT NULL,
      emergency_duty INTEGER NOT NULL,
      opd_duty INTEGER NOT NULL,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS realtime_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      category TEXT NOT NULL,
      admin_name TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  // Try adding columns in case table already existed
  try { db.exec('ALTER TABLE hospital_profile ADD COLUMN lat REAL'); } catch (_) {}
  try { db.exec('ALTER TABLE hospital_profile ADD COLUMN lng REAL'); } catch (_) {}
  try { db.exec('ALTER TABLE hospital_profile ADD COLUMN ambulances_available INTEGER DEFAULT 4'); } catch (_) {}

  // Populate or update hospital profile
  const existingProfile = db.prepare('SELECT id FROM hospital_profile WHERE id = ?').get(hospital.id);
  if (!existingProfile) {
    db.prepare(`
      INSERT INTO hospital_profile (id, name, address, phone, emergency_contact, lat, lng, ambulances_available, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(hospital.id, hospital.name, hospital.address, hospital.phone, hospital.emergencyContact, hospital.lat, hospital.lng, hospital.ambulancesAvailable, now);
  } else {
    db.prepare(`
      UPDATE hospital_profile
      SET lat = ?, lng = ?, ambulances_available = ?
      WHERE id = ?
    `).run(hospital.lat, hospital.lng, hospital.ambulancesAvailable, hospital.id);
  }

  // Developer pre-entry for admin credentials
  const existingAdmin = db.prepare('SELECT admin_id, is_registered FROM admin_credentials WHERE admin_id = ?').get(hospital.admin.id);
  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO admin_credentials (admin_id, admin_name, allotted_password, is_registered, registered_at, last_login_at)
      VALUES (?, ?, ?, 0, NULL, NULL)
    `).run(hospital.admin.id, hospital.admin.name, hospital.admin.password);
  } else if (process.argv.includes('--reset')) {
    db.prepare(`
      UPDATE admin_credentials
      SET admin_name = ?, allotted_password = ?, is_registered = 0, registered_at = NULL, last_login_at = NULL
      WHERE admin_id = ?
    `).run(hospital.admin.name, hospital.admin.password, hospital.admin.id);
  }

  // Bed inventory
  const existingBeds = db.prepare('SELECT id FROM bed_inventory WHERE id = 1').get();
  if (!existingBeds) {
    db.prepare(`
      INSERT INTO bed_inventory (id, total_beds, available_beds, icu_total, icu_available, oxygen_total, oxygen_available, general_total, general_available, last_updated)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hospital.beds.totalBeds,
      hospital.beds.availableBeds,
      hospital.beds.icuTotal,
      hospital.beds.icuAvailable,
      hospital.beds.oxygenTotal,
      hospital.beds.oxygenAvailable,
      hospital.beds.generalTotal,
      hospital.beds.generalAvailable,
      now
    );
  }

  // Doctor inventory
  const existingDoctors = db.prepare('SELECT id FROM doctor_inventory WHERE id = 1').get();
  if (!existingDoctors) {
    db.prepare(`
      INSERT INTO doctor_inventory (id, total_doctors, available_doctors, emergency_duty, opd_duty, last_updated)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      hospital.doctors.totalDoctors,
      hospital.doctors.availableDoctors,
      hospital.doctors.emergencyDuty,
      hospital.doctors.opdDuty,
      now
    );
  }

  // Ambulance driver tables & 10 developer pre-seeded drivers per hospital
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
      duty_status TEXT DEFAULT 'off_duty',
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
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  const driverNames = [
    'Ramesh Kumar', 'Manoj Yadav', 'Suresh Singh', 'Vikram Rathore', 'Deepak Sharma',
    'Amit Verma', 'Rajesh Tiwari', 'Sanjay Chauhan', 'Mohit Gujjar', 'Naresh Rawat'
  ];

  const hospPrefixMap = {
    apollo: 'APOLLO',
    lok_nayak: 'LOKNAYAK',
    aiims: 'AIIMS',
    fortis: 'FORTIS',
    max: 'MAX'
  };
  const prefix = hospPrefixMap[hospital.id] || hospital.id.toUpperCase();
  const hospIndex = HOSPITALS_CONFIG.findIndex(h => h.id === hospital.id) + 1;

  for (let i = 0; i < 10; i++) {
    const num = String(i + 1).padStart(2, '0');
    const driverId = `DRV-${prefix}-${num}`;
    const name = driverNames[i];
    const phone = `+91-98710-${hospIndex}${num}0`;
    const email = `driver.${hospital.id}.${i + 1}@smartcare.org`;
    const plate = `DL-01-EA-${hospIndex}0${num}`;

    // 4 on duty, 2 on service, 4 off duty
    let dutyStatus = 'off_duty';
    if (i < 4) dutyStatus = 'on_duty';
    else if (i < 6) dutyStatus = 'on_service';

    // Perturb coordinates near hospital
    const latOffset = (Math.sin(i * 1.3) * 0.015);
    const lngOffset = (Math.cos(i * 1.7) * 0.015);
    const driverLat = (hospital.lat || 28.6139) + latOffset;
    const driverLng = (hospital.lng || 77.2090) + lngOffset;

    const existingDriver = db.prepare('SELECT id FROM ambulance_drivers WHERE id = ?').get(driverId);
    if (!existingDriver) {
      db.prepare(`
        INSERT INTO ambulance_drivers (
          id, hospital_id, name, phone, email, vehicle_plate, vehicle_type,
          password, is_verified, duty_status, current_lat, current_lng, registered_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Advanced Life Support (ALS) Ambulance', 'Driver@123', 1, ?, ?, ?, ?)
      `).run(driverId, hospital.id, name, phone, email, plate, dutyStatus, driverLat, driverLng, now);
    } else if (process.argv.includes('--reset')) {
      db.prepare(`
        UPDATE ambulance_drivers
        SET duty_status = ?, current_lat = ?, current_lng = ?, current_ride_id = NULL
        WHERE id = ?
      `).run(dutyStatus, driverLat, driverLng, driverId);
    }
  }

  // Initial log entry
  const logCount = db.prepare('SELECT COUNT(*) as count FROM realtime_logs').get();
  if (logCount.count === 0) {
    db.prepare(`
      INSERT INTO realtime_logs (timestamp, category, admin_name, description)
      VALUES (?, 'SYSTEM_INIT', 'Developer System', ?)
    `).run(now, `Database seeded with developer master records for ${hospital.name}`);
  }

  db.close();
  console.log(`[Seed] Initialized database with 10 drivers for: ${hospital.name} (${hospital.id}.db)`);
}

function runAllSeeds() {
  console.log('Seeding 5 independent hospital databases...');
  for (const hospital of HOSPITALS_CONFIG) {
    seedDatabase(hospital);
  }
  console.log('All 5 hospital databases successfully seeded.');
}

if (require.main === module) {
  runAllSeeds();
}

module.exports = { HOSPITALS_CONFIG, runAllSeeds, seedDatabase, DATA_DIR };
