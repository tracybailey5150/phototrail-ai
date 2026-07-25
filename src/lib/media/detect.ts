const IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
  'image/heic', 'image/heif', 'image/avif', 'image/svg+xml',
]);

const VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
]);

const RAW_TYPES = new Set([
  'image/x-canon-cr2', 'image/x-nikon-nef', 'image/x-sony-arw',
  'image/x-adobe-dng', 'image/x-fuji-raf', 'image/x-panasonic-rw2',
]);

export type MediaType = 'image' | 'video' | 'raw' | 'unknown';

export function detectMediaType(mimeType: string): MediaType {
  if (IMAGE_TYPES.has(mimeType)) return 'image';
  if (VIDEO_TYPES.has(mimeType)) return 'video';
  if (RAW_TYPES.has(mimeType)) return 'raw';
  return 'unknown';
}

export function isHeic(mimeType: string): boolean {
  return mimeType === 'image/heic' || mimeType === 'image/heif';
}

export function isImage(mimeType: string): boolean {
  return IMAGE_TYPES.has(mimeType) || RAW_TYPES.has(mimeType);
}

export function isVideo(mimeType: string): boolean {
  return VIDEO_TYPES.has(mimeType);
}

export function isScreenshot(filename: string, width?: number, height?: number): boolean {
  const lower = filename.toLowerCase();
  if (lower.includes('screenshot') || lower.includes('screen shot')) return true;
  if (lower.startsWith('img_') && lower.includes('_')) return false;
  // Common phone screenshot dimensions
  if (width && height) {
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (ratio > 1.7 && ratio < 2.3 && (width === 1170 || width === 1284 || width === 1080 || width === 1440)) {
      return true;
    }
  }
  return false;
}
