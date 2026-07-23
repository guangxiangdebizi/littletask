import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export function BrandMark() {
  return (
    <View style={styles.container} accessibilityLabel="LittleTask">
      <View style={styles.mark} importantForAccessibility="no-hide-descendants">
        <View style={styles.pending} />
        <View style={styles.confirmed} />
      </View>
      <Text style={styles.wordmark}>LittleTask</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  mark: {
    height: 26,
    width: 30,
  },
  pending: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    height: 18,
    left: 0,
    position: 'absolute',
    top: 1,
    width: 18,
  },
  confirmed: {
    backgroundColor: colors.pine,
    borderRadius: radii.sm,
    bottom: 0,
    height: 18,
    position: 'absolute',
    right: 0,
    width: 18,
  },
  wordmark: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
