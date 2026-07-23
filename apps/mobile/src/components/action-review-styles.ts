import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export const actionReviewStyles = StyleSheet.create({
  loading: {
    color: colors.muted,
    fontSize: 14,
    paddingTop: spacing[10],
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    paddingBottom: spacing[4],
    paddingTop: spacing[8],
  },
  icon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  revision: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing[1],
  },
  section: {
    gap: spacing[3],
    paddingTop: spacing[8],
  },
  sectionHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionHint: {
    color: colors.faint,
    fontSize: 12,
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
    padding: spacing[3],
  },
  noticeText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  guidance: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    gap: spacing[1],
    marginTop: spacing[4],
    padding: spacing[3],
  },
  guidanceTitle: {
    color: colors.amber,
    fontSize: 14,
    fontWeight: '800',
  },
  guidanceBody: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  success: {
    alignItems: 'flex-start',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[6],
    padding: spacing[4],
  },
  successCopy: {
    flex: 1,
    gap: spacing[1],
  },
  successTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  successBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  preparePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[3],
    marginTop: spacing[6],
    padding: spacing[4],
  },
  prepareTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  prepareBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  preparationResults: {
    gap: spacing[3],
    marginTop: spacing[4],
  },
  error: {
    alignItems: 'flex-start',
    backgroundColor: colors.coralSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    padding: spacing[4],
  },
  syncPending: {
    alignItems: 'flex-start',
    backgroundColor: colors.blueSoft,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    padding: spacing[4],
  },
  errorCopy: {
    flex: 1,
    gap: spacing[2],
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  fatalError: {
    gap: spacing[3],
    paddingTop: spacing[10],
  },
});
