import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  OnInit,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { type FinancesDashboard, UNCATEGORIZED } from '../../core/finances/finances';
import { SeoService } from '../../core/seo.service';
import { LoadErrorComponent, LoadingComponent } from '../../shared/status/status';
import { FinanceTrend } from './finance-trend';
import { formatCents, formatDollars, formatMonth, formatPeriod } from './format';

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
                @if (data.value()!.months.length > 1) {
                  <app-finance-trend
                    [months]="data.value()!.months"
                    [selected]="month.month"
                    (select)="selectedMonth.set($event)"
                  />
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
                      <tr [class.is-over]="row.over">
                        <th scope="row">
                          {{ row.name }}
                          <span class="bar" aria-hidden="true"
                            ><span [style.width.%]="row.percent"></span
                          ></span>
                        </th>
                        <td>{{ cents(row.budgetCents) }}</td>
                        <td>{{ cents(row.spentCents) }}</td>
                        <td>{{ row.over ? '−' + cents(-row.leftCents) : cents(row.leftCents) }}</td>
                      </tr>
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

  protected readonly cents = formatCents;
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
