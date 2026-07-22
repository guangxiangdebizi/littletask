import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeviceContactCandidate } from '../features/actions/device-types';
import { colors, radii, spacing } from '../theme/tokens';

export function ContactCandidates({
  candidates,
  selectable,
  onSelect,
}: {
  candidates: DeviceContactCandidate[];
  selectable: boolean;
  onSelect?: (candidate: DeviceContactCandidate) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Feather color={colors.amber} name="users" size={17} />
        <View style={styles.headingCopy}>
          <Text style={styles.title}>
            {selectable ? '选择要更新的联系人' : '发现可能重复的联系人'}
          </Text>
          <Text style={styles.subtitle}>
            {selectable
              ? '只读取下面这些本地候选，不会上传整本通讯录。'
              : '请先核对，避免在设备上创建重复记录。'}
          </Text>
        </View>
      </View>
      {candidates.map((candidate) => (
        <Pressable
          accessibilityHint={selectable ? '将此联系人关联到更新动作' : undefined}
          accessibilityRole={selectable ? 'button' : undefined}
          disabled={!selectable}
          key={candidate.id}
          onPress={() => onSelect?.(candidate)}
          style={({ pressed }) => [styles.row, pressed && selectable && styles.rowPressed]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{candidate.displayName.slice(0, 1)}</Text>
          </View>
          <View style={styles.contactCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{candidate.displayName}</Text>
              {candidate.simulated ? <Text style={styles.demoTag}>Web 演示候选</Text> : null}
            </View>
            {candidate.phones.length > 0 ? (
              <Text selectable style={styles.detail}>
                {candidate.phones.join(' · ')}
              </Text>
            ) : null}
            {candidate.emails.length > 0 ? (
              <Text selectable style={styles.detail}>
                {candidate.emails.join(' · ')}
              </Text>
            ) : null}
            {candidate.company ? <Text style={styles.detail}>{candidate.company}</Text> : null}
          </View>
          {selectable ? <Feather color={colors.pine} name="chevron-right" size={18} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.lg,
    gap: spacing[3],
    padding: spacing[4],
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
  },
  headingCopy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  rowPressed: {
    borderColor: colors.pine,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarText: {
    color: colors.pine,
    fontSize: 16,
    fontWeight: '800',
  },
  contactCopy: {
    flex: 1,
    gap: spacing[1],
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  name: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  demoTag: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '700',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
  },
});
