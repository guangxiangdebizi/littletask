import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

interface PrimaryButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  tone?: 'primary' | 'quiet' | 'danger';
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
        tone === 'primary' ? styles.primary : tone === 'danger' ? styles.danger : styles.quiet,
        state.pressed &&
          !isDisabled &&
          (tone === 'primary'
            ? styles.primaryPressed
            : tone === 'danger'
              ? styles.dangerPressed
              : styles.quietPressed),
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'quiet' ? colors.ink : colors.surface} />
      ) : icon ? (
        <Feather color={tone === 'quiet' ? colors.ink : colors.surface} name={icon} size={18} />
      ) : null}
      <Text style={[styles.label, tone === 'quiet' ? styles.quietLabel : styles.primaryLabel]}>
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
  danger: {
    backgroundColor: colors.coral,
  },
  dangerPressed: {
    backgroundColor: colors.coralPressed,
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
