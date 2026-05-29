'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/types';
import { SPECIALTY_COLORS } from '@/lib/scraper/constants';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';

export default function CalledPage() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitingLeadIds, setExitingLeadIds] = useState<string[]>([]);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Fetch called leads
  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/leads?status=called');
        if (!res.ok) throw new Error('Failed to fetch leads');
        const data = await res.json();
        setLeads(data);
      } catch (err) {
        showToast('Failed to load called leads', 'error');
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
      showToast('Phone number copied to clipboard!', 'success');
    });
  }

  // Restore lead to 'to_call'
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
        showToast('Lead moved back to To Call list', 'success');
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
        <h1 className="page-title">Called Doctors</h1>
        <p className="page-subtitle">
          You&apos;ve called <strong style={{ color: 'var(--color-primary)' }}>{leads.length}</strong> doctors total. Track summaries, agreements, or restore them to the pipeline.
        </p>
      </div>

      {loading && leads.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>
            Loading called leads...
          </div>
        </div>
      ) : leads.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No doctors called yet</div>
          <div className="empty-state-text">
            When you complete calls on the &quot;To Call&quot; page and mark them as Called, they will appear here.
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
                  <th>Called At</th>
                  <th style={{ width: '300px' }}>Call Summary / Notes</th>
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
                      <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {lead.called_at ? formatDateTime(lead.called_at) : '—'}
                      </td>
                      <td>
                        <div style={{ position: 'relative' }}>
                          <textarea
                            className="inline-notes"
                            defaultValue={lead.notes || ''}
                            placeholder="Add brief details..."
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
                            title="Move back to To Call"
                            onClick={() => restoreLead(lead.id)}
                          >
                            ↩️ Move Back
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
                    <div style={{ gridColumn: 'span 2' }}>
                      📞 Called: {lead.called_at ? formatDateTime(lead.called_at) : '—'}
                    </div>
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
                      placeholder="Add brief details..."
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
                      ↩️ Move back to To Call
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
