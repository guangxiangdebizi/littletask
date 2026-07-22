import {
  groundedSuggestionInputSchema,
  insightSchema,
  type GroundedSuggestionInput,
} from '@littletask/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryIntakeStore } from './stores/in-memory-store';

function suggestionInput(intakeId: string, actionId: string): GroundedSuggestionInput {
  return groundedSuggestionInputSchema.parse({
    intakeId,
    locale: 'zh-CN',
    summary: '已经完成一次会议创建。',
    actions: [{ id: actionId, type: 'create_event' }],
    evidence: [
      {
        id: 'E1',
        value: {
          source: 'action',
          label: 'Action Card',
          detail: '已创建测试会议',
          intakeId,
          actionId,
        },
      },
    ],
  });
}

describe('grounded suggestion queue', () => {
  it('rejects an older generation after newer context has been enqueued', async () => {
    const store = new InMemoryIntakeStore();
    const intakeId = crypto.randomUUID();
    const actionId = crypto.randomUUID();
    const firstInput = suggestionInput(intakeId, actionId);
    const registeredEvidence = firstInput.evidence[0];
    if (!registeredEvidence) throw new Error('Expected registered evidence');

    expect(await store.enqueueSuggestionJob(firstInput, 'a'.repeat(64), 3)).toBe(true);
    const firstJob = await store.claimSuggestionJob('worker-a', 60_000);
    expect(firstJob?.generation).toBe(1);
    if (!firstJob) throw new Error('Expected the first suggestion job');

    const secondInput = { ...firstInput, summary: '会议已经创建，并补充了新上下文。' };
    expect(await store.enqueueSuggestionJob(secondInput, 'b'.repeat(64), 3)).toBe(true);
    const staleInsight = insightSchema.parse({
      id: crypto.randomUUID(),
      intakeId,
      actionId,
      type: 'meeting_preparation',
      kind: 'suggestion',
      generator: 'model',
      priority: 'medium',
      title: '旧建议',
      body: '这条建议来自已经过期的上下文。',
      evidence: [registeredEvidence.value],
      createdAt: new Date().toISOString(),
    });
    expect(
      await store.completeSuggestionJob(firstJob.jobId, firstJob.generation, [staleInsight]),
    ).toBe(false);

    const secondJob = await store.claimSuggestionJob('worker-b', 60_000);
    expect(secondJob?.generation).toBe(2);
    if (!secondJob) throw new Error('Expected the second suggestion job');
    const currentInsight = insightSchema.parse({
      ...staleInsight,
      id: crypto.randomUUID(),
      title: '新建议',
      body: '这条建议引用当前 generation 的证据。',
    });
    expect(
      await store.completeSuggestionJob(secondJob.jobId, secondJob.generation, [currentInsight]),
    ).toBe(true);
    expect(await store.getSuggestionJobState(intakeId)).toEqual({
      status: 'ready',
      generation: 2,
    });
    expect(await store.getInsights(intakeId)).toEqual([currentInsight]);
  });
});
