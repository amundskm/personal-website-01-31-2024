import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { type FinancesDashboard, type LineItem, UNCATEGORIZED } from '../../core/finances/finances';
import { FinancesDashboardPage } from './finances-dashboard-page';

// Made-up figures only: the repository is public.
const data: FinancesDashboard = {
  categories: [
    { key: 'food', name: 'Food', monthlyBudget: 500 },
    { key: 'fun', name: 'Fun', monthlyBudget: 100 },
  ],
  stages: [{ label: 'Start', startDate: '2029-12-01', monthlyTarget: 1000 }],
  months: [
    {
      month: '2030-02',
      statements: [
        {
          id: '1234_2030-02-01',
          last4: '1234',
          openingDate: '2030-01-02',
          closingDate: '2030-02-01',
        },
      ],
      totalCents: 130000,
      byCategory: { food: 40000, fun: 15000, [UNCATEGORIZED]: 75000 },
      friendRepaidCents: 2000,
      target: 1000,
      stageLabel: 'Start',
    },
    {
      month: '2030-01',
      statements: [
        {
          id: '1234_2030-01-01',
          last4: '1234',
          openingDate: '2029-12-02',
          closingDate: '2030-01-01',
        },
      ],
      totalCents: 80000,
      byCategory: { food: 80000 },
      friendRepaidCents: 0,
      target: 1000,
      stageLabel: 'Start',
    },
  ],
};

const items: LineItem[] = [
  {
    date: '2030-01-05',
    description: 'GAME SHOP',
    amountCents: 9000,
    kind: 'purchase',
    categoryKey: 'fun',
    last4: '1234',
  },
  {
    date: '2030-01-20',
    description: 'ARCADE',
    amountCents: 8000,
    kind: 'purchase',
    categoryKey: 'fun',
    last4: '1234',
  },
  {
    date: '2030-01-22',
    description: 'GAME SHOP REFUND',
    amountCents: -2000,
    kind: 'credit',
    categoryKey: 'fun',
    last4: '1234',
  },
  {
    date: '2030-01-08',
    description: 'MARKET',
    amountCents: 40000,
    kind: 'purchase',
    categoryKey: 'food',
    last4: '1234',
  },
];

describe('FinancesDashboardPage', () => {
  let requested: string[];

  let fixture: ComponentFixture<FinancesDashboardPage>;

  async function render() {
    requested = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAdmin: signal(false),
            fetchMembersApi: (path: string) => {
              requested.push(path);
              return Promise.resolve(path === '/finances' ? data : items);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(FinancesDashboardPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the newest month against its target', async () => {
    const el = await render();
    expect(el.querySelector('.fin-total')?.textContent).toContain('$1,300');
    expect(el.querySelector('.fin-total')?.textContent).toContain('of $1,000 target');
    expect(el.querySelector('.fin-status')?.textContent).toContain('$300 over target');
    expect(el.textContent).toContain('Includes $20 repaid by friends.');
    expect(el.querySelector('app-finance-trend svg')).not.toBeNull();
  });

  it('lists categories with budget, spent and left, flagging overspending', async () => {
    const el = await render();
    const rows = [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent!.trim()),
    );
    expect(rows).toEqual([
      ['Food', '$500', '$400', '$100'],
      ['Fun', '$100', '$150', '−$50'],
      ['Uncategorized', '$0', '$750', '−$750'],
    ]);
    expect(el.querySelectorAll('tbody tr.is-over').length).toBe(2);
    expect(el.querySelector('.fin-header .btn')).toBeNull();
  });

  it("opens a category to show that month's line items, and closes it again", async () => {
    const el = await render();
    expect(requested).toEqual(['/finances']);
    const toggle = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.row-toggle')].find((b) =>
        b.textContent!.includes('Fun'),
      )!;

    toggle().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(requested).toEqual(['/finances', '/finances/months/2030-02']);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const lines = [...el.querySelectorAll('.items tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent!.trim()),
    );
    expect(lines).toEqual([
      ['Jan 5', 'GAME SHOP', '$90.00'],
      ['Jan 20', 'ARCADE', '$80.00'],
      ['Jan 22', 'GAME SHOP REFUND', '-$20.00'],
    ]);
    expect(el.querySelectorAll('.items tr.is-credit').length).toBe(1);

    toggle().click();
    fixture.detectChanges();
    expect(el.querySelector('.line-items')).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});
