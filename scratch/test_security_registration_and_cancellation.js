// Automated End-to-End Test for:
// 1. Doctor Registration Security Verification (hospital authorized IDs only, bogus IDs rejected)
// 2. Doctor Desk Real-time Availability (chamber open / on desk telemetry)
// 3. Patient Appointment Cancellation (immediate status update in opd.db and doctor portal, slot freed)

const http = require('http');
const opdDbManager = require('../backend/src/db/opdDbManager');

const BASE_URL = 'http://localhost:5000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('  BEGINNING E2E TEST: SECURITY REGISTRATION & CANCELLATION');
  console.log('===============================================================\n');

  // Reset test doctor DOC-APOLLO-06 for repeatable testing
  const db = opdDbManager.getOpdDb();
  db.prepare("UPDATE opd_doctor_schedules SET portal_registered = 0, password = 'Doctor@123' WHERE doctor_id = 'DOC-APOLLO-06'").run();
  db.prepare("DELETE FROM opd_appointments WHERE doctor_id = 'DOC-APOLLO-06'").run();

  let passed = 0;
  let total = 0;

  function assert(condition, testName, extraInfo = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${extraInfo}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Bogus Doctor ID Verification (Must be Rejected)
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Doctor ID Security Verification ---');
    const fakeVerify = await makeRequest('POST', '/api/opd/doctor/verify-id', {
      hospitalId: 'apollo',
      doctorId: 'DOC-FAKE-99999'
    });
    assert(
      fakeVerify.status === 403 && fakeVerify.body?.securityError === true,
      'Bogus Doctor ID DOC-FAKE-99999 rejected with HTTP 403 Security Verification Error',
      JSON.stringify(fakeVerify)
    );

    // -------------------------------------------------------------
    // TEST 2: Bogus Doctor ID Registration (Must be Blocked)
    // -------------------------------------------------------------
    const fakeReg = await makeRequest('POST', '/api/opd/doctor/register', {
      hospitalId: 'apollo',
      doctorId: 'DOC-FAKE-99999',
      doctorName: 'Dr. Hacker Fake',
      department: 'Cardiology',
      password: 'password123'
    });
    assert(
      fakeReg.status === 403 && fakeReg.body?.success === false,
      'Bogus Doctor Registration rejected by database security policy',
      JSON.stringify(fakeReg)
    );

    // -------------------------------------------------------------
    // TEST 3: Pre-Authorized Doctor ID Verification (e.g. DOC-APOLLO-05)
    // -------------------------------------------------------------
    const authVerify = await makeRequest('POST', '/api/opd/doctor/verify-id', {
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-05'
    });
    assert(
      authVerify.status === 200 && authVerify.body?.success === true,
      'Authorized Doctor ID DOC-APOLLO-05 verified successfully against hospital staff registry',
      JSON.stringify(authVerify)
    );

    // -------------------------------------------------------------
    // TEST 4: Authorized Doctor Registration with Duty Schedule
    // -------------------------------------------------------------
    console.log('\n--- 2. Registering Authorized Doctor with Duty Schedule ---');
    const regRes = await makeRequest('POST', '/api/opd/doctor/register', {
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06', // Use APOLLO-06 for fresh registration
      doctorName: 'Dr. Vivek Saxena',
      qualification: 'MBBS, MD, DM (Cardiology)',
      department: 'Cardiology',
      specialty: 'Interventional Cardiology',
      roomNo: 'OPD Chamber 306 (Tower B)',
      shiftStart: '09:00 AM',
      shiftEnd: '02:00 PM',
      availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      maxDailyTokens: 35,
      avgConsultationMins: 14,
      password: 'SecureDoctorPass@123',
      phone: '9876543210',
      email: 'dr.vivek@apollo.example.com'
    });
    assert(
      regRes.status === 200 && regRes.body?.success === true,
      'Authorized Doctor DOC-APOLLO-06 registered with complete schedule',
      JSON.stringify(regRes)
    );

    // -------------------------------------------------------------
    // TEST 5: Double-Registration Prevention
    // -------------------------------------------------------------
    const doubleReg = await makeRequest('POST', '/api/opd/doctor/register', {
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06',
      doctorName: 'Dr. Impostor',
      password: 'newpassword'
    });
    assert(
      doubleReg.status === 400 && doubleReg.body?.success === false,
      'Double registration of DOC-APOLLO-06 prevented',
      JSON.stringify(doubleReg)
    );

    // -------------------------------------------------------------
    // TEST 6: Doctor Portal Login (Clean Auth with No Demo Defaults)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Clean Doctor Login ---');
    const loginRes = await makeRequest('POST', '/api/opd/doctor/login', {
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06',
      password: 'SecureDoctorPass@123'
    });
    assert(
      loginRes.status === 200 && loginRes.body?.success === true && loginRes.body?.doctor?.doctor_id === 'DOC-APOLLO-06',
      'Doctor DOC-APOLLO-06 logged in with secure credentials',
      JSON.stringify(loginRes)
    );

    // -------------------------------------------------------------
    // TEST 7: Doctor Starts Desk Session (Live Telemetry)
    // -------------------------------------------------------------
    console.log('\n--- 4. Real-Time Desk Status & Telemetry ---');
    const today = new Date().toISOString().split('T')[0];
    const sessionStart = await makeRequest('POST', '/api/opd/doctor/session/start', {
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06',
      date: today
    });
    assert(
      sessionStart.status === 200 && sessionStart.body?.queue?.doctorStatus === 'ON_DESK',
      'Doctor DOC-APOLLO-06 opened chamber desk (doctorStatus: ON_DESK)',
      JSON.stringify(sessionStart)
    );

    // Fetch doctors from hospital to check real-time isCurrentlyOnDesk flag
    const docsList = await makeRequest('GET', `/api/opd/doctors/apollo?department=Cardiology`);
    const docInList = docsList.body?.doctors?.find(d => d.doctor_id === 'DOC-APOLLO-06');
    assert(
      docInList && docInList.isCurrentlyOnDesk === true,
      'Doctor DOC-APOLLO-06 shows isCurrentlyOnDesk: true in hospital listing for patients',
      JSON.stringify(docInList)
    );

    // -------------------------------------------------------------
    // TEST 8: Patient Registration & Booking
    // -------------------------------------------------------------
    console.log('\n--- 5. Patient Booking & Cancellation Flow ---');
    const regPatient = await makeRequest('POST', '/api/opd/auth/register-patient', {
      sessionId: 'ses_test_runner_cancel',
      patientData: {
        mobile: '9811223399',
        name: 'Amitabh Verma',
        gender: 'Male',
        age: 48,
        state: 'Delhi',
        address: 'Sector 15, Dwarka, New Delhi'
      }
    });

    const uhid = regPatient.body?.uhid || regPatient.body?.patient?.id;
    assert(uhid != null, `Patient registered or retrieved UHID: ${uhid}`);

    // Book appointment for today
    const bookingRes = await makeRequest('POST', '/api/opd/appointment/book', {
      uhid,
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06',
      appointmentDate: today,
      timeSlot: '09:00 AM - 02:00 PM',
      appointmentType: 'NEW',
      chiefComplaint: 'Chest tightness on exertion'
    });
    assert(
      bookingRes.status === 200 && bookingRes.body?.success === true,
      `Patient booked appointment. Token #${bookingRes.body?.appointment?.token_number}`,
      JSON.stringify(bookingRes)
    );

    const appointmentId = bookingRes.body?.appointment?.id;
    const tokenNumber = bookingRes.body?.appointment?.token_number;

    // Check doctor roster contains this appointment
    const rosterRes = await makeRequest('GET', `/api/opd/doctor/apollo/DOC-APOLLO-06/today-roster?date=${today}`);
    const inRoster = rosterRes.body?.appointments?.find(a => a.id === appointmentId);
    assert(
      inRoster != null && inRoster.token_number === tokenNumber,
      `Appointment ${appointmentId} is active in doctor roster (status: ${inRoster?.status})`
    );

    // -------------------------------------------------------------
    // TEST 9: Patient Cancels Appointment
    // -------------------------------------------------------------
    console.log('\n--- 6. Executing Patient Cancellation ---');
    const cancelRes = await makeRequest('POST', `/api/opd/appointment/${appointmentId}/cancel`, {
      cancellationReason: 'Patient feeling better / rescheduling to another week',
      uhid
    });
    assert(
      cancelRes.status === 200 && cancelRes.body?.success === true,
      `Appointment ${appointmentId} cancelled successfully via API`,
      JSON.stringify(cancelRes)
    );

    // Verify appointment in database is marked CANCELLED and excluded from active roster
    const dbAppt = db.prepare("SELECT * FROM opd_appointments WHERE id = ?").get(appointmentId);
    assert(
      dbAppt && dbAppt.status === 'CANCELLED' && dbAppt.cancelled_at != null,
      `Appointment ${appointmentId} in opd.db is marked CANCELLED with timestamp ${dbAppt?.cancelled_at}`,
      `Found db status: ${dbAppt?.status}`
    );

    const postCancelRoster = await makeRequest('GET', `/api/opd/doctor/apollo/DOC-APOLLO-06/today-roster?date=${today}`);
    const activeInRoster = postCancelRoster.body?.appointments?.find(a => a.id === appointmentId);
    assert(
      activeInRoster === undefined,
      `Cancelled appointment ${appointmentId} is removed from doctor active roster`,
      `Still in roster: ${JSON.stringify(activeInRoster)}`
    );

    // Verify queue tokens count does not count cancelled appointments
    const queueRes = await makeRequest('GET', `/api/opd/queue/apollo/DOC-APOLLO-06/${today}?token=${tokenNumber}`);
    assert(
      queueRes.status === 200,
      'Virtual queue status retrieved successfully post-cancellation'
    );

    // -------------------------------------------------------------
    // TEST 10: Slot is Immediately Freed for Re-Booking
    // -------------------------------------------------------------
    console.log('\n--- 7. Verifying Slot Freed for Re-Booking ---');
    const rebookRes = await makeRequest('POST', '/api/opd/appointment/book', {
      uhid,
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-06',
      appointmentDate: today,
      timeSlot: '09:00 AM - 02:00 PM',
      appointmentType: 'NEW',
      chiefComplaint: 'Re-booking following previous cancellation'
    });
    assert(
      rebookRes.status === 200 && rebookRes.body?.success === true,
      `Patient successfully re-booked on same date after cancelling! New Token #${rebookRes.body?.appointment?.token_number}`,
      JSON.stringify(rebookRes)
    );

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n===============================================================');
    console.log(`  E2E TEST SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
    console.log('===============================================================\n');

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error in tests:', err);
    process.exit(1);
  }
}

runTests();
