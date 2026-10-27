import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import type { JsonObject } from '../schema';
import { ImageField } from './image-field';

/**
 * "Add an image": upload one or pick it from the library. Emits the new image
 * usage once one is chosen; nothing is added if the dialog is cancelled.
 */
@Component({
  selector: 'app-image-picker-dialog',
  imports: [ImageField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="adm-dialog" aria-labelledby="image-picker-title" (close)="open.set(false)">
      <h2 id="image-picker-title">Add an image</h2>
      @if (open()) {
        <app-image-field [caption]="caption()" [openLibrary]="true" (valueChange)="choose($event)" />
      }
      <div class="button-row adm-dialog__actions">
        <button type="button" class="btn btn--text" (click)="close()">Cancel</button>
      </div>
    </dialog>
  `,
})
export class ImagePickerDialog {
  /** Whether the image gets a caption (accessible images) or only alt text. */
  readonly caption = input(true);
  readonly picked = output<JsonObject>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** The image field is only created while open, so each opening starts fresh. */
  protected readonly open = signal(false);

  show(): void {
    this.open.set(true);
    showDialog(this.dialog().nativeElement);
  }

  close(): void {
    closeDialog(this.dialog().nativeElement);
    this.open.set(false);
  }

  protected choose(value: JsonObject | undefined): void {
    if (!value?.['asset']) return;
    this.picked.emit(value);
    this.close();
  }
}

/** Opens a <dialog> modally (or just shows it where showModal isn't available, e.g. tests). */
export function showDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

export function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}
