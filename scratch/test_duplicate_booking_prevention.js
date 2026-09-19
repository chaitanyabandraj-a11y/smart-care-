// End-to-end automated test for Duplicate OPD Appointment Prevention & Slot Conservation
const http = require('http');

async function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTest() {
  console.log('=== TESTING DUPLICATE OPD APPOINTMENT PREVENTION & SLOT CONSERVATION ===\n');

  const randomMobile = '99' + Math.floor(10000000 + Math.random() * 90000000);
  const sessionId = 'test_dup_' + Date.now();

  // 1. Register Patient A
  console.log(`1. Registering Patient A (Mobile: ${randomMobile})...`);
  const regRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/auth/register-patient',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    sessionId,
    patientData: {
      name: 'Rameshwar Gupta',
      gender: 'Male',
      age: 48,
      mobile: randomMobile,
      state: 'Delhi',
      district: 'East Delhi'
    }
  });

  const patientA = regRes.body.patient;
  console.log(`   Patient A registered. UHID: ${patientA.id}`);

  // 2. Fetch Availability before booking
  console.log('\n2. Fetching Dr. Alok Mukherjee (DOC-APOLLO-01) availability for Patient A...');
  const availRes1 = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/opd/doctor/DOC-APOLLO-01/availability?patientId=${patientA.id}`,
    method: 'GET'
  });

  const targetDay = availRes1.body.availability.schedule.find(s => s.isAvailable);
  console.log(`   Target Date selected: ${targetDay.date} (${targetDay.day})`);
  console.log(`   Patient Already Booked Flag: ${targetDay.patientAlreadyBooked} (Expected: false)`);
  if (targetDay.patientAlreadyBooked !== false) throw new Error('Expected patientAlreadyBooked to be false');

  const initialBookedCount = targetDay.bookedCount;
  console.log(`   Initial Booked Count on ${targetDay.date}: ${initialBookedCount}`);

  // 3. Book Patient A for Target Date (First Booking)
  console.log(`\n3. Booking Patient A for ${targetDay.date}...`);
  const bookRes1 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/appointment/book',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    uhid: patientA.id,
    hospitalId: 'apollo',
    doctorId: 'DOC-APOLLO-01',
    appointmentDate: targetDay.date,
    appointmentType: 'NEW',
    chiefComplaint: 'Cardiac evaluation',
    sessionId
  });

  console.log(`   Status: ${bookRes1.status}`);
  console.log(`   Success: ${bookRes1.body.success}`);
  console.log(`   Token Number Assigned: #${bookRes1.body.appointment.token_number}`);
  console.log(`   Appointment ID: ${bookRes1.body.appointment.id}`);
  const assignedToken = bookRes1.body.appointment.token_number;

  // 4. Re-check Availability for Patient A
  console.log('\n4. Re-checking Doctor Availability for Patient A...');
  const availRes2 = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/opd/doctor/DOC-APOLLO-01/availability?patientId=${patientA.id}`,
    method: 'GET'
  });

  const targetDayAfter = availRes2.body.availability.schedule.find(s => s.date === targetDay.date);
  console.log(`   Patient Already Booked Flag: ${targetDayAfter.patientAlreadyBooked} (Expected: true)`);
  console.log(`   Existing Appointment Token in Schedule: #${targetDayAfter.existingAppointment.token_number}`);
  if (!targetDayAfter.patientAlreadyBooked) throw new Error('Expected patientAlreadyBooked to be true!');
  if (targetDayAfter.existingAppointment.token_number !== assignedToken) throw new Error('Token mismatch in availability schedule');

  // 5. ATTEMPT DUPLICATE BOOKING (Same Patient + Same Doctor + Same Date)
  console.log(`\n5. Attempting DUPLICATE booking for Patient A on ${targetDay.date} with same doctor...`);
  const bookResDuplicate = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/appointment/book',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    uhid: patientA.id,
    hospitalId: 'apollo',
    doctorId: 'DOC-APOLLO-01',
    appointmentDate: targetDay.date,
    appointmentType: 'FOLLOW_UP',
    chiefComplaint: 'Followup check',
    sessionId
  });

  console.log(`   Status: ${bookResDuplicate.status} (Expected: 409 Conflict)`);
  console.log(`   Success: ${bookResDuplicate.body.success} (Expected: false)`);
  console.log(`   Duplicate Flag: ${bookResDuplicate.body.duplicate} (Expected: true)`);
  console.log(`   Message Displayed: "${bookResDuplicate.body.message}"`);
  console.log(`   Detailed Error: "${bookResDuplicate.body.error}"`);
  console.log(`   Referenced Existing Token: #${bookResDuplicate.body.existingAppointment.token_number}`);

  if (bookResDuplicate.status !== 409 && bookResDuplicate.status !== 400) {
    throw new Error(`Expected HTTP 409/400, got ${bookResDuplicate.status}`);
  }
  if (!bookResDuplicate.body.duplicate) {
    throw new Error('Duplicate flag was not returned!');
  }
  if (!bookResDuplicate.body.message.includes('You already booked your appointment')) {
    throw new Error(`Expected 'You already booked your appointment', got: ${bookResDuplicate.body.message}`);
  }

  // 6. VERIFY SLOT WAS SAVED FOR ANOTHER PATIENT
  console.log('\n6. Registering Patient B to verify that the slot was saved for them...');
  const randomMobileB = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const regResB = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/auth/register-patient',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    sessionId: 'ses_b_' + Date.now(),
    patientData: {
      name: 'Sunita Mehra',
      gender: 'Female',
      age: 39,
      mobile: randomMobileB,
      state: 'Delhi',
      district: 'South Delhi'
    }
  });
  const patientB = regResB.body.patient;

  console.log(`   Booking Patient B for ${targetDay.date} with Dr. Alok Mukherjee...`);
  const bookResB = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/appointment/book',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    uhid: patientB.id,
    hospitalId: 'apollo',
    doctorId: 'DOC-APOLLO-01',
    appointmentDate: targetDay.date,
    appointmentType: 'NEW',
    chiefComplaint: 'Hypertension consultation',
    sessionId: 'ses_b_' + Date.now()
  });

  console.log(`   Patient B Booking Success: ${bookResB.body.success}`);
  console.log(`   Patient B Token Assigned: #${bookResB.body.appointment.token_number} (Expected: #${assignedToken + 1})`);

  if (bookResB.body.appointment.token_number !== assignedToken + 1) {
    throw new Error(`Expected Token #${assignedToken + 1}, got #${bookResB.body.appointment.token_number}`);
  }

  console.log('\n=== ALL DUPLICATE BOOKING PREVENTION TESTS PASSED WITH 100% SUCCESS ===');
}

runTest().catch(err => {
  console.error('\n❌ Test Failed:', err);
  process.exit(1);
});
