import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The site mascot: a line-art wizard with a starry hat, long beard and a
 * glowing staff, framed by twinkling stars. Decorative only.
 */
@Component({
  selector: 'app-wizard-mascot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 300 300" aria-hidden="true" focusable="false">
      <g>
        <path
          class="star"
          d="M60 70 l4 9 10 1 -7.5 7 2 10 -8.5-5 -8.5 5 2-10 -7.5-7 10-1 Z"
          style="fill: var(--gold-hi)"
        />
        <path
          class="star"
          d="M240 60 l3 6 7 1 -5 5 1.5 7 -6.5-3.5 -6.5 3.5 1.5-7 -5-5 7-1 Z"
          style="fill: var(--parchment)"
        />
        <path
          class="star"
          d="M250 190 l2.5 5 5.5 .8 -4 3.8 1 5.5 -5-2.6 -5 2.6 1-5.5 -4-3.8 5.5-.8 Z"
          style="fill: var(--arcane)"
        />
        <path
          class="star"
          d="M45 200 l2 4 4.5.6 -3.2 3.1 .8 4.4 -4.1-2.1 -4.1 2.1 .8-4.4 -3.2-3.1 4.5-.6 Z"
          style="fill: var(--gold-hi)"
        />
      </g>

      <!-- Staff -->
      <line
        x1="218"
        y1="96"
        x2="196"
        y2="272"
        stroke-width="6"
        stroke-linecap="round"
        style="stroke: var(--mist)"
      />
      <circle class="orb" cx="220" cy="84" r="16" opacity="0.9" style="fill: var(--arcane)" />
      <circle
        cx="220"
        cy="84"
        r="26"
        fill="none"
        stroke-width="1.5"
        stroke-dasharray="3 5"
        opacity="0.7"
        style="stroke: var(--arcane)"
      />

      <!-- Robe, with a stitched seam -->
      <path
        d="M150 140 C115 150 96 205 88 272 H212 C204 205 185 150 150 140 Z"
        stroke-width="3"
        stroke-linejoin="round"
        style="fill: var(--wash); stroke: var(--gold)"
      />
      <path d="M150 150 V272" stroke-width="2" stroke-dasharray="6 6" style="stroke: var(--gold)" />

      <!-- Beard -->
      <path
        d="M128 128 C126 170 140 200 150 214 C160 200 174 170 172 128 Z"
        style="fill: var(--parchment)"
      />
      <path
        d="M140 150 Q150 160 160 150"
        fill="none"
        stroke-width="2"
        style="stroke: var(--mist)"
      />

      <!-- Face in the shadow of the brim -->
      <ellipse cx="150" cy="122" rx="20" ry="9" style="fill: var(--shadow)" />
      <circle class="eye" cx="142" cy="121" r="2.6" style="fill: var(--gold-hi)" />
      <circle class="eye" cx="158" cy="121" r="2.6" style="fill: var(--gold-hi)" />

      <!-- Hat -->
      <path
        d="M150 20 C160 50 178 82 196 108 H104 C122 82 138 50 150 20 Z"
        stroke-width="3"
        stroke-linejoin="round"
        style="fill: var(--indigo); stroke: var(--gold)"
      />
      <path
        d="M84 112 Q150 94 216 112 Q150 128 84 112 Z"
        stroke-width="3"
        stroke-linejoin="round"
        style="fill: var(--indigo); stroke: var(--gold)"
      />
      <path d="M118 98 Q150 90 182 98" fill="none" stroke-width="5" style="stroke: var(--gold)" />
      <path
        d="M150 52 l3 6.5 7 .9 -5.2 4.8 1.4 7 -6.2-3.4 -6.2 3.4 1.4-7 -5.2-4.8 7-.9 Z"
        style="fill: var(--gold-hi)"
      />
      <circle cx="132" cy="80" r="2.5" style="fill: var(--parchment)" />
      <circle cx="166" cy="72" r="2" style="fill: var(--parchment)" />
    </svg>
  `,
  styleUrl: './wizard-mascot.scss',
})
export class WizardMascot {}
