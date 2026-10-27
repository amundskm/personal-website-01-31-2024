import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  resource,
  signal,
} from '@angular/core';
import { AdminApi, type ImageSummary } from '../admin-api';
import { EditorContext } from '../editor-context';
import { asObject, type JsonObject, withField } from '../schema';

/**
 * An image usage: which image, its alt text (and caption), and the focal point
 * (hotspot) that crops keep in view. Images are uploaded to the library or
 * picked from it.
 */
@Component({
  selector: 'app-image-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './image-field.scss',
  template: `
    <div class="adm-image">
      @if (assetId(); as id) {
        <div class="adm-image__preview">
          <button
            type="button"
            class="adm-image__focus"
            (click)="setFocus($event)"
            title="Click to set the focal point"
          >
            @if (thumbnail(); as thumb) {
              <img [src]="thumb.thumbnailUrl" [alt]="value()?.['alt'] ?? ''" />
            } @else {
              <span class="adm-image__missing">{{ id }}</span>
            }
            <span
              class="adm-image__dot"
              [style.left.%]="focus().x * 100"
              [style.top.%]="focus().y * 100"
              aria-hidden="true"
            ></span>
          </button>
          <div class="adm-image__meta">
            @if (thumbnail(); as thumb) {
              <small>{{ thumb.filename }} · {{ thumb.width }}×{{ thumb.height }}</small>
            }
            <small>Focal point {{ focusLabel() }}</small>
          </div>
        </div>
        <label class="adm-field">
          <span>Alternative text</span>
          <input
            type="text"
            [value]="value()?.['alt'] ?? ''"
            (input)="set('alt', $any($event.target).value)"
          />
          <small>Describe the image for screen readers. Leave empty only for decorative images.</small>
        </label>
        @if (caption()) {
          <label class="adm-field">
            <span>Caption</span>
            <input
              type="text"
              [value]="value()?.['caption'] ?? ''"
              (input)="set('caption', $any($event.target).value)"
            />
          </label>
        }
      }

      <div class="button-row">
        <label class="btn btn--secondary adm-btn-sm">
          {{ uploading() ? 'Uploading…' : assetId() ? 'Replace' : 'Upload' }}
          <input type="file" accept="image/*" hidden (change)="upload($any($event.target))" [disabled]="uploading()" />
        </label>
        <button type="button" class="btn btn--secondary adm-btn-sm" (click)="libraryOpen.set(!libraryOpen())">
          {{ libraryOpen() ? 'Close library' : 'Choose from library' }}
        </button>
        @if (assetId()) {
          <button type="button" class="btn btn--text" (click)="valueChange.emit(undefined)">Remove image</button>
        }
      </div>
      @if (error(); as message) {
        <p class="adm-error" role="alert">{{ message }}</p>
      }

      @if (libraryOpen()) {
        <div class="adm-library">
          @if (library.hasValue()) {
            @for (image of library.value(); track image.id) {
              <button type="button" class="adm-library__item" (click)="choose(image)" [title]="image.filename ?? image.id">
                <img [src]="image.thumbnailUrl" alt="" loading="lazy" />
              </button>
            } @empty {
              <p class="empty">No images yet. Upload one.</p>
            }
          } @else if (library.error()) {
            <p class="adm-error">The library could not be loaded.</p>
          } @else {
            <p class="status">Loading…</p>
          }
        </div>
      }
    </div>
  `,
})
export class ImageField {
  private readonly api = inject(AdminApi);
  private readonly context = inject(EditorContext);

  readonly value = input<JsonObject | undefined>();
  /** Whether the usage has a caption (accessible images) or only alt text. */
  readonly caption = input(false);
  /** Show the library straight away (when picking a new image in a dialog). */
  readonly openLibrary = input(false);
  readonly valueChange = output<JsonObject | undefined>();

  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly libraryOpen = linkedSignal(() => this.openLibrary());

  protected readonly library = resource({
    params: () => (this.libraryOpen() ? {} : undefined),
    loader: () => this.api.images(),
  });

  protected readonly assetId = computed(() => {
    const ref = asObject(this.value()?.['asset'])['_ref'];
    return typeof ref === 'string' ? ref : null;
  });

  protected readonly thumbnail = computed(() => {
    const id = this.assetId();
    return id ? this.context.assets()[id] : undefined;
  });

  protected readonly focus = computed(() => {
    const hotspot = asObject(this.value()?.['hotspot']);
    const x = typeof hotspot['x'] === 'number' ? hotspot['x'] : 0.5;
    const y = typeof hotspot['y'] === 'number' ? hotspot['y'] : 0.5;
    return { x, y };
  });

  protected readonly focusLabel = computed(() => {
    const { x, y } = this.focus();
    return x === 0.5 && y === 0.5 ? '(centre)' : `${Math.round(x * 100)}%, ${Math.round(y * 100)}%`;
  });

  protected set(name: string, text: string): void {
    this.valueChange.emit(withField(this.value() ?? {}, name, text));
  }

  protected setFocus(event: MouseEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    const hotspot = {
      _type: 'sanity.imageHotspot',
      x: round((event.clientX - box.left) / box.width),
      y: round((event.clientY - box.top) / box.height),
      width: 0.3,
      height: 0.3,
    };
    this.valueChange.emit({ ...(this.value() ?? {}), hotspot });
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.choose(await this.api.upload(file));
      this.library.reload();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      this.uploading.set(false);
    }
  }

  /** Uses an image, dropping the crop and focal point chosen for the previous one. */
  protected choose(image: ImageSummary): void {
    this.context.addAssets({ [image.id]: image });
    const { crop: _crop, hotspot: _hotspot, ...rest } = this.value() ?? {};
    this.valueChange.emit({
      _type: this.caption() ? 'accessibleImage' : 'image',
      ...rest,
      asset: { _type: 'reference', _ref: image.id },
    });
    this.libraryOpen.set(false);
  }
}
