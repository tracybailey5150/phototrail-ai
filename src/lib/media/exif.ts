import sharp from 'sharp';

export interface ExtractedMetadata {
  width?: number;
  height?: number;
  orientation?: number;
  captureTime?: Date;
  captureTimeSource?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  gpsDirection?: number;
  cameraMake?: string;
  cameraModel?: string;
  focalLength?: number;
  iso?: number;
  exposureTime?: number;
  fNumber?: number;
  raw: Record<string, unknown>;
}

export async function extractMetadata(buffer: Buffer): Promise<ExtractedMetadata> {
  const result: ExtractedMetadata = { raw: {} };

  try {
    // Use Sharp for metadata — it works reliably on Vercel (unlike exifr)
    const meta = await sharp(buffer).metadata();

    result.width = meta.width;
    result.height = meta.height;
    result.orientation = meta.orientation;

    // Sharp's EXIF is available as a raw buffer — parse key fields
    if (meta.exif) {
      const exifData = parseExifBuffer(meta.exif);
      result.raw = exifData;
      result.cameraMake = exifData.Make as string | undefined;
      result.cameraModel = exifData.Model as string | undefined;
      result.iso = exifData.ISO as number | undefined;

      // Capture time
      if (exifData.DateTimeOriginal) {
        result.captureTime = parseExifDate(exifData.DateTimeOriginal as string);
        result.captureTimeSource = 'exif_datetime_original';
      } else if (exifData.CreateDate) {
        result.captureTime = parseExifDate(exifData.CreateDate as string);
        result.captureTimeSource = 'exif_create_date';
      } else if (exifData.DateTime) {
        result.captureTime = parseExifDate(exifData.DateTime as string);
        result.captureTimeSource = 'exif_modify_date';
      }

      // GPS
      if (exifData.GPSLatitude != null && exifData.GPSLongitude != null) {
        result.gpsLatitude = exifData.GPSLatitude as number;
        result.gpsLongitude = exifData.GPSLongitude as number;
        result.gpsAltitude = exifData.GPSAltitude as number | undefined;
      }
    }
  } catch (err) {
    // Sharp metadata failed — still return dimensions if possible
    try {
      const meta = await sharp(buffer).metadata();
      result.width = meta.width;
      result.height = meta.height;
    } catch {}
  }

  return result;
}

/**
 * Parse EXIF buffer from Sharp into key-value pairs.
 * Sharp returns raw EXIF as a Buffer — we extract the most important tags.
 */
function parseExifBuffer(exifBuf: Buffer): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const str = exifBuf.toString('binary');

  // Extract ASCII strings that look like EXIF values
  // DateTimeOriginal format: "YYYY:MM:DD HH:MM:SS"
  const datePattern = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;
  const dates: string[] = [];
  let match;
  while ((match = datePattern.exec(str)) !== null) {
    dates.push(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
  }

  if (dates.length > 0) result.DateTimeOriginal = dates[0];
  if (dates.length > 1) result.CreateDate = dates[1];
  if (dates.length > 2) result.DateTime = dates[2];

  // Extract camera make/model — look for known patterns
  const makeModels = str.match(/(?:Apple|Samsung|Google|Canon|Nikon|Sony|Fuji|Panasonic|LG|OnePlus|Xiaomi|Huawei|OLYMPUS|Leica|GoPro|DJI)[^\x00]*/gi);
  if (makeModels && makeModels.length > 0) {
    result.Make = makeModels[0].split('\x00')[0].trim();
    if (makeModels.length > 1) result.Model = makeModels[1].split('\x00')[0].trim();
  }

  // Try to find iPhone model specifically
  const iphoneMatch = str.match(/iPhone[^\x00]*/i);
  if (iphoneMatch) {
    result.Make = 'Apple';
    result.Model = iphoneMatch[0].split('\x00')[0].trim();
  }

  // GPS — look for GPS coordinate bytes (simplified — won't work for all formats)
  // We'll rely on AI to provide location when EXIF GPS isn't extractable this way

  return result;
}

function parseExifDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  // Handle "YYYY-MM-DDTHH:MM:SS" or "YYYY:MM:DD HH:MM:SS"
  const cleaned = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  const d = new Date(cleaned);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) return d;
  return undefined;
}
