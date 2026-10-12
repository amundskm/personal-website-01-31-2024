import type { StatementTransaction, TransactionKind } from '../../../core/finances/finances';

/** A statement as read from the PDF, before categorizing. */
export interface ParsedStatement {
  last4: string;
  openingDate: string;
  closingDate: string;
  purchasesTotalCents: number;
  /** "Payment, Credits" from the summary (negative). */
  paymentsAndCreditsCents: number;
  transactions: Omit<StatementTransaction, 'categoryKey'>[];
}

export class StatementParseError extends Error {
  override readonly name = 'StatementParseError';
}

const MONEY = /^(-)?\$?([\d,]*\.\d{2})$/;
const ACTIVITY_DATE = /^(\d{2})\/(\d{2})$/;
const SHORT_DATE = /(\d{2})\/(\d{2})\/(\d{2})/g;

/**
 * Parses a Chase credit card statement from its text lines (each line a list
 * of text cells, top to bottom, as produced by `pdfLines`).
 *
 * Reads the account summary (card number, billing period, purchases total) and
 * every row of the "Account activity" table.
 */
export function parseChaseStatement(lines: string[][]): ParsedStatement {
  const text = lines.map((cells) => collapseRepeats(cells.join(' ')));

  const last4 = findValue(text, /^Account Number: [X\s]*(\d{4})$/i);
  const period = text.find((line) => /^Opening\/Closing Date/i.test(line));
  const purchases = findValue(text, /^Purchases \+?\$([\d,]*\.\d{2})$/);
  const paymentsCredits = findValue(text, /^Payment, Credits (-?\$[\d,]*\.\d{2})$/);

  const dates = period ? [...period.matchAll(SHORT_DATE)] : [];
  if (!last4 || dates.length !== 2 || !purchases) {
    throw new StatementParseError(
      "This doesn't look like a Chase credit card statement (no account summary found).",
    );
  }
  const [openingDate, closingDate] = dates.map(([, mm, dd, yy]) => `20${yy}-${mm}-${dd}`);

  const transactions: ParsedStatement['transactions'] = [];
  let inActivity = false;
  let section: TransactionKind = 'purchase';

  lines.forEach((cells, i) => {
    const line = text[i];
    if (/^ACCOUNT ACTIVITY/i.test(line)) {
      inActivity = true;
      return;
    }
    if (!inActivity) return;
    if (/^(\d{4} Totals Year-to-Date|INTEREST CHARGES)/i.test(line)) {
      inActivity = false;
      return;
    }
    if (/^PAYMENTS AND OTHER CREDITS$/i.test(line)) section = 'credit';
    else if (/^PURCHASES?$/i.test(line)) section = 'purchase';
    else if (/^(FEES CHARGED|INTEREST CHARGED)$/i.test(line)) section = 'fee';

    const date = ACTIVITY_DATE.exec(cells[0]?.trim() ?? '');
    const amount = MONEY.exec(cells.at(-1)?.trim() ?? '');
    if (!date || !amount || cells.length < 3) return;

    const description = cells.slice(1, -1).join(' ').replace(/\s+/g, ' ').trim();
    const amountCents = toCents(amount[2]) * (amount[1] ? -1 : 1);
    const kind: TransactionKind =
      section === 'credit' && /PAYMENT/i.test(description) && amountCents < 0 ? 'payment' : section;

    transactions.push({
      date: activityDate(date[1], date[2], closingDate),
      description,
      amountCents,
      kind,
    });
  });

  if (!transactions.length) {
    throw new StatementParseError('No transactions were found in this statement.');
  }

  return {
    last4,
    openingDate,
    closingDate,
    purchasesTotalCents: toCents(purchases),
    paymentsAndCreditsCents: paymentsCredits ? parseMoney(paymentsCredits) : 0,
    transactions,
  };
}

/** Totals that should match the statement summary, to catch a bad parse. */
export function checkTotals(statement: ParsedStatement) {
  const sum = (kinds: TransactionKind[]) =>
    statement.transactions
      .filter((tx) => kinds.includes(tx.kind))
      .reduce((total, tx) => total + tx.amountCents, 0);
  const purchasesCents = sum(['purchase']);
  const paymentsAndCreditsCents = sum(['payment', 'credit']);
  return {
    purchasesCents,
    purchasesMatch: purchasesCents === statement.purchasesTotalCents,
    paymentsAndCreditsCents,
    paymentsAndCreditsMatch: paymentsAndCreditsCents === statement.paymentsAndCreditsCents,
  };
}

/** Activity rows have no year: it's the closing year, or the year before for a December row on a January statement. */
function activityDate(mm: string, dd: string, closingDate: string): string {
  const closingYear = Number(closingDate.slice(0, 4));
  const closingMonth = Number(closingDate.slice(5, 7));
  const year = Number(mm) > closingMonth ? closingYear - 1 : closingYear;
  return `${year}-${mm}-${dd}`;
}

function findValue(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) return match[1];
  }
  return null;
}

/** Bold headings are drawn twice in these PDFs ("ACCOUNT ACCOUNT ACTIVITY ACTIVITY"). */
function collapseRepeats(line: string): string {
  const words = line.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length % 2 === 0 && words.every((w, i) => i % 2 === 1 || w === words[i + 1])) {
    return words.filter((_, i) => i % 2 === 0).join(' ');
  }
  return words.join(' ');
}

function toCents(digits: string): number {
  return Math.round(Number(digits.replace(/,/g, '')) * 100);
}

function parseMoney(value: string): number {
  return toCents(value.replace(/[-$]/g, '')) * (value.startsWith('-') ? -1 : 1);
}
