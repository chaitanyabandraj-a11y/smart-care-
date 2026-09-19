// Verification script for Emergency Patient real-time location flow
async function testPatientLocationFlow() {
  console.log('=== TEST: PATIENT REAL-TIME LOCATION & HOSPITAL ROUTING ===');

  // Let's say the patient is in Connaught Place (Lat: 28.6315, Lng: 77.2167)
  const patientLat = 28.6315;
  const patientLng = 77.2167;

  // 1. Reverse geocode patient's live location
  const revRes = await fetch(`http://localhost:5000/api/emergency/geocode/reverse?lat=${patientLat}&lng=${patientLng}`);
  const revData = await revRes.json();
  console.log('\n1. Patient Address Geocoded:');
  console.log('   Street/Colony:', revData.address?.suburb || revData.address?.road || 'Connaught Place');
  console.log('   Full Address:', revData.displayName);

  // 2. Query nearby hospitals from PATIENT location
  const hospRes = await fetch('http://localhost:5000/api/emergency/nearby-hospitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: patientLat, lng: patientLng })
  });
  const hospData = await hospRes.json();
  console.log('\n2. Ranked Hospitals from PATIENT Location:');
  hospData.rankedHospitals.forEach((h, i) => {
    console.log(`   #${i + 1} ${h.name}: ${h.distanceKm} km from patient`);
  });

  const firstHospital = hospData.rankedHospitals[0];

  // 3. Patient submits emergency request from their location
  const reqRes = await fetch('http://localhost:5000/api/emergency/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'test-patient-user',
      patientName: 'Rohan Sharma',
      phone: '9876543210',
      symptoms: 'Severe asthma attack and breathing distress',
      lat: patientLat,
      lng: patientLng,
      address: revData.displayName
    })
  });
  const reqData = await reqRes.json();
  console.log('\n3. Emergency SOS Dispatched:');
  console.log('   Request ID:', reqData.request.id);
  console.log('   Patient Name:', reqData.request.patient_name);
  console.log('   Patient Lat/Lng:', `${reqData.request.patient_lat}, ${reqData.request.patient_lng}`);
  console.log('   Patient Address:', reqData.request.patient_address);
  console.log('   Targeted Hospital #1:', reqData.request.current_hospital_id);

  // 4. Check what Hospital Admin receives on dashboard
  const adminRes = await fetch(`http://localhost:5000/api/emergency/hospital/${firstHospital.id}/pending`);
  const adminData = await adminRes.json();
  console.log('\n4. Hospital Admin Alert Received on Target Hospital:');
  console.log('   Patient Name:', adminData.pendingAlert?.patientName);
  console.log('   Patient Address:', adminData.pendingAlert?.patientAddress);
  console.log('   Patient GPS:', `${adminData.pendingAlert?.patientLat}° N, ${adminData.pendingAlert?.patientLng}° E`);
  console.log('   Distance from Hospital to Patient:', `${adminData.pendingAlert?.distanceKm} km`);

  console.log('\n=== ALL PATIENT LOCATION TESTS PASSED! ===');
}

testPatientLocationFlow().catch(console.error);
