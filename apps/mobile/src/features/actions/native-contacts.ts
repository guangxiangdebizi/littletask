import type {
  ActionCard,
  AuthorizedContactContext,
  ContactPayload,
  UpdateContactPayload,
} from '@littletask/contracts';
import type {
  ContactPatch,
  ExistingAddress,
  ExistingEmail,
  ExistingPhone,
  NewAddress,
} from 'expo-contacts';
import { Platform } from 'react-native';

import { rankContactCandidates, normalizePhone } from './contact-matching';
import { DeviceActionError, type DeviceContactCandidate } from './device-types';

type ContactAction = Extract<ActionCard, { type: 'create_contact' | 'update_contact' }>;

export function contactContextFromCandidates(
  candidates: DeviceContactCandidate[],
): AuthorizedContactContext[] {
  return candidates.slice(0, 8).map((candidate) => ({
    displayName: candidate.displayName,
    company: candidate.company,
    jobTitle: candidate.jobTitle,
    hasPhone: candidate.phones.length > 0,
    hasEmail: candidate.emails.length > 0,
  }));
}

export async function readNativeRelatedContacts(
  action: Extract<ActionCard, { type: 'create_event' }>,
): Promise<AuthorizedContactContext[]> {
  const Contacts = await import('expo-contacts');
  const permission = await Contacts.getPermissionsAsync();
  if (permission.status !== 'granted') return [];

  const names = [
    ...new Set(action.payload.attendees.map((attendee) => attendee.displayName.trim())),
  ].filter(Boolean);
  if (names.length === 0) return [];
  const fields = [
    Contacts.ContactField.FULL_NAME,
    Contacts.ContactField.GIVEN_NAME,
    Contacts.ContactField.FAMILY_NAME,
    Contacts.ContactField.PHONES,
    Contacts.ContactField.EMAILS,
    Contacts.ContactField.COMPANY,
    Contacts.ContactField.JOB_TITLE,
  ] as const;
  const rows = (
    await Promise.all(
      names.slice(0, 8).map((name) => Contacts.Contact.getAllDetails(fields, { name, limit: 3 })),
    )
  ).flat();
  const seen = new Set<string>();
  const result: AuthorizedContactContext[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push({
      displayName:
        row.fullName || [row.familyName, row.givenName].filter(Boolean).join('') || '未命名联系人',
      company: row.company,
      jobTitle: row.jobTitle ?? null,
      hasPhone: row.phones.some((phone) => Boolean(phone.number)),
      hasEmail: row.emails.some((email) => Boolean(email.address)),
    });
    if (result.length === 8) break;
  }
  return result;
}

function formatAddress(address: ExistingAddress | NewAddress): string {
  return [address.street, address.city, address.state, address.postcode, address.country]
    .filter(Boolean)
    .join(' ');
}

async function requireContactsPermission() {
  const Contacts = await import('expo-contacts');
  const current = await Contacts.getPermissionsAsync();
  const permission =
    current.status === 'granted' ? current : await Contacts.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new DeviceActionError(
      'CONTACTS_PERMISSION_DENIED',
      '没有通讯录权限。你可以前往系统设置授权后再试。',
      false,
      !permission.canAskAgain,
    );
  }
  return Contacts;
}

function matchInput(action: ContactAction) {
  if (action.type === 'create_contact') {
    return {
      displayName: action.payload.displayName,
      phones: action.payload.phones,
      emails: action.payload.emails,
      company: action.payload.company,
    };
  }
  return {
    displayName: action.payload.target.displayName,
    phones: action.payload.changes
      .filter((change) => change.field === 'phone')
      .map((change) => change.nextValue),
    emails: action.payload.changes
      .filter((change) => change.field === 'email')
      .map((change) => change.nextValue),
  };
}

export async function prepareNativeContactAction(
  action: ContactAction,
): Promise<DeviceContactCandidate[]> {
  if (
    Platform.OS === 'ios' &&
    ((action.type === 'create_contact' && action.payload.notes) ||
      (action.type === 'update_contact' &&
        action.payload.changes.some((change) => change.field === 'notes')))
  ) {
    throw new DeviceActionError(
      'CONTACT_NOTES_UNAVAILABLE',
      '当前 iOS 构建未申请通讯录备注字段权限。请先移除备注字段再确认。',
    );
  }

  const Contacts = await requireContactsPermission();
  const fields = [
    Contacts.ContactField.FULL_NAME,
    Contacts.ContactField.GIVEN_NAME,
    Contacts.ContactField.FAMILY_NAME,
    Contacts.ContactField.PHONES,
    Contacts.ContactField.EMAILS,
    Contacts.ContactField.COMPANY,
    Contacts.ContactField.JOB_TITLE,
    Contacts.ContactField.ADDRESSES,
  ] as const;
  const name =
    action.type === 'create_contact'
      ? action.payload.displayName
      : action.payload.target.displayName;
  const rows = await Contacts.Contact.getAllDetails(fields, { name, limit: 20 });
  const candidates = rows.map((row) => ({
    id: row.id,
    displayName:
      row.fullName || [row.familyName, row.givenName].filter(Boolean).join('') || '未命名联系人',
    givenName: row.givenName,
    familyName: row.familyName,
    phones: row.phones
      .map((phone) => phone.number)
      .filter((value): value is string => Boolean(value)),
    emails: row.emails
      .map((email) => email.address)
      .filter((value): value is string => Boolean(value)),
    company: row.company,
    jobTitle: row.jobTitle ?? null,
    addresses: row.addresses.map(formatAddress).filter(Boolean),
    notes: null,
  }));
  return rankContactCandidates(matchInput(action), candidates);
}

export async function pickNativeContactCandidate(): Promise<DeviceContactCandidate | null> {
  const Contacts = await requireContactsPermission();
  const contact = await Contacts.Contact.presentPicker();
  if (!contact) return null;
  const [displayName, givenName, familyName, phones, emails, company, jobTitle, addresses] =
    await Promise.all([
      contact.getFullName(),
      contact.getGivenName(),
      contact.getFamilyName(),
      contact.getPhones(),
      contact.getEmails(),
      contact.getCompany(),
      contact.getJobTitle(),
      contact.getAddresses(),
    ]);
  return {
    id: contact.id,
    displayName: displayName || [familyName, givenName].filter(Boolean).join('') || '未命名联系人',
    givenName,
    familyName,
    phones: phones.map((phone) => phone.number).filter((value): value is string => Boolean(value)),
    emails: emails.map((email) => email.address).filter((value): value is string => Boolean(value)),
    company,
    jobTitle,
    addresses: addresses.map(formatAddress).filter(Boolean),
    notes: null,
    score: 1_000,
  };
}

function contactRecord(payload: ContactPayload) {
  return {
    givenName: payload.givenName || (payload.familyName ? undefined : payload.displayName),
    familyName: payload.familyName || undefined,
    phones: payload.phones.map((number) => ({ label: 'mobile', number })),
    emails: payload.emails.map((address) => ({ label: 'other', address })),
    company: payload.company,
    jobTitle: payload.jobTitle,
    addresses: payload.address ? [{ label: 'other', street: payload.address }] : undefined,
    note: Platform.OS === 'android' ? payload.notes : undefined,
  };
}

function updatePhones(
  existing: ExistingPhone[],
  changes: UpdateContactPayload['changes'],
): ContactPatch['phones'] {
  let phones: ContactPatch['phones'] = [...existing];
  for (const change of changes.filter((item) => item.field === 'phone')) {
    const previous = normalizePhone(change.previousValue ?? '');
    const index = previous
      ? phones.findIndex((phone) => normalizePhone(phone.number ?? '') === previous)
      : -1;
    if (index >= 0) {
      phones[index] = { ...phones[index], number: change.nextValue };
    } else {
      phones.push({ label: 'mobile', number: change.nextValue });
    }
  }
  return phones;
}

function updateEmails(
  existing: ExistingEmail[],
  changes: UpdateContactPayload['changes'],
): ContactPatch['emails'] {
  let emails: ContactPatch['emails'] = [...existing];
  for (const change of changes.filter((item) => item.field === 'email')) {
    const previous = change.previousValue?.trim().toLocaleLowerCase() ?? '';
    const index = previous
      ? emails.findIndex((email) => email.address?.trim().toLocaleLowerCase() === previous)
      : -1;
    if (index >= 0) {
      emails[index] = { ...emails[index], address: change.nextValue };
    } else {
      emails.push({ label: 'other', address: change.nextValue });
    }
  }
  return emails;
}

function updateAddresses(
  existing: ExistingAddress[],
  changes: UpdateContactPayload['changes'],
): ContactPatch['addresses'] {
  let addresses: ContactPatch['addresses'] = [...existing];
  for (const change of changes.filter((item) => item.field === 'address')) {
    const previous = change.previousValue?.trim() ?? '';
    const index = previous
      ? addresses.findIndex((address) => formatAddress(address) === previous)
      : -1;
    if (index >= 0) {
      addresses[index] = { ...addresses[index], street: change.nextValue };
    } else {
      addresses.push({ label: 'other', street: change.nextValue });
    }
  }
  return addresses;
}

async function updateContact(payload: UpdateContactPayload): Promise<string> {
  if (!payload.target.localContactId) {
    throw new DeviceActionError(
      'CONTACT_CANDIDATE_REQUIRED',
      '请先从设备通讯录中选择要更新的联系人。',
    );
  }
  const Contacts = await requireContactsPermission();
  const contact = new Contacts.Contact(payload.target.localContactId);
  const hasPhones = payload.changes.some((change) => change.field === 'phone');
  const hasEmails = payload.changes.some((change) => change.field === 'email');
  const hasAddresses = payload.changes.some((change) => change.field === 'address');
  const [phones, emails, addresses] = await Promise.all([
    hasPhones ? contact.getPhones() : Promise.resolve([]),
    hasEmails ? contact.getEmails() : Promise.resolve([]),
    hasAddresses ? contact.getAddresses() : Promise.resolve([]),
  ]);
  const patch: ContactPatch = {};
  for (const change of payload.changes) {
    switch (change.field) {
      case 'givenName':
        patch.givenName = change.nextValue;
        break;
      case 'familyName':
        patch.familyName = change.nextValue;
        break;
      case 'displayName':
        patch.givenName = change.nextValue;
        patch.familyName = null;
        break;
      case 'company':
        patch.company = change.nextValue;
        break;
      case 'jobTitle':
        patch.jobTitle = change.nextValue;
        break;
      case 'notes':
        patch.note = change.nextValue;
        break;
      case 'phone':
      case 'email':
      case 'address':
        break;
    }
  }
  if (hasPhones) patch.phones = updatePhones(phones, payload.changes);
  if (hasEmails) patch.emails = updateEmails(emails, payload.changes);
  if (hasAddresses) patch.addresses = updateAddresses(addresses, payload.changes);
  await contact.patch(patch);
  return contact.id;
}

export async function executeNativeContactAction(action: ContactAction): Promise<string> {
  try {
    if (action.type === 'create_contact') {
      const Contacts = await requireContactsPermission();
      const created = await Contacts.Contact.create(contactRecord(action.payload));
      return created.id;
    }
    return await updateContact(action.payload);
  } catch (error) {
    if (error instanceof DeviceActionError) throw error;
    throw new DeviceActionError(
      'CONTACT_WRITE_FAILED',
      '系统通讯录没有完成这次写入。为避免重复记录，请先检查通讯录再决定是否重试。',
      true,
    );
  }
}
