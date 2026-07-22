import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionCard } from '../../components/action-card';
import { AnalysisProgress } from '../../components/analysis-progress';
import { AppHeader } from '../../components/app-header';
import { InsightRow } from '../../components/insight-row';
import { PrimaryButton } from '../../components/primary-button';
import { Screen } from '../../components/screen';
import { ApiRequestError, confirmAndSimulateAction, getInsights, getIntake } from '../../lib/api';
import { colors, radii, spacing } from '../../theme/tokens';

export default function IntakeResultScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const intakeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();
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
  const confirmationMutation = useMutation({
    mutationFn: confirmAndSimulateAction,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['intake', intakeId] }),
        queryClient.invalidateQueries({ queryKey: ['insights', intakeId] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
      ]);
    },
  });
  const hasExecutedAction =
    intake?.actions.some((action) => action.status === 'succeeded') ?? false;
  const insightsQuery = useQuery({
    queryKey: ['insights', intakeId],
    queryFn: () => getInsights(intakeId ?? ''),
    enabled: Boolean(intakeId && hasExecutedAction),
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

  const mutationError = confirmationMutation.error;

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
          当前验收版本使用模拟执行，不会写入真实联系人或日历。原生执行适配器将在下一阶段启用。
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
              isConfirming={
                confirmationMutation.isPending && confirmationMutation.variables?.id === action.id
              }
              key={action.id}
              onConfirm={(selected) => confirmationMutation.mutate(selected)}
              simulatedExecution
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

      {mutationError ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorInline}>
          <Feather color={colors.coral} name="alert-circle" size={16} />
          <Text style={styles.errorInlineText}>
            {mutationError instanceof ApiRequestError
              ? mutationError.message
              : '动作确认失败，请重试。'}
          </Text>
        </View>
      ) : null}

      {hasExecutedAction ? (
        <View style={styles.insightsSection}>
          <View style={styles.insightHeading}>
            <Text style={styles.sectionTitle}>接下来值得注意</Text>
            <Text style={styles.sectionHint}>依据已确认动作生成</Text>
          </View>
          {insightsQuery.isPending ? (
            <Text style={styles.loadingInsights}>正在整理建议…</Text>
          ) : insightsQuery.data && insightsQuery.data.length > 0 ? (
            insightsQuery.data.map((insight) => <InsightRow insight={insight} key={insight.id} />)
          ) : (
            <Text style={styles.loadingInsights}>当前没有额外建议。</Text>
          )}
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

const styles = StyleSheet.create({
  topSpacing: {
    paddingTop: spacing[8],
  },
  summary: {
    gap: spacing[3],
    paddingBottom: spacing[6],
    paddingTop: spacing[8],
  },
  kicker: {
    color: colors.pine,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 34,
  },
  summaryMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  summaryMetaText: {
    color: colors.muted,
    fontSize: 13,
  },
  metaDot: {
    backgroundColor: colors.lineStrong,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  modeNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
  modeNoticeText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  questionsSection: {
    gap: spacing[3],
    paddingTop: spacing[8],
  },
  question: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    gap: spacing[2],
    padding: spacing[4],
  },
  questionPrompt: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  questionOptions: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 18,
  },
  actionsSection: {
    gap: spacing[4],
    paddingTop: spacing[8],
  },
  sectionHeadingRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionHint: {
    color: colors.faint,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[6],
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  errorInline: {
    alignItems: 'flex-start',
    backgroundColor: colors.coralSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
    padding: spacing[3],
  },
  errorInlineText: {
    color: colors.coral,
    flex: 1,
    fontSize: 13,
  },
  insightsSection: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing[8],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  insightHeading: {
    gap: spacing[1],
  },
  loadingInsights: {
    color: colors.muted,
    fontSize: 14,
    paddingVertical: spacing[5],
  },
  errorState: {
    alignSelf: 'center',
    gap: spacing[3],
    maxWidth: 480,
    paddingTop: spacing[10],
    width: '100%',
  },
  errorIcon: {
    alignItems: 'center',
    backgroundColor: colors.coralSoft,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  errorBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing[2],
  },
});
