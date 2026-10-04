import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The wizard's hat on its own — the site logo mark. Decorative; label the surrounding link. */
@Component({
  selector: 'app-wizard-hat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M24 4 L35 36 H13 Z"
        stroke-width="2"
        stroke-linejoin="round"
        style="fill: var(--color-border); stroke: var(--color-accent)"
      />
      <path
        d="M8 38 Q24 32 40 38 Q24 43 8 38 Z"
        stroke-width="2"
        stroke-linejoin="round"
        style="fill: var(--color-border); stroke: var(--color-accent)"
      />
      <path
        d="M17 30 Q24 27.5 31 30"
        fill="none"
        stroke-width="2"
        style="stroke: var(--color-accent)"
      />
      <path
        d="M24 13 l1.4 2.8 3 .4 -2.2 2.1 .5 3 -2.7-1.4 -2.7 1.4 .5-3 -2.2-2.1 3-.4 Z"
        style="fill: var(--color-accent-hover)"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      width: 2.25rem;
      height: 2.25rem;
      flex-shrink: 0;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class WizardHat {}
