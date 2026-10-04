import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SanityLink } from '../../core/models';
import { resolveLink } from '../../core/paths';

/** Renders a CMS link as a router link or external anchor, optionally styled as a button. */
@Component({
  selector: 'app-cms-link',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (internalPath(); as path) {
      <a [routerLink]="path" [class]="classes()">{{ link()?.label }}</a>
    } @else if (external(); as ext) {
      <a
        [href]="ext.href"
        [class]="classes()"
        [attr.target]="ext.newTab ? '_blank' : null"
        [attr.rel]="ext.newTab ? 'noopener noreferrer' : null"
        >{{ link()?.label }}</a
      >
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class CmsLinkComponent {
  readonly link = input.required<SanityLink | null | undefined>();
  /** Render with button styling, using the link's `style` field. */
  readonly asButton = input(false);
  /** Extra classes to put on the anchor. */
  readonly linkClass = input('');

  private readonly resolved = computed(() => resolveLink(this.link()));

  protected readonly internalPath = computed(() => {
    const r = this.resolved();
    return r?.kind === 'internal' ? r.path : null;
  });

  protected readonly external = computed(() => {
    const r = this.resolved();
    return r?.kind === 'external' ? r : null;
  });

  protected readonly classes = computed(() => {
    const style = this.link()?.style ?? 'primary';
    const button = this.asButton() ? `btn btn--${style}` : '';
    return `${button} ${this.linkClass()}`.trim();
  });
}
