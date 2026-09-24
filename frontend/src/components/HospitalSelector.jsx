import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, CheckCircle2, AlertCircle, ShieldCheck, MapPin, Phone } from 'lucide-react';

export default function HospitalSelector({ hospitals, selectedHospital, onSelectHospital, loading }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '720px', margin: '0 auto' }} ref={dropdownRef}>
      <label style={{
        display: 'block',
        fontSize: '0.9rem',
        fontWeight: 700,
        color: 'var(--text-main)',
        marginBottom: '8px',
        letterSpacing: '0.01em'
      }}>
        Select Hospital to Manage:
      </label>

      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          backgroundColor: '#ffffff',
          border: isOpen ? '2px solid var(--primary)' : '1.5px solid var(--border-light)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: isOpen ? '0 0 0 4px var(--primary-glow)' : 'var(--shadow-md)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: selectedHospital ? 'var(--primary-light)' : 'var(--bg-surface-soft)',
            color: selectedHospital ? 'var(--primary)' : 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            border: selectedHospital ? '1.5px solid rgba(2, 132, 199, 0.25)' : '1px solid var(--border-light)'
          }}>
            {selectedHospital ? (
              <img 
                src={`/logos/${selectedHospital.id}.svg`} 
                alt={selectedHospital.name} 
                style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <Building2 size={24} />
            )}
          </div>

          <div>
            <div style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: selectedHospital ? 'var(--text-main)' : 'var(--text-dim)'
            }}>
              {selectedHospital ? selectedHospital.name : 'Click here to select a registered hospital...'}
            </div>
            <div style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {selectedHospital ? (
                <>
                  <MapPin size={13} style={{ flexShrink: 0, color: 'var(--primary)' }} />
                  <span>{selectedHospital.address}</span>
                </>
              ) : (
                <span>5 Hospitals registered in decentralized database</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedHospital && (
            <span className={`badge ${selectedHospital.isRegistered ? 'badge-teal' : 'badge-amber'}`}>
              {selectedHospital.isRegistered ? (
                <>
                  <CheckCircle2 size={13} />
                  <span>Registered</span>
                </>
              ) : (
                <>
                  <AlertCircle size={13} />
                  <span>1-Time Reg Pending</span>
                </>
              )}
            </span>
          )}
          <ChevronDown
            size={20}
            style={{
              color: 'var(--text-muted)',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="animate-slide-down card-glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            border: '1.5px solid var(--border-light)',
            overflow: 'hidden',
            maxHeight: '420px',
            overflowY: 'auto'
          }}
        >
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-surface-soft)',
            borderBottom: '1px solid var(--border-light)',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>Hospitals Present in Database ({hospitals.length})</span>
            <span>Admin Allotment Status</span>
          </div>

          <div style={{ padding: '6px' }}>
            {hospitals.map((h) => {
              const isCurrent = selectedHospital?.id === h.id;
              return (
                <div
                  key={h.id}
                  onClick={() => {
                    onSelectHospital(h);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    backgroundColor: isCurrent ? 'var(--primary-light)' : 'transparent',
                    border: isCurrent ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid transparent',
                    marginBottom: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--bg-surface-soft)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: isCurrent ? 'var(--primary-light)' : '#ffffff',
                      color: isCurrent ? 'var(--primary)' : 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      flexShrink: 0,
                      overflow: 'hidden',
                      border: '1px solid var(--border-light)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      <img 
                        src={`/logos/${h.id}.svg`} 
                        alt={h.name} 
                        style={{ width: '34px', height: '34px', objectFit: 'contain' }}
                        onError={(e) => { 
                          e.currentTarget.style.display = 'none'; 
                          e.currentTarget.parentElement.innerText = h.name.charAt(0);
                        }}
                      />
                    </div>

                    <div>
                      <div style={{
                        fontSize: '0.96rem',
                        fontWeight: 700,
                        color: isCurrent ? 'var(--primary-hover)' : 'var(--text-main)'
                      }}>
                        {h.name}
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <MapPin size={12} style={{ color: 'var(--primary)' }} />
                        <span>{h.address}</span>
                      </div>
                      <div style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-dim)',
                        marginTop: '3px'
                      }}>
                        Hospital Admin: <strong>{h.adminName}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span className={`badge ${h.isRegistered ? 'badge-teal' : 'badge-amber'}`}>
                      {h.isRegistered ? (
                        <>
                          <CheckCircle2 size={12} />
                          <span>Registered</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={12} />
                          <span>1-Time Reg Pending</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
