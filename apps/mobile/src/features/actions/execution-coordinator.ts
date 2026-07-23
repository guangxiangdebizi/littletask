import type { ActionCard, ExecutionDeviceContext } from '@littletask/contracts';

import type { ActionPreparation, DeviceActionAdapter } from './device-types';
import { DeviceActionError } from './device-types';
import type { ExecutionLedger, ExecutionLedgerEntry } from './execution-ledger-types';

export interface ActionExecutionGateway {
  confirm(action: ActionCard, confirmationKey: string): Promise<ActionCard>;
  report(
    actionId: string,
    input: {
      confirmationKey: string;
      executionKey: string;
      status: 'succeeded' | 'failed';
      nativeRecordRef?: string;
      errorMessage?: string;
      deviceContext: ExecutionDeviceContext;
    },
  ): Promise<ActionCard>;
}

export class ExecutionOutcomeUnknownError extends Error {
  readonly code = 'EXECUTION_OUTCOME_UNKNOWN';

  constructor(readonly entry: ExecutionLedgerEntry) {
    super('系统写入结果不明确。为避免重复记录，需要先到通讯录或日历中核对。');
  }
}

export class ExecutionReportPendingError extends Error {
  readonly code = 'EXECUTION_REPORT_PENDING';

  constructor(readonly entry: ExecutionLedgerEntry) {
    super('设备写入已经完成，但结果尚未同步到服务器。重试只会同步结果，不会再次写入设备。');
  }
}

export class ActionExecutionCoordinator {
  constructor(
    private readonly ledger: ExecutionLedger,
    private readonly gateway: ActionExecutionGateway,
    private readonly device: DeviceActionAdapter,
  ) {}

  getLocalEntry(action: ActionCard): Promise<ExecutionLedgerEntry | null> {
    return this.ledger.get(action.id, action.revision);
  }

  async execute(action: ActionCard, preparation?: ActionPreparation): Promise<ActionCard> {
    let entry = await this.ledger.prepare(action);

    if (entry.state === 'succeeded' && entry.nativeRecordRef) {
      return this.reportSuccess(action, entry);
    }
    if (entry.state === 'executing' || entry.state === 'uncertain') {
      throw new ExecutionOutcomeUnknownError(entry);
    }
    if (preparation) {
      entry = await this.ledger.setDeviceContext(entry, {
        possibleDuplicateContactCount:
          action.type === 'create_contact' ? preparation.contacts.length : 0,
        calendarConflictCount:
          action.type === 'create_event' ? preparation.calendarConflicts.length : 0,
        relatedContacts: preparation.relatedContacts,
      });
    }
    if (!preparation) {
      throw new DeviceActionError('DEVICE_PREPARATION_REQUIRED', '请先完成本次动作的设备核对。');
    }
    if (entry.state === 'failed') entry = await this.ledger.rotateExecution(entry);

    await this.gateway.confirm(action, entry.confirmationKey);
    if (entry.state === 'prepared') {
      entry = await this.ledger.transition(entry, ['prepared'], 'confirmed');
    }
    entry = await this.ledger.transition(entry, ['confirmed'], 'executing');

    let nativeRecordRef: string;
    try {
      const result = await this.device.execute(action, preparation);
      nativeRecordRef = result.nativeRecordRef;
    } catch (error) {
      const deviceError =
        error instanceof DeviceActionError
          ? error
          : new DeviceActionError('DEVICE_WRITE_FAILED', '设备写入失败。', true);
      if (deviceError.mutationMayHaveOccurred) {
        const uncertain = await this.ledger.transition(entry, ['executing'], 'uncertain', {
          errorCode: deviceError.code,
        });
        throw new ExecutionOutcomeUnknownError(uncertain);
      }

      const failed = await this.ledger.transition(entry, ['executing'], 'failed', {
        errorCode: deviceError.code,
      });
      await this.gateway.report(action.id, {
        confirmationKey: failed.confirmationKey,
        executionKey: failed.executionKey,
        status: 'failed',
        errorMessage: deviceError.code,
        deviceContext: failed.deviceContext,
      });
      throw deviceError;
    }

    entry = await this.ledger.transition(entry, ['executing'], 'succeeded', {
      nativeRecordRef,
      errorCode: null,
    });
    return this.reportSuccess(action, entry);
  }

  async resolveUncertainAsSucceeded(
    action: ActionCard,
    nativeRecordRef = `user-verified:${action.id}:r${action.revision}`,
  ): Promise<ActionCard> {
    const entry = await this.ledger.get(action.id, action.revision);
    if (!entry || !['executing', 'uncertain'].includes(entry.state)) {
      throw new Error('No uncertain execution to resolve');
    }
    const succeeded = await this.ledger.transition(entry, ['executing', 'uncertain'], 'succeeded', {
      nativeRecordRef,
      errorCode: null,
    });
    return this.reportSuccess(action, succeeded);
  }

  async retryUncertain(action: ActionCard, preparation: ActionPreparation): Promise<ActionCard> {
    let entry = await this.ledger.get(action.id, action.revision);
    if (!entry || !['executing', 'uncertain'].includes(entry.state)) {
      throw new Error('No uncertain execution to retry');
    }
    if (entry.state === 'executing') {
      entry = await this.ledger.transition(entry, ['executing'], 'uncertain', {
        errorCode: 'USER_CONFIRMED_NO_RECORD',
      });
    }
    await this.ledger.rotateExecution(entry);
    return this.execute(action, preparation);
  }

  private async reportSuccess(
    action: ActionCard,
    entry: ExecutionLedgerEntry,
  ): Promise<ActionCard> {
    if (!entry.nativeRecordRef) throw new Error('Successful execution has no native record ref');
    try {
      return await this.gateway.report(action.id, {
        confirmationKey: entry.confirmationKey,
        executionKey: entry.executionKey,
        status: 'succeeded',
        nativeRecordRef: entry.nativeRecordRef,
        deviceContext: entry.deviceContext,
      });
    } catch {
      throw new ExecutionReportPendingError(entry);
    }
  }
}
