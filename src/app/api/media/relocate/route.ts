import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const body = await request.json();
  const { media_item_id, mode, latitude, longitude, location_hint } = body as {
    media_item_id: string;
    mode: 'manual' | 'ai_hint';
    latitude?: number;
    longitude?: number;
    location_hint?: string;
  };

  if (!media_item_id || !mode) {
    return NextResponse.json({ error: 'Missing media_item_id or mode' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: item } = await admin.from('media_items')
    .select('id, original_filename')
    .eq('id', media_item_id)
    .eq('org_id', profile.org_id)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (mode === 'manual') {
    if (!latitude || !longitude || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    await admin.from('media_items').update({
      gps_latitude: latitude,
      gps_longitude: longitude,
      updated_at: new Date().toISOString(),
    }).eq('id', media_item_id);

    return NextResponse.json({ latitude, longitude, location_label: 'Manual location' });
  }

  if (mode === 'ai_hint') {
    if (!location_hint?.trim()) {
      return NextResponse.json({ error: 'Missing location_hint' }, { status: 400 });
    }

    // Get existing AI analysis for additional context
    const { data: analysis } = await admin.from('media_ai_analysis')
      .select('summary, location_candidates, landmarks, raw_response')
      .eq('media_item_id', media_item_id)
      .single();

    const rawResponse = analysis?.raw_response as Record<string, unknown> | null;
    const context = [
      `User says this photo is at: ${location_hint}`,
      analysis?.summary ? `AI description: ${analysis.summary.slice(0, 300)}` : '',
      rawResponse?.estimated_location ? `Previous AI estimate: ${rawResponse.estimated_location}` : '',
      analysis?.landmarks?.length ? `Landmarks: ${JSON.stringify(analysis.landmarks)}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `You are a geolocation expert. A user has provided a location hint for a photo. Using their hint and any AI analysis context, determine the exact latitude and longitude coordinates.

${context}

Return ONLY a JSON object:
{
  "latitude": 41.8827,
  "longitude": -87.6233,
  "location_label": "Navy Pier, Chicago, IL"
}

Rules:
- The user's hint takes priority over any AI estimates
- For well-known places, use their exact coordinates
- For a street address, use its coordinates
- For a neighborhood or area, use its center
- Return ONLY the JSON object, no other text`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
      }

      const data = await res.json();
      let text = data.content?.[0]?.text || '';
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const result = JSON.parse(text);
      if (!result.latitude || !result.longitude || Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180) {
        return NextResponse.json({ error: 'AI returned invalid coordinates' }, { status: 500 });
      }

      // Save to database
      await admin.from('media_items').update({
        gps_latitude: result.latitude,
        gps_longitude: result.longitude,
        updated_at: new Date().toISOString(),
      }).eq('id', media_item_id);

      return NextResponse.json({
        latitude: result.latitude,
        longitude: result.longitude,
        location_label: result.location_label || location_hint,
      });
    } catch {
      return NextResponse.json({ error: 'Failed to resolve location' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
}
