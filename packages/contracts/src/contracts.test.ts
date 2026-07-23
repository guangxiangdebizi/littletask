import { describe, expect, it } from 'vitest';

import {
  actionProposalSchema,
  activityResponseSchema,
  analysisDraftSchema,
  historyPageSchema,
} from './index';

describe('action contracts', () => {
  it('accepts a grounded meeting proposal', () => {
    const result = actionProposalSchema.safeParse({
      type: 'create_event',
      confidence: 'high',
      evidence: [{ source: 'screenshot', quote: '明天下午三点见' }],
      assumptions: ['结束时间按 60 分钟建议'],
      payload: {
        title: '与张明见面',
        attendees: [{ displayName: '张明' }],
        startAt: '2026-07-23T15:00:00+08:00',
        timezone: 'Asia/Shanghai',
        suggestedDurationMinutes: 60,
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects analysis actions without evidence', () => {
    const result = analysisDraftSchema.safeParse({
      summary: '计划见面',
      participants: ['张明'],
      facts: [],
      uncertainties: [],
      clarifyingQuestions: [],
      actions: [
        {
          type: 'create_event',
          confidence: 'high',
          evidence: [],
          assumptions: [],
          payload: {
            title: '见面',
            attendees: [],
            startAt: '2026-07-23T15:00:00+08:00',
            timezone: 'Asia/Shanghai',
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a paginated history summary and structured provenance event', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      historyPageSchema.safeParse({
        items: [
          {
            id,
            status: 'ready',
            summary: '约好明天下午见面。',
            outcome: 'partial',
            actions: {
              total: 2,
              needsReview: 0,
              confirmed: 0,
              succeeded: 1,
              failed: 0,
            },
            createdAt: '2026-07-22T06:00:00.000Z',
            updatedAt: '2026-07-22T06:05:00.000Z',
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      activityResponseSchema.safeParse({
        items: [
          {
            id,
            type: 'action_revised',
            source: 'user',
            actionId: '22222222-2222-4222-8222-222222222222',
            actionType: 'create_event',
            revision: 2,
            occurredAt: '2026-07-22T06:05:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
