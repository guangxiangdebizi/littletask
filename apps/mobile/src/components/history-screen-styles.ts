import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export const historyScreenStyles = StyleSheet.create({
  heading: {
    gap: spacing[2],
    paddingBottom: spacing[6],
    paddingTop: spacing[8],
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  listSection: {
    gap: spacing[4],
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listEnd: {
    color: colors.faint,
    fontSize: 12,
    textAlign: 'center',
  },
  deleteError: {
    color: colors.coral,
    fontSize: 13,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[8],
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorState: {
    gap: spacing[3],
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
