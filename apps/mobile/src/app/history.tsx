import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../components/app-header';
import { PrimaryButton } from '../components/primary-button';
import { Screen } from '../components/screen';
import { getHistory } from '../lib/api';
import { colors, radii, spacing } from '../theme/tokens';

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function HistoryScreen() {
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: getHistory });

  return (
    <Screen>
      <AppHeader back />
      <View style={styles.heading}>
        <Text style={styles.title}>处理记录</Text>
        <Text style={styles.subtitle}>查看截图分析、卡片状态和执行结果。</Text>
      </View>

      {historyQuery.isPending ? (
        <Text style={styles.message}>正在读取记录…</Text>
      ) : historyQuery.error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>历史记录暂时不可用</Text>
          <Text style={styles.message}>请确认 API 已启动，然后重新读取。</Text>
          <PrimaryButton
            label="重新读取"
            onPress={() => void historyQuery.refetch()}
            tone="quiet"
          />
        </View>
      ) : historyQuery.data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather color={colors.pine} name="inbox" size={22} />
          </View>
          <Text style={styles.emptyTitle}>还没有处理记录</Text>
          <Text style={styles.message}>上传第一张聊天截图后，分析结果会出现在这里。</Text>
          <PrimaryButton label="开始一次分析" onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={styles.list}>
          {historyQuery.data.map((intake) => (
            <Pressable
              accessibilityHint="打开这次截图分析"
              accessibilityRole="button"
              key={intake.id}
              onPress={() => router.push(`/intake/${intake.id}`)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={styles.itemTop}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {intake.summary || '正在分析聊天截图'}
                </Text>
                <Feather color={colors.faint} name="chevron-right" size={18} />
              </View>
              <View style={styles.itemMeta}>
                <Text style={styles.metaText}>{formatCreatedAt(intake.createdAt)}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>{intake.actions.length} 个动作</Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>{intake.status}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing[2],
    paddingBottom: spacing[6],
    paddingTop: spacing[8],
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  item: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    minHeight: 92,
    padding: spacing[4],
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  itemTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  itemMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  metaText: {
    color: colors.faint,
    fontSize: 12,
  },
  metaDot: {
    backgroundColor: colors.lineStrong,
    borderRadius: 2,
    height: 3,
    width: 3,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[8],
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorState: {
    gap: spacing[3],
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
