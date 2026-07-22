import { describe, expect, it } from 'vitest';

import { actionProposalSchema, analysisDraftSchema } from './index';

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
});
