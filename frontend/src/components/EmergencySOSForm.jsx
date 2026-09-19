import React, { useState, useEffect } from 'react';
import { AlertOctagon, MapPin, Compass, Stethoscope, Bed, Phone, User, Activity, RefreshCw, ShieldAlert, CheckCircle2, ChevronRight } from 'lucide-react';
import { fetchNearbyHospitals, submitEmergencyRequest } from '../services/api';
import LocationPickerMap from './LocationPickerMap';

export default function EmergencySOSForm({ user, onEmergencyTriggered, onLogout }) {
  const [patientName, setPatientName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [symptoms, setSymptoms] = useState('');

  // Emergency Patient's live location state - auto-detected from patient device GPS
  const [coords, setCoords] = useState({ lat: 28.6139, lng: 77.2090 });
  const [patientAddress, setPatientAddress] = useState('');

  // Ranked 4 hospitals preview
  const [nearbyHospitals, setNearbyHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadNearbyHospitals = async (lat, lng) => {
    try {
      setLoadingHospitals(true);
      const res = await fetchNearbyHospitals({ lat, lng });
      if (res.success) {
        setNearbyHospitals(res.rankedHospitals);
      }
    } catch (err) {
      console.error('Failed to load nearby hospitals:', err.message);
    } finally {
      setLoadingHospitals(false);
    }
  };

  const handleSOSTrigger = async (e) => {
    e.preventDefault();
    if (!symptoms.trim()) {
      setErrorMessage('Please describe the emergency disease or symptoms.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const res = await submitEmergencyRequest({
        userId: user.id,
        patientName,
        phone,
        symptoms,
        lat: coords.lat,
        lng: coords.lng,
        address: patientAddress
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to dispatch emergency SOS.');
        setSubmitting(false);
        return;
      }

      onEmergencyTriggered(res.request);
    } catch (err) {
      setErrorMessage(err.message || 'Error communicating with emergency dispatch system.');
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: '50px' }}>
      {/* Patient Profile Bar */}
      <div className="card-glass" style={{
        padding: '14px 20px',
        backgroundColor: '#ffffff',
        border: '1.5px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700
          }}>
            {user.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Verified: {user.phone} · {user.email}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '0.78rem' }}
        >
          Patient Logout
        </button>
      </div>

      {/* Main Emergency SOS Form Card */}
      <div className="card-glass" style={{
        padding: '28px',
        backgroundColor: '#ffffff',
        border: '2px solid #fecdd3',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#fee2e2',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <AlertOctagon size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Emergency Patient Intake & SOS Dispatch
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Real-time multi-hospital ranking (beds, doctors, ambulances) with 2-minute sequential routing
            </p>
          </div>
        </div>

        {errorMessage && (
          <div style={{
            backgroundColor: 'var(--danger-light)',
            color: 'var(--danger)',
            padding: '11px 14px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '16px',
            fontSize: '0.86rem',
            fontWeight: 600
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSOSTrigger}>
          {/* Patient Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Patient Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                  style={{ paddingLeft: '38px' }}
                />
                <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contact Phone Number</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  style={{ paddingLeft: '38px' }}
                />
                <Phone size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
              </div>
            </div>
          </div>

          {/* Disease / Symptoms Field */}
          <div className="form-group">
            <label className="form-label">
              <span>Emergency Disease / Symptoms / Condition</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Crucial for triage & doctor allocation</span>
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="e.g. Acute chest pain, breathing difficulty, dizziness, unconsciousness, vehicle accident trauma..."
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              required
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Rapido-Style Real-Time Interactive Geolocation & Landmark Picker */}
          <div style={{ marginBottom: '22px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--text-main)', fontSize: '0.90rem' }}>
                <MapPin size={17} style={{ color: 'var(--danger)' }} />
                Emergency Patient's Real-Time Location (Device GPS & Interactive Map)
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                Detects patient location · Hospitals routed from patient spot
              </span>
            </label>
            <LocationPickerMap
              initialCoords={coords}
              onLocationChange={({ lat, lng, address }) => {
                setCoords({ lat, lng });
                setPatientAddress(address);
                loadNearbyHospitals(lat, lng);
              }}
            />
          </div>

          {/* Target First Response Hospital Notice */}
          {nearbyHospitals.length > 0 && (
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1.5px solid #86efac',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                  🎯 Queue Position #1 (Will Receive Dispatch First)
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#14532d' }}>
                  {nearbyHospitals[0].name} ({nearbyHospitals[0].distanceKm} km from patient)
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#15803d', textAlign: 'right' }}>
                First in queue · Calculated from emergency patient location
              </div>
            </div>
          )}

          {/* 4 Nearest Hospitals Queue Preview */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>
                System-Ranked 4 Nearest Hospitals in Queue:
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Ranked by Distance · Beds · Doctors · Ambulances
              </span>
            </div>

            {loadingHospitals ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                <RefreshCw size={18} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} />
                Fetching real-time hospital capacities from dedicated databases...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {nearbyHospitals.map((h, idx) => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      backgroundColor: idx === 0 ? '#f0fdf4' : '#ffffff',
                      border: idx === 0 ? '1.5px solid #86efac' : '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.84rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: idx === 0 ? '#16a34a' : 'var(--bg-surface-soft)',
                        color: idx === 0 ? '#ffffff' : 'var(--text-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.75rem'
                      }}>
                        #{idx + 1}
                      </span>
                      <div>
                        <strong style={{ color: 'var(--text-main)' }}>{h.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {h.address.slice(0, 48)}...
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span className="badge badge-blue">
                        {h.distanceKm} km from patient
                      </span>
                      <span className="badge badge-teal" title="Live Beds Available">
                        <Bed size={12} /> {h.beds.availableBeds} beds
                      </span>
                      <span className="badge badge-green" title="On-duty Doctors Available">
                        <Stethoscope size={12} /> {h.doctors.availableDoctors} docs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SUBMIT EMERGENCY BUTTON */}
          <button
            type="submit"
            disabled={submitting || nearbyHospitals.length === 0}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              fontSize: '1.05rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 16px rgba(220, 38, 38, 0.4)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; }}
          >
            {submitting ? (
              <>
                <RefreshCw size={22} className="animate-spin" />
                <span>Initiating Sequential Hospital Routing...</span>
              </>
            ) : (
              <>
                <AlertOctagon size={22} />
                <span>🚨 TRIGGER EMERGENCY SOS (START 2-MIN SEQUENTIAL ROUTING)</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
