import { inject, Injectable, resource, signal } from '@angular/core';
import { AdminApi, type ImageSummary } from './admin-api';

/**
 * Shared by every field in one editor (provided by the editor page): the
 * thumbnails of images the document uses, and what links can point at.
 */
@Injectable()
export class EditorContext {
  private readonly api = inject(AdminApi);

  /** Thumbnails by asset id: from the loaded document, plus new uploads. */
  readonly assets = signal<Record<string, ImageSummary>>({});

  readonly linkTargets = resource({ loader: () => this.api.linkTargets() });

  addAssets(assets: Record<string, ImageSummary> | undefined): void {
    if (assets) this.assets.update((known) => ({ ...known, ...assets }));
  }
}
