import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { initials } from '../../core/events/profile';

/** A member's photo, or their initials on a colored circle. */
@Component({
  selector: 'app-member-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url() && !failed()) {
      <img
        [src]="url()"
        alt=""
        [width]="size()"
        [height]="size()"
        loading="lazy"
        (error)="failed.set(true)"
      />
    } @else {
      <span [style.background]="color()">{{ letters() }}</span>
    }
  `,
  host: { 'aria-hidden': 'true', '[style.--size.px]': 'size()' },
  styles: `
    :host {
      display: inline-grid;
      flex: none;
      width: var(--size);
      height: var(--size);
      vertical-align: middle;
    }
    img,
    span {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }
    img {
      object-fit: cover;
    }
    span {
      display: grid;
      place-items: center;
      font-size: calc(var(--size) * 0.4);
      font-weight: 700;
      line-height: 1;
      color: var(--color-accent-contrast);
    }
  `,
})
export class MemberAvatar {
  readonly name = input.required<string>();
  readonly url = input<string | null | undefined>(null);
  readonly size = input(32);

  protected readonly failed = signal(false);
  protected readonly letters = computed(() => initials(this.name()));
  /** A stable color per name, from the site's palette. */
  protected readonly color = computed(() => {
    const palette = ['#e0ad4c', '#b99cf5', '#7fc4b8', '#e58f7a', '#9cc3f5', '#d9c27a'];
    const hash = [...this.name()].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7);
    return palette[hash % palette.length];
  });
}
