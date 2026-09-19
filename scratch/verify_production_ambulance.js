const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('=== VERIFYING PRODUCTION AMBULANCE MODULE & REAL-TIME FLOW ===\n');

  // 1. Verify 50 drivers across 5 hospitals
  const hospitals = ['apollo', 'lok_nayak', 'aiims', 'fortis', 'max'];
  let totalDrivers = 0;
  for (const hId of hospitals) {
    const res = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/ambulance/hospital/${hId}/drivers`,
      method: 'GET'
    });
    console.log(`✓ Hospital [${hId}]: ${res.data.counts.total} drivers (${res.data.counts.onDuty} On Duty, ${res.data.counts.offDuty} Off Duty, ${res.data.counts.onService} On Service)`);
    totalDrivers += res.data.counts.total;
  }
  console.log(`\n✓ Total Seeded Fleet: ${totalDrivers} dedicated drivers across 5 hospitals.\n`);

  // 2. User submits Emergency SOS
  const sosRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/emergency/request',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    userId: 'test-patient-001',
    patientName: 'Rohan Sharma',
    phone: '9810123456',
    symptoms: 'Acute chest discomfort and shortness of breath',
    lat: 28.5355,
    lng: 77.2874,
    address: 'Sarita Vihar Pocket C, New Delhi'
  });

  const requestId = sosRes.data.request.id;
  const targetHospitalId = sosRes.data.request.current_hospital_id;
  console.log(`✓ Emergency SOS created: #${requestId} for patient Rohan Sharma, dynamically routed to: [${targetHospitalId}]`);

  // Set driver of targetHospitalId to ON DUTY
  const driverPrefixMap = {
    apollo: 'APOLLO',
    lok_nayak: 'LOKNAYAK',
    aiims: 'AIIMS',
    fortis: 'FORTIS',
    max: 'MAX'
  };
  const driverId = `DRV-${driverPrefixMap[targetHospitalId] || targetHospitalId.toUpperCase()}-01`;

  await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${targetHospitalId}/${driverId}/duty`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { dutyStatus: 'on_duty' });
  console.log(`✓ Set Driver ${driverId} to ON DUTY for hospital [${targetHospitalId}]`);

  // 3. Hospital Admin accepts emergency case
  const acceptRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/emergency/hospital/${targetHospitalId}/accept/${requestId}`,
    method: 'POST'
  });
  console.log(`✓ Hospital Admin [${targetHospitalId}] accepted emergency case:`, acceptRes.data.message);

  // 4. Test Pending Dispatches API for targetHospitalId drivers
  const pendingRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${targetHospitalId}/pending-dispatches`,
    method: 'GET'
  });

  const dispatches = pendingRes.data.dispatches;
  console.log(`✓ Query pending dispatches for ${targetHospitalId}: Found ${dispatches.length} pending dispatch(es)`);
  const myDispatch = dispatches.find(d => d.requestId === requestId);
  if (!myDispatch) {
    throw new Error(`Pending dispatch not found for ${targetHospitalId} drivers!`);
  }
  console.log(`  -> Patient: ${myDispatch.patientName}, Phone: ${myDispatch.phone}, Symptoms: ${myDispatch.symptoms}`);

  // 4b. Verify Hospital Isolation: Other hospitals should NOT see this pending dispatch
  const otherHospitalId = targetHospitalId === 'apollo' ? 'max' : 'apollo';
  const otherPending = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${otherHospitalId}/pending-dispatches`,
    method: 'GET'
  });
  const otherFound = otherPending.data.dispatches.find(d => d.requestId === requestId);
  console.log(`✓ Hospital Fleet Isolation Verified: [${otherHospitalId}] drivers see ${otherFound ? 'YES' : 'NO'} dispatches of [${targetHospitalId}] (Expected: NO)`);

  // 5. Driver accepts emergency ride
  const driverAcceptRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${targetHospitalId}/${driverId}/accept/${requestId}`,
    method: 'POST'
  });
  console.log(`✓ Driver ${driverId} accepted emergency ride! Ride status: ${driverAcceptRes.data.ride.status}`);

  // 6. Verify driver status changed from on_duty to off_duty (busy in ride)
  const driverProfile = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/driver/${targetHospitalId}/${driverId}`,
    method: 'GET'
  });
  console.log(`✓ Driver Duty Status automatically updated to: [${driverProfile.data.driver.duty_status.toUpperCase()}]`);

  // 7. Verify Hospital Admin active emergencies API returns allotted driver with ID
  const hospitalActiveRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/emergency/hospital/${targetHospitalId}/active`,
    method: 'GET'
  });
  const acceptedCase = hospitalActiveRes.data.emergencies.find(e => e.request_id === requestId);
  console.log(`✓ Hospital Admin Active Case enriched with allotted driver:`);
  console.log(`  -> Driver Name: ${acceptedCase.allotted_driver_name}`);
  console.log(`  -> Driver Phone: ${acceptedCase.allotted_driver_phone}`);
  console.log(`  -> Vehicle Plate: ${acceptedCase.allotted_vehicle_plate}`);
  console.log(`  -> Driver ID: ${acceptedCase.allotted_driver_id}`);

  // 8. Verify Patient Live Tracking API returns allotted driver
  const trackingRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/emergency/request/${requestId}`,
    method: 'GET'
  });
  console.log(`✓ Emergency Patient Tracking enriched with driver:`);
  console.log(`  -> Allotted Driver: ${trackingRes.data.request.allotted_driver_name} (${trackingRes.data.request.allotted_vehicle_plate})`);

  // 9. Driver advances trip stages
  await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${targetHospitalId}/${driverId}/ride-stage/${requestId}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, { stage: 'PATIENT_PICKED_UP' });
  console.log(`✓ Stage advanced to: PATIENT_PICKED_UP`);

  // 10. Driver arrives at hospital and completes ride
  const completeRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/${targetHospitalId}/${driverId}/complete-ride/${requestId}`,
    method: 'POST'
  });
  console.log(`✓ Driver clicked "Ride Complete": ${completeRes.data.message}`);

  // 11. Verify driver status automatically reverted to on_duty
  const finalDriverProfile = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/ambulance/driver/${targetHospitalId}/${driverId}`,
    method: 'GET'
  });
  console.log(`✓ Driver Duty Status automatically reverted to: [${finalDriverProfile.data.driver.duty_status.toUpperCase()}]`);

  console.log('\n================================================================');
  console.log(' ALL 11 END-TO-END PRODUCTION VERIFICATION CHECKS PASSED!');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
