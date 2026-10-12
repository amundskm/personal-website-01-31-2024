/**
 * Finances domain logic, shared by the finances Lambda (which stores and
 * summarizes statements) and the dashboard/upload pages.
 *
 * Contains no data: the plan lives in the private Sanity dataset and the
 * statements in DynamoDB, both behind the members API. Transaction amounts are
 * integer cents; plan budgets and targets are whole dollars, as entered in the Studio.
 */

export interface PlanCategory {
  key: string;
  name: string;
  /** Dollars per month (in active months). */
  monthlyBudget: number;
  /** Months (1–12) the monthly budget applies in; empty or missing = every month. */
  activeMonths?: number[] | null;
  /** One-time purchases added to a month's budget every year. */
  plannedPurchases?: PlannedPurchase[] | null;
  /** Case-insensitive substrings of the statement description. Admin only. */
  merchantPatterns?: string[] | null;
}

export interface PlannedPurchase {
  label: string;
  /** 1–12. */
  month: number;
  /** Dollars. */
  amount: number;
}

/** A category's budget for one statement month (`YYYY-MM`), in cents. */
export function budgetForMonth(category: PlanCategory, month: string) {
  const monthNumber = Number(month.slice(5, 7));
  const active = !category.activeMonths?.length || category.activeMonths.includes(monthNumber);
  const planned = (category.plannedPurchases ?? []).filter((p) => p.month === monthNumber);
  const monthlyCents = active ? Math.round(category.monthlyBudget * 100) : 0;
  const plannedCents = planned.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
  return { totalCents: monthlyCents + plannedCents, monthlyCents, planned };
}

export interface PlanStage {
  label: string;
  /** ISO date the stage's target applies from (to statement months ending on or after it). */
  startDate: string;
  /** Dollars per month. */
  monthlyTarget: number;
}

export interface SpendingPlan {
  categories: PlanCategory[];
  stages: PlanStage[];
}

/** Payments to the card aren't spending; refunds (credits) reduce it. */
export type TransactionKind = 'purchase' | 'credit' | 'payment' | 'fee';

export interface StatementTransaction {
  /** ISO date. */
  date: string;
  description: string;
  amountCents: number;
  kind: TransactionKind;
  categoryKey: string | null;
}

export interface FriendRepayment {
  amountCents: number;
  categoryKey: string | null;
}

export interface Statement {
  id: string;
  last4: string;
  openingDate: string;
  closingDate: string;
  /** "Purchases" from the statement summary, used to check the parse. */
  purchasesTotalCents: number;
  transactions: StatementTransaction[];
  /** Money friends paid back (e.g. their share of a group dinner). */
  friendRepayment: FriendRepayment;
  uploadedAt?: string;
}

export interface StatementInfo {
  id: string;
  last4: string;
  openingDate: string;
  closingDate: string;
  uploadedAt?: string;
}

/** One statement month, as the dashboard shows it. */
export interface MonthSummary {
  /** `YYYY-MM` the statements start in (see `statementMonth`). */
  month: string;
  statements: StatementInfo[];
  /** Spending after refunds and friend repayments. */
  totalCents: number;
  /** Per category key; uncategorized spending is under `UNCATEGORIZED`. */
  byCategory: Record<string, number>;
  friendRepaidCents: number;
  /** The active stage's monthly target, in dollars. */
  target: number | null;
  stageLabel: string | null;
}

/** What the wife-only dashboard receives: totals only, no transactions or rules. */
export interface FinancesDashboard {
  categories: Omit<PlanCategory, 'merchantPatterns'>[];
  /** For drawing the target across months without statements. */
  stages: PlanStage[];
  months: MonthSummary[];
}

/** One line under a category on the dashboard. */
export interface LineItem {
  date: string;
  description: string;
  amountCents: number;
  /** `repayment` = money friends paid back, entered on upload (negative). */
  kind: Exclude<TransactionKind, 'payment'> | 'repayment';
  /** A plan category key, or `UNCATEGORIZED`. */
  categoryKey: string;
  last4: string;
  statementId: string;
  /** Position in the statement's transactions; null for the friend repayment. */
  index: number | null;
}

/** Moves one line to another category (body of PATCH /finances/statements/{id}/lines/{line}). */
export interface Recategorize {
  categoryKey: string;
  /** Must still match the stored line, so a re-uploaded statement isn't edited by mistake. */
  description: string;
  amountCents: number;
}

/** The `{line}` path segment for a line item. */
export const lineRef = (item: Pick<LineItem, 'index'>) =>
  item.index === null ? 'repayment' : String(item.index);

/** What the admin-only upload page receives. */
export interface FinancesAdminData {
  plan: SpendingPlan;
  statements: StatementInfo[];
}

export interface NewRule {
  categoryKey: string;
  pattern: string;
}

export const UNCATEGORIZED = '_uncategorized';

export const statementId = (last4: string, closingDate: string) => `${last4}_${closingDate}`;

/**
 * The month a statement counts toward: the month its billing period starts in,
 * where nearly all of its spending happened (Sep 5 – Oct 4 is September).
 */
export const statementMonth = (statement: Pick<Statement, 'openingDate'>) =>
  statement.openingDate.slice(0, 7);

export const countsAsSpending = (tx: Pick<StatementTransaction, 'kind'>) => tx.kind !== 'payment';

/** The category whose longest matching pattern is longest, so "AMAZON WEB" beats "AMAZON". */
export function matchCategory(description: string, categories: PlanCategory[]): string | null {
  const text = description.toUpperCase();
  let best: { key: string; length: number } | null = null;
  for (const category of categories) {
    for (const raw of category.merchantPatterns ?? []) {
      const pattern = raw.trim().toUpperCase();
      if (pattern && text.includes(pattern) && pattern.length > (best?.length ?? 0)) {
        best = { key: category.key, length: pattern.length };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * A starting point for a new merchant rule: the leading words of the
 * description, stopping at store numbers, phone numbers and the like.
 */
export function suggestPattern(description: string): string {
  const words = description.trim().split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    if (/\d/.test(word) && kept.length) break;
    kept.push(word);
    if (kept.length === 3) break;
  }
  return kept.join(' ');
}

/** The stage whose target applies on `date`: the latest one that has started. */
export function stageFor(stages: PlanStage[], date: string): PlanStage | null {
  return (
    [...stages]
      .filter((stage) => stage.startDate <= date)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
  );
}

/** The `count` months (`YYYY-MM`) ending with `lastMonth`, oldest first. */
export function monthWindow(lastMonth: string, count: number): string[] {
  const [year, month] = lastMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** The monthly target in effect at the end of `month` (`YYYY-MM`), or null before the plan starts. */
export function targetForMonth(stages: PlanStage[], month: string): number | null {
  return stageFor(stages, `${month}-31`)?.monthlyTarget ?? null;
}

/** Maps a stored category key to a current plan category, or `UNCATEGORIZED`. */
function categoryKeyFor(plan: SpendingPlan): (key: string | null) => string {
  const known = new Set(plan.categories.map((c) => c.key));
  return (key) => (key && known.has(key) ? key : UNCATEGORIZED);
}

/**
 * Every line that counts toward a statement month (`YYYY-MM` of the closing
 * date), oldest first: purchases, fees, refunds and friend repayments. They
 * add up to that month's `MonthSummary` totals, per category.
 */
export function monthLineItems(
  statements: Statement[],
  plan: SpendingPlan,
  month: string,
): LineItem[] {
  const keyFor = categoryKeyFor(plan);
  const items: LineItem[] = [];
  for (const statement of statements) {
    if (statementMonth(statement) !== month) continue;
    statement.transactions.forEach((tx, index) => {
      if (tx.kind === 'payment') return;
      items.push({
        date: tx.date,
        description: tx.description,
        amountCents: tx.amountCents,
        kind: tx.kind,
        categoryKey: keyFor(tx.categoryKey),
        last4: statement.last4,
        statementId: statement.id,
        index,
      });
    });
    const repaid = statement.friendRepayment?.amountCents ?? 0;
    if (repaid) {
      items.push({
        date: statement.closingDate,
        description: 'Repaid by friends',
        amountCents: -repaid,
        kind: 'repayment',
        categoryKey: keyFor(statement.friendRepayment.categoryKey),
        last4: statement.last4,
        statementId: statement.id,
        index: null,
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Groups statements by closing month and totals them, newest month first. */
export function summarizeMonths(statements: Statement[], plan: SpendingPlan): MonthSummary[] {
  const keyFor = categoryKeyFor(plan);
  const months = new Map<string, MonthSummary>();

  for (const statement of statements) {
    const month = statementMonth(statement);
    let summary = months.get(month);
    if (!summary) {
      summary = {
        month,
        statements: [],
        totalCents: 0,
        byCategory: {},
        friendRepaidCents: 0,
        target: null,
        stageLabel: null,
      };
      months.set(month, summary);
    }
    summary.statements.push(toInfo(statement));

    const add = (key: string, cents: number) => {
      summary.byCategory[key] = (summary.byCategory[key] ?? 0) + cents;
      summary.totalCents += cents;
    };
    for (const tx of statement.transactions) {
      if (countsAsSpending(tx)) add(keyFor(tx.categoryKey), tx.amountCents);
    }
    const repaid = statement.friendRepayment?.amountCents ?? 0;
    if (repaid) {
      add(keyFor(statement.friendRepayment.categoryKey), -repaid);
      summary.friendRepaidCents += repaid;
    }
  }

  return [...months.values()]
    .map((summary) => {
      const stage = stageFor(plan.stages, `${summary.month}-31`);
      summary.statements.sort((a, b) => a.closingDate.localeCompare(b.closingDate));
      return { ...summary, target: stage?.monthlyTarget ?? null, stageLabel: stage?.label ?? null };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function toInfo({
  id,
  last4,
  openingDate,
  closingDate,
  uploadedAt,
}: Statement): StatementInfo {
  return { id, last4, openingDate, closingDate, ...(uploadedAt ? { uploadedAt } : {}) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly TransactionKind[] = ['purchase', 'credit', 'payment', 'fee'];

/** Checks an uploaded statement's shape. Returns an error message, or null if valid. */
export function validateStatement(value: unknown, id: string): string | null {
  const s = value as Partial<Statement> | null;
  if (!s || typeof s !== 'object') return 'Missing statement';
  if (typeof s.last4 !== 'string' || !/^\d{4}$/.test(s.last4)) return 'Invalid card number';
  if (!ISO_DATE.test(String(s.openingDate)) || !ISO_DATE.test(String(s.closingDate)))
    return 'Invalid statement period';
  if (statementId(s.last4, s.closingDate!) !== id) return 'Statement id does not match';
  if (!Number.isInteger(s.purchasesTotalCents)) return 'Invalid purchases total';
  if (!Array.isArray(s.transactions) || s.transactions.length > 2000) return 'Invalid transactions';
  for (const tx of s.transactions) {
    if (
      !tx ||
      !ISO_DATE.test(String(tx.date)) ||
      typeof tx.description !== 'string' ||
      tx.description.length > 300 ||
      !Number.isInteger(tx.amountCents) ||
      !KINDS.includes(tx.kind) ||
      (tx.categoryKey !== null && typeof tx.categoryKey !== 'string')
    ) {
      return 'Invalid transaction';
    }
  }
  const repayment = s.friendRepayment;
  if (
    !repayment ||
    !Number.isInteger(repayment.amountCents) ||
    repayment.amountCents < 0 ||
    (repayment.categoryKey !== null && typeof repayment.categoryKey !== 'string')
  ) {
    return 'Invalid friend repayment';
  }
  return null;
}
