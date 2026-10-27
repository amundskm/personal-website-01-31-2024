import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { EditorContext } from '../editor-context';
import type { LinkTargetType } from '../schema';

const TYPE_TITLES: Record<LinkTargetType, string> = { page: 'Pages', post: 'Blog posts', project: 'Projects' };

/** Picks a page, post or project. The value is its id (a reference's `_ref`). */
@Component({
  selector: 'app-reference-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Options mark themselves selected: they load after the select renders -->
    <select [id]="inputId()" (change)="select($any($event.target).value)">
      <option value="" [selected]="!value()">— Choose —</option>
      @if (missing()) {
        <option [value]="value()" selected>(missing or deleted)</option>
      }
      @for (group of groups(); track group.type) {
        <optgroup [label]="group.title">
          @for (target of group.targets; track target.id) {
            <option [value]="target.id" [selected]="target.id === value()">
              {{ target.title }}{{ target.status === 'new' ? ' (unpublished)' : '' }}
            </option>
          }
        </optgroup>
      }
    </select>
  `,
})
export class ReferenceSelect {
  private readonly context = inject(EditorContext);

  readonly value = input<string | undefined>();
  readonly to = input.required<LinkTargetType[]>();
  readonly inputId = input.required<string>();
  readonly valueChange = output<string | undefined>();

  private readonly targets = computed(() =>
    this.context.linkTargets.hasValue() ? this.context.linkTargets.value() : [],
  );

  protected readonly groups = computed(() =>
    this.to().map((type) => ({
      type,
      title: TYPE_TITLES[type],
      targets: this.targets().filter((target) => target.type === type),
    })),
  );

  protected readonly missing = computed(
    () =>
      !!this.value() &&
      this.context.linkTargets.hasValue() &&
      !this.targets().some((target) => target.id === this.value()),
  );

  protected select(id: string): void {
    this.valueChange.emit(id || undefined);
  }
}
