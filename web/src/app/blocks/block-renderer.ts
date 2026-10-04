import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  isDevMode,
  type Type,
} from '@angular/core';
import type { PageSection } from '../core/models';
import { BLOCK_REGISTRY } from './block-registry';

interface RenderedSection {
  key: string;
  component: Type<unknown>;
  inputs: { block: PageSection };
}

/** Renders a page's `sections` array by looking up a component for each block type. */
@Component({
  selector: 'app-block-renderer',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of rendered(); track section.key) {
      <ng-container *ngComponentOutlet="section.component; inputs: section.inputs" />
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class BlockRenderer {
  readonly sections = input<readonly PageSection[] | null | undefined>([]);
  /** Overridable for tests; defaults to the app's block registry. */
  readonly registry = input<Partial<Record<string, Type<unknown>>>>(BLOCK_REGISTRY);

  protected readonly rendered = computed<RenderedSection[]>(() => {
    const registry = this.registry();
    return (this.sections() ?? []).flatMap((block) => {
      const component = registry[block._type];
      if (!component) {
        if (isDevMode())
          console.warn(`[BlockRenderer] No component registered for block "${block._type}"`);
        return [];
      }
      return [{ key: block._key, component, inputs: { block } }];
    });
  });
}
