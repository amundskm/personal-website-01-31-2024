import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import {
  type Attachment,
  type AttachmentKind,
  canManage,
  type EventDetail,
  formatBytes,
  type GroupEvent,
  MAX_FILE_BYTES,
  MAX_FILES,
  type UploadRequest,
  validateUploadRequest,
} from '../../core/events/events';

/** Cover images are resized to at most this many pixels wide before upload. */
const IMAGE_MAX_WIDTH = 1600;

/**
 * An event's cover image and files. Everyone who can see the event can view
 * and download; the organizer (and admins) can add, replace and remove.
 * Emits `changed` with the updated event after a change.
 */
@Component({
  selector: 'app-event-attachments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (files().length || manager()) {
      <section class="ev-files" aria-labelledby="ev-files-heading">
        <h3 id="ev-files-heading" class="ev-subhead">Files</h3>
        @if (files().length) {
          <ul>
            @for (file of files(); track file.id) {
              <li>
                <a [href]="file.url" [attr.download]="file.name" rel="noopener">
                  <span class="ev-file-icon" aria-hidden="true">{{ extension(file) }}</span>
                  {{ file.name }}
                </a>
                <span class="ev-meta">{{ size(file.size) }}</span>
                @if (manager()) {
                  <button
                    type="button"
                    class="ev-link"
                    [disabled]="busy()"
                    (click)="remove(file)"
                    [attr.aria-label]="'Remove ' + file.name"
                  >
                    Remove
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="ev-meta">No files yet.</p>
        }
      </section>
    }

    @if (manager()) {
      <div class="button-row ev-upload">
        <label class="btn btn--text" [class.is-disabled]="busy()">
          {{ event().image ? 'Replace image' : 'Add a cover image' }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="visually-hidden"
            [disabled]="busy()"
            (change)="pick($event, 'image')"
          />
        </label>
        @if (event().image) {
          <button
            type="button"
            class="btn btn--text"
            [disabled]="busy()"
            (click)="remove(event().image!)"
          >
            Remove image
          </button>
        }
        @if (files().length < maxFiles) {
          <label class="btn btn--text" [class.is-disabled]="busy()">
            Attach a file
            <input
              type="file"
              class="visually-hidden"
              [disabled]="busy()"
              (change)="pick($event, 'file')"
            />
          </label>
        }
      </div>
      <p class="ev-meta">
        Up to {{ maxFiles }} files, {{ maxFileSize }} each. Only people who can see this event can
        open them.
      </p>
    }
    @if (status(); as s) {
      <p class="ev-status" [class.ev-error]="s.error" [attr.role]="s.error ? 'alert' : 'status'">
        {{ s.text }}
      </p>
    }
  `,
  styleUrl: './event-attachments.scss',
})
export class EventAttachments {
  private readonly auth = inject(AuthService);

  readonly detail = input.required<EventDetail>();
  readonly changed = output<GroupEvent>();

  protected readonly maxFiles = MAX_FILES;
  protected readonly maxFileSize = formatBytes(MAX_FILE_BYTES);
  protected readonly busy = signal(false);
  protected readonly status = signal<{ text: string; error: boolean } | null>(null);

  protected readonly event = computed(() => this.detail().event);
  protected readonly files = computed(() => this.event().attachments ?? []);
  protected readonly manager = computed(() => {
    const d = this.detail();
    return canManage(d.event, d.me.id, d.me.isAdmin);
  });

  protected readonly size = formatBytes;
  protected readonly extension = (file: Attachment) =>
    (file.name.split('.').pop() ?? '').slice(0, 4).toUpperCase() || 'FILE';

  protected async pick(input: Event, kind: AttachmentKind): Promise<void> {
    const element = input.target as HTMLInputElement;
    const picked = element.files?.[0];
    element.value = '';
    if (!picked) return;

    this.busy.set(true);
    this.status.set({ text: `Uploading ${picked.name}…`, error: false });
    try {
      const file = kind === 'image' ? await resizeImage(picked) : picked;
      const request: UploadRequest = {
        kind,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      };
      const problem = validateUploadRequest(request, this.files().length);
      if (problem) throw new Error(problem);

      const base = `/events/${encodeURIComponent(this.event().id)}/attachments`;
      const upload = await this.auth.fetchMembersApi<{
        id: string;
        name: string;
        uploadUrl: string;
      }>(base, {
        method: 'POST',
        body: request,
      });
      if (!upload) throw new Error('Could not start the upload.');
      const put = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': request.type },
        body: file,
      });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      const updated = await this.auth.fetchMembersApi<GroupEvent>(`${base}/${upload.id}`, {
        method: 'PUT',
        body: { kind, name: upload.name, type: request.type },
      });
      if (updated) this.changed.emit(updated);
      this.status.set({
        text: kind === 'image' ? 'Cover image updated.' : `Attached ${upload.name}.`,
        error: false,
      });
    } catch (error) {
      this.status.set({
        text: error instanceof Error ? error.message : 'The upload failed.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(file: Attachment): Promise<void> {
    if (!confirm(`Remove ${file.name}?`)) return;
    this.busy.set(true);
    this.status.set(null);
    try {
      const updated = await this.auth.fetchMembersApi<GroupEvent>(
        `/events/${encodeURIComponent(this.event().id)}/attachments/${file.id}`,
        { method: 'DELETE' },
      );
      if (updated) this.changed.emit(updated);
      this.status.set({ text: `Removed ${file.name}.`, error: false });
    } catch (error) {
      this.status.set({
        text: error instanceof Error ? error.message : 'Could not remove it.',
        error: true,
      });
    } finally {
      this.busy.set(false);
    }
  }
}

/** Shrinks a photo to a web-friendly JPEG (keeps small images as they are). */
async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be opened. Try a JPEG or PNG.");
  });
  const scale = Math.min(1, IMAGE_MAX_WIDTH / bitmap.width);
  if (scale === 1 && file.size < 1024 * 1024 && file.type === 'image/jpeg') {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) throw new Error('That image could not be processed.');
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
