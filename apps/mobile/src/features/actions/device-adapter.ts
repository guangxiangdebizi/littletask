import type { ActionCard } from '@littletask/contracts';
import { Platform } from 'react-native';

import type {
  ActionPreparation,
  DeviceActionAdapter,
  DeviceContactCandidate,
} from './device-types';

function simulatedCandidate(action: Extract<ActionCard, { type: 'update_contact' }>) {
  const value = (field: string) =>
    action.payload.changes.find((change) => change.field === field)?.previousValue ?? null;
  return {
    id: action.payload.target.localContactId ?? `web-demo:${action.id}`,
    displayName: action.payload.target.displayName,
    givenName: value('givenName'),
    familyName: value('familyName'),
    phones: value('phone') ? [value('phone') as string] : ['138 0013 8000'],
    emails: value('email') ? [value('email') as string] : [],
    company: value('company'),
    jobTitle: value('jobTitle'),
    addresses: value('address') ? [value('address') as string] : [],
    notes: value('notes'),
    score: 100,
    simulated: true,
  } satisfies DeviceContactCandidate;
}

async function prepareNative(action: ActionCard): Promise<ActionPreparation> {
  if (action.type === 'create_event') {
    const { prepareNativeCalendarAction } = await import('./native-calendar');
    const result = await prepareNativeCalendarAction(action);
    return {
      mode: 'native',
      contacts: [],
      calendarConflicts: result.conflicts,
      calendarId: result.calendarId,
    };
  }
  const { prepareNativeContactAction } = await import('./native-contacts');
  return {
    mode: 'native',
    contacts: await prepareNativeContactAction(action),
    calendarConflicts: [],
    calendarId: null,
  };
}

export const deviceActionAdapter: DeviceActionAdapter = {
  async prepare(action) {
    if (Platform.OS !== 'web') return prepareNative(action);
    return {
      mode: 'simulated',
      contacts: action.type === 'update_contact' ? [simulatedCandidate(action)] : [],
      calendarConflicts: [],
      calendarId: null,
    };
  },

  async execute(action, preparation) {
    if (Platform.OS === 'web') {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return {
        mode: 'simulated',
        nativeRecordRef: `mock:web:${action.type}:${action.id}:r${action.revision}`,
      };
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
