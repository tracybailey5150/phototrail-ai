import { createAdminClient } from '@/lib/supabase/admin';

interface MediaForGrouping {
  id: string;
  capture_time: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  original_filename: string;
}

/**
 * Auto-group media items in a travel collection into trips → days → events.
 */
export async function groupTravelCollection(collectionId: string, orgId: string) {
  const admin = createAdminClient();

  const { data: items } = await admin.from('media_items')
    .select('id, capture_time, gps_latitude, gps_longitude, original_filename')
    .eq('collection_id', collectionId)
    .eq('is_duplicate', false)
    .order('capture_time', { ascending: true, nullsFirst: false });

  if (!items || items.length === 0) return;

  // Get collection info
  const { data: collection } = await admin.from('collections')
    .select('name, location, start_date, end_date')
    .eq('id', collectionId).single();

  // Group by calendar day
  const dayGroups = new Map<string, MediaForGrouping[]>();
  for (const item of items) {
    const date = item.capture_time
      ? new Date(item.capture_time).toISOString().split('T')[0]
      : 'unknown';
    if (!dayGroups.has(date)) dayGroups.set(date, []);
    dayGroups.get(date)!.push(item);
  }

  // Create or get trip
  const { data: existingTrips } = await admin.from('trips')
    .select('id').eq('collection_id', collectionId).limit(1);

  let tripId: string;
  if (existingTrips && existingTrips.length > 0) {
    tripId = existingTrips[0].id;
  } else {
    const { data: trip } = await admin.from('trips').insert({
      collection_id: collectionId,
      org_id: orgId,
      name: collection?.name || 'Trip',
      start_date: collection?.start_date || null,
      end_date: collection?.end_date || null,
      location: collection?.location || null,
      status: 'suggested',
    }).select('id').single();
    tripId = trip!.id;
  }

  // Create trip days and assign media
  const sortedDays = [...dayGroups.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [dateStr, dayItems] of sortedDays) {
    if (dateStr === 'unknown') continue;

    const { data: existingDay } = await admin.from('trip_days')
      .select('id').eq('trip_id', tripId).eq('day_date', dateStr).limit(1);

    let dayId: string;
    if (existingDay && existingDay.length > 0) {
      dayId = existingDay[0].id;
    } else {
      const dayLabel = new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
      const { data: day } = await admin.from('trip_days').insert({
        trip_id: tripId, org_id: orgId, day_date: dateStr, label: dayLabel,
      }).select('id').single();
      dayId = day!.id;
    }

    // Group within day by time gaps (>2 hours = new event)
    const eventGroups = groupByTimeGap(dayItems, 2 * 60 * 60 * 1000);

    for (let i = 0; i < eventGroups.length; i++) {
      const group = eventGroups[i];
      const firstTime = group[0].capture_time ? new Date(group[0].capture_time) : null;
      const eventName = `Event ${i + 1}`;

      const { data: event } = await admin.from('events').insert({
        trip_day_id: dayId, collection_id: collectionId, org_id: orgId,
        name: eventName,
        start_time: firstTime?.toISOString() || null,
        status: 'suggested',
      }).select('id').single();

      // Assign media
      for (const item of group) {
        await admin.from('media_assignments').upsert({
          media_item_id: item.id, org_id: orgId,
          trip_id: tripId, trip_day_id: dayId, event_id: event!.id,
          assignment_source: 'auto', confidence: 0.8,
        }, { onConflict: 'media_item_id' }).select();
      }
    }
  }

  // Handle unknown-date items
  const unknownItems = dayGroups.get('unknown') || [];
  for (const item of unknownItems) {
    await admin.from('media_assignments').upsert({
      media_item_id: item.id, org_id: orgId,
      trip_id: tripId, assignment_source: 'auto', confidence: 0.3,
    }, { onConflict: 'media_item_id' }).select();
  }
}

/**
 * Auto-group media items in a project collection into rooms.
 */
export async function groupProjectCollection(collectionId: string, orgId: string) {
  const admin = createAdminClient();

  // Get media with AI analysis for room candidates
  const { data: items } = await admin.from('media_items')
    .select('id, capture_time, original_filename')
    .eq('collection_id', collectionId)
    .eq('is_duplicate', false)
    .order('capture_time', { ascending: true, nullsFirst: false });

  if (!items || items.length === 0) return;

  for (const item of items) {
    // Check if AI found room candidates
    const { data: analysis } = await admin.from('media_ai_analysis')
      .select('room_candidates')
      .eq('media_item_id', item.id).single();

    const candidates = (analysis?.room_candidates || []) as string[];
    if (candidates.length === 0) continue;

    const roomName = candidates[0];

    // Find or create room
    const { data: existingRoom } = await admin.from('rooms')
      .select('id').eq('collection_id', collectionId).eq('name', roomName).limit(1);

    let roomId: string;
    if (existingRoom && existingRoom.length > 0) {
      roomId = existingRoom[0].id;
    } else {
      const { data: room } = await admin.from('rooms').insert({
        collection_id: collectionId, org_id: orgId,
        name: roomName, room_number: roomName, status: 'suggested',
      }).select('id').single();
      roomId = room!.id;
    }

    await admin.from('media_assignments').upsert({
      media_item_id: item.id, org_id: orgId,
      room_id: roomId, assignment_source: 'auto', confidence: 0.7,
    }, { onConflict: 'media_item_id' }).select();
  }
}

function groupByTimeGap(items: MediaForGrouping[], gapMs: number): MediaForGrouping[][] {
  if (items.length === 0) return [];
  const groups: MediaForGrouping[][] = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1].capture_time ? new Date(items[i - 1].capture_time!).getTime() : 0;
    const curr = items[i].capture_time ? new Date(items[i].capture_time!).getTime() : 0;
    if (curr - prev > gapMs && prev > 0 && curr > 0) {
      groups.push([items[i]]);
    } else {
      groups[groups.length - 1].push(items[i]);
    }
  }
  return groups;
}
