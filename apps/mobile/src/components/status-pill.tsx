import { Feather } from '@expo/vector-icons';
import type { ActionStatus } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

const statusContent: Record<
  ActionStatus,
  { label: string; icon: keyof typeof Feather.glyphMap; foreground: string; background: string }
> = {
  draft: {
    label: '草稿',
    icon: 'file-text',
    foreground: colors.muted,
    background: colors.surfaceMuted,
  },
  needs_input: {
    label: '需要确认',
    icon: 'help-circle',
    foreground: colors.amber,
    background: colors.amberSoft,
  },
  ready: { label: '待确认', icon: 'eye', foreground: colors.blue, background: colors.blueSoft },
  confirmed: {
    label: '已确认',
    icon: 'check',
    foreground: colors.pine,
    background: colors.pineSoft,
  },
  executing: {
    label: '执行中',
    icon: 'loader',
    foreground: colors.blue,
    background: colors.blueSoft,
  },
  succeeded: {
    label: '已完成',
    icon: 'check-circle',
    foreground: colors.pine,
    background: colors.pineSoft,
  },
  failed: {
    label: '执行失败',
    icon: 'alert-circle',
    foreground: colors.coral,
    background: colors.coralSoft,
  },
  cancelled: {
    label: '已取消',
    icon: 'x',
    foreground: colors.muted,
    background: colors.surfaceMuted,
  },
};

export function StatusPill({ status }: { status: ActionStatus }) {
  const content = statusContent[status];
  return (
    <View
      accessibilityLabel={`状态：${content.label}`}
      style={[styles.container, { backgroundColor: content.background }]}
    >
      <Feather color={content.foreground} name={content.icon} size={13} />
      <Text style={[styles.label, { color: content.foreground }]}>{content.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
