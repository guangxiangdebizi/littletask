import { z } from 'zod';

import { actionTypeSchema } from './actions';
import { intakeStatusSchema } from './intakes';

export const historyOutcomeSchema = z.enum([
  'pending',
  'partial',
  'completed',
  'needs_attention',
  'no_action',
]);

export const historyActionSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const historyItemSchema = z.object({
  id: z.string().uuid(),
  status: intakeStatusSchema,
  summary: z.string().max(1_000).nullable(),
  outcome: historyOutcomeSchema,
  actions: historyActionSummarySchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const historyQuerySchema = z.object({
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const historyPageSchema = z.object({
  items: z.array(historyItemSchema).max(50),
  nextCursor: z.string().max(300).nullable(),
});

export const activityEventTypeSchema = z.enum([
  'intake_created',
  'analysis_completed',
  'analysis_failed',
  'action_revised',
  'action_confirmed',
  'execution_succeeded',
  'execution_failed',
]);

export const activityEventSchema = z.object({
  id: z.string().uuid(),
  type: activityEventTypeSchema,
  source: z.enum(['user', 'ai', 'system', 'device']),
  actionId: z.string().uuid().optional(),
  actionType: actionTypeSchema.optional(),
  revision: z.number().int().positive().optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,79}$/)
    .optional(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const activityResponseSchema = z.object({
  items: z.array(activityEventSchema).max(200),
});

export const dataSummarySchema = z.object({
  intakes: z.number().int().nonnegative(),
  actions: z.number().int().nonnegative(),
  executionResults: z.number().int().nonnegative(),
  insights: z.number().int().nonnegative(),
  temporaryScreenshots: z.number().int().nonnegative(),
  screenshotsRetainedAfterAnalysis: z.literal(false),
});

export const clearAllDataResponseSchema = z.object({
  deletedIntakes: z.number().int().nonnegative(),
});

export type HistoryOutcome = z.infer<typeof historyOutcomeSchema>;
export type HistoryActionSummary = z.infer<typeof historyActionSummarySchema>;
export type HistoryItem = z.infer<typeof historyItemSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type HistoryPage = z.infer<typeof historyPageSchema>;
export type ActivityEventType = z.infer<typeof activityEventTypeSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type DataSummary = z.infer<typeof dataSummarySchema>;
export type ClearAllDataResponse = z.infer<typeof clearAllDataResponseSchema>;
