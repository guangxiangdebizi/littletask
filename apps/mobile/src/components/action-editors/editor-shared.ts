import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../../theme/tokens';

export function validationMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    const issues = error.issues as { message?: string }[];
    return issues[0]?.message ?? '请检查填写内容。';
  }
  return error instanceof Error ? error.message : '请检查填写内容。';
}

export const editorStyles = StyleSheet.create({
  editor: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[5],
    padding: spacing[4],
  },
  twoColumns: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  column: {
    flex: 1,
  },
  shortColumn: {
    flex: 0.65,
  },
  changeBlock: {
    backgroundColor: colors.canvas,
    borderRadius: radii.sm,
    gap: spacing[3],
    padding: spacing[3],
  },
  error: {
    color: colors.coral,
    fontSize: 13,
    lineHeight: 19,
  },
});
