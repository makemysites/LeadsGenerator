'use client';

import { useEffect, useState } from 'react';
import type { DashboardStats, Lead, ScrapeRun } from '@/types';
import { SPECIALTY_COLORS } from '@/lib/scraper/constants';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import StatCards from '@/components/dashboard/StatCards';
import ApiUsageMeter from '@/components/dashboard/ApiUsageMeter';
import CountdownTimer from '@/components/dashboard/CountdownTimer';

export default function DashboardPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [todayLeads, setTodayLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, scrapeRes, leadsRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/scrape/status'),
          fetch('/api/leads?date=today&status=to_call'),
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }
        if (scrapeRes.ok) {
          const data = await scrapeRes.json();
          setScrapeRuns(Array.isArray(data) ? data : data.runs || []);
        }
        if (leadsRes.ok) {
          const data = await leadsRes.json();
          const leads = Array.isArray(data) ? data : data.leads || [];
          setTodayLeads(leads.slice(0, 10));
        }
      } catch {
        showToast('Failed to load dashboard data', 'error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [showToast]);

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).then(() => {
      showToast('Phone number copied!', 'success');
    });
  }

  const apiUsage = stats?.apiUsageToday;
  const lastRun = scrapeRuns.length > 0 ? scrapeRuns[0] : null;

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '88px', borderRadius: '8px' }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: '70px', borderRadius: '8px', marginBottom: '24px' }} />
        <div className="skeleton" style={{ height: '300px', borderRadius: '8px' }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your lead generation pipeline</p>
      </div>

      <StatCards stats={stats} />

      {apiUsage?.is_limit_reached && (
        <div className="api-banner" style={{ marginBottom: '24px' }}>
          <span className="api-banner-icon">⚠️</span>
          <span>
            Google API Daily Limit Reached — {apiUsage.daily_limit}/{apiUsage.daily_limit} calls used. 
            No new leads today. Scraper resumes automatically tomorrow at 7:00 AM.
          </span>
        </div>
      )}

      {apiUsage && (
        <ApiUsageMeter callsMade={apiUsage.calls_made} dailyLimit={apiUsage.daily_limit} />
      )}

      {lastRun && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="section-title">🔍 Last Scrape Run</div>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', fontSize: '14px', color: '#64748B' }}>
            <div>
              <strong style={{ color: '#1E293B' }}>{lastRun.leads_found}</strong> leads found
            </div>
            <div>
              <strong style={{ color: '#1E293B' }}>{lastRun.api_calls_made}</strong> API calls used
            </div>
            <div>
              Status:{' '}
              <span
                className="badge"
                style={{
                  background: lastRun.status === 'completed' ? '#DCFCE7' : '#FEF3C7',
                  color: lastRun.status === 'completed' ? '#16A34A' : '#D97706',
                }}
              >
                {lastRun.status}
              </span>
            </div>
            <div>
              {lastRun.completed_at ? formatDateTime(lastRun.completed_at) : formatDateTime(lastRun.started_at)}
            </div>
          </div>
          {lastRun.message && (
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#94A3B8' }}>{lastRun.message}</div>
          )}
        </div>
      )}

      <CountdownTimer />

      <div className="section">
        <div className="section-title">📞 Today&apos;s Leads to Call</div>
        {todayLeads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No new leads today</div>
            <div className="empty-state-text">New leads arrive daily at 7:00 AM IST via automated scraping.</div>
          </div>
        ) : (
          <div className="table-wrapper desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Doctor Name</th>
                  <th>Specialty</th>
                  <th>Area</th>
                  <th>Phone</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {todayLeads.map((lead, idx) => {
                  const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
                  return (
                    <tr key={lead.id}>
                      <td style={{ color: '#94A3B8', fontWeight: 500 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{lead.doctor_name}</td>
                      <td>
                        <span className="badge" style={{ background: sc.bg, color: sc.text }}>
                          {lead.specialty}
                        </span>
                      </td>
                      <td>{lead.area}</td>
                      <td>
                        <button className="phone-link" onClick={() => copyPhone(lead.phone)}>
                          {lead.phone} 📋
                        </button>
                      </td>
                      <td>
                        <span className="rating">
                          <span className="rating-star">⭐</span>
                          <span className="rating-value">{lead.rating}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {todayLeads.length > 0 && (
          <div className="mobile-only mobile-cards">
            {todayLeads.map((lead, idx) => {
              const sc = SPECIALTY_COLORS[lead.specialty] || { bg: '#F1F5F9', text: '#475569' };
              return (
                <div key={lead.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <div className="mobile-card-name">{idx + 1}. {lead.doctor_name}</div>
                    <span className="badge" style={{ background: sc.bg, color: sc.text }}>{lead.specialty}</span>
                  </div>
                  <div className="mobile-card-details">
                    <div>📍 {lead.area}</div>
                    <div>⭐ {lead.rating}</div>
                  </div>
                  <button className="phone-link" onClick={() => copyPhone(lead.phone)}>
                    {lead.phone} 📋
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
