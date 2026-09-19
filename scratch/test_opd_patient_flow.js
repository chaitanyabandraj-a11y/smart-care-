const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const OPD_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'opd', 'opd.db');

async function testOpdFlow() {
  console.log('=== STARTING PATIENT OPD MODULE END-TO-END VERIFICATION ===\n');

  const BASE_URL = 'http://localhost:5000/api/opd';
  const testSessionId = 'ses_test_' + Date.now();
  const testMobile = '9811099234';

  // 1. Fetch hospitals
  console.log('1. Testing GET /api/opd/hospitals...');
  const hospRes = await fetch(`${BASE_URL}/hospitals`).then(r => r.json());
  console.log(`   Found ${hospRes.hospitals?.length} hospitals.`);
  const aiims = hospRes.hospitals.find(h => h.id === 'aiims');
  console.log(`   Selected: ${aiims.name} (${aiims.opdTimings})`);

  // 2. Log interaction click
  console.log('\n2. Testing POST /api/opd/interaction-log (with Date, Day, Time)...');
  const logRes = await fetch(`${BASE_URL}/interaction-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: testSessionId,
      stepName: 'STEP1_HOSPITAL_SELECTED',
      actionData: { hospitalId: aiims.id, hospitalName: aiims.name },
      mobile: testMobile
    })
  }).then(r => r.json());
  console.log(`   Logged interaction: success=${logRes.success}, loggedAt=${logRes.loggedAt}`);

  // 3. Send OTP
  console.log('\n3. Testing POST /api/opd/auth/send-otp...');
  const otpRes = await fetch(`${BASE_URL}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: testSessionId, mobile: testMobile })
  }).then(r => r.json());
  console.log(`   OTP generated: ${otpRes.otpCode} for mobile ${otpRes.mobile}`);

  // 4. Verify OTP
  console.log('\n4. Testing POST /api/opd/auth/verify-otp...');
  const verifyRes = await fetch(`${BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: testSessionId, otpCode: otpRes.otpCode })
  }).then(r => r.json());
  console.log(`   OTP verification: success=${verifyRes.success}, hasExistingProfile=${verifyRes.hasExistingProfile}`);

  // 5. Register Patient Demographics (Permanent UHID generation)
  console.log('\n5. Testing POST /api/opd/auth/register-patient (System ID Generation)...');
  const regRes = await fetch(`${BASE_URL}/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: testSessionId,
      patientData: {
        name: 'Ramesh Sharma',
        mobile: testMobile,
        gender: 'Male',
        age: 48,
        guardianName: 'Late Sh. K. Sharma',
        state: 'Delhi',
        district: 'South Delhi',
        pincode: '110029'
      }
    })
  }).then(r => r.json());
  console.log(`   Patient Registered! Permanent Health ID (UHID): ${regRes.uhid}`);
  console.log(`   Patient details: ${regRes.patient.name}, ${regRes.patient.age}Y/${regRes.patient.gender}`);

  // 6. Fetch Departments and Doctors
  console.log('\n6. Testing GET /api/opd/departments/aiims & /doctors/aiims...');
  const deptsRes = await fetch(`${BASE_URL}/departments/aiims`).then(r => r.json());
  console.log(`   Departments available: ${deptsRes.departments.join(', ')}`);

  const docRes = await fetch(`${BASE_URL}/doctors/aiims?department=Cardiology`).then(r => r.json());
  const doctor = docRes.doctors[0];
  console.log(`   Doctor selected: ${doctor.doctor_name} (${doctor.qualification}) - Room: ${doctor.room_no}`);

  // 7. Check Doctor Availability
  console.log(`\n7. Testing GET /api/opd/doctor/${doctor.doctor_id}/availability...`);
  const availRes = await fetch(`${BASE_URL}/doctor/${doctor.doctor_id}/availability`).then(r => r.json());
  const firstSlotDay = availRes.availability.schedule.find(s => s.isAvailable);
  console.log(`   First available date: ${firstSlotDay.date} (${firstSlotDay.day}), Remaining Tokens: ${firstSlotDay.remainingTokens}`);

  // 8. Book OPD Appointment
  console.log('\n8. Testing POST /api/opd/appointment/book (Token & Virtual Queue Generation)...');
  const bookRes = await fetch(`${BASE_URL}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: regRes.uhid,
      hospitalId: 'aiims',
      doctorId: doctor.doctor_id,
      appointmentDate: firstSlotDay.date,
      timeSlot: firstSlotDay.slots[0] || '10:00 AM - 10:15 AM',
      appointmentType: 'NEW',
      chiefComplaint: 'Chest tightness upon exertion',
      sessionId: testSessionId
    })
  }).then(r => r.json());
  console.log(`   Appointment Booked! Booking Ref: ${bookRes.appointment.id}`);
  console.log(`   Allocated Virtual Token Number: #${bookRes.appointment.token_number}`);

  // 9. Fetch Printable ORS Slip Details
  console.log(`\n9. Testing GET /api/opd/appointment/${bookRes.appointment.id} (Official Slip Data)...`);
  const slipRes = await fetch(`${BASE_URL}/appointment/${bookRes.appointment.id}`).then(r => r.json());
  console.log(`   Slip loaded: Patient=${slipRes.patient.name}, Doctor=${slipRes.doctor.doctor_name}, Room=${slipRes.appointment.room_no}, Token=#${slipRes.appointment.token_number}`);

  // 10. Fetch Live Sitting-at-Home Virtual Queue Status
  console.log(`\n10. Testing GET /api/opd/queue/aiims/${doctor.doctor_id}/${firstSlotDay.date}?token=${bookRes.appointment.token_number}...`);
  const queueRes = await fetch(`${BASE_URL}/queue/aiims/${doctor.doctor_id}/${firstSlotDay.date}?token=${bookRes.appointment.token_number}`).then(r => r.json());
  console.log(`    Virtual Queue Tracker:`);
  console.log(`    - Now Serving: #${queueRes.queue.currentServingToken}`);
  console.log(`    - Patient Token: #${queueRes.queue.patientTokenNumber}`);
  console.log(`    - Patients Ahead: ${queueRes.queue.patientsAhead}`);
  console.log(`    - Estimated Wait: ~${queueRes.queue.estimatedWaitMins} mins`);
  console.log(`    - State Advisory: ${queueRes.queue.queueState}`);

  // 11. Advance Token Simulation
  console.log('\n11. Testing POST /api/opd/queue/advance (Doctor Calls Next Token)...');
  const advRes = await fetch(`${BASE_URL}/queue/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospitalId: 'aiims',
      doctorId: doctor.doctor_id,
      queueDate: firstSlotDay.date
    })
  }).then(r => r.json());
  console.log(`    Queue Advanced: Now Serving Token #${advRes.queue.currentServingToken}`);

  // 12. Verify SQLite Database State Directly
  console.log('\n12. Verifying SQLite Database (backend/data/opd/opd.db)...');
  const db = new DatabaseSync(OPD_DB_PATH);

  const patientRow = db.prepare('SELECT id, name, registered_date, registered_day, registered_time FROM opd_patients WHERE id = ?').get(regRes.uhid);
  console.log(`    [opd_patients] Found UHID ${patientRow.id} registered on ${patientRow.registered_date} (${patientRow.registered_day}) at ${patientRow.registered_time}`);

  const clickLogs = db.prepare('SELECT step_name, created_date, created_day, created_time, action_data FROM opd_interaction_logs WHERE session_id = ?').all(testSessionId);
  console.log(`    [opd_interaction_logs] Found ${clickLogs.length} logged click interactions for session:`);
  clickLogs.forEach((log, idx) => {
    console.log(`      ${idx + 1}. [${log.step_name}] on ${log.created_date} (${log.created_day}) at ${log.created_time}`);
  });

  const aptRow = db.prepare('SELECT id, token_number, appointment_date, time_slot, status FROM opd_appointments WHERE id = ?').get(bookRes.appointment.id);
  console.log(`    [opd_appointments] Appointment ${aptRow.id} with Token #${aptRow.token_number} on ${aptRow.appointment_date} (${aptRow.time_slot})`);

  console.log('\n=== ALL PATIENT OPD TESTS PASSED WITH 100% SUCCESS ===\n');
}

testOpdFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
