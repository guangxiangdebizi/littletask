import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/primary-button';
import { Screen } from '../components/screen';
import { colors, spacing } from '../theme/tokens';

export default function NotFoundScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>这个页面不存在</Text>
        <Text style={styles.body}>返回首页，重新开始一次截图分析。</Text>
        <PrimaryButton label="返回首页" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    gap: spacing[3],
    maxWidth: 420,
    paddingTop: spacing[10],
    width: '100%',
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing[3],
  },
});
