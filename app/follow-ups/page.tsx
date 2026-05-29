'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/types';
import { SPECIALTY_COLORS } from '@/lib/scraper/constants';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, isOverdue, isToday } from '@/lib/utils';
import FollowUpModal from '@/components/ui/FollowUpModal';

export default function FollowUpsPage() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / UI states
  const [exitingLeadIds, setExitingLeadIds] = useState<string[]>([]);
  const [activeFollowUpLead, setActiveFollowUpLead] = useState<Lead | null>(null);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Fetch follow-ups
  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/leads?status=follow_up');
        if (!res.ok) throw new Error('Failed to fetch leads');
        const data = await res.json();
        setLeads(data);
      } catch (err) {
        showToast('Failed to load follow-ups', 'error');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeads();
  }, [showToast]);

  // Copy phone number
  function copyPhone(phone: string) {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      showToast('Phone number copied!', 'success');
    });
  }

  // Update lead status
  async function updateStatus(leadId: string, newStatus: 'called' | 'rejected') {
    setExitingLeadIds((prev) => [...prev, leadId]);
    const message = newStatus === 'called' ? 'Lead marked as Called' : 'Lead rejected';

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      setTimeout(() => {
        setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
        setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
        showToast(message, 'success');
      }, 300);
    } catch (err) {
      console.error(err);
      showToast('Failed to update lead status', 'error');
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

  // Handle follow up rescheduled
  function handleFollowUpRescheduled(leadId: string, newDatetime: string, newNote: string) {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? { ...lead, follow_up_datetime: newDatetime, follow_up_note: newNote }
          : lead
      )
    );
    setActiveFollowUpLead(null);
  }

  // Process leads into categories
  // 1. Overdue: in the past, not called (sorted to top of today's section)
  // 2. Today's: follow_up_datetime is today
  // 3. Upcoming: follow_up_datetime is in the future
  const overdueLeads = leads
    .filter((lead) => isOverdue(lead.follow_up_datetime))
    .sort(
      (a, b) =>
        new Date(a.follow_up_datetime || '').getTime() -
        new Date(b.follow_up_datetime || '').getTime()
    );

  const todayLeads = leads
    .filter((lead) => {
      const dt = lead.follow_up_datetime;
      return dt && isToday(dt) && !isOverdue(dt);
    })
    .sort(
      (a, b) =>
        new Date(a.follow_up_datetime || '').getTime() -
        new Date(b.follow_up_datetime || '').getTime()
    );

  const upcomingLeads = leads
    .filter((lead) => {
      const dt = lead.follow_up_datetime;
      return dt && !isToday(dt) && !isOverdue(dt);
    })
    .sort(
      (a, b) =>
        new Date(a.follow_up_datetime || '').getTime() -
        new Date(b.follow_up_datetime || '').getTime()
    );

  // Grouped leads list to render
  const todayAndOverdueGroup = [...overdueLeads, ...todayLeads];

  function renderTable(groupLeads: Lead[], sectionName: string) {
    if (groupLeads.length === 0) return null;

    return (
      <div className="section" style={{ marginBottom: '32px' }}>
        <h2 className="section-title">
          {sectionName === 'today' ? '⏰ Today & Overdue Follow-Ups' : '📅 Upcoming Follow-Ups'}
          <span className="badge" style={{ background: sectionName === 'today' ? 'var(--color-warning-light)' : 'var(--color-primary-light)', color: sectionName === 'today' ? 'var(--color-warning)' : 'var(--color-primary)', marginLeft: '8px' }}>
            {groupLeads.length}
          </span>
        </h2>
        
        {/* Desktop View */}
        <div className="table-wrapper desktop-only">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Doctor Name</th>
                <th>Specialty</th>
                <th>Area</th>
                <th>Phone</th>
                <th>Scheduled Time</th>
                <th>Follow-up Reason / Instruction</th>
                <th style={{ width: '220px' }}>Notes</th>
                <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupLeads.map((lead, index) => {
                const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
                const isExiting = exitingLeadIds.includes(lead.id);
                const overdue = isOverdue(lead.follow_up_datetime);

                return (
                  <tr
                    key={lead.id}
                    className={`${isExiting ? 'row-exit' : ''} ${overdue ? 'row-overdue' : ''}`}
                  >
                    <td style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{index + 1}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{lead.doctor_name}</span>
                      {overdue && (
                        <span className="badge status-overdue" style={{ marginLeft: '8px', fontSize: '10px' }}>
                          ⚠️ Overdue
                        </span>
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
                    <td style={{ fontWeight: 600, color: overdue ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                      {lead.follow_up_datetime ? formatDateTime(lead.follow_up_datetime) : '—'}
                    </td>
                    <td style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                      {lead.follow_up_note || 'No reason specified'}
                    </td>
                    <td>
                      <div style={{ position: 'relative' }}>
                        <textarea
                          className="inline-notes"
                          defaultValue={lead.notes || ''}
                          placeholder="Update lead notes..."
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
                          className="btn btn-sm btn-success"
                          title="Mark as Called"
                          onClick={() => updateStatus(lead.id, 'called')}
                        >
                          ✅ Called
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          title="Reschedule"
                          onClick={() => setActiveFollowUpLead(lead)}
                        >
                          📝 Reschedule
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--color-danger)' }}
                          title="Reject"
                          onClick={() => updateStatus(lead.id, 'rejected')}
                        >
                          ❌
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="mobile-only mobile-cards">
          {groupLeads.map((lead, index) => {
            const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
            const isExiting = exitingLeadIds.includes(lead.id);
            const overdue = isOverdue(lead.follow_up_datetime);

            return (
              <div
                key={lead.id}
                className={`mobile-card ${isExiting ? 'row-exit' : ''}`}
                style={{
                  borderLeft: overdue ? '4px solid var(--color-danger)' : '4px solid var(--color-warning)',
                  background: overdue ? '#FFF1F2' : '#FFFFFF',
                }}
              >
                <div className="mobile-card-header">
                  <div>
                    <div className="mobile-card-name">
                      {index + 1}. {lead.doctor_name}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="badge" style={{ background: sc.bg, color: sc.text }}>
                        {lead.specialty}
                      </span>
                      {overdue && <span className="badge status-overdue">⚠️ Overdue</span>}
                    </div>
                  </div>
                </div>

                <div className="mobile-card-details">
                  <div>📍 {lead.area}</div>
                  <div
                    style={{
                      gridColumn: 'span 2',
                      fontWeight: 600,
                      color: overdue ? 'var(--color-danger)' : 'var(--color-warning)',
                    }}
                  >
                    ⏰ {lead.follow_up_datetime ? formatDateTime(lead.follow_up_datetime) : '—'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '8px 12px',
                    background: '#F8FAFC',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                    fontStyle: 'italic',
                    marginBottom: '12px',
                    border: '1px dashed var(--color-border)',
                  }}
                >
                  📝 Reason: {lead.follow_up_note || 'No reason specified'}
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

                <div className="mobile-card-actions">
                  <button
                    className="btn btn-sm btn-success"
                    style={{ flex: 1 }}
                    onClick={() => updateStatus(lead.id, 'called')}
                  >
                    ✅ Called
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => setActiveFollowUpLead(lead)}
                  >
                    📝 Reschedule
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => updateStatus(lead.id, 'rejected')}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⏰ Follow-Up Tasks</h1>
        <p className="page-subtitle">
          Manage calls that require scheduled callbacks. Overdue calls are automatically highlighted and pinned to the top.
        </p>
      </div>

      {loading && leads.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>
            Loading follow-up tasks...
          </div>
        </div>
      ) : leads.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">⏰</div>
          <div className="empty-state-title">No scheduled follow-ups</div>
          <div className="empty-state-text">
            All caught up! When you schedule follow-ups from the To Call list, they will appear here.
          </div>
        </div>
      ) : (
        <>
          {/* Today & Overdue Follow-ups Section */}
          {renderTable(todayAndOverdueGroup, 'today')}

          {/* Upcoming Section */}
          {renderTable(upcomingLeads, 'upcoming')}

          {/* If there were follow-ups but filtering made both empty */}
          {todayAndOverdueGroup.length === 0 && upcomingLeads.length === 0 && (
            <div className="empty-state card">
              <div className="empty-state-title">No follow-ups found</div>
            </div>
          )}
        </>
      )}

      {/* Reschedule Modal */}
      {activeFollowUpLead && (
        <FollowUpModal
          leadId={activeFollowUpLead.id}
          doctorName={activeFollowUpLead.doctor_name}
          existingNote={activeFollowUpLead.follow_up_note}
          existingDatetime={activeFollowUpLead.follow_up_datetime}
          onClose={() => setActiveFollowUpLead(null)}
          onSaved={(leadId, followUpDatetime, followUpNote) =>
            handleFollowUpRescheduled(leadId, followUpDatetime, followUpNote)
          }
        />
      )}
    </div>
  );
}
