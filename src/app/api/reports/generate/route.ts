import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const body = await request.json();
  const { collection_id, report_type } = body as { collection_id: string; report_type: string };

  if (!collection_id || !report_type) {
    return NextResponse.json({ error: 'Missing collection_id or report_type' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch collection
  const { data: collection } = await admin.from('collections')
    .select('*')
    .eq('id', collection_id)
    .eq('org_id', profile.org_id)
    .single();

  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  // Fetch all media items
  const { data: items } = await admin.from('media_items')
    .select('*')
    .eq('collection_id', collection_id)
    .eq('org_id', profile.org_id)
    .order('capture_time', { ascending: true });

  const mediaItems = items || [];
  const mediaIds = mediaItems.map(i => i.id);

  // Fetch related data in parallel
  const [
    { data: locations },
    { data: aiAnalysis },
    { data: equipment },
    { data: timestamps },
  ] = await Promise.all([
    admin.from('media_locations').select('*').in('media_item_id', mediaIds),
    admin.from('media_ai_analysis').select('*').in('media_item_id', mediaIds),
    admin.from('media_equipment').select('*').in('media_item_id', mediaIds),
    admin.from('media_timestamps').select('*').in('media_item_id', mediaIds),
  ]);

  // Build context for AI
  const locationMap = new Map((locations || []).map(l => [l.media_item_id, l]));
  const analysisMap = new Map((aiAnalysis || []).map(a => [a.media_item_id, a]));
  const timestampMap = new Map((timestamps || []).map(t => [t.media_item_id, t]));

  const photoSummaries = mediaItems.map(item => {
    const loc = locationMap.get(item.id);
    const ai = analysisMap.get(item.id);
    const ts = timestampMap.get(item.id);
    return {
      filename: item.original_filename,
      date: item.capture_time || ts?.best_capture_time || 'unknown',
      location: loc ? `${loc.city || ''} ${loc.state_province || ''} ${loc.country || ''}`.trim() || `${item.gps_latitude}, ${item.gps_longitude}` : 'unknown',
      place: loc?.place_name || loc?.landmark || '',
      description: ai?.summary || '',
      scene: ai?.scene_type || '',
      objects: ai?.detected_objects || [],
      landmarks: ai?.landmarks || [],
    };
  });

  const equipmentList = (equipment || []).map(e => ({
    name: e.equipment_name || e.model || 'Unknown',
    serial: e.serial_number || '',
    asset_tag: e.asset_tag || '',
    mac: e.mac_address || '',
    location: e.location_in_photo || '',
    condition: e.condition || '',
    media_id: e.media_item_id,
  }));

  let systemPrompt = '';

  if (report_type === 'trip_summary') {
    systemPrompt = `Generate a comprehensive travel trip summary report based on the following photo collection data. Include:
- Trip overview (destination, dates, total photos)
- Day-by-day breakdown with locations visited and highlights
- Key landmarks and points of interest photographed
- Weather/conditions observed if visible
- Recommendations or memorable moments

Collection: "${collection.name}"
${collection.description ? `Description: ${collection.description}` : ''}
${collection.location ? `Destination: ${collection.location}` : ''}
${collection.start_date ? `Start: ${collection.start_date}` : ''}
${collection.end_date ? `End: ${collection.end_date}` : ''}
Total photos: ${mediaItems.length}

Photo data:
${JSON.stringify(photoSummaries, null, 2)}

Write the report in clean markdown format. Be detailed and engaging.`;
  } else if (report_type === 'field_report') {
    systemPrompt = `Generate a professional daily field report based on the following project/job site photo collection. Include:
- Project overview (client, site, project number)
- Daily activity summary with timestamps
- Areas/rooms documented with photo evidence references
- Equipment observed or installed
- Site conditions noted
- Safety observations
- Work progress summary

Collection: "${collection.name}"
${collection.description ? `Description: ${collection.description}` : ''}
${collection.client_name ? `Client: ${collection.client_name}` : ''}
${collection.project_number ? `Project #: ${collection.project_number}` : ''}
${collection.site_address ? `Site: ${collection.site_address}` : ''}
Total photos: ${mediaItems.length}

Photo data:
${JSON.stringify(photoSummaries, null, 2)}

Equipment documented:
${JSON.stringify(equipmentList, null, 2)}

Write the report in professional markdown format suitable for client delivery.`;
  } else if (report_type === 'equipment_report') {
    systemPrompt = `Generate an equipment inventory report based on AI-detected equipment from job site photos. Include:
- Equipment summary table (name, serial, asset tag, MAC, location, condition)
- Equipment by area/location breakdown
- Missing serial numbers or identification gaps
- Condition assessment summary
- Recommendations

Collection: "${collection.name}"
${collection.client_name ? `Client: ${collection.client_name}` : ''}
${collection.project_number ? `Project #: ${collection.project_number}` : ''}
${collection.site_address ? `Site: ${collection.site_address}` : ''}

Equipment detected:
${JSON.stringify(equipmentList, null, 2)}

Photo context:
${JSON.stringify(photoSummaries.filter(p => p.objects.length > 0 || p.description.toLowerCase().includes('equipment')), null, 2)}

Write in professional markdown format with tables where appropriate.`;
  } else {
    return NextResponse.json({ error: 'Invalid report_type' }, { status: 400 });
  }

  // Call Anthropic
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: systemPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Anthropic API error:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }

  const result = await response.json();
  const report = result.content?.[0]?.text || 'No report generated.';

  return NextResponse.json({ report });
}
