import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radii, spacing } from '../../theme/tokens';

export function FormField({
  label,
  hint,
  style,
  multiline,
  accessibilityLabel,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <TextInput
        {...props}
        accessibilityLabel={accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={colors.faint}
        style={[
          styles.input,
          multiline && styles.multiline,
          props.editable === false && styles.disabled,
          style,
        ]}
      />
    </View>
  );
}

export function FormGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ReadonlyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text selectable style={styles.readonlyValue}>
        {value || '未记录'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing[2],
  },
  labelRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    color: colors.faint,
    fontSize: 11,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  disabled: {
    backgroundColor: colors.canvas,
    color: colors.muted,
  },
  group: {
    gap: spacing[3],
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  readonlyRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    paddingBottom: spacing[2],
  },
  readonlyLabel: {
    color: colors.faint,
    fontSize: 11,
  },
  readonlyValue: {
    color: colors.ink,
    fontSize: 14,
  },
});
