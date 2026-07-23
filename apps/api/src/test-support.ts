import type { AnalysisDraft } from '@littletask/contracts';

import type { AIProvider, AnalyzeInput, ModelTelemetry } from './types';

const telemetry: ModelTelemetry = {
  responseId: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
};

function nextDayAt(now: Date, hour: number): string {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + 1);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function scenarioAnalysis(input: AnalyzeInput): AnalysisDraft {
  return {
    summary: '对话包含一项会面安排和两项联系人信息。',
    participants: ['联系人甲', '联系人乙'],
    facts: ['双方约定次日会面', '一位联系人提供了新号码'],
    uncertainties: ['会面时长需要用户核对'],
    clarifyingQuestions: [
      {
        prompt: '会面预计持续多久？',
        actionIndex: 0,
        options: ['30 分钟', '1 小时'],
      },
    ],
    actions: [
      {
        type: 'create_event',
        confidence: 'high',
        evidence: [{ source: 'note', quote: '次日下午三点见' }],
        assumptions: ['结束时间暂按一小时处理'],
        payload: {
          title: '与联系人甲会面',
          attendees: [{ displayName: '联系人甲' }],
          startAt: nextDayAt(input.now, 7),
          endAt: nextDayAt(input.now, 8),
          timezone: input.timezone,
          suggestedDurationMinutes: 60,
        },
      },
      {
        type: 'update_contact',
        confidence: 'high',
        evidence: [{ source: 'note', quote: '这是我的新号码' }],
        assumptions: [],
        payload: {
          target: { displayName: '联系人甲', candidateCount: 0 },
          changes: [{ field: 'phone', previousValue: null, nextValue: '10000000001' }],
        },
      },
      {
        type: 'create_contact',
        confidence: 'medium',
        evidence: [{ source: 'note', quote: '请保存联系人乙的信息' }],
        assumptions: ['需要在设备上检查是否已有同名记录'],
        payload: {
          givenName: '乙',
          familyName: '联系人',
          displayName: '联系人乙',
          phones: [],
          emails: ['contact-b@example.test'],
        },
      },
    ],
  };
}

export function createScenarioProvider(): AIProvider {
  return {
    async analyze(input) {
      return { data: scenarioAnalysis(input), telemetry };
    },
    async review(_input, draft) {
      return { data: draft, telemetry };
    },
    async suggestInsights(input) {
      const action = input.actions[0];
      const evidence = input.evidence[0];
      return {
        data:
          action && evidence
            ? [
                {
                  actionId: action.id,
                  type: 'meeting_preparation',
                  priority: 'low',
                  title: '提前确认安排',
                  body: '会面前再次核对时间和地点。',
                  evidenceIds: [evidence.id],
                },
              ]
            : [],
        telemetry,
      };
    },
  };
}

export function testConfigEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-process-only',
    ...overrides,
  };
}
