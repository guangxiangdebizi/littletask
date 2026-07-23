import { updateContactPayloadSchema } from '@littletask/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../primary-button';
import { editorStyles as styles, validationMessage } from './editor-shared';
import type { TypedEditorProps } from './editor-types';
import { FormField, FormGroup, ReadonlyValue } from './form-controls';

const fieldLabels: Record<string, string> = {
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

export function UpdateContactEditor({
  action,
  editable,
  saving,
  onSave,
}: TypedEditorProps<'update_contact'>) {
  const payload = action.payload;
  const [displayName, setDisplayName] = useState(payload.target.displayName);
  const [changes, setChanges] = useState(payload.changes);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const result = updateContactPayloadSchema.safeParse({
      ...payload,
      target: { ...payload.target, displayName: displayName.trim() },
      changes,
    });
    if (!result.success) {
      setError(validationMessage(result.error));
      return;
    }
    setError(null);
    onSave(result.data);
  };

  return (
    <View style={styles.editor}>
      <FormField
        editable={editable && !payload.target.localContactId}
        hint={payload.target.localContactId ? '已关联设备联系人' : '用于本地查找候选'}
        label="目标联系人"
        onChangeText={setDisplayName}
        value={displayName}
      />
      <FormGroup title="逐字段变更">
        {changes.map((change, index) => (
          <View key={`${change.field}-${index}`} style={styles.changeBlock}>
            <ReadonlyValue
              label={`${fieldLabels[change.field] ?? change.field} · 当前值`}
              value={change.previousValue ?? '未记录'}
            />
            <FormField
              editable={editable}
              label="更新为"
              onChangeText={(nextValue) =>
                setChanges((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, nextValue } : item,
                  ),
                )
              }
              value={change.nextValue}
            />
          </View>
        ))}
      </FormGroup>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editable ? (
        <PrimaryButton icon="save" label="保存此版本" loading={saving} onPress={save} />
      ) : null}
    </View>
  );
}
