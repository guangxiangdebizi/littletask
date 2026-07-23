import {
  actionCardSchema,
  intakeSchema,
  type ActionCard,
  type Intake,
} from '@littletask/contracts';
import { describe, expect, it } from 'vitest';

import { deriveInsights, type ExecutionObservation } from './insight-rules';

const timestamp = '2026-07-22T06:00:00.000Z';
let idSequence = 0;
function createId(): string {
  idSequence += 1;
  return `00000000-0000-4000-8000-${String(idSequence).padStart(12, '0')}`;
}
const runtime = { createId, now: () => new Date(timestamp) };

function intake(actions: ActionCard[], id = createId()): Intake {
  return intakeSchema.parse({
    id,
    status: 'ready',
    note: null,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    image: {
      sha256: 'a'.repeat(64),
      mimeType: 'image/png',
      bytes: 8,
      originalName: null,
    },
    summary: '约定见面并更新联系方式。',
    participants: ['张明'],
    facts: ['明天下午三点见'],
    uncertainties: [],
    clarifyingQuestions: [],
    actions,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function eventAction(status: ActionCard['status'] = 'succeeded'): ActionCard {
  return actionCardSchema.parse({
    id: createId(),
    type: 'create_event',
    revision: 2,
    status,
    confidence: 'high',
    evidence: [{ source: 'screenshot', quote: '明天下午三点在静安见' }],
    assumptions: [],
    payload: {
      title: '与张明见面',
      attendees: [{ displayName: '张明' }],
      startAt: '2026-07-23T07:00:00.000Z',
      endAt: '2026-07-23T08:00:00.000Z',
      timezone: 'Asia/Shanghai',
      location: '静安嘉里中心',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function contactAction(status: ActionCard['status'] = 'failed'): ActionCard {
  return actionCardSchema.parse({
    id: createId(),
    type: 'create_contact',
    revision: 1,
    status,
    confidence: 'high',
    evidence: [{ source: 'note', quote: '这是张明的新号码' }],
    assumptions: [],
    payload: {
      givenName: '明',
      familyName: '张',
      displayName: '张明',
      phones: ['13800138000'],
      emails: [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function execution(actionId: string, input: Partial<ExecutionObservation>): ExecutionObservation {
  return {
    actionId,
    status: 'succeeded',
    deviceContext: { possibleDuplicateContactCount: 0, calendarConflictCount: 0 },
    errorCode: null,
    createdAt: timestamp,
    ...input,
  };
}

describe('deriveInsights', () => {
  it('turns a local calendar conflict into grounded observations and suggestions', () => {
    const action = eventAction();
    const current = intake([action]);
    const insights = deriveInsights(
      {
        intake: current,
        executions: [
          execution(action.id, {
            deviceContext: { possibleDuplicateContactCount: 0, calendarConflictCount: 2 },
          }),
        ],
      },
      runtime,
    );

    expect(insights.map((item) => item.type)).toEqual(
      expect.arrayContaining(['schedule_conflict', 'meeting_preparation', 'reply_suggestion']),
    );
    expect(insights.every((item) => item.generator === 'rules')).toBe(true);
    const conflict = insights.find((item) => item.type === 'schedule_conflict');
    expect(conflict).toMatchObject({ kind: 'observation', priority: 'high' });
    expect(conflict?.evidence[0]).toMatchObject({
      source: 'calendar_check',
      actionId: action.id,
    });
    expect(insights.find((item) => item.type === 'meeting_preparation')?.kind).toBe('suggestion');
  });

  it('keeps a failed duplicate-contact attempt visible with its bounded error code', () => {
    const action = contactAction();
    const current = intake([action]);
    const insights = deriveInsights(
      {
        intake: current,
        executions: [
          execution(action.id, {
            status: 'failed',
            errorCode: 'CONTACT_WRITE_FAILED',
            deviceContext: { possibleDuplicateContactCount: 3, calendarConflictCount: 0 },
          }),
        ],
      },
      runtime,
    );

    expect(insights.some((item) => item.type === 'duplicate_contact')).toBe(true);
    const failure = insights.find((item) => item.title === '设备动作尚未完成');
    expect(failure?.evidence).toContainEqual(
      expect.objectContaining({ source: 'system', detail: 'CONTACT_WRITE_FAILED' }),
    );
  });

  it('references only a matching application-history action', () => {
    const currentAction = eventAction('confirmed');
    const previousAction = contactAction('succeeded');
    const unrelatedAction = actionCardSchema.parse({
      ...contactAction('succeeded'),
      id: createId(),
      payload: { ...contactAction('succeeded').payload, displayName: '李雷' },
    });
    const previous = intake([previousAction]);
    const unrelated = intake([unrelatedAction]);

    const insights = deriveInsights(
      { intake: intake([currentAction]), relatedIntakes: [unrelated, previous] },
      runtime,
    );
    const historical = insights.find(
      (item) => item.kind === 'observation' && item.type === 'follow_up',
    );

    expect(historical?.evidence).toContainEqual(
      expect.objectContaining({ source: 'history', intakeId: previous.id }),
    );
    expect(historical?.evidence).not.toContainEqual(
      expect.objectContaining({ intakeId: unrelated.id }),
    );
  });
});
