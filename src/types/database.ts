export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  invited_by: string | null;
  created_at: string;
}

export type CollectionMode = 'travel' | 'project';
export type CollectionStatus = 'active' | 'archived' | 'completed';

export interface Collection {
  id: string;
  org_id: string;
  created_by: string | null;
  mode: CollectionMode;
  name: string;
  description: string | null;
  status: CollectionStatus;
  cover_image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  client_name: string | null;
  project_number: string | null;
  site_address: string | null;
  metadata: Record<string, unknown>;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionSettings {
  id: string;
  collection_id: string;
  org_id: string;
  auto_group: boolean;
  ai_analysis: boolean;
  extract_gps: boolean;
  extract_serial_numbers: boolean;
  default_confidence_threshold: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
export type JobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface MediaItem {
  id: string;
  collection_id: string;
  org_id: string;
  uploaded_by: string | null;
  original_filename: string;
  original_mime_type: string;
  detected_mime_type: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  orientation: number | null;
  original_storage_path: string;
  thumbnail_path: string | null;
  preview_path: string | null;
  sha256_hash: string | null;
  perceptual_hash: string | null;
  capture_time: string | null;
  capture_time_source: string | null;
  file_created_at: string | null;
  file_modified_at: string | null;
  upload_time: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_altitude: number | null;
  gps_direction: number | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
  needs_review: boolean;
  is_screenshot: boolean;
  exif_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJob {
  id: string;
  media_item_id: string;
  org_id: string;
  step: string;
  status: JobStepStatus;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  attempt: number;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  org_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
