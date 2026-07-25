import sharp from 'sharp';

interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
}

export async function generateThumbnail(
  buffer: Buffer,
  maxSize: number = 300
): Promise<ThumbnailResult> {
  const img = sharp(buffer).rotate(); // auto-rotate based on EXIF
  const meta = await img.metadata();

  const result = await img
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    format: 'jpeg',
  };
}

export async function generatePreview(
  buffer: Buffer,
  maxSize: number = 1200
): Promise<ThumbnailResult> {
  const result = await sharp(buffer)
    .rotate()
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    format: 'jpeg',
  };
}

export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
}
