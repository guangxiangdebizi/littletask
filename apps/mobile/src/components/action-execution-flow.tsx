import { Feather } from '@expo/vector-icons';
import { Linking, Text, View } from 'react-native';

import { actionReviewErrorMessage } from '../features/actions/action-review-errors';
import type { ActionReviewController } from '../features/actions/use-action-review';
import { colors } from '../theme/tokens';
import { actionReviewStyles as styles } from './action-review-styles';
import { CalendarConflicts } from './calendar-conflicts';
import { ConfirmationPanel } from './confirmation-panel';
import { ContactCandidates } from './contact-candidates';
import { PrimaryButton } from './primary-button';
import { UncertainExecutionPanel } from './uncertain-execution-panel';

export function ActionExecutionFlow({ controller }: { controller: ActionReviewController }) {
  const {
    action,
    activePreparation,
    notice,
    currentError,
    uncertainError,
    reportPendingError,
    permissionError,
    executionAvailable,
    canPrepare,
    needsCandidate,
    duplicateWarning,
    conflictWarning,
  } = controller;
  if (!action) return null;
  const canChooseCandidate = action.type === 'update_contact' && controller.editable;
  const reportPending = Boolean(reportPendingError || controller.localReportPending);
  const outcomeUnknown = Boolean(uncertainError || controller.localOutcomeUnknown);

  return (
    <>
      {notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Feather color={colors.blue} name="info" size={16} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {action.status === 'needs_input' ? (
        <View style={styles.guidance}>
          <Text style={styles.guidanceTitle}>先补全并保存</Text>
          <Text style={styles.guidanceBody}>
            保存后服务器会生成新 revision，只有该确切版本可以确认。
          </Text>
        </View>
      ) : null}

      {action.status === 'succeeded' ? (
        <View style={styles.success}>
          <Feather color={colors.pine} name="check-circle" size={20} />
          <View style={styles.successCopy}>
            <Text style={styles.successTitle}>这个版本已经执行完成</Text>
            <Text style={styles.successBody}>设备记录不会因再次打开本页面而重复创建。</Text>
          </View>
        </View>
      ) : !executionAvailable ? (
        <View style={styles.preparePanel}>
          <Text style={styles.prepareTitle}>请在 iOS App 中执行</Text>
          <Text style={styles.prepareBody}>
            Web 端不访问联系人或日历，也不会回报任何虚构的执行结果。
          </Text>
        </View>
      ) : canPrepare && !activePreparation && !reportPending ? (
        <View style={styles.preparePanel}>
          <Text style={styles.prepareTitle}>下一步：仅在设备本地核对</Text>
          <Text style={styles.prepareBody}>
            {action.type === 'create_event'
              ? '点击后才申请日历权限，并检查同一时间是否冲突。'
              : '点击后才申请通讯录权限，只查找与此动作相关的少量候选。'}
          </Text>
          <PrimaryButton
            icon={action.type === 'create_event' ? 'calendar' : 'users'}
            label={action.type === 'create_event' ? '检查日历与权限' : '检查联系人与权限'}
            loading={controller.preparing}
            onPress={controller.prepare}
          />
        </View>
      ) : null}

      {activePreparation ? (
        <View style={styles.preparationResults}>
          <ContactCandidates
            candidates={activePreparation.contacts}
            onSelect={canChooseCandidate ? controller.selectCandidate : undefined}
            selectable={canChooseCandidate}
          />
          {canChooseCandidate ? (
            <PrimaryButton
              label={needsCandidate ? '从系统通讯录手动选择' : '重新选择系统联系人'}
              loading={controller.picking || controller.saving}
              onPress={controller.pickCandidate}
              tone="quiet"
            />
          ) : null}
          <CalendarConflicts conflicts={activePreparation.calendarConflicts} />
        </View>
      ) : null}

      {reportPending ? (
        <View accessibilityLiveRegion="assertive" style={styles.syncPending}>
          <Feather color={colors.blue} name="cloud" size={18} />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>设备写入已完成，等待同步</Text>
            <Text style={styles.errorBody}>
              {reportPendingError?.message ??
                '设备写入已经完成，但结果尚未同步到服务器。重试只会同步结果，不会再次写入设备。'}
            </Text>
            <PrimaryButton
              label="重新同步执行结果"
              loading={controller.executing}
              onPress={controller.sync}
              tone="quiet"
            />
          </View>
        </View>
      ) : currentError && !outcomeUnknown ? (
        <View accessibilityLiveRegion="assertive" style={styles.error}>
          <Feather color={colors.coral} name="alert-circle" size={17} />
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>这一步没有完成</Text>
            <Text style={styles.errorBody}>{actionReviewErrorMessage(currentError)}</Text>
            {permissionError?.canOpenSettings ? (
              <PrimaryButton
                label="打开系统设置"
                onPress={() => void Linking.openSettings()}
                tone="quiet"
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {outcomeUnknown ? (
        <UncertainExecutionPanel
          busy={controller.recovering}
          onMarkSucceeded={() => controller.recover('mark_succeeded')}
          onRetry={() => controller.recover('retry')}
          retryDisabled={!activePreparation}
        />
      ) : null}

      {activePreparation &&
      !needsCandidate &&
      action.status !== 'succeeded' &&
      !outcomeUnknown &&
      !reportPending ? (
        <ConfirmationPanel
          action={action}
          conflictAccepted={controller.conflictAccepted}
          conflictWarning={conflictWarning}
          duplicateAccepted={controller.duplicateAccepted}
          duplicateWarning={duplicateWarning}
          executing={controller.executing}
          onConflictAccepted={controller.setConflictAccepted}
          onDuplicateAccepted={controller.setDuplicateAccepted}
          onExecute={controller.execute}
        />
      ) : null}
    </>
  );
}
