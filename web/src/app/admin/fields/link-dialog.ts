import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { documentPath } from '../../core/paths';
import { EditorContext } from '../editor-context';
import { closeDialog, showDialog } from './image-dialog';

export interface LinkValue {
  text: string;
  href: string;
  newTab: boolean;
}

/**
 * The link for what someone typed, the way people usually type it:
 * "example.com" → https://example.com, an email address → mailto:, a phone
 * number → tel:. Full addresses and site paths (/about) are kept. Returns null
 * when it can't be a link, including other schemes such as javascript:.
 */
export function normalizeHref(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(text) || text.startsWith('/')) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text)) return `mailto:${text}`;
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return `tel:${text.replace(/[^\d+]/g, '')}`;
  if (/^[^\s/]+\.[a-z]{2,}([/?#]\S*)?$/i.test(text)) return `https://${text}`;
  return null;
}

/**
 * Add or edit a link: the text to show and where it goes (an address, or a
 * page on this site). No <form>: it sits inside the editor page's form, and a
 * nested form's submit would save the draft.
 */
@Component({
  selector: 'app-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="adm-dialog" aria-labelledby="link-dialog-title">
      <h2 id="link-dialog-title">{{ editing() ? 'Edit link' : 'Add a link' }}</h2>
      <div class="adm-field">
        <label for="link-dialog-text">Text</label>
        <input #text id="link-dialog-text" type="text" (keydown.enter)="$event.preventDefault(); apply()" />
      </div>
      <div class="adm-field">
        <label for="link-dialog-url">Web address</label>
        <input
          #url
          id="link-dialog-url"
          type="text"
          placeholder="example.com"
          (input)="address.set(url.value)"
          (keydown.enter)="$event.preventDefault(); apply()"
        />
      </div>
      <div class="adm-field">
        <label for="link-dialog-page">Or a page on this site</label>
        <select id="link-dialog-page" (change)="pickPage($any($event.target).value)">
          <option value="">Choose a page…</option>
          @for (target of targets(); track target.id) {
            <option [value]="target.path" [selected]="target.path === address()">{{ target.label }}</option>
          }
        </select>
      </div>
      <label class="adm-check"><input #newTab type="checkbox" /> Open in a new tab</label>
      @if (address().trim()) {
        @if (href(); as link) {
          <p class="adm-help">Links to: <code>{{ link }}</code></p>
        } @else {
          <p class="adm-error" role="alert">Enter a web address like example.com, or pick a page on this site.</p>
        }
      }
      <div class="button-row adm-dialog__actions">
        @if (editing()) {
          <button type="button" class="btn btn--text adm-danger adm-dialog__start" (click)="removeLink()">Remove link</button>
        }
        <button type="button" class="btn btn--text" (click)="close()">Cancel</button>
        <button type="button" class="btn btn--primary adm-btn-sm" [disabled]="!href()" (click)="apply()">
          {{ editing() ? 'Update link' : 'Add link' }}
        </button>
      </div>
    </dialog>
  `,
})
export class LinkDialog {
  private readonly context = inject(EditorContext);

  readonly applied = output<LinkValue>();
  readonly removed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly text = viewChild.required<ElementRef<HTMLInputElement>>('text');
  private readonly url = viewChild.required<ElementRef<HTMLInputElement>>('url');
  private readonly newTab = viewChild.required<ElementRef<HTMLInputElement>>('newTab');

  protected readonly editing = signal(false);
  /** What's in the address box, as typed. */
  protected readonly address = signal('');
  protected readonly href = computed(() => normalizeHref(this.address()));

  /** Pages, posts and projects, with the address each lives at. */
  protected readonly targets = computed(() =>
    (this.context.linkTargets.hasValue() ? this.context.linkTargets.value() : []).map((target) => ({
      id: target.id,
      path: documentPath(target.type, target.slug),
      label: `${target.title}${target.type === 'post' ? ' (blog post)' : target.type === 'project' ? ' (project)' : ''}`,
    })),
  );

  /** Opens with the selected text (and the link being edited, if any). */
  show(value: LinkValue, editing: boolean): void {
    this.editing.set(editing);
    this.address.set(value.href);
    this.text().nativeElement.value = value.text;
    this.url().nativeElement.value = value.href;
    this.newTab().nativeElement.checked = value.newTab;
    showDialog(this.dialog().nativeElement);
    (value.text ? this.url() : this.text()).nativeElement.focus();
  }

  close(): void {
    closeDialog(this.dialog().nativeElement);
  }

  protected pickPage(path: string): void {
    if (!path) return;
    this.url().nativeElement.value = path;
    this.address.set(path);
  }

  protected apply(): void {
    const href = this.href();
    if (!href) return;
    const text = this.text().nativeElement.value.trim() || this.address().trim();
    this.applied.emit({ text, href, newTab: this.newTab().nativeElement.checked });
    this.close();
  }

  protected removeLink(): void {
    this.removed.emit();
    this.close();
  }
}
