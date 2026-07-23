import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/tokens';

interface ScreenProps extends PropsWithChildren {
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  testID?: string;
}

export function Screen({ children, contentStyle, maxWidth = 840, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, spacing[6]) + spacing[6],
            paddingTop: Math.max(insets.top, spacing[4]) + spacing[2],
          },
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        <View style={[styles.content, { maxWidth }, contentStyle]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing[5],
  },
  content: {
    alignSelf: 'center',
    width: '100%',
  },
});
