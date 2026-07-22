import { confirmAction, reportActionExecution } from '../../lib/api';
import { deviceActionAdapter } from './device-adapter';
import { ActionExecutionCoordinator } from './execution-coordinator';
import { executionLedger } from './execution-ledger';

export const actionExecutionCoordinator = new ActionExecutionCoordinator(
  executionLedger,
  {
    confirm: confirmAction,
    report: reportActionExecution,
  },
  deviceActionAdapter,
);
