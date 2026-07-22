import { Feather } from '@expo/vector-icons';
import type { ActionCard as ActionCardModel } from '@littletask/contracts';
import { Text, View } from 'react-native';

import { actionVisuals, colors } from '../theme/tokens';
import { actionCardStyles as styles } from './action-card-styles';
import { EvidenceRail } from './evidence-rail';
import { PrimaryButton } from './primary-button';
import { StatusPill } from './status-pill';

interface ActionCardProps {
  action: ActionCardModel;
  onOpen: (action: ActionCardModel) => void;
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

const changeLabels: Record<string, string> = {
  givenName: '名',
  familyName: '姓',
  displayName: '显示名称',
  phone: '电话',
  email: '邮箱',
  company: '公司',
  jobTitle: '职位',
  address: '地址',
  notes: '备注',
};

export function ActionFields({
  action,
  complete = false,
}: {
  action: ActionCardModel;
  complete?: boolean;
}) {
  if (action.type === 'create_event') {
    const { payload } = action;
    return (
      <View style={styles.fields}>
        <FieldRow label="标题" value={payload.title} />
        <FieldRow label="开始" value={formatDateTime(payload.startAt, payload.timezone)} />
        {payload.endAt ? (
          <FieldRow label="结束" value={formatDateTime(payload.endAt, payload.timezone)} />
        ) : complete ? (
          <FieldRow
            label="时长"
            value={`${payload.suggestedDurationMinutes ?? 60} 分钟（无明确结束时间）`}
          />
        ) : null}
        {complete ? <FieldRow label="时区" value={payload.timezone} /> : null}
        {payload.location ? <FieldRow label="地点" value={payload.location} /> : null}
        {payload.attendees.length > 0 ? (
          <FieldRow
            label="参与人"
            value={payload.attendees.map((item) => item.displayName).join('、')}
          />
        ) : null}
        {complete && payload.notes ? <FieldRow label="备注" value={payload.notes} /> : null}
      </View>
    );
  }

  if (action.type === 'create_contact') {
    const { payload } = action;
    return (
      <View style={styles.fields}>
        <FieldRow label="姓名" value={payload.displayName} />
        {complete && (payload.familyName || payload.givenName) ? (
          <FieldRow
            label="姓 / 名"
            value={`${payload.familyName || '—'} / ${payload.givenName || '—'}`}
          />
        ) : null}
        {payload.phones.length > 0 ? (
          <FieldRow label="电话" value={payload.phones.join('、')} />
        ) : null}
        {payload.emails.length > 0 ? (
          <FieldRow label="邮箱" value={payload.emails.join('、')} />
        ) : null}
        {payload.company ? <FieldRow label="公司" value={payload.company} /> : null}
        {payload.jobTitle ? <FieldRow label="职位" value={payload.jobTitle} /> : null}
        {complete && payload.address ? <FieldRow label="地址" value={payload.address} /> : null}
        {complete && payload.notes ? <FieldRow label="备注" value={payload.notes} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.fields}>
      <FieldRow label="目标联系人" value={action.payload.target.displayName} />
      {complete ? (
        <FieldRow
          label="设备记录"
          value={action.payload.target.localContactId ? '已由你选择并绑定' : '尚未选择'}
        />
      ) : null}
      {action.payload.changes.map((change) => (
        <View key={`${change.field}-${change.nextValue}`} style={styles.changeRow}>
          <Text style={styles.changeField}>{changeLabels[change.field] ?? change.field}</Text>
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

export function ActionCard({ action, onOpen, simulatedExecution }: ActionCardProps) {
  const visual = actionVisuals[action.type];
  const canOpen = ['ready', 'needs_input', 'confirmed', 'failed', 'succeeded'].includes(
    action.status,
  );
  const label =
    action.status === 'needs_input'
      ? '补全信息'
      : action.status === 'succeeded'
        ? '查看已执行内容'
        : action.status === 'failed'
          ? '查看并重试'
          : simulatedExecution
            ? '核对并模拟执行'
            : '核对并执行';

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

      {canOpen ? (
        <PrimaryButton
          icon={action.status === 'succeeded' ? 'eye' : 'arrow-right'}
          label={label}
          onPress={() => onOpen(action)}
          tone={action.status === 'succeeded' ? 'quiet' : 'primary'}
        />
      ) : null}
    </View>
  );
}
