import { createAdminClient } from '@/lib/supabase/admin';

interface AnalysisResult {
  summary: string;
  scene_type: string;
  indoor_outdoor: string;
  lighting: string;
  time_of_day_visual: string;
  activities: string[];
  objects: string[];
  visible_text: string[];
  location_candidates: string[];
  event_candidates: string[];
  quality: {
    sharpness: number;
    exposure: number;
    composition: number;
    overall: number;
  };
  confidence: number;
  reasoning_summary: string;
  // Travel mode
  landmarks?: string[];
  venue_candidates?: string[];
  transportation?: string[];
  weather_appearance?: string;
  scenic_score?: number;
  social_media_score?: number;
  memory_highlight_score?: number;
  suggested_event_name?: string;
  suggested_caption?: string;
  // Project mode
  room_candidates?: string[];
  workstream?: string;
  trade?: string;
  equipment?: {
    manufacturer: string;
    model: string;
    device_type: string;
    serial_number: string;
    mac_address: string;
    asset_tag: string;
    confidence: number;
  }[];
  installation_status?: string;
  visible_issues?: string[];
  safety_concerns?: string[];
  suggested_field_report_note?: string;
  suggested_punch_item?: string;
}

const BASE_SCHEMA = `{
  "summary": "Brief description of what's in the image",
  "scene_type": "e.g. landscape, portrait, equipment, room, food, event",
  "indoor_outdoor": "indoor|outdoor|mixed",
  "lighting": "natural|artificial|mixed|low_light",
  "time_of_day_visual": "morning|midday|afternoon|evening|night|unknown",
  "activities": ["list of activities visible"],
  "objects": ["notable objects"],
  "visible_text": ["any readable text, signs, labels"],
  "location_candidates": ["possible location names"],
  "event_candidates": ["possible event names"],
  "quality": { "sharpness": 0-10, "exposure": 0-10, "composition": 0-10, "overall": 0-10 },
  "confidence": 0.0-1.0,
  "reasoning_summary": "Brief explanation of analysis"
}`;

const TRAVEL_EXTENSION = `,
  "landmarks": ["recognized landmarks"],
  "venue_candidates": ["restaurant, hotel, attraction names"],
  "transportation": ["visible transportation modes"],
  "weather_appearance": "sunny|cloudy|rainy|snowy|foggy|clear",
  "scenic_score": 0-10,
  "social_media_score": 0-10,
  "memory_highlight_score": 0-10,
  "suggested_event_name": "e.g. Navy Pier Visit",
  "suggested_caption": "Short social media caption"`;

const PROJECT_EXTENSION = `,
  "room_candidates": ["possible room numbers or names"],
  "workstream": "e.g. AV, electrical, networking, general construction",
  "trade": "e.g. AV integrator, electrician, low-voltage",
  "equipment": [{"manufacturer":"","model":"","device_type":"","serial_number":"","mac_address":"","asset_tag":"","confidence":0.0}],
  "installation_status": "not_started|in_progress|completed|needs_rework",
  "visible_issues": ["any visible problems"],
  "safety_concerns": ["any safety issues"],
  "suggested_field_report_note": "One-line note for daily report",
  "suggested_punch_item": "Suggested punch list entry if applicable"`;

export async function analyzeImage(
  imageBase64: string,
  mode: 'travel' | 'project',
  context?: { collectionName?: string; clientName?: string; siteName?: string }
): Promise<AnalysisResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const extension = mode === 'travel' ? TRAVEL_EXTENSION : PROJECT_EXTENSION;
  const contextNote = mode === 'project' && context?.clientName
    ? `\nContext: This is a job site photo for client "${context.clientName}" at site "${context.siteName || 'unknown'}". Look for equipment labels, serial numbers, MAC addresses, room numbers, and installation progress.`
    : mode === 'travel' && context?.collectionName
    ? `\nContext: This is a travel/life photo from "${context.collectionName}". Look for landmarks, venues, activities, and memorable moments.`
    : '';

  const prompt = `Analyze this image and return ONLY valid JSON matching this schema. Do not include any text outside the JSON.${contextNote}

Schema:
${BASE_SCHEMA.slice(0, -1)}${extension}
}

Important rules:
- Return ONLY the JSON object, no markdown, no explanation
- For equipment serial numbers and MAC addresses, preserve EXACT characters — do not correct ambiguous characters (0/O, 1/I, 5/S, 8/B)
- Set confidence based on how certain you are about the analysis
- Leave fields as empty arrays or empty strings if not applicable`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Claude API error:', res.status, errText.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr) as AnalysisResult;
    return parsed;
  } catch (err) {
    console.error('AI analysis failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Run OCR-focused analysis on an image to extract visible text.
 */
export async function extractOcr(imageBase64: string): Promise<{ texts: string[]; raw: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: 'Extract ALL visible text from this image. Return ONLY a JSON object: {"texts": ["each piece of text as a separate string"], "raw": "all text concatenated"}. Include signs, labels, serial numbers, MAC addresses, model numbers, room numbers, street signs, menus — everything readable. Preserve exact characters, do not correct ambiguous ones.',
            },
          ],
        }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
