import { Feather } from '@expo/vector-icons';
import type { ActionCard as ActionCardModel } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { actionVisuals, colors, radii, spacing } from '../theme/tokens';
import { EvidenceRail } from './evidence-rail';
import { PrimaryButton } from './primary-button';
import { StatusPill } from './status-pill';

interface ActionCardProps {
  action: ActionCardModel;
  isConfirming?: boolean;
  onConfirm: (action: ActionCardModel) => void;
  simulatedExecution: boolean;
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text selectable style={styles.fieldValue}>
        {value}
      </Text>
    </View>
  );
}

function ActionFields({ action }: { action: ActionCardModel }) {
  if (action.type === 'create_event') {
    const { payload } = action;
    return (
      <View style={styles.fields}>
        <FieldRow label="标题" value={payload.title} />
        <FieldRow label="开始" value={formatDateTime(payload.startAt, payload.timezone)} />
        {payload.endAt ? (
          <FieldRow label="结束" value={formatDateTime(payload.endAt, payload.timezone)} />
        ) : null}
        {payload.location ? <FieldRow label="地点" value={payload.location} /> : null}
        {payload.attendees.length > 0 ? (
          <FieldRow
            label="参与人"
            value={payload.attendees.map((item) => item.displayName).join('、')}
          />
        ) : null}
      </View>
    );
  }

  if (action.type === 'create_contact') {
    const { payload } = action;
    return (
      <View style={styles.fields}>
        <FieldRow label="姓名" value={payload.displayName} />
        {payload.phones.length > 0 ? (
          <FieldRow label="电话" value={payload.phones.join('、')} />
        ) : null}
        {payload.emails.length > 0 ? (
          <FieldRow label="邮箱" value={payload.emails.join('、')} />
        ) : null}
        {payload.company ? <FieldRow label="公司" value={payload.company} /> : null}
        {payload.jobTitle ? <FieldRow label="职位" value={payload.jobTitle} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.fields}>
      <FieldRow label="目标联系人" value={action.payload.target.displayName} />
      {action.payload.changes.map((change) => (
        <View key={`${change.field}-${change.nextValue}`} style={styles.changeRow}>
          <Text style={styles.changeField}>{change.field}</Text>
          <View style={styles.changeValues}>
            <Text style={styles.previousValue}>{change.previousValue || '未记录'}</Text>
            <Feather color={colors.faint} name="arrow-right" size={15} />
            <Text selectable style={styles.nextValue}>
              {change.nextValue}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ActionCard({
  action,
  isConfirming = false,
  onConfirm,
  simulatedExecution,
}: ActionCardProps) {
  const visual = actionVisuals[action.type];
  const canConfirm = action.status === 'ready';

  return (
    <View style={[styles.card, { borderTopColor: visual.accent }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.actionIcon, { backgroundColor: visual.soft }]}>
          <Feather color={visual.accent} name={visual.icon} size={18} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.actionType}>{visual.label}</Text>
          <Text style={styles.revision}>版本 {action.revision}</Text>
        </View>
        <StatusPill status={action.status} />
      </View>

      <EvidenceRail accent={visual.accent} evidence={action.evidence} />
      <ActionFields action={action} />

      {action.assumptions.length > 0 ? (
        <View style={styles.assumptions}>
          <Feather color={colors.amber} name="alert-triangle" size={16} />
          <View style={styles.assumptionCopy}>
            <Text style={styles.assumptionTitle}>需要留意</Text>
            {action.assumptions.map((assumption) => (
              <Text key={assumption} style={styles.assumptionText}>
                {assumption}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {canConfirm ? (
        <PrimaryButton
          icon="check"
          label={simulatedExecution ? '确认并模拟执行' : '确认并执行'}
          loading={isConfirming}
          onPress={() => onConfirm(action)}
        />
      ) : action.status === 'needs_input' ? (
        <View style={styles.needsInput}>
          <Text style={styles.needsInputText}>补全信息后才能确认执行。</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderTopWidth: 3,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[4],
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  headerCopy: {
    flex: 1,
  },
  actionType: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  revision: {
    color: colors.faint,
    fontSize: 11,
    marginTop: 2,
  },
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
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    width: 64,
  },
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
  changeField: {
    color: colors.muted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
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
  nextValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  assumptions: {
    alignItems: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
  assumptionCopy: {
    flex: 1,
    gap: spacing[1],
  },
  assumptionTitle: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
  },
  assumptionText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19,
  },
  needsInput: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.md,
    padding: spacing[3],
  },
  needsInputText: {
    color: colors.amber,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
