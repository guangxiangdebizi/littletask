import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';

export function PrivacyStrip() {
  return (
    <View style={styles.container}>
      <Feather color={colors.pine} name="shield" size={16} />
      <Text style={styles.text}>原图默认不长期保留；联系人和日历只在你确认后由设备执行。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
  text: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
