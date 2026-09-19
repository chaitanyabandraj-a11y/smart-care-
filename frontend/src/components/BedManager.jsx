import React, { useState, useEffect } from 'react';
import { Bed, HeartPulse, Wind, Plus, Minus, Save, Check, RefreshCw } from 'lucide-react';
import { updateBeds } from '../services/api';

export default function BedManager({ hospitalId, adminName, bedsData, onUpdateSuccess }) {
  const [beds, setBeds] = useState(bedsData);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setBeds(bedsData);
  }, [bedsData]);

  const handleChange = (field, delta) => {
    setBeds((prev) => {
      const currentVal = Number(prev[field]) || 0;
      const newVal = Math.max(0, currentVal + delta);
      const updated = { ...prev, [field]: newVal };

      // Keep available beds in sync with subcategories if adjusted
      if (['icuAvailable', 'oxygenAvailable', 'generalAvailable'].includes(field)) {
        const icu = field === 'icuAvailable' ? newVal : (Number(prev.icuAvailable) || 0);
        const oxy = field === 'oxygenAvailable' ? newVal : (Number(prev.oxygenAvailable) || 0);
        const gen = field === 'generalAvailable' ? newVal : (Number(prev.generalAvailable) || 0);
        updated.availableBeds = icu + oxy + gen;
      }

      if (['icuTotal', 'oxygenTotal', 'generalTotal'].includes(field)) {
        const icu = field === 'icuTotal' ? newVal : (Number(prev.icuTotal) || 0);
        const oxy = field === 'oxygenTotal' ? newVal : (Number(prev.oxygenTotal) || 0);
        const gen = field === 'generalTotal' ? newVal : (Number(prev.generalTotal) || 0);
        updated.totalBeds = icu + oxy + gen;
      }

      return updated;
    });
  };

  const handleDirectInput = (field, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setBeds((prev) => {
      const updated = { ...prev, [field]: num };
      if (['icuAvailable', 'oxygenAvailable', 'generalAvailable'].includes(field)) {
        const icu = field === 'icuAvailable' ? num : (Number(prev.icuAvailable) || 0);
        const oxy = field === 'oxygenAvailable' ? num : (Number(prev.oxygenAvailable) || 0);
        const gen = field === 'generalAvailable' ? num : (Number(prev.generalAvailable) || 0);
        updated.availableBeds = icu + oxy + gen;
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await updateBeds(hospitalId, adminName, beds);
      if (res.success) {
        setSavedSuccess(true);
        if (onUpdateSuccess) onUpdateSuccess(res.beds);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    } catch (err) {
      alert('Error updating beds: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const occupancyRate = beds.totalBeds > 0
    ? Math.round(((beds.totalBeds - beds.availableBeds) / beds.totalBeds) * 100)
    : 0;

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
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bed size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Bed Availability Management
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Adjustable live inventory stored directly in {hospitalId}.db
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

      {/* Overall Occupancy Bar */}
      <div style={{
        backgroundColor: 'var(--bg-surface-soft)',
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        marginBottom: '22px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.88rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Total Hospital Bed Capacity:</span>
          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
            {beds.availableBeds} Available / {beds.totalBeds} Total ({100 - occupancyRate}% Vacancy)
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '10px',
          backgroundColor: '#e2e8f0',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(100, occupancyRate)}%`,
            height: '100%',
            backgroundColor: occupancyRate > 85 ? 'var(--danger)' : occupancyRate > 65 ? 'var(--warning)' : 'var(--success)',
            borderRadius: 'var(--radius-full)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Subcategory Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {/* ICU Beds */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <HeartPulse size={18} style={{ color: 'var(--danger)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>ICU Beds</span>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Available
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('icuAvailable', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.icuAvailable}
                onChange={(e) => handleDirectInput('icuAvailable', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('icuAvailable', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Capacity
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('icuTotal', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.icuTotal}
                onChange={(e) => handleDirectInput('icuTotal', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('icuTotal', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Oxygen Beds */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Wind size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>Oxygen Beds</span>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Available
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('oxygenAvailable', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.oxygenAvailable}
                onChange={(e) => handleDirectInput('oxygenAvailable', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('oxygenAvailable', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Capacity
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('oxygenTotal', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.oxygenTotal}
                onChange={(e) => handleDirectInput('oxygenTotal', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('oxygenTotal', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* General Beds */}
        <div style={{
          padding: '16px',
          border: '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Bed size={18} style={{ color: 'var(--secondary)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>General Beds</span>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Available
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('generalAvailable', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.generalAvailable}
                onChange={(e) => handleDirectInput('generalAvailable', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('generalAvailable', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Capacity
            </span>
            <div className="counter-box" style={{ marginTop: '4px' }}>
              <button type="button" className="counter-btn" onClick={() => handleChange('generalTotal', -1)}>
                <Minus size={14} />
              </button>
              <input
                type="number"
                className="counter-value"
                value={beds.generalTotal}
                onChange={(e) => handleDirectInput('generalTotal', e.target.value)}
              />
              <button type="button" className="counter-btn" onClick={() => handleChange('generalTotal', 1)}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
