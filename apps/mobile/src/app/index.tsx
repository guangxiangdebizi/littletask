import { Feather } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader } from '../components/app-header';
import { PrimaryButton } from '../components/primary-button';
import { PrivacyStrip } from '../components/privacy-strip';
import { Screen } from '../components/screen';
import { ApiRequestError, createIntake } from '../lib/api';
import { colors, radii, spacing } from '../theme/tokens';

export default function HomeScreen() {
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [note, setNote] = useState('');
  const [pickerError, setPickerError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: createIntake,
    onSuccess: ({ id }) => router.push(`/intake/${id}`),
  });

  const pickScreenshot = async () => {
    setPickerError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 0.88,
      exif: false,
    });
    if (!result.canceled) {
      const selected = result.assets[0];
      if (selected) setScreenshot(selected);
    }
  };

  const submit = () => {
    if (!screenshot) {
      setPickerError('请先选择一张聊天截图。');
      return;
    }
    createMutation.mutate({ screenshot, note });
  };

  const requestError = createMutation.error;
  const errorMessage =
    pickerError ||
    (requestError instanceof ApiRequestError
      ? requestError.message
      : requestError
        ? '无法连接分析服务，请检查本地 API 是否已启动。'
        : null);

  return (
    <Screen maxWidth={760}>
      <AppHeader />

      <View style={styles.hero}>
        <Text style={styles.title}>把聊天里的承诺，变成下一步。</Text>
        <Text style={styles.lead}>
          上传截图，LittleTask 会找出会议和联系人变更。每个动作都先给你核对。
        </Text>
      </View>

      <PrivacyStrip />

      <View style={styles.formSection}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>聊天截图</Text>
            <Text style={styles.sectionHint}>当前版本每次分析一张图片</Text>
          </View>
          {screenshot ? (
            <Pressable accessibilityRole="button" onPress={pickScreenshot}>
              <Text style={styles.replaceText}>更换</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityHint="打开系统相册选择聊天截图"
          accessibilityLabel={screenshot ? '已选择截图，点击更换' : '选择聊天截图'}
          accessibilityRole="button"
          onPress={pickScreenshot}
          style={({ pressed }) => [
            styles.picker,
            screenshot && styles.pickerSelected,
            pressed && styles.pickerPressed,
          ]}
        >
          {screenshot ? (
            <Image
              accessibilityLabel="已选择的聊天截图预览"
              contentFit="contain"
              source={{ uri: screenshot.uri }}
              style={styles.preview}
            />
          ) : (
            <View style={styles.emptyPicker}>
              <View style={styles.pickerIcon}>
                <Feather color={colors.pine} name="image" size={23} />
              </View>
              <Text style={styles.pickerTitle}>从相册选择截图</Text>
              <Text style={styles.pickerHint}>支持 PNG、JPEG、HEIC 和 WebP</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.noteBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>补充说明</Text>
            <Text style={styles.optional}>可选</Text>
          </View>
          <TextInput
            accessibilityLabel="补充说明"
            maxLength={4000}
            multiline
            onChangeText={setNote}
            placeholder="例如：这是张明发来的，他说的下周二按上海时间理解。"
            placeholderTextColor={colors.faint}
            style={styles.noteInput}
            textAlignVertical="top"
            value={note}
          />
        </View>

        {errorMessage ? (
          <View accessibilityLiveRegion="assertive" style={styles.errorBox}>
            <Feather color={colors.coral} name="alert-circle" size={17} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <PrimaryButton
          disabled={!screenshot}
          icon="arrow-right"
          label="识别可执行事项"
          loading={createMutation.isPending}
          onPress={submit}
        />
      </View>

      <View style={styles.flowSummary}>
        <Text style={styles.flowItem}>理解语境</Text>
        <Feather color={colors.lineStrong} name="chevron-right" size={15} />
        <Text style={styles.flowItem}>生成卡片</Text>
        <Feather color={colors.lineStrong} name="chevron-right" size={15} />
        <Text style={styles.flowItemStrong}>你确认后执行</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing[3],
    paddingBottom: spacing[6],
    paddingTop: spacing[8],
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 40,
    maxWidth: 620,
  },
  lead: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 620,
  },
  formSection: {
    gap: spacing[4],
    paddingTop: spacing[8],
  },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.faint,
    fontSize: 12,
    marginTop: spacing[1],
  },
  replaceText: {
    color: colors.pine,
    fontSize: 14,
    fontWeight: '700',
    padding: spacing[2],
  },
  picker: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    minHeight: 230,
    overflow: 'hidden',
  },
  pickerSelected: {
    borderStyle: 'solid',
  },
  pickerPressed: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.pine,
  },
  emptyPicker: {
    alignItems: 'center',
    flex: 1,
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 230,
    padding: spacing[6],
  },
  pickerIcon: {
    alignItems: 'center',
    backgroundColor: colors.pineSoft,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    marginBottom: spacing[1],
    width: 48,
  },
  pickerTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  pickerHint: {
    color: colors.faint,
    fontSize: 12,
  },
  preview: {
    backgroundColor: colors.ink,
    height: 340,
    width: '100%',
  },
  noteBlock: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  optional: {
    color: colors.faint,
    fontSize: 12,
  },
  noteInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 112,
    padding: spacing[4],
  },
  errorBox: {
    alignItems: 'flex-start',
    backgroundColor: colors.coralSoft,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
  errorText: {
    color: colors.coral,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  flowSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'center',
    paddingTop: spacing[8],
  },
  flowItem: {
    color: colors.faint,
    fontSize: 12,
  },
  flowItemStrong: {
    color: colors.pine,
    fontSize: 12,
    fontWeight: '700',
  },
});
