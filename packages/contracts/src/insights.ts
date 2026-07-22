import { z } from 'zod';

export const insightTypeSchema = z.enum([
  'schedule_conflict',
  'duplicate_contact',
  'missing_information',
  'meeting_preparation',
  'follow_up',
  'reply_suggestion',
]);

export const insightSchema = z.object({
  id: z.string().uuid(),
  intakeId: z.string().uuid(),
  actionId: z.string().uuid().optional(),
  type: insightTypeSchema,
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1_000),
  evidence: z.array(z.string().min(1).max(300)).min(1).max(10),
  createdAt: z.string().datetime({ offset: true }),
});

export type Insight = z.infer<typeof insightSchema>;
