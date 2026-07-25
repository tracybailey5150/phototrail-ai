/**
 * Timestamp resolution service.
 * Selects the best capture time from available sources using documented priority.
 */

interface TimestampSources {
  exifDateTimeOriginal?: Date | null;
  exifCreateDate?: Date | null;
  exifDigitized?: Date | null;
  exifModifyDate?: Date | null;
  fileCreated?: Date | null;
  fileModified?: Date | null;
  filenameInferred?: Date | null;
  userCorrected?: Date | null;
  uploadTime: Date;
}

interface ResolvedTimestamp {
  bestCaptureTime: Date;
  source: string;
  confidence: number;
  explanation: string;
  needsReview: boolean;
}

/**
 * Priority order:
 * 1. User-confirmed capture time (1.0)
 * 2. EXIF DateTimeOriginal (0.95)
 * 3. EXIF CreateDate (0.90)
 * 4. EXIF DateTimeDigitized (0.85)
 * 5. EXIF ModifyDate (0.70)
 * 6. Filename-inferred (0.50)
 * 7. File-created timestamp (0.30)
 * 8. Upload timestamp (0.10)
 */
export function resolveTimestamp(sources: TimestampSources): ResolvedTimestamp {
  if (sources.userCorrected && isValidDate(sources.userCorrected)) {
    return {
      bestCaptureTime: sources.userCorrected,
      source: 'user_confirmed',
      confidence: 1.0,
      explanation: 'User manually confirmed the capture time.',
      needsReview: false,
    };
  }

  if (sources.exifDateTimeOriginal && isValidDate(sources.exifDateTimeOriginal)) {
    return {
      bestCaptureTime: sources.exifDateTimeOriginal,
      source: 'exif_datetime_original',
      confidence: 0.95,
      explanation: 'Capture time from EXIF DateTimeOriginal — the most reliable embedded timestamp.',
      needsReview: false,
    };
  }

  if (sources.exifCreateDate && isValidDate(sources.exifCreateDate)) {
    return {
      bestCaptureTime: sources.exifCreateDate,
      source: 'exif_create_date',
      confidence: 0.90,
      explanation: 'Capture time from EXIF CreateDate.',
      needsReview: false,
    };
  }

  if (sources.exifDigitized && isValidDate(sources.exifDigitized)) {
    return {
      bestCaptureTime: sources.exifDigitized,
      source: 'exif_digitized',
      confidence: 0.85,
      explanation: 'Capture time from EXIF DateTimeDigitized.',
      needsReview: false,
    };
  }

  if (sources.exifModifyDate && isValidDate(sources.exifModifyDate)) {
    return {
      bestCaptureTime: sources.exifModifyDate,
      source: 'exif_modify_date',
      confidence: 0.70,
      explanation: 'Using EXIF ModifyDate — may reflect editing time rather than capture time.',
      needsReview: true,
    };
  }

  if (sources.filenameInferred && isValidDate(sources.filenameInferred)) {
    return {
      bestCaptureTime: sources.filenameInferred,
      source: 'filename_inference',
      confidence: 0.50,
      explanation: 'Date inferred from filename pattern. May not be accurate.',
      needsReview: true,
    };
  }

  if (sources.fileCreated && isValidDate(sources.fileCreated)) {
    return {
      bestCaptureTime: sources.fileCreated,
      source: 'file_created',
      confidence: 0.30,
      explanation: 'Using file creation timestamp — often reflects copy/transfer time, not capture time.',
      needsReview: true,
    };
  }

  return {
    bestCaptureTime: sources.uploadTime,
    source: 'upload_time',
    confidence: 0.10,
    explanation: 'No capture time available. Using upload time as fallback.',
    needsReview: true,
  };
}

/**
 * Try to extract a date from a filename like IMG_20260722_143052.jpg
 */
export function inferDateFromFilename(filename: string): Date | null {
  // Pattern: YYYYMMDD or YYYY-MM-DD
  const patterns = [
    /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,  // 20260722_143052
    /(\d{4})-(\d{2})-(\d{2})[_T ](\d{2})[:-](\d{2})[:-](\d{2})/,  // 2026-07-22T14:30:52
    /(\d{4})(\d{2})(\d{2})/,  // 20260722
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const [, year, month, day, hour, min, sec] = match;
      const y = parseInt(year);
      const m = parseInt(month);
      const d = parseInt(day);
      if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const date = new Date(y, m - 1, d, parseInt(hour || '0'), parseInt(min || '0'), parseInt(sec || '0'));
        if (isValidDate(date)) return date;
      }
    }
  }

  return null;
}

function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0 && d.getFullYear() >= 1990;
}
