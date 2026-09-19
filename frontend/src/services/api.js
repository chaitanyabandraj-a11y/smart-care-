// Frontend API client for Hospital Module and Emergency Module
const API_BASE = '/api';

// --- HOSPITAL MODULE API ---
export async function fetchHospitals() {
  const res = await fetch(`${API_BASE}/hospitals`);
  if (!res.ok) throw new Error('Failed to load hospitals list');
  return res.json();
}

export async function fetchHospitalDashboard(hospitalId) {
  const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/dashboard`);
  if (!res.ok) throw new Error('Failed to load hospital dashboard');
  return res.json();
}

export async function registerAdmin(hospitalId, { adminName, adminId, password }) {
  const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminName, adminId, password })
  });
  return res.json();
}

export async function loginAdmin(hospitalId, { adminId, password }) {
  const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId, password })
  });
  return res.json();
}

export async function updateBeds(hospitalId, adminName, bedData) {
  const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/beds`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminName, ...bedData })
  });
  return res.json();
}

export async function updateDoctors(hospitalId, adminName, doctorData) {
  const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/doctors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminName, ...doctorData })
  });
  return res.json();
}

// --- EMERGENCY MODULE API ---
export async function registerEmergencyUser({ name, phone, email, password }) {
  const res = await fetch(`${API_BASE}/emergency/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, email, password })
  });
  return res.json();
}

export async function verifyRegistrationOtp({ userId, otpCode }) {
  const res = await fetch(`${API_BASE}/emergency/auth/verify-registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, otpCode })
  });
  return res.json();
}

export async function requestLoginOtp({ identifier, password }) {
  const res = await fetch(`${API_BASE}/emergency/auth/login-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  return res.json();
}

export async function verifyLoginOtp({ userId, otpCode }) {
  const res = await fetch(`${API_BASE}/emergency/auth/login-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, otpCode })
  });
  return res.json();
}

export async function fetchNearbyHospitals({ lat, lng }) {
  const res = await fetch(`${API_BASE}/emergency/nearby-hospitals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  return res.json();
}

export async function submitEmergencyRequest({ userId, patientName, phone, symptoms, lat, lng, address }) {
  const res = await fetch(`${API_BASE}/emergency/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, patientName, phone, symptoms, lat, lng, address })
  });
  return res.json();
}

export async function fetchEmergencyRequest(requestId) {
  const res = await fetch(`${API_BASE}/emergency/request/${requestId}`);
  if (!res.ok) throw new Error('Failed to load emergency request');
  return res.json();
}

export async function fetchHospitalPendingEmergency(hospitalId) {
  const res = await fetch(`${API_BASE}/emergency/hospital/${hospitalId}/pending`);
  if (!res.ok) return { success: false, pendingAlert: null };
  return res.json();
}

export async function fetchHospitalActiveEmergencies(hospitalId) {
  const res = await fetch(`${API_BASE}/emergency/hospital/${hospitalId}/active`);
  if (!res.ok) throw new Error('Failed to load active emergencies');
  return res.json();
}

export async function acceptHospitalEmergency(hospitalId, requestId) {
  const res = await fetch(`${API_BASE}/emergency/hospital/${hospitalId}/accept/${requestId}`, {
    method: 'POST'
  });
  return res.json();
}

export async function rejectHospitalEmergency(hospitalId, requestId) {
  const res = await fetch(`${API_BASE}/emergency/hospital/${hospitalId}/reject/${requestId}`, {
    method: 'POST'
  });
  return res.json();
}

export async function fetchReverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${API_BASE}/emergency/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (!res.ok) return { success: false, displayName: `${Number(lat).toFixed(4)}° N, ${Number(lng).toFixed(4)}° E` };
    return res.json();
  } catch (err) {
    return { success: false, displayName: `${Number(lat).toFixed(4)}° N, ${Number(lng).toFixed(4)}° E` };
  }
}

export async function searchAddress(query) {
  try {
    const res = await fetch(`${API_BASE}/emergency/geocode/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) return { success: false, results: [] };
    return res.json();
  } catch (err) {
    return { success: false, results: [] };
  }
}

export async function fetchPatientIpLocation() {
  try {
    const res = await fetch(`${API_BASE}/emergency/geocode/ip-location`);
    if (!res.ok) return { success: false, lat: 28.6139, lng: 77.2090 };
    return res.json();
  } catch (err) {
    return { success: false, lat: 28.6139, lng: 77.2090 };
  }
}

// --- AMBULANCE DRIVER MODULE API ---
export async function fetchAmbulanceHospitals() {
  const res = await fetch(`${API_BASE}/ambulance/hospitals`);
  if (!res.ok) throw new Error('Failed to fetch hospitals list for ambulance driver');
  return res.json();
}

export async function fetchHospitalAmbulanceFleet(hospitalId) {
  const res = await fetch(`${API_BASE}/ambulance/hospital/${hospitalId}/drivers`);
  if (!res.ok) throw new Error('Failed to load ambulance fleet');
  return res.json();
}

export async function registerAmbulanceDriver({ hospitalId, name, phone, email, driverId, vehiclePlate, password }) {
  const res = await fetch(`${API_BASE}/ambulance/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, name, phone, email, driverId, vehiclePlate, password })
  });
  return res.json();
}

export async function verifyAmbulanceDriverOtp({ hospitalId, driverId, otpCode }) {
  const res = await fetch(`${API_BASE}/ambulance/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, driverId, otpCode })
  });
  return res.json();
}

export async function loginAmbulanceDriver({ hospitalId, identifier, password }) {
  const res = await fetch(`${API_BASE}/ambulance/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, identifier, password })
  });
  return res.json();
}

export async function fetchAmbulanceDriverProfile(hospitalId, driverId) {
  const res = await fetch(`${API_BASE}/ambulance/driver/${hospitalId}/${driverId}`);
  if (!res.ok) throw new Error('Failed to load driver profile');
  return res.json();
}

export async function updateAmbulanceDuty(hospitalId, driverId, dutyStatus) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/duty`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dutyStatus })
  });
  return res.json();
}

export async function updateAmbulanceLocation(hospitalId, driverId, lat, lng, requestId = null) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/location`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, requestId })
  });
  return res.json();
}

export async function acceptAmbulanceRide(hospitalId, driverId, requestId) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/accept/${requestId}`, {
    method: 'POST'
  });
  return res.json();
}

export async function updateAmbulanceRideStage(hospitalId, driverId, requestId, stage) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/ride-stage/${requestId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage })
  });
  return res.json();
}

export async function completeAmbulanceRide(hospitalId, driverId, requestId) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/complete-ride/${requestId}`, {
    method: 'POST'
  });
  return res.json();
}

export async function declineAmbulanceRide(hospitalId, driverId, requestId) {
  const res = await fetch(`${API_BASE}/ambulance/${hospitalId}/${driverId}/decline/${requestId}`, {
    method: 'POST'
  });
  return res.json();
}

export async function fetchAmbulancePendingDispatches(hospitalId, driverId = null) {
  const url = driverId
    ? `${API_BASE}/ambulance/${hospitalId}/pending-dispatches?driverId=${encodeURIComponent(driverId)}`
    : `${API_BASE}/ambulance/${hospitalId}/pending-dispatches`;
  const res = await fetch(url);
  if (!res.ok) return { success: false, dispatches: [] };
  return res.json();
}

// --- OPD PATIENT MODULE & VIRTUAL QUEUE API ---
export async function fetchOpdHospitals() {
  const res = await fetch(`${API_BASE}/opd/hospitals`);
  if (!res.ok) throw new Error('Failed to load OPD participating hospitals');
  return res.json();
}

export async function logOpdInteraction({ sessionId, stepName, actionData = {}, mobile = null, uhid = null }) {
  try {
    const res = await fetch(`${API_BASE}/opd/interaction-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, stepName, actionData, mobile, uhid })
    });
    return await res.json();
  } catch (err) {
    console.warn('[OPD Logging] Silent fail:', err.message);
    return { success: false, error: err.message };
  }
}

export async function requestPatientLoginOtp({ sessionId, identifier }) {
  const res = await fetch(`${API_BASE}/opd/auth/patient-login-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, identifier })
  });
  return res.json();
}

export async function sendOpdOtp({ sessionId, mobile }) {
  const res = await fetch(`${API_BASE}/opd/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, mobile })
  });
  return res.json();
}

export async function verifyOpdOtp({ sessionId, otpCode }) {
  const res = await fetch(`${API_BASE}/opd/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, otpCode })
  });
  return res.json();
}

export async function registerOpdPatient({ sessionId, patientData }) {
  const res = await fetch(`${API_BASE}/opd/auth/register-patient`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, patientData })
  });
  return res.json();
}

export async function fetchOpdPatient(identifier) {
  const res = await fetch(`${API_BASE}/opd/patient/${encodeURIComponent(identifier)}`);
  return res.json();
}

export async function fetchOpdDepartments(hospitalId) {
  const res = await fetch(`${API_BASE}/opd/departments/${encodeURIComponent(hospitalId)}`);
  return res.json();
}

export async function fetchOpdDoctors(hospitalId, department = null) {
  const url = department
    ? `${API_BASE}/opd/doctors/${encodeURIComponent(hospitalId)}?department=${encodeURIComponent(department)}`
    : `${API_BASE}/opd/doctors/${encodeURIComponent(hospitalId)}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchOpdDoctorAvailability(doctorId, patientId = null) {
  const url = patientId
    ? `${API_BASE}/opd/doctor/${encodeURIComponent(doctorId)}/availability?patientId=${encodeURIComponent(patientId)}`
    : `${API_BASE}/opd/doctor/${encodeURIComponent(doctorId)}/availability`;
  const res = await fetch(url);
  return res.json();
}

export async function bookOpdAppointment(bookingData) {
  const res = await fetch(`${API_BASE}/opd/appointment/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingData)
  });
  return res.json();
}

export async function fetchOpdAppointmentSlip(appointmentId) {
  const res = await fetch(`${API_BASE}/opd/appointment/${encodeURIComponent(appointmentId)}`);
  return res.json();
}

export async function fetchOpdPatientAppointments(identifier) {
  const res = await fetch(`${API_BASE}/opd/patient/${encodeURIComponent(identifier)}/appointments`);
  return res.json();
}

export async function fetchOpdVirtualQueue(hospitalId, doctorId, date, token = null) {
  const url = token
    ? `${API_BASE}/opd/queue/${encodeURIComponent(hospitalId)}/${encodeURIComponent(doctorId)}/${encodeURIComponent(date)}?token=${encodeURIComponent(token)}`
    : `${API_BASE}/opd/queue/${encodeURIComponent(hospitalId)}/${encodeURIComponent(doctorId)}/${encodeURIComponent(date)}`;
  const res = await fetch(url);
  return res.json();
}

export async function advanceOpdVirtualQueue({ hospitalId, doctorId, queueDate, nextToken = null }) {
  const res = await fetch(`${API_BASE}/opd/queue/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, queueDate, nextToken })
  });
  return res.json();
}

// --- DOCTOR OPD PORTAL API ---
export async function registerDoctorOpd(doctorData) {
  const res = await fetch(`${API_BASE}/opd/doctor/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doctorData)
  });
  return res.json();
}

export async function doctorOpdLogin({ hospitalId, doctorId, password = null }) {
  const res = await fetch(`${API_BASE}/opd/doctor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, password })
  });
  return res.json();
}

export async function updateDoctorOpdSchedule(doctorId, scheduleData) {
  const res = await fetch(`${API_BASE}/opd/doctor/${encodeURIComponent(doctorId)}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scheduleData)
  });
  return res.json();
}

export async function fetchDoctorUpcomingSchedule(doctorId) {
  const res = await fetch(`${API_BASE}/opd/doctor/${encodeURIComponent(doctorId)}/upcoming-schedule`);
  return res.json();
}

export async function startDoctorOpdSession({ hospitalId, doctorId, date }) {
  const res = await fetch(`${API_BASE}/opd/doctor/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date })
  });
  return res.json();
}

export async function endDoctorOpdSession({ hospitalId, doctorId, date }) {
  const res = await fetch(`${API_BASE}/opd/doctor/session/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date })
  });
  return res.json();
}

export async function callNextDoctorOpdToken({ hospitalId, doctorId, date, targetToken = null }) {
  const res = await fetch(`${API_BASE}/opd/doctor/call-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date, targetToken })
  });
  return res.json();
}

export async function fetchDoctorTodayRoster(hospitalId, doctorId, date) {
  const res = await fetch(`${API_BASE}/opd/doctor/${encodeURIComponent(hospitalId)}/${encodeURIComponent(doctorId)}/today-roster?date=${encodeURIComponent(date)}`);
  return res.json();
}

export async function verifyDoctorId({ hospitalId, doctorId }) {
  const res = await fetch(`${API_BASE}/opd/doctor/verify-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId })
  });
  return res.json();
}

export async function fetchAuthorizedDoctorsRegistry(hospitalId) {
  const res = await fetch(`${API_BASE}/opd/doctor/authorized-registry/${encodeURIComponent(hospitalId)}`);
  return res.json();
}

export async function cancelOpdAppointment({ appointmentId, cancellationReason = 'Cancelled by Patient', uhid = null }) {
  const res = await fetch(`${API_BASE}/opd/appointment/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancellationReason, uhid })
  });
  return res.json();
}

// Two-Step Consultation Lifecycle
export async function doctorCallToken({ hospitalId, doctorId, date, targetToken = null }) {
  const res = await fetch(`${API_BASE}/opd/doctor/call-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date, targetToken })
  });
  return res.json();
}

export async function doctorCompleteConsultation({ hospitalId, doctorId, date, tokenNumber, notes = '', durationMins = null }) {
  const res = await fetch(`${API_BASE}/opd/doctor/complete-consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date, tokenNumber, notes, durationMins })
  });
  return res.json();
}

export async function doctorMarkNotPresent({ hospitalId, doctorId, date, tokenNumber }) {
  const res = await fetch(`${API_BASE}/opd/doctor/mark-not-present`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date, tokenNumber })
  });
  return res.json();
}

export async function doctorReAddQueue({ hospitalId, doctorId, date, tokenNumber, priorityRule = 'NEXT' }) {
  const res = await fetch(`${API_BASE}/opd/doctor/re-add-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId, doctorId, date, tokenNumber, priorityRule })
  });
  return res.json();
}

// Digital Prescriptions
export async function createPrescription(prescriptionData) {
  const res = await fetch(`${API_BASE}/opd/prescription/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prescriptionData)
  });
  return res.json();
}

export async function fetchPatientPrescriptions(uhid) {
  const res = await fetch(`${API_BASE}/opd/prescription/patient/${encodeURIComponent(uhid)}`);
  return res.json();
}

export async function fetchPrescriptionById(id) {
  const res = await fetch(`${API_BASE}/opd/prescription/${encodeURIComponent(id)}`);
  return res.json();
}

// Medical Records
export async function createMedicalRecord(recordData) {
  const res = await fetch(`${API_BASE}/opd/medical-record/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recordData)
  });
  return res.json();
}

export async function fetchPatientMedicalRecords(uhid) {
  const res = await fetch(`${API_BASE}/opd/medical-record/patient/${encodeURIComponent(uhid)}`);
  return res.json();
}

// Secure Patient QR Identification
export async function generatePatientQr(uhid) {
  const res = await fetch(`${API_BASE}/opd/qr/generate/${encodeURIComponent(uhid)}`);
  return res.json();
}

export async function verifyPatientQr({ qrData, uhid, doctorId, hospitalId }) {
  const res = await fetch(`${API_BASE}/opd/qr/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrData, uhid, doctorId, hospitalId })
  });
  return res.json();
}

// Audit Logs
export async function fetchOpdAuditLogs(limit = 50) {
  const res = await fetch(`${API_BASE}/opd/audit-logs?limit=${limit}`);
  return res.json();
}
