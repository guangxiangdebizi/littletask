import {
  insightSchema,
  type ActionCard,
  type ExecutionDeviceContext,
  type Insight,
  type InsightEvidence,
  type Intake,
} from '@littletask/contracts';

export interface ExecutionObservation {
  actionId: string;
  status: 'succeeded' | 'failed';
  deviceContext: ExecutionDeviceContext;
  errorCode: string | null;
  createdAt: string;
}

export interface InsightDerivationInput {
  intake: Intake;
  relatedIntakes?: Intake[];
  executions?: ExecutionObservation[];
}

interface Runtime {
  createId: () => string;
  now: () => Date;
}

function sourceEvidence(intake: Intake, action: ActionCard): InsightEvidence[] {
  const source = action.evidence[0];
  return [
    {
      source:
        source?.source === 'screenshot' || source?.source === 'note' ? source.source : 'action',
      label: source ? '动作原始依据' : '已确认动作',
      detail: source?.quote ?? `${action.type} · ${action.status}`,
      intakeId: intake.id,
      actionId: action.id,
    },
  ];
}

function actionEvidence(intake: Intake, action: ActionCard, detail: string): InsightEvidence {
  return {
    source: 'action',
    label: 'Action Card',
    detail,
    intakeId: intake.id,
    actionId: action.id,
  };
}

function relevantName(action: ActionCard): string[] {
  if (action.type === 'create_event') {
    return action.payload.attendees.map((attendee) => attendee.displayName);
  }
  return [
    action.type === 'create_contact'
      ? action.payload.displayName
      : action.payload.target.displayName,
  ];
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase();
}

function missingFields(action: ActionCard): string[] {
  if (action.type === 'create_event') {
    return [
      ...(!action.payload.endAt ? ['明确结束时间'] : []),
      ...(!action.payload.location ? ['地点或会议方式'] : []),
      ...(action.payload.attendees.length === 0 ? ['参与人'] : []),
    ];
  }
  if (action.type === 'create_contact') {
    return action.payload.phones.length === 0 && action.payload.emails.length === 0
      ? ['电话或邮箱']
      : [];
  }
  return action.payload.changes.some((change) => change.previousValue === null)
    ? ['部分字段的原值']
    : [];
}

function latestExecutions(executions: ExecutionObservation[]) {
  const byAction = new Map<string, ExecutionObservation>();
  for (const execution of [...executions].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )) {
    byAction.set(execution.actionId, execution);
  }
  return byAction;
}

function eventTime(action: Extract<ActionCard, { type: 'create_event' }>): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: action.payload.timezone,
  }).format(new Date(action.payload.startAt));
}

function relatedContactEvidence(
  intake: Intake,
  action: ActionCard,
  execution: ExecutionObservation | undefined,
): InsightEvidence[] {
  return (execution?.deviceContext.relatedContacts ?? []).slice(0, 8).map((contact) => ({
    source: 'contact_check',
    label: '已授权联系人上下文',
    detail: [
      contact.displayName,
      contact.company,
      contact.jobTitle,
      contact.hasPhone ? '已有电话' : null,
      contact.hasEmail ? '已有邮箱' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    intakeId: intake.id,
    actionId: action.id,
  }));
}

export function deriveInsights(input: InsightDerivationInput, runtime: Runtime): Insight[] {
  const { intake } = input;
  const createdAt = runtime.now().toISOString();
  const latestExecution = latestExecutions(input.executions ?? []);
  const insights: Insight[] = [];
  const seen = new Set<string>();

  const add = (value: Omit<Insight, 'id' | 'intakeId' | 'generator' | 'createdAt'>) => {
    const key = `${value.actionId ?? 'intake'}:${value.type}:${value.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    insights.push(
      insightSchema.parse({
        ...value,
        id: runtime.createId(),
        intakeId: intake.id,
        generator: 'rules',
        createdAt,
      }),
    );
  };

  for (const action of intake.actions.filter((item) =>
    ['confirmed', 'failed', 'succeeded'].includes(item.status),
  )) {
    const execution = latestExecution.get(action.id);
    const contactEvidence = relatedContactEvidence(intake, action, execution);
    const missing = missingFields(action);

    if (action.status === 'succeeded' && contactEvidence.length > 0) {
      add({
        actionId: action.id,
        type: 'follow_up',
        kind: 'observation',
        priority: 'low',
        title: '已找到与本次动作相关的联系人上下文',
        body: `设备本地核对提供了 ${contactEvidence.length} 条相关联系人摘要，后续建议会结合这些已授权信息。`,
        evidence: contactEvidence,
      });
    }

    if (missing.length > 0) {
      add({
        actionId: action.id,
        type: 'missing_information',
        kind: 'observation',
        priority: action.status === 'succeeded' ? 'low' : 'medium',
        title: '仍有信息没有明确记录',
        body: `这张卡片缺少：${missing.join('、')}。这不会改写已执行结果，但后续跟进时应再次确认。`,
        evidence: [
          actionEvidence(intake, action, `版本 ${action.revision} · ${action.status}`),
          ...sourceEvidence(intake, action),
        ],
      });
    }

    if (action.status === 'failed') {
      add({
        actionId: action.id,
        type: 'missing_information',
        kind: 'observation',
        priority: 'high',
        title: '设备动作尚未完成',
        body: '最近一次设备写入失败。请先核对联系人或日历中没有目标记录，再从原卡片发起重试。',
        evidence: [
          actionEvidence(intake, action, '当前状态：执行失败'),
          {
            source: 'system',
            label: '设备回报',
            detail: execution?.errorCode ?? '未提供具体错误码',
            intakeId: intake.id,
            actionId: action.id,
          },
        ],
      });
    }

    const duplicateCount = execution?.deviceContext.possibleDuplicateContactCount ?? 0;
    if (action.type === 'create_contact' && duplicateCount > 0) {
      add({
        actionId: action.id,
        type: 'duplicate_contact',
        kind: 'observation',
        priority: 'high',
        title: '创建前发现过可能重复的联系人',
        body: `设备核对时发现 ${duplicateCount} 个相关候选；你仍确认了当前动作。建议稍后合并或删除重复记录。`,
        evidence: [
          {
            source: 'contact_check',
            label: '设备本地核对',
            detail: `可能重复联系人：${duplicateCount} 个`,
            intakeId: intake.id,
            actionId: action.id,
          },
          actionEvidence(intake, action, `联系人：${action.payload.displayName}`),
        ],
      });
    }

    const conflictCount = execution?.deviceContext.calendarConflictCount ?? 0;
    if (action.type === 'create_event' && conflictCount > 0) {
      add({
        actionId: action.id,
        type: 'schedule_conflict',
        kind: 'observation',
        priority: 'high',
        title: '这个时间段存在日历重叠',
        body: `设备核对时发现 ${conflictCount} 项重叠日程。当前动作${action.status === 'succeeded' ? '已经创建' : '尚未完成'}，请确认是否需要调整时间。`,
        evidence: [
          {
            source: 'calendar_check',
            label: '设备本地核对',
            detail: `重叠日程：${conflictCount} 项`,
            intakeId: intake.id,
            actionId: action.id,
          },
          actionEvidence(intake, action, `${eventTime(action)} · ${action.payload.title}`),
        ],
      });
    }

    if (action.status === 'succeeded' && action.type === 'create_event') {
      add({
        actionId: action.id,
        type: 'meeting_preparation',
        kind: 'suggestion',
        priority: 'medium',
        title: '会前先明确目标和到达时间',
        body: action.payload.location
          ? `会议安排在${action.payload.location}。建议在出发前确认本次目标，并为交通或设备调试预留时间。`
          : '建议会前确认会议方式、本次目标和需要准备的材料。',
        evidence: [
          actionEvidence(intake, action, `${eventTime(action)} · ${action.payload.title}`),
          ...sourceEvidence(intake, action),
          ...contactEvidence,
        ],
      });
      add({
        actionId: action.id,
        type: 'reply_suggestion',
        kind: 'suggestion',
        priority: 'low',
        title: '可直接确认这次约定',
        body: `可回复：“收到，${eventTime(action)}${action.payload.location ? `在${action.payload.location}` : ''}见。”`,
        evidence: [actionEvidence(intake, action, `已创建日程：${action.payload.title}`)],
      });
    }

    if (
      action.status === 'succeeded' &&
      (action.type === 'create_contact' || action.type === 'update_contact')
    ) {
      const displayName =
        action.type === 'create_contact'
          ? action.payload.displayName
          : action.payload.target.displayName;
      add({
        actionId: action.id,
        type: 'follow_up',
        kind: 'suggestion',
        priority: 'low',
        title: '把资料更新转化为下一次跟进',
        body: `联系人“${displayName}”的动作已经完成。建议在需要时发送一条简短确认，避免后续仍使用旧资料。`,
        evidence: [
          actionEvidence(intake, action, `已执行：${action.type}`),
          ...sourceEvidence(intake, action),
          ...contactEvidence,
        ],
      });
    }

    const names = new Set(relevantName(action).map(normalizeName).filter(Boolean));
    const historical = (input.relatedIntakes ?? [])
      .filter((related) => related.id !== intake.id)
      .flatMap((related) => related.actions.map((candidate) => ({ related, candidate })))
      .find(
        ({ candidate }) =>
          candidate.status === 'succeeded' &&
          relevantName(candidate).some((name) => names.has(normalizeName(name))),
      );
    if (historical) {
      add({
        actionId: action.id,
        type: 'follow_up',
        kind: 'observation',
        priority: 'medium',
        title: '同一人物已有已执行的历史动作',
        body: '应用历史中存在与当前人物相关的已执行动作。准备本次跟进时，可以一并回顾上次约定。',
        evidence: [
          actionEvidence(intake, action, `当前动作：${action.type}`),
          {
            source: 'history',
            label: '应用内历史',
            detail: `${historical.related.createdAt} · ${historical.candidate.type} · succeeded`,
            intakeId: historical.related.id,
            actionId: historical.candidate.id,
          },
        ],
      });
    }
  }

  return insights;
}
