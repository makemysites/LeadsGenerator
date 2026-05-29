'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/types';
import { SPECIALTY_COLORS } from '@/lib/scraper/constants';
import { useToast } from '@/components/ui/Toast';

export default function RejectedPage() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitingLeadIds, setExitingLeadIds] = useState<string[]>([]);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Fetch rejected leads
  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/leads?status=rejected');
        if (!res.ok) throw new Error('Failed to fetch leads');
        const data = await res.json();
        setLeads(data);
      } catch (err) {
        showToast('Failed to load rejected leads', 'error');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeads();
  }, [showToast]);

  // Copy phone
  function copyPhone(phone: string) {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      showToast('Phone number copied!', 'success');
    });
  }

  // Restore lead
  async function restoreLead(leadId: string) {
    setExitingLeadIds((prev) => [...prev, leadId]);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'to_call' }),
      });

      if (!res.ok) throw new Error('Failed to restore lead');

      setTimeout(() => {
        setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
        setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
        showToast('Lead restored to To Call pipeline', 'success');
      }, 300);
    } catch (err) {
      console.error(err);
      showToast('Failed to restore lead', 'error');
      setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
    }
  }

  // Auto-save notes
  async function saveNotes(leadId: string, notes: string) {
    setSavingNotesId(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) throw new Error('Failed to save notes');
      showToast('Notes auto-saved', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save notes', 'error');
    } finally {
      setSavingNotesId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Rejected Leads</h1>
        <p className="page-subtitle">
          These doctors have been skipped. You can restore any lead back to the pipeline at any time.
        </p>
      </div>

      <div className="card" style={{ background: '#FFF1F2', border: '1px solid #FFE4E6', color: '#9F1239', padding: '12px 20px', borderRadius: '8px', fontSize: '14px', marginBottom: '24px', fontWeight: 500 }}>
        ℹ️ Skipped leads are saved in this list to avoid re-scraping them in the future.
      </div>

      {loading && leads.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>
            Loading skipped leads...
          </div>
        </div>
      ) : leads.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🗑️</div>
          <div className="empty-state-title">No rejected leads</div>
          <div className="empty-state-text">
            Excellent! You have no rejected doctor leads. Any leads you skip will be listed here.
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="table-wrapper desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>#</th>
                  <th>Doctor Name</th>
                  <th>Specialty</th>
                  <th>Area</th>
                  <th>Phone</th>
                  <th style={{ width: '320px' }}>Notes / Reason</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, index) => {
                  const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
                  const isExiting = exitingLeadIds.includes(lead.id);

                  return (
                    <tr key={lead.id} className={isExiting ? 'row-exit' : ''}>
                      <td style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{index + 1}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{lead.doctor_name}</span>
                        {lead.address && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                            📍 {lead.address}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge" style={{ background: sc.bg, color: sc.text }}>
                          {lead.specialty}
                        </span>
                      </td>
                      <td>{lead.area}</td>
                      <td>
                        {lead.phone ? (
                          <button className="phone-link" onClick={() => copyPhone(lead.phone)}>
                            {lead.phone} 📋
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ position: 'relative' }}>
                          <textarea
                            className="inline-notes"
                            defaultValue={lead.notes || ''}
                            placeholder="Add rejection reason..."
                            onBlur={(e) => {
                              if (e.target.value !== (lead.notes || '')) {
                                saveNotes(lead.id, e.target.value);
                              }
                            }}
                          />
                          {savingNotesId === lead.id && (
                            <span
                              style={{
                                position: 'absolute',
                                right: '6px',
                                bottom: '6px',
                                fontSize: '10px',
                                color: 'var(--color-success)',
                              }}
                            >
                              Saving...
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="actions-group" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => restoreLead(lead.id)}
                          >
                            ↩️ Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="mobile-only mobile-cards">
            {leads.map((lead, index) => {
              const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
              const isExiting = exitingLeadIds.includes(lead.id);

              return (
                <div
                  key={lead.id}
                  className={`mobile-card ${isExiting ? 'row-exit' : ''}`}
                  style={{ display: isExiting ? 'none' : 'block' }}
                >
                  <div className="mobile-card-header">
                    <div>
                      <div className="mobile-card-name">
                        {index + 1}. {lead.doctor_name}
                      </div>
                      <span
                        className="badge"
                        style={{ background: sc.bg, color: sc.text, marginTop: '4px' }}
                      >
                        {lead.specialty}
                      </span>
                    </div>
                  </div>

                  <div className="mobile-card-details">
                    <div>📍 {lead.area}</div>
                  </div>

                  {lead.phone && (
                    <div style={{ marginBottom: '12px' }}>
                      <button
                        className="phone-link"
                        onClick={() => copyPhone(lead.phone)}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        📞 {lead.phone}
                      </button>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <textarea
                      className="input"
                      style={{ fontSize: '13px', minHeight: '50px' }}
                      defaultValue={lead.notes || ''}
                      placeholder="Add Rejection reason..."
                      onBlur={(e) => {
                        if (e.target.value !== (lead.notes || '')) {
                          saveNotes(lead.id, e.target.value);
                        }
                      }}
                    />
                  </div>

                  <div className="mobile-card-actions">
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => restoreLead(lead.id)}
                    >
                      ↩️ Restore to pipeline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
