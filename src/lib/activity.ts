import { createAdminClient } from '@/lib/supabase/admin';

interface ActivityParams {
  orgId: string;
  actorId?: string;
  type: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: ActivityParams) {
  const admin = createAdminClient();
  await admin.from('activity_events').insert({
    org_id: params.orgId,
    actor_id: params.actorId || null,
    type: params.type,
    title: params.title,
    description: params.description || null,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    metadata: params.metadata || {},
  });
}
