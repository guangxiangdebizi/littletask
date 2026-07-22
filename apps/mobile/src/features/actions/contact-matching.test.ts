import { describe, expect, it } from 'vitest';

import { applyContactCandidate, normalizePhone, rankContactCandidates } from './contact-matching';

const candidates = [
  {
    id: 'contact-1',
    displayName: '张明',
    givenName: '明',
    familyName: '张',
    phones: ['+86 138-0013-8000'],
    emails: ['zhangming@example.com'],
    company: '示例科技',
    jobTitle: '产品经理',
    addresses: ['上海市静安区'],
    notes: null,
    simulated: false,
  },
  {
    id: 'contact-2',
    displayName: '张铭',
    givenName: '铭',
    familyName: '张',
    phones: ['13900139000'],
    emails: [],
    company: null,
    jobTitle: null,
    addresses: [],
    notes: null,
    simulated: false,
  },
];

describe('contact matching', () => {
  it('normalizes Chinese country prefixes and ranks exact phone matches first', () => {
    expect(normalizePhone('+86 (138) 0013-8000')).toBe('13800138000');
    const ranked = rankContactCandidates(
      {
        displayName: '张明',
        phones: ['13800138000'],
        emails: [],
        company: '示例科技',
      },
      candidates,
    );
    expect(ranked.map((candidate) => candidate.id)).toEqual(['contact-1']);
    expect(ranked[0]?.score).toBeGreaterThan(200);
  });

  it('hydrates the selected device contact and field-level previous values', () => {
    const selected = { ...candidates[0], score: 200 };
    const payload = applyContactCandidate(
      {
        target: { displayName: '张明', candidateCount: 0 },
        changes: [
          { field: 'phone', previousValue: null, nextValue: '13800138001' },
          { field: 'company', previousValue: null, nextValue: '新公司' },
        ],
      },
      selected,
      2,
    );
    expect(payload.target).toEqual({
      displayName: '张明',
      localContactId: 'contact-1',
      candidateCount: 2,
    });
    expect(payload.changes.map((change) => change.previousValue)).toEqual([
      '+86 138-0013-8000',
      '示例科技',
    ]);
  });
});
