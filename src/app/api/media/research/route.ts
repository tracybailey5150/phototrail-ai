import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { mediaId } = await request.json();
  if (!mediaId) return NextResponse.json({ error: 'mediaId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  // Get media item + existing analysis
  const { data: item } = await admin.from('media_items')
    .select('id, original_storage_path, thumbnail_path, original_mime_type, capture_time, capture_time_source, gps_latitude, gps_longitude')
    .eq('id', mediaId).eq('org_id', profile.org_id).single();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: existingAnalysis } = await admin.from('media_ai_analysis')
    .select('summary, scene_type, location_candidates, landmarks, objects, estimated_location')
    .eq('media_item_id', mediaId).single();

  const { data: location } = await admin.from('media_locations')
    .select('city, state_province, country, place_name, raw_latitude, raw_longitude, timezone')
    .eq('media_item_id', mediaId).single();

  const { data: timestamp } = await admin.from('media_timestamps')
    .select('best_capture_time, capture_time_source, capture_timezone')
    .eq('media_item_id', mediaId).single();

  // Get the image for deep analysis
  let imageBase64: string | null = null;
  if (item.thumbnail_path) {
    const { data: file } = await admin.storage.from('derivatives').download(item.thumbnail_path);
    if (file) imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  }
  if (!imageBase64 && !item.original_mime_type?.startsWith('video/')) {
    const { data: file } = await admin.storage.from('originals').download(item.original_storage_path);
    if (file) {
      const buf = Buffer.from(await file.arrayBuffer());
      const sharp = (await import('sharp')).default;
      const resized = await sharp(buf).resize(1200, 1200, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
      imageBase64 = resized.toString('base64');
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 });

  // Build rich context from all available data
  const captureTime = item.capture_time || timestamp?.best_capture_time;
  const timeSource = item.capture_time_source || timestamp?.capture_time_source;

  const context = [
    existingAnalysis?.summary ? `Initial AI description: ${existingAnalysis.summary}` : '',
    existingAnalysis?.scene_type ? `Scene type: ${existingAnalysis.scene_type}` : '',
    captureTime ? `Date/Time photo was taken: ${new Date(captureTime).toLocaleString('en-US', { timeZone: timestamp?.capture_timezone || 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} (source: ${timeSource || 'unknown'})` : '',
    item.gps_latitude ? `GPS Coordinates: ${item.gps_latitude}, ${item.gps_longitude}` : '',
    location?.city ? `Geocoded Location: ${[location.place_name, location.city, location.state_province, location.country].filter(Boolean).join(', ')}` : '',
    location?.raw_latitude ? `GPS: ${location.raw_latitude}, ${location.raw_longitude}` : '',
    location?.timezone ? `Timezone: ${location.timezone}` : '',
    existingAnalysis?.estimated_location ? `AI estimated location: ${existingAnalysis.estimated_location}` : '',
    existingAnalysis?.landmarks ? `Landmarks detected: ${JSON.stringify(existingAnalysis.landmarks)}` : '',
    existingAnalysis?.objects ? `Objects detected: ${JSON.stringify(existingAnalysis.objects)}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a world-class image researcher and historian. Perform an EXTENSIVE deep analysis of this image. Go far beyond a basic description.

${context ? `Previous analysis context:\n${context}\n` : ''}

Provide a comprehensive research report covering ALL of the following:

1. **DETAILED IDENTIFICATION**: Name every building, landmark, bridge, monument, street, sign, vehicle, and notable feature visible. Be specific — give full names, addresses, architectural styles, construction dates.

2. **HISTORICAL CONTEXT**: What is the history of the location/buildings shown? When were they built? By whom? What are they known for? Any significant events that happened there?

3. **GEOGRAPHIC ANALYSIS**: Exact location if identifiable — city, neighborhood, street intersection, GPS coordinates if you can determine them. Which direction is the camera facing?

4. **ARCHITECTURAL DETAILS**: Describe architectural styles, materials, notable design features, height, floors, any distinctive elements.

5. **CULTURAL SIGNIFICANCE**: Why is this place important? Tourism significance, cultural landmarks, famous events, movies filmed here, etc.

6. **TIME ANALYSIS**: Based on lighting, shadows, weather, foliage, clothing, vehicles — estimate the time of day, season, and approximate year/era.

7. **TECHNICAL PHOTOGRAPHY NOTES**: Camera angle, lens characteristics, composition choices, lighting conditions.

8. **INTERESTING FACTS**: Any fascinating details, trivia, or lesser-known facts about what's shown.

Write in a rich, engaging, informative style. Be thorough — this should read like a professional travel/architecture guide entry. 500-1000 words.`;

  try {
    const messages: Array<{ role: string; content: unknown }> = [{
      role: 'user',
      content: imageBase64 ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt },
      ] : prompt,
    }];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'AI research failed: ' + err.slice(0, 200) }, { status: 500 });
    }

    const data = await res.json();
    const research = data.content?.[0]?.text || 'No research generated';

    return NextResponse.json({ research });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Research failed' }, { status: 500 });
  }
}
