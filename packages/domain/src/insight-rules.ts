import type { ActionCard, Insight } from '@littletask/contracts';

export function deriveInsights(
  intakeId: string,
  actions: ActionCard[],
  runtime: { createId: () => string; now: () => Date },
): Insight[] {
  const createdAt = runtime.now().toISOString();
  const succeeded = actions.filter((action) => action.status === 'succeeded');
  const meeting = succeeded.find((action) => action.type === 'create_event');
  const contact = succeeded.find(
    (action) => action.type === 'create_contact' || action.type === 'update_contact',
  );
  const insights: Insight[] = [];

  if (meeting?.type === 'create_event') {
    insights.push({
      id: runtime.createId(),
      intakeId,
      actionId: meeting.id,
      type: 'meeting_preparation',
      priority: 'medium',
      title: '会前确认目标和交通时间',
      body: `会议地点是${meeting.payload.location ?? '待确认地点'}。建议提前确认本次见面的目标，并在出发前检查交通时间。`,
      evidence: [`已确认会议：${meeting.payload.title}`, `开始时间：${meeting.payload.startAt}`],
      createdAt,
    });
  }

  if (contact) {
    insights.push({
      id: runtime.createId(),
      intakeId,
      actionId: contact.id,
      type: 'follow_up',
      priority: 'low',
      title: '保留这次信息更新的上下文',
      body: '联系人资料已经更新。建议在备注中保留信息来源，后续联系时更容易回忆本次对话。',
      evidence: [`已执行联系人动作：${contact.type}`],
      createdAt,
    });
  }

  return insights;
}
