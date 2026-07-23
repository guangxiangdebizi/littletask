import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Platform, Text, View } from 'react-native';

import { AppHeader } from '../components/app-header';
import { HistoryItemRow } from '../components/history-item';
import { historyScreenStyles as styles } from '../components/history-screen-styles';
import { PrimaryButton } from '../components/primary-button';
import { Screen } from '../components/screen';
import { deleteIntake, getHistoryPage } from '../lib/api';
import { colors } from '../theme/tokens';

export default function HistoryScreen() {
  const queryClient = useQueryClient();
  const historyQuery = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => getHistoryPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteIntake,
    onSuccess: async (_result, intakeId) => {
      queryClient.removeQueries({ queryKey: ['intake', intakeId] });
      queryClient.removeQueries({ queryKey: ['activity', intakeId] });
      queryClient.removeQueries({ queryKey: ['insights', intakeId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        queryClient.invalidateQueries({ queryKey: ['data-summary'] }),
      ]);
    },
  });
  const items = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const confirmDelete = (intakeId: string, summary: string | null) => {
    const message = `“${summary ?? '未完成的截图分析'}”的卡片、洞察和执行回报将一起删除。此操作无法撤销。`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`删除这条处理记录？\n\n${message}`)) {
        deleteMutation.mutate(intakeId);
      }
      return;
    }
    Alert.alert('删除这条处理记录？', message, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除记录',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(intakeId),
      },
    ]);
  };

  return (
    <Screen>
      <AppHeader back title="处理记录" trailing="privacy" />
      <View style={styles.heading}>
        <Text style={styles.title}>处理记录</Text>
        <Text style={styles.subtitle}>按时间查看结果、执行状态和每次修改的来源。</Text>
      </View>

      {historyQuery.isPending ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          正在读取记录…
        </Text>
      ) : historyQuery.error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>历史记录暂时不可用</Text>
          <Text style={styles.message}>请确认网络和 API 状态，然后重新读取。</Text>
          <PrimaryButton
            label="重新读取"
            onPress={() => void historyQuery.refetch()}
            tone="quiet"
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather color={colors.pine} name="inbox" size={22} />
          </View>
          <Text style={styles.emptyTitle}>还没有处理记录</Text>
          <Text style={styles.message}>上传第一张聊天截图后，结构化结果会出现在这里。</Text>
          <PrimaryButton label="开始一次分析" onPress={() => router.replace('/')} />
        </View>
      ) : (
        <View style={styles.listSection}>
          <View accessibilityRole="list" style={styles.list}>
            {items.map((item) => (
              <HistoryItemRow
                deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
                item={item}
                key={item.id}
                onDelete={() => confirmDelete(item.id, item.summary)}
                onOpen={() => router.push(`/intake/${item.id}`)}
              />
            ))}
          </View>
          {deleteMutation.error ? (
            <Text accessibilityLiveRegion="polite" style={styles.deleteError}>
              记录删除失败，请检查网络后重试。
            </Text>
          ) : null}
          {historyQuery.hasNextPage ? (
            <PrimaryButton
              label="加载更早记录"
              loading={historyQuery.isFetchingNextPage}
              onPress={() => void historyQuery.fetchNextPage()}
              tone="quiet"
            />
          ) : (
            <Text style={styles.listEnd}>已显示全部记录</Text>
          )}
        </View>
      )}
    </Screen>
  );
}
