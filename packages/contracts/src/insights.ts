import { z } from 'zod';

export const insightTypeSchema = z.enum([
  'schedule_conflict',
  'duplicate_contact',
  'missing_information',
  'meeting_preparation',
  'follow_up',
  'reply_suggestion',
]);

export const insightKindSchema = z.enum(['observation', 'suggestion']);

export const insightEvidenceSchema = z.object({
  source: z.enum([
    'action',
    'screenshot',
    'note',
    'contact_check',
    'calendar_check',
    'history',
    'system',
  ]),
  label: z.string().min(1).max(80),
  detail: z.string().min(1).max(300),
  intakeId: z.string().uuid().optional(),
  actionId: z.string().uuid().optional(),
});

export const insightSchema = z.object({
  id: z.string().uuid(),
  intakeId: z.string().uuid(),
  actionId: z.string().uuid().optional(),
  type: insightTypeSchema,
  kind: insightKindSchema,
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1_000),
  evidence: z.array(insightEvidenceSchema).min(1).max(10),
  createdAt: z.string().datetime({ offset: true }),
});

export type Insight = z.infer<typeof insightSchema>;
export type InsightEvidence = z.infer<typeof insightEvidenceSchema>;
