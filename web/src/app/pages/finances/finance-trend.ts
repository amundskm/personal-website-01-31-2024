import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { MonthSummary } from '../../core/finances/finances';
import { formatCents, formatDollars, formatMonth, formatShortMonth } from './format';

const WIDTH = 560;
const HEIGHT = 200;
const PAD = { top: 16, right: 8, bottom: 28, left: 52 };
const MAX_MONTHS = 12;

/** Monthly spending as columns, each with its target marked; click a column to select that month. */
@Component({
  selector: 'app-finance-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      role="img"
      [attr.aria-label]="'Monthly spending for the last ' + bars().length + ' statements'"
    >
      @for (tick of ticks(); track tick.y) {
        <line
          class="grid"
          [attr.x1]="pad.left"
          [attr.x2]="width - pad.right"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
        />
        <text class="axis" [attr.x]="pad.left - 8" [attr.y]="tick.y + 4" text-anchor="end">
          {{ tick.label }}
        </text>
      }
      @for (bar of bars(); track bar.month) {
        <g
          class="bar"
          [class.is-over]="bar.over"
          [class.is-selected]="bar.month === selected()"
          (click)="select.emit(bar.month)"
        >
          <title>{{ bar.title }}</title>
          <rect
            class="hit"
            [attr.x]="bar.x - bar.gap / 2"
            [attr.y]="pad.top"
            [attr.width]="bar.width + bar.gap"
            [attr.height]="plotHeight"
          />
          <rect
            class="fill"
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.width"
            [attr.height]="bar.height"
            rx="3"
          />
          @if (bar.targetY !== null) {
            <line
              class="target"
              [attr.x1]="bar.x - 3"
              [attr.x2]="bar.x + bar.width + 3"
              [attr.y1]="bar.targetY"
              [attr.y2]="bar.targetY"
            />
          }
          <text
            class="axis"
            [attr.x]="bar.x + bar.width / 2"
            [attr.y]="height - 8"
            text-anchor="middle"
          >
            {{ bar.label }}
          </text>
        </g>
      }
    </svg>
    <p class="legend"><span class="legend__target"></span> Target</p>
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
    }
    .axis {
      fill: var(--color-muted);
      font-size: 12px;
      font-family: var(--font-sans);
    }
    .bar {
      cursor: pointer;
    }
    .hit {
      fill: transparent;
    }
    .fill {
      fill: var(--color-arcane);
      opacity: 0.55;
      transition: opacity var(--transition);
    }
    .is-over .fill {
      fill: var(--color-accent);
    }
    .bar:hover .fill,
    .is-selected .fill {
      opacity: 1;
    }
    .is-selected .axis {
      fill: var(--color-text);
      font-weight: 700;
    }
    .target {
      stroke: var(--color-text);
      stroke-width: 2;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
      color: var(--color-muted);
    }
    .legend__target {
      width: 1rem;
      height: 2px;
      background: var(--color-text);
    }
  `,
})
export class FinanceTrend {
  /** Newest first, as the API returns them. */
  readonly months = input.required<MonthSummary[]>();
  readonly selected = input<string | null>(null);
  readonly select = output<string>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly pad = PAD;
  protected readonly plotHeight = HEIGHT - PAD.top - PAD.bottom;

  private readonly shown = computed(() => this.months().slice(0, MAX_MONTHS).reverse());

  private readonly maxDollars = computed(() => {
    const peak = Math.max(
      1,
      ...this.shown().map((m) => Math.max(m.totalCents / 100, m.target ?? 0)),
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

  protected readonly bars = computed(() => {
    const months = this.shown();
    const slot = (WIDTH - PAD.left - PAD.right) / Math.max(months.length, 1);
    const width = Math.min(48, slot * 0.6);
    return months.map((m, i) => {
      const dollars = Math.max(0, m.totalCents / 100);
      const y = this.yFor(dollars);
      const over = m.target !== null && dollars > m.target;
      return {
        month: m.month,
        x: PAD.left + slot * i + (slot - width) / 2,
        y,
        width,
        gap: slot - width,
        height: this.yFor(0) - y,
        targetY: m.target === null ? null : this.yFor(m.target),
        over,
        label: formatShortMonth(m.month),
        title:
          `${formatMonth(m.month)}: ${formatCents(m.totalCents)}` +
          (m.target === null ? '' : ` of ${formatDollars(m.target)} target`),
      };
    });
  });

  private yFor(dollars: number): number {
    return PAD.top + this.plotHeight * (1 - dollars / this.maxDollars());
  }
}

/** 1, 2 or 5 × a power of ten, at least `raw`. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((step) => step >= raw)!;
}
