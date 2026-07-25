import exifr from 'exifr';

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
    const exif = await exifr.parse(buffer, {
      gps: true,
      tiff: true,
      exif: true,
      iptc: true,
      xmp: true,
      icc: false,
      interop: false,
      makerNote: false,
      translateValues: true,
      translateKeys: true,
      reviveValues: true,
      mergeOutput: true,
    });

    if (!exif) return result;

    result.raw = exif;
    result.width = exif.ImageWidth || exif.ExifImageWidth || exif.PixelXDimension;
    result.height = exif.ImageHeight || exif.ExifImageHeight || exif.PixelYDimension;
    result.orientation = exif.Orientation;
    result.cameraMake = exif.Make;
    result.cameraModel = exif.Model;
    result.focalLength = exif.FocalLength;
    result.iso = exif.ISO;
    result.exposureTime = exif.ExposureTime;
    result.fNumber = exif.FNumber;

    // GPS
    if (exif.latitude != null && exif.longitude != null) {
      result.gpsLatitude = exif.latitude;
      result.gpsLongitude = exif.longitude;
      result.gpsAltitude = exif.GPSAltitude;
      result.gpsDirection = exif.GPSImgDirection;
    }

    // Capture time — priority order
    if (exif.DateTimeOriginal) {
      result.captureTime = new Date(exif.DateTimeOriginal);
      result.captureTimeSource = 'exif_datetime_original';
    } else if (exif.CreateDate) {
      result.captureTime = new Date(exif.CreateDate);
      result.captureTimeSource = 'exif_create_date';
    } else if (exif.DateTimeDigitized) {
      result.captureTime = new Date(exif.DateTimeDigitized);
      result.captureTimeSource = 'exif_digitized';
    } else if (exif.ModifyDate) {
      result.captureTime = new Date(exif.ModifyDate);
      result.captureTimeSource = 'exif_modify_date';
    }
  } catch {
    // EXIF extraction failed — return empty result, not an error
  }

  return result;
}
