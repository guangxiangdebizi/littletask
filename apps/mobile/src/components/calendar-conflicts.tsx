import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { DeviceCalendarConflict } from '../features/actions/device-types';
import { colors, radii, spacing } from '../theme/tokens';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function CalendarConflicts({ conflicts }: { conflicts: DeviceCalendarConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Feather color={colors.coral} name="alert-circle" size={17} />
        <View style={styles.headingCopy}>
          <Text style={styles.title}>这个时间已有 {conflicts.length} 项日程</Text>
          <Text style={styles.subtitle}>LittleTask 不会修改原有日程，请确认仍要创建。</Text>
        </View>
      </View>
      {conflicts.map((conflict) => (
        <View key={`${conflict.calendarTitle}:${conflict.id}`} style={styles.row}>
          <View style={styles.timeRail} />
          <View style={styles.copy}>
            <Text style={styles.eventTitle}>{conflict.title}</Text>
            <Text style={styles.detail}>
              {formatTime(conflict.startAt)}–{formatTime(conflict.endAt)} · {conflict.calendarTitle}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.coralSoft,
    borderRadius: radii.lg,
    gap: spacing[3],
    padding: spacing[4],
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
  },
  headingCopy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[3],
    overflow: 'hidden',
    paddingRight: spacing[3],
  },
  timeRail: {
    backgroundColor: colors.coral,
    width: 4,
  },
  copy: {
    flex: 1,
    gap: spacing[1],
    paddingVertical: spacing[3],
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
  },
});
