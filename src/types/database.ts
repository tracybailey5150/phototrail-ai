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
