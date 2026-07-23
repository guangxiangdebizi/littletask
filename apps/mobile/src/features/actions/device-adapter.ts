import type { ActionCard } from '@littletask/contracts';
import { Platform } from 'react-native';

import type {
  ActionPreparation,
  DeviceActionAdapter,
  DeviceContactCandidate,
} from './device-types';
import { DeviceActionError } from './device-types';

async function prepareNative(action: ActionCard): Promise<ActionPreparation> {
  if (action.type === 'create_event') {
    const { prepareNativeCalendarAction } = await import('./native-calendar');
    const { readNativeRelatedContacts } = await import('./native-contacts');
    const [result, relatedContacts] = await Promise.all([
      prepareNativeCalendarAction(action),
      readNativeRelatedContacts(action),
    ]);
    return {
      mode: 'native',
      contacts: [],
      relatedContacts,
      calendarConflicts: result.conflicts,
      calendarId: result.calendarId,
    };
  }
  const { contactContextFromCandidates, prepareNativeContactAction } =
    await import('./native-contacts');
  const contacts = await prepareNativeContactAction(action);
  return {
    mode: 'native',
    contacts,
    relatedContacts: contactContextFromCandidates(contacts),
    calendarConflicts: [],
    calendarId: null,
  };
}

export const deviceActionAdapter: DeviceActionAdapter = {
  async prepare(action) {
    if (Platform.OS !== 'web') return prepareNative(action);
    throw new DeviceActionError(
      'NATIVE_ACTION_UNAVAILABLE',
      '联系人和日历操作只能在 iOS App 中核对并执行。',
    );
  },

  async execute(action, preparation) {
    if (Platform.OS === 'web') {
      throw new DeviceActionError(
        'NATIVE_ACTION_UNAVAILABLE',
        '联系人和日历操作只能在 iOS App 中执行。',
      );
    }

    if (action.type === 'create_event') {
      const { executeNativeCalendarAction } = await import('./native-calendar');
      return {
        mode: 'native',
        nativeRecordRef: await executeNativeCalendarAction(action, preparation.calendarId),
      };
    }
    const { executeNativeContactAction } = await import('./native-contacts');
    return {
      mode: 'native',
      nativeRecordRef: await executeNativeContactAction(action),
    };
  },
};

export async function pickDeviceContactCandidate(): Promise<DeviceContactCandidate | null> {
  if (Platform.OS === 'web') return null;
  const { pickNativeContactCandidate } = await import('./native-contacts');
  return pickNativeContactCandidate();
}
