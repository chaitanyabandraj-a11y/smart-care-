import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Stethoscope, User, Clock, CheckCircle2, AlertCircle, RefreshCw,
  LogOut, Play, Square, ChevronRight, Phone, ShieldCheck, FileText, UserCheck,
  Calendar, Settings, Edit3, PlusCircle, Save, Check, Building2, Lock, Eye, EyeOff,
  Mic, MicOff, QrCode, Plus, Trash2, Printer, AlertTriangle, RotateCcw, X, History
} from 'lucide-react';
import {
  doctorOpdLogin,
  verifyDoctorId,
  registerDoctorOpd,
  updateDoctorOpdSchedule,
  fetchDoctorUpcomingSchedule,
  startDoctorOpdSession,
  endDoctorOpdSession,
  callNextDoctorOpdToken,
  fetchDoctorTodayRoster,
  doctorCallToken,
  doctorCompleteConsultation,
  doctorMarkNotPresent,
  doctorReAddQueue,
  createPrescription,
  fetchPatientPrescriptions,
  fetchPatientMedicalRecords,
  verifyPatientQr
} from '../../services/api';

export default function DoctorOpdPortal() {

  const hospitalOptions = [
    { id: 'aiims', name: 'AIIMS New Delhi', icon: '🏛️' },
    { id: 'apollo', name: 'Indraprastha Apollo Hospital', icon: '🏥' },
    { id: 'fortis', name: 'Fortis Escorts Heart Institute', icon: '❤️' },
    { id: 'lok_nayak', name: 'Lok Nayak Hospital (LNJP)', icon: '🩺' },
    { id: 'max', name: 'Max Super Speciality Hospital', icon: '🏨' }
  ];

  const standardDepartments = [
    'Cardiology', 'General Medicine', 'Orthopedics', 'Pediatrics',
    'Dermatology', 'Neurology', 'ENT', 'Ophthalmology', 'Gynecology', 'Other'
  ];

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Auth Mode: 'LOGIN' | 'REGISTER'
  const [authMode, setAuthMode] = useState('LOGIN');

  // Login Form State (Clean credentials - no pre-filled demo accounts)
  const [selectedHospitalId, setSelectedHospitalId] = useState('apollo');
  const [doctorIdInput, setDoctorIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Registration Form State (Requires Hospital-Authorized Unique Doctor ID)
  const [regHospitalId, setRegHospitalId] = useState('apollo');
  const [regDoctorId, setRegDoctorId] = useState('');
  const [verifyingId, setVerifyingId] = useState(false);
  const [idVerificationResult, setIdVerificationResult] = useState(null);
  const [regDoctorName, setRegDoctorName] = useState('');
  const [regQualification, setRegQualification] = useState('MBBS, MD');
  const [regDepartment, setRegDepartment] = useState('Cardiology');
  const [customDept, setCustomDept] = useState('');
  const [regSpecialty, setRegSpecialty] = useState('');
  const [regRoomNo, setRegRoomNo] = useState('Room 201 (Tower A)');
  const [regShiftStart, setRegShiftStart] = useState('09:00 AM');
  const [regShiftEnd, setRegShiftEnd] = useState('02:00 PM');
  const [regAvailableDays, setRegAvailableDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [regMaxTokens, setRegMaxTokens] = useState(30);
  const [regAvgDuration, setRegAvgDuration] = useState(12);
  const [regPassword, setRegPassword] = useState('Doctor@123');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState(null);
  const [regSuccessResult, setRegSuccessResult] = useState(null);
  const [cancelNotification, setCancelNotification] = useState(null);

  const DOCTOR_SESSION_KEY = 'smartcare_opd_doctor';
  const DOCTOR_TAB_KEY = 'smartcare_opd_doctor_tab';

  // Authenticated Doctor State (Persisted in localStorage until voluntary logout)
  const [authenticatedDoctor, setAuthenticatedDoctor] = useState(() => {
    try {
      const saved = localStorage.getItem('smartcare_opd_doctor');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('Failed to parse saved doctor session:', e);
      return null;
    }
  });

  // Active Dashboard Tab: 'CHAMBER' | 'SCHEDULE' | 'APPOINTMENTS'
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('smartcare_opd_doctor_tab') || 'CHAMBER';
    } catch (_) {
      return 'CHAMBER';
    }
  });

  // Keep localStorage in sync with doctor session state
  useEffect(() => {
    try {
      if (authenticatedDoctor) {
        localStorage.setItem(DOCTOR_SESSION_KEY, JSON.stringify(authenticatedDoctor));
      } else {
        localStorage.removeItem(DOCTOR_SESSION_KEY);
      }
    } catch (_) {}
  }, [authenticatedDoctor]);

  // Tab change with persistence
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(DOCTOR_TAB_KEY, tab);
    } catch (_) {}
    if (tab === 'APPOINTMENTS' && authenticatedDoctor) {
      loadUpcomingSchedule(authenticatedDoctor);
    }
  };

  // Voluntary Doctor Logout (ONLY way to log out)
  const handleLogout = () => {
    try {
      localStorage.removeItem(DOCTOR_SESSION_KEY);
      localStorage.removeItem(DOCTOR_TAB_KEY);
    } catch (_) {}
    setAuthenticatedDoctor(null);
    setQueueState(null);
    setAppointments([]);
    setUpcomingSchedule(null);
    setAuthMode('LOGIN');
    setDoctorIdInput('');
    setPasswordInput('');
    setLoginError(null);
  };

  // Direct Chamber Desk entry on registration
  const handleEnterChamberDirectly = (doctor) => {
    setAuthenticatedDoctor(doctor);
    try {
      localStorage.setItem(DOCTOR_SESSION_KEY, JSON.stringify(doctor));
      localStorage.setItem(DOCTOR_TAB_KEY, 'CHAMBER');
    } catch (_) {}
    setActiveTab('CHAMBER');
    setRegSuccessResult(null);
  };

  // Active Session & Roster State
  const [queueState, setQueueState] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [callingNext, setCallingNext] = useState(false);

  // Duty Schedule Editor State
  const [editAvailableDays, setEditAvailableDays] = useState([]);
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [editRoomNo, setEditRoomNo] = useState('');
  const [editMaxTokens, setEditMaxTokens] = useState(30);
  const [editAvgMins, setEditAvgMins] = useState(12);
  const [editIsActive, setEditIsActive] = useState(true);
  const [scheduleSaveLoading, setScheduleSaveLoading] = useState(false);
  const [scheduleSaveMsg, setScheduleSaveMsg] = useState(null);

  // Upcoming Duty Appointments State
  const [upcomingSchedule, setUpcomingSchedule] = useState(null);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [upcomingDateFilter, setUpcomingDateFilter] = useState('ALL');

  // Live Patient Stopwatch Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef(null);
  const socketRef = useRef(null);

  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayDateStr = getLocalDateStr();

  // Two-Step Consultation & Action Feedback State
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');

  // Digital Prescription Modal State
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxPatient, setRxPatient] = useState(null);
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxClinicalNotes, setRxClinicalNotes] = useState('');
  const [rxMedicines, setRxMedicines] = useState([
    { name: '', dosage: '500 mg', frequency: '1-0-1', duration: '5 days', instructions: 'After food' }
  ]);
  const [rxAdvice, setRxAdvice] = useState('Take adequate rest and drink plenty of fluids.');
  const [rxFollowUpDate, setRxFollowUpDate] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [rxSaving, setRxSaving] = useState(false);
  const [createdRxSlip, setCreatedRxSlip] = useState(null);
  const speechRecRef = useRef(null);

  // Patient QR Scanner / Verification State
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrVerifying, setQrVerifying] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [qrError, setQrError] = useState(null);

  // Medical Records View Modal State
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [selectedPatientHistory, setSelectedPatientHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Initialize Duty Schedule Editor when doctor authenticates
  useEffect(() => {
    if (authenticatedDoctor) {
      setEditAvailableDays(authenticatedDoctor.availableDays || []);
      setEditShiftStart(authenticatedDoctor.shift_start || '09:00 AM');
      setEditShiftEnd(authenticatedDoctor.shift_end || '02:00 PM');
      setEditRoomNo(authenticatedDoctor.room_no || 'OPD Chamber 101');
      setEditMaxTokens(authenticatedDoctor.max_daily_tokens || 30);
      setEditAvgMins(authenticatedDoctor.avg_consultation_mins || 12);
      setEditIsActive(authenticatedDoctor.is_active !== 0);
    }
  }, [authenticatedDoctor]);

  // Stopwatch for current patient
  useEffect(() => {
    if (queueState?.doctorStatus === 'ON_DESK' && queueState?.currentServingToken > 0) {
      setTimerSeconds(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [queueState?.currentServingToken, queueState?.doctorStatus]);

  // Load Doctor Roster
  const loadRoster = async (doc = authenticatedDoctor) => {
    if (!doc) return;
    try {
      setLoadingRoster(true);
      const res = await fetchDoctorTodayRoster(doc.hospital_id, doc.doctor_id, todayDateStr);
      if (res.success) {
        setQueueState(res.queue);
        setAppointments(res.appointments || []);
      }
    } catch (err) {
      console.error('Failed to load roster:', err);
    } finally {
      setLoadingRoster(false);
    }
  };

  // Load Upcoming Schedule & Appointed Patients
  const loadUpcomingSchedule = async (doc = authenticatedDoctor) => {
    if (!doc) return;
    try {
      setLoadingUpcoming(true);
      const res = await fetchDoctorUpcomingSchedule(doc.doctor_id);
      if (res.success) {
        setUpcomingSchedule(res);
      }
    } catch (err) {
      console.error('Failed to load upcoming schedule:', err);
    } finally {
      setLoadingUpcoming(false);
    }
  };

  // Socket.IO Room setup
  useEffect(() => {
    if (!authenticatedDoctor) return;

    loadRoster(authenticatedDoctor);

    const socket = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_opd_queue', {
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr
      });
      socket.emit('join_opd_doctor', authenticatedDoctor.doctor_id);
    });

    socket.on('opd:queue_updated', (updatedQueue) => {
      if (
        updatedQueue.hospitalId === authenticatedDoctor.hospital_id &&
        updatedQueue.doctorId === authenticatedDoctor.doctor_id &&
        updatedQueue.queueDate === todayDateStr
      ) {
        setQueueState(updatedQueue);
        loadRoster(authenticatedDoctor);
      }
    });

    // Real-time cancellation reflection on doctor portal
    socket.on('opd:appointment_cancelled', (data) => {
      loadRoster(authenticatedDoctor);
      loadUpcomingSchedule(authenticatedDoctor);
      if (data?.appointment) {
        setCancelNotification(`Patient ${data.appointment.patient_name} (Token #${data.appointment.token_number}) cancelled their appointment for ${data.appointment.appointment_date}. Roster updated.`);
        setTimeout(() => setCancelNotification(null), 8000);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_opd_queue', {
          hospitalId: authenticatedDoctor.hospital_id,
          doctorId: authenticatedDoctor.doctor_id,
          date: todayDateStr
        });
        socketRef.current.emit('leave_opd_doctor', authenticatedDoctor.doctor_id);
        socketRef.current.disconnect();
      }
    };
  }, [authenticatedDoctor]);

  // Handle Doctor Login
  const handleDoctorLogin = async (e) => {
    if (e) e.preventDefault();
    if (!doctorIdInput.trim()) {
      setLoginError('Please enter your Unique Doctor ID.');
      return;
    }
    if (!passwordInput.trim()) {
      setLoginError('Please enter your password.');
      return;
    }
    try {
      setLoginLoading(true);
      setLoginError(null);
      const res = await doctorOpdLogin({
        hospitalId: selectedHospitalId,
        doctorId: doctorIdInput.trim(),
        password: passwordInput
      });

      if (res.success) {
        setAuthenticatedDoctor(res.doctor);
      } else {
        setLoginError(res.error || 'Doctor authentication failed.');
      }
    } catch (err) {
      setLoginError(err.message || 'Error connecting to doctor service.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Pre-verify staff Doctor ID against hospital database
  const handleVerifyStaffId = async () => {
    if (!regDoctorId.trim()) {
      setRegError('Please enter your hospital-issued Unique Doctor ID.');
      return;
    }
    try {
      setVerifyingId(true);
      setRegError(null);
      const res = await verifyDoctorId({ hospitalId: regHospitalId, doctorId: regDoctorId.trim() });
      if (res.success) {
        setIdVerificationResult({ verified: true, doctor: res.doctor });
        setRegDoctorName(res.doctor.doctor_name);
        setRegQualification(res.doctor.qualification || 'MBBS, MD');
        setRegDepartment(res.doctor.department || 'Cardiology');
        setRegSpecialty(res.doctor.specialty || res.doctor.department);
        if (res.doctor.room_no) setRegRoomNo(res.doctor.room_no);
        if (res.doctor.available_days) {
          try {
            const days = Array.isArray(res.doctor.availableDays) ? res.doctor.availableDays : JSON.parse(res.doctor.available_days);
            if (days && days.length > 0) setRegAvailableDays(days);
          } catch (_) {}
        }
      } else {
        setIdVerificationResult({ verified: false });
        setRegError(res.error || 'Verification failed. Unauthorized Doctor ID.');
      }
    } catch (err) {
      setRegError(err.message || 'Error verifying Doctor ID.');
    } finally {
      setVerifyingId(false);
    }
  };

  // Handle Doctor Registration with Pre-Authorized Staff ID
  const handleDoctorRegister = async (e) => {
    e.preventDefault();
    if (!regDoctorId.trim()) {
      setRegError('Please enter your hospital-issued Unique Doctor ID.');
      return;
    }
    if (!regDoctorName.trim()) {
      setRegError('Please enter doctor name.');
      return;
    }
    if (regAvailableDays.length === 0) {
      setRegError('Please select at least one scheduled duty day.');
      return;
    }

    const finalDept = regDepartment === 'Other' ? (customDept.trim() || 'General Medicine') : regDepartment;

    try {
      setRegLoading(true);
      setRegError(null);

      const payload = {
        hospitalId: regHospitalId,
        doctorId: regDoctorId.trim(),
        doctorName: regDoctorName,
        qualification: regQualification,
        department: finalDept,
        specialty: regSpecialty.trim() || finalDept,
        roomNo: regRoomNo,
        shiftStart: regShiftStart,
        shiftEnd: regShiftEnd,
        availableDays: regAvailableDays,
        maxDailyTokens: regMaxTokens,
        avgConsultationMins: regAvgDuration,
        password: regPassword || 'Doctor@123',
        contactPhone: regPhone,
        email: regEmail
      };

      const res = await registerDoctorOpd(payload);
      if (res.success) {
        setRegSuccessResult(res);
        // Pre-fill login with newly registered doctor
        setSelectedHospitalId(res.doctor.hospital_id);
        setDoctorIdInput(res.doctor.doctor_id);
        setPasswordInput(regPassword || 'Doctor@123');
      } else {
        setRegError(res.error || 'Failed to register doctor.');
      }
    } catch (err) {
      setRegError(err.message || 'Error registering doctor with hospital.');
    } finally {
      setRegLoading(false);
    }
  };

  // Toggle Day in Registration or Schedule Editor
  const toggleRegDay = (day) => {
    setRegAvailableDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleEditDay = (day) => {
    setEditAvailableDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Handle Saving Updated Duty Schedule
  const handleSaveDutySchedule = async (e) => {
    e.preventDefault();
    if (editAvailableDays.length === 0) {
      setScheduleSaveMsg({ type: 'error', text: 'Please select at least one weekly duty day.' });
      return;
    }

    try {
      setScheduleSaveLoading(true);
      setScheduleSaveMsg(null);

      const res = await updateDoctorOpdSchedule(authenticatedDoctor.doctor_id, {
        availableDays: editAvailableDays,
        shiftStart: editShiftStart,
        shiftEnd: editShiftEnd,
        roomNo: editRoomNo,
        maxDailyTokens: editMaxTokens,
        avgConsultationMins: editAvgMins,
        isActive: editIsActive
      });

      if (res.success) {
        setAuthenticatedDoctor(res.doctor);
        setScheduleSaveMsg({
          type: 'success',
          text: 'Duty schedule successfully updated! Patient booking calendar in ORS now immediately reflects your duty days and shift hours.'
        });
      } else {
        setScheduleSaveMsg({ type: 'error', text: res.error || 'Failed to update schedule.' });
      }
    } catch (err) {
      setScheduleSaveMsg({ type: 'error', text: err.message || 'Error saving duty schedule.' });
    } finally {
      setScheduleSaveLoading(false);
    }
  };

  // Start Desk Session
  const handleStartSession = async () => {
    try {
      const res = await startDoctorOpdSession({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
      }
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  // End / Pause Desk Session
  const handleEndSession = async () => {
    try {
      const res = await endDoctorOpdSession({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
      }
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  // Two-Step Consultation Lifecycle Handlers
  const handleCallToken = async (targetToken = null) => {
    try {
      setActionLoading(true);
      setActionFeedback(null);
      const res = await doctorCallToken({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr,
        targetToken
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
        setActionFeedback({ type: 'success', text: `Token #${res.calledToken} called into chamber!` });
        setTimeout(() => setActionFeedback(null), 5000);
      } else {
        setActionFeedback({ type: 'error', text: res.error || 'Failed to call token.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message || 'Error calling token.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Backward compatibility wrapper
  const handleCallNextToken = async (targetToken = null) => {
    return handleCallToken(targetToken);
  };

  // Complete Consultation for Active Patient
  const handleCompleteConsultation = async (tokenNumber = null) => {
    try {
      setActionLoading(true);
      setActionFeedback(null);
      const activeTok = tokenNumber || queueState?.activeToken || queueState?.currentServingToken;
      const durationMins = Math.max(0.5, Math.round((timerSeconds / 60) * 10) / 10);
      const res = await doctorCompleteConsultation({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr,
        tokenNumber: activeTok,
        notes: completionNotes,
        durationMins
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
        setCompletionNotes('');
        setTimerSeconds(0);
        setActionFeedback({
          type: 'success',
          text: `✓ Consultation completed for Token #${res.completedToken} (${res.durationMins} mins). Chamber is ready.`
        });
        setTimeout(() => setActionFeedback(null), 6000);
      } else {
        setActionFeedback({ type: 'error', text: res.error || 'Failed to complete consultation.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message || 'Error completing consultation.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Mark Patient Not Present
  const handleMarkNotPresent = async (tokenNumber) => {
    try {
      setActionLoading(true);
      setActionFeedback(null);
      const res = await doctorMarkNotPresent({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr,
        tokenNumber
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
        setActionFeedback({ type: 'warning', text: `Token #${tokenNumber} marked as Not Present.` });
        setTimeout(() => setActionFeedback(null), 5000);
      } else {
        setActionFeedback({ type: 'error', text: res.error || 'Failed to mark not present.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message || 'Error updating presence.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Re-Add Patient to Queue
  const handleReAddQueue = async (tokenNumber) => {
    try {
      setActionLoading(true);
      setActionFeedback(null);
      const res = await doctorReAddQueue({
        hospitalId: authenticatedDoctor.hospital_id,
        doctorId: authenticatedDoctor.doctor_id,
        date: todayDateStr,
        tokenNumber,
        priorityRule: 'NEXT'
      });
      if (res.success) {
        setQueueState(res.queue);
        loadRoster();
        setActionFeedback({ type: 'success', text: `Token #${tokenNumber} re-added to active queue!` });
        setTimeout(() => setActionFeedback(null), 5000);
      } else {
        setActionFeedback({ type: 'error', text: res.error || 'Failed to re-add to queue.' });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message || 'Error re-adding to queue.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Voice-to-Text Toggle
  const toggleVoiceInput = () => {
    if (isVoiceListening) {
      if (speechRecRef.current) {
        speechRecRef.current.stop();
      }
      setIsVoiceListening(false);
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech Recognition is not supported by your current browser. You can type clinical notes manually.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => setIsVoiceListening(true);
      rec.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          setRxClinicalNotes(prev => (prev ? prev + ' ' : '') + transcript.trim());
        }
      };
      rec.onerror = (e) => {
        console.warn('Speech recognition error:', e);
        setIsVoiceListening(false);
      };
      rec.onend = () => setIsVoiceListening(false);

      speechRecRef.current = rec;
      rec.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsVoiceListening(false);
    }
  };

  // Open Prescription Modal
  const openPrescriptionModal = (patient) => {
    setRxPatient(patient);
    setRxDiagnosis(patient.chief_complaint || 'Routine OPD Consultation');
    setRxClinicalNotes('');
    setRxMedicines([
      { name: '', dosage: '500 mg', frequency: '1-0-1', duration: '5 days', instructions: 'After food' }
    ]);
    setRxAdvice('Take adequate rest and drink plenty of fluids.');
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setRxFollowUpDate(getLocalDateStr(nextWeek));
    setCreatedRxSlip(null);
    setShowRxModal(true);
  };

  const addMedicineRow = () => {
    setRxMedicines(prev => [
      ...prev,
      { name: '', dosage: '', frequency: '1-0-1', duration: '5 days', instructions: 'After food' }
    ]);
  };

  const removeMedicineRow = (idx) => {
    setRxMedicines(prev => prev.filter((_, i) => i !== idx));
  };

  const updateMedicineField = (idx, field, val) => {
    setRxMedicines(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  // Save Prescription
  const handleSavePrescription = async (e) => {
    e.preventDefault();
    if (!rxPatient) return;
    try {
      setRxSaving(true);
      const validMedicines = rxMedicines.filter(m => m.name.trim() !== '');
      const res = await createPrescription({
        appointmentId: rxPatient.id,
        uhid: rxPatient.uhid,
        patientName: rxPatient.patient_name,
        doctorId: authenticatedDoctor.doctor_id,
        doctorName: authenticatedDoctor.doctor_name,
        hospitalId: authenticatedDoctor.hospital_id,
        hospitalName: authenticatedDoctor.hospital_name,
        diagnosis: rxDiagnosis,
        clinicalNotes: rxClinicalNotes,
        voiceTranscript: rxClinicalNotes,
        medicines: validMedicines,
        advice: rxAdvice,
        followUpDate: rxFollowUpDate
      });

      if (res.success) {
        setCreatedRxSlip(res.prescription);
        loadRoster();
      } else {
        alert(res.error || 'Failed to generate prescription');
      }
    } catch (err) {
      alert(err.message || 'Error saving prescription');
    } finally {
      setRxSaving(false);
    }
  };

  // Open Patient History / Records Modal
  const openPatientHistory = async (patient) => {
    try {
      setLoadingHistory(true);
      setSelectedPatientHistory({ patient, records: [], prescriptions: [] });
      setShowRecordsModal(true);
      const [recordsRes, rxRes] = await Promise.all([
        fetchPatientMedicalRecords(patient.uhid),
        fetchPatientPrescriptions(patient.uhid)
      ]);
      setSelectedPatientHistory({
        patient,
        records: recordsRes.success ? recordsRes.records : [],
        prescriptions: rxRes.success ? rxRes.prescriptions : []
      });
    } catch (err) {
      console.error('Failed to load patient history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // QR Verification Handler
  const handleVerifyQr = async (targetInput) => {
    const code = targetInput || qrInput;
    if (!code || !code.trim()) {
      setQrError('Please scan or enter a patient QR token or UHID.');
      return;
    }
    try {
      setQrVerifying(true);
      setQrError(null);
      const res = await verifyPatientQr({
        qrData: code.trim(),
        doctorId: authenticatedDoctor.doctor_id,
        hospitalId: authenticatedDoctor.hospital_id
      });
      if (res.success) {
        setQrResult(res);
      } else {
        setQrError(res.error || 'Verification failed. Unrecognized QR code.');
      }
    } catch (err) {
      setQrError(err.message || 'Error verifying QR.');
    } finally {
      setQrVerifying(false);
    }
  };

  const activeToken = queueState?.activeToken || queueState?.currentServingToken || 0;
  const currentServing = activeToken;
  const isOnDesk = queueState?.doctorStatus === 'ON_DESK';
  const isQueueComplete = queueState?.isQueueComplete || (appointments.length > 0 && appointments.every(a => a.status === 'COMPLETED' || a.status === 'NOT_PRESENT'));
  const nextWaitingToken = queueState?.nextWaitingToken || (appointments.find(a => a.status === 'WAITING' || a.status === 'CONFIRMED' || a.status === 'RE_ADDED')?.token_number);
  const nextWaitingPatient = queueState?.nextWaitingPatient || (nextWaitingToken ? appointments.find(a => a.token_number === nextWaitingToken) : null);
  const activePatient = appointments.find(a => a.token_number === activeToken && (a.status === 'IN_CONSULTATION' || activeToken > 0));

  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };


  // =========================================================================
  // VIEW 1: AUTHENTICATION GATE (LOGIN & REGISTRATION TABS)
  // =========================================================================
  if (!authenticatedDoctor) {
    return (
      <div className="scenic-auth-wrapper" style={{ backgroundImage: 'url(/images/doctor_consultation_desk.jpg)', margin: '10px auto' }}>
        <div className="scenic-auth-backdrop"></div>
        <div className="scenic-auth-card" style={{ maxWidth: authMode === 'REGISTER' ? '680px' : '480px' }}>
          {/* Top Emblem Logo (Matching Screenshot 2) */}
          <div className="scenic-auth-emblem" style={{ backgroundColor: '#ecfdf5', border: '2px solid #a7f3d0' }}>
            <img src="/logos/smartcare.svg" alt="Doctor" style={{ width: '32px', height: '32px' }} />
          </div>

          <h2 className="scenic-auth-title" style={{ color: '#047857' }}>
            {authMode === 'LOGIN' ? 'Doctor Login' : 'Doctor Registration'}
          </h2>
          <p className="scenic-auth-subtitle">
            {authMode === 'LOGIN' ? 'Access your clinical workspace & OPD queues' : 'Register with your hospital-authorized staff credentials'}
          </p>

          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '22px'
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('LOGIN'); setLoginError(null); }}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: authMode === 'LOGIN' ? '#ffffff' : 'transparent',
                color: authMode === 'LOGIN' ? '#047857' : '#64748b',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: authMode === 'LOGIN' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Doctor Chamber Login
            </button>

            <button
              type="button"
              onClick={() => { setAuthMode('REGISTER'); setRegError(null); }}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: authMode === 'REGISTER' ? '#ffffff' : 'transparent',
                color: authMode === 'REGISTER' ? '#047857' : '#64748b',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                boxShadow: authMode === 'REGISTER' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              + Register New Doctor
            </button>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* TAB 1: DOCTOR LOGIN */}
          {/* --------------------------------------------------------------- */}
          {authMode === 'LOGIN' && (
            <div>
              {loginError && (
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  color: '#b91c1c',
                  fontSize: '0.84rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleDoctorLogin}>
                {/* 1. Hospital Selection */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    1. Select Hospital Network:
                  </label>
                  <select
                    value={selectedHospitalId}
                    onChange={(e) => setSelectedHospitalId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.88rem',
                      backgroundColor: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  >
                    {hospitalOptions.map(h => (
                      <option key={h.id} value={h.id}>{h.icon} {h.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Doctor ID */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    2. Unique Doctor ID:
                  </label>
                  <input
                    type="text"
                    required
                    value={doctorIdInput}
                    onChange={(e) => setDoctorIdInput(e.target.value)}
                    placeholder="e.g. DOC-APOLLO-01 or DOC-AIIMS-XXXXX"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', display: 'block' }}>
                    Enter the unique ID assigned to your chamber desk in this hospital.
                  </span>
                </div>

                {/* 3. Password / PIN */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                    3. Security PIN / Password:
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Enter password or default (Doctor@123)"
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.88rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    width: '100%',
                    padding: '13px',
                    backgroundColor: '#064e3b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '9999px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    cursor: loginLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(6, 78, 59, 0.35)',
                    transition: 'all 0.2s ease',
                    marginTop: '8px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#047857'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#064e3b'; }}
                >
                  {loginLoading ? 'Verifying Credentials...' : 'Login'}
                </button>

                <div style={{ marginTop: '16px', fontSize: '0.84rem', color: '#64748b' }}>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setAuthMode('REGISTER')}
                    style={{ background: 'none', border: 'none', color: '#047857', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Register here
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAB 2: DOCTOR REGISTRATION & UNIQUE ID GENERATION */}
          {/* --------------------------------------------------------------- */}
          {authMode === 'REGISTER' && (
            <div>
              {regSuccessResult ? (
                <div style={{
                  backgroundColor: '#ecfdf5',
                  border: '1.5px solid #10b981',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#d1fae5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px auto'
                  }}>
                    <CheckCircle2 size={26} />
                  </div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 800, color: '#065f46' }}>
                    Doctor Registration Successful!
                  </h3>
                  <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: '#047857' }}>
                    Your official doctor schedule has been created and linked to <strong>{regSuccessResult.doctor?.hospital_name}</strong>.
                  </p>

                  <div style={{
                    backgroundColor: '#ffffff',
                    border: '2px dashed #059669',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      Your Guaranteed Unique Doctor ID
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)', letterSpacing: '0.04em' }}>
                      {regSuccessResult.doctorId}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#334155', marginTop: '4px' }}>
                      {regSuccessResult.doctor?.doctor_name} ({regSuccessResult.doctor?.qualification}) · {regSuccessResult.doctor?.department}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#0284c7', marginTop: '2px' }}>
                      Chamber: {regSuccessResult.doctor?.room_no} · Shift: {regSuccessResult.doctor?.shift_start} - {regSuccessResult.doctor?.shift_end}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '16px' }}>
                    ✨ Patients booking in the ORS portal can now select <strong>{regSuccessResult.doctor?.department}</strong> at <strong>{regSuccessResult.doctor?.hospital_name}</strong> to view your scheduled duty days and book consultation tokens.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => handleEnterChamberDirectly(regSuccessResult.doctor)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.94rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 4px rgba(5,150,105,0.2)'
                      }}
                    >
                      <Stethoscope size={18} />
                      <span>Enter Chamber Desk Directly with {regSuccessResult.doctorId} →</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('LOGIN');
                        setRegSuccessResult(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#f8fafc',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Or Proceed to Doctor Login
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleDoctorRegister}>
                  {regError && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      color: '#b91c1c',
                      fontSize: '0.84rem',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <AlertCircle size={16} />
                      <span>{regError}</span>
                    </div>
                  )}

                  {/* 1. Hospital Selection */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                      1. Associate with Hospital Network:
                    </label>
                    <select
                      value={regHospitalId}
                      onChange={(e) => {
                        setRegHospitalId(e.target.value);
                        setIdVerificationResult(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.88rem',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      {hospitalOptions.map(h => (
                        <option key={h.id} value={h.id}>{h.icon} {h.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Security Notice Banner */}
                  <div style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <ShieldCheck size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.4 }}>
                      <strong>Hospital Security Policy:</strong> Only pre-authorized medical staff registered in the hospital database can register on this portal. Enter your <strong>Hospital Unique Doctor ID</strong> to verify authorization.
                    </div>
                  </div>

                  {/* 2. Unique Doctor ID with Verification Button */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                      2. Hospital-Issued Unique Doctor ID:
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        required
                        value={regDoctorId}
                        onChange={(e) => {
                          setRegDoctorId(e.target.value);
                          setIdVerificationResult(null);
                        }}
                        placeholder="e.g. DOC-APOLLO-05, DOC-AIIMS-06, DOC-FORTIS-03"
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: idVerificationResult?.verified ? '1.5px solid #10b981' : '1px solid var(--border-light)',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          backgroundColor: idVerificationResult?.verified ? '#f0fdf4' : '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleVerifyStaffId}
                        disabled={verifyingId || !regDoctorId.trim()}
                        style={{
                          padding: '9px 16px',
                          backgroundColor: idVerificationResult?.verified ? '#059669' : 'var(--primary)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {verifyingId ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        <span>{idVerificationResult?.verified ? '✓ Verified' : 'Verify ID'}</span>
                      </button>
                    </div>

                    {idVerificationResult?.verified && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>✓ Authorized Doctor Record Found: {idVerificationResult.doctor?.doctor_name} ({idVerificationResult.doctor?.department})</span>
                      </div>
                    )}
                  </div>

                  {/* 3. Doctor Name & Qualification */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                        Doctor Full Name:
                      </label>
                      <input
                        type="text"
                        required
                        value={regDoctorName}
                        onChange={(e) => setRegDoctorName(e.target.value)}
                        placeholder="e.g. Dr. Sneha Roy"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                        Qualification:
                      </label>
                      <input
                        type="text"
                        value={regQualification}
                        onChange={(e) => setRegQualification(e.target.value)}
                        placeholder="e.g. MBBS, MD, DM"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.86rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* 3. Department & Specialty */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                        Department:
                      </label>
                      <select
                        value={regDepartment}
                        onChange={(e) => setRegDepartment(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.86rem',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        {standardDepartments.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '5px' }}>
                        {regDepartment === 'Other' ? 'Custom Department Name:' : 'Clinical Specialty:'}
                      </label>
                      {regDepartment === 'Other' ? (
                        <input
                          type="text"
                          required
                          value={customDept}
                          onChange={(e) => setCustomDept(e.target.value)}
                          placeholder="e.g. Pulmonology"
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-light)',
                            fontSize: '0.86rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={regSpecialty}
                          onChange={(e) => setRegSpecialty(e.target.value)}
                          placeholder="e.g. Preventive Cardiology"
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-light)',
                            fontSize: '0.86rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* 4. Chamber & Shift Timings */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                        Chamber / Room:
                      </label>
                      <input
                        type="text"
                        value={regRoomNo}
                        onChange={(e) => setRegRoomNo(e.target.value)}
                        placeholder="e.g. Room 204"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                        Shift Start:
                      </label>
                      <input
                        type="text"
                        value={regShiftStart}
                        onChange={(e) => setRegShiftStart(e.target.value)}
                        placeholder="09:00 AM"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                        Shift End:
                      </label>
                      <input
                        type="text"
                        value={regShiftEnd}
                        onChange={(e) => setRegShiftEnd(e.target.value)}
                        placeholder="02:00 PM"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* 5. Weekly Scheduled Duty Days */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                      Weekly Scheduled Duty Days:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {daysOfWeek.map((day) => {
                        const isChecked = regAvailableDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleRegDay(day)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-sm)',
                              border: isChecked ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                              backgroundColor: isChecked ? '#e0f2fe' : '#ffffff',
                              color: isChecked ? '#0369a1' : '#475569',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {isChecked ? '✓ ' : '+ '}{day.substring(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Patients can only book appointments on days matching your selected duty schedule.
                    </span>
                  </div>

                  {/* 6. Token Limit & Password */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                        Max Daily Tokens:
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={regMaxTokens}
                        onChange={(e) => setRegMaxTokens(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                        Security Password:
                      </label>
                      <input
                        type="text"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Doctor@123"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.84rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={regLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.92rem',
                      fontWeight: 800,
                      cursor: regLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {regLoading ? 'Registering Doctor...' : 'Register Doctor & Generate Unique Doctor ID →'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: LOGGED-IN DOCTOR CHAMBER & DUTY CONSOLE
  // =========================================================================
  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto' }}>
      {/* Real-time Patient Cancellation Alert Toast */}
      {cancelNotification && (
        <div style={{
          backgroundColor: '#fff1f2',
          border: '1.5px solid #f43f5e',
          borderRadius: 'var(--radius-md)',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#be123c',
          fontSize: '0.86rem',
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(244,63,94,0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{cancelNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setCancelNotification(null)}
            style={{ background: 'none', border: 'none', color: '#be123c', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Telemetry Header */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 22px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: '#e0f2fe',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            fontWeight: 800
          }}>
            ⚕️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {authenticatedDoctor.doctor_name}
              </h2>
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>({authenticatedDoctor.doctor_id})</span>
              {isOnDesk ? (
                <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>● ON DESK (Chamber Open)</span>
              ) : (
                <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.72rem' }}>
                  🔴 Awaiting Desk Start
                </span>
              )}
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {authenticatedDoctor.department} · {authenticatedDoctor.hospital_name} · <strong>{authenticatedDoctor.room_no}</strong> · Shift: {authenticatedDoctor.shift_start} - {authenticatedDoctor.shift_end}
            </p>
          </div>
        </div>

        {/* Desk Controls & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isOnDesk ? (
            <button
              type="button"
              onClick={handleStartSession}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Play size={15} />
              <span>Start Desk Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEndSession}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Square size={15} />
              <span>Pause / Leave Desk</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            title="Logout from Chamber Desk"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '20px',
        paddingBottom: '2px'
      }}>
        <button
          type="button"
          onClick={() => handleTabChange('CHAMBER')}
          style={{
            padding: '9px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'CHAMBER' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'CHAMBER' ? 'var(--primary)' : '#64748b',
            fontWeight: activeTab === 'CHAMBER' ? 800 : 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Stethoscope size={16} />
          <span>Live OPD Chamber Desk</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('SCHEDULE')}
          style={{
            padding: '9px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'SCHEDULE' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'SCHEDULE' ? 'var(--primary)' : '#64748b',
            fontWeight: activeTab === 'SCHEDULE' ? 800 : 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Settings size={16} />
          <span>Duty Schedule Management</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('APPOINTMENTS')}
          style={{
            padding: '9px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'APPOINTMENTS' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'APPOINTMENTS' ? 'var(--primary)' : '#64748b',
            fontWeight: activeTab === 'APPOINTMENTS' ? 800 : 600,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Calendar size={16} />
          <span>Appointed Patients & Duty Calendar</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB A: LIVE OPD CHAMBER DESK */}
      {/* ===================================================================== */}
      {activeTab === 'CHAMBER' && (
        <div>
          {/* Action Feedback Toast */}
          {actionFeedback && (
            <div style={{
              backgroundColor: actionFeedback.type === 'success' ? '#f0fdf4' : actionFeedback.type === 'warning' ? '#fffbeb' : '#fef2f2',
              border: `1.5px solid ${actionFeedback.type === 'success' ? '#86efac' : actionFeedback.type === 'warning' ? '#fde68a' : '#fecaca'}`,
              borderRadius: 'var(--radius-md)',
              padding: '12px 18px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: actionFeedback.type === 'success' ? '#15803d' : actionFeedback.type === 'warning' ? '#b45309' : '#b91c1c',
              fontSize: '0.86rem',
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {actionFeedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span>{actionFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: 'inherit' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Chamber Consultation Control Hub */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border-light)',
            padding: '24px',
            marginBottom: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {/* Case 1: Doctor OFF DESK */}
            {!isOnDesk ? (
              <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto'
                }}>
                  <Square size={24} />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-main)' }}>
                  Chamber Desk Session Paused / Off Desk
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '480px', marginInline: 'auto' }}>
                  Dr. {authenticatedDoctor.doctor_name} is currently off desk. Patients in the virtual queue see that the chamber is preparing. Click <strong>Start Desk Session</strong> above to open your consultation desk.
                </p>
                <button
                  type="button"
                  onClick={handleStartSession}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(22,163,74,0.3)'
                  }}
                >
                  <Play size={16} />
                  <span>Start Desk Session Now</span>
                </button>
              </div>
            ) : activeToken > 0 && activePatient ? (
              /* Case 2: ACTIVE CONSULTATION IN PROGRESS */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                        ● CONSULTATION IN PROGRESS
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Room: {authenticatedDoctor.room_no}
                      </span>
                    </div>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.35rem', fontWeight: 900, color: '#0f172a' }}>
                      Token #{activeToken}: {activePatient.patient_name}
                    </h3>
                  </div>

                  {/* Stopwatch */}
                  <div style={{
                    backgroundColor: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 2px 8px rgba(22,163,74,0.1)'
                  }}>
                    <Clock size={22} className="animate-pulse" style={{ color: '#16a34a' }} />
                    <div>
                      <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Consultation Stopwatch
                      </div>
                      <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#166534', fontFamily: 'monospace' }}>
                        {formatTimer(timerSeconds)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Patient Information Grid */}
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 'var(--radius-md)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '14px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Patient Details:</div>
                    <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{activePatient.patient_name}</strong>
                    <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                      {activePatient.patient_age} yrs · {activePatient.patient_gender} · {activePatient.patient_phone || 'No phone'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Unique Identification:</div>
                    <code style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0284c7' }}>{activePatient.uhid}</code>
                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '2px' }}>
                      Visit: <strong>{activePatient.appointment_type === 'FOLLOW_UP' ? 'Routine Follow-up' : 'New Consultation'}</strong>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Chief Complaint:</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b' }}>
                      {activePatient.chief_complaint || 'General Health Consultation'}
                    </div>
                  </div>
                </div>

                {/* Quick Consultation Notes */}
                <div style={{ marginTop: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                    Consultation Clinical Notes / Examination Summary (Optional):
                  </label>
                  <input
                    type="text"
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    placeholder="e.g. Chest clear, BP 120/80, prescribed 5-day antibiotics, advised rest..."
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Consultation Action Toolbar */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleCompleteConsultation(activeToken)}
                    disabled={actionLoading}
                    style={{
                      flex: '1 1 200px',
                      padding: '12px 18px',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 4px rgba(22,163,74,0.2)'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    <span>✓ Complete Consultation (Token #{activeToken})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openPrescriptionModal(activePatient)}
                    style={{
                      padding: '12px 18px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <FileText size={18} />
                    <span>📝 Digital Prescription (Voice-to-Text)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowQrModal(true); setQrInput(activePatient.uhid); setQrError(null); setQrResult(null); }}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f1f5f9',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <QrCode size={16} />
                    <span>Scan / Verify QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openPatientHistory(activePatient)}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f1f5f9',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <History size={16} />
                    <span>Medical History</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMarkNotPresent(activeToken)}
                    disabled={actionLoading}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#fff1f2',
                      color: '#be123c',
                      border: '1px solid #fecdd3',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>Mark Not Present</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Case 3: CHAMBER IDLE / READY FOR NEXT TOKEN */
              <div>
                {isQueueComplete ? (
                  /* SUBCASE 3A: ALL BOOKED PATIENTS COMPLETED FOR TODAY */
                  <div style={{ textAlign: 'center', padding: '24px 16px', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1.5px solid #86efac' }}>
                    <div style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '50%',
                      backgroundColor: '#dcfce7',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px auto'
                    }}>
                      <CheckCircle2 size={32} />
                    </div>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 900, color: '#166534' }}>
                      All Appointed Patients Completed for Today (0 Waiting)
                    </h3>
                    <p style={{ margin: '0 auto 12px auto', fontSize: '0.84rem', color: '#15803d', maxWidth: '520px' }}>
                      Dr. {authenticatedDoctor.doctor_name} has successfully consulted all scheduled patients for today ({todayDateStr}).
                      Total completed: <strong>{queueState?.totalCompleted || appointments.filter(a => a.status === 'COMPLETED').length}</strong> · Average duration: <strong>{queueState?.avgConsultationMins || 12} mins</strong>.
                    </p>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => loadRoster()}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#ffffff',
                          color: '#166534',
                          border: '1px solid #86efac',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <RefreshCw size={14} />
                        <span>Refresh Queue</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SUBCASE 3B: READY TO CALL NEXT PATIENT */
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {queueState?.lastCompletedToken > 0
                            ? `✓ Completed Consultation with Token #${queueState.lastCompletedToken}`
                            : 'Chamber Open · Standing by for First Token'}
                        </span>
                        <h3 style={{ margin: '4px 0 0 0', fontSize: '1.22rem', fontWeight: 900, color: '#0f172a' }}>
                          Ready for {nextWaitingToken ? `Token #${nextWaitingToken}` : 'Next Waiting Patient'}
                        </h3>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                          {queueState?.waitingCount || appointments.filter(a => a.status === 'WAITING' || a.status === 'CONFIRMED' || a.status === 'RE_ADDED').length} patient(s) waiting in queue · Click below to call the patient inside the chamber.
                        </p>
                      </div>

                      {nextWaitingToken && (
                        <button
                          type="button"
                          onClick={() => handleCallToken(nextWaitingToken)}
                          disabled={actionLoading}
                          style={{
                            padding: '13px 26px',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.96rem',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: '0 4px 12px rgba(2,132,199,0.25)'
                          }}
                        >
                          <UserCheck size={20} />
                          <span>📢 Call Token #{nextWaitingToken} {nextWaitingPatient?.patient_name ? `(${nextWaitingPatient.patient_name})` : ''} into Chamber →</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Today's OPD Roster Table */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-light)',
            padding: '20px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Today's OPD Patient Roster ({todayDateStr})
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Sequential queue appointments for Dr. {authenticatedDoctor.doctor_name}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-blue" style={{ fontSize: '0.74rem' }}>
                  {appointments.length} Total Booked
                </span>
                <span className="badge badge-green" style={{ fontSize: '0.74rem' }}>
                  {appointments.filter(a => a.status === 'COMPLETED').length} Completed
                </span>
                <button
                  type="button"
                  onClick={() => loadRoster()}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {loadingRoster ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <p style={{ fontSize: '0.82rem' }}>Loading today's OPD roster...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                <User size={32} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>No patients appointed yet for today.</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                  Patients booking appointments via the ORS portal will appear here in real-time.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Token</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Patient Name</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>UHID</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Type</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Queue Status</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Duration</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Chamber Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((apt) => {
                      const isCurrent = apt.status === 'IN_CONSULTATION' && apt.token_number === activeToken;
                      const isCompleted = apt.status === 'COMPLETED';
                      const isNotPresent = apt.status === 'NOT_PRESENT' || apt.presence_status === 'NOT_PRESENT';
                      const isWaiting = !isCurrent && !isCompleted && !isNotPresent;

                      return (
                        <tr
                          key={apt.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: isCurrent ? '#f0fdf4' : isNotPresent ? '#fff1f2' : '#ffffff'
                          }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 900, color: isCurrent ? '#16a34a' : isCompleted ? '#64748b' : '#0284c7' }}>
                            #{apt.token_number}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                            {apt.patient_name} ({apt.patient_age} {apt.patient_gender?.charAt(0)})
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <code>{apt.uhid}</code>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: apt.appointment_type === 'FOLLOW_UP' ? '#fef3c7' : '#e0f2fe',
                              color: apt.appointment_type === 'FOLLOW_UP' ? '#92400e' : '#0369a1',
                              fontWeight: 700
                            }}>
                              {apt.appointment_type === 'FOLLOW_UP' ? 'Follow-up' : 'New'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {isCurrent ? (
                              <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>🟢 Inside Chamber</span>
                            ) : isCompleted ? (
                              <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '0.72rem' }}>✓ Completed</span>
                            ) : isNotPresent ? (
                              <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '0.72rem' }}>⚠️ Not Present</span>
                            ) : (
                              <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>⏳ Waiting in Queue</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#475569' }}>
                            {apt.consultation_duration_mins > 0 ? (
                              <strong>{apt.consultation_duration_mins} min</strong>
                            ) : isCurrent ? (
                              <span style={{ color: '#16a34a', fontWeight: 700 }}>In progress ({formatTimer(timerSeconds)})</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              {isCurrent && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteConsultation(apt.token_number)}
                                    style={{
                                      padding: '4px 10px',
                                      backgroundColor: '#16a34a',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ✓ Complete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPrescriptionModal(apt)}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#0284c7',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Rx
                                  </button>
                                </>
                              )}

                              {isWaiting && isOnDesk && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleCallToken(apt.token_number)}
                                    disabled={activeToken > 0 || actionLoading}
                                    title={activeToken > 0 ? 'Complete current patient first' : 'Call into chamber'}
                                    style={{
                                      padding: '4px 10px',
                                      backgroundColor: activeToken > 0 ? '#cbd5e1' : '#0284c7',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      cursor: activeToken > 0 ? 'not-allowed' : 'pointer'
                                    }}
                                  >
                                    📢 Call
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMarkNotPresent(apt.token_number)}
                                    title="Mark patient not present"
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#fff1f2',
                                      color: '#be123c',
                                      border: '1px solid #fecdd3',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Absent
                                  </button>
                                </>
                              )}

                              {isNotPresent && (
                                <button
                                  type="button"
                                  onClick={() => handleReAddQueue(apt.token_number)}
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor: '#f59e0b',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <RotateCcw size={12} />
                                  <span>Re-Add</span>
                                </button>
                              )}

                              {isCompleted && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openPrescriptionModal(apt)}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#f1f5f9',
                                      color: '#0284c7',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Rx
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPatientHistory(apt)}
                                    style={{
                                      padding: '4px 8px',
                                      backgroundColor: '#f8fafc',
                                      color: '#475569',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.74rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    History
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB B: DUTY SCHEDULE MANAGEMENT */}
      {/* ===================================================================== */}
      {activeTab === 'SCHEDULE' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Doctor Duty Schedule & Chamber Configuration
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Configure your operational working days, consultation timings, and room number. Changes saved here immediately update the patient booking calendar.
            </p>
          </div>

          {scheduleSaveMsg && (
            <div style={{
              backgroundColor: scheduleSaveMsg.type === 'success' ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${scheduleSaveMsg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              color: scheduleSaveMsg.type === 'success' ? '#065f46' : '#b91c1c',
              fontSize: '0.84rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {scheduleSaveMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{scheduleSaveMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveDutySchedule}>
            {/* 1. Weekly Duty Days */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                1. Scheduled Weekly Duty Days:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {daysOfWeek.map((day) => {
                  const isChecked = editAvailableDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleEditDay(day)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: isChecked ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        backgroundColor: isChecked ? '#e0f2fe' : '#ffffff',
                        color: isChecked ? '#0369a1' : '#475569',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {isChecked ? '✓ ' : '+ '}{day}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '6px', display: 'block' }}>
                Only the selected days will be available for patients to book consultations with you.
              </span>
            </div>

            {/* 2. Shift Hours & Room No */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Shift Start Time:
                </label>
                <input
                  type="text"
                  required
                  value={editShiftStart}
                  onChange={(e) => setEditShiftStart(e.target.value)}
                  placeholder="09:00 AM"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Shift End Time:
                </label>
                <input
                  type="text"
                  required
                  value={editShiftEnd}
                  onChange={(e) => setEditShiftEnd(e.target.value)}
                  placeholder="02:00 PM"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Consultation Chamber / Room:
                </label>
                <input
                  type="text"
                  required
                  value={editRoomNo}
                  onChange={(e) => setEditRoomNo(e.target.value)}
                  placeholder="OPD Chamber 201"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* 3. Daily Token Limit & Active Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Max Daily Tokens Quota:
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={editMaxTokens}
                  onChange={(e) => setEditMaxTokens(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Duty Status:
                </label>
                <select
                  value={editIsActive ? 'ACTIVE' : 'ON_LEAVE'}
                  onChange={(e) => setEditIsActive(e.target.value === 'ACTIVE')}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="ACTIVE">● Active on Duty (Accepting Appointments)</option>
                  <option value="ON_LEAVE">⏸️ On Leave / Suspended (No Bookings)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={scheduleSaveLoading}
              style={{
                padding: '11px 24px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: scheduleSaveLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {scheduleSaveLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Saving Duty Schedule...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Duty Schedule Changes</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB C: APPOINTED PATIENTS & DUTY CALENDAR */}
      {/* ===================================================================== */}
      {activeTab === 'APPOINTMENTS' && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Appointed Patients Across Duty Schedule
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                View all patient bookings scheduled for your upcoming OPD duty shifts.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadUpcomingSchedule()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              <span>Refresh Schedule</span>
            </button>
          </div>

          {loadingUpcoming ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
              <p style={{ fontSize: '0.84rem' }}>Loading duty schedule calendar and appointments...</p>
            </div>
          ) : !upcomingSchedule || upcomingSchedule.appointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Calendar size={36} style={{ margin: '0 auto 10px auto', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>No upcoming patient appointments found.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem' }}>
                When patients book appointments for your duty dates in the ORS portal, they will be organized here.
              </p>
            </div>
          ) : (
            <div>
              {/* Date Filter Pills */}
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setUpcomingDateFilter('ALL')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: upcomingDateFilter === 'ALL' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                    backgroundColor: upcomingDateFilter === 'ALL' ? '#0284c7' : '#ffffff',
                    color: upcomingDateFilter === 'ALL' ? '#ffffff' : '#475569',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  All Dates ({upcomingSchedule.totalUpcomingAppointments})
                </button>

                {Object.keys(upcomingSchedule.groupedAppointments).map((dateKey) => {
                  const count = upcomingSchedule.groupedAppointments[dateKey].length;
                  const isSelected = upcomingDateFilter === dateKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setUpcomingDateFilter(dateKey)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: isSelected ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? '#0284c7' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      {dateKey} ({count} pts)
                    </button>
                  );
                })}
              </div>

              {/* Appointed Patients Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Date</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Token</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Patient Name</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>UHID</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Contact</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Type</th>
                      <th style={{ padding: '10px 12px', fontWeight: 800 }}>Chief Complaint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingSchedule.appointments
                      .filter(apt => upcomingDateFilter === 'ALL' || apt.appointment_date === upcomingDateFilter)
                      .map((apt) => (
                        <tr key={apt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#334155' }}>
                            {apt.appointment_date} ({apt.appointment_day?.substring(0, 3)})
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 900, color: '#0284c7' }}>
                            #{apt.token_number}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                            {apt.patient_name} ({apt.patient_age} {apt.patient_gender?.charAt(0)})
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <code>{apt.uhid}</code>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#64748b' }}>
                            {apt.patient_phone}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: apt.appointment_type === 'FOLLOW_UP' ? '#fef3c7' : '#e0f2fe',
                              color: apt.appointment_type === 'FOLLOW_UP' ? '#92400e' : '#0369a1',
                              fontWeight: 700
                            }}>
                              {apt.appointment_type === 'FOLLOW_UP' ? 'Follow-up' : 'New'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569', fontSize: '0.8rem' }}>
                            {apt.chief_complaint || 'Routine General Consultation'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: DIGITAL PRESCRIPTION (VOICE-TO-TEXT & STRUCTURED MEDICINES) */}
      {/* ===================================================================== */}
      {showRxModal && rxPatient && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {createdRxSlip ? (
              /* Prescription Generated Slip View */
              <div>
                <div style={{ textAlign: 'center', padding: '10px 0 20px 0', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)' }}>
                    {authenticatedDoctor.hospital_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Digital Outpatient Consultation & Prescription Slip
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 800, marginTop: '4px' }}>
                    Prescription ID: {createdRxSlip.prescription_id} · Generated: {new Date().toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
                  <div>
                    <div>Patient: <strong>{createdRxSlip.patient_name}</strong></div>
                    <div>UHID: <code>{createdRxSlip.uhid}</code></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>Doctor: <strong>Dr. {createdRxSlip.doctor_name}</strong></div>
                    <div>Dept: <strong>{authenticatedDoctor.department}</strong> ({authenticatedDoctor.room_no})</div>
                  </div>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369a1' }}>Diagnosis:</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '2px' }}>{createdRxSlip.diagnosis || 'General OPD Consultation'}</div>
                </div>

                {createdRxSlip.clinical_notes && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>Clinical Notes / Examination:</div>
                    <div style={{ fontSize: '0.82rem', color: '#334155', backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginTop: '2px' }}>
                      {createdRxSlip.clinical_notes}
                    </div>
                  </div>
                )}

                {createdRxSlip.medicines && createdRxSlip.medicines.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369a1', marginBottom: '6px' }}>
                      Prescribed Medications (Rx):
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Medicine</th>
                          <th style={{ padding: '6px 8px' }}>Dosage</th>
                          <th style={{ padding: '6px 8px' }}>Frequency</th>
                          <th style={{ padding: '6px 8px' }}>Duration</th>
                          <th style={{ padding: '6px 8px' }}>Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {createdRxSlip.medicines.map((m, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 700 }}>{m.name}</td>
                            <td style={{ padding: '6px 8px' }}>{m.dosage}</td>
                            <td style={{ padding: '6px 8px' }}>{m.frequency}</td>
                            <td style={{ padding: '6px 8px' }}>{m.duration}</td>
                            <td style={{ padding: '6px 8px', color: '#059669' }}>{m.instructions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {createdRxSlip.advice && (
                  <div style={{ marginTop: '14px', fontSize: '0.82rem' }}>
                    <strong>General Advice:</strong> {createdRxSlip.advice}
                  </div>
                )}

                {createdRxSlip.follow_up_date && (
                  <div style={{ marginTop: '6px', fontSize: '0.82rem', color: '#b45309' }}>
                    <strong>Next Follow-up Date:</strong> {createdRxSlip.follow_up_date}
                  </div>
                )}

                <div style={{ marginTop: '24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      padding: '9px 16px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Printer size={16} />
                    <span>Print Slip</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowRxModal(false); setCreatedRxSlip(null); }}
                    style={{
                      padding: '9px 18px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer'
                    }}
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            ) : (
              /* Prescription Creation Form */
              <form onSubmit={handleSavePrescription}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      Create Digital Prescription (Rx)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRxModal(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Patient Header Banner */}
                <div style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: '0.82rem'
                }}>
                  <div>
                    Patient: <strong>{rxPatient.patient_name}</strong> ({rxPatient.patient_age} yrs · {rxPatient.patient_gender})
                  </div>
                  <div>
                    UHID: <code style={{ fontWeight: 800, color: '#0284c7' }}>{rxPatient.uhid}</code>
                  </div>
                  <div>
                    Token: <strong>#{rxPatient.token_number}</strong>
                  </div>
                </div>

                {/* Voice-to-Text Assistant Card */}
                <div style={{
                  backgroundColor: isVoiceListening ? '#fef2f2' : '#f8fafc',
                  border: `1.5px solid ${isVoiceListening ? '#f87171' : '#cbd5e1'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.2s ease'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 800, color: isVoiceListening ? '#dc2626' : '#1e293b' }}>
                      <Mic size={16} className={isVoiceListening ? 'animate-pulse' : ''} />
                      <span>{isVoiceListening ? 'Listening Live to Doctor Voice...' : 'AI Voice-to-Text Clinical Dictation'}</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                      {isVoiceListening ? 'Speak clinical observations, symptoms, or instructions — text will stream into Clinical Notes below.' : 'Click to start voice dictation (Web Speech API). You can also type or edit notes manually.'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: isVoiceListening ? '#dc2626' : '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isVoiceListening ? <MicOff size={14} /> : <Mic size={14} />}
                    <span>{isVoiceListening ? 'Stop Listening' : 'Start Voice Input'}</span>
                  </button>
                </div>

                {/* Diagnosis */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    Clinical Diagnosis:
                  </label>
                  <input
                    type="text"
                    required
                    value={rxDiagnosis}
                    onChange={(e) => setRxDiagnosis(e.target.value)}
                    placeholder="e.g. Acute Viral Bronchitis, Essential Hypertension"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.86rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Clinical Notes (Voice transcript + manual typing) */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    Clinical Notes, Symptoms & Examination (Manual Typing or Voice):
                  </label>
                  <textarea
                    rows={3}
                    value={rxClinicalNotes}
                    onChange={(e) => setRxClinicalNotes(e.target.value)}
                    placeholder="Type or speak symptoms, vital signs, physical exam findings..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: isVoiceListening ? '1.5px solid #f87171' : '1px solid var(--border-light)',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Structured Medicines Table */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                      Prescribed Medications (Rx):
                    </label>
                    <button
                      type="button"
                      onClick={addMedicineRow}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#f1f5f9',
                        color: 'var(--primary)',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={12} />
                      <span>Add Medicine</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {rxMedicines.map((med, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr 36px', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Drug Name (e.g. Paracetamol)"
                          value={med.name}
                          onChange={(e) => updateMedicineField(idx, 'name', e.target.value)}
                          style={{ padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Dosage (500mg)"
                          value={med.dosage}
                          onChange={(e) => updateMedicineField(idx, 'dosage', e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Freq (1-0-1)"
                          value={med.frequency}
                          onChange={(e) => updateMedicineField(idx, 'frequency', e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Duration (5d)"
                          value={med.duration}
                          onChange={(e) => updateMedicineField(idx, 'duration', e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Instructions (After meals)"
                          value={med.instructions}
                          onChange={(e) => updateMedicineField(idx, 'instructions', e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeMedicineRow(idx)}
                          disabled={rxMedicines.length === 1}
                          style={{
                            padding: '7px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: rxMedicines.length === 1 ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advice & Follow-Up */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                      Advice & Dietary Guidelines:
                    </label>
                    <input
                      type="text"
                      value={rxAdvice}
                      onChange={(e) => setRxAdvice(e.target.value)}
                      placeholder="e.g. Avoid cold drinks, steam inhalation twice daily..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                      Next Follow-up Date:
                    </label>
                    <input
                      type="date"
                      value={rxFollowUpDate}
                      onChange={(e) => setRxFollowUpDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.84rem', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowRxModal(false)}
                    style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rxSaving}
                    style={{
                      padding: '10px 22px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: rxSaving ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {rxSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                    <span>Issue Digital Prescription →</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: PATIENT QR CODE SCANNER & IDENTITY VERIFICATION */}
      {/* ===================================================================== */}
      {showQrModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={20} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Patient QR Identity Scanner & History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowQrModal(false); setQrResult(null); setQrError(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: '#64748b' }}>
              Verify patient registration or appointment slip QR code. Opaque cryptographic tokens ensure patient privacy while enabling authorized doctor verification.
            </p>

            {qrError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: '#b91c1c', fontSize: '0.82rem', marginBottom: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span>{qrError}</span>
              </div>
            )}

            {/* Quick One-Click Verification Chips */}
            {appointments.length > 0 && (
              <div style={{ marginBottom: '14px', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700, marginBottom: '6px' }}>
                  ⚡ Quick Test Scans (Appointed Patients on Today's Roster):
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {appointments.slice(0, 5).map(apt => (
                    <button
                      key={apt.id}
                      type="button"
                      onClick={() => {
                        setQrInput(apt.uhid);
                        handleVerifyQr(apt.uhid);
                      }}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#e0f2fe',
                        border: '1px solid #7dd3fc',
                        borderRadius: '14px',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        color: '#0369a1',
                        cursor: 'pointer'
                      }}
                    >
                      #{apt.token_number} {apt.patient_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px' }}>
                Scan Barcode / Camera Input or Enter UHID / QR Token:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="e.g. UHID-2026-44205 or paste scanned QR token"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.86rem' }}
                />
                <button
                  type="button"
                  onClick={() => handleVerifyQr(qrInput)}
                  disabled={qrVerifying}
                  style={{
                    padding: '9px 16px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: qrVerifying ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {qrVerifying ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Verify</span>
                </button>
              </div>
            </div>

            {/* Verification Result Dossier */}
            {qrResult && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 'var(--radius-md)', padding: '16px', marginTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 800, fontSize: '0.92rem', marginBottom: '8px' }}>
                  <CheckCircle2 size={18} />
                  <span>{qrResult.message}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem', color: '#1e293b', marginTop: '8px' }}>
                  <div>Name: <strong>{qrResult.patient?.fullName || qrResult.patient?.name}</strong></div>
                  <div>UHID: <code>{qrResult.patient?.uhid}</code></div>
                  <div>Gender: <strong>{qrResult.patient?.gender || 'Not specified'}</strong></div>
                  <div>Phone: <strong>{qrResult.patient?.phone || qrResult.patient?.mobile}</strong></div>
                  <div>Age: <strong>{qrResult.patient?.age || 'N/A'} yrs</strong></div>
                  <div>Address: <strong>{qrResult.patient?.address || 'Registered Profile'}</strong></div>
                </div>

                {qrResult.todayAppointment ? (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0', fontSize: '0.8rem' }}>
                    <div style={{ color: '#0369a1', fontWeight: 800 }}>Today's Appointment with Dr. {authenticatedDoctor.doctor_name}:</div>
                    <div>Token Number: <strong style={{ color: '#0284c7' }}>#{qrResult.todayAppointment.token_number}</strong> · Status: <strong>{qrResult.todayAppointment.status}</strong></div>
                    <div>Chief Complaint: {qrResult.todayAppointment.chief_complaint || 'Routine General Consultation'}</div>
                  </div>
                ) : qrResult.recentAppointment ? (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid #fed7aa', fontSize: '0.8rem' }}>
                    <div style={{ color: '#c2410c', fontWeight: 800 }}>Associated Appointment with Dr. {authenticatedDoctor.doctor_name}:</div>
                    <div>Date: <strong>{qrResult.recentAppointment.appointment_date}</strong> · Token: <strong style={{ color: '#0284c7' }}>#{qrResult.recentAppointment.token_number}</strong> · Status: <strong>{qrResult.recentAppointment.status}</strong></div>
                    <div>Chief Complaint: {qrResult.recentAppointment.chief_complaint || 'Routine General Consultation'}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: '12px', padding: '8px 10px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b' }}>
                    No active appointment found with Dr. {authenticatedDoctor.doctor_name} for today. Patient identity verified in hospital system.
                  </div>
                )}

                <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#475569' }}>
                  📋 Authorized Records: <strong>{qrResult.medicalRecords?.length || 0}</strong> notes · <strong>{qrResult.prescriptions?.length || 0}</strong> digital prescriptions.
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {qrResult.todayAppointment && qrResult.todayAppointment.token_number && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCallToken(qrResult.todayAppointment.token_number);
                        setShowQrModal(false);
                      }}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Call Token #{qrResult.todayAppointment.token_number} into Chamber
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      openPatientHistory(qrResult.todayAppointment || { uhid: qrResult.patient?.uhid, patient_name: qrResult.patient?.fullName || qrResult.patient?.name });
                      setShowQrModal(false);
                    }}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    View Medical History & Rx ({qrResult.medicalRecords?.length || 0})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: PATIENT MEDICAL RECORDS & CONSULTATION HISTORY */}
      {/* ===================================================================== */}
      {showRecordsModal && selectedPatientHistory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Authorized Medical History & Prescriptions
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  {selectedPatientHistory.patient?.patient_name} · <code>{selectedPatientHistory.patient?.uhid}</code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecordsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <p style={{ fontSize: '0.82rem' }}>Fetching authorized records for UHID...</p>
              </div>
            ) : (
              <div>
                {/* Prescriptions */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0369a1' }}>
                    Prescriptions ({selectedPatientHistory.prescriptions?.length || 0})
                  </h4>
                  {selectedPatientHistory.prescriptions?.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>No previous prescriptions found for this patient.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedPatientHistory.prescriptions?.map((rx) => (
                        <div key={rx.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                            <span style={{ color: '#0284c7' }}>#{rx.prescription_id}</span>
                            <span style={{ color: '#64748b' }}>{new Date(rx.created_at).toLocaleDateString()}</span>
                          </div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 700, marginTop: '2px' }}>
                            Diagnosis: {rx.diagnosis || 'General Consultation'}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '2px' }}>
                            By Dr. {rx.doctor_name} ({rx.hospital_name})
                          </div>
                          {rx.medicines && rx.medicines.length > 0 && (
                            <div style={{ fontSize: '0.76rem', color: '#059669', marginTop: '4px' }}>
                              Medicines: {rx.medicines.map(m => m.name).filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Medical Records */}
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 800, color: '#0369a1' }}>
                    Clinical Notes & Medical Records ({selectedPatientHistory.records?.length || 0})
                  </h4>
                  {selectedPatientHistory.records?.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>No medical records logged yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedPatientHistory.records?.map((rec) => (
                        <div key={rec.id} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                            <strong>{rec.title}</strong>
                            <span style={{ color: '#64748b' }}>{new Date(rec.created_at).toLocaleDateString()}</span>
                          </div>
                          {rec.description && (
                            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px' }}>
                              {rec.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

