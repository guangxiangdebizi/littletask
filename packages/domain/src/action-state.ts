import type { ActionStatus } from '@littletask/contracts';

const transitions: Record<ActionStatus, ReadonlySet<ActionStatus>> = {
  draft: new Set(['needs_input', 'ready', 'cancelled']),
  needs_input: new Set(['ready', 'cancelled']),
  ready: new Set(['needs_input', 'confirmed', 'cancelled']),
  confirmed: new Set(['executing', 'cancelled']),
  executing: new Set(['succeeded', 'failed']),
  succeeded: new Set(),
  failed: new Set(['executing', 'cancelled']),
  cancelled: new Set(),
};

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return transitions[from].has(to);
}

export function assertActionTransition(from: ActionStatus, to: ActionStatus): void {
  if (!canTransitionAction(from, to)) {
    throw new Error(`Invalid action transition: ${from} -> ${to}`);
  }
}
