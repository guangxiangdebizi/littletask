import type { ActionCard } from '@littletask/contracts';

import { DeviceActionError, type DeviceCalendarConflict } from './device-types';

type EventAction = Extract<ActionCard, { type: 'create_event' }>;

async function requireCalendarPermission() {
  const Calendar = await import('expo-calendar');
  const current = await Calendar.getCalendarPermissions(false);
  const permission =
    current.status === 'granted' ? current : await Calendar.requestCalendarPermissions(false);
  if (permission.status !== 'granted') {
    throw new DeviceActionError(
      'CALENDAR_PERMISSION_DENIED',
      '没有日历权限。你可以前往系统设置授权后再试。',
      false,
      !permission.canAskAgain,
    );
  }
  return Calendar;
}

function eventEnd(action: EventAction): Date {
  if (action.payload.endAt) return new Date(action.payload.endAt);
  const duration = action.payload.suggestedDurationMinutes ?? 60;
  return new Date(Date.parse(action.payload.startAt) + duration * 60_000);
}

export async function prepareNativeCalendarAction(action: EventAction): Promise<{
  calendarId: string;
  conflicts: DeviceCalendarConflict[];
}> {
  const Calendar = await requireCalendarPermission();
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((calendar) => calendar.allowsModifications);
  if (writable.length === 0) {
    throw new DeviceActionError('NO_WRITABLE_CALENDAR', '设备上没有可写入的日历。');
  }

  let selected = writable[0];
  try {
    const defaultCalendar = Calendar.getDefaultCalendarSync();
    if (defaultCalendar.allowsModifications) selected = defaultCalendar;
  } catch {
    selected = writable.find((calendar) => calendar.isPrimary) ?? selected;
  }
  if (!selected) throw new DeviceActionError('NO_WRITABLE_CALENDAR', '设备上没有可写入的日历。');

  const startAt = new Date(action.payload.startAt);
  const endAt = eventEnd(action);
  const events = await Calendar.listEvents(calendars, startAt, endAt);
  const calendarNames = new Map(calendars.map((calendar) => [calendar.id, calendar.title]));
  const conflicts = events
    .filter((event) => new Date(event.startDate) < endAt && new Date(event.endDate) > startAt)
    .map((event) => ({
      id: event.id,
      calendarTitle: calendarNames.get(event.calendarId) ?? '日历',
      title: event.title || '未命名日程',
      startAt: new Date(event.startDate).toISOString(),
      endAt: new Date(event.endDate).toISOString(),
    }))
    .slice(0, 8);
  return { calendarId: selected.id, conflicts };
}

export async function executeNativeCalendarAction(
  action: EventAction,
  calendarId: string | null,
): Promise<string> {
  try {
    const Calendar = await requireCalendarPermission();
    if (!calendarId) {
      throw new DeviceActionError('NO_WRITABLE_CALENDAR', '没有选定可写入的日历。');
    }
    const calendar = await Calendar.ExpoCalendar.get(calendarId);
    if (!calendar.allowsModifications) {
      throw new DeviceActionError('CALENDAR_NOT_WRITABLE', '选定的日历当前不可写入。');
    }
    const attendeeNames = action.payload.attendees.map((attendee) => attendee.displayName);
    const attendeeNote =
      attendeeNames.length > 0 ? `参与人：${attendeeNames.join('、')}（未自动发送邀请）` : '';
    const notes = [action.payload.notes, attendeeNote].filter(Boolean).join('\n\n');
    const event = await calendar.createEvent({
      title: action.payload.title,
      startDate: new Date(action.payload.startAt),
      endDate: eventEnd(action),
      timeZone: action.payload.timezone,
      location: action.payload.location ?? null,
      notes,
    });
    return event.id;
  } catch (error) {
    if (error instanceof DeviceActionError) throw error;
    throw new DeviceActionError(
      'CALENDAR_WRITE_FAILED',
      '系统日历没有明确返回写入结果。为避免重复日程，请先检查日历再决定是否重试。',
      true,
    );
  }
}
