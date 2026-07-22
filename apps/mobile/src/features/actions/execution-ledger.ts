import * as Crypto from 'expo-crypto';

import {
  createLedgerEntry,
  ledgerKey,
  type ExecutionLedger,
  type ExecutionLedgerEntry,
} from './execution-ledger-types';

export type {
  ExecutionLedger,
  ExecutionLedgerEntry,
  ExecutionLedgerState,
} from './execution-ledger-types';

const storageKey = 'littletask.execution-ledger.v1';
const memoryEntries = new Map<string, ExecutionLedgerEntry>();

function loadEntries(): Map<string, ExecutionLedgerEntry> {
  if (typeof globalThis.localStorage === 'undefined') return new Map(memoryEntries);
  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(
          (entry): entry is ExecutionLedgerEntry =>
            typeof entry === 'object' &&
            entry !== null &&
            'actionId' in entry &&
            'revision' in entry,
        )
        .map((entry) => [ledgerKey(entry.actionId, entry.revision), entry]),
    );
  } catch {
    return new Map();
  }
}

function saveEntries(entries: Map<string, ExecutionLedgerEntry>): void {
  memoryEntries.clear();
  for (const [entryKey, entry] of entries) memoryEntries.set(entryKey, entry);
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(storageKey, JSON.stringify([...entries.values()]));
  }
}

export const executionLedger: ExecutionLedger = {
  async get(actionId, revision) {
    return loadEntries().get(ledgerKey(actionId, revision)) ?? null;
  },

  async prepare(action) {
    const entries = loadEntries();
    const entryKey = ledgerKey(action.id, action.revision);
    const existing = entries.get(entryKey);
    if (existing) return existing;
    const entry = createLedgerEntry(action);
    entries.set(entryKey, entry);
    saveEntries(entries);
    return entry;
  },

  async transition(entry, allowedStates, state, patch = {}) {
    const entries = loadEntries();
    const current = entries.get(ledgerKey(entry.actionId, entry.revision));
    if (!current || !allowedStates.includes(current.state)) {
      throw new Error(`Invalid ledger transition: ${current?.state ?? 'missing'} -> ${state}`);
    }
    const updated = {
      ...current,
      ...patch,
      state,
      updatedAt: new Date().toISOString(),
    };
    entries.set(ledgerKey(entry.actionId, entry.revision), updated);
    saveEntries(entries);
    return updated;
  },

  async rotateExecution(entry) {
    const entries = loadEntries();
    const current = entries.get(ledgerKey(entry.actionId, entry.revision));
    if (!current || !['failed', 'uncertain'].includes(current.state)) {
      throw new Error(`Cannot rotate execution from ${current?.state ?? 'missing'}`);
    }
    const updated: ExecutionLedgerEntry = {
      ...current,
      executionKey: Crypto.randomUUID(),
      state: 'confirmed',
      nativeRecordRef: null,
      errorCode: null,
      updatedAt: new Date().toISOString(),
    };
    entries.set(ledgerKey(entry.actionId, entry.revision), updated);
    saveEntries(entries);
    return updated;
  },
};
