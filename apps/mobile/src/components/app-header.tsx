import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import { BrandMark } from './brand-mark';

type HeaderTrailing = 'history' | 'privacy' | 'none';

interface AppHeaderProps {
  back?: boolean;
  title?: string;
  trailing?: HeaderTrailing;
}

const trailingActions = {
  history: {
    accessibilityLabel: '查看历史记录',
    icon: 'clock' as const,
    route: '/history' as const,
  },
  privacy: {
    accessibilityLabel: '查看隐私与数据设置',
    icon: 'shield' as const,
    route: '/privacy' as const,
  },
};

export function AppHeader({ back = false, title, trailing = 'history' }: AppHeaderProps) {
  const trailingAction = trailing === 'none' ? null : trailingActions[trailing];

  return (
    <View style={styles.container}>
      {back ? (
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Feather color={colors.ink} name="arrow-left" size={20} />
        </Pressable>
      ) : (
        <BrandMark />
      )}
      {back ? (
        <Text numberOfLines={1} style={styles.backTitle}>
          {title ?? '分析结果'}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      {trailingAction ? (
        <Pressable
          accessibilityLabel={trailingAction.accessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push(trailingAction.route)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Feather color={colors.ink} name={trailingAction.icon} size={19} />
        </Pressable>
      ) : (
        <View style={styles.iconPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  spacer: {
    flex: 1,
  },
  backTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: spacing[3],
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconPlaceholder: {
    width: 44,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
