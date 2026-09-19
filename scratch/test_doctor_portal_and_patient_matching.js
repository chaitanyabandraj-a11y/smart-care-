// End-to-End Automated Test: Doctor Registration, Login with Unique ID, Duty Schedule Configuration, & Seamless Patient Matching
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
  console.log('=== TESTING DOCTOR PORTAL & PATIENT MATCHING DUTY SCHEDULE ===\n');

  // 1. DOCTOR REGISTRATION
  console.log('1. Registering New Doctor with Indraprastha Apollo Hospital...');
  const regRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/doctor/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    hospitalId: 'apollo',
    doctorName: 'Dr. Sneha Roy',
    qualification: 'MBBS, MD (Pediatrics), DM (Pediatric Cardiology)',
    department: 'Pediatrics',
    specialty: 'Pediatric Interventional Cardiology',
    roomNo: 'OPD Chamber 305 (Tower B)',
    availableDays: ['Monday', 'Wednesday', 'Friday'],
    shiftStart: '09:30 AM',
    shiftEnd: '02:30 PM',
    maxDailyTokens: 25,
    avgConsultationMins: 12,
    password: 'Doctor@123',
    contactPhone: '9811223344',
    email: 'sneha.roy@apollo.example.com'
  });

  console.log(`   Registration Status: ${regRes.status}`);
  console.log(`   Success: ${regRes.body.success}`);
  console.log(`   Generated Unique Doctor ID: ${regRes.body.doctorId}`);
  console.log(`   Doctor Name: ${regRes.body.doctor.doctor_name}`);
  console.log(`   Assigned Duty Days: ${JSON.stringify(regRes.body.doctor.availableDays)}`);

  const doctorId = regRes.body.doctorId;
  if (!doctorId || !doctorId.startsWith('DOC-APOL-')) {
    throw new Error(`Expected doctorId starting with 'DOC-APOL-', got: ${doctorId}`);
  }

  // 2. DOCTOR LOGIN WITH UNIQUE ID & PASSWORD
  console.log('\n2. Testing Doctor Login with Unique Doctor ID and Password...');
  const loginRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/doctor/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    hospitalId: 'apollo',
    doctorId: doctorId,
    password: 'Doctor@123'
  });

  console.log(`   Login Status: ${loginRes.status}`);
  console.log(`   Login Success: ${loginRes.body.success}`);
  console.log(`   Welcome Message: "${loginRes.body.message}"`);
  if (!loginRes.body.success) throw new Error('Doctor login failed');

  // 3. DOCTOR DUTY SCHEDULE MANAGEMENT (Update duty days & chamber)
  console.log('\n3. Doctor updates Duty Schedule: Adds Saturday & updates room number...');
  const updateSchedRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/opd/doctor/${doctorId}/schedule`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    availableDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
    shiftStart: '10:00 AM',
    shiftEnd: '03:00 PM',
    roomNo: 'OPD Chamber 308 (Tower B)',
    maxDailyTokens: 28,
    avgConsultationMins: 14,
    isActive: true
  });

  console.log(`   Update Status: ${updateSchedRes.status}`);
  console.log(`   Success: ${updateSchedRes.body.success}`);
  console.log(`   Updated Duty Days: ${JSON.stringify(updateSchedRes.body.doctor.availableDays)}`);
  console.log(`   Updated Chamber: ${updateSchedRes.body.doctor.room_no}`);
  if (!updateSchedRes.body.doctor.availableDays.includes('Saturday')) {
    throw new Error('Saturday was not added to duty days');
  }

  // 4. PATIENT PORTAL LINKAGE & SCHEDULE MATCHING
  console.log('\n4. Verifying Doctor is visible to Patients in Apollo Hospital...');
  const deptRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/departments/apollo',
    method: 'GET'
  });

  console.log(`   Apollo Departments: ${JSON.stringify(deptRes.body.departments)}`);
  if (!deptRes.body.departments.includes('Pediatrics')) {
    throw new Error('Pediatrics department not listed in Apollo');
  }

  const docListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/doctors/apollo?department=Pediatrics',
    method: 'GET'
  });

  const matchedDoctor = docListRes.body.doctors.find(d => d.doctor_id === doctorId);
  console.log(`   Doctor Found in Patient Search: ${matchedDoctor?.doctor_name}`);
  console.log(`   Matching Department: ${matchedDoctor?.department}`);
  console.log(`   Matching Chamber: ${matchedDoctor?.room_no}`);
  console.log(`   Matching Shift: ${matchedDoctor?.shift_start} - ${matchedDoctor?.shift_end}`);
  console.log(`   Matching Scheduled Duty: ${JSON.stringify(matchedDoctor?.availableDays)}`);
  if (!matchedDoctor) throw new Error('Registered doctor not found in hospital department listing');

  // 5. PATIENT CHECKS AVAILABILITY: VERIFY MATCHING DUTY DAYS
  console.log('\n5. Checking 14-Day Calendar: Verifying ONLY doctor scheduled duty days are enabled...');
  const availRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/opd/doctor/${doctorId}/availability`,
    method: 'GET'
  });

  const schedule = availRes.body.availability.schedule;
  console.log(`   Total calendar days returned: ${schedule.length}`);

  // Check duty days matching
  let dutyDaysFound = 0;
  let offDutyDaysFound = 0;
  schedule.forEach(day => {
    if (['Monday', 'Wednesday', 'Friday', 'Saturday'].includes(day.day)) {
      if (!day.isDutyDay) throw new Error(`Expected ${day.day} (${day.date}) to be a Duty Day!`);
      dutyDaysFound++;
    } else {
      if (day.isDutyDay) throw new Error(`Expected ${day.day} (${day.date}) to be OFF DUTY!`);
      offDutyDaysFound++;
    }
  });

  console.log(`   Matching Duty Days Verified Active: ${dutyDaysFound} days`);
  console.log(`   Non-Duty Days Correctly Marked Off-Duty: ${offDutyDaysFound} days`);

  // Pick a matching duty day
  const chosenDutyDay = schedule.find(s => s.isDutyDay && s.isAvailable);
  console.log(`   Chosen Matching Duty Date for Booking: ${chosenDutyDay.date} (${chosenDutyDay.day})`);

  // 6. PATIENT BOOKS APPOINTMENT WITH DR. SNEHA ROY
  console.log(`\n6. Patient registers & books appointment for Dr. Sneha Roy on ${chosenDutyDay.date}...`);
  const randomMobile = '97' + Math.floor(10000000 + Math.random() * 90000000);
  const patientRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/auth/register-patient',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    sessionId: 'test_doc_sync_' + Date.now(),
    patientData: {
      name: 'Baby Ananya Sharma',
      gender: 'Female',
      age: 4,
      mobile: randomMobile,
      state: 'Delhi',
      district: 'South Delhi'
    }
  });

  const patient = patientRes.body.patient;
  console.log(`   Patient Registered. UHID: ${patient.id} (Name: ${patient.name})`);

  const bookRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/opd/appointment/book',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    uhid: patient.id,
    hospitalId: 'apollo',
    doctorId: doctorId,
    appointmentDate: chosenDutyDay.date,
    appointmentType: 'NEW',
    chiefComplaint: 'Pediatric heart murmur follow-up',
    sessionId: 'test_doc_sync_' + Date.now()
  });

  console.log(`   Booking Status: ${bookRes.status}`);
  console.log(`   Success: ${bookRes.body.success}`);
  console.log(`   Token Number Assigned: #${bookRes.body.appointment.token_number}`);
  console.log(`   Appointment ID: ${bookRes.body.appointment.id}`);
  if (bookRes.body.appointment.token_number !== 1) {
    throw new Error('Expected Token #1 for first patient');
  }

  // 7. DOCTOR PORTAL: UPCOMING APPOINTMENTS CALENDAR
  console.log('\n7. Doctor checks Upcoming Duty Appointments Calendar in Doctor Portal...');
  const docUpcomingRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/opd/doctor/${doctorId}/upcoming-schedule`,
    method: 'GET'
  });

  console.log(`   Total Upcoming Appointments: ${docUpcomingRes.body.totalUpcomingAppointments}`);
  const dayAppointments = docUpcomingRes.body.groupedAppointments[chosenDutyDay.date];
  console.log(`   Appointments on ${chosenDutyDay.date}: ${dayAppointments?.length}`);
  const appointedPatient = dayAppointments?.[0];
  console.log(`   Appointed Patient: ${appointedPatient?.patient_name} (Token #${appointedPatient?.token_number}, UHID: ${appointedPatient?.uhid})`);
  console.log(`   Complaint: "${appointedPatient?.chief_complaint}"`);

  if (!appointedPatient || appointedPatient.uhid !== patient.id) {
    throw new Error('Appointed patient does not match in doctor upcoming schedule');
  }

  console.log('\n=== ALL DOCTOR PORTAL & PATIENT MATCHING TESTS PASSED WITH 100% SUCCESS ===');
}

runTest().catch(err => {
  console.error('\n❌ Test Failed:', err);
  process.exit(1);
});
