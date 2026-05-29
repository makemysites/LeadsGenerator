import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayIST } from '@/lib/utils/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing env vars',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey ? 'SET' : 'MISSING',
    });
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const todayIST = getTodayIST();

  const testLead = {
    place_id:        'test_insert_001',
    doctor_name:     'Test Doctor (auto-inserted)',
    specialty:       'Dentist',
    area:            'Banjara Hills',
    address:         'Test Address, Banjara Hills, Hyderabad',
    phone:           '9999999999',
    website:         null as null,
    google_maps_url: 'https://maps.google.com',
    rating:          4.5,
    total_reviews:   100,
    status:          'to_call',
    scraped_date:    todayIST,
  };

  console.log('TEST INSERT: attempting to insert test lead...');
  console.log('Payload:', JSON.stringify(testLead));

  const { error } = await db
    .from('leads')
    .upsert(testLead, { onConflict: 'place_id', ignoreDuplicates: true });

  if (error) {
    console.error('TEST INSERT FAILED:', JSON.stringify(error));
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  console.log('TEST INSERT: success!');
  return NextResponse.json({
    success: true,
    message: 'Test lead inserted successfully. Check your Supabase leads table for place_id = "test_insert_001".',
    payload: testLead,
  });
}
