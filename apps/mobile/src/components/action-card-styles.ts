import { StyleSheet } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export const actionCardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderTopWidth: 3,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[4],
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  actionIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerCopy: { flex: 1 },
  actionType: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  revision: { color: colors.faint, fontSize: 11, marginTop: 2 },
  fields: {
    borderBottomColor: colors.line,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fieldRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[4],
    paddingVertical: spacing[3],
  },
  fieldLabel: { color: colors.muted, fontSize: 13, width: 64 },
  fieldValue: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  changeRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
  changeField: { color: colors.muted, fontFamily: 'monospace', fontSize: 11 },
  changeValues: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  previousValue: {
    color: colors.faint,
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
  nextValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  assumptions: {
    alignItems: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
  assumptionCopy: { flex: 1, gap: spacing[1] },
  assumptionTitle: { color: colors.amber, fontSize: 12, fontWeight: '700' },
  assumptionText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
});
