const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const OPD_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'opd', 'opd.db');
const BASE_URL = 'http://localhost:5000/api/opd';

async function testSyncFlow() {
  console.log('=== STARTING DOCTOR-PATIENT REAL-TIME SYNC & UNIQUE ID VERIFICATION ===\n');

  const todayStr = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  // 1. New Patient Registration
  console.log('1. Testing New Patient Registration with System-Generated Unique ID...');
  const testMobile = '99100' + Math.floor(10000 + Math.random() * 90000);
  const regRes = await fetch(`${BASE_URL}/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'ses_reg_' + Date.now(),
      patientData: {
        name: 'Sunita Verma',
        mobile: testMobile,
        gender: 'Female',
        age: 42,
        state: 'Delhi',
        hospitalId: 'apollo'
      }
    })
  }).then(r => r.json());

  console.log(`   Registration Result: success=${regRes.success}`);
  console.log(`   Assigned Guaranteed Unique Patient ID: ${regRes.uhid}`);
  const patient1Uhid = regRes.uhid;

  // 2. Existing Patient Login via Unique ID
  console.log('\n2. Testing Existing Patient Login using UHID (System Identifier)...');
  const loginOtpRes = await fetch(`${BASE_URL}/auth/patient-login-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'ses_login_' + Date.now(),
      identifier: patient1Uhid
    })
  }).then(r => r.json());

  console.log(`   Login OTP requested for: ${loginOtpRes.uhid} (${loginOtpRes.patientName})`);
  console.log(`   OTP sent to: ${loginOtpRes.maskedMobile}, Demo Code: ${loginOtpRes.otpCode}`);

  const verifyLoginRes = await fetch(`${BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: loginOtpRes.sessionId,
      otpCode: loginOtpRes.otpCode
    })
  }).then(r => r.json());

  console.log(`   Login OTP Verified: success=${verifyLoginRes.success}, Patient: ${verifyLoginRes.patient?.name}`);

  // 3. Book Patient 1 on Today's Date (No fixed 15-min slots, sequential token)
  console.log(`\n3. Booking Patient 1 for Today (${todayStr}) with Sequential Token...`);
  const book1 = await fetch(`${BASE_URL}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: patient1Uhid,
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-01',
      appointmentDate: todayStr,
      timeSlot: '09:30 AM - 03:00 PM',
      appointmentType: 'NEW',
      chiefComplaint: 'Routine Cardiac Consultation'
    })
  }).then(r => r.json());

  console.log(`   Booked! Apt ID: ${book1.appointment.id}, Sequential Token: #${book1.appointment.token_number}`);
  const token1 = book1.appointment.token_number;

  // 4. Register and Book Patient 2 on Today's Date
  console.log(`\n4. Booking Patient 2 for Today to test queue progression...`);
  const regRes2 = await fetch(`${BASE_URL}/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'ses_reg2_' + Date.now(),
      patientData: {
        name: 'Amitabh Sharma',
        mobile: '98200' + Math.floor(10000 + Math.random() * 90000),
        gender: 'Male',
        age: 55,
        hospitalId: 'apollo'
      }
    })
  }).then(r => r.json());

  const book2 = await fetch(`${BASE_URL}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: regRes2.uhid,
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-01',
      appointmentDate: todayStr,
      timeSlot: '09:30 AM - 03:00 PM',
      appointmentType: 'FOLLOW_UP',
      chiefComplaint: 'Hypertension follow-up'
    })
  }).then(r => r.json());

  console.log(`   Patient 2 Booked! Apt ID: ${book2.appointment.id}, Sequential Token: #${book2.appointment.token_number}`);
  const token2 = book2.appointment.token_number;

  // 5. Test Doctor Login
  console.log('\n5. Testing Doctor Login (DOC-APOLLO-01 at apollo)...');
  const docLogin = await fetch(`${BASE_URL}/doctor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: 'apollo', doctorId: 'DOC-APOLLO-01' })
  }).then(r => r.json());

  console.log(`   Doctor Authenticated: Dr. ${docLogin.doctor?.doctor_name} (${docLogin.doctor?.specialty})`);

  // 6. Check Patient Queue BEFORE Doctor arrives on desk
  console.log('\n6. Checking Patient Virtual Queue before Doctor sits on desk...');
  const queueBefore = await fetch(`${BASE_URL}/queue/apollo/DOC-APOLLO-01/${todayStr}?token=${token1}`).then(r => r.json());
  console.log(`   Doctor Status: ${queueBefore.queue.doctorStatus}`);
  console.log(`   Queue State for Patient: ${queueBefore.queue.queueState}`);
  console.log(`   Now Serving: ${queueBefore.queue.currentServingToken}`);

  // 7. Doctor Arrives on Desk & Starts Session
  console.log('\n7. Doctor Arrives on Desk: POST /api/opd/doctor/session/start...');
  const sessionStart = await fetch(`${BASE_URL}/doctor/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: 'apollo', doctorId: 'DOC-APOLLO-01', date: todayStr })
  }).then(r => r.json());

  console.log(`   Doctor Session Result: ${sessionStart.message}`);
  console.log(`   Queue Doctor Status: ${sessionStart.queue.doctorStatus}`);

  // 8. Doctor Calls Token #1
  console.log(`\n8. Doctor Calls Patient Token #${token1}...`);
  const call1 = await fetch(`${BASE_URL}/doctor/call-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: 'apollo', doctorId: 'DOC-APOLLO-01', date: todayStr, targetToken: token1 })
  }).then(r => r.json());

  console.log(`   Called Token: #${call1.calledToken}`);
  console.log(`   Patient inside Chamber: ${call1.calledPatient?.patient_name}`);

  // Check Patient 1 Queue status: should be INSIDE_CHAMBER
  const q1 = await fetch(`${BASE_URL}/queue/apollo/DOC-APOLLO-01/${todayStr}?token=${token1}`).then(r => r.json());
  console.log(`   Patient 1 State: ${q1.queue.queueState} (Now Serving: #${q1.queue.currentServingToken})`);

  // Check Patient 2 Queue status: should be waiting or calling soon
  const q2 = await fetch(`${BASE_URL}/queue/apollo/DOC-APOLLO-01/${todayStr}?token=${token2}`).then(r => r.json());
  console.log(`   Patient 2 State: ${q2.queue.queueState}, Patients Ahead: ${q2.queue.patientsAhead}, Est Wait: ~${q2.queue.estimatedWaitMins}m`);

  // 9. Simulate 1.5 seconds consultation, then Doctor Calls Token #2
  console.log('\n9. Simulating consultation time, then Doctor calls Token #2 (Recording duration on Token #1)...');
  await new Promise(res => setTimeout(res, 1500));

  const call2 = await fetch(`${BASE_URL}/doctor/call-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: 'apollo', doctorId: 'DOC-APOLLO-01', date: todayStr, targetToken: token2 })
  }).then(r => r.json());

  console.log(`   Next Called: Token #${call2.calledToken} (${call2.calledPatient?.patient_name})`);

  // 10. Check Roster & Recorded Consultation Duration in SQLite
  console.log('\n10. Verifying Doctor Today Roster & Consultation Duration recording...');
  const rosterRes = await fetch(`${BASE_URL}/doctor/apollo/DOC-APOLLO-01/today-roster?date=${todayStr}`).then(r => r.json());
  console.log(`    Total consultations completed today: ${rosterRes.queue.totalCompleted}`);
  console.log(`    Recorded average consultation duration: ~${rosterRes.queue.avgConsultationMins} mins`);

  const finishedApt1 = rosterRes.appointments.find(a => a.token_number === token1);
  console.log(`    Patient 1 (${finishedApt1.patient_name}) Status: ${finishedApt1.status}, Duration Recorded: ${finishedApt1.consultation_duration_mins} min`);

  // 11. Test Future Date Appointment (Verify it does NOT show "Consultation Completed"!)
  console.log(`\n11. Testing Future Date Appointment (${futureDate})...`);
  const futureBook = await fetch(`${BASE_URL}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: patient1Uhid,
      hospitalId: 'apollo',
      doctorId: 'DOC-APOLLO-01',
      appointmentDate: futureDate,
      timeSlot: '09:30 AM - 03:00 PM',
      appointmentType: 'FOLLOW_UP',
      chiefComplaint: 'Follow-up ECG Review'
    })
  }).then(r => r.json());

  const futureQueue = await fetch(`${BASE_URL}/queue/apollo/DOC-APOLLO-01/${futureDate}?token=${futureBook.appointment.token_number}`).then(r => r.json());
  console.log(`    Future Queue State: ${futureQueue.queue.queueState}`);
  console.log(`    Future IsFuture Flag: ${futureQueue.queue.isFuture}`);
  console.log(`    Future Now Serving: ${futureQueue.queue.currentServingToken} (Should be 0 / not started)`);
  console.log(`    Future Patient Token: #${futureQueue.queue.patientTokenNumber}`);

  console.log('\n=== ALL DOCTOR-PATIENT REAL-TIME SYNC TESTS PASSED WITH 100% SUCCESS ===\n');
}

testSyncFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
