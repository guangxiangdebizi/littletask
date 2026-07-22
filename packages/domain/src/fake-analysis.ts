import type { AnalysisDraft } from '@littletask/contracts';

function tomorrowAt(now: Date, hour: number, minute = 0): string {
  const value = new Date(now);
  value.setDate(value.getDate() + 1);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

export function createFakeAnalysis(input: {
  note: string | null;
  now: Date;
  timezone: string;
}): AnalysisDraft {
  const sourceQuote =
    input.note?.trim() || '明天下午三点在静安嘉里中心见，我的新号码是 13800138000。';
  const startAt = tomorrowAt(input.now, 15);
  const endAt = tomorrowAt(input.now, 16);

  return {
    summary: '对话中约定了线下见面，并出现了需要补充或更新的联系人信息。',
    participants: ['张明', '陈曦'],
    facts: ['计划在静安嘉里中心见面', '张明提供了新的手机号码'],
    uncertainties: ['截图没有明确说明会议预计持续多久'],
    clarifyingQuestions: [
      {
        prompt: '会议预计持续多久？',
        actionIndex: 0,
        options: ['30 分钟', '1 小时', '1.5 小时'],
      },
    ],
    actions: [
      {
        type: 'create_event',
        confidence: 'high',
        evidence: [
          { source: input.note ? 'note' : 'screenshot', quote: sourceQuote.slice(0, 220) },
        ],
        assumptions: ['结束时间暂按 1 小时建议，确认前可以修改'],
        payload: {
          title: '与张明见面',
          attendees: [{ displayName: '张明' }],
          startAt,
          endAt,
          timezone: input.timezone,
          location: '静安嘉里中心',
          notes: '由 LittleTask 根据聊天截图生成，确认后写入日历。',
          suggestedDurationMinutes: 60,
        },
      },
      {
        type: 'update_contact',
        confidence: 'high',
        evidence: [{ source: 'screenshot', quote: '我的新号码是 13800138000' }],
        assumptions: [],
        payload: {
          target: {
            displayName: '张明',
            candidateCount: 1,
          },
          changes: [
            {
              field: 'phone',
              previousValue: null,
              nextValue: '13800138000',
            },
          ],
        },
      },
      {
        type: 'create_contact',
        confidence: 'medium',
        evidence: [{ source: 'screenshot', quote: '陈曦 chenxi@example.com' }],
        assumptions: ['通讯录中是否已有同名联系人仍需在设备本地检查'],
        payload: {
          givenName: '曦',
          familyName: '陈',
          displayName: '陈曦',
          phones: [],
          emails: ['chenxi@example.com'],
          company: '示例科技',
        },
      },
    ],
  };
}
