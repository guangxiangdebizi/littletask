import { z } from 'zod';

export const actionTypeSchema = z.enum(['create_event', 'create_contact', 'update_contact']);

export const actionStatusSchema = z.enum([
  'draft',
  'needs_input',
  'ready',
  'confirmed',
  'executing',
  'succeeded',
  'failed',
  'cancelled',
]);

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const evidenceSchema = z.object({
  source: z.enum(['screenshot', 'note', 'contact', 'calendar', 'history']),
  quote: z.string().min(1).max(240),
  author: z.string().min(1).max(80).optional(),
});

export const attendeeSchema = z.object({
  displayName: z.string().min(1).max(120),
  localContactId: z.string().min(1).max(200).optional(),
});

export const meetingPayloadSchema = z
  .object({
    title: z.string().min(1).max(160),
    attendees: z.array(attendeeSchema).max(30).default([]),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }).optional(),
    timezone: z.string().min(1).max(80),
    location: z.string().max(240).optional(),
    notes: z.string().max(2_000).optional(),
    suggestedDurationMinutes: z.number().int().min(5).max(1_440).optional(),
  })
  .refine(({ startAt, endAt }) => endAt === undefined || Date.parse(endAt) > Date.parse(startAt), {
    message: 'endAt must be after startAt',
    path: ['endAt'],
  });

export const contactPayloadSchema = z.object({
  givenName: z.string().max(80).default(''),
  familyName: z.string().max(80).default(''),
  displayName: z.string().min(1).max(160),
  phones: z.array(z.string().min(3).max(40)).max(10).default([]),
  emails: z.array(z.string().email().max(254)).max(10).default([]),
  company: z.string().max(160).optional(),
  jobTitle: z.string().max(160).optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(2_000).optional(),
});

export const contactFieldSchema = z.enum([
  'givenName',
  'familyName',
  'displayName',
  'phone',
  'email',
  'company',
  'jobTitle',
  'address',
  'notes',
]);

export const contactChangeSchema = z.object({
  field: contactFieldSchema,
  previousValue: z.string().max(2_000).nullable(),
  nextValue: z.string().min(1).max(2_000),
});

export const updateContactPayloadSchema = z.object({
  target: z.object({
    displayName: z.string().min(1).max(160),
    localContactId: z.string().min(1).max(200).optional(),
    candidateCount: z.number().int().min(0).max(100).default(0),
  }),
  changes: z.array(contactChangeSchema).min(1).max(20),
});

const actionCardBaseSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  status: actionStatusSchema,
  confidence: confidenceSchema,
  evidence: z.array(evidenceSchema).min(1).max(12),
  assumptions: z.array(z.string().min(1).max(240)).max(12).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const createEventActionSchema = actionCardBaseSchema.extend({
  type: z.literal('create_event'),
  payload: meetingPayloadSchema,
});

export const createContactActionSchema = actionCardBaseSchema.extend({
  type: z.literal('create_contact'),
  payload: contactPayloadSchema,
});

export const updateContactActionSchema = actionCardBaseSchema.extend({
  type: z.literal('update_contact'),
  payload: updateContactPayloadSchema,
});

export const actionCardSchema = z.discriminatedUnion('type', [
  createEventActionSchema,
  createContactActionSchema,
  updateContactActionSchema,
]);

export const createEventProposalSchema = z.object({
  type: z.literal('create_event'),
  confidence: confidenceSchema,
  evidence: z.array(evidenceSchema).min(1).max(12),
  assumptions: z.array(z.string().min(1).max(240)).max(12).default([]),
  payload: meetingPayloadSchema,
});

export const createContactProposalSchema = z.object({
  type: z.literal('create_contact'),
  confidence: confidenceSchema,
  evidence: z.array(evidenceSchema).min(1).max(12),
  assumptions: z.array(z.string().min(1).max(240)).max(12).default([]),
  payload: contactPayloadSchema,
});

export const updateContactProposalSchema = z.object({
  type: z.literal('update_contact'),
  confidence: confidenceSchema,
  evidence: z.array(evidenceSchema).min(1).max(12),
  assumptions: z.array(z.string().min(1).max(240)).max(12).default([]),
  payload: updateContactPayloadSchema,
});

export const actionProposalSchema = z.discriminatedUnion('type', [
  createEventProposalSchema,
  createContactProposalSchema,
  updateContactProposalSchema,
]);

export type ActionType = z.infer<typeof actionTypeSchema>;
export type ActionStatus = z.infer<typeof actionStatusSchema>;
export type ActionCard = z.infer<typeof actionCardSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type MeetingPayload = z.infer<typeof meetingPayloadSchema>;
export type ContactPayload = z.infer<typeof contactPayloadSchema>;
export type UpdateContactPayload = z.infer<typeof updateContactPayloadSchema>;
