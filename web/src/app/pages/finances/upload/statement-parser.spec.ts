import { groupIntoLines } from './pdf-lines';
import { checkTotals, parseChaseStatement, StatementParseError } from './statement-parser';

// A made-up statement in the shape pdf.js produces for Chase PDFs. Never put
// real statement data in tests: the repository is public.
const statement = (overrides: { purchases?: string; extraRows?: string[][] } = {}): string[][] => [
  ['ACCOUNT', 'ACCOUNT', 'SUMMARY', 'SUMMARY'],
  ['Account Number: XXXX XXXX XXXX 1234'],
  ['Previous Balance', '$500.00'],
  ['Payment, Credits', '-$520.00'],
  ['Purchases', overrides.purchases ?? '+$1,061.25'],
  ['Opening/Closing Date', '12/05/25 - 01/04/26'],
  ['ACCOUNT', 'ACCOUNT', 'ACTIVITY', 'ACTIVITY'],
  ['Date of'],
  ['Merchant Name or Transaction Description', '$ Amount'],
  ['PAYMENTS', 'AND', 'OTHER', 'CREDITS'],
  ['12/28', 'AUTOMATIC PAYMENT - THANK YOU', '-500.00'],
  ['12/20', 'EXAMPLE OUTFITTERS RETURN', '-20.00'],
  ['PURCHASE'],
  ['12/06', 'GROCERY MART 0042 ANYTOWN ST', '1,000.75'],
  ['Order Number', '123-4567890'],
  ['01/02', 'COFFEE CORNER', 'ANYTOWN ST', '.50'],
  ['MEMBER NAME', 'Page 2 of 3', 'Statement Date:', '01/04/26'],
  ['ACCOUNT', 'ACTIVITY', '(CONTINUED)'],
  ['01/03', 'STREAMING CO 800-555-0100 CA', '60.00'],
  ...(overrides.extraRows ?? []),
  ['2026 Totals Year-to-Date'],
  ['PURCHASES'],
  ['Purchases', '- 0 -', '- 0 -'],
];

describe('parseChaseStatement', () => {
  it('reads the account summary', () => {
    const parsed = parseChaseStatement(statement());
    expect(parsed).toMatchObject({
      last4: '1234',
      openingDate: '2025-12-05',
      closingDate: '2026-01-04',
      purchasesTotalCents: 106125,
      paymentsAndCreditsCents: -52000,
    });
  });

  it('reads every activity row, with the right year and kind', () => {
    const { transactions } = parseChaseStatement(statement());
    expect(transactions).toEqual([
      {
        date: '2025-12-28',
        description: 'AUTOMATIC PAYMENT - THANK YOU',
        amountCents: -50000,
        kind: 'payment',
      },
      {
        date: '2025-12-20',
        description: 'EXAMPLE OUTFITTERS RETURN',
        amountCents: -2000,
        kind: 'credit',
      },
      {
        date: '2025-12-06',
        description: 'GROCERY MART 0042 ANYTOWN ST',
        amountCents: 100075,
        kind: 'purchase',
      },
      {
        date: '2026-01-02',
        description: 'COFFEE CORNER ANYTOWN ST',
        amountCents: 50,
        kind: 'purchase',
      },
      {
        date: '2026-01-03',
        description: 'STREAMING CO 800-555-0100 CA',
        amountCents: 6000,
        kind: 'purchase',
      },
    ]);
  });

  it('checks the parsed rows against the summary', () => {
    expect(checkTotals(parseChaseStatement(statement()))).toEqual({
      purchasesCents: 106125,
      purchasesMatch: true,
      paymentsAndCreditsCents: -52000,
      paymentsAndCreditsMatch: true,
    });
    const short = parseChaseStatement(statement({ purchases: '+$2,000.00' }));
    expect(checkTotals(short).purchasesMatch).toBe(false);
  });

  it('rejects files that are not Chase statements', () => {
    expect(() => parseChaseStatement([['Some other document']])).toThrow(StatementParseError);
  });
});

describe('groupIntoLines', () => {
  it('groups text by baseline, top to bottom and left to right', () => {
    const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] });
    expect(
      groupIntoLines([
        item('9.99', 500, 700),
        item('01/02', 40, 700.2),
        item('Header', 40, 720),
        item(' ', 0, 700),
      ]),
    ).toEqual([['Header'], ['01/02', '9.99']]);
  });
});
