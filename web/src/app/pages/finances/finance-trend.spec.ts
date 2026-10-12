import { TestBed } from '@angular/core/testing';
import type { MonthSummary, PlanStage } from '../../core/finances/finances';
import { FinanceTrend } from './finance-trend';

// Made-up figures only: the repository is public.
const month = (m: string, dollars: number, target: number | null = 1000): MonthSummary => ({
  month: m,
  statements: [],
  totalCents: dollars * 100,
  byCategory: {},
  friendRepaidCents: 0,
  target,
  stageLabel: null,
});

const stages: PlanStage[] = [
  { label: 'A', startDate: '2030-01-01', monthlyTarget: 1000 },
  { label: 'B', startDate: '2030-03-01', monthlyTarget: 800 },
];

function render(months: MonthSummary[], selected: string | null = null) {
  const fixture = TestBed.createComponent(FinanceTrend);
  fixture.componentRef.setInput('months', months);
  fixture.componentRef.setInput('stages', stages);
  fixture.componentRef.setInput('selected', selected);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    dots: el.querySelectorAll('.dot'),
    line: el.querySelector('.line')!.getAttribute('d') ?? '',
    target: el.querySelector('.target')!.getAttribute('d') ?? '',
    labels: [...el.querySelectorAll('text.axis:not(.axis--year)')]
      .map((t) => t.textContent!.trim())
      .filter((t) => !t.startsWith('$')),
  };
}

describe('FinanceTrend', () => {
  it('shows a single dot for the first month, on a rolling 12-month axis', () => {
    const { dots, line, labels } = render([month('2030-02', 1200)], '2030-02');
    expect(dots.length).toBe(1);
    expect(line).toMatch(/^M[\d.]+,[\d.]+$/);
    expect(labels).toHaveLength(12);
    expect(labels.at(0)).toBe('Mar');
    expect(labels.at(-1)).toBe('Feb');
  });

  it('connects consecutive months and breaks the line at a missing month', () => {
    const { dots, line } = render([
      month('2030-05', 700),
      month('2030-03', 800),
      month('2030-02', 900),
    ]);
    expect(dots.length).toBe(3);
    // Feb → Mar joined, Apr missing, so May starts a new segment
    expect(line.match(/[ML]/g)).toEqual(['M', 'L', 'M']);
  });

  it('marks months over target and draws the target as a step line', () => {
    const { el, target } = render([month('2030-03', 900, 800), month('2030-02', 900)]);
    expect(el.querySelectorAll('.point.is-over').length).toBe(1);
    // Two distinct target levels across the window (1000, then 800 from March)
    const ys = new Set([...target.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => m[1]));
    expect(ys.size).toBe(2);
  });

  it('emits the month when a dot is clicked', () => {
    const fixture = TestBed.createComponent(FinanceTrend);
    fixture.componentRef.setInput('months', [month('2030-02', 900)]);
    fixture.detectChanges();
    let picked: string | undefined;
    fixture.componentInstance.select.subscribe((m) => (picked = m));
    (fixture.nativeElement as HTMLElement)
      .querySelector('.point')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(picked).toBe('2030-02');
  });
});
