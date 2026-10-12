import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import {
  type AttachmentKind,
  type GroupEvent,
  type UploadRequest,
  validateUploadRequest,
} from './events';

/** Cover images are resized to at most this many pixels wide before upload. */
const IMAGE_MAX_WIDTH = 1600;

/**
 * Uploads and removes event attachments: shared by the event page and the
 * create/edit form. Uploads go straight to storage with a signed link, then
 * get confirmed (see the group-events Lambda).
 */
@Injectable({ providedIn: 'root' })
export class EventFilesService {
  private readonly auth = inject(AuthService);

  /** The file as it will be uploaded: images are shrunk to a web-friendly JPEG. */
  prepare(file: File, kind: AttachmentKind): Promise<File> {
    return kind === 'image' ? resizeImage(file) : Promise.resolve(file);
  }

  /** Checks a (prepared) file before uploading. Returns an error message, or null. */
  check(file: File, kind: AttachmentKind, existingFiles: number): string | null {
    return validateUploadRequest(requestFor(file, kind), existingFiles);
  }

  /** Uploads a prepared file and attaches it. Returns the updated event. */
  async upload(eventId: string, kind: AttachmentKind, file: File): Promise<GroupEvent | null> {
    const request = requestFor(file, kind);
    const base = `/events/${encodeURIComponent(eventId)}/attachments`;
    const upload = await this.auth.fetchMembersApi<{ id: string; name: string; uploadUrl: string }>(
      base,
      { method: 'POST', body: request },
    );
    if (!upload) throw new Error('Could not start the upload.');
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': request.type },
      body: file,
    });
    if (!put.ok) throw new Error(`${file.name} didn't upload. Please try again.`);
    return this.auth.fetchMembersApi<GroupEvent>(`${base}/${upload.id}`, {
      method: 'PUT',
      body: { kind, name: upload.name, type: request.type },
    });
  }

  remove(eventId: string, attachmentId: string): Promise<GroupEvent | null> {
    return this.auth.fetchMembersApi<GroupEvent>(
      `/events/${encodeURIComponent(eventId)}/attachments/${attachmentId}`,
      { method: 'DELETE' },
    );
  }
}

function requestFor(file: File, kind: AttachmentKind): UploadRequest {
  return { kind, name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
}

/** Shrinks a photo to a web-friendly JPEG (keeps small JPEGs as they are). */
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
