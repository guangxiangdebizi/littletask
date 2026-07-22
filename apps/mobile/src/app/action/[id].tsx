import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ActionEditor } from '../../components/action-editors/action-editor';
import { ActionExecutionFlow } from '../../components/action-execution-flow';
import { actionReviewStyles as styles } from '../../components/action-review-styles';
import { AppHeader } from '../../components/app-header';
import { EvidenceRail } from '../../components/evidence-rail';
import { PrimaryButton } from '../../components/primary-button';
import { Screen } from '../../components/screen';
import { StatusPill } from '../../components/status-pill';
import { actionReviewErrorMessage } from '../../features/actions/action-review-errors';
import { useActionReview } from '../../features/actions/use-action-review';
import { actionVisuals, colors } from '../../theme/tokens';

export default function ActionReviewScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    intakeId?: string | string[];
  }>();
  const actionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const intakeId = Array.isArray(params.intakeId) ? params.intakeId[0] : params.intakeId;
  const controller = useActionReview(intakeId, actionId);

  if (!intakeId || !actionId) {
    return <ActionError message="缺少动作或分析任务 ID。" />;
  }
  if (controller.intakeQuery.isPending) {
    return (
      <Screen>
        <AppHeader back />
        <Text style={styles.loading}>正在读取动作版本…</Text>
      </Screen>
    );
  }
  if (controller.intakeQuery.error || !controller.action) {
    return (
      <ActionError
        message={
          controller.intakeQuery.error
            ? actionReviewErrorMessage(controller.intakeQuery.error)
            : '没有找到这张 Action Card。'
        }
      />
    );
  }

  const action = controller.action;
  const visual = actionVisuals[action.type];
  return (
    <Screen maxWidth={760}>
      <AppHeader back />
      <View style={styles.hero}>
        <View style={[styles.icon, { backgroundColor: visual.soft }]}>
          <Feather color={visual.accent} name={visual.icon} size={20} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>核对 Action Card</Text>
          <Text style={styles.title}>{visual.label}</Text>
          <Text style={styles.revision}>当前版本 {action.revision}</Text>
        </View>
        <StatusPill status={action.status} />
      </View>

      <EvidenceRail accent={visual.accent} evidence={action.evidence} />
      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>可执行内容</Text>
          <Text style={styles.sectionHint}>
            {controller.editable ? '修改后先保存新版本' : '此版本已锁定'}
          </Text>
        </View>
        <ActionEditor
          action={action}
          editable={controller.editable}
          key={`${action.id}:${action.revision}`}
          onSave={controller.save}
          saving={controller.saving}
        />
      </View>

      <ActionExecutionFlow controller={controller} />
      <PrimaryButton label="返回分析结果" onPress={() => router.back()} tone="quiet" />
    </Screen>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <Screen>
      <AppHeader back />
      <View style={styles.fatalError}>
        <Feather color={colors.coral} name="alert-circle" size={22} />
        <Text style={styles.errorTitle}>无法打开动作</Text>
        <Text style={styles.errorBody}>{message}</Text>
        <PrimaryButton label="返回" onPress={() => router.back()} tone="quiet" />
      </View>
    </Screen>
  );
}
