// Test to verify doctor session persistence and voluntary logout protection
const fs = require('fs');
const path = require('path');

function runTest() {
  console.log('===============================================================');
  console.log('  TESTING DOCTOR SESSION PERSISTENCE & LOGOUT BEHAVIOR');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details}`);
    }
  }

  // 1. Check DoctorOpdPortal.jsx session persistence code
  const doctorPortalPath = path.join(__dirname, '../frontend/src/components/doctor/DoctorOpdPortal.jsx');
  const doctorPortalCode = fs.readFileSync(doctorPortalPath, 'utf-8');

  assert(
    doctorPortalCode.includes("localStorage.getItem('smartcare_opd_doctor')"),
    'DoctorOpdPortal initializes authenticatedDoctor from localStorage (smartcare_opd_doctor)'
  );

  assert(
    doctorPortalCode.includes("localStorage.setItem(DOCTOR_SESSION_KEY, JSON.stringify(authenticatedDoctor))"),
    'DoctorOpdPortal automatically synchronizes authenticatedDoctor state to localStorage'
  );

  assert(
    doctorPortalCode.includes('handleLogout') && doctorPortalCode.includes("localStorage.removeItem(DOCTOR_SESSION_KEY)"),
    'DoctorOpdPortal contains dedicated handleLogout function that explicitly clears localStorage session on voluntary click'
  );

  assert(
    doctorPortalCode.includes("onClick={handleLogout}"),
    'Doctor portal header logout button is wired to handleLogout'
  );

  assert(
    doctorPortalCode.includes("handleEnterChamberDirectly"),
    'Doctor registration success view provides direct 1-click chamber entry'
  );

  // 2. Check App.jsx module preservation
  const appPath = path.join(__dirname, '../frontend/src/App.jsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  assert(
    appCode.includes("display: activeModule === 'doctor_opd' ? 'block' : 'none'"),
    'App.jsx preserves DoctorOpdPortal mounted across tab switches (avoids unmounting when visiting patient_opd)'
  );

  assert(
    appCode.includes("display: activeModule === 'patient_opd' ? 'block' : 'none'"),
    'App.jsx preserves PatientModule mounted across tab switches'
  );

  console.log('\n===============================================================');
  console.log(`  SESSION PERSISTENCE VERIFICATION: ${passed}/${total} TESTS PASSED`);
  console.log('===============================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTest();
