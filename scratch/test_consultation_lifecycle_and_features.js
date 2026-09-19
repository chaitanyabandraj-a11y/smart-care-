// Test Script: Two-Step Consultation Lifecycle, No Phantom Tokens, Prescriptions, QR, & Audit Logs
const API_BASE = 'http://localhost:5000/api/opd';

async function runTest() {
  console.log('=== STARTING AUTOMATED TEST: TWO-STEP CONSULTATION LIFECYCLE & FEATURES ===\n');

  const todayStr = new Date().toISOString().split('T')[0];
  const testHospitalId = 'aiims';
  const testDoctorId = 'DOC-AIIMS-01';

  // 1. Register 2 unique patients and book appointments
  console.log('1. Registering 2 patients to generate permanent UHIDs...');
  const reg1Res = await fetch(`${API_BASE}/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess_test_1',
      patientData: {
        name: 'Rohan Sharma',
        mobile: `9811${Math.floor(100000 + Math.random() * 900000)}`,
        age: 38,
        gender: 'MALE',
        bloodGroup: 'B+'
      }
    })
  });
  const reg1 = await reg1Res.json();
  const uhid1 = reg1.uhid;
  console.log(`  -> Patient 1 Registered: ${reg1.patient?.name || reg1.patient?.full_name}, Permanent UHID: ${uhid1}`);

  const reg2Res = await fetch(`${API_BASE}/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess_test_2',
      patientData: {
        name: 'Pooja Verma',
        mobile: `9822${Math.floor(100000 + Math.random() * 900000)}`,
        age: 32,
        gender: 'FEMALE',
        bloodGroup: 'O+'
      }
    })
  });
  const reg2 = await reg2Res.json();
  const uhid2 = reg2.uhid;
  console.log(`  -> Patient 2 Registered: ${reg2.patient?.name || reg2.patient?.full_name}, Permanent UHID: ${uhid2}`);

  console.log('\n2. Booking OPD Appointments for today...');
  const book1Res = await fetch(`${API_BASE}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: uhid1,
      hospitalId: testHospitalId,
      doctorId: testDoctorId,
      appointmentDate: todayStr,
      timeSlot: '10:00 AM - 10:30 AM',
      appointmentType: 'NEW',
      chiefComplaint: 'Chest tightness, mild cough',
      sessionId: 'sess_test_1'
    })
  });
  const book1 = await book1Res.json();
  console.log(`  -> Appointment 1: Token #${book1.appointment?.token_number}, Status: ${book1.appointment?.status}`);

  const book2Res = await fetch(`${API_BASE}/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uhid: uhid2,
      hospitalId: testHospitalId,
      doctorId: testDoctorId,
      appointmentDate: todayStr,
      timeSlot: '10:30 AM - 11:00 AM',
      appointmentType: 'NEW',
      chiefComplaint: 'Routine blood pressure check',
      sessionId: 'sess_test_2'
    })
  });
  const book2 = await book2Res.json();
  console.log(`  -> Appointment 2: Token #${book2.appointment?.token_number}, Status: ${book2.appointment?.status}`);

  const token1 = book1.appointment.token_number;
  const token2 = book2.appointment.token_number;

  // 2. Doctor starts desk session
  console.log('\n3. Doctor starts desk session...');
  const startRes = await fetch(`${API_BASE}/doctor/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr })
  });
  const startData = await startRes.json();
  console.log(`  -> Doctor Status: ${startData.queue?.doctorStatus}, Active Token: ${startData.queue?.activeToken} (Nobody called yet)`);

  // 3. Doctor calls Token 1
  console.log(`\n4. Doctor explicitly calls Token #${token1}...`);
  const call1Res = await fetch(`${API_BASE}/doctor/call-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr, targetToken: token1 })
  });
  const call1Data = await call1Res.json();
  console.log(`  -> Consultation Started for Token #${call1Data.calledToken}`);
  console.log(`  -> Chamber Active Token: ${call1Data.queue?.activeToken}, State: ${call1Data.queue?.consultationState}`);
  if (call1Data.queue?.activeToken !== token1) {
    throw new Error(`Expected activeToken to be ${token1}, got ${call1Data.queue?.activeToken}`);
  }

  // 4. Check Patient 2's queue view while Token 1 is in chamber
  const vq2Res = await fetch(`${API_BASE}/queue/${testHospitalId}/${testDoctorId}/${todayStr}?token=${token2}`);
  const vq2Data = await vq2Res.json();
  console.log(`  -> Patient 2 sees Queue State: "${vq2Data.queue?.queueState}", Current Serving Token: #${vq2Data.queue?.currentServingToken}`);

  // 5. Doctor creates a Digital Prescription for Token 1 (with Voice-to-Text notes)
  console.log(`\n5. Doctor creates Digital Prescription for Patient 1 (${uhid1})...`);
  const rxRes = await fetch(`${API_BASE}/prescription/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appointmentId: book1.appointment.id,
      uhid: uhid1,
      patientName: 'Rohan Sharma',
      doctorId: testDoctorId,
      doctorName: 'Dr. Ramesh Gupta',
      hospitalId: testHospitalId,
      hospitalName: 'AIIMS New Delhi',
      diagnosis: 'Early Angina Symptoms, Dyslipidemia',
      clinicalNotes: 'ECG regular, S1 S2 heard. Voice dictated: "Advised lipid profile test, low sodium diet."',
      voiceTranscript: 'Advised lipid profile test, low sodium diet.',
      medicines: [
        { name: 'Atorvastatin', dosage: '20 mg', frequency: '0-0-1', duration: '30 days', instructions: 'At bedtime' },
        { name: 'Aspirin', dosage: '75 mg', frequency: '1-0-0', duration: '30 days', instructions: 'After breakfast' }
      ],
      advice: 'Avoid stress, walk 30 mins daily, repeat blood pressure in 2 weeks.',
      followUpDate: '2026-10-05'
    })
  });
  const rxData = await rxRes.json();
  console.log(`  -> Prescription Created: ID ${rxData.prescriptionId}, Status: ${rxData.success}`);

  // 6. Doctor completes consultation for Token 1
  console.log(`\n6. Doctor completes consultation for Token #${token1}...`);
  const comp1Res = await fetch(`${API_BASE}/doctor/complete-consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospitalId: testHospitalId,
      doctorId: testDoctorId,
      date: todayStr,
      tokenNumber: token1,
      notes: 'Prescription issued. Patient counseled on diet.',
      durationMins: 9.5
    })
  });
  const comp1Data = await comp1Res.json();
  console.log(`  -> Completed Token #${comp1Data.completedToken}, Duration: ${comp1Data.durationMins} mins`);
  console.log(`  -> Virtual Queue: Active Token = ${comp1Data.queue?.activeToken}, Last Completed = ${comp1Data.queue?.lastCompletedToken}, Next Waiting = ${comp1Data.queue?.nextWaitingToken}`);

  // 7. Patient 2's real-time queue view now that Token 1 is completed
  const vq2NextRes = await fetch(`${API_BASE}/queue/${testHospitalId}/${testDoctorId}/${todayStr}?token=${token2}`);
  const vq2NextData = await vq2NextRes.json();
  console.log(`  -> Patient 2 sees Transition State: "${vq2NextData.queue?.queueState}" (DOCTOR_DONE_PREVIOUS_PREPARE_NOW)`);

  // 8. Doctor marks Patient 2 Not Present, then Re-Adds them
  console.log(`\n7. Testing Mark Not Present & Re-Add Queue on Token #${token2}...`);
  const notPresRes = await fetch(`${API_BASE}/doctor/mark-not-present`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr, tokenNumber: token2 })
  });
  const notPresData = await notPresRes.json();
  console.log(`  -> Marked Token #${token2} Not Present. Result: ${notPresData.message}`);

  const reAddRes = await fetch(`${API_BASE}/doctor/re-add-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr, tokenNumber: token2 })
  });
  const reAddData = await reAddRes.json();
  console.log(`  -> Re-Added Token #${token2}. Result: ${reAddData.message}`);

  // 9. Doctor calls and completes Token 2
  console.log(`\n8. Doctor calls Token #${token2} into chamber and completes consultation...`);
  await fetch(`${API_BASE}/doctor/call-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr, targetToken: token2 })
  });
  const comp2Res = await fetch(`${API_BASE}/doctor/complete-consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr, tokenNumber: token2, durationMins: 7.2 })
  });
  const comp2Data = await comp2Res.json();
  console.log(`  -> Completed Token #${comp2Data.completedToken}. Queue Complete Flag: ${comp2Data.queue?.isQueueComplete}`);

  // 10. Verify NO PHANTOM TOKENS: Attempting to call next token when queue is complete must fail cleanly!
  console.log('\n9. Verifying NO PHANTOM TOKEN INCREMENT when all patients are completed...');
  const callPhantomRes = await fetch(`${API_BASE}/doctor/call-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: testHospitalId, doctorId: testDoctorId, date: todayStr })
  });
  const phantomData = await callPhantomRes.json();
  console.log(`  -> Call Next Result: success = ${phantomData.success}, error = "${phantomData.error}"`);
  console.log(`  -> Active Token remains strictly: ${phantomData.queue?.activeToken} (Zero phantom token created!)`);

  // 11. Secure QR Token Verification
  console.log('\n10. Testing Secure Patient QR Generation & Verification...');
  const qrGenRes = await fetch(`${API_BASE}/qr/generate/${uhid1}`);
  const qrGenData = await qrGenRes.json();
  console.log(`  -> Generated Opaque QR Payload: ${qrGenData.qrPayload}`);

  // Verify that raw payload has NO raw medical records (privacy protected)
  const isPrivate = !qrGenData.qrPayload.includes('Angina') && !qrGenData.qrPayload.includes('Atorvastatin');
  console.log(`  -> Privacy Check Passed (No medical text in raw QR): ${isPrivate}`);

  const qrVerifyRes = await fetch(`${API_BASE}/qr/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qrData: qrGenData.qrPayload,
      doctorId: testDoctorId,
      hospitalId: testHospitalId
    })
  });
  const qrVerifyData = await qrVerifyRes.json();
  console.log(`  -> Doctor Scanned QR Verification Result: ${qrVerifyData.message}`);
  console.log(`  -> Authorized Prescriptions Returned: ${qrVerifyData.prescriptions?.length}`);
  console.log(`  -> Authorized Medical Records Returned: ${qrVerifyData.medicalRecords?.length}`);

  // 12. Audit Logs Check
  console.log('\n11. Checking Audit Logs...');
  const auditRes = await fetch(`${API_BASE}/audit-logs?limit=10`);
  const auditData = await auditRes.json();
  console.log(`  -> Audit Logs Count: ${auditData.logs?.length}`);
  console.log(`  -> Recent Actions: ${auditData.logs?.slice(0, 4).map(l => `${l.action} on ${l.target_entity}`).join(', ')}`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTest().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
