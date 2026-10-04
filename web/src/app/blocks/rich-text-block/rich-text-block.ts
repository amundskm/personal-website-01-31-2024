import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SectionOf } from '../../core/models';
import { PortableTextComponent } from '../../shared/portable-text/portable-text';

@Component({
  selector: 'app-rich-text-block',
  imports: [PortableTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section">
      <div class="container" [class.container--narrow]="block().width !== 'wide'">
        <app-portable-text [value]="block().content" />
      </div>
    </section>
  `,
})
export class RichTextBlock {
  readonly block = input.required<SectionOf<'richTextBlock'>>();
}
