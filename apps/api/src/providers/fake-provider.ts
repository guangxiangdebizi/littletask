import { createFakeAnalysis } from '@littletask/domain';

import type { AIProvider } from '../types';

export class FakeAIProvider implements AIProvider {
  async analyze(input: Parameters<AIProvider['analyze']>[0]) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return createFakeAnalysis({
      note: input.note,
      now: input.now,
      timezone: input.timezone,
    });
  }

  async review(
    _input: Parameters<AIProvider['review']>[0],
    draft: Parameters<AIProvider['review']>[1],
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return draft;
  }

  async suggestInsights(input: Parameters<AIProvider['suggestInsights']>[0]) {
    const evidence = input.evidence[0];
    const action = input.actions[0];
    if (!evidence) return [];
    return [
      {
        actionId: action?.id ?? null,
        type: 'follow_up' as const,
        priority: 'low' as const,
        title: '确认下一步安排',
        body: '可以根据已经确认的上下文，发送一条简短的后续确认。',
        evidenceIds: [evidence.id],
      },
    ];
  }
}
