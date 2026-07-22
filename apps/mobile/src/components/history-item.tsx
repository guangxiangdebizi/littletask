import { Feather } from '@expo/vector-icons';
import type { HistoryItem, HistoryOutcome } from '@littletask/contracts';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

const outcomeVisuals: Record<HistoryOutcome, { label: string; color: string; soft: string }> = {
  pending: { label: '待处理', color: colors.blue, soft: colors.blueSoft },
  partial: { label: '部分完成', color: colors.amber, soft: colors.amberSoft },
  completed: { label: '已完成', color: colors.pine, soft: colors.pineSoft },
  needs_attention: { label: '需要处理', color: colors.coral, soft: colors.coralSoft },
  no_action: { label: '无可执行动作', color: colors.muted, soft: colors.surfaceMuted },
};

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function actionSummary(item: HistoryItem): string {
  const parts = [`${item.actions.total} 个动作`];
  if (item.actions.succeeded > 0) parts.push(`${item.actions.succeeded} 已完成`);
  if (item.actions.failed > 0) parts.push(`${item.actions.failed} 失败`);
  if (item.actions.needsReview > 0) parts.push(`${item.actions.needsReview} 待核对`);
  return parts.join(' · ');
}

interface HistoryItemRowProps {
  item: HistoryItem;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function HistoryItemRow({ item, deleting, onOpen, onDelete }: HistoryItemRowProps) {
  const outcome = outcomeVisuals[item.outcome];
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityHint="打开详情和活动记录"
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.openArea, pressed && styles.pressed]}
      >
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.title}>
            {item.summary || '正在分析聊天截图'}
          </Text>
          <View style={[styles.outcome, { backgroundColor: outcome.soft }]}>
            <Text style={[styles.outcomeText, { color: outcome.color }]}>{outcome.label}</Text>
          </View>
        </View>
        <Text style={styles.meta}>{formatCreatedAt(item.createdAt)}</Text>
        <Text style={styles.meta}>{actionSummary(item)}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="删除这条处理记录"
        accessibilityRole="button"
        disabled={deleting}
        hitSlop={6}
        onPress={onDelete}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.deletePressed]}
      >
        {deleting ? (
          <ActivityIndicator color={colors.coral} size="small" />
        ) : (
          <Feather color={colors.coral} name="trash-2" size={17} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  openArea: {
    flex: 1,
    gap: spacing[2],
    minHeight: 108,
    padding: spacing[4],
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  outcome: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  outcomeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
  },
  deletePressed: {
    backgroundColor: colors.coralSoft,
  },
});
