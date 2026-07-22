import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import {
  createLedgerEntry,
  type ExecutionLedger,
  type ExecutionLedgerEntry,
  type ExecutionLedgerState,
} from './execution-ledger-types';

export type {
  ExecutionLedger,
  ExecutionLedgerEntry,
  ExecutionLedgerState,
} from './execution-ledger-types';

interface LedgerRow {
  action_id: string;
  revision: number;
  action_type: ExecutionLedgerEntry['actionType'];
  confirmation_key: string;
  execution_key: string;
  state: ExecutionLedgerState;
  native_record_ref: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

let databasePromise: ReturnType<typeof openDatabase> | null = null;

function fromRow(row: LedgerRow): ExecutionLedgerEntry {
  return {
    actionId: row.action_id,
    revision: row.revision,
    actionType: row.action_type,
    confirmationKey: row.confirmation_key,
    executionKey: row.execution_key,
    state: row.state,
    nativeRecordRef: row.native_record_ref,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function openDatabase() {
  const database = await SQLite.openDatabaseAsync('littletask-actions.db');
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS action_execution_ledger (
      action_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      confirmation_key TEXT NOT NULL UNIQUE,
      execution_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      native_record_ref TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (action_id, revision)
    );
  `);
  return database;
}

async function database() {
  databasePromise ??= openDatabase();
  return databasePromise;
}

export const executionLedger: ExecutionLedger = {
  async get(actionId, revision) {
    const db = await database();
    const row = await db.getFirstAsync<LedgerRow>(
      'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
      actionId,
      revision,
    );
    return row ? fromRow(row) : null;
  },

  async prepare(action) {
    const db = await database();
    const proposed = createLedgerEntry(action);
    let result: ExecutionLedgerEntry | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO action_execution_ledger (
          action_id, revision, action_type, confirmation_key, execution_key, state,
          native_record_ref, error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        proposed.actionId,
        proposed.revision,
        proposed.actionType,
        proposed.confirmationKey,
        proposed.executionKey,
        proposed.state,
        proposed.nativeRecordRef,
        proposed.errorCode,
        proposed.createdAt,
        proposed.updatedAt,
      );
      const row = await transaction.getFirstAsync<LedgerRow>(
        'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
        action.id,
        action.revision,
      );
      result = row ? fromRow(row) : null;
    });
    if (!result) throw new Error('Could not prepare action execution ledger');
    return result;
  },

  async transition(entry, allowedStates, state, patch = {}) {
    const db = await database();
    let result: ExecutionLedgerEntry | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const current = await transaction.getFirstAsync<LedgerRow>(
        'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
        entry.actionId,
        entry.revision,
      );
      if (!current || !allowedStates.includes(current.state)) {
        throw new Error(`Invalid ledger transition: ${current?.state ?? 'missing'} -> ${state}`);
      }
      await transaction.runAsync(
        `UPDATE action_execution_ledger
         SET state = ?, native_record_ref = ?, error_code = ?, updated_at = ?
         WHERE action_id = ? AND revision = ? AND state = ?`,
        state,
        patch.nativeRecordRef === undefined ? current.native_record_ref : patch.nativeRecordRef,
        patch.errorCode === undefined ? current.error_code : patch.errorCode,
        new Date().toISOString(),
        entry.actionId,
        entry.revision,
        current.state,
      );
      const row = await transaction.getFirstAsync<LedgerRow>(
        'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
        entry.actionId,
        entry.revision,
      );
      result = row ? fromRow(row) : null;
    });
    if (!result) throw new Error('Could not update action execution ledger');
    return result;
  },

  async rotateExecution(entry) {
    const db = await database();
    let result: ExecutionLedgerEntry | null = null;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      const current = await transaction.getFirstAsync<LedgerRow>(
        'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
        entry.actionId,
        entry.revision,
      );
      if (!current || !['failed', 'uncertain'].includes(current.state)) {
        throw new Error(`Cannot rotate execution from ${current?.state ?? 'missing'}`);
      }
      await transaction.runAsync(
        `UPDATE action_execution_ledger
         SET execution_key = ?, state = 'confirmed', native_record_ref = NULL,
             error_code = NULL, updated_at = ?
         WHERE action_id = ? AND revision = ? AND state = ?`,
        Crypto.randomUUID(),
        new Date().toISOString(),
        entry.actionId,
        entry.revision,
        current.state,
      );
      const row = await transaction.getFirstAsync<LedgerRow>(
        'SELECT * FROM action_execution_ledger WHERE action_id = ? AND revision = ?',
        entry.actionId,
        entry.revision,
      );
      result = row ? fromRow(row) : null;
    });
    if (!result) throw new Error('Could not rotate action execution attempt');
    return result;
  },
};
