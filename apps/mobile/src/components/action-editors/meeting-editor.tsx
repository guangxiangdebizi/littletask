import { meetingPayloadSchema } from '@littletask/contracts';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { isoToZonedFields, zonedFieldsToIso } from '../../features/actions/zoned-date-time';
import { PrimaryButton } from '../primary-button';
import { editorStyles as styles, validationMessage } from './editor-shared';
import type { TypedEditorProps } from './editor-types';
import { FormField, FormGroup } from './form-controls';

export function MeetingEditor({
  action,
  editable,
  saving,
  onSave,
}: TypedEditorProps<'create_event'>) {
  const payload = action.payload;
  const start = isoToZonedFields(payload.startAt, payload.timezone);
  const end = payload.endAt ? isoToZonedFields(payload.endAt, payload.timezone) : null;
  const [title, setTitle] = useState(payload.title);
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end?.date ?? '');
  const [endTime, setEndTime] = useState(end?.time ?? '');
  const [timezone, setTimezone] = useState(payload.timezone);
  const [location, setLocation] = useState(payload.location ?? '');
  const [attendees, setAttendees] = useState(
    payload.attendees.map((attendee) => attendee.displayName).join('、'),
  );
  const [notes, setNotes] = useState(payload.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      if (Boolean(endDate.trim()) !== Boolean(endTime.trim())) {
        throw new Error('结束日期和结束时间需要同时填写，或同时留空。');
      }
      const next = meetingPayloadSchema.parse({
        ...payload,
        title: title.trim(),
        startAt: zonedFieldsToIso(startDate, startTime, timezone.trim()),
        endAt:
          endDate.trim() && endTime.trim()
            ? zonedFieldsToIso(endDate, endTime, timezone.trim())
            : undefined,
        timezone: timezone.trim(),
        location: location.trim() || undefined,
        attendees: attendees
          .split(/[、,，]/)
          .map((displayName) => displayName.trim())
          .filter(Boolean)
          .map((displayName) => {
            const existing = payload.attendees.find(
              (attendee) => attendee.displayName === displayName,
            );
            return {
              displayName,
              ...(existing?.localContactId ? { localContactId: existing.localContactId } : {}),
            };
          }),
        notes: notes.trim() || undefined,
      });
      setError(null);
      onSave(next);
    } catch (caught) {
      setError(validationMessage(caught));
    }
  };

  return (
    <View style={styles.editor}>
      <FormGroup title="会议内容">
        <FormField
          editable={editable}
          label="标题"
          maxLength={160}
          onChangeText={setTitle}
          value={title}
        />
        <FormField
          editable={editable}
          label="地点"
          maxLength={240}
          onChangeText={setLocation}
          value={location}
        />
        <FormField
          editable={editable}
          hint="用顿号或逗号分隔"
          label="参与人"
          onChangeText={setAttendees}
          value={attendees}
        />
      </FormGroup>
      <FormGroup title="时间">
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <FormField
              editable={editable}
              label="开始日期"
              onChangeText={setStartDate}
              value={startDate}
            />
          </View>
          <View style={styles.shortColumn}>
            <FormField
              editable={editable}
              label="开始时间"
              onChangeText={setStartTime}
              value={startTime}
            />
          </View>
        </View>
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <FormField
              editable={editable}
              label="结束日期"
              onChangeText={setEndDate}
              value={endDate}
            />
          </View>
          <View style={styles.shortColumn}>
            <FormField
              editable={editable}
              label="结束时间"
              onChangeText={setEndTime}
              value={endTime}
            />
          </View>
        </View>
        <FormField editable={editable} label="时区" onChangeText={setTimezone} value={timezone} />
      </FormGroup>
      <FormField
        editable={editable}
        label="备注"
        maxLength={2000}
        multiline
        onChangeText={setNotes}
        value={notes}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editable ? (
        <PrimaryButton icon="save" label="保存此版本" loading={saving} onPress={save} />
      ) : null}
    </View>
  );
}
