import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import type { JsonObject } from '../schema';
import { ImageField } from './image-field';

/**
 * Adding or editing an image as its own step: choose the image (upload or
 * library), then check its alt text, caption and focal point. Works on a copy:
 * nothing changes until Save, and Cancel discards it.
 */
@Component({
  selector: 'app-image-dialog',
  imports: [ImageField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="adm-dialog" aria-labelledby="image-dialog-title" (cancel)="close()">
      <h2 id="image-dialog-title">{{ editing() ? 'Edit image' : 'Add an image' }}</h2>
      @if (isOpen()) {
        @if (!chosen()) {
          <p class="adm-help">Upload an image, or choose one from the library.</p>
        }
        <!-- One field for both steps: without an image it offers the library, with one its details -->
        <app-image-field
          [value]="draft()"
          [caption]="caption()"
          [openLibrary]="!chosen()"
          [removable]="false"
          (valueChange)="draft.set($event)"
        />
      }
      <div class="button-row adm-dialog__actions">
        @if (editing()) {
          <button type="button" class="btn btn--text adm-danger adm-dialog__start" (click)="remove()">Remove image</button>
        }
        <button type="button" class="btn btn--text" (click)="close()">Cancel</button>
        <button type="button" class="btn btn--primary adm-btn-sm" [disabled]="!chosen()" (click)="save()">
          {{ editing() ? 'Save' : 'Add image' }}
        </button>
      </div>
    </dialog>
  `,
})
export class ImageDialog {
  /** Whether the image gets a caption (accessible images) or only alt text. */
  readonly caption = input(true);
  readonly saved = output<JsonObject>();
  readonly removed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly isOpen = signal(false);
  protected readonly editing = signal(false);
  /** The image being added or edited; only handed back on Save. */
  protected readonly draft = signal<JsonObject | undefined>(undefined);
  protected readonly chosen = computed(() => !!this.draft()?.['asset']);

  /** Starts with choosing an image. */
  add(): void {
    this.open(undefined, false);
  }

  /** Starts with the image's details; it can still be swapped for another. */
  edit(image: JsonObject): void {
    this.open(structuredClone(image), true);
  }

  close(): void {
    closeDialog(this.dialog().nativeElement);
    this.isOpen.set(false);
  }

  private open(image: JsonObject | undefined, editing: boolean): void {
    this.draft.set(image);
    this.editing.set(editing);
    this.isOpen.set(true);
    showDialog(this.dialog().nativeElement);
  }

  protected save(): void {
    const image = this.draft();
    if (!image?.['asset']) return;
    this.saved.emit(image);
    this.close();
  }

  protected remove(): void {
    this.removed.emit();
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
