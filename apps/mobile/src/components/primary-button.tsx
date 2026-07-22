import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

interface PrimaryButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  tone?: 'primary' | 'quiet';
}

export function PrimaryButton({
  label,
  icon,
  loading = false,
  tone = 'primary',
  disabled,
  style,
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        tone === 'primary' ? styles.primary : styles.quiet,
        state.pressed &&
          !isDisabled &&
          (tone === 'primary' ? styles.primaryPressed : styles.quietPressed),
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? colors.surface : colors.ink} />
      ) : icon ? (
        <Feather color={tone === 'primary' ? colors.surface : colors.ink} name={icon} size={18} />
      ) : null}
      <Text style={[styles.label, tone === 'primary' ? styles.primaryLabel : styles.quietLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing[5],
  },
  primary: {
    backgroundColor: colors.pine,
  },
  primaryPressed: {
    backgroundColor: colors.pinePressed,
  },
  quiet: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderWidth: 1,
  },
  quietPressed: {
    backgroundColor: colors.pineSoft,
  },
  disabled: {
    opacity: 0.48,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryLabel: {
    color: colors.surface,
  },
  quietLabel: {
    color: colors.ink,
  },
});
