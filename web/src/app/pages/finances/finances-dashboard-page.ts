import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  OnInit,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { type FinancesDashboard, type LineItem, UNCATEGORIZED } from '../../core/finances/finances';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { FinanceTrend } from './finance-trend';
import {
  formatCents,
  formatDay,
  formatDollars,
  formatExactCents,
  formatMonth,
  formatPeriod,
} from './format';

interface CategoryRow {
  key: string;
  name: string;
  budgetCents: number;
  spentCents: number;
  leftCents: number;
  /** Spent as a share of budget, capped for the bar. */
  percent: number;
  over: boolean;
}

/** Wife-only: this month's spending against the plan, from uploaded statements. */
@Component({
  selector: 'app-finances-dashboard-page',
  imports: [RouterLink, FinanceTrend, LoadingComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container">
        <header class="page-header fin-header">
          <div>
            <p class="eyebrow">Family</p>
            <h1>Finances dashboard</h1>
          </div>
          @if (auth.isAdmin()) {
            <a routerLink="upload" class="btn btn--secondary">Upload a statement</a>
          }
        </header>

        @if (data.hasValue()) {
          @if (current(); as month) {
            <label class="fin-month">
              <span>Statement</span>
              <select (change)="selectedMonth.set($any($event.target).value)">
                @for (m of data.value()!.months; track m.month) {
                  <option [value]="m.month" [selected]="m.month === month.month">
                    {{ monthLabel(m.month) }}
                  </option>
                }
              </select>
            </label>

            <div class="fin-grid">
              <article class="fin-card">
                <h2>This month vs target</h2>
                <p class="fin-card__meta">
                  @for (s of month.statements; track s.id) {
                    <span>Card ••{{ s.last4 }} · {{ period(s.openingDate, s.closingDate) }}</span>
                  }
                </p>
                <p class="fin-total">
                  <strong [class.is-over]="isOver()">{{ cents(month.totalCents) }}</strong>
                  @if (month.target !== null) {
                    <span>of {{ dollars(month.target) }} target</span>
                  }
                </p>
                @if (month.target !== null) {
                  <div
                    class="meter"
                    role="meter"
                    aria-label="Spending against target"
                    [attr.aria-valuenow]="month.totalCents / 100"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="month.target"
                  >
                    <span [class.is-over]="isOver()" [style.width.%]="targetPercent()"></span>
                  </div>
                  <p class="fin-status" [class.is-over]="isOver()">
                    {{ targetStatus() }}
                    @if (month.stageLabel) {
                      <span class="fin-card__meta">· Stage: {{ month.stageLabel }}</span>
                    }
                  </p>
                }
                @if (month.friendRepaidCents) {
                  <p class="fin-card__meta">
                    Includes {{ cents(month.friendRepaidCents) }} repaid by friends.
                  </p>
                }
              </article>

              <article class="fin-card">
                <h2>Budget by category</h2>
                <table class="fin-table">
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Budget</th>
                      <th scope="col">Spent</th>
                      <th scope="col">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of categoryRows(); track row.key) {
                      <tr [class.is-over]="row.over" [class.is-open]="expanded() === row.key">
                        <th scope="row">
                          <button
                            type="button"
                            class="row-toggle"
                            [attr.aria-expanded]="expanded() === row.key"
                            [attr.aria-controls]="'items-' + row.key"
                            (click)="toggle(row.key)"
                          >
                            <span class="chevron" aria-hidden="true"></span>{{ row.name }}
                          </button>
                          <span class="bar" aria-hidden="true"
                            ><span [style.width.%]="row.percent"></span
                          ></span>
                        </th>
                        <td>{{ cents(row.budgetCents) }}</td>
                        <td>{{ cents(row.spentCents) }}</td>
                        <td>{{ row.over ? '−' + cents(-row.leftCents) : cents(row.leftCents) }}</td>
                      </tr>
                      @if (expanded() === row.key) {
                        <tr class="line-items" [id]="'items-' + row.key">
                          <td colspan="4">
                            @if (lineItems.hasValue()) {
                              @if (openItems().length) {
                                <table class="items">
                                  <caption class="visually-hidden">
                                    {{
                                      row.name
                                    }}
                                    line items
                                  </caption>
                                  <tbody>
                                    @for (item of openItems(); track $index) {
                                      <tr [class.is-credit]="item.amountCents < 0">
                                        <td>{{ day(item.date) }}</td>
                                        <th scope="row">
                                          {{ item.description }}
                                          @if (month.statements.length > 1) {
                                            <span class="card">••{{ item.last4 }}</span>
                                          }
                                        </th>
                                        <td>{{ exact(item.amountCents) }}</td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              } @else {
                                <p class="fin-card__meta">No spending here this month.</p>
                              }
                            } @else if (lineItems.error()) {
                              <p class="fin-status is-over">The line items could not be loaded.</p>
                            } @else {
                              <p class="fin-card__meta" role="status">Loading…</p>
                            }
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td>{{ cents(budgetTotalCents()) }}</td>
                      <td>{{ cents(month.totalCents) }}</td>
                      <td>{{ cents(budgetTotalCents() - month.totalCents) }}</td>
                    </tr>
                  </tfoot>
                </table>
              </article>

              <article class="fin-card fin-card--wide">
                <h2>Spending per month</h2>
                <p class="fin-card__meta">Last 12 months · click a dot to see that month</p>
                <app-finance-trend
                  [months]="data.value()!.months"
                  [stages]="data.value()!.stages"
                  [selected]="month.month"
                  (select)="selectedMonth.set($event)"
                />
              </article>
            </div>
          } @else {
            <p class="empty">No statements have been uploaded yet.</p>
          }
        } @else if (data.error()) {
          <app-load-error />
        } @else if (data.isLoading()) {
          <app-loading />
        }
      </div>
    </section>
  `,
  styleUrl: './finances.scss',
})
export class FinancesDashboardPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  protected readonly data = resource({
    loader: () => this.auth.fetchMembersApi<FinancesDashboard>('/finances'),
  });

  private readonly months = computed(
    () => (this.data.hasValue() ? this.data.value()?.months : null) ?? [],
  );

  /** Defaults to the newest month whenever the data (re)loads. */
  protected readonly selectedMonth = linkedSignal(() => this.months()[0]?.month ?? null);

  protected readonly current = computed(
    () => this.months().find((m) => m.month === this.selectedMonth()) ?? this.months()[0] ?? null,
  );

  protected readonly isOver = computed(() => {
    const month = this.current();
    return !!month && month.target !== null && month.totalCents > month.target * 100;
  });

  protected readonly targetPercent = computed(() => {
    const month = this.current();
    if (!month?.target) return 0;
    return Math.min(100, Math.max(0, (month.totalCents / (month.target * 100)) * 100));
  });

  protected readonly targetStatus = computed(() => {
    const month = this.current();
    if (!month || month.target === null) return '';
    const diff = month.target * 100 - month.totalCents;
    return diff >= 0 ? `${formatCents(diff)} under target` : `${formatCents(-diff)} over target`;
  });

  protected readonly categoryRows = computed<CategoryRow[]>(() => {
    const month = this.current();
    const categories = this.data.hasValue() ? (this.data.value()?.categories ?? []) : [];
    if (!month) return [];
    const rows = categories.map((c) =>
      row(c.key, c.name, c.monthlyBudget * 100, month.byCategory[c.key] ?? 0),
    );
    const uncategorized = month.byCategory[UNCATEGORIZED] ?? 0;
    if (uncategorized) rows.push(row(UNCATEGORIZED, 'Uncategorized', 0, uncategorized));
    // Biggest budgets first, then anything unbudgeted by spend
    return rows.sort((a, b) => b.budgetCents - a.budgetCents || b.spentCents - a.spentCents);
  });

  protected readonly budgetTotalCents = computed(() =>
    this.categoryRows().reduce((sum, r) => sum + r.budgetCents, 0),
  );

  /** The category whose line items are showing. Stays open when switching months. */
  protected readonly expanded = signal<string | null>(null);

  /** The open month's line items, fetched once a category is opened. */
  protected readonly lineItems = resource({
    params: () => (this.expanded() ? this.current()?.month : undefined),
    loader: ({ params: month }) =>
      this.auth.fetchMembersApi<LineItem[]>(`/finances/months/${month}`),
  });

  protected readonly openItems = computed(() => {
    const key = this.expanded();
    const items = this.lineItems.hasValue() ? (this.lineItems.value() ?? []) : [];
    return items.filter((item) => item.categoryKey === key);
  });

  protected toggle(key: string): void {
    this.expanded.update((open) => (open === key ? null : key));
  }

  protected readonly cents = formatCents;
  protected readonly exact = formatExactCents;
  protected readonly day = formatDay;
  protected readonly dollars = formatDollars;
  protected readonly period = formatPeriod;
  protected readonly monthLabel = (month: string) => `${formatMonth(month)} statement`;

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Finances',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }
}

function row(key: string, name: string, budgetCents: number, spentCents: number): CategoryRow {
  return {
    key,
    name,
    budgetCents,
    spentCents,
    leftCents: budgetCents - spentCents,
    percent: budgetCents
      ? Math.min(100, Math.max(0, (spentCents / budgetCents) * 100))
      : spentCents
        ? 100
        : 0,
    over: spentCents > budgetCents,
  };
}
