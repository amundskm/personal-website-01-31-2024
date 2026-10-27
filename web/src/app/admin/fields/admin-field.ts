import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  asList,
  asObject,
  type Field,
  type FieldOf,
  type Json,
  type JsonObject,
  newKey,
  newObject,
  type ObjectType,
  slugify,
  withField,
} from '../schema';
import { ImageField } from './image-field';
import { ImagePickerDialog } from './image-picker-dialog';
import { ReferenceSelect } from './reference-select';
import { RichTextField } from './rich-text-field';
import { TagsField } from './tags-field';

/**
 * One form field, rendered from its schema. Objects and lists render their
 * fields with this same component, so a whole document is one tree of these.
 * Values flow down; every change emits a new value for the parent to store.
 */
@Component({
  selector: 'app-admin-field',
  imports: [NgTemplateOutlet, ImageField, ImagePickerDialog, ReferenceSelect, RichTextField, TagsField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = field();
    @switch (f.kind) {
      @case ('boolean') {
        <label class="adm-check">
          <input type="checkbox" [checked]="value() === true" (change)="emit($any($event.target).checked || undefined)" />
          {{ f.title }}
        </label>
        @if (f.help) {
          <small class="adm-help">{{ f.help }}</small>
        }
      }
      @case ('object') {
        <details class="adm-group" [open]="!asField('object').collapsed">
          <summary>{{ f.title }}</summary>
          @for (child of visible(asField('object').fields, object()); track child.name) {
            <app-admin-field [field]="child" [value]="object()[child.name]" [parent]="object()" [path]="id()"
              (valueChange)="emit(withField(object(), child.name, $event))" />
          }
        </details>
      }
      @default {
        <div class="adm-field">
          <label [for]="id()">{{ f.title }}@if (f.required) {<span class="adm-required" aria-hidden="true"> *</span>}</label>
          @switch (f.kind) {
            @case ('text') {
              <textarea [id]="id()" [rows]="asField('text').rows ?? 3" [value]="string()"
                (input)="emit($any($event.target).value)"></textarea>
            }
            @case ('slug') {
              <div class="adm-slug">
                @if (asField('slug').prefix; as prefix) {
                  <span class="adm-slug__prefix">{{ prefix }}</span>
                }
                <input [id]="id()" type="text" [value]="string()" (input)="emit($any($event.target).value)" />
                <button type="button" class="btn btn--secondary adm-btn-sm" (click)="generateSlug()">From title</button>
              </div>
            }
            @case ('number') {
              <input [id]="id()" type="number" [value]="value() ?? ''"
                (input)="emitNumber($any($event.target).value)" />
            }
            @case ('datetime') {
              <input [id]="id()" type="datetime-local" [value]="localDateTime()"
                (change)="emitDateTime($any($event.target).value)" />
            }
            @case ('date') {
              <input [id]="id()" type="date" [value]="string()" (change)="emit($any($event.target).value)" />
            }
            @case ('select') {
              @if (asField('select').radio) {
                <div class="adm-options" role="radiogroup" [attr.aria-labelledby]="id()">
                  @for (option of asField('select').options; track option.value) {
                    <label class="adm-check">
                      <input type="radio" [name]="id()" [checked]="value() === option.value"
                        (change)="emit(option.value)" />
                      {{ option.title }}
                    </label>
                  }
                </div>
              } @else {
                <select [id]="id()" (change)="emitOption($any($event.target).selectedIndex)">
                  <option [selected]="value() === undefined">— Choose —</option>
                  @for (option of asField('select').options; track option.value) {
                    <option [selected]="value() === option.value">{{ option.title }}</option>
                  }
                </select>
              }
            }
            @case ('checkboxes') {
              <div class="adm-options">
                @for (option of asField('checkboxes').options; track option.value) {
                  <label class="adm-check">
                    <input type="checkbox" [checked]="list().includes(option.value)"
                      (change)="toggle(option.value, $any($event.target).checked)" />
                    {{ option.title }}
                  </label>
                }
              </div>
            }
            @case ('tags') {
              <app-tags-field [inputId]="id()" [value]="strings()" (valueChange)="emitList($event)" />
            }
            @case ('image') {
              <app-image-field [value]="optionalObject()" [caption]="!!asField('image').caption"
                (valueChange)="emit($event)" />
            }
            @case ('reference') {
              <app-reference-select [inputId]="id()" [to]="asField('reference').to" [value]="ref(value())"
                (valueChange)="emit($event ? { _type: 'reference', _ref: $event } : undefined)" />
            }
            @case ('richText') {
              <app-rich-text-field [value]="value()" (valueChange)="emitList($event ?? [])" />
            }
            @case ('references') {
              <ol class="adm-list">
                @for (item of list(); track key(item, $index); let i = $index, first = $first, last = $last) {
                  <li class="adm-row">
                    <app-reference-select [inputId]="id() + '-' + i" [to]="asField('references').to" [value]="ref(item)"
                      (valueChange)="replace(i, { _key: key(item, i), _type: 'reference', _ref: $event ?? '' })" />
                    <ng-container *ngTemplateOutlet="moveButtons; context: { i, first, last }" />
                  </li>
                }
              </ol>
              <button type="button" class="btn btn--secondary adm-btn-sm"
                (click)="append({ _key: newKey(), _type: 'reference', _ref: '' })">Add</button>
            }
            @case ('images') {
              <ol class="adm-list adm-list--grid">
                @for (item of list(); track key(item, $index); let i = $index, first = $first, last = $last) {
                  <li class="adm-card">
                    <app-image-field [value]="asObject(item)" [caption]="true"
                      (valueChange)="$event ? replace(i, $event) : removeAt(i)" />
                    <ng-container *ngTemplateOutlet="moveButtons; context: { i, first, last }" />
                  </li>
                }
              </ol>
              <button type="button" class="btn btn--secondary adm-btn-sm" (click)="galleryPicker.show()">Add image</button>
              <app-image-picker-dialog #galleryPicker (picked)="addImage($event)" />
            }
            @case ('list') {
              <ng-container *ngTemplateOutlet="items; context: { types: [asField('list').of] }" />
            }
            @case ('blocks') {
              <ng-container *ngTemplateOutlet="items; context: { types: asField('blocks').of }" />
            }
            @default {
              <input [id]="id()" [type]="f.kind === 'url' ? 'url' : 'text'" [value]="string()"
                (input)="emit($any($event.target).value)" />
            }
          }
          @if (f.help) {
            <small class="adm-help">{{ f.help }}</small>
          }
        </div>
      }
    }

    <!-- Lists of objects (one type) and sections (several types) -->
    <ng-template #items let-types="types">
      <ol class="adm-list">
        @for (item of list(); track key(item, $index); let i = $index, first = $first, last = $last) {
          @let object = asObject(item);
          @let type = typeOf(types, object);
          <li class="adm-card">
            <div class="adm-card__header">
              <button type="button" class="adm-card__toggle" [attr.aria-expanded]="isOpen(object, i)"
                (click)="toggleOpen(object, i)">
                <span class="adm-card__type">{{ type?.title ?? 'Unknown: ' + object['_type'] }}</span>
                <span class="adm-card__summary">{{ type?.summary?.(object) }}</span>
              </button>
              <ng-container *ngTemplateOutlet="moveButtons; context: { i, first, last }" />
            </div>
            @if (type && isOpen(object, i)) {
              <div class="adm-card__body">
                @for (child of visible(type.fields, object); track child.name) {
                  <app-admin-field [field]="child" [value]="object[child.name]" [parent]="object"
                    [path]="id() + '-' + i" (valueChange)="replace(i, withField(object, child.name, $event))" />
                }
              </div>
            }
          </li>
        }
      </ol>
      @if (types.length === 1) {
        <button type="button" class="btn btn--secondary adm-btn-sm" (click)="add(types[0])">Add {{ types[0].title.toLowerCase() }}</button>
      } @else {
        <div class="adm-add">
          <select #choice [attr.aria-label]="'Section type to add'">
            @for (type of types; track type.type) {
              <option [value]="$index">{{ type.title }}</option>
            }
          </select>
          <button type="button" class="btn btn--secondary adm-btn-sm" (click)="add(types[+choice.value])">Add section</button>
        </div>
      }
    </ng-template>

    <ng-template #moveButtons let-i="i" let-first="first" let-last="last">
      <span class="adm-move">
        <button type="button" (click)="move(i, -1)" [disabled]="first" aria-label="Move up">↑</button>
        <button type="button" (click)="move(i, 1)" [disabled]="last" aria-label="Move down">↓</button>
        <button type="button" (click)="removeAt(i)" aria-label="Remove">✕</button>
      </span>
    </ng-template>
  `,
})
export class AdminField {
  readonly field = input.required<Field>();
  readonly value = input<Json | undefined>();
  /** The object this field belongs to (for `hidden` and slug sources). */
  readonly parent = input<JsonObject>({});
  /** Makes element ids unique within the form. */
  readonly path = input('f');
  readonly valueChange = output<Json | undefined>();

  protected readonly withField = withField;
  protected readonly asObject = asObject;
  protected readonly newKey = newKey;

  protected readonly id = computed(() => `${this.path()}-${this.field().name}`);
  protected readonly object = computed(() => asObject(this.value()));
  protected readonly optionalObject = computed(() => (this.value() === undefined ? undefined : this.object()));
  protected readonly list = computed(() => asList(this.value()));
  protected readonly string = computed(() => (typeof this.value() === 'string' ? (this.value() as string) : ''));
  protected readonly strings = computed(() => this.list().filter((item): item is string => typeof item === 'string'));

  /** Items opened in a list, by key. New items open; existing ones start collapsed. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** The field narrowed to its kind, for the template. */
  protected asField<K extends Field['kind']>(_kind: K): FieldOf<K> {
    return this.field() as FieldOf<K>;
  }

  protected visible(fields: Field[], parent: JsonObject): Field[] {
    return fields.filter((field) => !field.hidden?.(parent));
  }

  /** Empty text counts as no value. */
  protected emit(value: Json | undefined): void {
    this.valueChange.emit(value === '' ? undefined : value);
  }

  protected emitList(value: Json[]): void {
    this.emit(value.length ? value : undefined);
  }

  protected emitNumber(text: string): void {
    this.emit(text === '' ? undefined : Number(text));
  }

  protected emitOption(index: number): void {
    // Index 0 is "— Choose —"
    this.emit(index ? this.asField('select').options[index - 1].value : undefined);
  }

  protected toggle(option: string | number, checked: boolean): void {
    const rest = this.list().filter((value) => value !== option);
    this.emitList(checked ? [...rest, option] : rest);
  }

  protected generateSlug(): void {
    const source = this.parent()[this.asField('slug').source];
    if (typeof source === 'string') this.emit(slugify(source));
  }

  // Datetimes are stored as ISO strings (UTC) and edited in local time
  protected readonly localDateTime = computed(() => {
    const date = new Date(this.string());
    if (!this.string() || Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  });

  protected emitDateTime(local: string): void {
    this.emit(local ? new Date(local).toISOString() : undefined);
  }

  protected ref(value: Json | undefined): string | undefined {
    const ref = asObject(value)['_ref'];
    return typeof ref === 'string' && ref ? ref : undefined;
  }

  // List editing

  protected key(item: Json, index: number): string {
    const key = asObject(item)['_key'];
    return typeof key === 'string' ? key : `index-${index}`;
  }

  protected typeOf(types: ObjectType[], item: JsonObject): ObjectType | undefined {
    return types.length === 1 ? types[0] : types.find((type) => type.type === item['_type']);
  }

  protected isOpen(item: JsonObject, index: number): boolean {
    return this.opened().has(this.key(item, index));
  }

  protected toggleOpen(item: JsonObject, index: number): void {
    const key = this.key(item, index);
    const next = new Set(this.opened());
    if (!next.delete(key)) next.add(key);
    this.opened.set(next);
  }

  protected add(type: ObjectType): void {
    const item = newObject(type);
    this.opened.set(new Set(this.opened()).add(item['_key'] as string));
    this.append(item);
  }

  /** Adds a picked image to a gallery. */
  protected addImage(image: JsonObject): void {
    this.append({ _key: newKey(), _type: 'accessibleImage', ...image });
  }

  protected append(item: Json): void {
    this.emit([...this.list(), item]);
  }

  protected replace(index: number, item: Json): void {
    this.emit(this.list().map((existing, i) => (i === index ? item : existing)));
  }

  protected removeAt(index: number): void {
    this.emitList(this.list().filter((_, i) => i !== index));
  }

  protected move(index: number, by: -1 | 1): void {
    const items = [...this.list()];
    const [item] = items.splice(index, 1);
    items.splice(index + by, 0, item);
    this.emit(items);
  }
}
