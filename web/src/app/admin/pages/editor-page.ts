import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/auth/auth.service';
import { AdminApi, type DocumentStatus, type EditableDocument } from '../admin-api';
import { EditorContext } from '../editor-context';
import { AdminField } from '../fields/admin-field';
import { type Field, type JsonObject, newObject, withField } from '../schema';
import { type Collection, DOCUMENTS, SETTINGS_FIELDS, SPENDING_PLAN_FIELDS } from '../schemas';
import { StatusBadge } from './status-badge';

/** What the editor edits, from the route's data. */
export type EditorMode = 'document' | 'settings' | 'spending-plan';

/**
 * Edits one document, the site settings or the spending plan. Saving stores a
 * draft (except the spending plan, which saves directly); Publish makes drafts
 * live.
 */
@Component({
  selector: 'app-editor-page',
  imports: [RouterLink, AdminField, StatusBadge],
  providers: [EditorContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header adm-header">
      <div>
        @if (mode() === 'document') {
          <a [routerLink]="['/admin', collection()]" class="back-link">← {{ schema()?.title }}</a>
        }
        <h1>{{ heading() }}</h1>
        @if (status(); as s) {
          <app-status-badge [status]="s" />
        }
      </div>
      @if (sitePath(); as path) {
        <a [href]="path" target="_blank" rel="noopener" class="btn btn--text">View on site ↗</a>
      }
    </header>

    @if (loadError(); as message) {
      <p class="adm-error" role="alert">{{ message }}</p>
    } @else if (doc(); as document) {
      <form class="adm-form" (submit)="$event.preventDefault(); save()">
        @for (field of visibleFields(); track field.name) {
          <app-admin-field [field]="field" [value]="document[field.name]" [parent]="document"
            (valueChange)="set(field.name, $event)" />
        }

        <div class="adm-toolbar">
          @if (error(); as message) {
            <p class="adm-error" role="alert">{{ message }}</p>
          }
          @if (notice(); as message) {
            <p class="adm-notice" role="status">{{ message }}</p>
          }
          <div class="button-row">
            <button type="submit" class="btn btn--primary" [disabled]="saving() || !dirty()">
              {{ saving() ? 'Saving…' : mode() === 'spending-plan' ? 'Save' : 'Save draft' }}
            </button>
            @if (status() === 'changed' || status() === 'deleted') {
              <button type="button" class="btn btn--secondary" (click)="discard()" [disabled]="saving()">
                {{ status() === 'deleted' ? 'Keep it (undo delete)' : 'Discard draft' }}
              </button>
            }
            @if (mode() === 'document' && id() !== 'new' && status() !== 'deleted') {
              <button type="button" class="btn btn--text adm-danger" (click)="remove()" [disabled]="saving()">Delete</button>
            }
          </div>
          @if (mode() !== 'spending-plan') {
            <small class="adm-help">Drafts are only visible here. <a routerLink="/admin">Publish</a> to put them on the site.</small>
          }
        </div>
      </form>
    } @else {
      <p class="status">Loading…</p>
    }
  `,
})
export class EditorPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly context = inject(EditorContext);

  /** From the route's data. */
  readonly mode = input<EditorMode>('document');
  readonly collection = input<Collection>('pages');
  /** From the route; "new" for a new document. */
  readonly id = input<string>();

  protected readonly schema = computed(() => (this.mode() === 'document' ? DOCUMENTS[this.collection()] : null));

  private readonly fields = computed<Field[]>(() => {
    switch (this.mode()) {
      case 'settings':
        return SETTINGS_FIELDS;
      case 'spending-plan':
        return SPENDING_PLAN_FIELDS;
      default:
        return this.schema()!.fields;
    }
  });

  protected readonly doc = signal<JsonObject | null>(null);
  /** The document as last loaded or saved, to tell whether there are unsaved edits. */
  private readonly saved = signal('');
  protected readonly status = signal<DocumentStatus | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  readonly dirty = computed(() => !!this.doc() && JSON.stringify(this.doc()) !== this.saved());

  protected readonly visibleFields = computed(() => {
    const doc = this.doc() ?? {};
    return this.fields().filter((field) => !field.hidden?.(doc));
  });

  protected readonly heading = computed(() => {
    switch (this.mode()) {
      case 'settings':
        return 'Site settings';
      case 'spending-plan':
        return 'Spending plan';
      default: {
        const title = this.doc()?.['title'];
        return typeof title === 'string' && title ? title : `New ${this.schema()!.singular}`;
      }
    }
  });

  protected readonly sitePath = computed(() =>
    this.mode() === 'document' && this.status() && this.status() !== 'new' && this.doc()
      ? this.schema()!.path(this.doc()!)
      : null,
  );

  constructor() {
    // (Re)load whenever the route changes
    effect(() => {
      const mode = this.mode();
      const collection = this.collection();
      const id = this.id();
      untracked(() => void this.load(mode, collection, id));
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnOnLeave(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  protected set(name: string, value: JsonObject[string] | undefined): void {
    this.doc.update((doc) => withField(doc ?? {}, name, value));
    this.notice.set(null);
  }

  private async load(mode: EditorMode, collection: Collection, id: string | undefined): Promise<void> {
    this.doc.set(null);
    this.loadError.set(null);
    this.error.set(null);
    try {
      if (mode === 'document' && id === 'new') {
        const { _key, ...fresh } = newObject({ fields: DOCUMENTS[collection].fields });
        this.apply({ document: fresh });
        this.saved.set('');
        return;
      }
      const loaded =
        mode === 'settings'
          ? await this.api.settings()
          : mode === 'spending-plan'
            ? await this.api.spendingPlan()
            : await this.api.get(collection, id!);
      if (!loaded) this.loadError.set('This document does not exist.');
      else this.apply(loaded);
    } catch {
      this.loadError.set('This document could not be loaded.');
    }
  }

  private apply(loaded: EditableDocument): void {
    this.context.addAssets(loaded.assets);
    this.doc.set(loaded.document);
    this.saved.set(JSON.stringify(loaded.document));
    this.status.set(loaded.status);
  }

  protected async save(): Promise<void> {
    const doc = this.doc();
    if (!doc) return;
    await this.run(async () => {
      switch (this.mode()) {
        case 'settings':
          this.apply(await this.api.saveSettings(doc));
          break;
        case 'spending-plan':
          this.apply(await this.api.saveSpendingPlan(doc));
          this.notice.set('Saved.');
          return;
        default:
          if (this.id() === 'new') {
            const created = await this.api.create(this.collection(), doc);
            this.apply(created);
            await this.router.navigate(['/admin', this.collection(), created.id], { replaceUrl: true });
            return;
          }
          this.apply(await this.api.save(this.collection(), this.id()!, doc));
      }
      this.notice.set('Draft saved.');
    });
  }

  protected async discard(): Promise<void> {
    if (!confirm('Throw away the unpublished changes?')) return;
    await this.run(async () => {
      this.apply(
        this.mode() === 'settings'
          ? await this.api.discardSettings()
          : await this.api.discard(this.collection(), this.id()!),
      );
    });
  }

  protected async remove(): Promise<void> {
    const live = this.status() !== 'new';
    if (!confirm(live ? 'Delete this when you next publish?' : 'Delete this draft for good?')) return;
    await this.run(async () => {
      const pending = await this.api.remove(this.collection(), this.id()!);
      this.saved.set(JSON.stringify(this.doc()));
      if (pending) this.apply(pending);
      else await this.router.navigate(['/admin', this.collection()]);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      this.saving.set(false);
    }
  }
}
