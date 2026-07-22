import type { ActionCard, ActionPatchRequest, Intake } from '@littletask/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform } from 'react-native';

import { getIntake, patchAction } from '../../lib/api';
import { actionExecutionCoordinator } from './action-execution';
import { applyContactCandidate } from './contact-matching';
import { deviceActionAdapter, pickDeviceContactCandidate } from './device-adapter';
import { DeviceActionError, type ActionPreparation } from './device-types';
import { ExecutionOutcomeUnknownError, ExecutionReportPendingError } from './execution-coordinator';

interface PreparedState {
  revision: number;
  value: ActionPreparation;
}

export function useActionReview(intakeId?: string, actionId?: string) {
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [duplicateAcceptedRevision, setDuplicateAcceptedRevision] = useState<number | null>(null);
  const [conflictAcceptedRevision, setConflictAcceptedRevision] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const intakeQuery = useQuery({
    queryKey: ['intake', intakeId],
    queryFn: () => getIntake(intakeId ?? ''),
    enabled: Boolean(intakeId),
  });
  const action = intakeQuery.data?.actions.find((candidate) => candidate.id === actionId);
  const ledgerQuery = useQuery({
    queryKey: ['action-execution-ledger', action?.id, action?.revision],
    queryFn: () =>
      action ? actionExecutionCoordinator.getLocalEntry(action) : Promise.resolve(null),
    enabled: Boolean(action),
  });

  const cacheAction = (updated: ActionCard) => {
    queryClient.setQueryData<Intake>(['intake', intakeId], (current) =>
      current
        ? {
            ...current,
            actions: current.actions.map((candidate) =>
              candidate.id === updated.id ? updated : candidate,
            ),
            updatedAt: updated.updatedAt,
          }
        : current,
    );
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['history'] }),
      queryClient.invalidateQueries({ queryKey: ['insights', intakeId] }),
      queryClient.invalidateQueries({ queryKey: ['activity', intakeId] }),
    ]);
  };

  const patchMutation = useMutation({
    mutationFn: ({
      source,
      payload,
    }: {
      source: ActionCard;
      payload: ActionPatchRequest['payload'];
    }) => patchAction(source, payload),
    onSuccess: (updated) => {
      cacheAction(updated);
      setPrepared(null);
      setNotice(`已保存为版本 ${updated.revision}，请重新执行设备核对。`);
    },
  });
  const prepareMutation = useMutation({
    mutationFn: deviceActionAdapter.prepare,
    onSuccess: (value, source) => {
      setPrepared({ revision: source.revision, value });
      setNotice(
        value.mode === 'simulated'
          ? 'Web 只会模拟执行，不会访问或修改系统联系人与日历。'
          : '设备核对完成。请检查下方完整内容后再最终确认。',
      );
    },
  });
  const pickerMutation = useMutation({
    mutationFn: pickDeviceContactCandidate,
    onSuccess: (candidate) => {
      if (!candidate || !action || action.type !== 'update_contact') return;
      patchMutation.mutate({
        source: action,
        payload: applyContactCandidate(
          action.payload,
          candidate,
          Math.max(1, prepared?.value.contacts.length ?? 0),
        ),
      });
    },
  });
  const executionMutation = useMutation({
    mutationFn: ({
      source,
      preparation,
    }: {
      source: ActionCard;
      preparation?: ActionPreparation;
    }) => actionExecutionCoordinator.execute(source, preparation),
    onSuccess: (updated) => {
      cacheAction(updated);
      setNotice(
        Platform.OS === 'web'
          ? 'Web 模拟执行已完成，没有写入系统数据。'
          : '设备写入已完成并安全回报。',
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ['action-execution-ledger', action?.id, action?.revision],
      }),
  });
  const recoveryMutation = useMutation({
    mutationFn: ({
      mode,
      source,
      preparation,
    }: {
      mode: 'mark_succeeded' | 'retry';
      source: ActionCard;
      preparation?: ActionPreparation;
    }) =>
      mode === 'mark_succeeded'
        ? actionExecutionCoordinator.resolveUncertainAsSucceeded(source)
        : preparation
          ? actionExecutionCoordinator.retryUncertain(source, preparation)
          : Promise.reject(
              new DeviceActionError(
                'DEVICE_PREPARATION_REQUIRED',
                '重新执行前，请先完成本次动作的设备核对。',
              ),
            ),
    onSuccess: (updated) => {
      cacheAction(updated);
      setNotice('执行状态已恢复并同步。');
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ['action-execution-ledger', action?.id, action?.revision],
      }),
  });

  const activePreparation =
    prepared && prepared.revision === action?.revision ? prepared.value : null;
  const uncertainError =
    executionMutation.error instanceof ExecutionOutcomeUnknownError
      ? executionMutation.error
      : recoveryMutation.error instanceof ExecutionOutcomeUnknownError
        ? recoveryMutation.error
        : null;
  const currentError =
    patchMutation.error ||
    prepareMutation.error ||
    pickerMutation.error ||
    executionMutation.error ||
    recoveryMutation.error;
  const reportPendingError =
    executionMutation.error instanceof ExecutionReportPendingError
      ? executionMutation.error
      : recoveryMutation.error instanceof ExecutionReportPendingError
        ? recoveryMutation.error
        : null;

  const save = (payload: ActionPatchRequest['payload']) => {
    if (action) patchMutation.mutate({ source: action, payload });
  };
  const selectCandidate = (candidate: ActionPreparation['contacts'][number]) => {
    if (!action || action.type !== 'update_contact') return;
    patchMutation.mutate({
      source: action,
      payload: applyContactCandidate(
        action.payload,
        candidate,
        activePreparation?.contacts.length ?? 1,
      ),
    });
  };
  const recover = (mode: 'mark_succeeded' | 'retry') => {
    if (action) {
      recoveryMutation.mutate({
        mode,
        source: action,
        ...(activePreparation ? { preparation: activePreparation } : {}),
      });
    }
  };

  const localEntry = ledgerQuery.data;
  const localReportPending = localEntry?.state === 'succeeded' && action?.status !== 'succeeded';
  const localOutcomeUnknown =
    action?.status !== 'succeeded' &&
    localEntry !== null &&
    localEntry !== undefined &&
    ['executing', 'uncertain'].includes(localEntry.state);

  return {
    action,
    intakeQuery,
    activePreparation,
    notice,
    currentError,
    uncertainError,
    reportPendingError,
    localReportPending,
    localOutcomeUnknown,
    permissionError: currentError instanceof DeviceActionError ? currentError : null,
    editable: action ? ['ready', 'needs_input'].includes(action.status) : false,
    canPrepare: action ? ['ready', 'confirmed', 'failed'].includes(action.status) : false,
    needsCandidate: action?.type === 'update_contact' && !action.payload.target.localContactId,
    duplicateWarning:
      action?.type === 'create_contact' && (activePreparation?.contacts.length ?? 0) > 0,
    conflictWarning: (activePreparation?.calendarConflicts.length ?? 0) > 0,
    duplicateAccepted: duplicateAcceptedRevision === action?.revision,
    conflictAccepted: conflictAcceptedRevision === action?.revision,
    saving: patchMutation.isPending,
    preparing: prepareMutation.isPending,
    picking: pickerMutation.isPending,
    executing: executionMutation.isPending,
    recovering: recoveryMutation.isPending,
    save,
    prepare: () => action && prepareMutation.mutate(action),
    pickCandidate: () => pickerMutation.mutate(),
    selectCandidate,
    execute: () =>
      action &&
      activePreparation &&
      executionMutation.mutate({ source: action, preparation: activePreparation }),
    sync: () => action && executionMutation.mutate({ source: action }),
    recover,
    setDuplicateAccepted: (accepted: boolean) =>
      setDuplicateAcceptedRevision(accepted ? (action?.revision ?? null) : null),
    setConflictAccepted: (accepted: boolean) =>
      setConflictAcceptedRevision(accepted ? (action?.revision ?? null) : null),
  };
}

export type ActionReviewController = ReturnType<typeof useActionReview>;
