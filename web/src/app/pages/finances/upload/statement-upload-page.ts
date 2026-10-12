import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import {
  countsAsSpending,
  type FinancesAdminData,
  matchCategory,
  type NewRule,
  type Statement,
  statementId,
  type StatementInfo,
  suggestPattern,
} from '../../../core/finances/finances';
import { SeoService } from '../../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../../shared/status/status';
import { formatExactCents, formatPeriod } from '../format';
import { pdfLines } from './pdf-lines';
import { checkTotals, type ParsedStatement, parseChaseStatement } from './statement-parser';

interface DraftRow {
  index: number;
  tx: ParsedStatement['transactions'][number];
  categoryKey: string | null;
  /** Set by a merchant pattern rather than picked by hand. */
  matched: boolean;
  remember: boolean;
  pattern: string;
}

/**
 * Admin-only: reads a card statement PDF in the browser, categorizes its
 * transactions with the plan's merchant patterns, and saves the result.
 */
@Component({
  selector: 'app-statement-upload-page',
  imports: [RouterLink, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container">
        <header class="page-header fin-header">
          <div>
            <p class="eyebrow">Family · Admin</p>
            <h1>Upload a statement</h1>
          </div>
          <a routerLink="/family/finances" class="btn btn--secondary">Back to dashboard</a>
        </header>

        @if (admin.hasValue()) {
          @if (!categories().length) {
            <p class="empty">
              Add budget categories to the Spending plan in the Studio's private workspace first.
            </p>
          }

          <label class="fin-field">
            <span>Chase statement (PDF)</span>
            <input
              type="file"
              accept="application/pdf"
              (change)="readFile($event)"
              [disabled]="busy()"
            />
          </label>
          @if (message(); as m) {
            <p
              class="fin-status"
              [class.is-over]="m.error"
              [attr.role]="m.error ? 'alert' : 'status'"
            >
              {{ m.text }}
            </p>
          }

          @if (draft(); as d) {
            <article class="fin-card upload-draft">
              <h2>Card ••{{ d.last4 }} · {{ period(d.openingDate, d.closingDate) }}</h2>
              <ul class="checks">
                <li [class.is-over]="!totals()!.purchasesMatch">
                  {{ totals()!.purchasesMatch ? '✓' : '✗' }} Purchases add up to
                  {{ money(d.purchasesTotalCents) }}
                  @if (!totals()!.purchasesMatch) {
                    (found {{ money(totals()!.purchasesCents) }}; check the transactions below)
                  }
                </li>
                <li [class.is-over]="!totals()!.paymentsAndCreditsMatch">
                  {{ totals()!.paymentsAndCreditsMatch ? '✓' : '✗' }} Payments and credits add up to
                  {{ money(d.paymentsAndCreditsCents) }}
                </li>
                @if (replaces()) {
                  <li>
                    This replaces the statement already uploaded for this period, including any
                    categories changed on the dashboard.
                  </li>
                }
              </ul>

              <div class="table-scroll">
                <table class="fin-table upload-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.index) {
                      <tr [class.needs-category]="!row.categoryKey && counts(row)">
                        <td>{{ row.tx.date.slice(5) }}</td>
                        <th scope="row">{{ row.tx.description }}</th>
                        <td>{{ money(row.tx.amountCents) }}</td>
                        <td>
                          @if (counts(row)) {
                            <select
                              [attr.aria-label]="'Category for ' + row.tx.description"
                              (change)="setCategory(row.index, $any($event.target).value)"
                            >
                              <option value="" [selected]="!row.categoryKey">Choose…</option>
                              @for (c of categories(); track c.key) {
                                <option [value]="c.key" [selected]="c.key === row.categoryKey">
                                  {{ c.name }}
                                </option>
                              }
                            </select>
                            @if (!row.matched && row.categoryKey) {
                              <label class="remember">
                                <input
                                  type="checkbox"
                                  [checked]="row.remember"
                                  (change)="
                                    update(row.index, { remember: $any($event.target).checked })
                                  "
                                />
                                Remember
                                <input
                                  type="text"
                                  aria-label="Merchant pattern"
                                  [value]="row.pattern"
                                  [disabled]="!row.remember"
                                  (change)="
                                    update(row.index, { pattern: $any($event.target).value })
                                  "
                                />
                              </label>
                            }
                          } @else {
                            <span class="fin-card__meta">Payment, not counted</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="repayment">
                <label class="fin-field">
                  <span>Repaid by friends this statement ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    [value]="repaidDollars()"
                    (change)="repaidDollars.set($any($event.target).value)"
                  />
                </label>
                <label class="fin-field">
                  <span>Repayment category</span>
                  <select (change)="repaidCategory.set($any($event.target).value || null)">
                    @for (c of categories(); track c.key) {
                      <option [value]="c.key" [selected]="c.key === repaidCategoryOrDefault()">
                        {{ c.name }}
                      </option>
                    }
                  </select>
                </label>
              </div>

              <div class="button-row">
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="!canSave()"
                  (click)="save()"
                >
                  {{ busy() ? 'Saving…' : 'Save statement' }}
                </button>
                <button type="button" class="btn btn--text" (click)="reset()">Cancel</button>
              </div>
              @if (uncategorizedCount()) {
                <p class="fin-card__meta">
                  {{ uncategorizedCount() }} transactions still need a category.
                </p>
              }
            </article>
          }

          <h2 class="uploaded-heading">Uploaded statements</h2>
          @if (statements().length) {
            <table class="fin-table uploaded">
              <tbody>
                @for (s of statements(); track s.id) {
                  <tr>
                    <th scope="row">
                      Card ••{{ s.last4 }} · {{ period(s.openingDate, s.closingDate) }},
                      {{ s.closingDate.slice(0, 4) }}
                    </th>
                    <td>
                      <button
                        type="button"
                        class="btn btn--text"
                        [disabled]="busy()"
                        (click)="remove(s)"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty">None yet.</p>
          }
        } @else if (admin.error()) {
          <app-load-error />
        } @else if (admin.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
  styleUrls: ['../finances.scss', './statement-upload-page.scss'],
})
export class StatementUploadPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  protected readonly admin = resource({
    loader: () => this.auth.fetchMembersApi<FinancesAdminData>('/finances/admin'),
  });

  protected readonly categories = computed(
    () => (this.admin.hasValue() ? this.admin.value()?.plan.categories : null) ?? [],
  );
  protected readonly statements = computed(
    () => (this.admin.hasValue() ? this.admin.value()?.statements : null) ?? [],
  );

  protected readonly draft = signal<ParsedStatement | null>(null);
  protected readonly rows = signal<DraftRow[]>([]);
  protected readonly repaidDollars = signal('0');
  protected readonly repaidCategory = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);

  protected readonly totals = computed(() => {
    const draft = this.draft();
    return draft ? checkTotals(draft) : null;
  });

  protected readonly replaces = computed(() => {
    const draft = this.draft();
    return !!draft && this.statements().some((s) => s.id === this.draftId(draft));
  });

  protected readonly uncategorizedCount = computed(
    () => this.rows().filter((r) => this.counts(r) && !r.categoryKey).length,
  );

  /** Friend repayments are usually a share of a dinner out. */
  protected readonly repaidCategoryOrDefault = computed(
    () =>
      this.repaidCategory() ??
      this.categories().find((c) => /restaurant/i.test(c.name))?.key ??
      this.categories()[0]?.key ??
      null,
  );

  protected readonly canSave = computed(
    () =>
      !this.busy() &&
      !!this.draft() &&
      this.uncategorizedCount() === 0 &&
      Number.isFinite(Number(this.repaidDollars())) &&
      Number(this.repaidDollars()) >= 0,
  );

  protected readonly money = formatExactCents;
  protected readonly period = formatPeriod;
  protected readonly counts = (row: DraftRow) => countsAsSpending(row.tx);

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Upload a statement',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }

  protected async readFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.busy.set(true);
    this.message.set(null);
    try {
      const parsed = parseChaseStatement(await pdfLines(await file.arrayBuffer()));
      const categories = this.categories();
      this.rows.set(
        parsed.transactions.map((tx, index) => {
          const categoryKey = countsAsSpending(tx)
            ? matchCategory(tx.description, categories)
            : null;
          return {
            index,
            tx,
            categoryKey,
            matched: !!categoryKey,
            remember: true,
            pattern: suggestPattern(tx.description),
          };
        }),
      );
      this.repaidDollars.set('0');
      this.repaidCategory.set(null);
      this.draft.set(parsed);
    } catch (error) {
      this.draft.set(null);
      this.message.set({
        text: error instanceof Error ? error.message : 'That file could not be read.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected setCategory(index: number, categoryKey: string): void {
    const key = categoryKey || null;
    this.update(index, { categoryKey: key, matched: false });

    // Fill in other uncategorized rows from the same merchant
    const pattern = this.rows()[index].pattern.trim().toUpperCase();
    if (!key || pattern.length < 3) return;
    this.rows.update((rows) =>
      rows.map((r) =>
        !r.categoryKey && countsAsSpending(r.tx) && r.tx.description.toUpperCase().includes(pattern)
          ? { ...r, categoryKey: key, matched: true }
          : r,
      ),
    );
  }

  protected update(index: number, changes: Partial<DraftRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.index === index ? { ...r, ...changes } : r)));
  }

  protected reset(): void {
    this.draft.set(null);
    this.rows.set([]);
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canSave()) return;

    const id = this.draftId(draft);
    const statement: Statement = {
      id,
      last4: draft.last4,
      openingDate: draft.openingDate,
      closingDate: draft.closingDate,
      purchasesTotalCents: draft.purchasesTotalCents,
      transactions: this.rows().map((r) => ({ ...r.tx, categoryKey: r.categoryKey })),
      friendRepayment: {
        amountCents: Math.round(Number(this.repaidDollars()) * 100),
        categoryKey: this.repaidCategoryOrDefault(),
      },
    };
    const newRules = [
      ...new Map(
        this.rows()
          .filter((r) => !r.matched && r.remember && r.categoryKey && r.pattern.trim())
          .map((r): [string, NewRule] => [
            r.pattern.trim().toUpperCase(),
            { categoryKey: r.categoryKey!, pattern: r.pattern.trim() },
          ]),
      ).values(),
    ];

    await this.run(async () => {
      await this.auth.fetchMembersApi(`/finances/statements/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { statement, newRules },
      });
      this.reset();
      this.admin.reload();
      return `Saved. ${newRules.length ? `${newRules.length} merchant patterns remembered.` : ''}`;
    });
  }

  protected async remove(statement: StatementInfo): Promise<void> {
    const label = `card ••${statement.last4}, ${formatPeriod(statement.openingDate, statement.closingDate)}`;
    if (!confirm(`Delete the statement for ${label}?`)) return;
    await this.run(async () => {
      await this.auth.fetchMembersApi(`/finances/statements/${encodeURIComponent(statement.id)}`, {
        method: 'DELETE',
      });
      this.admin.reload();
      return `Deleted the statement for ${label}.`;
    });
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      this.message.set({ text: await action(), error: false });
    } catch (error) {
      this.message.set({
        text: error instanceof Error ? error.message : 'Something went wrong.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }

  private draftId(draft: ParsedStatement): string {
    return statementId(draft.last4, draft.closingDate);
  }
}
