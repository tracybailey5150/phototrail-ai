import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envPath = resolve(import.meta.dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { l = l.replace(/\r/g, ''); const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;

async function main() {
  // Get all media items without GPS
  const { data: items } = await supabase.from('media_items')
    .select('id, original_filename, collection_id')
    .is('gps_latitude', null)
    .eq('processing_status', 'completed')
    .limit(200);

  console.log(`Found ${items.length} photos without GPS`);
  if (!items.length) return;

  const mediaIds = items.map(i => i.id);

  // Get AI analysis
  const { data: analyses } = await supabase.from('media_ai_analysis')
    .select('media_item_id, summary, location_candidates, landmarks, raw_response')
    .in('media_item_id', mediaIds);

  console.log(`Found ${analyses.length} AI analyses`);

  const analysisMap = new Map(analyses.map(a => [a.media_item_id, a]));

  // Build contexts
  const photoContexts = [];
  for (const item of items) {
    const analysis = analysisMap.get(item.id);
    if (!analysis) continue;

    const raw = analysis.raw_response || {};
    const parts = [];
    if (raw.estimated_location) parts.push(`AI estimated location: ${raw.estimated_location}`);
    if (analysis.location_candidates?.length) parts.push(`Location candidates: ${JSON.stringify(analysis.location_candidates)}`);
    if (analysis.landmarks?.length) parts.push(`Landmarks: ${JSON.stringify(analysis.landmarks)}`);
    if (analysis.summary) parts.push(`Description: ${analysis.summary.slice(0, 300)}`);

    if (parts.length > 0) {
      photoContexts.push({ id: item.id, filename: item.original_filename, context: parts.join('\n') });
    }
  }

  console.log(`${photoContexts.length} photos have location context to process`);

  // Process in batches of 20
  const batchSize = 20;
  let totalLocated = 0;

  for (let i = 0; i < photoContexts.length; i += batchSize) {
    const batch = photoContexts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(photoContexts.length / batchSize);
    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} photos)...`);

    const prompt = `You are a geolocation expert. For each photo below, I have AI-generated descriptions and location hints but NO GPS coordinates.
Based on the available context, estimate the most likely latitude and longitude coordinates for each photo.

Return ONLY a JSON array with one object per photo:
[
  {
    "id": "photo_id",
    "latitude": 41.8827,
    "longitude": -87.6233,
    "location_label": "Chicago Riverwalk, Chicago, IL"
  }
]

Rules:
- Use the description, landmarks, location candidates, and any other clues to determine coordinates
- For well-known landmarks, use their exact coordinates
- For cities/neighborhoods, use the center of that area
- If a specific building or venue is mentioned, use its coordinates
- If you truly cannot determine any location, omit that photo from the results
- Return ONLY the JSON array, no other text

Photos to locate:
${batch.map((p, idx) => `--- Photo ${idx + 1} (id: ${p.id}) ---\nFilename: ${p.filename}\n${p.context}`).join('\n\n')}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`  API error: ${res.status} - ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      let text = data.content?.[0]?.text || '';
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const locations = JSON.parse(text);
      let batchLocated = 0;

      for (const loc of locations) {
        if (!loc.latitude || !loc.longitude) continue;
        if (Math.abs(loc.latitude) > 90 || Math.abs(loc.longitude) > 180) continue;

        const { error } = await supabase.from('media_items')
          .update({
            gps_latitude: loc.latitude,
            gps_longitude: loc.longitude,
            updated_at: new Date().toISOString(),
          })
          .eq('id', loc.id);

        if (!error) {
          batchLocated++;
          console.log(`  ✓ ${loc.location_label} (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})`);
        }
      }

      totalLocated += batchLocated;
      console.log(`  Located ${batchLocated}/${batch.length} in this batch`);
    } catch (err) {
      console.error(`  Batch error:`, err.message);
    }
  }

  console.log(`\nDone! Located ${totalLocated}/${photoContexts.length} photos total`);
}

main().catch(console.error);
