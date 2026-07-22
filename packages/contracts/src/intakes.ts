import { z } from 'zod';

import { actionCardSchema, actionProposalSchema } from './actions';

export const intakeStatusSchema = z.enum(['queued', 'processing', 'ready', 'failed']);

export const clarifyingQuestionSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1).max(300),
  actionId: z.string().uuid().optional(),
  options: z.array(z.string().min(1).max(160)).max(8).default([]),
});

export const analysisDraftSchema = z.object({
  summary: z.string().min(1).max(1_000),
  participants: z.array(z.string().min(1).max(120)).max(30).default([]),
  facts: z.array(z.string().min(1).max(300)).max(50).default([]),
  uncertainties: z.array(z.string().min(1).max(300)).max(30).default([]),
  clarifyingQuestions: z.array(
    z.object({
      prompt: z.string().min(1).max(300),
      actionIndex: z.number().int().min(0).optional(),
      options: z.array(z.string().min(1).max(160)).max(8).default([]),
    }),
  ),
  actions: z.array(actionProposalSchema).max(20),
});

export const intakeSchema = z.object({
  id: z.string().uuid(),
  status: intakeStatusSchema,
  note: z.string().max(4_000).nullable(),
  locale: z.string().min(2).max(40),
  timezone: z.string().min(1).max(80),
  image: z.object({
    sha256: z.string().length(64),
    mimeType: z.string().min(1).max(100),
    bytes: z.number().int().nonnegative(),
    originalName: z.string().max(255).nullable(),
  }),
  summary: z.string().max(1_000).nullable(),
  participants: z.array(z.string().max(120)),
  facts: z.array(z.string().max(300)),
  uncertainties: z.array(z.string().max(300)),
  clarifyingQuestions: z.array(clarifyingQuestionSchema),
  actions: z.array(actionCardSchema),
  error: z
    .object({
      code: z.string().min(1).max(80),
      message: z.string().min(1).max(500),
    })
    .nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const createIntakeResponseSchema = z.object({
  id: z.string().uuid(),
  status: intakeStatusSchema,
});

export type IntakeStatus = z.infer<typeof intakeStatusSchema>;
export type AnalysisDraft = z.infer<typeof analysisDraftSchema>;
export type Intake = z.infer<typeof intakeSchema>;
export type CreateIntakeResponse = z.infer<typeof createIntakeResponseSchema>;
