import type { ActionCard } from '@littletask/contracts';
import * as Crypto from 'expo-crypto';

export type ExecutionLedgerState =
  'prepared' | 'confirmed' | 'executing' | 'succeeded' | 'failed' | 'uncertain';

export interface ExecutionLedgerEntry {
  actionId: string;
  revision: number;
  actionType: ActionCard['type'];
  confirmationKey: string;
  executionKey: string;
  state: ExecutionLedgerState;
  nativeRecordRef: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionLedger {
  get(actionId: string, revision: number): Promise<ExecutionLedgerEntry | null>;
  prepare(action: ActionCard): Promise<ExecutionLedgerEntry>;
  transition(
    entry: ExecutionLedgerEntry,
    allowedStates: ExecutionLedgerState[],
    state: ExecutionLedgerState,
    patch?: { nativeRecordRef?: string | null; errorCode?: string | null },
  ): Promise<ExecutionLedgerEntry>;
  rotateExecution(entry: ExecutionLedgerEntry): Promise<ExecutionLedgerEntry>;
}

export function ledgerKey(actionId: string, revision: number): string {
  return `${actionId}:${revision}`;
}

export function createLedgerEntry(action: ActionCard): ExecutionLedgerEntry {
  const now = new Date().toISOString();
  return {
    actionId: action.id,
    revision: action.revision,
    actionType: action.type,
    confirmationKey: Crypto.randomUUID(),
    executionKey: Crypto.randomUUID(),
    state: 'prepared',
    nativeRecordRef: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
  };
}
