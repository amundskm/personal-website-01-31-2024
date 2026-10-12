import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  type MonthSummary,
  monthWindow,
  type PlanStage,
  targetForMonth,
} from '../../core/finances/finances';
import { formatCents, formatDollars, formatMonth, formatShortMonth } from './format';

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 24, right: 16, bottom: 40, left: 60 };
const MONTHS = 12;

interface Slot {
  month: string;
  /** Center of the month's column. */
  x: number;
  label: string;
  /** Shown under the first month and every January. */
  year: string | null;
  summary: MonthSummary | null;
  target: number | null;
}

/**
 * Spending per statement month over a rolling 12-month window ending at the
 * newest statement, against the plan's target. Months without a statement
 * leave a gap in the line. Click a dot to select that month.
 */
@Component({
  selector: 'app-finance-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      role="img"
      [attr.aria-label]="description()"
    >
      @for (tick of ticks(); track tick.y) {
        <line
          class="grid"
          [attr.x1]="pad.left"
          [attr.x2]="width - pad.right"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
        />
        <text class="axis" [attr.x]="pad.left - 10" [attr.y]="tick.y + 4" text-anchor="end">
          {{ tick.label }}
        </text>
      }
      @for (slot of slots(); track slot.month) {
        <text
          class="axis"
          [class.is-selected]="slot.month === selected()"
          [attr.x]="slot.x"
          [attr.y]="height - 22"
          text-anchor="middle"
        >
          {{ slot.label }}
        </text>
        @if (slot.year) {
          <text
            class="axis axis--year"
            [attr.x]="slot.x"
            [attr.y]="height - 6"
            text-anchor="middle"
          >
            {{ slot.year }}
          </text>
        }
      }

      <path class="target" [attr.d]="targetPath()" />
      <path class="line" [attr.d]="linePath()" />

      @for (point of points(); track point.month) {
        <g
          class="point"
          [class.is-over]="point.over"
          [class.is-selected]="point.month === selected()"
          (click)="select.emit(point.month)"
        >
          <title>{{ point.title }}</title>
          <circle class="hit" [attr.cx]="point.x" [attr.cy]="point.y" r="16" />
          <circle
            class="dot"
            [attr.cx]="point.x"
            [attr.cy]="point.y"
            [attr.r]="point.month === selected() ? 7 : 5"
          />
          @if (point.month === selected()) {
            <text class="value" [attr.x]="point.x" [attr.y]="point.y - 14" text-anchor="middle">
              {{ point.value }}
            </text>
          }
        </g>
      }
    </svg>
    <p class="legend">
      <span class="legend__dot"></span> Spending <span class="legend__target"></span> Target
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .grid {
      stroke: var(--color-border);
      stroke-width: 1;
      opacity: 0.6;
    }
    .axis {
      fill: var(--color-muted);
      font-size: 13px;
      font-family: var(--font-sans);
    }
    .axis--year {
      font-size: 11px;
    }
    .axis.is-selected {
      fill: var(--color-text);
      font-weight: 700;
    }
    .target {
      fill: none;
      stroke: var(--color-text);
      stroke-width: 2;
      stroke-dasharray: 7 5;
      opacity: 0.8;
    }
    .line {
      fill: none;
      stroke: var(--color-arcane);
      stroke-width: 2.5;
      stroke-linejoin: round;
    }
    .point {
      cursor: pointer;
    }
    .hit {
      fill: transparent;
    }
    .dot {
      fill: var(--color-arcane);
      stroke: var(--color-surface);
      stroke-width: 2;
      transition: r var(--transition);
    }
    .is-over .dot {
      fill: var(--color-accent);
    }
    .is-selected .dot {
      stroke: var(--color-text);
    }
    .value {
      fill: var(--color-text);
      font-size: 13px;
      font-weight: 700;
      font-family: var(--font-sans);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
      color: var(--color-muted);
    }
    .legend__dot {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      background: var(--color-arcane);
    }
    .legend__target {
      width: 1.2rem;
      border-top: 2px dashed var(--color-text);
      margin-left: var(--space-3);
    }
  `,
})
export class FinanceTrend {
  /** Newest first, as the API returns them. */
  readonly months = input.required<MonthSummary[]>();
  readonly stages = input<PlanStage[]>([]);
  readonly selected = input<string | null>(null);
  readonly select = output<string>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;

  protected readonly slots = computed<Slot[]>(() => {
    const newest = this.months()[0]?.month;
    if (!newest) return [];
    const byMonth = new Map(this.months().map((m) => [m.month, m]));
    const slotWidth = (WIDTH - PAD.left - PAD.right) / MONTHS;
    return monthWindow(newest, MONTHS).map((month, i) => ({
      month,
      x: PAD.left + slotWidth * (i + 0.5),
      label: formatShortMonth(month),
      year: i === 0 || month.endsWith('-01') ? month.slice(0, 4) : null,
      summary: byMonth.get(month) ?? null,
      target: targetForMonth(this.stages(), month),
    }));
  });

  private readonly maxDollars = computed(() => {
    const peak = Math.max(
      1,
      ...this.slots().map((s) => Math.max((s.summary?.totalCents ?? 0) / 100, s.target ?? 0)),
    );
    const step = niceStep(peak / 4);
    return Math.ceil(peak / step) * step;
  });

  protected readonly ticks = computed(() => {
    const max = this.maxDollars();
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: this.yFor(max * f),
      label: formatDollars(max * f),
    }));
  });

  protected readonly points = computed(() =>
    this.slots()
      .filter((s): s is Slot & { summary: MonthSummary } => !!s.summary)
      .map((s) => {
        const target = s.summary.target ?? s.target;
        return {
          month: s.month,
          x: s.x,
          y: this.yFor(Math.max(0, s.summary.totalCents / 100)),
          over: target !== null && s.summary.totalCents > target * 100,
          value: formatCents(s.summary.totalCents),
          title:
            `${formatMonth(s.month)}: ${formatCents(s.summary.totalCents)}` +
            (target === null ? '' : ` of ${formatDollars(target)} target`),
        };
      }),
  );

  /** Connects consecutive months only; a month without a statement breaks the line. */
  protected readonly linePath = computed(() => {
    let path = '';
    let previous: string | null = null;
    const window = this.slots().map((s) => s.month);
    for (const point of this.points()) {
      const follows =
        previous !== null && window.indexOf(point.month) === window.indexOf(previous) + 1;
      path += `${follows ? 'L' : 'M'}${point.x},${point.y} `;
      previous = point.month;
    }
    return path.trim();
  });

  /** A step line: flat across each month, stepping where a new stage starts. */
  protected readonly targetPath = computed(() => {
    const slots = this.slots();
    const half = slots.length > 1 ? (slots[1].x - slots[0].x) / 2 : 0;
    let path = '';
    let previous: number | null = null;
    for (const slot of slots) {
      if (slot.target === null) {
        previous = null;
        continue;
      }
      const y = this.yFor(slot.target);
      path += `${previous === null ? 'M' : 'L'}${slot.x - half},${y} L${slot.x + half},${y} `;
      previous = slot.target;
    }
    return path.trim();
  });

  protected readonly description = computed(() => {
    const points = this.points();
    return (
      `Spending per month for the last ${MONTHS} months against the target: ` +
      points.map((p) => p.title).join('; ')
    );
  });

  private yFor(dollars: number): number {
    return PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - dollars / this.maxDollars());
  }
}

/** 1, 2 or 5 × a power of ten, at least `raw`. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((step) => step >= raw)!;
}
