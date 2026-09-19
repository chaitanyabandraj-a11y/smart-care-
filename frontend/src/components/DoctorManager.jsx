import React, { useState, useEffect } from 'react';
import { UserCheck, Stethoscope, AlertTriangle, Plus, Minus, Save, Check, RefreshCw } from 'lucide-react';
import { updateDoctors } from '../services/api';

export default function DoctorManager({ hospitalId, adminName, doctorsData, onUpdateSuccess }) {
  const [doctors, setDoctors] = useState(doctorsData);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setDoctors(doctorsData);
  }, [doctorsData]);

  const handleChange = (field, delta) => {
    setDoctors((prev) => {
      const currentVal = Number(prev[field]) || 0;
      const newVal = Math.max(0, currentVal + delta);
      const updated = { ...prev, [field]: newVal };

      // Keep available doctors synced if duty counts adjusted
      if (['emergencyDuty', 'opdDuty'].includes(field)) {
        const emerg = field === 'emergencyDuty' ? newVal : (Number(prev.emergencyDuty) || 0);
        const opd = field === 'opdDuty' ? newVal : (Number(prev.opdDuty) || 0);
        updated.availableDoctors = emerg + opd;
      }

      return updated;
    });
  };

  const handleDirectInput = (field, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setDoctors((prev) => {
      const updated = { ...prev, [field]: num };
      if (['emergencyDuty', 'opdDuty'].includes(field)) {
        const emerg = field === 'emergencyDuty' ? num : (Number(prev.emergencyDuty) || 0);
        const opd = field === 'opdDuty' ? num : (Number(prev.opdDuty) || 0);
        updated.availableDoctors = emerg + opd;
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await updateDoctors(hospitalId, adminName, doctors);
      if (res.success) {
        setSavedSuccess(true);
        if (onUpdateSuccess) onUpdateSuccess(res.doctors);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    } catch (err) {
      alert('Error updating doctors: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-glass" style={{
      padding: '24px',
      backgroundColor: '#ffffff',
      border: '1.5px solid var(--border-light)',
      borderRadius: 'var(--radius-lg)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '14px',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--secondary-light)',
            color: 'var(--secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Stethoscope size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Doctor Availability & Duty Roster
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Real-time on-duty medical staff active in {hospitalId}.db
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`btn ${savedSuccess ? 'btn-teal' : 'btn-primary'}`}
          style={{ padding: '8px 18px', fontSize: '0.86rem' }}
        >
          {saving ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Saving to DB...</span>
            </>
          ) : savedSuccess ? (
            <>
              <Check size={16} />
              <span>Synced in Real Time!</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      {/* Grid of Doctor Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {/* Total Registered Doctors */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserCheck size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Total Doctors</span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Hospital Roster
            </span>
            <div className="counter-box" style={{ marginTop: '6px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('totalDoctors', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={doctors.totalDoctors}
                onChange={(e) => handleDirectInput('totalDoctors', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('totalDoctors', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Active Doctors Available */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Stethoscope size={18} style={{ color: 'var(--success)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Available Doctors</span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Currently On Duty
            </span>
            <div className="counter-box" style={{ marginTop: '6px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('availableDoctors', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={doctors.availableDoctors}
                onChange={(e) => handleDirectInput('availableDoctors', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('availableDoctors', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Emergency Duty */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Emergency Duty</span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              ER Specialists
            </span>
            <div className="counter-box" style={{ marginTop: '6px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('emergencyDuty', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={doctors.emergencyDuty}
                onChange={(e) => handleDirectInput('emergencyDuty', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('emergencyDuty', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* OPD Duty */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserCheck size={18} style={{ color: 'var(--secondary)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>OPD Duty</span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Consultation Clinics
            </span>
            <div className="counter-box" style={{ marginTop: '6px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('opdDuty', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={doctors.opdDuty}
                onChange={(e) => handleDirectInput('opdDuty', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('opdDuty', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
