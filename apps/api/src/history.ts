import type {
  ActionStatus,
  HistoryActionSummary,
  HistoryItem,
  HistoryOutcome,
  Intake,
} from '@littletask/contracts';

export function summarizeActions(statuses: ActionStatus[]): HistoryActionSummary {
  const summary: HistoryActionSummary = {
    total: statuses.length,
    needsReview: 0,
    confirmed: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const status of statuses) {
    if (['draft', 'needs_input', 'ready'].includes(status)) summary.needsReview += 1;
    if (['confirmed', 'executing'].includes(status)) summary.confirmed += 1;
    if (status === 'succeeded') summary.succeeded += 1;
    if (status === 'failed') summary.failed += 1;
  }
  return summary;
}

export function historyOutcome(
  intakeStatus: Intake['status'],
  actions: HistoryActionSummary,
): HistoryOutcome {
  if (intakeStatus === 'failed' || actions.failed > 0) return 'needs_attention';
  if (intakeStatus !== 'ready') return 'pending';
  if (actions.total === 0) return 'no_action';
  if (actions.succeeded === actions.total) return 'completed';
  if (actions.succeeded > 0) return 'partial';
  return 'pending';
}

export function toHistoryItem(intake: Intake): HistoryItem {
  const actions = summarizeActions(intake.actions.map((action) => action.status));
  return {
    id: intake.id,
    status: intake.status,
    summary: intake.summary,
    outcome: historyOutcome(intake.status, actions),
    actions,
    createdAt: intake.createdAt,
    updatedAt: intake.updatedAt,
  };
}
