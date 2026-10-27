import { ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { closeDialog, showDialog } from './image-picker-dialog';

export interface LinkValue {
  text: string;
  href: string;
  newTab: boolean;
}

/** Addresses links may use: full URLs, paths on this site, email and phone. */
const ALLOWED_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i;

/**
 * Add or edit a link: the text to show and where it goes. No <form>: it sits
 * inside the editor page's form, and a nested form's submit would save the draft.
 */
@Component({
  selector: 'app-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="adm-dialog" aria-labelledby="link-dialog-title">
      <h2 id="link-dialog-title">{{ editing() ? 'Edit link' : 'Add a link' }}</h2>
      <div class="adm-field">
        <label for="link-dialog-text">Text</label>
        <input #text id="link-dialog-text" type="text" [value]="initial().text" (keydown.enter)="$event.preventDefault(); apply()" />
      </div>
      <div class="adm-field">
        <label for="link-dialog-url">URL</label>
        <input
          #url
          id="link-dialog-url"
          type="text"
          [value]="initial().href"
          placeholder="https://…, /about, mailto:…"
          (keydown.enter)="$event.preventDefault(); apply()"
        />
        <small class="adm-help">A full address (https://…), a page on this site (/about), mailto: or tel:.</small>
      </div>
      <label class="adm-check"><input #newTab type="checkbox" [checked]="initial().newTab" /> Open in a new tab</label>
      @if (error(); as message) {
        <p class="adm-error" role="alert">{{ message }}</p>
      }
      <div class="button-row adm-dialog__actions">
        <button type="button" class="btn btn--primary adm-btn-sm" (click)="apply()">
          {{ editing() ? 'Update link' : 'Add link' }}
        </button>
        @if (editing()) {
          <button type="button" class="btn btn--secondary adm-btn-sm" (click)="removeLink()">Remove link</button>
        }
        <button type="button" class="btn btn--text" (click)="close()">Cancel</button>
      </div>
    </dialog>
  `,
})
export class LinkDialog {
  readonly applied = output<LinkValue>();
  readonly removed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly text = viewChild.required<ElementRef<HTMLInputElement>>('text');
  private readonly url = viewChild.required<ElementRef<HTMLInputElement>>('url');
  private readonly newTab = viewChild.required<ElementRef<HTMLInputElement>>('newTab');

  protected readonly initial = signal<LinkValue>({ text: '', href: '', newTab: false });
  protected readonly editing = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Opens with the selected text (and the link being edited, if any). */
  show(value: LinkValue, editing: boolean): void {
    this.initial.set(value);
    this.editing.set(editing);
    this.error.set(null);
    // Reset the inputs too: their [value] bindings don't change if `value` repeats
    this.text().nativeElement.value = value.text;
    this.url().nativeElement.value = value.href;
    this.newTab().nativeElement.checked = value.newTab;
    showDialog(this.dialog().nativeElement);
    (value.text ? this.url() : this.text()).nativeElement.focus();
  }

  close(): void {
    closeDialog(this.dialog().nativeElement);
  }

  protected apply(): void {
    const href = this.url().nativeElement.value.trim();
    if (!ALLOWED_HREF.test(href)) {
      this.error.set('Use a full address (https://…), a page on this site (/about), mailto: or tel:.');
      return;
    }
    const text = this.text().nativeElement.value.trim() || href;
    this.applied.emit({ text, href, newTab: this.newTab().nativeElement.checked });
    this.close();
  }

  protected removeLink(): void {
    this.removed.emit();
    this.close();
  }
}
