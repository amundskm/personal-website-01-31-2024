const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Whole dollars, e.g. "$1,200". */
export const formatDollars = (dollars: number) => usd.format(dollars);
/** Cents as dollars, rounded to whole dollars. */
export const formatCents = (cents: number) => usd.format(Math.round(cents / 100));
/** Cents as dollars and cents, e.g. "$1,234.56". */
export const formatExactCents = (cents: number) => usdCents.format(cents / 100);

const parseDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** `2030-01` → "January 2030". */
export const formatMonth = (month: string) =>
  parseDate(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** `2030-01` → "Jan". */
export const formatShortMonth = (month: string) =>
  parseDate(`${month}-01`).toLocaleDateString('en-US', { month: 'short' });

/** `2030-01-02`, `2030-02-01` → "Jan 2 – Feb 1". */
export const formatPeriod = (from: string, to: string) =>
  [from, to]
    .map((d) => parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    .join(' – ');
