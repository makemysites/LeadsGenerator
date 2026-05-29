'use client';

import { useEffect, useState, useRef } from 'react';
import type { Lead } from '@/types';
import { SPECIALTIES, AREAS, SPECIALTY_COLORS } from '@/lib/scraper/constants';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import FollowUpModal from '@/components/ui/FollowUpModal';

export default function ToCallPage() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [areaFilter, setAreaFilter] = useState('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // UI state
  const [exitingLeadIds, setExitingLeadIds] = useState<string[]>([]);
  const [activeFollowUpLead, setActiveFollowUpLead] = useState<Lead | null>(null);

  // For autosaving notes
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Fetch leads
  useEffect(() => {
    async function fetchLeads() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          status: 'to_call',
          area: areaFilter,
          specialty: specialtyFilter,
          date: dateFilter,
          search: searchQuery,
        });

        const res = await fetch(`/api/leads?${queryParams.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch leads');
        const data = await res.json();
        setLeads(data);
      } catch (err) {
        showToast('Failed to load leads', 'error');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const debounceTimer = setTimeout(() => {
      fetchLeads();
    }, 300); // Small debounce for search query typing

    return () => clearTimeout(debounceTimer);
  }, [areaFilter, specialtyFilter, dateFilter, searchQuery, showToast]);

  // Copy phone number to clipboard
  function copyPhone(phone: string) {
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      showToast('Phone number copied to clipboard!', 'success');
    });
  }

  // Update lead status (optimistic UI with exit animation)
  async function updateStatus(leadId: string, newStatus: 'called' | 'rejected') {
    // Add to exiting ids for animation
    setExitingLeadIds((prev) => [...prev, leadId]);

    // Toast feedback
    const message = newStatus === 'called' ? 'Lead marked as Called' : 'Lead rejected';
    const type = newStatus === 'called' ? 'success' : 'info';

    // Trigger API call after a short delay to match the animation or simultaneously
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      // Wait for exit animation to complete (300ms) then remove from list
      setTimeout(() => {
        setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
        setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
        showToast(message, type);
      }, 300);
    } catch (err) {
      console.error(err);
      showToast('Failed to update lead status', 'error');
      // Revert exit animation
      setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
    }
  }

  // Handle note saving on blur
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

  // Handle follow up saved
  function handleFollowUpSaved(leadId: string) {
    // Animate and remove from the list
    setExitingLeadIds((prev) => [...prev, leadId]);
    setTimeout(() => {
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      setExitingLeadIds((prev) => prev.filter((id) => id !== leadId));
    }, 300);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">To Call</h1>
        <p className="page-subtitle">Your target leads for today. Make calls, take notes, and log results.</p>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div style={{ flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            className="input"
            placeholder="🔍 Search doctors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ width: '180px' }}>
          <select className="select" value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
            <option value="all">All Specialties</option>
            {SPECIALTIES.map((spec) => (
              <option key={spec} value={spec}>
                {spec}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: '180px' }}>
          <select className="select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="all">All Areas</option>
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: '150px' }}>
          <select className="select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Dates</option>
            <option value="today">Scraped Today</option>
            <option value="week">Scraped This Week</option>
          </select>
        </div>
      </div>

      {/* Table / List Container */}
      {loading && leads.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>
            Loading doctor leads...
          </div>
        </div>
      ) : leads.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">📞</div>
          <div className="empty-state-title">No leads to call</div>
          <div className="empty-state-text">
            {searchQuery || specialtyFilter !== 'all' || areaFilter !== 'all' || dateFilter !== 'all'
              ? 'No leads match your filter criteria. Try adjusting your filters.'
              : 'You have cleared all leads! New leads arrive every morning at 7:00 AM IST.'}
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
                  <th>Phone Number</th>
                  <th style={{ width: '100px' }}>Rating</th>
                  <th>Scraped</th>
                  <th style={{ width: '240px' }}>Quick Notes</th>
                  <th style={{ width: '200px', textAlign: 'right' }}>Actions</th>
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
                            {lead.phone} <span style={{ fontSize: '10px' }}>📋</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>No Phone</span>
                        )}
                      </td>
                      <td>
                        {lead.rating ? (
                          <span className="rating">
                            <span className="rating-star">⭐</span>
                            <span className="rating-value">{lead.rating}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              ({lead.total_reviews})
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(lead.scraped_date)}
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
                            className="btn btn-sm btn-success"
                            title="Mark as Called"
                            onClick={() => updateStatus(lead.id, 'called')}
                          >
                            ✅ Called
                          </button>
                          <button
                            className="btn btn-sm btn-warning"
                            title="Schedule Follow-Up"
                            onClick={() => setActiveFollowUpLead(lead)}
                          >
                            ⏰ Follow-Up
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--color-danger)' }}
                            title="Reject Lead"
                            onClick={() => updateStatus(lead.id, 'rejected')}
                          >
                            ❌
                          </button>
                          {lead.google_maps_url && (
                            <a
                              href={lead.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-ghost btn-icon"
                              title="Open in Maps"
                            >
                              🗺️
                            </a>
                          )}
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
                    {lead.rating && (
                      <span className="rating">
                        <span className="rating-star">⭐</span>
                        <span className="rating-value">{lead.rating}</span>
                      </span>
                    )}
                  </div>

                  <div className="mobile-card-details">
                    <div>📍 {lead.area}</div>
                    <div style={{ gridColumn: 'span 2' }}>
                      📅 Scraped: {formatDate(lead.scraped_date)}
                    </div>
                  </div>

                  {lead.phone && (
                    <div style={{ marginBottom: '12px' }}>
                      <button
                        className="phone-link"
                        onClick={() => copyPhone(lead.phone)}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        📞 {lead.phone} (Copy)
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

                  <div className="mobile-card-actions" style={{ justifyContent: 'space-between' }}>
                    <button
                      className="btn btn-sm btn-success"
                      style={{ flex: 1 }}
                      onClick={() => updateStatus(lead.id, 'called')}
                    >
                      ✅ Called
                    </button>
                    <button
                      className="btn btn-sm btn-warning"
                      style={{ flex: 1 }}
                      onClick={() => setActiveFollowUpLead(lead)}
                    >
                      ⏰ Follow-Up
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--color-danger)', padding: '4px 12px' }}
                      onClick={() => updateStatus(lead.id, 'rejected')}
                    >
                      ❌ Reject
                    </button>
                    {lead.google_maps_url && (
                      <a
                        href={lead.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '6px' }}
                      >
                        🗺️ Maps
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Follow-Up Modal */}
      {activeFollowUpLead && (
        <FollowUpModal
          leadId={activeFollowUpLead.id}
          doctorName={activeFollowUpLead.doctor_name}
          existingNote={activeFollowUpLead.notes}
          onClose={() => setActiveFollowUpLead(null)}
          onSaved={(leadId) => handleFollowUpSaved(leadId)}
        />
      )}
    </div>
  );
}
