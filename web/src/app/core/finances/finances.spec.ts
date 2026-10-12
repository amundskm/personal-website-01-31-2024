import {
  matchCategory,
  monthWindow,
  type SpendingPlan,
  type Statement,
  stageFor,
  suggestPattern,
  summarizeMonths,
  targetForMonth,
  UNCATEGORIZED,
  validateStatement,
} from './finances';

// Made-up plan and statements; never use real figures (the repository is public).
const plan: SpendingPlan = {
  categories: [
    { key: 'food', name: 'Food', monthlyBudget: 500, merchantPatterns: ['GROCERY MART', 'CAFE'] },
    { key: 'online', name: 'Online', monthlyBudget: 100, merchantPatterns: ['SHOPCO'] },
    { key: 'cloud', name: 'Cloud', monthlyBudget: 20, merchantPatterns: ['SHOPCO CLOUD'] },
  ],
  stages: [
    { label: 'Start', startDate: '2026-01-01', monthlyTarget: 900 },
    { label: 'Later', startDate: '2026-03-01', monthlyTarget: 700 },
  ],
};

const statement = (overrides: Partial<Statement>): Statement => ({
  id: '1234_2026-01-04',
  last4: '1234',
  openingDate: '2025-12-05',
  closingDate: '2026-01-04',
  purchasesTotalCents: 0,
  transactions: [],
  friendRepayment: { amountCents: 0, categoryKey: null },
  ...overrides,
});

describe('matchCategory', () => {
  it('matches case-insensitively, preferring the longest pattern', () => {
    expect(matchCategory('grocery mart 0042', plan.categories)).toBe('food');
    expect(matchCategory('SHOPCO MKTPL 123', plan.categories)).toBe('online');
    expect(matchCategory('SHOPCO CLOUD SERVICES', plan.categories)).toBe('cloud');
    expect(matchCategory('UNKNOWN STORE', plan.categories)).toBeNull();
  });
});

describe('suggestPattern', () => {
  it('keeps the leading words, stopping at numbers', () => {
    expect(suggestPattern('GROCERY MART 0042 ANYTOWN ST')).toBe('GROCERY MART');
    expect(suggestPattern('BIG BOX STORE OUTLET ANYTOWN')).toBe('BIG BOX STORE');
    expect(suggestPattern('7-STOP 123 ANYTOWN')).toBe('7-STOP');
  });
});

describe('stageFor', () => {
  it('picks the latest stage that has started', () => {
    expect(stageFor(plan.stages, '2025-12-31')).toBeNull();
    expect(stageFor(plan.stages, '2026-02-04')?.label).toBe('Start');
    expect(stageFor(plan.stages, '2026-03-04')?.label).toBe('Later');
  });
});

describe('summarizeMonths', () => {
  it('totals spending by closing month, excluding payments and netting refunds and repayments', () => {
    const months = summarizeMonths(
      [
        statement({
          transactions: [
            {
              date: '2025-12-06',
              description: 'A',
              amountCents: 30000,
              kind: 'purchase',
              categoryKey: 'food',
            },
            {
              date: '2025-12-07',
              description: 'B',
              amountCents: -5000,
              kind: 'credit',
              categoryKey: 'food',
            },
            {
              date: '2025-12-08',
              description: 'C',
              amountCents: -90000,
              kind: 'payment',
              categoryKey: null,
            },
            {
              date: '2025-12-09',
              description: 'D',
              amountCents: 2500,
              kind: 'purchase',
              categoryKey: 'gone',
            },
          ],
          friendRepayment: { amountCents: 4000, categoryKey: 'food' },
        }),
        statement({
          id: '9999_2026-01-20',
          last4: '9999',
          closingDate: '2026-01-20',
          transactions: [
            {
              date: '2026-01-10',
              description: 'E',
              amountCents: 1000,
              kind: 'purchase',
              categoryKey: 'online',
            },
          ],
        }),
        statement({
          id: '1234_2026-03-04',
          closingDate: '2026-03-04',
          transactions: [
            {
              date: '2026-02-10',
              description: 'F',
              amountCents: 700,
              kind: 'fee',
              categoryKey: 'online',
            },
          ],
        }),
      ],
      plan,
    );

    expect(months.map((m) => m.month)).toEqual(['2026-03', '2026-01']);
    expect(months[1]).toMatchObject({
      totalCents: 30000 - 5000 + 2500 - 4000 + 1000,
      byCategory: { food: 21000, [UNCATEGORIZED]: 2500, online: 1000 },
      friendRepaidCents: 4000,
      target: 900,
      stageLabel: 'Start',
    });
    expect(months[1].statements.map((s) => s.last4)).toEqual(['1234', '9999']);
    expect(months[0]).toMatchObject({ totalCents: 700, target: 700, stageLabel: 'Later' });
  });
});

describe('validateStatement', () => {
  const valid = statement({
    transactions: [
      {
        date: '2025-12-06',
        description: 'A',
        amountCents: 100,
        kind: 'purchase',
        categoryKey: 'food',
      },
    ],
  });

  it('accepts a well-formed statement', () => {
    expect(validateStatement(valid, '1234_2026-01-04')).toBeNull();
  });

  it('rejects mismatched ids and malformed data', () => {
    expect(validateStatement(valid, '1234_2026-02-04')).toMatch(/id/);
    expect(validateStatement({ ...valid, last4: 'abcd' }, valid.id)).toMatch(/card/);
    expect(
      validateStatement(
        { ...valid, transactions: [{ ...valid.transactions[0], amountCents: 1.5 }] },
        valid.id,
      ),
    ).toMatch(/transaction/);
    expect(
      validateStatement(
        { ...valid, friendRepayment: { amountCents: -1, categoryKey: null } },
        valid.id,
      ),
    ).toMatch(/repayment/);
  });
});

describe('monthWindow', () => {
  it('lists the months ending with the given one, across years', () => {
    expect(monthWindow('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthWindow('2026-12', 12)[0]).toBe('2026-01');
  });
});

describe('targetForMonth', () => {
  it('uses the stage in effect at the end of the month', () => {
    expect(targetForMonth(plan.stages, '2025-12')).toBeNull();
    expect(targetForMonth(plan.stages, '2026-02')).toBe(900);
    expect(targetForMonth(plan.stages, '2026-03')).toBe(700);
  });
});
