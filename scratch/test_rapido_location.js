// Test script to verify Rapido-style geocoding, autocomplete search, and dynamic hospital ranking
async function runTests() {
  console.log('--- TEST 1: REVERSE GEOCODE (Sarita Vihar / Apollo) ---');
  const revRes = await fetch('http://localhost:5000/api/emergency/geocode/reverse?lat=28.5355&lng=77.2874');
  const revData = await revRes.json();
  console.log('Reverse geocode result:', JSON.stringify(revData, null, 2));

  console.log('\n--- TEST 2: AUTOCOMPLETE SEARCH ("Saket") ---');
  const searchRes = await fetch('http://localhost:5000/api/emergency/geocode/search?query=Saket');
  const searchData = await searchRes.json();
  console.log('Search results count:', searchData.results?.length);
  if (searchData.results?.length > 0) {
    console.log('Top search match:', searchData.results[0]);
  }

  console.log('\n--- TEST 3: NEARBY HOSPITALS FROM SARITA VIHAR ---');
  const hospSaritaRes = await fetch('http://localhost:5000/api/emergency/nearby-hospitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 28.5355, lng: 77.2874 })
  });
  const hospSarita = await hospSaritaRes.json();
  console.log('Ranked Hospitals from Sarita Vihar:');
  hospSarita.rankedHospitals?.forEach((h, i) => {
    console.log(`${i+1}. ${h.name}: ${h.distanceKm} km (Beds: ${h.beds?.availableBeds}, Doctors: ${h.doctors?.availableDoctors}, Ambulances: ${h.ambulancesAvailable})`);
  });

  if (searchData.results?.length > 0) {
    const saket = searchData.results[0];
    console.log(`\n--- TEST 4: NEARBY HOSPITALS FROM SEARCHED LOCATION (${saket.name.split(',')[0]} - Lat: ${saket.lat}, Lng: ${saket.lng}) ---`);
    const hospSaketRes = await fetch('http://localhost:5000/api/emergency/nearby-hospitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: saket.lat, lng: saket.lng })
    });
    const hospSaket = await hospSaketRes.json();
    console.log(`Ranked Hospitals from ${saket.name.split(',')[0]}:`);
    hospSaket.rankedHospitals?.forEach((h, i) => {
      console.log(`${i+1}. ${h.name}: ${h.distanceKm} km (Beds: ${h.beds?.availableBeds}, Doctors: ${h.doctors?.availableDoctors}, Ambulances: ${h.ambulancesAvailable})`);
    });
  }
}

runTests().catch(console.error);
