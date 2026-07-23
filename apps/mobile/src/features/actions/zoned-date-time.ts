export interface ZonedDateTimeFields {
  date: string;
  time: string;
}

function partsForInstant(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

export function isoToZonedFields(value: string, timezone: string): ZonedDateTimeFields {
  const parts = partsForInstant(new Date(value), timezone);
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

export function zonedFieldsToIso(date: string, time: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match || !timeMatch) throw new Error('日期或时间格式不正确');
  const [, yearText, monthText, dayText] = match;
  const [, hourText, minuteText] = timeMatch;
  const values = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };
  if (
    values.month < 1 ||
    values.month > 12 ||
    values.day < 1 ||
    values.day > 31 ||
    values.hour > 23 ||
    values.minute > 59
  ) {
    throw new Error('日期或时间超出有效范围');
  }

  const target = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const represented = partsForInstant(new Date(instant), timezone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    instant += target - representedUtc;
  }

  const resolved = partsForInstant(new Date(instant), timezone);
  if (
    resolved.year !== values.year ||
    resolved.month !== values.month ||
    resolved.day !== values.day ||
    resolved.hour !== values.hour ||
    resolved.minute !== values.minute
  ) {
    throw new Error('该时区在这个时间点不存在，请选择其他时间');
  }
  return new Date(instant).toISOString();
}
