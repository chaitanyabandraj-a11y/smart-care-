const express = require('express');
const router = express.Router();
const opdDbManager = require('../db/opdDbManager');

// 1. Get all participating OPD hospitals
router.get('/hospitals', (req, res) => {
  try {
    const hospitals = opdDbManager.getOpdHospitals();
    res.json({ success: true, hospitals });
  } catch (err) {
    console.error('[OPD Error] /hospitals:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Click-by-click Interaction Logging with Date, Day, and Time
router.post('/interaction-log', (req, res) => {
  try {
    const { sessionId, stepName, actionData, mobile, uhid } = req.body;
    if (!sessionId || !stepName) {
      return res.status(400).json({ success: false, error: 'sessionId and stepName are required' });
    }
    const result = opdDbManager.logInteractionClick(sessionId, stepName, actionData, mobile, uhid);
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /interaction-log:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Existing Patient Login Request (by Unique ID or Mobile)
router.post('/auth/patient-login-request', (req, res) => {
  try {
    const { sessionId, identifier } = req.body;
    if (!sessionId || !identifier) {
      return res.status(400).json({ success: false, error: 'sessionId and identifier (Unique ID or Mobile) are required' });
    }
    const result = opdDbManager.requestPatientLoginOtp(sessionId, identifier);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /auth/patient-login-request:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Send Patient Mobile OTP (for New Registration)
router.post('/auth/send-otp', (req, res) => {
  try {
    const { sessionId, mobile } = req.body;
    if (!sessionId || !mobile) {
      return res.status(400).json({ success: false, error: 'sessionId and mobile are required' });
    }
    const result = opdDbManager.sendPatientOtp(sessionId, mobile);
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /auth/send-otp:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Verify Patient Mobile OTP
router.post('/auth/verify-otp', (req, res) => {
  try {
    const { sessionId, otpCode } = req.body;
    if (!sessionId || !otpCode) {
      return res.status(400).json({ success: false, error: 'sessionId and otpCode are required' });
    }
    const result = opdDbManager.verifyPatientOtp(sessionId, otpCode);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /auth/verify-otp:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Register New Patient Profile (Generates Permanent UHID)
router.post('/auth/register-patient', (req, res) => {
  try {
    const { sessionId, patientData } = req.body;
    if (!sessionId || !patientData || !patientData.name || !patientData.mobile) {
      return res.status(400).json({ success: false, error: 'sessionId, patient name, and mobile are required' });
    }
    const result = opdDbManager.registerPatient(sessionId, patientData);
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /auth/register-patient:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Get Patient Profile by UHID or Mobile
router.get('/patient/:identifier', (req, res) => {
  try {
    const { identifier } = req.params;
    const patient = opdDbManager.getPatientProfile(identifier);
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient profile not found' });
    }
    res.json({ success: true, patient });
  } catch (err) {
    console.error('[OPD Error] /patient/:identifier:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Hospital Departments
router.get('/departments/:hospitalId', (req, res) => {
  try {
    const { hospitalId } = req.params;
    const departments = opdDbManager.getHospitalDepartments(hospitalId);
    res.json({ success: true, departments });
  } catch (err) {
    console.error('[OPD Error] /departments/:hospitalId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get Hospital Doctors
router.get('/doctors/:hospitalId', (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { department } = req.query;
    const doctors = opdDbManager.getHospitalDoctors(hospitalId, department);
    res.json({ success: true, doctors });
  } catch (err) {
    console.error('[OPD Error] /doctors/:hospitalId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Get Doctor Availability and Slots
router.get('/doctor/:doctorId/availability', (req, res) => {
  try {
    const { doctorId } = req.params;
    const { patientId } = req.query;
    const availability = opdDbManager.getDoctorAvailability(doctorId, patientId);
    if (!availability) {
      return res.status(404).json({ success: false, error: 'Doctor not found' });
    }
    res.json({ success: true, availability });
  } catch (err) {
    console.error('[OPD Error] /doctor/:doctorId/availability:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Book OPD Appointment (Creates Token, Virtual Queue Entry, and ORS Slip Data)
router.post('/appointment/book', (req, res) => {
  try {
    const {
      uhid, hospitalId, doctorId, appointmentDate, timeSlot,
      appointmentType, chiefComplaint, sessionId
    } = req.body;

    if (!uhid || !hospitalId || !doctorId || !appointmentDate) {
      return res.status(400).json({
        success: false,
        error: 'uhid, hospitalId, doctorId, and appointmentDate are required'
      });
    }

    const result = opdDbManager.bookOpdAppointment({
      uhid,
      hospitalId,
      doctorId,
      appointmentDate,
      timeSlot,
      appointmentType,
      chiefComplaint,
      sessionId
    });

    if (!result.success) {
      return res.status(result.duplicate ? 409 : 400).json(result);
    }

    // Broadcast queue update to room if io is present
    const io = req.app.get('io');
    if (io) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${appointmentDate}`;
      const queueStatus = opdDbManager.getVirtualQueueStatus(hospitalId, doctorId, appointmentDate);
      io.to(room).emit('opd:queue_updated', queueStatus);
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /appointment/book:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Get Single Appointment Details (For ORS OPD Slip)
router.get('/appointment/:id', (req, res) => {
  try {
    const { id } = req.params;
    const details = opdDbManager.getAppointmentById(id);
    if (!details) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }
    res.json({ success: true, ...details });
  } catch (err) {
    console.error('[OPD Error] /appointment/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Get Patient Appointments
router.get('/patient/:identifier/appointments', (req, res) => {
  try {
    const { identifier } = req.params;
    const appointments = opdDbManager.getPatientAppointments(identifier);
    res.json({ success: true, appointments });
  } catch (err) {
    console.error('[OPD Error] /patient/:identifier/appointments:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12.5 Cancel Patient OPD Appointment
router.post('/appointment/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason, uhid } = req.body || {};
    const result = opdDbManager.cancelOpdAppointment(id, cancellationReason, uhid);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.appointment) {
      const apt = result.appointment;
      // 1. Broadcast to doctor personal room
      io.to(`opd_doctor_${apt.doctor_id}`).emit('opd:appointment_cancelled', {
        appointmentId: id,
        appointment: apt,
        queue: result.queue
      });

      // 2. Broadcast to specific date queue room
      const queueRoom = `opd_queue_${apt.hospital_id}_${apt.doctor_id}_${apt.appointment_date}`;
      io.to(queueRoom).emit('opd:appointment_cancelled', {
        appointmentId: id,
        appointment: apt,
        queue: result.queue
      });
      io.to(queueRoom).emit('opd:queue_updated', result.queue);

      // 3. Broadcast to hospital room so patient booking wizards update token count & clear duplicate restriction
      io.to(`opd_hospital_${apt.hospital_id}`).emit('opd:appointment_cancelled', {
        appointmentId: id,
        doctorId: apt.doctor_id,
        appointmentDate: apt.appointment_date
      });
      io.emit('opd:appointment_cancelled', {
        appointmentId: id,
        doctorId: apt.doctor_id,
        appointmentDate: apt.appointment_date
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /appointment/:id/cancel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/appointment/cancel', (req, res) => {
  try {
    const { appointmentId, id, cancellationReason, uhid } = req.body || {};
    const targetId = appointmentId || id;
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'appointmentId is required' });
    }
    const result = opdDbManager.cancelOpdAppointment(targetId, cancellationReason, uhid);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.appointment) {
      const apt = result.appointment;
      io.to(`opd_doctor_${apt.doctor_id}`).emit('opd:appointment_cancelled', {
        appointmentId: targetId,
        appointment: apt,
        queue: result.queue
      });
      const queueRoom = `opd_queue_${apt.hospital_id}_${apt.doctor_id}_${apt.appointment_date}`;
      io.to(queueRoom).emit('opd:appointment_cancelled', {
        appointmentId: targetId,
        appointment: apt,
        queue: result.queue
      });
      io.to(queueRoom).emit('opd:queue_updated', result.queue);
      io.to(`opd_hospital_${apt.hospital_id}`).emit('opd:appointment_cancelled', {
        appointmentId: targetId,
        doctorId: apt.doctor_id,
        appointmentDate: apt.appointment_date
      });
      io.emit('opd:appointment_cancelled', {
        appointmentId: targetId,
        doctorId: apt.doctor_id,
        appointmentDate: apt.appointment_date
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /appointment/cancel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Get Real-Time Live Virtual Queue Status (Sitting-at-Home Monitor)
router.get(['/queue/:hospitalId/:doctorId/:date', '/queue/status/:hospitalId/:doctorId'], (req, res) => {
  try {
    const { hospitalId, doctorId } = req.params;
    const date = req.params.date || req.query.date || opdDbManager.getLocalDateString();
    const token = req.query.token || req.query.patientToken; // optional patient token
    const status = opdDbManager.getVirtualQueueStatus(hospitalId, doctorId, date, token);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Queue not found for doctor' });
    }
    res.json({ success: true, queue: status });
  } catch (err) {
    console.error('[OPD Error] /queue/:hospitalId/:doctorId/:date:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13.2 Verify Doctor ID against hospital database (Security Pre-Check)
router.post('/doctor/verify-id', (req, res) => {
  try {
    const { hospitalId, doctorId } = req.body;
    if (!hospitalId || !doctorId) {
      return res.status(400).json({ success: false, error: 'hospitalId and doctorId are required' });
    }
    const result = opdDbManager.verifyDoctorId(hospitalId, doctorId);
    if (!result.success) {
      return res.status(result.securityError ? 403 : 400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/verify-id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13.3 Get Authorized Doctors Registry for Hospital
router.get('/doctor/authorized-registry/:hospitalId', (req, res) => {
  try {
    const { hospitalId } = req.params;
    const doctors = opdDbManager.getAuthorizedDoctors(hospitalId);
    res.json({ success: true, doctors });
  } catch (err) {
    console.error('[OPD Error] /doctor/authorized-registry:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13.5 Doctor Registration with Pre-Authorized Unique Doctor ID Verification
router.post('/doctor/register', (req, res) => {
  try {
    const {
      hospitalId, doctorId, doctorName, qualification, department, specialty,
      roomNo, availableDays, shiftStart, shiftEnd,
      avgConsultationMins, maxDailyTokens, password, contactPhone, email
    } = req.body;

    if (!hospitalId || !doctorId) {
      return res.status(400).json({
        success: false,
        error: 'hospitalId and doctorId are required. Enter your pre-assigned Unique Doctor ID.'
      });
    }

    const result = opdDbManager.registerDoctor({
      hospitalId, doctorId, doctorName, qualification, department, specialty,
      roomNo, availableDays, shiftStart, shiftEnd,
      avgConsultationMins, maxDailyTokens, password, contactPhone, email
    });

    if (!result.success) {
      return res.status(result.securityError ? 403 : 400).json(result);
    }

    // Broadcast new doctor registration & duty schedule in real time
    const io = req.app.get('io');
    if (io && result.doctor) {
      io.to(`opd_hospital_${result.doctor.hospital_id}`).emit('opd:doctor_registered', result.doctor);
      io.to(`opd_hospital_${result.doctor.hospital_id}`).emit('opd:doctor_schedule_updated', result.doctor);
      io.emit('opd:doctor_schedule_updated', result.doctor);
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Doctor Login / Verification
router.post('/doctor/login', (req, res) => {
  try {
    const { hospitalId, doctorId, password } = req.body;
    if (!hospitalId || !doctorId) {
      return res.status(400).json({ success: false, error: 'hospitalId and doctorId are required' });
    }
    const result = opdDbManager.doctorLogin(hospitalId, doctorId, password);
    if (!result.success) {
      return res.status(401).json(result);
    }

    // Broadcast doctor login in real time
    const io = req.app.get('io');
    if (io && result.doctor) {
      io.to(`opd_hospital_${hospitalId}`).emit('opd:doctor_logged_in', {
        doctorId: result.doctor.doctor_id,
        doctorName: result.doctor.doctor_name,
        hospitalId,
        timestamp: new Date().toISOString()
      });
      io.emit('opd:doctor_logged_in', {
        doctorId: result.doctor.doctor_id,
        doctorName: result.doctor.doctor_name,
        hospitalId,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/login:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14.5 Update Doctor Duty Schedule & Chamber Configuration
router.put('/doctor/:doctorId/schedule', (req, res) => {
  try {
    const { doctorId } = req.params;
    const scheduleData = req.body;
    const result = opdDbManager.updateDoctorDutySchedule(doctorId, scheduleData);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast schedule update in real time to hospital & patients
    const io = req.app.get('io');
    if (io && result.doctor) {
      io.to(`opd_doctor_${doctorId}`).emit('opd:doctor_schedule_updated', result.doctor);
      io.to(`opd_hospital_${result.doctor.hospital_id}`).emit('opd:doctor_schedule_updated', result.doctor);
      io.emit('opd:doctor_schedule_updated', result.doctor);
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/:doctorId/schedule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14.6 Get Doctor Upcoming Appointments & Duty Calendar
router.get('/doctor/:doctorId/upcoming-schedule', (req, res) => {
  try {
    const { doctorId } = req.params;
    const schedule = opdDbManager.getDoctorUpcomingSchedule(doctorId);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Doctor not found' });
    }
    res.json({ success: true, ...schedule });
  } catch (err) {
    console.error('[OPD Error] /doctor/:doctorId/upcoming-schedule:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. Doctor Arrives on Desk & Starts OPD Session
router.post('/doctor/session/start', (req, res) => {
  try {
    const { hospitalId, doctorId, date } = req.body;
    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, and date are required' });
    }
    const result = opdDbManager.startDoctorSession(hospitalId, doctorId, date);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Broadcast queue & doctor desk status in real-time
    const io = req.app.get('io');
    if (io) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.to(`opd_doctor_${doctorId}`).emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'ON_DESK', queue: result.queue });
      io.to(`opd_hospital_${hospitalId}`).emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'ON_DESK', queue: result.queue });
      io.emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'ON_DESK', queue: result.queue });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/session/start:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. Doctor Pauses / Leaves Desk
router.post('/doctor/session/end', (req, res) => {
  try {
    const { hospitalId, doctorId, date } = req.body;
    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, and date are required' });
    }
    const result = opdDbManager.endDoctorSession(hospitalId, doctorId, date);

    const io = req.app.get('io');
    if (io) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.to(`opd_doctor_${doctorId}`).emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'OFF_DESK', queue: result.queue });
      io.to(`opd_hospital_${hospitalId}`).emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'OFF_DESK', queue: result.queue });
      io.emit('opd:doctor_status_changed', { doctorId, hospitalId, date, status: 'OFF_DESK', queue: result.queue });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/session/end:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17. Doctor Calls Next Patient Token (Backward compatibility alias)
router.post('/doctor/call-next', (req, res) => {
  try {
    const { hospitalId, doctorId, date, targetToken } = req.body;
    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, and date are required' });
    }
    const result = opdDbManager.doctorCallToken(hospitalId, doctorId, date, targetToken);

    // Broadcast updated queue to all listening patients
    const io = req.app.get('io');
    if (io && result.queue) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.emit('opd:queue_updated', result.queue);
      io.to(room).emit('opd:token_called', { token: result.calledToken, patient: result.calledPatient });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/call-next:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17.1 Doctor Calls Specific or Next Token into Chamber (Starts Consultation Stopwatch)
router.post('/doctor/call-token', (req, res) => {
  try {
    const { hospitalId, doctorId, date, targetToken } = req.body;
    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, and date are required' });
    }
    const result = opdDbManager.doctorCallToken(hospitalId, doctorId, date, targetToken);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.queue) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.emit('opd:queue_updated', result.queue);
      io.to(room).emit('opd:token_called', { token: result.calledToken, patient: result.calledPatient });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/call-token:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17.2 Doctor Completes Consultation (Records duration, frees chamber)
router.post('/doctor/complete-consultation', (req, res) => {
  try {
    const { hospitalId, doctorId, date, tokenNumber, notes, durationMins } = req.body;
    if (!hospitalId || !doctorId || !date) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, and date are required' });
    }
    const result = opdDbManager.doctorCompleteConsultation(hospitalId, doctorId, date, tokenNumber, { notes, durationMins });
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.queue) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.emit('opd:queue_updated', result.queue);
      io.to(room).emit('opd:consultation_completed', { token: result.completedToken, durationMins: result.durationMins });
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/complete-consultation:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17.3 Doctor Marks Patient Not Present
router.post('/doctor/mark-not-present', (req, res) => {
  try {
    const { hospitalId, doctorId, date, tokenNumber } = req.body;
    if (!hospitalId || !doctorId || !date || !tokenNumber) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, date, and tokenNumber are required' });
    }
    const result = opdDbManager.doctorMarkNotPresent(hospitalId, doctorId, date, tokenNumber);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.queue) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.emit('opd:queue_updated', result.queue);
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/mark-not-present:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17.4 Doctor / Desk Staff Re-Adds Patient to Active Queue
router.post('/doctor/re-add-queue', (req, res) => {
  try {
    const { hospitalId, doctorId, date, tokenNumber, priorityRule } = req.body;
    if (!hospitalId || !doctorId || !date || !tokenNumber) {
      return res.status(400).json({ success: false, error: 'hospitalId, doctorId, date, and tokenNumber are required' });
    }
    const result = opdDbManager.doctorReAddQueue(hospitalId, doctorId, date, tokenNumber, priorityRule);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const io = req.app.get('io');
    if (io && result.queue) {
      const room = `opd_queue_${hospitalId}_${doctorId}_${date}`;
      io.to(room).emit('opd:queue_updated', result.queue);
      io.emit('opd:queue_updated', result.queue);
    }

    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/re-add-queue:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. Get Doctor Today's Appointed Patients Roster
router.get('/doctor/:hospitalId/:doctorId/today-roster', (req, res) => {
  try {
    const { hospitalId, doctorId } = req.params;
    const { date } = req.query;
    const rosterDate = date || opdDbManager.getLocalDateString();
    const result = opdDbManager.getDoctorTodayRoster(hospitalId, doctorId, rosterDate);
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /doctor/today-roster:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. Digital Prescriptions
router.post('/prescription/create', (req, res) => {
  try {
    const result = opdDbManager.createPrescription(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    const io = req.app.get('io');
    if (io && req.body.uhid) {
      io.emit(`opd:prescription_new_${req.body.uhid}`, result.prescription);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /prescription/create:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/prescription/patient/:uhid', (req, res) => {
  try {
    const prescriptions = opdDbManager.getPatientPrescriptions(req.params.uhid);
    res.json({ success: true, prescriptions });
  } catch (err) {
    console.error('[OPD Error] /prescription/patient/:uhid:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/prescription/:id', (req, res) => {
  try {
    const prescription = opdDbManager.getPrescriptionById(req.params.id);
    if (!prescription) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }
    res.json({ success: true, prescription });
  } catch (err) {
    console.error('[OPD Error] /prescription/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. Medical Records
router.post('/medical-record/create', (req, res) => {
  try {
    const result = opdDbManager.createMedicalRecord(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /medical-record/create:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/medical-record/patient/:uhid', (req, res) => {
  try {
    const records = opdDbManager.getPatientMedicalRecords(req.params.uhid);
    res.json({ success: true, records });
  } catch (err) {
    console.error('[OPD Error] /medical-record/patient/:uhid:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 21. Secure QR Code Generation & Chamber Verification
router.get('/qr/generate/:uhid', (req, res) => {
  try {
    const result = opdDbManager.generatePatientQrData(req.params.uhid);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /qr/generate/:uhid:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/qr/verify', (req, res) => {
  try {
    const { qrData, uhid, doctorId, hospitalId } = req.body;
    const target = qrData || uhid;
    if (!target) {
      return res.status(400).json({ success: false, error: 'QR data or patient UHID is required' });
    }
    const result = opdDbManager.verifyPatientQrToken(target, doctorId || '', hospitalId || '');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[OPD Error] /qr/verify:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 22. Audit Logs (Protected / Inspection)
router.get('/audit-logs', (req, res) => {
  try {
    const db = opdDbManager.getOpdDb();
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.prepare('SELECT * FROM opd_audit_logs ORDER BY id DESC LIMIT ?').all(limit);
    const mappedLogs = logs.map(l => ({
      ...l,
      target_entity: l.entity,
      details_json: l.metadata,
      created_at: l.timestamp
    }));
    res.json({ success: true, logs: mappedLogs });
  } catch (err) {
    console.error('[OPD Error] /audit-logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

