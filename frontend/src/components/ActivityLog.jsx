import React from 'react';
import { History, Clock, CheckCircle2, ShieldAlert, Edit3 } from 'lucide-react';

export default function ActivityLog({ logs, hospitalName, dbName }) {
  const getBadge = (category) => {
    switch (category) {
      case 'ADMIN_REGISTERED':
        return <span className="badge badge-teal">1-Time Registration</span>;
      case 'ADMIN_LOGIN':
        return <span className="badge badge-blue">Admin Login</span>;
      case 'BED_UPDATE':
        return <span className="badge badge-green">Bed Inventory Sync</span>;
      case 'DOCTOR_UPDATE':
        return <span className="badge badge-amber">Doctor Roster Sync</span>;
      default:
        return <span className="badge badge-blue">{category}</span>;
    }
  };

  return (
    <div className="card-glass" style={{
      padding: '24px',
      backgroundColor: '#ffffff',
      border: '1.5px solid var(--border-light)',
      borderRadius: 'var(--radius-lg)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-soft)',
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <History size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
              Real-Time Database Activity Logs
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Live audit events committed to <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{dbName}</code>
            </p>
          </div>
        </div>

        <span className="badge badge-teal" style={{ fontSize: '0.75rem' }}>
          Live Synchronized
        </span>
      </div>

      {logs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '24px',
          color: 'var(--text-dim)',
          fontSize: '0.85rem'
        }}>
          No recent activity logs recorded in this hospital database yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-surface-soft)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getBadge(log.category)}
                  <strong style={{ color: 'var(--text-main)' }}>{log.admin_name}</strong>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {log.description}
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.74rem',
                color: 'var(--text-dim)',
                whiteSpace: 'nowrap',
                marginLeft: '12px'
              }}>
                <Clock size={12} />
                <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
