import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { type FinancesDashboard, UNCATEGORIZED } from '../../core/finances/finances';
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

describe('FinancesDashboardPage', () => {
  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isAdmin: signal(false), fetchMembersApi: () => Promise.resolve(data) },
        },
      ],
    });
    const fixture = TestBed.createComponent(FinancesDashboardPage);
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
});
