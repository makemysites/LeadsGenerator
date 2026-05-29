export type LeadStatus = 'to_call' | 'called' | 'rejected' | 'follow_up';

export interface Lead {
  id: string;
  place_id: string;
  doctor_name: string;
  specialty: string;
  area: string;
  phone: string;
  address: string;
  google_maps_url: string;
  rating: number;
  total_reviews: number;
  scraped_date: string;
  status: LeadStatus;
  notes: string | null;
  follow_up_datetime: string | null;
  follow_up_note: string | null;
  called_at: string | null;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  toCall: number;
  called: number;
  rejected: number;
  followUp: number;
  todayCount: number;
  followUpToday: number;
  apiUsageToday: { calls_made: number; daily_limit: number; is_limit_reached: boolean };
}

export interface ScrapeRun {
  id: string;
  run_date: string;
  leads_found: number;
  api_calls_made: number;
  status: string;
  message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ApiUsage {
  id: string;
  usage_date: string;
  calls_made: number;
  daily_limit: number;
  is_limit_reached: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchConfig {
  id: string;
  daily_limit: number;
  pointer_index: number;
  created_at: string;
  updated_at: string;
}

export interface ScrapeStatus {
  scrapeRun: ScrapeRun | null;
  apiUsage: ApiUsage | null;
  lastRuns: ScrapeRun[];
}

export interface ScrapeResult {
  leadsFound: number;
  apiCallsMade: number;
  status: string;
  message: string;
}

export interface PlaceResult {
  id: string;
  displayName?: {
    text: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
}

export type PlaceDetails = PlaceResult;
