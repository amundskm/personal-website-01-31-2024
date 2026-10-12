import {
  lineRef,
  budgetForMonth,
  matchCategory,
  monthLineItems,
  monthWindow,
  type SpendingPlan,
  type Statement,
  stageFor,
  statementMonth,
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

describe('monthLineItems', () => {
  it("lists a month's countable lines, oldest first, adding up to the summary", () => {
    const statements = [
      statement({
        transactions: [
          {
            date: '2025-12-09',
            description: 'B',
            amountCents: 2500,
            kind: 'purchase',
            categoryKey: 'gone',
          },
          {
            date: '2025-12-06',
            description: 'A',
            amountCents: 30000,
            kind: 'purchase',
            categoryKey: 'food',
          },
          {
            date: '2025-12-08',
            description: 'PAY',
            amountCents: -90000,
            kind: 'payment',
            categoryKey: null,
          },
          {
            date: '2025-12-07',
            description: 'R',
            amountCents: -5000,
            kind: 'credit',
            categoryKey: 'food',
          },
        ],
        friendRepayment: { amountCents: 4000, categoryKey: 'food' },
      }),
      statement({
        id: '1234_2026-02-04',
        closingDate: '2026-02-04',
        transactions: [
          {
            date: '2026-01-10',
            description: 'OTHER MONTH',
            amountCents: 100,
            kind: 'purchase',
            categoryKey: 'food',
          },
        ],
      }),
    ];

    const items = monthLineItems(statements, plan, '2026-01');
    expect(items.map((i) => [i.date, i.description, i.amountCents, i.kind, i.categoryKey])).toEqual(
      [
        ['2025-12-06', 'A', 30000, 'purchase', 'food'],
        ['2025-12-07', 'R', -5000, 'credit', 'food'],
        ['2025-12-09', 'B', 2500, 'purchase', UNCATEGORIZED],
        ['2026-01-04', 'Repaid by friends', -4000, 'repayment', 'food'],
      ],
    );
    expect(items.every((i) => i.last4 === '1234' && i.statementId === '1234_2026-01-04')).toBe(
      true,
    );
    // Positions in the stored transactions (the payment at 2 is skipped); null = repayment
    expect(items.map((i) => i.index)).toEqual([1, 3, 0, null]);
    expect(items.map(lineRef)).toEqual(['1', '3', '0', 'repayment']);

    // Per category, the lines add up to the month summary
    const [summary] = summarizeMonths(statements.slice(0, 1), plan);
    for (const [key, cents] of Object.entries(summary.byCategory)) {
      const sum = items.filter((i) => i.categoryKey === key).reduce((t, i) => t + i.amountCents, 0);
      expect(sum).toBe(cents);
    }
  });
});

describe('statementMonth', () => {
  it('is the closing month, for the whole statement', () => {
    expect(statementMonth({ closingDate: '2026-10-04' })).toBe('2026-10');
    expect(statementMonth({ closingDate: '2026-01-04' })).toBe('2026-01');
  });
});

describe('budgetForMonth', () => {
  const golf = {
    key: 'golf',
    name: 'Golf',
    monthlyBudget: 100,
    activeMonths: [3, 4, 5, 6, 7, 8, 9, 10],
    plannedPurchases: [{ label: 'Season pass', month: 3, amount: 600 }],
  };

  it('applies the monthly budget only in active months, plus planned purchases', () => {
    expect(budgetForMonth(golf, '2027-03')).toEqual({
      totalCents: 70000,
      monthlyCents: 10000,
      planned: [{ label: 'Season pass', month: 3, amount: 600 }],
    });
    expect(budgetForMonth(golf, '2027-07').totalCents).toBe(10000);
    expect(budgetForMonth(golf, '2027-01').totalCents).toBe(0);
    expect(budgetForMonth(golf, '2027-11').totalCents).toBe(0);
  });

  it('treats no active months as every month', () => {
    const food = { key: 'food', name: 'Food', monthlyBudget: 500, activeMonths: [] };
    expect(budgetForMonth(food, '2027-01').totalCents).toBe(50000);
    expect(budgetForMonth({ ...food, activeMonths: null }, '2027-11').totalCents).toBe(50000);
  });
});
