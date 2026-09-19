import React, { useRef } from 'react';
import { Printer, Calendar, Clock, MapPin, User, FileText, CheckCircle2, ShieldCheck, ArrowRight, Stethoscope } from 'lucide-react';

export default function OrsAppointmentSlip({ appointmentData, onTrackQueue, onBookAnother }) {
  const slipRef = useRef(null);
  const apt = appointmentData?.appointment || appointmentData;
  const patient = appointmentData?.patient || {};
  const doctor = appointmentData?.doctor || {};

  const handlePrint = () => {
    window.print();
  };

  if (!apt) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        <p>No appointment details available to display.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* Action Bar (Not visible in print) */}
      <div className="no-print" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 'var(--radius-md)',
        padding: '14px 20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle2 size={24} style={{ color: '#16a34a' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#15803d' }}>
              OPD Appointment Successfully Confirmed
            </h4>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#166534' }}>
              Your permanent UHID and Virtual Queue Token have been registered in the hospital roster.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--text-main)'
            }}
          >
            <Printer size={16} />
            <span>Print OPD Slip</span>
          </button>

          {onTrackQueue && (
            <button
              type="button"
              onClick={() => onTrackQueue(apt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <span>Track Virtual Queue</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Official Printable ORS OPD Slip Card */}
      <div
        ref={slipRef}
        style={{
          backgroundColor: '#ffffff',
          border: '2px solid #0284c7',
          borderRadius: 'var(--radius-lg)',
          padding: '28px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        {/* Header - Authentic Government ORS Header */}
        <div style={{
          borderBottom: '2px dashed #cbd5e1',
          paddingBottom: '20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#f0f9ff',
              border: '2px solid #0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
              fontWeight: 900,
              fontSize: '1.4rem'
            }}>
              ⚕️
            </div>
            <div>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em', color: '#0369a1', textTransform: 'uppercase' }}>
                Online Registration System (ORS) · National Portal
              </span>
              <h2 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                {apt.hospital_name || doctor.hospital_name || 'Participating Hospital'}
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Official Outpatient Department (OPD) Consultation Slip
              </p>
            </div>
          </div>

          {/* Token Box */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '2px solid #0284c7',
            borderRadius: 'var(--radius-md)',
            padding: '10px 18px',
            textAlign: 'center',
            minWidth: '130px'
          }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Virtual Token No.
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0284c7', lineHeight: 1.1 }}>
              #{apt.token_number}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#059669' }}>
              CONFIRMED
            </span>
          </div>
        </div>

        {/* Essential Details Grid (Only What Patient Needs to See) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          backgroundColor: '#f8fafc',
          padding: '18px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px'
        }}>
          {/* Patient Details */}
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Permanent Health ID (UHID)
            </span>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
              {apt.uhid || patient.id}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
              {apt.patient_name || patient.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Age/Gender: {apt.patient_age || patient.age} Yrs / {apt.patient_gender || patient.gender}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Mobile: {apt.patient_phone || patient.mobile}
            </div>
          </div>

          {/* Doctor & Consultation Details */}
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Doctor / Department
            </span>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
              {apt.doctor_name || doctor.doctor_name}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0284c7' }}>
              {apt.department || doctor.department}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.78rem', color: '#334155' }}>
              <strong>Room / Counter:</strong> {apt.room_no || doctor.room_no || 'OPD Room 101'}
            </div>
          </div>

          {/* Appointment Schedule */}
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Consultation Schedule
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
              <Calendar size={15} style={{ color: '#0284c7' }} />
              <span>{apt.appointment_date} ({apt.appointment_day})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
              <Clock size={15} style={{ color: '#0284c7' }} />
              <span>Slot: {apt.time_slot}</span>
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#64748b' }}>
              Booking Ref: <strong>{apt.id}</strong>
            </div>
          </div>
        </div>

        {/* Live Virtual Queue Sitting-at-Home Notice */}
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px',
          marginBottom: '20px'
        }}>
          <h5 style={{ margin: '0 0 6px 0', fontSize: '0.86rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} />
            Sitting-at-Home Virtual Queue Facility
          </h5>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#1e3a8a', lineHeight: 1.45 }}>
            You do <strong>not</strong> need to stand in physical hospital queues. On the morning of your consultation (or the night before), your token is active in the live queue tracker. You can monitor the doctor's currently serving token live from home and arrive when 2 tokens remain before yours.
          </p>
        </div>

        {/* Patient Instructions (Clear & Minimal) */}
        <div style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: '16px',
          fontSize: '0.74rem',
          color: '#64748b',
          lineHeight: 1.5
        }}>
          <strong>Important Instructions:</strong>
          <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
            <li>Please show this digital OPD slip or SMS confirmation at the OPD reception counter if requested.</li>
            <li>Carry a valid Government photo ID proof and past medical records/prescriptions if applicable.</li>
            <li>Consultation tokens are called in sequential order. Check your live position on the SmartCare Virtual Queue monitor.</li>
          </ul>
        </div>

        {/* Barcode representation */}
        <div style={{
          marginTop: '20px',
          paddingTop: '14px',
          borderTop: '1px dashed #cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{
            letterSpacing: '5px',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: '1rem',
            color: '#334155'
          }}>
            ||||| | |||| ||| ||||||| | ||||| {apt.id}
          </div>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            Generated by SmartCare ORS Engine · {new Date().toLocaleDateString('en-IN')}
          </span>
        </div>
      </div>

      {onBookAnother && (
        <div className="no-print" style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={onBookAnother}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            ← Book Another Appointment
          </button>
        </div>
      )}
    </div>
  );
}
