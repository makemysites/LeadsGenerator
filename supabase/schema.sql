-- ============================================================
-- Doctor Lead Generation CRM - Complete Database Schema
-- ============================================================
-- Run this in the Supabase SQL Editor to set up all tables.
-- This script drops all tables and rebuilds them cleanly from scratch.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing triggers first
DROP TRIGGER IF EXISTS leads_updated_at ON leads;
DROP TRIGGER IF EXISTS api_usage_updated_at ON api_usage;
DROP TRIGGER IF EXISTS search_config_updated_at ON search_config;

-- Drop existing tables in correct dependency order
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS scrape_runs CASCADE;
DROP TABLE IF EXISTS api_usage CASCADE;
DROP TABLE IF EXISTS search_config CASCADE;

-- ============================================================
-- 1. LEADS TABLE
-- ============================================================
CREATE TABLE leads (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  place_id        TEXT NOT NULL UNIQUE,
  doctor_name     TEXT NOT NULL,
  specialty       TEXT NOT NULL,
  area            TEXT NOT NULL,
  address         TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  website         TEXT,
  google_maps_url TEXT,
  rating          NUMERIC(2, 1),
  total_reviews   INTEGER,
  status          TEXT NOT NULL DEFAULT 'to_call'
                    CHECK (status IN ('to_call', 'called', 'follow_up', 'rejected')),
  notes           TEXT,
  called_at       TIMESTAMPTZ,
  follow_up_datetime TIMESTAMPTZ,
  follow_up_note  TEXT,
  scraped_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_scraped_date ON leads (scraped_date DESC);
CREATE INDEX IF NOT EXISTS idx_leads_specialty ON leads (specialty);
CREATE INDEX IF NOT EXISTS idx_leads_area ON leads (area);
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON leads (place_id);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads (follow_up_datetime)
  WHERE status = 'follow_up';
CREATE INDEX IF NOT EXISTS idx_leads_status_scraped ON leads (status, scraped_date DESC);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. SCRAPE_RUNS TABLE
-- ============================================================
CREATE TABLE scrape_runs (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  run_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  leads_found     INTEGER NOT NULL DEFAULT 0,
  api_calls_made  INTEGER NOT NULL DEFAULT 0,
  new_leads_skipped INTEGER NOT NULL DEFAULT 0,
  fsq_results_fetched INTEGER NOT NULL DEFAULT 0,
  fsq_checked_website INTEGER NOT NULL DEFAULT 0,
  fsq_no_website_found INTEGER NOT NULL DEFAULT 0,
  pointer_start   INTEGER NOT NULL DEFAULT 0,
  pointer_end     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_scrape_runs_run_date ON scrape_runs (run_date DESC);
CREATE INDEX idx_scrape_runs_status ON scrape_runs (status);

-- ============================================================
-- 3. API_USAGE TABLE
-- ============================================================
CREATE TABLE api_usage (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  usage_date      DATE NOT NULL UNIQUE,
  calls_made      INTEGER NOT NULL DEFAULT 0,
  daily_limit     INTEGER NOT NULL DEFAULT 100,
  is_limit_reached BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_date ON api_usage (usage_date DESC);

CREATE TRIGGER api_usage_updated_at
  BEFORE UPDATE ON api_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. SEARCH_CONFIG TABLE
-- ============================================================
CREATE TABLE search_config (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  daily_limit     INTEGER NOT NULL DEFAULT 100,
  pointer_index   INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER search_config_updated_at
  BEFORE UPDATE ON search_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. INITIAL DATA
-- ============================================================
-- Insert default search config if not exists
INSERT INTO search_config (daily_limit, pointer_index)
SELECT 100, 0
WHERE NOT EXISTS (SELECT 1 FROM search_config LIMIT 1);

-- ============================================================
-- 6. ROW LEVEL SECURITY (disabled — no auth in this app)
-- ============================================================
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE search_config DISABLE ROW LEVEL SECURITY;
