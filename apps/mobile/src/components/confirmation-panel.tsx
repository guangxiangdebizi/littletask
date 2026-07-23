import { Feather } from '@expo/vector-icons';
import type { ActionCard } from '@littletask/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import { ActionFields } from './action-card';
import { PrimaryButton } from './primary-button';

function Acknowledgement({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.acknowledgement, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Feather color={colors.surface} name="check" size={14} /> : null}
      </View>
      <Text style={styles.acknowledgementText}>{label}</Text>
    </Pressable>
  );
}

export function ConfirmationPanel({
  action,
  duplicateWarning,
  conflictWarning,
  duplicateAccepted,
  conflictAccepted,
  onDuplicateAccepted,
  onConflictAccepted,
  executing,
  onExecute,
}: {
  action: ActionCard;
  duplicateWarning: boolean;
  conflictWarning: boolean;
  duplicateAccepted: boolean;
  conflictAccepted: boolean;
  onDuplicateAccepted: (checked: boolean) => void;
  onConflictAccepted: (checked: boolean) => void;
  executing: boolean;
  onExecute: () => void;
}) {
  const accepted =
    (!duplicateWarning || duplicateAccepted) && (!conflictWarning || conflictAccepted);
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.lockIcon}>
          <Feather color={colors.pine} name="lock" size={17} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>最终确认 · 版本 {action.revision}</Text>
          <Text style={styles.subtitle}>
            下方是将要写入设备的完整内容。确认后此版本不能再编辑。
          </Text>
        </View>
      </View>
      <ActionFields action={action} complete />
      {action.type === 'create_event' && action.payload.attendees.length > 0 ? (
        <Text style={styles.footnote}>参与人会写入备注作为参考，不会自动发送日历邀请。</Text>
      ) : null}
      <Text style={styles.footnote}>
        确认后，仅与本卡片匹配的联系人摘要会用于生成建议，不会上传整本通讯录或具体号码。
      </Text>
      {duplicateWarning ? (
        <Acknowledgement
          checked={duplicateAccepted}
          label="我已核对候选联系人，仍然要创建一条新记录"
          onChange={onDuplicateAccepted}
        />
      ) : null}
      {conflictWarning ? (
        <Acknowledgement
          checked={conflictAccepted}
          label="我已看到时间冲突，仍然要创建这项日程"
          onChange={onConflictAccepted}
        />
      ) : null}
      <PrimaryButton
        disabled={!accepted}
        icon="check"
        label={`确认版本 ${action.revision} 并写入`}
        loading={executing}
        onPress={onExecute}
      />
      <Text style={styles.safety}>没有点击上面的确认按钮，不会发生任何联系人或日历写入。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.pineSoft,
    borderColor: colors.pine,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[4],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  lockIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerCopy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  footnote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  acknowledgement: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  pressed: {
    opacity: 0.72,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: 5,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.pine,
    borderColor: colors.pine,
  },
  acknowledgementText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  safety: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
