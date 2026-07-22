import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import { PrimaryButton } from './primary-button';

export function UncertainExecutionPanel({
  busy,
  onMarkSucceeded,
  onRetry,
  retryDisabled = false,
}: {
  busy: boolean;
  onMarkSucceeded: () => void;
  onRetry: () => void;
  retryDisabled?: boolean;
}) {
  return (
    <View accessibilityLiveRegion="assertive" style={styles.panel}>
      <View style={styles.heading}>
        <Feather color={colors.coral} name="shield" size={19} />
        <View style={styles.copy}>
          <Text style={styles.title}>先核对系统记录，暂不自动重试</Text>
          <Text style={styles.body}>
            上一次写入在系统返回结果前中断。LittleTask
            已锁住这次动作，避免再次点击产生重复联系人或日程。
          </Text>
        </View>
      </View>
      <PrimaryButton disabled={busy} label="我已看到记录，标记为完成" onPress={onMarkSucceeded} />
      <PrimaryButton
        disabled={busy || retryDisabled}
        label={retryDisabled ? '先完成上方设备核对再重试' : '我已确认没有记录，重新执行'}
        onPress={onRetry}
        tone="quiet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.coralSoft,
    borderColor: colors.coral,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[4],
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  copy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
