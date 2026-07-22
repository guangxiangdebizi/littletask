import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';

import { AppHeader } from '../components/app-header';
import { PrimaryButton } from '../components/primary-button';
import { privacyScreenStyles as styles } from '../components/privacy-screen-styles';
import { Screen } from '../components/screen';
import { executionLedger } from '../features/actions/execution-ledger';
import { clearAllData, deleteAccount, getDataSummary } from '../lib/api';
import { colors } from '../theme/tokens';

export default function PrivacyScreen() {
  const queryClient = useQueryClient();
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const summaryQuery = useQuery({ queryKey: ['data-summary'], queryFn: getDataSummary });
  const clearMutation = useMutation({
    mutationFn: clearAllData,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['history'] });
      queryClient.removeQueries({ queryKey: ['intake'] });
      queryClient.removeQueries({ queryKey: ['activity'] });
      queryClient.removeQueries({ queryKey: ['insights'] });
      await queryClient.invalidateQueries({ queryKey: ['data-summary'] });
    },
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await deleteAccount();
      try {
        await executionLedger.clearAll();
        return { localLedgerCleared: true };
      } catch {
        return { localLedgerCleared: false };
      }
    },
    onSuccess: ({ localLedgerCleared }) => {
      queryClient.clear();
      if (!localLedgerCleared) {
        const message = '服务端账户已删除，但本机执行账本清除失败，可稍后在隐私页重试。';
        if (Platform.OS === 'web') globalThis.alert(message);
        else Alert.alert('本机账本未清除', message);
      }
      router.replace('/');
    },
  });

  const confirmServerClear = () => {
    const message =
      '所有处理记录、Action Cards、版本、确认、执行回报和洞察都会永久删除。设备中已经创建的联系人和日历不会被修改。';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`删除全部服务端数据？\n\n${message}`)) clearMutation.mutate();
      return;
    }
    Alert.alert('删除全部服务端数据？', message, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => clearMutation.mutate(),
      },
    ]);
  };

  const confirmLocalClear = () => {
    const message = '这会移除本机用于防止重复写入的执行记录，不会删除联系人、日历或服务端历史。';
    const clear = () => {
      void executionLedger
        .clearAll()
        .then(() => setLocalMessage('本机执行账本已清除。'))
        .catch(() => setLocalMessage('本机执行账本清除失败，请重试。'));
    };
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`清除本机执行账本？\n\n${message}`)) clear();
      return;
    }
    Alert.alert('清除本机执行账本？', message, [
      { text: '取消', style: 'cancel' },
      {
        text: '清除本机记录',
        style: 'destructive',
        onPress: clear,
      },
    ]);
  };

  const confirmAccountDelete = () => {
    const message =
      '这会永久删除当前匿名账户、全部服务端记录和本机防重复账本。设备中已经创建的联系人和日历不会被修改。';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`删除匿名账户？\n\n${message}`)) deleteAccountMutation.mutate();
      return;
    }
    Alert.alert('删除匿名账户？', message, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除账户',
        style: 'destructive',
        onPress: () => deleteAccountMutation.mutate(),
      },
    ]);
  };

  return (
    <Screen>
      <AppHeader back title="隐私与数据" trailing="none" />
      <View style={styles.heading}>
        <Text style={styles.title}>隐私与数据</Text>
        <Text style={styles.subtitle}>查看系统保存的结构化数据，并明确控制删除范围。</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Feather color={colors.pine} name="database" size={18} />
          <Text style={styles.sectionTitle}>当前服务端数据</Text>
        </View>
        {summaryQuery.isPending ? (
          <Text accessibilityLiveRegion="polite" style={styles.helper}>
            正在统计…
          </Text>
        ) : summaryQuery.error || !summaryQuery.data ? (
          <View style={styles.errorBlock}>
            <Text style={styles.helper}>暂时无法读取数据统计。</Text>
            <PrimaryButton
              label="重新读取"
              onPress={() => void summaryQuery.refetch()}
              tone="quiet"
            />
          </View>
        ) : (
          <View style={styles.stats}>
            <DataStat label="处理记录" value={summaryQuery.data.intakes} />
            <DataStat label="动作卡片" value={summaryQuery.data.actions} />
            <DataStat label="执行回报" value={summaryQuery.data.executionResults} />
            <DataStat label="洞察" value={summaryQuery.data.insights} />
            <View style={styles.temporaryRow}>
              <Text style={styles.temporaryLabel}>分析中的临时截图</Text>
              <Text style={styles.temporaryValue}>{summaryQuery.data.temporaryScreenshots}</Text>
            </View>
          </View>
        )}
        <Text style={styles.helper}>
          原始截图在分析完成或失败后即从任务队列移除，不作为历史保存。
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Feather color={colors.blue} name="shield" size={18} />
          <Text style={styles.sectionTitle}>数据边界</Text>
        </View>
        <PolicyRow text="联系人候选和日历冲突的名称、号码及详情只留在设备。" />
        <PolicyRow text="后端只接收两个不超过 8 的计数，用于生成有依据的提醒。" />
        <PolicyRow text="补充文字、结构化卡片、版本和执行状态会保存在服务端历史中。" />
        <PolicyRow text="截图会发送至配置的 AI 服务完成当次分析，Responses 请求关闭存储。" />
        <PrimaryButton
          icon="file-text"
          label="查看完整隐私政策"
          onPress={() => router.push('/privacy-policy')}
          tone="quiet"
        />
      </View>

      <View style={styles.dangerSection}>
        <Text style={styles.dangerTitle}>删除数据</Text>
        <Text style={styles.helper}>
          两类数据分开管理，删除服务端历史不会改动系统联系人或日历。
        </Text>
        <PrimaryButton
          icon="trash-2"
          label="删除全部服务端数据"
          loading={clearMutation.isPending}
          onPress={confirmServerClear}
          tone="danger"
        />
        {clearMutation.isSuccess ? (
          <Text accessibilityLiveRegion="polite" style={styles.success}>
            已删除 {clearMutation.data.deletedIntakes} 条服务端处理记录。
          </Text>
        ) : clearMutation.error ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            服务端数据删除失败，请检查网络后重试。
          </Text>
        ) : null}
        <PrimaryButton label="只清除本机执行账本" onPress={confirmLocalClear} tone="quiet" />
        <PrimaryButton
          icon="user-x"
          label="删除匿名账户"
          loading={deleteAccountMutation.isPending}
          onPress={confirmAccountDelete}
          tone="danger"
        />
        {deleteAccountMutation.error ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            匿名账户删除失败，请检查网络后重试。
          </Text>
        ) : null}
        {localMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.success}>
            {localMessage}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function DataStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PolicyRow({ text }: { text: string }) {
  return (
    <View style={styles.policyRow}>
      <View style={styles.policyDot} />
      <Text style={styles.policyText}>{text}</Text>
    </View>
  );
}
