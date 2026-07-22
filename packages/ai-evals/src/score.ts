import type { ActionCard, ActionType, Intake } from '@littletask/contracts';

import type { EvalExpectation } from './cases';

export function scoreIntake(intake: Intake, expected: EvalExpectation): string[] {
  if (intake.status !== 'ready') {
    return [`analysis_${intake.status}:${safeCode(intake.error?.code)}`];
  }

  const errors: string[] = [];
  const actionTypes = new Set(intake.actions.map((action) => action.type));
  for (const type of expected.requiredActionTypes ?? []) {
    if (!actionTypes.has(type)) errors.push(`missing_action:${type}`);
  }
  for (const type of expected.forbiddenActionTypes ?? []) {
    if (actionTypes.has(type)) errors.push(`forbidden_action:${type}`);
  }
  if (expected.maxActions !== undefined && intake.actions.length > expected.maxActions) {
    errors.push(`too_many_actions:${intake.actions.length}`);
  }
  if (
    expected.requiresUncertaintySignal &&
    intake.uncertainties.length === 0 &&
    intake.clarifyingQuestions.length === 0
  ) {
    errors.push('missing_uncertainty_signal');
  }
  if (expected.meeting) scoreMeeting(intake, expected.meeting, errors);
  if (expected.createContact) scoreCreatedContact(intake, expected.createContact, errors);
  if (expected.updateContact) scoreUpdatedContact(intake, expected.updateContact, errors);
  for (const action of intake.actions) {
    if (!['ready', 'needs_input'].includes(action.status)) {
      errors.push(`unsafe_initial_status:${action.status}`);
    }
    if (containsInventedLocalContactId(action)) {
      errors.push(`invented_local_contact_id:${action.type}`);
    }
  }
  return errors;
}

function scoreMeeting(
  intake: Intake,
  expected: NonNullable<EvalExpectation['meeting']>,
  errors: string[],
): void {
  const action = intake.actions.find((candidate) => candidate.type === 'create_event');
  if (!action || action.type !== 'create_event') return;
  if (Date.parse(action.payload.startAt) !== Date.parse(expected.startAt)) {
    errors.push('meeting_start_mismatch');
  }
  if (!normalize(action.payload.location ?? '').includes(normalize(expected.locationIncludes))) {
    errors.push('meeting_location_mismatch');
  }
}

function scoreCreatedContact(
  intake: Intake,
  expected: NonNullable<EvalExpectation['createContact']>,
  errors: string[],
): void {
  const action = intake.actions.find((candidate) => candidate.type === 'create_contact');
  if (!action || action.type !== 'create_contact') return;
  if (normalize(action.payload.displayName) !== normalize(expected.displayName)) {
    errors.push('contact_name_mismatch');
  }
  if (!action.payload.phones.some((phone) => digits(phone) === expected.phoneDigits)) {
    errors.push('contact_phone_mismatch');
  }
  if (
    !action.payload.emails.some((email) => email.toLowerCase() === expected.email.toLowerCase())
  ) {
    errors.push('contact_email_mismatch');
  }
}

function scoreUpdatedContact(
  intake: Intake,
  expected: NonNullable<EvalExpectation['updateContact']>,
  errors: string[],
): void {
  const action = intake.actions.find((candidate) => candidate.type === 'update_contact');
  if (!action || action.type !== 'update_contact') return;
  if (normalize(action.payload.target.displayName) !== normalize(expected.displayName)) {
    errors.push('update_target_mismatch');
  }
  if (expected.phoneDigits) {
    const phoneChanges = action.payload.changes.filter((change) => change.field === 'phone');
    if (!phoneChanges.some((change) => digits(change.nextValue) === expected.phoneDigits)) {
      errors.push('update_phone_mismatch');
    }
  }
  if (expected.email) {
    const emailChanges = action.payload.changes.filter((change) => change.field === 'email');
    if (
      !emailChanges.some(
        (change) => change.nextValue.toLowerCase() === expected.email?.toLowerCase(),
      )
    ) {
      errors.push('update_email_mismatch');
    }
  }
}

function containsInventedLocalContactId(action: ActionCard): boolean {
  if (action.type === 'create_event') {
    return action.payload.attendees.some((attendee) => attendee.localContactId !== undefined);
  }
  if (action.type === 'update_contact') {
    return action.payload.target.localContactId !== undefined;
  }
  return false;
}

function safeCode(value: string | undefined): string {
  return value && /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : 'UNKNOWN';
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function sortedActionTypes(intake: Intake): ActionType[] {
  return [...new Set(intake.actions.map((action) => action.type))].toSorted();
}
