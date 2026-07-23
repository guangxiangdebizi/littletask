import type { ActionCard } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

const sourceLabels = {
  screenshot: '截图证据',
  note: '补充文字',
  contact: '联系人信息',
  calendar: '日历信息',
  history: '历史记录',
} as const;

export function EvidenceRail({
  evidence,
  accent,
}: {
  evidence: ActionCard['evidence'];
  accent: string;
}) {
  const first = evidence[0];
  if (!first) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.rail, { backgroundColor: accent }]} />
      <View style={styles.content}>
        <Text style={styles.label}>{sourceLabels[first.source]}</Text>
        <Text style={styles.quote}>“{first.quote}”</Text>
        {evidence.length > 1 ? (
          <Text style={styles.more}>另有 {evidence.length - 1} 条依据</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvas,
    borderRadius: radii.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  rail: {
    width: 4,
  },
  content: {
    flex: 1,
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  label: {
    color: colors.muted,
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
  },
  quote: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  more: {
    color: colors.faint,
    fontSize: 12,
  },
});
