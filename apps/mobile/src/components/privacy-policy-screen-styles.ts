import { StyleSheet } from 'react-native';

import { colors, spacing } from '../theme/tokens';

export const privacyPolicyScreenStyles = StyleSheet.create({
  heading: {
    gap: spacing[2],
    marginBottom: spacing[8],
    marginTop: spacing[8],
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 39,
  },
  updated: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  lead: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 25,
    marginTop: spacing[2],
  },
  section: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    paddingVertical: spacing[6],
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 25,
  },
  paragraph: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  englishHeading: {
    color: colors.blue,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
    marginBottom: spacing[2],
    marginTop: spacing[8],
  },
  contactBlock: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[4],
    paddingTop: spacing[6],
  },
});
