import { Linking, Text, View } from 'react-native';

import { AppHeader } from '../components/app-header';
import { PrimaryButton } from '../components/primary-button';
import { privacyPolicyScreenStyles as styles } from '../components/privacy-policy-screen-styles';
import { Screen } from '../components/screen';

const chineseSections = [
  {
    title: '1. 我们处理的数据',
    paragraphs: [
      '当你主动选择聊天截图并提交时，LittleTask 会处理该图片、可选补充文字、语言、时区和提交时间。模型生成的摘要、证据、Action Cards、修改版本、确认、设备执行结果和洞察会形成你的应用内历史。',
      '首次使用会创建匿名设备会话。服务端只保存 bearer token 的 SHA-256 摘要，不接收 Apple ID、iCloud 密码或系统通讯录账号。',
    ],
  },
  {
    title: '2. 图片和 AI 处理',
    paragraphs: [
      '截图和补充文字会通过 LittleTask 服务端发送到 api.hostcentral.cc 的 GPT-5.6 Terra Responses API，用于多模态提取、独立复核和基于证据的建议。每次请求明确设置 store: false。',
      '原始截图只在待处理任务中临时存在，分析成功或达到永久失败状态后即清除；历史中只保留图片类型、字节数和 SHA-256 摘要。模型提示词和原始响应正文不写入模型运行审计表。',
    ],
  },
  {
    title: '3. 联系人和日历边界',
    paragraphs: [
      '联系人候选、电话号码、邮箱和日历冲突详情在设备本地读取和比对。应用仅在你查看并明确确认最终卡片后，才请求对应系统权限并执行写入。',
      '设备可以向服务端回报不超过 8 的潜在重复联系人数量和日历冲突数量，以及脱敏后的执行状态；不会上传候选联系人列表或日历事件正文。',
    ],
  },
  {
    title: '4. 用途、共享和跟踪',
    paragraphs: [
      '数据只用于提供截图理解、Action Card、确认后执行、历史、故障恢复和洞察功能。除完成上述 AI 处理和基础托管所必需的处理方外，我们不出售数据，不用于广告画像，也不进行跨应用跟踪。',
    ],
  },
  {
    title: '5. 保留和删除',
    paragraphs: [
      '结构化历史会保留到你删除单条记录、清空全部服务端数据或删除匿名账户。隐私与数据页面可以分别删除服务端记录和本机防重复执行账本。删除不会反向删除已经写入 iOS 的联系人或日历事件。',
    ],
  },
  {
    title: '6. 安全和控制',
    paragraphs: [
      '传输使用 HTTPS；服务端按匿名用户隔离数据，并应用上传校验、请求限流、日志脱敏和最小权限运行。任何联系人或日历变更都必须绑定你确认的具体卡片 revision，截图中的文字永远不被当作系统指令。',
    ],
  },
] as const;

const englishSections = [
  {
    title: 'Data we process',
    body: 'When you submit a selected chat screenshot, LittleTask processes that image, an optional note, locale, time zone, and submission time. Derived summaries, evidence, Action Cards, revisions, confirmations, device execution outcomes, and insights form your in-app history. The server stores only a hash of the anonymous device bearer token.',
  },
  {
    title: 'AI processing and retention',
    body: 'The screenshot and note are sent through the LittleTask server to the GPT-5.6 Terra Responses API at api.hostcentral.cc for extraction, review, and evidence-grounded suggestions. Requests set store: false. Original screenshot bytes are removed after successful or terminal analysis; retained history contains only image metadata and a SHA-256 digest.',
  },
  {
    title: 'Contacts, calendar, and confirmation',
    body: 'Contact candidates and calendar event details remain on the device. LittleTask requests the relevant iOS permission and performs a native mutation only after you review and explicitly confirm the exact Action Card revision. The device may report bounded duplicate/conflict counts and a redacted result, never the candidate list or event body.',
  },
  {
    title: 'Use, deletion, and tracking',
    body: 'Data is used only to provide the product, recovery, history, and grounded insights. We do not sell it, use it for advertising profiles, or track you across apps. You can delete one intake, all server history, the anonymous account, and the local execution ledger from Privacy & Data. Deletion does not remove contacts or events already written to iOS.',
  },
] as const;

export default function PrivacyPolicyScreen() {
  return (
    <Screen maxWidth={760}>
      <AppHeader back title="隐私政策" trailing="none" />
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          LittleTask 隐私政策
        </Text>
        <Text style={styles.updated}>生效与更新日期：2026 年 7 月 22 日</Text>
        <Text style={styles.lead}>
          本政策说明 LittleTask 在把聊天截图转换为可确认动作时如何处理、保留和删除数据。
        </Text>
      </View>

      {chineseSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <Text accessibilityRole="header" style={styles.englishHeading}>
        English summary
      </Text>
      {englishSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </Text>
          <Text style={styles.paragraph}>{section.body}</Text>
        </View>
      ))}

      <View style={styles.contactBlock}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          联系与政策变更 / Contact
        </Text>
        <Text style={styles.paragraph}>
          如对隐私、数据删除或本政策有疑问，请联系
          privacy@manbaout.com。重大变更会更新本页日期，并在适当情况下于应用内提示。
        </Text>
        <PrimaryButton
          icon="mail"
          label="联系隐私支持"
          onPress={() => void Linking.openURL('mailto:privacy@manbaout.com')}
          tone="quiet"
        />
      </View>
    </Screen>
  );
}
