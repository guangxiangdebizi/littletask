import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export const privacyScreenStyles = StyleSheet.create({
  heading: {
    gap: spacing[2],
    paddingBottom: spacing[6],
    paddingTop: spacing[8],
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[4],
    marginBottom: spacing[4],
    padding: spacing[5],
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  stat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing[1],
    padding: spacing[3],
  },
  statValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  temporaryRow: {
    alignItems: 'center',
    flexBasis: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
  },
  temporaryLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  temporaryValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  helper: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  errorBlock: {
    gap: spacing[3],
  },
  policyRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  policyDot: {
    backgroundColor: colors.pine,
    borderRadius: radii.pill,
    height: 6,
    marginTop: 7,
    width: 6,
  },
  policyText: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  dangerSection: {
    backgroundColor: colors.coralSoft,
    borderColor: colors.coral,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[5],
  },
  dangerTitle: {
    color: colors.coral,
    fontSize: 17,
    fontWeight: '800',
  },
  success: {
    color: colors.pine,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: colors.coral,
    fontSize: 13,
    lineHeight: 19,
  },
});
