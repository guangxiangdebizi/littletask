import type { ActionCard, AuthorizedContactContext } from '@littletask/contracts';

export interface DeviceContactCandidate {
  id: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  phones: string[];
  emails: string[];
  company: string | null;
  jobTitle: string | null;
  addresses: string[];
  notes: string | null;
  score: number;
}

export interface DeviceCalendarConflict {
  id: string;
  calendarTitle: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface ActionPreparation {
  mode: 'native';
  contacts: DeviceContactCandidate[];
  relatedContacts: AuthorizedContactContext[];
  calendarConflicts: DeviceCalendarConflict[];
  calendarId: string | null;
}

export interface DeviceMutationResult {
  nativeRecordRef: string;
  mode: 'native';
}

export class DeviceActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly mutationMayHaveOccurred = false,
    readonly canOpenSettings = false,
  ) {
    super(message);
  }
}

export interface DeviceActionAdapter {
  prepare(action: ActionCard): Promise<ActionPreparation>;
  execute(action: ActionCard, preparation: ActionPreparation): Promise<DeviceMutationResult>;
}
