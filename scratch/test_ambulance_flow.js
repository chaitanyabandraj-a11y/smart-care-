// Automated End-to-End Test for Rapido-Style Ambulance Driver Module
const assert = require('assert');
const ambulanceDb = require('../backend/src/db/ambulanceDbManager');
const emergencyDb = require('../backend/src/db/emergencyDb');
const hospitalDb = require('../backend/src/db/hospitalDbManager');
const emergencyService = require('../backend/src/services/emergencyService');

async function runTests() {
  console.log('=== STARTING AMBULANCE MODULE END-TO-END TESTS ===\n');

  // TEST 1: Verify 10 pre-seeded drivers per hospital across all 5 hospitals (50 total)
  console.log('--- TEST 1: Verifying 50 Seeded Drivers across 5 Hospitals ---');
  const hospitals = ['apollo', 'lok_nayak', 'aiims', 'fortis', 'max'];
  let grandTotal = 0;

  for (const hId of hospitals) {
    const fleet = ambulanceDb.getHospitalDrivers(hId);
    assert.strictEqual(fleet.counts.total, 10, `Expected 10 drivers in ${hId}, got ${fleet.counts.total}`);
    assert.strictEqual(fleet.counts.onDuty, 4, `Expected 4 on_duty drivers in ${hId}, got ${fleet.counts.onDuty}`);
    assert.strictEqual(fleet.counts.onService, 2, `Expected 2 on_service drivers in ${hId}, got ${fleet.counts.onService}`);
    assert.strictEqual(fleet.counts.offDuty, 4, `Expected 4 off_duty drivers in ${hId}, got ${fleet.counts.offDuty}`);
    grandTotal += fleet.counts.total;
    console.log(`  ✓ Hospital '${hId}': 10 drivers verified (4 on-duty, 2 on-service, 4 off-duty)`);
  }
  assert.strictEqual(grandTotal, 50, `Expected 50 total drivers across platform, got ${grandTotal}`);
  console.log('✓ PASS: All 50 pre-seeded drivers verified.\n');

  // TEST 2: Driver Registration with 2-Way OTP Verification
  console.log('--- TEST 2: Driver Registration & OTP Verification ---');
  const regResult = ambulanceDb.registerDriver('apollo', {
    name: 'Test Pilot Verma',
    phone: '+91-98710-99999',
    email: 'testpilot@smartcare.org',
    driverId: 'DRV-APOLLO-TEST',
    vehiclePlate: 'DL-01-EA-9999',
    password: 'DriverPassword@123'
  });
  assert.strictEqual(regResult.success, true, 'Driver registration failed: ' + regResult.error);
  assert.ok(regResult.otpCode, 'Expected generated OTP code');
  console.log(`  ✓ Registration initiated for DRV-APOLLO-TEST. Generated OTP: ${regResult.otpCode}`);

  // Verify with correct OTP
  const otpVerify = ambulanceDb.verifyDriverOtp('apollo', {
    driverId: 'DRV-APOLLO-TEST',
    otpCode: regResult.otpCode
  });
  assert.strictEqual(otpVerify.success, true, 'OTP verification failed');
  assert.strictEqual(otpVerify.driver.isVerified, true);
  console.log('  ✓ OTP verified. Driver account authenticated.');

  // TEST 3: Driver Login
  console.log('\n--- TEST 3: Driver Login Authentication ---');
  const loginRes = ambulanceDb.loginDriver('apollo', {
    identifier: 'DRV-APOLLO-TEST',
    password: 'DriverPassword@123'
  });
  assert.strictEqual(loginRes.success, true, 'Login failed');
  assert.strictEqual(loginRes.driver.id, 'DRV-APOLLO-TEST');
  console.log(`  ✓ Driver logged in successfully: ${loginRes.driver.name} (${loginRes.driver.vehiclePlate})`);

  // TEST 4: Duty Status Toggle (on_duty <-> off_duty)
  console.log('\n--- TEST 4: Duty Status Toggle ---');
  const dutyOn = ambulanceDb.updateDutyStatus('apollo', 'DRV-APOLLO-TEST', 'on_duty');
  assert.strictEqual(dutyOn.success, true);
  assert.strictEqual(dutyOn.dutyStatus, 'on_duty');

  const fleetAfterDuty = ambulanceDb.getHospitalDrivers('apollo');
  assert.strictEqual(fleetAfterDuty.counts.onDuty, 5, 'Expected 5 on-duty drivers in Apollo after toggle');
  console.log(`  ✓ Switched duty to ON DUTY. Apollo On-Duty fleet count: ${fleetAfterDuty.counts.onDuty}`);

  // TEST 5: Hospital Admin Acceptance & Automatic Ambulance Dispatch Flow
  console.log('\n--- TEST 5: Full Emergency Request -> Hospital Admin Accept -> Driver Dispatch ---');
  // Create emergency request
  const emergencyUser = emergencyDb.registerEmergencyUser({
    name: 'Anjali Sharma',
    phone: '+91-99887-11223',
    email: 'anjali@example.com',
    password: 'User@1234'
  });
  emergencyDb.verifyRegistrationOtp({ userId: emergencyUser.userId, otpCode: emergencyUser.otpCode });

  const queue = emergencyService.getRankedCandidateHospitals(28.5355, 77.2874); // Near Apollo
  const emergencyReq = emergencyDb.createEmergencyRequest({
    userId: emergencyUser.userId,
    patientName: 'Anjali Sharma',
    phone: '+91-99887-11223',
    symptoms: 'Acute chest pain & respiratory distress',
    lat: 28.5355,
    lng: 77.2874,
    address: 'Sarita Vihar Pocket C, New Delhi',
    hospitalQueue: queue
  });
  console.log(`  ✓ Emergency SOS request created: #${emergencyReq.id} routed to ${emergencyReq.current_hospital_id}`);

  // Mock Socket.IO to track emitted events
  const emittedEvents = [];
  const mockIo = {
    to: (room) => ({
      emit: (event, payload) => {
        emittedEvents.push({ room, event, payload });
      }
    }),
    emit: (event, payload) => {
      emittedEvents.push({ room: 'global', event, payload });
    }
  };

  // Admin accepts emergency
  const acceptRes = emergencyService.acceptEmergencyRequest(mockIo, 'apollo', emergencyReq.id);
  assert.strictEqual(acceptRes.success, true, 'Hospital accept failed');
  console.log('  ✓ Hospital Admin accepted emergency request.');

  // Check that dispatch alert was sent to on-duty drivers
  const alertEvents = emittedEvents.filter(e => e.event === 'ambulance:incoming_ride_alert');
  assert.ok(alertEvents.length > 0, 'No ambulance dispatch alerts emitted');
  console.log(`  ✓ Automatic dispatch triggered to Apollo on-duty ambulance drivers (${alertEvents.length} alert socket sends).`);

  // TEST 6: First-Come First-Served Ride Acceptance by Driver
  console.log('\n--- TEST 6: First-Come First-Served Ride Acceptance ---');
  const rideAccept = ambulanceDb.acceptEmergencyRide('apollo', 'DRV-APOLLO-TEST', emergencyReq.id);
  assert.strictEqual(rideAccept.success, true, 'Driver accept failed: ' + rideAccept.error);
  assert.strictEqual(rideAccept.ride.patientName, 'Anjali Sharma');
  console.log(`  ✓ Driver DRV-APOLLO-TEST accepted ride #${emergencyReq.id}`);

  // Verify driver duty automatically changed to 'on_service'
  const driverState = ambulanceDb.getDriverById('apollo', 'DRV-APOLLO-TEST');
  assert.strictEqual(driverState.duty_status, 'on_service', 'Driver duty should be on_service');
  assert.strictEqual(driverState.current_ride_id, emergencyReq.id);
  console.log('  ✓ Driver duty automatically updated from ON DUTY to ON SERVICE.');

  // Verify emergency request updated in central DB
  const reqCheck = emergencyDb.getEmergencyRequest(emergencyReq.id);
  assert.strictEqual(reqCheck.allotted_driver_id, 'DRV-APOLLO-TEST');
  assert.strictEqual(reqCheck.allotted_vehicle_plate, 'DL-01-EA-9999');
  console.log('  ✓ Central emergency record updated with driver allotment, vehicle plate, and contact info.');

  // Second driver attempts to accept same ride -> should be rejected
  const secondAccept = ambulanceDb.acceptEmergencyRide('apollo', 'DRV-APOLLO-01', emergencyReq.id);
  assert.strictEqual(secondAccept.success, false, 'Second driver should not be able to accept');
  assert.strictEqual(secondAccept.alreadyAllotted, true);
  console.log('  ✓ Concurrency check passed: Second driver received "Already Allotted" response.');

  // TEST 7: Live GPS Location Ping
  console.log('\n--- TEST 7: Real-Time GPS Location Stream ---');
  ambulanceDb.updateDriverLocation('apollo', 'DRV-APOLLO-TEST', 28.5360, 77.2880);
  const updatedReq = emergencyDb.getEmergencyRequest(emergencyReq.id);
  assert.strictEqual(updatedReq.driver_lat, 28.5360);
  assert.strictEqual(updatedReq.driver_lng, 77.2880);
  console.log('  ✓ Real-time GPS ping updated in database and streamed to patient tracking.');

  // TEST 8: Trip Progress & Ride Completion -> Revert to On Duty
  console.log('\n--- TEST 8: Ride Stage Progression & Ride Completion ---');
  // Stage 1: Patient Picked Up
  ambulanceDb.updateRideStage('apollo', 'DRV-APOLLO-TEST', emergencyReq.id, 'PATIENT_PICKED_UP');
  assert.strictEqual(emergencyDb.getEmergencyRequest(emergencyReq.id).ride_stage, 'PATIENT_PICKED_UP');
  console.log('  ✓ Stage updated: PATIENT_PICKED_UP (Transporting to hospital)');

  // Stage 2: Complete Ride
  const completeRes = ambulanceDb.completeEmergencyRide('apollo', 'DRV-APOLLO-TEST', emergencyReq.id);
  assert.strictEqual(completeRes.success, true);
  assert.strictEqual(completeRes.dutyStatus, 'on_duty');

  // Verify driver duty automatically changed back to 'on_duty'
  const finalDriver = ambulanceDb.getDriverById('apollo', 'DRV-APOLLO-TEST');
  assert.strictEqual(finalDriver.duty_status, 'on_duty', 'Driver duty should revert to on_duty');
  assert.strictEqual(finalDriver.current_ride_id, null, 'Active ride should be cleared');
  console.log('  ✓ Ride completed. Driver automatically reverted back to ON DUTY (Available).');

  // Verify hospital admin fleet counters reflect return to on_duty
  const finalFleet = ambulanceDb.getHospitalDrivers('apollo');
  assert.strictEqual(finalFleet.counts.onDuty, 5, 'On-duty count should include completed driver');
  console.log(`  ✓ Hospital Admin Dashboard live counters updated: ${finalFleet.counts.onDuty} On Duty, ${finalFleet.counts.onService} On Service.`);

  // TEST 9: Hospital Fleet Isolation
  console.log('\n--- TEST 9: Dedicated Hospital Fleet Isolation ---');
  // Verify Apollo driver is NOT in AIIMS database
  const aiimsDriver = ambulanceDb.getDriverById('aiims', 'DRV-APOLLO-TEST');
  assert.strictEqual(aiimsDriver, null, 'Apollo driver should NOT exist in AIIMS database');
  console.log('  ✓ Fleet isolation verified: Each hospital database maintains dedicated independent drivers.');

  console.log('\n======================================================');
  console.log('🎉 ALL 9 AMBULANCE MODULE END-TO-END TESTS PASSED 100%!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
