import type { UpdateContactPayload } from '@littletask/contracts';

import type { DeviceContactCandidate } from './device-types';

type ContactChange = UpdateContactPayload['changes'][number];

export interface ContactMatchInput {
  displayName: string;
  phones: string[];
  emails: string[];
  company?: string;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase();
}

export function normalizePhone(value: string): string {
  const normalized = value.normalize('NFKC').replace(/[^\d+]/g, '');
  if (normalized.startsWith('+86')) return normalized.slice(3);
  if (normalized.startsWith('0086')) return normalized.slice(4);
  return normalized;
}

function normalizeEmail(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

export function rankContactCandidates(
  input: ContactMatchInput,
  candidates: Omit<DeviceContactCandidate, 'score'>[],
  limit = 8,
): DeviceContactCandidate[] {
  const expectedName = normalizeText(input.displayName);
  const expectedPhones = new Set(input.phones.map(normalizePhone).filter(Boolean));
  const expectedEmails = new Set(input.emails.map(normalizeEmail).filter(Boolean));
  const expectedCompany = normalizeText(input.company ?? '');

  return candidates
    .map((candidate) => {
      const name = normalizeText(candidate.displayName);
      const phoneMatch = candidate.phones.some((phone) =>
        expectedPhones.has(normalizePhone(phone)),
      );
      const emailMatch = candidate.emails.some((email) =>
        expectedEmails.has(normalizeEmail(email)),
      );
      let score = 0;
      if (expectedName && name === expectedName) score += 80;
      else if (expectedName && (name.includes(expectedName) || expectedName.includes(name)))
        score += 35;
      if (phoneMatch) score += 120;
      if (emailMatch) score += 120;
      if (expectedCompany && normalizeText(candidate.company ?? '') === expectedCompany)
        score += 20;
      return { ...candidate, score };
    })
    .filter((candidate) => candidate.score > 0)
    .toSorted(
      (left, right) =>
        right.score - left.score || left.displayName.localeCompare(right.displayName, 'zh-CN'),
    )
    .slice(0, limit);
}

function previousValueForChange(
  change: ContactChange,
  candidate: DeviceContactCandidate,
): string | null {
  switch (change.field) {
    case 'givenName':
      return candidate.givenName;
    case 'familyName':
      return candidate.familyName;
    case 'displayName':
      return candidate.displayName;
    case 'phone':
      return candidate.phones[0] ?? null;
    case 'email':
      return candidate.emails[0] ?? null;
    case 'company':
      return candidate.company;
    case 'jobTitle':
      return candidate.jobTitle;
    case 'address':
      return candidate.addresses[0] ?? null;
    case 'notes':
      return candidate.notes;
  }
}

export function applyContactCandidate(
  payload: UpdateContactPayload,
  candidate: DeviceContactCandidate,
  candidateCount: number,
): UpdateContactPayload {
  return {
    ...payload,
    target: {
      displayName: candidate.displayName,
      localContactId: candidate.id,
      candidateCount,
    },
    changes: payload.changes.map((change) => ({
      ...change,
      previousValue: previousValueForChange(change, candidate),
    })),
  };
}
