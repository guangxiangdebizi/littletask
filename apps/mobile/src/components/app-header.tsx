import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import { BrandMark } from './brand-mark';

export function AppHeader({ back = false }: { back?: boolean }) {
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
      {back ? <Text style={styles.backTitle}>分析结果</Text> : <View style={styles.spacer} />}
      <Pressable
        accessibilityLabel="查看历史记录"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.push('/history')}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Feather color={colors.ink} name="clock" size={19} />
      </Pressable>
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
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
