import { Feather } from '@expo/vector-icons';
import type { Insight } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme/tokens';

const priorityColors = {
  high: colors.coral,
  medium: colors.amber,
  low: colors.pine,
} as const;

export function InsightRow({ insight }: { insight: Insight }) {
  return (
    <View style={styles.container}>
      <View style={[styles.marker, { backgroundColor: priorityColors[insight.priority] }]} />
      <View style={styles.copy}>
        <Text style={styles.title}>{insight.title}</Text>
        <Text style={styles.body}>{insight.body}</Text>
        <View style={styles.evidence}>
          <Feather color={colors.faint} name="link-2" size={13} />
          <Text style={styles.evidenceText}>{insight.evidence[0]}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    paddingVertical: spacing[4],
  },
  marker: {
    borderRadius: 2,
    marginTop: 5,
    width: 4,
  },
  copy: {
    flex: 1,
    gap: spacing[2],
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  evidence: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
  },
  evidenceText: {
    color: colors.faint,
    flex: 1,
    fontSize: 12,
  },
});
