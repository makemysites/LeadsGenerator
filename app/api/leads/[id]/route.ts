import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { LeadStatus } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: LeadStatus[] = ['to_call', 'called', 'follow_up', 'rejected'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Lead ID is required.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, notes, follow_up_datetime, follow_up_note } = body;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Validate status if provided
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          },
          { status: 400 }
        );
      }

      updateData.status = status;

      // Status-specific logic
      if (status === 'called') {
        updateData.called_at = new Date().toISOString();
      }

      if (status === 'follow_up') {
        if (!follow_up_datetime || !follow_up_note) {
          return NextResponse.json(
            {
              error:
                'follow_up_datetime and follow_up_note are required when setting status to follow_up.',
            },
            { status: 400 }
          );
        }
        updateData.follow_up_datetime = follow_up_datetime;
        updateData.follow_up_note = follow_up_note;
      }

      if (status === 'to_call') {
        updateData.follow_up_datetime = null;
        updateData.follow_up_note = null;
        updateData.called_at = null;
      }
    }

    // Handle notes update independently
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Handle follow_up fields when updated independently (not via status change)
    if (status === undefined) {
      if (follow_up_datetime !== undefined) {
        updateData.follow_up_datetime = follow_up_datetime;
      }
      if (follow_up_note !== undefined) {
        updateData.follow_up_note = follow_up_note;
      }
    }

    const supabase = createServerClient();

    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating lead:', error);

      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: `Lead not found with id: ${id}` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: `Failed to update lead: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedLead);
  } catch (error) {
    console.error('Lead update API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to update lead: ${message}` },
      { status: 500 }
    );
  }
}
