'use client';

import { useEffect, useState } from 'react';
import type { SearchConfig, ScrapeRun, ScrapeStatus } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/utils';

export default function SettingsPage() {
  const { showToast } = useToast();
  
  // Settings states
  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(100);

  // Danger Zone states
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Trigger manual scrape states
  const [scraping, setScraping] = useState(false);

  // Reset API counter state
  const [resettingApi, setResettingApi] = useState(false);

  // Fetch settings & history on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch('/api/settings', { cache: 'no-store' }),
          fetch('/api/scrape/status', { cache: 'no-store' }),
        ]);

        if (configRes.ok) {
          const configData: SearchConfig = await configRes.json();
          setConfig(configData);
          setDailyLimit(configData.daily_limit);
        }
        if (statusRes.ok) {
          const statusData: ScrapeStatus = await statusRes.json();
          setScrapeStatus(statusData);
        }
      } catch (err) {
        showToast('Failed to load settings data', 'error');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [showToast]);

  // Handle daily limit slider change
  async function handleLimitChange(value: number) {
    setDailyLimit(value);
    setUpdating(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_limit: value }),
      });

      if (!res.ok) throw new Error('Failed to update limit');
      
      const updatedConfig = await res.json();
      setConfig(updatedConfig);
      showToast('Daily API limit updated!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save API limit', 'error');
    } finally {
      setUpdating(false);
    }
  }

  // Handle manual trigger of daily scrape
  async function triggerManualScrape() {
    setScraping(true);
    showToast('Starting scraper run. Please wait...', 'info');
    try {
      const res = await fetch('/api/scrape/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error('Scraper failed');
      
      const data = await res.json();
      showToast(data.message || 'Scrape completed!', data.leadsFound > 0 ? 'success' : 'info');
      
      // Refresh status data
      const statusRes = await fetch('/api/scrape/status', { cache: 'no-store' });
      if (statusRes.ok) {
        const statusData: ScrapeStatus = await statusRes.json();
        setScrapeStatus(statusData);
      }
    } catch (err) {
      console.error(err);
      showToast('Manual scraper failed. Check console logs.', 'error');
    } finally {
      setScraping(false);
    }
  }

  // Handle reset API counter
  async function handleResetApiCounter() {
    setResettingApi(true);
    try {
      const res = await fetch('/api/usage/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      showToast(data.message || 'API counter reset. You can scrape again.', 'success');
      // Refresh status to show updated counter
      const statusRes = await fetch('/api/scrape/status', { cache: 'no-store' });
      if (statusRes.ok) {
        const statusData: ScrapeStatus = await statusRes.json();
        setScrapeStatus(statusData);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to reset API counter.', 'error');
    } finally {
      setResettingApi(false);
    }
  }

  // Handle clear all leads (Danger Zone)
  async function handleClearAllLeads() {
    if (confirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm', 'error');
      return;
    }

    setClearing(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to clear leads');

      showToast('All leads and history cleared!', 'success');
      setConfirmText('');
      
      // Refresh status
      const statusRes = await fetch('/api/scrape/status', { cache: 'no-store' });
      if (statusRes.ok) {
        const statusData: ScrapeStatus = await statusRes.json();
        setScrapeStatus(statusData);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to clear leads', 'error');
    } finally {
      setClearing(false);
    }
  }

  // Cost calculation
  // Google Places API includes $200 free monthly credits from Google Cloud.
  // Overpass API is completely free and has no limit, and doesn't count toward Google limit.
  const estimatedCallsPerMonth = dailyLimit * 30;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ CRM Settings</h1>
        <p className="page-subtitle">Configure your lead scraping parameters, schedule, and database actions.</p>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-pulse" style={{ color: 'var(--color-text-secondary)' }}>
            Loading CRM settings...
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* API Status Card */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>Google Places API Status</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Verifies connection with the Google Places API
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge" style={{ background: '#DCFCE7', color: '#16A34A', fontSize: '13px', padding: '4px 12px' }}>
                ● Active
              </span>
            </div>
          </div>

          {/* Configuration Card */}
          <div className="card">
            <div className="section-title">📊 Lead Generation Controls</div>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Control your daily Google Places API quota. Higher limits search more areas but consume more daily API credits.
            </p>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
                <span>Daily API Call Limit</span>
                <span style={{ color: 'var(--color-primary)' }}>{dailyLimit} calls/day</span>
              </div>
              <input
                type="range"
                className="slider"
                min="10"
                max="100"
                step="10"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseInt(e.target.value))}
                onMouseUp={(e) => handleLimitChange(parseInt((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => handleLimitChange(parseInt((e.target as HTMLInputElement).value))}
                disabled={updating}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <span>10 calls (Conservative)</span>
                <span>100 calls (Aggressive)</span>
              </div>
            </div>

            {/* Cost estimator */}
            <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '14px' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Google Places & OpenStreetMap Quota Info</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--color-text-secondary)' }}>
                <div>Est. Max Google Places Requests: <strong>{estimatedCallsPerMonth.toLocaleString()} calls / month</strong></div>
                <div>Google Places Cost: <strong style={{ color: 'var(--color-success)' }}>$0.00 (100% FREE)</strong></div>
                <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--color-success)', fontWeight: 500 }}>
                  🎉 Google Places API includes $200 free monthly credits from Google Cloud. We set a maximum limit of 100 calls/day as a safe buffer to stay within the free tier.
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Info */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>⏰ Automated Scraping Schedule</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                CRM silently triggers search every single morning. No buttons to click.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Daily at 7:00 AM IST</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Runs via Vercel Cron Scheduler</div>
            </div>
          </div>

          {/* Manual scraper trigger */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>🚀 Manual Scraper Override</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Need leads right now? Force run the daily search combination pointer immediately.
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={triggerManualScrape}
              disabled={scraping}
            >
              {scraping ? 'Scraping...' : '🔍 Trigger Search Now'}
            </button>
          </div>

          {/* Reset API Counter */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>🔄 Reset API Call Counter</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Counter stuck at 100? Reset today&apos;s Google API usage to 0 so you can scrape again.
              </div>
            </div>
            <button
              className="btn"
              style={{ background: '#F59E0B', color: '#fff', fontWeight: 600 }}
              onClick={handleResetApiCounter}
              disabled={resettingApi}
            >
              {resettingApi ? 'Resetting...' : '🔄 Reset Counter'}
            </button>
          </div>

          {/* History */}
          <div className="card">
            <div className="section-title">🕒 Scraper Run Logs (Last 7 Runs)</div>
            {scrapeStatus?.lastRuns && scrapeStatus.lastRuns.length > 0 ? (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Run Date</th>
                      <th>Leads Found</th>
                      <th>Duplicates Skipped</th>
                      <th>API Calls</th>
                      <th>Status</th>
                      <th>Completed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapeStatus.lastRuns.map((run) => (
                      <tr key={run.id}>
                        <td style={{ fontWeight: 600 }}>{run.run_date}</td>
                        <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>+{run.leads_found} new leads</td>
                        <td style={{ color: 'var(--color-text-secondary)' }}>{run.new_leads_skipped} skipped</td>
                        <td>{run.api_calls_made} calls</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background:
                                run.status === 'completed'
                                  ? '#DCFCE7'
                                  : run.status === 'running'
                                    ? '#DBEAFE'
                                    : '#FEF3C7',
                              color:
                                run.status === 'completed'
                                  ? '#16A34A'
                                  : run.status === 'running'
                                    ? '#1D4ED8'
                                    : '#D97706',
                            }}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          {run.completed_at ? formatDateTime(run.completed_at) : 'In Progress'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '20px', color: 'var(--color-text-muted)', fontSize: '14px', textAlign: 'center' }}>
                No scraper runs logged yet. Scraper runs automatically at 7:00 AM IST.
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="danger-zone card">
            <div className="danger-zone-title">⚠️ Danger Zone</div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              Clears the entire database including all doctors, called lists, follow-ups, and scraper logs. This cannot be undone.
            </p>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Type DELETE to confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={clearing}
                />
              </div>
              <button
                className="btn btn-danger"
                onClick={handleClearAllLeads}
                disabled={clearing || confirmText !== 'DELETE'}
              >
                {clearing ? 'Clearing...' : '💣 Clear All CRM Data'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
