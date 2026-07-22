import { analysisDraftSchema, type AnalysisDraft } from '@littletask/contracts';
import { z } from 'zod';

const confidenceSchema = z.enum(['high', 'medium', 'low']);
const evidenceSourceSchema = z.enum(['screenshot', 'note', 'contact', 'calendar', 'history']);

const modelEvidenceSchema = z.object({
  source: evidenceSourceSchema,
  quote: z.string().min(1).max(240),
  author: z.string().min(1).max(80).nullable(),
});

const modelAttendeeSchema = z.object({
  displayName: z.string().min(1).max(120),
  localContactId: z.string().min(1).max(200).nullable(),
});

const modelMeetingPayloadSchema = z.object({
  title: z.string().min(1).max(160),
  attendees: z.array(modelAttendeeSchema).max(30),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().min(1).max(80),
  location: z.string().max(240).nullable(),
  notes: z.string().max(2_000).nullable(),
  suggestedDurationMinutes: z.number().int().min(5).max(1_440).nullable(),
});

const modelContactPayloadSchema = z.object({
  givenName: z.string().max(80),
  familyName: z.string().max(80),
  displayName: z.string().min(1).max(160),
  phones: z.array(z.string().min(3).max(40)).max(10),
  emails: z.array(z.string().email().max(254)).max(10),
  company: z.string().max(160).nullable(),
  jobTitle: z.string().max(160).nullable(),
  address: z.string().max(300).nullable(),
  notes: z.string().max(2_000).nullable(),
});

const contactFieldSchema = z.enum([
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

const modelUpdateContactPayloadSchema = z.object({
  target: z.object({
    displayName: z.string().min(1).max(160),
    localContactId: z.string().min(1).max(200).nullable(),
    candidateCount: z.number().int().min(0).max(100),
  }),
  changes: z
    .array(
      z.object({
        field: contactFieldSchema,
        previousValue: z.string().max(2_000).nullable(),
        nextValue: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
});

const proposalBaseShape = {
  confidence: confidenceSchema,
  evidence: z.array(modelEvidenceSchema).min(1).max(12),
  assumptions: z.array(z.string().min(1).max(240)).max(12),
};

const modelActionProposalSchema = z.discriminatedUnion('type', [
  z.object({
    ...proposalBaseShape,
    type: z.literal('create_event'),
    payload: modelMeetingPayloadSchema,
  }),
  z.object({
    ...proposalBaseShape,
    type: z.literal('create_contact'),
    payload: modelContactPayloadSchema,
  }),
  z.object({
    ...proposalBaseShape,
    type: z.literal('update_contact'),
    payload: modelUpdateContactPayloadSchema,
  }),
]);

/**
 * Structured Outputs requires every field to be present. Nullable fields are
 * converted back to optional domain fields after the SDK parses the response.
 */
export const modelAnalysisDraftSchema = z.object({
  summary: z.string().min(1).max(1_000),
  participants: z.array(z.string().min(1).max(120)).max(30),
  facts: z.array(z.string().min(1).max(300)).max(50),
  uncertainties: z.array(z.string().min(1).max(300)).max(30),
  clarifyingQuestions: z
    .array(
      z.object({
        prompt: z.string().min(1).max(300),
        actionIndex: z.number().int().min(0).nullable(),
        options: z.array(z.string().min(1).max(160)).max(8),
      }),
    )
    .max(30),
  actions: z.array(modelActionProposalSchema).max(20),
});

export type ModelAnalysisDraft = z.infer<typeof modelAnalysisDraftSchema>;

export const modelGroundedSuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        actionId: z.string().uuid().nullable(),
        type: z.enum(['meeting_preparation', 'follow_up', 'reply_suggestion']),
        priority: z.enum(['medium', 'low']),
        title: z.string().min(1).max(160),
        body: z.string().min(1).max(1_000),
        evidenceIds: z
          .array(z.string().regex(/^E[1-9][0-9]*$/))
          .min(1)
          .max(5),
      }),
    )
    .max(4),
});

export type ModelGroundedSuggestions = z.infer<typeof modelGroundedSuggestionsSchema>;

function evidenceForDomain(evidence: ModelAnalysisDraft['actions'][number]['evidence']) {
  return evidence.map((item) => ({
    source: item.source,
    quote: item.quote,
    ...(item.author === null ? {} : { author: item.author }),
  }));
}

export function toAnalysisDraft(value: ModelAnalysisDraft): AnalysisDraft {
  return analysisDraftSchema.parse({
    summary: value.summary,
    participants: value.participants,
    facts: value.facts,
    uncertainties: value.uncertainties,
    clarifyingQuestions: value.clarifyingQuestions.map((question) => ({
      prompt: question.prompt,
      options: question.options,
      ...(question.actionIndex === null ? {} : { actionIndex: question.actionIndex }),
    })),
    actions: value.actions.map((action) => {
      const common = {
        type: action.type,
        confidence: action.confidence,
        evidence: evidenceForDomain(action.evidence),
        assumptions: action.assumptions,
      };

      switch (action.type) {
        case 'create_event':
          return {
            ...common,
            type: action.type,
            payload: {
              title: action.payload.title,
              attendees: action.payload.attendees.map((attendee) => ({
                displayName: attendee.displayName,
                ...(attendee.localContactId === null
                  ? {}
                  : { localContactId: attendee.localContactId }),
              })),
              startAt: action.payload.startAt,
              timezone: action.payload.timezone,
              ...(action.payload.endAt === null ? {} : { endAt: action.payload.endAt }),
              ...(action.payload.location === null ? {} : { location: action.payload.location }),
              ...(action.payload.notes === null ? {} : { notes: action.payload.notes }),
              ...(action.payload.suggestedDurationMinutes === null
                ? {}
                : { suggestedDurationMinutes: action.payload.suggestedDurationMinutes }),
            },
          };
        case 'create_contact':
          return {
            ...common,
            type: action.type,
            payload: {
              givenName: action.payload.givenName,
              familyName: action.payload.familyName,
              displayName: action.payload.displayName,
              phones: action.payload.phones,
              emails: action.payload.emails,
              ...(action.payload.company === null ? {} : { company: action.payload.company }),
              ...(action.payload.jobTitle === null ? {} : { jobTitle: action.payload.jobTitle }),
              ...(action.payload.address === null ? {} : { address: action.payload.address }),
              ...(action.payload.notes === null ? {} : { notes: action.payload.notes }),
            },
          };
        case 'update_contact':
          return {
            ...common,
            type: action.type,
            payload: {
              target: {
                displayName: action.payload.target.displayName,
                candidateCount: action.payload.target.candidateCount,
                ...(action.payload.target.localContactId === null
                  ? {}
                  : { localContactId: action.payload.target.localContactId }),
              },
              changes: action.payload.changes,
            },
          };
      }
    }),
  });
}
