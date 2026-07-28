import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const orgId = profile.org_id;

  // Get all media items without GPS
  const { data: items } = await admin.from('media_items')
    .select('id, original_filename')
    .eq('org_id', orgId)
    .is('gps_latitude', null)
    .eq('processing_status', 'completed')
    .limit(200);

  if (!items || items.length === 0) {
    return NextResponse.json({ locations: [] });
  }

  const mediaIds = items.map(i => i.id);

  // Get all AI analysis and location data for these items
  const [
    { data: analyses },
    { data: locations },
  ] = await Promise.all([
    admin.from('media_ai_analysis').select('media_item_id, summary, estimated_location, location_candidates, landmarks, scene_type').in('media_item_id', mediaIds),
    admin.from('media_locations').select('media_item_id, city, state_province, country, place_name, landmark').in('media_item_id', mediaIds),
  ]);

  const analysisMap = new Map((analyses || []).map(a => [a.media_item_id, a]));
  const locationMap = new Map((locations || []).map(l => [l.media_item_id, l]));

  // Build location context for each photo
  const photoContexts: { id: string; filename: string; context: string }[] = [];

  for (const item of items) {
    const analysis = analysisMap.get(item.id);
    const location = locationMap.get(item.id);

    const parts: string[] = [];
    if (analysis?.estimated_location) parts.push(`AI estimated location: ${analysis.estimated_location}`);
    if (analysis?.location_candidates?.length) parts.push(`Location candidates: ${JSON.stringify(analysis.location_candidates)}`);
    if (analysis?.landmarks?.length) parts.push(`Landmarks: ${JSON.stringify(analysis.landmarks)}`);
    if (analysis?.summary) parts.push(`Description: ${analysis.summary}`);
    if (location?.city) parts.push(`City: ${location.city}`);
    if (location?.state_province) parts.push(`State: ${location.state_province}`);
    if (location?.country) parts.push(`Country: ${location.country}`);
    if (location?.place_name) parts.push(`Place: ${location.place_name}`);
    if (location?.landmark) parts.push(`Landmark: ${location.landmark}`);

    // Only include photos that have some location context to work with
    if (parts.length > 0) {
      photoContexts.push({
        id: item.id,
        filename: item.original_filename,
        context: parts.join('\n'),
      });
    }
  }

  if (photoContexts.length === 0) {
    return NextResponse.json({ locations: [] });
  }

  // Batch photos into groups of 20 for AI processing
  const results: { media_item_id: string; latitude: number; longitude: number; location_label: string; confidence: string }[] = [];
  const batchSize = 20;

  for (let i = 0; i < photoContexts.length; i += batchSize) {
    const batch = photoContexts.slice(i, i + batchSize);

    const prompt = `You are a geolocation expert. For each photo below, I have AI-generated descriptions and location hints but NO GPS coordinates.
Based on the available context, estimate the most likely latitude and longitude coordinates for each photo.

Return ONLY a JSON array with one object per photo:
[
  {
    "id": "photo_id",
    "latitude": 36.0726,
    "longitude": -94.1574,
    "location_label": "Bentonville, AR",
    "confidence": "high|medium|low"
  }
]

Rules:
- Use the description, landmarks, location candidates, and any other clues to determine coordinates
- For well-known landmarks, use their exact coordinates
- For cities/neighborhoods, use the center of that area
- If a specific building or venue is mentioned, use its coordinates
- Set confidence to "high" if a specific landmark/building is identified, "medium" for a city/neighborhood, "low" for a broad region
- If you truly cannot determine any location, omit that photo from the results
- Return ONLY the JSON array, no other text

Photos to locate:
${batch.map((p, idx) => `--- Photo ${idx + 1} (id: ${p.id}) ---\nFilename: ${p.filename}\n${p.context}`).join('\n\n')}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr) as { id: string; latitude: number; longitude: number; location_label: string; confidence: string }[];
      for (const loc of parsed) {
        if (loc.latitude && loc.longitude && Math.abs(loc.latitude) <= 90 && Math.abs(loc.longitude) <= 180) {
          results.push({ media_item_id: loc.id, ...loc });
        }
      }
    } catch {
      // Continue with next batch
    }
  }

  return NextResponse.json({ locations: results });
}
