import { Feather } from '@expo/vector-icons';
import type { ActivityEvent, ActivityEventType } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { actionVisuals, colors, radii, spacing } from '../theme/tokens';

const eventLabels: Record<ActivityEventType, string> = {
  intake_created: '提交了截图分析',
  analysis_completed: 'AI 分析和复核完成',
  analysis_failed: 'AI 分析未完成',
  action_revised: '保存了卡片版本',
  action_confirmed: '确认了卡片',
  execution_succeeded: '设备动作执行成功',
  execution_failed: '设备动作执行失败',
};

const sourceLabels = {
  user: '用户',
  ai: 'AI',
  system: '系统',
  device: '设备',
} as const;

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function detail(event: ActivityEvent): string {
  const parts: string[] = [sourceLabels[event.source]];
  if (event.actionType) parts.push(actionVisuals[event.actionType].label);
  if (event.revision) parts.push(`版本 ${event.revision}`);
  if (event.errorCode) parts.push(event.errorCode);
  return parts.join(' · ');
}

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <View accessibilityLabel="活动记录" style={styles.container}>
      {events.map((event, index) => (
        <View key={event.id} style={styles.event}>
          <View style={styles.rail}>
            <View style={styles.dot} />
            {index < events.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{eventLabels[event.type]}</Text>
              <Text style={styles.time}>{formatTime(event.occurredAt)}</Text>
            </View>
            <Text style={styles.detail}>{detail(event)}</Text>
          </View>
        </View>
      ))}
      <View style={styles.provenanceNote}>
        <Feather color={colors.faint} name="info" size={14} />
        <Text style={styles.provenanceText}>版本来源和执行状态来自服务端审计记录。</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing[4],
  },
  event: {
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 60,
  },
  rail: {
    alignItems: 'center',
    width: 12,
  },
  dot: {
    backgroundColor: colors.pine,
    borderRadius: radii.pill,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  line: {
    backgroundColor: colors.line,
    flex: 1,
    marginVertical: spacing[1],
    width: 1,
  },
  copy: {
    flex: 1,
    gap: spacing[1],
    paddingBottom: spacing[4],
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  time: {
    color: colors.faint,
    fontSize: 11,
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  provenanceNote: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop: spacing[3],
  },
  provenanceText: {
    color: colors.faint,
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
});
