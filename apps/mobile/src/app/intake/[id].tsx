import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Text, View } from 'react-native';

import { ActionCard } from '../../components/action-card';
import { ActivityTimeline } from '../../components/activity-timeline';
import { AnalysisProgress } from '../../components/analysis-progress';
import { AppHeader } from '../../components/app-header';
import { InsightRow } from '../../components/insight-row';
import { intakeResultStyles as styles } from '../../components/intake-result-styles';
import { PrimaryButton } from '../../components/primary-button';
import { Screen } from '../../components/screen';
import { ApiRequestError, getActivity, getInsights, getIntake } from '../../lib/api';
import { colors } from '../../theme/tokens';

export default function IntakeResultScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const intakeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const intakeQuery = useQuery({
    queryKey: ['intake', intakeId],
    queryFn: () => getIntake(intakeId ?? ''),
    enabled: Boolean(intakeId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'processing' ? 600 : false;
    },
  });
  const intake = intakeQuery.data;
  const hasExecutedAction =
    intake?.actions.some((action) => action.status === 'succeeded') ?? false;
  const insightsQuery = useQuery({
    queryKey: ['insights', intakeId],
    queryFn: () => getInsights(intakeId ?? ''),
    enabled: Boolean(intakeId && hasExecutedAction),
    refetchInterval: (query) =>
      ['queued', 'processing'].includes(query.state.data?.generationStatus ?? '') ? 1_000 : false,
  });
  const activityQuery = useQuery({
    queryKey: ['activity', intakeId],
    queryFn: () => getActivity(intakeId ?? ''),
    enabled: Boolean(intakeId && intake && ['ready', 'failed'].includes(intake.status)),
  });

  if (!intakeId) {
    return (
      <Screen>
        <AppHeader back />
        <ErrorState message="缺少分析任务 ID。" />
      </Screen>
    );
  }

  if (intakeQuery.isPending) {
    return (
      <Screen>
        <AppHeader back />
        <View style={styles.topSpacing}>
          <AnalysisProgress status="queued" />
        </View>
      </Screen>
    );
  }

  if (intakeQuery.error || !intake) {
    const message =
      intakeQuery.error instanceof ApiRequestError
        ? intakeQuery.error.message
        : '无法读取分析结果，请检查网络后重试。';
    return (
      <Screen>
        <AppHeader back />
        <ErrorState message={message} onRetry={() => void intakeQuery.refetch()} />
      </Screen>
    );
  }

  if (intake.status === 'queued' || intake.status === 'processing') {
    return (
      <Screen>
        <AppHeader back />
        <View style={styles.topSpacing}>
          <AnalysisProgress status={intake.status} />
        </View>
      </Screen>
    );
  }

  if (intake.status === 'failed') {
    return (
      <Screen>
        <AppHeader back />
        <ErrorState message={intake.error?.message ?? '截图分析失败。'} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader back />

      <View style={styles.summary}>
        <Text style={styles.kicker}>识别完成</Text>
        <Text style={styles.summaryTitle}>{intake.summary}</Text>
        <View style={styles.summaryMeta}>
          <Text style={styles.summaryMetaText}>{intake.actions.length} 张 Action Cards</Text>
          <View style={styles.metaDot} />
          <Text style={styles.summaryMetaText}>
            {intake.participants.join('、') || '未识别人名'}
          </Text>
        </View>
      </View>

      <View style={styles.modeNotice}>
        <Feather color={colors.blue} name="tool" size={16} />
        <Text style={styles.modeNoticeText}>
          {Platform.OS === 'web'
            ? 'Web 验收版只会明确模拟执行，不会访问或修改系统联系人与日历。'
            : 'iOS 仅在你主动点击设备核对后请求对应权限；只有最终确认才会写入设备。'}
        </Text>
      </View>

      {intake.clarifyingQuestions.length > 0 ? (
        <View style={styles.questionsSection}>
          <Text style={styles.sectionTitle}>需要你留意</Text>
          {intake.clarifyingQuestions.map((question) => (
            <View key={question.id} style={styles.question}>
              <Text style={styles.questionPrompt}>{question.prompt}</Text>
              {question.options.length > 0 ? (
                <Text style={styles.questionOptions}>常用选择：{question.options.join(' / ')}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsSection}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionTitle}>待处理动作</Text>
          <Text style={styles.sectionHint}>逐张核对后确认</Text>
        </View>
        {intake.actions.length > 0 ? (
          intake.actions.map((action) => (
            <ActionCard
              action={action}
              key={action.id}
              onOpen={(selected) =>
                router.push({
                  pathname: '/action/[id]',
                  params: { id: selected.id, intakeId },
                })
              }
              simulatedExecution={Platform.OS === 'web'}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Feather color={colors.pine} name="check-circle" size={21} />
            <Text style={styles.emptyTitle}>没有发现需要执行的动作</Text>
            <Text style={styles.emptyBody}>
              这张截图仍然可以作为上下文摘要查看，但不会生成空卡片。
            </Text>
          </View>
        )}
      </View>

      {hasExecutedAction ? (
        <View style={styles.insightsSection}>
          <View style={styles.insightHeading}>
            <Text style={styles.sectionTitle}>接下来值得注意</Text>
            <Text style={styles.sectionHint}>依据已确认动作生成</Text>
          </View>
          {insightsQuery.isPending ? (
            <Text style={styles.loadingInsights}>正在整理建议…</Text>
          ) : insightsQuery.data && insightsQuery.data.items.length > 0 ? (
            insightsQuery.data.items.map((insight) => (
              <InsightRow insight={insight} key={insight.id} />
            ))
          ) : (
            <Text style={styles.loadingInsights}>当前没有额外建议。</Text>
          )}
          {['queued', 'processing'].includes(insightsQuery.data?.generationStatus ?? '') ? (
            <Text style={styles.loadingInsights}>AI 正在基于已验证证据补充建议…</Text>
          ) : null}
        </View>
      ) : null}

      {activityQuery.data && activityQuery.data.length > 0 ? (
        <View style={styles.insightsSection}>
          <View style={styles.insightHeading}>
            <Text style={styles.sectionTitle}>活动记录</Text>
            <Text style={styles.sectionHint}>最新变化在前</Text>
          </View>
          <ActivityTimeline events={activityQuery.data} />
        </View>
      ) : null}
    </Screen>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <Feather color={colors.coral} name="alert-circle" size={22} />
      </View>
      <Text style={styles.errorTitle}>这次没有完成</Text>
      <Text style={styles.errorBody}>{message}</Text>
      {onRetry ? <PrimaryButton label="重新读取" onPress={onRetry} tone="quiet" /> : null}
      <PrimaryButton label="返回重新选择" onPress={() => router.replace('/')} tone="quiet" />
    </View>
  );
}
