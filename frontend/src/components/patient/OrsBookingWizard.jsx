import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Building2, Phone, ShieldCheck, Stethoscope, Calendar, Clock,
  User, CheckCircle2, ArrowRight, ArrowLeft, RefreshCw, AlertCircle, FileText
} from 'lucide-react';
import {
  fetchOpdHospitals,
  logOpdInteraction,
  sendOpdOtp,
  verifyOpdOtp,
  registerOpdPatient,
  fetchOpdDepartments,
  fetchOpdDoctors,
  fetchOpdDoctorAvailability,
  bookOpdAppointment
} from '../../services/api';
import OrsAppointmentSlip from './OrsAppointmentSlip';

export default function OrsBookingWizard({ activePatient: initialPatient = null, onBookingComplete, onTrackQueue }) {
  // Session ID for persistence across the booking journey
  const [sessionId] = useState(() => 'ses_' + Math.random().toString(36).substring(2, 10));

  // Current Step (1 to 5)
  const [currentStep, setCurrentStep] = useState(1);
  const [activePatient, setActivePatient] = useState(initialPatient);
  const [appointmentType, setAppointmentType] = useState('NEW'); // 'NEW' | 'FOLLOW_UP'

  useEffect(() => {
    if (initialPatient) {
      setActivePatient(initialPatient);
    }
  }, [initialPatient]);

  // --- Step 1: Hospital Selection ---
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [loadingHospitals, setLoadingHospitals] = useState(true);

  // --- Step 2: Patient Verification & UHID ---
  const [mobile, setMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [serverOtpHint, setServerOtpHint] = useState(null);

  // Demographic Form (if new patient)
  const [patientForm, setPatientForm] = useState({
    name: '',
    gender: 'Male',
    age: '',
    guardianName: '',
    state: 'Delhi',
    address: ''
  });

  // --- Step 3: Department & Doctor Selection ---
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // --- Step 4: Date & Slot Selection ---
  const [doctorAvailability, setDoctorAvailability] = useState(null);
  const [selectedDateObj, setSelectedDateObj] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [duplicateBookingAlert, setDuplicateBookingAlert] = useState(null);

  // --- Step 5: Confirmed Booking & Slip ---
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load Hospitals on mount
  useEffect(() => {
    async function loadHospitals() {
      try {
        setLoadingHospitals(true);
        const res = await fetchOpdHospitals();
        if (res.success) {
          setHospitals(res.hospitals || []);
        }
      } catch (err) {
        setErrorMsg('Failed to load participating hospitals.');
      } finally {
        setLoadingHospitals(false);
      }
    }
    loadHospitals();
  }, []);

  const socketRef = useRef(null);

  // Live real-time synchronisation for Doctor Desk status, schedules, and freed slots
  useEffect(() => {
    if (!selectedHospital) return;

    const socket = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_opd_hospital', { hospitalId: selectedHospital.id });
    });

    // Real-time doctor desk status updates (Doctor starts/ends desk session)
    socket.on('opd:doctor_status_changed', (data) => {
      setDoctors(prevDocs =>
        prevDocs.map(doc => {
          if (doc.doctor_id === data.doctorId) {
            return {
              ...doc,
              isCurrentlyOnDesk: data.isCurrentlyOnDesk,
              deskStatus: data.doctorStatus
            };
          }
          return doc;
        })
      );
    });

    // Real-time doctor schedule updates (Duty days or shift hours changed in portal)
    socket.on('opd:doctor_schedule_updated', (data) => {
      setDoctors(prevDocs =>
        prevDocs.map(doc => (doc.doctor_id === data.doctorId ? { ...doc, ...data.doctor } : doc))
      );
      if (selectedDoctor && selectedDoctor.doctor_id === data.doctorId) {
        fetchOpdDoctorAvailability(data.doctorId, activePatient?.id).then(availRes => {
          if (availRes.success) {
            setDoctorAvailability(availRes.availability);
          }
        });
      }
    });

    // Real-time appointment cancellation updates (frees booking slots immediately)
    socket.on('opd:appointment_cancelled', (data) => {
      if (selectedDoctor && selectedDoctor.doctor_id === data.doctorId) {
        fetchOpdDoctorAvailability(selectedDoctor.doctor_id, activePatient?.id).then(availRes => {
          if (availRes.success) {
            setDoctorAvailability(availRes.availability);
          }
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave_opd_hospital', { hospitalId: selectedHospital.id });
        socketRef.current.disconnect();
      }
    };
  }, [selectedHospital, selectedDoctor, activePatient]);

  // Handler: Select Hospital (Step 1 -> Step 2)
  const handleSelectHospital = (hosp) => {
    setSelectedHospital(hosp);
    setErrorMsg(null);

    // Click persistence
    logOpdInteraction({
      sessionId,
      stepName: 'STEP1_HOSPITAL_SELECTED',
      actionData: { hospitalId: hosp.id, hospitalName: hosp.name },
      mobile: activePatient?.mobile || null,
      uhid: activePatient?.id || null
    });

    if (activePatient) {
      loadDepartmentsAndProceed(hosp.id, activePatient);
    } else {
      setCurrentStep(2);
    }
  };

  // Handler: Send OTP (Step 2)
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!mobile || mobile.trim().length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    try {
      setErrorMsg(null);
      const res = await sendOpdOtp({ sessionId, mobile: mobile.trim() });
      if (res.success) {
        setOtpSent(true);
        setServerOtpHint(res.otpCode); // Provided for seamless demo/testing
      } else {
        setErrorMsg(res.error || 'Failed to send OTP.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error requesting OTP.');
    }
  };

  // Handler: Verify OTP (Step 2)
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg('Please enter a 6-digit OTP.');
      return;
    }

    try {
      setErrorMsg(null);
      const res = await verifyOpdOtp({ sessionId, otpCode: otpCode.trim() });
      if (res.success) {
        setOtpVerified(true);
        if (res.hasExistingProfile && res.patient) {
          setActivePatient(res.patient);
          // If already registered, load departments and proceed to step 3
          loadDepartmentsAndProceed(selectedHospital.id, res.patient);
        }
      } else {
        setErrorMsg(res.error || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error verifying OTP.');
    }
  };

  // Handler: Register New Patient (Step 2)
  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    if (!patientForm.name.trim()) {
      setErrorMsg('Patient Name is required.');
      return;
    }

    try {
      setErrorMsg(null);
      const res = await registerOpdPatient({
        sessionId,
        patientData: {
          ...patientForm,
          mobile: mobile.trim()
        }
      });

      if (res.success) {
        setActivePatient(res.patient);
        loadDepartmentsAndProceed(selectedHospital.id, res.patient);
      } else {
        setErrorMsg(res.error || 'Registration failed.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error registering patient.');
    }
  };

  // Helper to load departments and advance to Step 3
  const loadDepartmentsAndProceed = async (hospId, patient) => {
    try {
      const deptRes = await fetchOpdDepartments(hospId);
      if (deptRes.success) {
        setDepartments(deptRes.departments || []);
      }
      logOpdInteraction({
        sessionId,
        stepName: 'STEP2_PATIENT_AUTHENTICATED',
        actionData: { uhid: patient.id, name: patient.name },
        mobile: patient.mobile,
        uhid: patient.id
      });
      setCurrentStep(3);
    } catch (err) {
      setErrorMsg('Failed to load hospital departments.');
    }
  };

  // Handler: Select Department & Load Doctors (Step 3)
  const handleSelectDepartment = async (dept) => {
    setSelectedDept(dept);
    setSelectedDoctor(null);
    setErrorMsg(null);

    logOpdInteraction({
      sessionId,
      stepName: 'STEP3_DEPARTMENT_SELECTED',
      actionData: { department: dept },
      mobile: activePatient?.mobile,
      uhid: activePatient?.id
    });

    try {
      setLoadingDoctors(true);
      const docRes = await fetchOpdDoctors(selectedHospital.id, dept);
      if (docRes.success) {
        setDoctors(docRes.doctors || []);
      }
    } catch (err) {
      setErrorMsg('Failed to load doctors for department.');
    } finally {
      setLoadingDoctors(false);
    }
  };

  // Handler: Select Doctor & Load Schedule Availability (Step 3 -> Step 4)
  const handleSelectDoctor = async (doc) => {
    setSelectedDoctor(doc);
    setErrorMsg(null);
    setDuplicateBookingAlert(null);

    logOpdInteraction({
      sessionId,
      stepName: 'STEP3_DOCTOR_SELECTED',
      actionData: { doctorId: doc.doctor_id, doctorName: doc.doctor_name },
      mobile: activePatient?.mobile,
      uhid: activePatient?.id
    });

    try {
      setLoadingAvailability(true);
      const availRes = await fetchOpdDoctorAvailability(doc.doctor_id, activePatient?.id);
      if (availRes.success) {
        setDoctorAvailability(availRes.availability);
        // Default to first available date
        const firstAvailable = availRes.availability.schedule.find(s => s.isAvailable);
        if (firstAvailable) {
          setSelectedDateObj(firstAvailable);
          setSelectedSlot(firstAvailable.slots[0] || '10:00 AM - 10:15 AM');
          if (firstAvailable.patientAlreadyBooked) {
            setDuplicateBookingAlert(firstAvailable.existingAppointment);
          }
        }
      }
      setCurrentStep(4);
    } catch (err) {
      setErrorMsg('Failed to load doctor schedule availability.');
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Handler: Confirm & Book Appointment (Step 4 -> Step 5)
  const handleConfirmBooking = async () => {
    if (!selectedDateObj) {
      setErrorMsg('Please select an appointment date.');
      return;
    }

    if (selectedDateObj.patientAlreadyBooked) {
      setDuplicateBookingAlert(selectedDateObj.existingAppointment);
      setErrorMsg(`You already booked your appointment with Dr. ${selectedDoctor?.doctor_name} for this date (${selectedDateObj.date}). Token #${selectedDateObj.existingAppointment?.token_number} is already assigned to you.`);
      return;
    }

    try {
      setBookingLoading(true);
      setErrorMsg(null);

      const bookingPayload = {
        uhid: activePatient.id,
        hospitalId: selectedHospital.id,
        doctorId: selectedDoctor.doctor_id,
        appointmentDate: selectedDateObj.date,
        timeSlot: `${selectedDoctor.shift_start} - ${selectedDoctor.shift_end}`,
        appointmentType: appointmentType || 'NEW',
        chiefComplaint: chiefComplaint.trim() || (appointmentType === 'FOLLOW_UP' ? 'Routine Follow-up Visit' : 'General OPD Consultation'),
        sessionId
      };

      const res = await bookOpdAppointment(bookingPayload);
      if (res.success) {
        setBookingResult(res);
        setDuplicateBookingAlert(null);
        setCurrentStep(5);
        if (onBookingComplete) onBookingComplete(res);
      } else {
        if (res.duplicate) {
          setDuplicateBookingAlert(res.existingAppointment);
        }
        setErrorMsg(res.error || 'Failed to confirm booking.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error completing OPD booking.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto' }}>
      {/* Official ORS Emblem / Portal Banner */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 24px',
        marginBottom: '20px',
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
            backgroundColor: '#f0f9ff',
            border: '2px solid #0284c7',
            color: '#0284c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.3rem',
            fontWeight: 900
          }}>
            🏛️
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0369a1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Ministry of Health & Family Welfare · Government of India Model
            </div>
            <h2 style={{ margin: '2px 0 0 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Online Registration System (ORS) · Patient OPD Portal
            </h2>
          </div>
        </div>

        <span className="badge badge-blue" style={{ fontSize: '0.76rem', padding: '6px 12px' }}>
          Virtual Queue Enabled · Zero Corridor Waiting
        </span>
      </div>

      {/* 5-Step Stepper Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-light)',
        padding: '12px 18px',
        marginBottom: '24px',
        overflowX: 'auto',
        gap: '8px'
      }}>
        {[
          { num: 1, title: '1. Hospital' },
          { num: 2, title: '2. Patient UHID' },
          { num: 3, title: '3. Dept & Doctor' },
          { num: 4, title: '4. Date & Slot' },
          { num: 5, title: '5. OPD Slip' }
        ].map((s) => {
          const isActive = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <div
              key={s.num}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isActive ? '#e0f2fe' : 'transparent',
                color: isActive ? '#0284c7' : isDone ? '#16a34a' : '#94a3b8',
                fontWeight: isActive ? 800 : 600,
                fontSize: '0.82rem',
                whiteSpace: 'nowrap'
              }}
            >
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: isActive ? '#0284c7' : isDone ? '#16a34a' : '#e2e8f0',
                color: isActive || isDone ? '#ffffff' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 700
              }}>
                {isDone ? '✓' : s.num}
              </div>
              <span>{s.title}</span>
            </div>
          );
        })}
      </div>

      {/* Error Alert if any */}
      {errorMsg && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          color: '#b91c1c',
          fontSize: '0.84rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px'
        }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 1: HOSPITAL SELECTION */}
      {/* ========================================================= */}
      {currentStep === 1 && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Select Hospital for Outpatient Consultation
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Select from the recognized hospitals participating in the SmartCare National ORS Network.
          </p>

          {loadingHospitals ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '10px' }} />
              <p style={{ fontSize: '0.86rem' }}>Loading hospital directory...</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {hospitals.map((hosp) => (
                <div
                  key={hosp.id}
                  onClick={() => handleSelectHospital(hosp)}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#0284c7';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {hosp.name}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {hosp.address}
                      </p>
                    </div>
                    <span className="badge badge-green" style={{ fontSize: '0.68rem', flexShrink: 0 }}>
                      OPD Active
                    </span>
                  </div>

                  <div style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px dashed #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.74rem',
                    color: 'var(--text-dim)'
                  }}>
                    <span>Timings: {hosp.opdTimings}</span>
                    <span style={{ color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Select →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 2: PATIENT MOBILE VERIFICATION & UHID */}
      {/* ========================================================= */}
      {currentStep === 2 && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Step 2: Patient Mobile Verification & UHID Registration
            </h3>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <ArrowLeft size={14} /> Back to Hospital
            </button>
          </div>

          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            color: 'var(--text-muted)'
          }}>
            Selected Hospital: <strong style={{ color: 'var(--text-main)' }}>{selectedHospital?.name}</strong>
          </div>

          {!otpVerified ? (
            <div style={{ maxWidth: '440px' }}>
              <form onSubmit={!otpSent ? handleSendOtp : handleVerifyOtp}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Patient 10-digit Mobile Number
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    disabled={otpSent}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 9876543210"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--border-light)',
                      fontSize: '0.95rem',
                      letterSpacing: '1px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {otpSent && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Enter 6-digit OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 123456"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--border-light)',
                        fontSize: '1rem',
                        letterSpacing: '4px',
                        textAlign: 'center',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {serverOtpHint && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#0284c7' }}>
                        Auto-generated Demo OTP: <strong>{serverOtpHint}</strong>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {!otpSent ? 'Send Verification OTP' : 'Verify Mobile & Continue'}
                </button>
              </form>
            </div>
          ) : (
            /* Demographic form for new patient */
            <div>
              <div style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                marginBottom: '20px',
                color: '#166534',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={18} />
                <span>Mobile number <strong>{mobile}</strong> verified! Please provide patient demographic details for permanent UHID generation.</span>
              </div>

              <form onSubmit={handleRegisterPatient}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                      Patient Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={patientForm.name}
                      onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                      placeholder="As per Government ID (Aadhaar/Voter)"
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

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                      Gender *
                    </label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.86rem',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                      Age (Years) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      required
                      value={patientForm.age}
                      onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                      placeholder="e.g. 35"
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

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                      State / UT
                    </label>
                    <input
                      type="text"
                      value={patientForm.state}
                      onChange={(e) => setPatientForm({ ...patientForm, state: e.target.value })}
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
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    backgroundColor: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Generate Permanent UHID & Continue →
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 3: DEPARTMENT & DOCTOR SELECTION */}
      {/* ========================================================= */}
      {currentStep === 3 && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Step 3: Select Clinical Department & Specialist Doctor
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Patient: <strong>{activePatient?.name}</strong> (UHID: {activePatient?.id})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
          </div>

          {/* Visit Type Selector */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
              1. Consultation Category:
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setAppointmentType('NEW')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: appointmentType === 'NEW' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                  backgroundColor: appointmentType === 'NEW' ? '#e0f2fe' : '#ffffff',
                  color: appointmentType === 'NEW' ? '#0369a1' : 'var(--text-main)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                ● New OPD Consultation
              </button>

              <button
                type="button"
                onClick={() => setAppointmentType('FOLLOW_UP')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: appointmentType === 'FOLLOW_UP' ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                  backgroundColor: appointmentType === 'FOLLOW_UP' ? '#e0f2fe' : '#ffffff',
                  color: appointmentType === 'FOLLOW_UP' ? '#0369a1' : 'var(--text-main)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                ● Routine Follow-up Visit
              </button>
            </div>
          </div>

          {/* Department Pills */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
              2. Choose Specialty Department:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {departments.map((dept) => {
                const isSelected = selectedDept === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleSelectDepartment(dept)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      border: isSelected ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#0284c7' : '#f8fafc',
                      color: isSelected ? '#ffffff' : 'var(--text-main)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {dept}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Doctor Cards */}
          {selectedDept && (
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                2. Select Consulting Specialist Doctor in {selectedDept}:
              </label>

              {loadingDoctors ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '8px' }} />
                  <p style={{ fontSize: '0.84rem' }}>Loading department specialists...</p>
                </div>
              ) : doctors.length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No doctors currently listed for {selectedDept}.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  {doctors.map((doc) => (
                    <div
                      key={doc.doctor_id}
                      onClick={() => handleSelectDoctor(doc)}
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#0284c7';
                        e.currentTarget.style.backgroundColor = '#f0f9ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0';
                        e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          backgroundColor: '#e0f2fe',
                          color: '#0284c7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Stethoscope size={18} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-main)' }}>
                              {doc.doctor_name}
                            </h4>
                            {doc.isCurrentlyOnDesk ? (
                              <span style={{
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #86efac',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
                                ON DESK NOW (Chamber Open)
                              </span>
                            ) : (
                              <span style={{
                                backgroundColor: '#f1f5f9',
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '12px'
                              }}>
                                Chamber Off Desk
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                            {doc.qualification}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: '10px', fontSize: '0.76rem', color: '#475569' }}>
                        <strong>Chamber:</strong> {doc.room_no} · <strong>Shift:</strong> {doc.shift_start} - {doc.shift_end}
                      </div>

                      <div style={{ marginTop: '4px', fontSize: '0.74rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🗓️</span>
                        <span><strong>Scheduled Duty:</strong> {doc.availableDays && doc.availableDays.length > 0 ? doc.availableDays.map(d => d.substring(0, 3)).join(', ') : 'Monday - Friday'}</span>
                      </div>

                      <div style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px dashed #cbd5e1',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.72rem'
                      }}>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>
                          Max {doc.max_daily_tokens} Tokens/Day
                        </span>
                        <span style={{ color: '#0284c7', fontWeight: 700 }}>
                          Check Slots →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 4: DATE & SLOT SELECTION */}
      {/* ========================================================= */}
      {currentStep === 4 && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Step 4: Select Consultation Date & Time Slot
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Doctor: <strong>{selectedDoctor?.doctor_name}</strong> ({selectedDoctor?.department} · {selectedDoctor?.room_no}) · <strong>Scheduled Duty:</strong> {selectedDoctor?.availableDays && selectedDoctor?.availableDays.length > 0 ? selectedDoctor?.availableDays.join(', ') : 'All Week'} ({selectedDoctor?.shift_start} - {selectedDoctor?.shift_end})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
          </div>

          {loadingAvailability ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '10px' }} />
              <p style={{ fontSize: '0.86rem' }}>Checking OPD calendar and available tokens...</p>
            </div>
          ) : (
            <div>
              {/* Date Selector Row */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
                  1. Select Consultation Date:
                </label>
                <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {doctorAvailability?.schedule.map((day) => {
                    const isSelected = selectedDateObj?.date === day.date;
                    const isPatientBooked = day.patientAlreadyBooked;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        disabled={!day.isAvailable && !isPatientBooked}
                        onClick={() => {
                          setSelectedDateObj(day);
                          if (isPatientBooked) {
                            setDuplicateBookingAlert(day.existingAppointment);
                          } else {
                            setDuplicateBookingAlert(null);
                          }
                          if (day.slots && day.slots.length > 0) {
                            setSelectedSlot(day.slots[0]);
                          }
                          logOpdInteraction({
                            sessionId,
                            stepName: 'STEP4_DATE_SELECTED',
                            actionData: { date: day.date, day: day.day, alreadyBooked: isPatientBooked },
                            mobile: activePatient?.mobile,
                            uhid: activePatient?.id
                          });
                        }}
                        style={{
                          minWidth: '115px',
                          padding: '12px 10px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected
                            ? (isPatientBooked ? '2px solid #f59e0b' : '2px solid #0284c7')
                            : (isPatientBooked ? '1.5px solid #fcd34d' : '1px solid #e2e8f0'),
                          backgroundColor: isSelected
                            ? (isPatientBooked ? '#fef3c7' : '#e0f2fe')
                            : (isPatientBooked ? '#fffbeb' : (day.isAvailable ? '#f8fafc' : '#f1f5f9')),
                          cursor: (day.isAvailable || isPatientBooked) ? 'pointer' : 'not-allowed',
                          opacity: (day.isAvailable || isPatientBooked) ? 1 : 0.5,
                          textAlign: 'center',
                          flexShrink: 0,
                          position: 'relative'
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isPatientBooked ? '#b45309' : 'var(--text-muted)' }}>
                          {day.day.substring(0, 3)} {day.isToday ? '· Today' : ''}
                        </div>
                        <div style={{ fontSize: '0.94rem', fontWeight: 800, color: isSelected ? (isPatientBooked ? '#b45309' : '#0284c7') : 'var(--text-main)' }}>
                          {day.date.split('-')[2]}/{day.date.split('-')[1]}
                        </div>
                        {isPatientBooked ? (
                          <div style={{ fontSize: '0.66rem', marginTop: '4px', color: '#b45309', fontWeight: 800, backgroundColor: '#fef3c7', padding: '2px 4px', borderRadius: '4px' }}>
                            ✓ Token #{day.existingAppointment?.token_number}
                          </div>
                        ) : !day.isDutyDay ? (
                          <div style={{ fontSize: '0.66rem', marginTop: '4px', color: '#94a3b8', fontStyle: 'italic', fontWeight: 600 }}>
                            Off Duty
                          </div>
                        ) : day.isAvailable ? (
                          <div style={{ fontSize: '0.68rem', marginTop: '4px', color: '#16a34a', fontWeight: 700 }}>
                            {day.remainingTokens} left
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.68rem', marginTop: '4px', color: '#ef4444', fontWeight: 700 }}>
                            Full
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DUPLICATE APPOINTMENT PREVENTION CARD */}
              {(selectedDateObj?.patientAlreadyBooked || duplicateBookingAlert) ? (
                <div style={{
                  backgroundColor: '#fffbeb',
                  border: '2px solid #f59e0b',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px 20px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 10px rgba(245, 158, 11, 0.12)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: '#fef3c7',
                      color: '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <AlertCircle size={26} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Duplicate Booking Prevention · Fair Queue Access
                      </div>
                      <h3 style={{ margin: '3px 0 6px 0', fontSize: '1.18rem', fontWeight: 900, color: '#92400e' }}>
                        You already booked your appointment
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.86rem', color: '#78350f', lineHeight: 1.5 }}>
                        You already have an active appointment scheduled with <strong>Dr. {selectedDoctor?.doctor_name}</strong> for <strong>{selectedDateObj?.date} ({selectedDateObj?.day})</strong>.
                      </p>

                      <div style={{
                        marginTop: '12px',
                        padding: '12px 16px',
                        backgroundColor: '#ffffff',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px dashed #fde68a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Appointment Reference:</div>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                            {selectedDateObj?.existingAppointment?.id || duplicateBookingAlert?.id}
                          </strong>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                            Chamber: {selectedDoctor?.room_no} · Shift: {selectedDoctor?.shift_start} - {selectedDoctor?.shift_end}
                          </div>
                        </div>

                        <div style={{
                          backgroundColor: '#fef3c7',
                          border: '1px solid #f59e0b',
                          borderRadius: 'var(--radius-sm)',
                          padding: '6px 14px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                            Your Confirmed Token
                          </div>
                          <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#d97706' }}>
                            #{selectedDateObj?.existingAppointment?.token_number || duplicateBookingAlert?.token_number}
                          </span>
                        </div>
                      </div>

                      <div style={{
                        marginTop: '12px',
                        fontSize: '0.78rem',
                        color: '#92400e',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span>🛡️</span>
                        <span><em>This consultation slot is preserved for another patient. Duplicate token numbers cannot be re-issued for the same doctor on the same date.</em></span>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setBookingResult({
                              appointment: selectedDateObj?.existingAppointment || duplicateBookingAlert,
                              patient: activePatient,
                              doctor: selectedDoctor
                            });
                            setCurrentStep(5);
                          }}
                          style={{
                            padding: '9px 18px',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <FileText size={16} />
                          View My Existing Appointment Slip
                        </button>

                        {onTrackQueue && (
                          <button
                            type="button"
                            onClick={() => onTrackQueue(selectedDateObj?.existingAppointment || duplicateBookingAlert)}
                            style={{
                              padding: '9px 18px',
                              backgroundColor: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.84rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            Track Live Virtual Queue →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Doctor OPD Shift & Sequential Token Allocation Notice */
                selectedDateObj && selectedDateObj.isAvailable && (
                  <div style={{
                    backgroundColor: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                        Daily OPD Consultation Shift
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                        {selectedDoctor?.shift_start} - {selectedDoctor?.shift_end}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Sequential First-Come First-Served Virtual Queue (No pre-fixed time slots)
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: '#e0f2fe',
                      border: '1.5px solid #7dd3fc',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 16px',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                        Your Token Allocation
                      </span>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0284c7' }}>
                        #{selectedDateObj.bookedCount + 1}
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Chief Complaint (Optional) - only if not already booked */}
              {!(selectedDateObj?.patientAlreadyBooked || duplicateBookingAlert) && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Reason for Visit / Chief Complaint (Optional):
                  </label>
                  <input
                    type="text"
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="e.g. Chest discomfort, Follow-up, Routine health checkup"
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
              )}

              {/* Token Distribution Policy Notice */}
              <div style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: '0.78rem',
                color: '#1e40af',
                lineHeight: 1.45
              }}>
                ℹ️ <strong>Official Queue Notice:</strong> Virtual Queue Token numbers are systematically assigned upon confirmation. On the morning of your consultation (or the night before), your token is active in the live queue tracker so you can monitor the doctor's room live from home.
              </div>

              {/* Confirm Booking Button or Duplicate Alert Button */}
              {selectedDateObj?.patientAlreadyBooked || duplicateBookingAlert ? (
                <button
                  type="button"
                  disabled={true}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: '#fde68a',
                    color: '#92400e',
                    border: '1.5px solid #f59e0b',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertCircle size={18} />
                  You Already Booked this Appointment (Token #{selectedDateObj?.existingAppointment?.token_number || duplicateBookingAlert?.token_number}) — Slot Saved
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmBooking}
                  disabled={bookingLoading || !selectedDateObj || !selectedDateObj.isAvailable}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.94rem',
                    fontWeight: 800,
                    cursor: (bookingLoading || !selectedDateObj?.isAvailable) ? 'not-allowed' : 'pointer',
                    opacity: (bookingLoading || !selectedDateObj?.isAvailable) ? 0.7 : 1
                  }}
                >
                  {bookingLoading ? 'Registering OPD Appointment...' : 'Confirm Appointment & Generate Virtual Queue Token'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* STEP 5: CONFIRMATION & OFFICIAL OPD SLIP */}
      {/* ========================================================= */}
      {currentStep === 5 && bookingResult && (
        <OrsAppointmentSlip
          appointmentData={bookingResult}
          onTrackQueue={(apt) => {
            if (onTrackQueue) onTrackQueue(apt);
          }}
          onBookAnother={() => {
            setCurrentStep(1);
            setSelectedDept('');
            setSelectedDoctor(null);
            setSelectedDateObj(null);
            setBookingResult(null);
          }}
        />
      )}
    </div>
  );
}
