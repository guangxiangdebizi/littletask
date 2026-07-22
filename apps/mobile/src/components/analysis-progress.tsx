import { Feather } from '@expo/vector-icons';
import type { IntakeStatus } from '@littletask/contracts';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

const steps = [
  { label: '读取截图语境', icon: 'message-square' as const },
  { label: '生成 Action Cards', icon: 'layers' as const },
  { label: '独立复核依据', icon: 'check-square' as const },
];

export function AnalysisProgress({ status }: { status: IntakeStatus }) {
  const activeIndex = status === 'queued' ? 0 : status === 'processing' ? 1 : 2;

  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      <View style={styles.header}>
        <View style={styles.pulse} />
        <View style={styles.headerText}>
          <Text style={styles.title}>正在理解这段对话</Text>
          <Text style={styles.subtitle}>原图只用于本次分析，默认不长期保留。</Text>
        </View>
      </View>
      <View style={styles.steps}>
        {steps.map((step, index) => {
          const completed = index < activeIndex;
          const active = index === activeIndex;
          return (
            <View key={step.label} style={styles.step}>
              <View
                style={[
                  styles.stepIcon,
                  (completed || active) && styles.stepIconActive,
                  completed && styles.stepIconComplete,
                ]}
              >
                <Feather
                  color={completed || active ? colors.surface : colors.faint}
                  name={completed ? 'check' : step.icon}
                  size={15}
                />
              </View>
              <Text style={[styles.stepLabel, (completed || active) && styles.stepLabelActive]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing[6],
    padding: spacing[5],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  pulse: {
    backgroundColor: colors.pine,
    borderColor: colors.pineSoft,
    borderRadius: radii.pill,
    borderWidth: 5,
    height: 20,
    marginTop: 2,
    width: 20,
  },
  headerText: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  steps: {
    gap: spacing[3],
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepIconActive: {
    backgroundColor: colors.blue,
  },
  stepIconComplete: {
    backgroundColor: colors.pine,
  },
  stepLabel: {
    color: colors.faint,
    fontSize: 14,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: colors.ink,
  },
});
