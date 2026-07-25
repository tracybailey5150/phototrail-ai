import { z } from 'zod';

export const createCollectionSchema = z.object({
  mode: z.enum(['travel', 'project']),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional(),
  // Travel fields
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  location: z.string().max(500).optional(),
  // Project fields
  client_name: z.string().max(200).optional(),
  project_number: z.string().max(100).optional(),
  site_address: z.string().max(500).optional(),
});

export const updateCollectionSchema = createCollectionSchema.partial().omit({ mode: true });

export const createOrgSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200),
  full_name: z.string().min(1, 'Your name is required').max(200),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
