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
export const insightGeneratorSchema = z.enum(['rules', 'model']);

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
  generator: insightGeneratorSchema,
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1_000),
  evidence: z.array(insightEvidenceSchema).min(1).max(10),
  createdAt: z.string().datetime({ offset: true }),
});

export type Insight = z.infer<typeof insightSchema>;
export type InsightEvidence = z.infer<typeof insightEvidenceSchema>;
export type InsightType = z.infer<typeof insightTypeSchema>;

export const insightGenerationStatusSchema = z.enum([
  'not_requested',
  'queued',
  'processing',
  'ready',
  'failed',
]);

export const insightResponseSchema = z.object({
  items: z.array(insightSchema),
  generationStatus: insightGenerationStatusSchema,
});

export type InsightGenerationStatus = z.infer<typeof insightGenerationStatusSchema>;
export type InsightResponse = z.infer<typeof insightResponseSchema>;

export const groundedSuggestionInputSchema = z.object({
  intakeId: z.string().uuid(),
  locale: z.string().min(2).max(40),
  summary: z.string().max(1_000).nullable(),
  actions: z
    .array(
      z.object({
        id: z.string().uuid(),
        type: z.enum(['create_event', 'create_contact', 'update_contact']),
      }),
    )
    .max(20),
  evidence: z
    .array(
      z.object({
        id: z.string().regex(/^E[1-9][0-9]*$/),
        value: insightEvidenceSchema,
      }),
    )
    .min(1)
    .max(50),
});

export type GroundedSuggestionInput = z.infer<typeof groundedSuggestionInputSchema>;
