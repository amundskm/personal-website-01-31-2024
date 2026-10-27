import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** A list of short strings, entered one at a time (Enter or comma adds). */
@Component({
  selector: 'app-tags-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tags-field.scss',
  template: `
    <div class="adm-tags">
      @for (tag of value(); track $index) {
        <span class="adm-tag">
          {{ tag }}
          <button type="button" (click)="remove($index)" [attr.aria-label]="'Remove ' + tag">×</button>
        </span>
      }
      <input
        [id]="inputId()"
        type="text"
        placeholder="Add…"
        (keydown)="key($event)"
        (blur)="commit($any($event.target))"
      />
    </div>
  `,
})
export class TagsField {
  readonly value = input.required<string[]>();
  readonly inputId = input.required<string>();
  readonly valueChange = output<string[]>();

  protected key(event: KeyboardEvent): void {
    const target = event.target as HTMLInputElement;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit(target);
    } else if (event.key === 'Backspace' && !target.value && this.value().length) {
      this.remove(this.value().length - 1);
    }
  }

  protected commit(target: HTMLInputElement): void {
    const tag = target.value.trim();
    target.value = '';
    if (tag && !this.value().includes(tag)) this.valueChange.emit([...this.value(), tag]);
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }
}
