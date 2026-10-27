import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { asList, type Json, richTextSummary } from '../schema';

/** Portable Text. Placeholder until the WYSIWYG editor lands (phase 4, step 3). */
@Component({
  selector: 'app-rich-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="adm-placeholder">
      {{ blocks() }} block(s){{ summary() ? ': "' + summary() + '…"' : '' }}. The text editor is coming next.
    </p>
  `,
})
export class RichTextField {
  readonly value = input<Json | undefined>();
  readonly valueChange = output<Json[] | undefined>();

  protected readonly blocks = computed(() => asList(this.value()).length);
  protected readonly summary = computed(() => richTextSummary(this.value()).slice(0, 60));
}
