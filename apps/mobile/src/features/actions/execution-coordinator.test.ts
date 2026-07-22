import { actionCardSchema, type ActionCard } from '@littletask/contracts';
import { describe, expect, it, vi } from 'vitest';

import { DeviceActionError, type ActionPreparation } from './device-types';
import {
  ActionExecutionCoordinator,
  ExecutionOutcomeUnknownError,
  ExecutionReportPendingError,
  type ActionExecutionGateway,
} from './execution-coordinator';
import type {
  ExecutionLedger,
  ExecutionLedgerEntry,
  ExecutionLedgerState,
} from './execution-ledger-types';

const action = actionCardSchema.parse({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'create_event',
  revision: 2,
  status: 'ready',
  confidence: 'high',
  evidence: [{ source: 'screenshot', quote: '明天下午三点见' }],
  assumptions: [],
  payload: {
    title: '见面',
    attendees: [],
    startAt: '2026-07-23T07:00:00.000Z',
    endAt: '2026-07-23T08:00:00.000Z',
    timezone: 'Asia/Shanghai',
  },
  createdAt: '2026-07-22T05:00:00.000Z',
  updatedAt: '2026-07-22T05:00:00.000Z',
});
const preparation: ActionPreparation = {
  mode: 'simulated',
  contacts: [],
  calendarConflicts: [],
  calendarId: null,
};

class MemoryLedger implements ExecutionLedger {
  entry: ExecutionLedgerEntry | null = null;
  rotations = 0;

  async get() {
    return this.entry;
  }

  async prepare(input: ActionCard) {
    this.entry ??= {
      actionId: input.id,
      revision: input.revision,
      actionType: input.type,
      confirmationKey: '11111111-1111-4111-8111-111111111111',
      executionKey: '22222222-2222-4222-8222-222222222222',
      state: 'prepared',
      nativeRecordRef: null,
      errorCode: null,
      createdAt: '2026-07-22T05:00:00.000Z',
      updatedAt: '2026-07-22T05:00:00.000Z',
    };
    return this.entry;
  }

  async transition(
    entry: ExecutionLedgerEntry,
    allowed: ExecutionLedgerState[],
    state: ExecutionLedgerState,
    patch: { nativeRecordRef?: string | null; errorCode?: string | null } = {},
  ) {
    if (!allowed.includes(entry.state)) throw new Error('invalid transition');
    this.entry = { ...entry, ...patch, state };
    return this.entry;
  }

  async rotateExecution(entry: ExecutionLedgerEntry) {
    this.rotations += 1;
    this.entry = {
      ...entry,
      executionKey: '33333333-3333-4333-8333-333333333333',
      state: 'confirmed',
      errorCode: null,
      nativeRecordRef: null,
    };
    return this.entry;
  }
}

function createGateway(events: string[]) {
  const gateway: ActionExecutionGateway = {
    confirm: vi.fn(async (input) => {
      events.push('confirm');
      return { ...input, status: 'confirmed' } as ActionCard;
    }),
    report: vi.fn(async (_actionId, input) => {
      events.push(`report:${input.status}`);
      return { ...action, status: input.status } as ActionCard;
    }),
  };
  return gateway;
}

describe('ActionExecutionCoordinator', () => {
  it('confirms before mutation and never repeats a successful device write', async () => {
    const events: string[] = [];
    const ledger = new MemoryLedger();
    const gateway = createGateway(events);
    const execute = vi.fn(async () => {
      events.push('device');
      return { mode: 'simulated' as const, nativeRecordRef: 'mock:event-1' };
    });
    const coordinator = new ActionExecutionCoordinator(ledger, gateway, {
      prepare: vi.fn(),
      execute,
    });

    await coordinator.execute(action, preparation);
    await coordinator.execute(action);

    expect(events).toEqual(['confirm', 'device', 'report:succeeded', 'report:succeeded']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('blocks automatic retries when a native write may already exist', async () => {
    const events: string[] = [];
    const ledger = new MemoryLedger();
    const gateway = createGateway(events);
    const execute = vi.fn(async () => {
      events.push('device');
      throw new DeviceActionError('CALENDAR_WRITE_FAILED', 'unknown', true);
    });
    const coordinator = new ActionExecutionCoordinator(ledger, gateway, {
      prepare: vi.fn(),
      execute,
    });

    await expect(coordinator.execute(action, preparation)).rejects.toBeInstanceOf(
      ExecutionOutcomeUnknownError,
    );
    await expect(coordinator.execute(action, preparation)).rejects.toBeInstanceOf(
      ExecutionOutcomeUnknownError,
    );
    expect(execute).toHaveBeenCalledTimes(1);

    await coordinator.resolveUncertainAsSucceeded(action);
    expect(events).toEqual(['confirm', 'device', 'report:succeeded']);
  });

  it('uses a new execution key after a known failed attempt', async () => {
    const events: string[] = [];
    const ledger = new MemoryLedger();
    const gateway = createGateway(events);
    let attempts = 0;
    const execute = vi.fn(async () => {
      events.push('device');
      attempts += 1;
      if (attempts === 1) throw new DeviceActionError('NO_WRITE', 'safe failure');
      return { mode: 'simulated' as const, nativeRecordRef: 'mock:event-2' };
    });
    const coordinator = new ActionExecutionCoordinator(ledger, gateway, {
      prepare: vi.fn(),
      execute,
    });

    await expect(coordinator.execute(action, preparation)).rejects.toMatchObject({
      code: 'NO_WRITE',
    });
    await coordinator.execute(action, preparation);

    expect(ledger.rotations).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      'confirm',
      'device',
      'report:failed',
      'confirm',
      'device',
      'report:succeeded',
    ]);
  });

  it('retries only API reporting after a successful device write', async () => {
    const events: string[] = [];
    const ledger = new MemoryLedger();
    let reportAttempts = 0;
    const gateway: ActionExecutionGateway = {
      confirm: vi.fn(async (input) => {
        events.push('confirm');
        return { ...input, status: 'confirmed' } as ActionCard;
      }),
      report: vi.fn(async (_actionId, input) => {
        reportAttempts += 1;
        events.push(`report:${reportAttempts}`);
        if (reportAttempts === 1) throw new Error('network unavailable');
        return { ...action, status: input.status } as ActionCard;
      }),
    };
    const execute = vi.fn(async () => {
      events.push('device');
      return { mode: 'simulated' as const, nativeRecordRef: 'mock:event-3' };
    });
    const coordinator = new ActionExecutionCoordinator(ledger, gateway, {
      prepare: vi.fn(),
      execute,
    });

    await expect(coordinator.execute(action, preparation)).rejects.toBeInstanceOf(
      ExecutionReportPendingError,
    );
    await coordinator.execute(action);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['confirm', 'device', 'report:1', 'report:2']);
  });
});
