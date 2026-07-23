import { describe, expect, it } from 'vitest';

import { isoToZonedFields, zonedFieldsToIso } from './zoned-date-time';

describe('zoned date-time conversion', () => {
  it('round-trips an instant through the selected timezone', () => {
    const fields = isoToZonedFields('2026-07-22T06:30:00.000Z', 'Asia/Shanghai');

    expect(fields).toEqual({ date: '2026-07-22', time: '14:30' });
    expect(zonedFieldsToIso(fields.date, fields.time, 'Asia/Shanghai')).toBe(
      '2026-07-22T06:30:00.000Z',
    );
  });

  it('rejects a local time skipped by daylight saving time', () => {
    expect(() => zonedFieldsToIso('2026-03-08', '02:30', 'America/New_York')).toThrow(
      '该时区在这个时间点不存在',
    );
  });

  it('rejects an impossible calendar date', () => {
    expect(() => zonedFieldsToIso('2026-02-31', '10:00', 'Asia/Shanghai')).toThrow(
      '该时区在这个时间点不存在',
    );
  });
});
