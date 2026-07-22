import { contactPayloadSchema } from '@littletask/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../primary-button';
import { editorStyles as styles, validationMessage } from './editor-shared';
import type { TypedEditorProps } from './editor-types';
import { FormField, FormGroup } from './form-controls';

export function ContactEditor({
  action,
  editable,
  saving,
  onSave,
}: TypedEditorProps<'create_contact'>) {
  const payload = action.payload;
  const [displayName, setDisplayName] = useState(payload.displayName);
  const [givenName, setGivenName] = useState(payload.givenName);
  const [familyName, setFamilyName] = useState(payload.familyName);
  const [phones, setPhones] = useState(payload.phones.join('、'));
  const [emails, setEmails] = useState(payload.emails.join('、'));
  const [company, setCompany] = useState(payload.company ?? '');
  const [jobTitle, setJobTitle] = useState(payload.jobTitle ?? '');
  const [address, setAddress] = useState(payload.address ?? '');
  const [notes, setNotes] = useState(payload.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const split = (value: string) =>
    value
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const save = () => {
    const result = contactPayloadSchema.safeParse({
      displayName: displayName.trim(),
      givenName: givenName.trim(),
      familyName: familyName.trim(),
      phones: split(phones),
      emails: split(emails),
      company: company.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
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
      <FormGroup title="姓名">
        <FormField
          editable={editable}
          label="显示名称"
          onChangeText={setDisplayName}
          value={displayName}
        />
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <FormField
              editable={editable}
              label="姓"
              onChangeText={setFamilyName}
              value={familyName}
            />
          </View>
          <View style={styles.column}>
            <FormField
              editable={editable}
              label="名"
              onChangeText={setGivenName}
              value={givenName}
            />
          </View>
        </View>
      </FormGroup>
      <FormGroup title="联系方式">
        <FormField editable={editable} label="电话" onChangeText={setPhones} value={phones} />
        <FormField editable={editable} label="邮箱" onChangeText={setEmails} value={emails} />
      </FormGroup>
      <FormGroup title="其他资料">
        <FormField editable={editable} label="公司" onChangeText={setCompany} value={company} />
        <FormField editable={editable} label="职位" onChangeText={setJobTitle} value={jobTitle} />
        <FormField editable={editable} label="地址" onChangeText={setAddress} value={address} />
        <FormField
          editable={editable}
          label="备注"
          multiline
          onChangeText={setNotes}
          value={notes}
        />
      </FormGroup>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editable ? (
        <PrimaryButton icon="save" label="保存此版本" loading={saving} onPress={save} />
      ) : null}
    </View>
  );
}
