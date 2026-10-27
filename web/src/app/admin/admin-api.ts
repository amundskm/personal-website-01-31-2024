import { inject, Injectable } from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import type { Collection } from './schemas';
import type { JsonObject, LinkTarget } from './schema';

export type DocumentStatus = 'published' | 'changed' | 'new' | 'deleted';

export interface ImageSummary {
  id: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  filename: string | null;
}

export interface DocumentSummary {
  id: string;
  title: string | null;
  slug: string | null;
  status: DocumentStatus;
  updatedAt: string;
}

/** A document as edited: its draft (or live version) plus thumbnails of its images. */
export interface EditableDocument {
  id?: string;
  status?: DocumentStatus;
  document: JsonObject;
  assets?: Record<string, ImageSummary>;
}

export interface PendingChange {
  collection: Collection | 'settings';
  id: string | null;
  title: string | null;
  status: DocumentStatus;
}

export type RebuildResult = 'started' | 'not_configured' | 'failed';

/** The content API's /admin routes (api/app/controllers/admin). Admins only. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly auth = inject(AuthService);

  private async call<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown) {
    return this.auth.fetchContentApi<T>(`/admin${path}`, { method, body });
  }

  private async required<T>(promise: Promise<T | null>): Promise<T> {
    const value = await promise;
    if (value === null) throw new Error('Not found');
    return value;
  }

  list(collection: Collection) {
    return this.required(this.call<DocumentSummary[]>(`/${collection}`));
  }

  get(collection: Collection, id: string) {
    return this.call<EditableDocument>(`/${collection}/${encodeURIComponent(id)}`);
  }

  create(collection: Collection, document: JsonObject) {
    return this.required(this.call<EditableDocument>(`/${collection}`, 'POST', { document }));
  }

  save(collection: Collection, id: string, document: JsonObject) {
    return this.required(this.call<EditableDocument>(`/${collection}/${encodeURIComponent(id)}`, 'PUT', { document }));
  }

  /** Returns the document still pending deletion, or null if it's gone. */
  remove(collection: Collection, id: string) {
    return this.call<EditableDocument>(`/${collection}/${encodeURIComponent(id)}`, 'DELETE');
  }

  discard(collection: Collection, id: string) {
    return this.required(this.call<EditableDocument>(`/${collection}/${encodeURIComponent(id)}/discard`, 'POST'));
  }

  /** The document rendered as the site would show it, without saving. */
  preview<T>(collection: Collection, id: string | undefined, document: JsonObject) {
    const path = id ? `/${collection}/${encodeURIComponent(id)}/preview` : `/${collection}/preview`;
    return this.required(this.call<T>(path, 'POST', { document }));
  }

  settings() {
    return this.required(this.call<EditableDocument>('/settings'));
  }

  saveSettings(document: JsonObject) {
    return this.required(this.call<EditableDocument>('/settings', 'PUT', { document }));
  }

  discardSettings() {
    return this.required(this.call<EditableDocument>('/settings/discard', 'POST'));
  }

  previewSettings<T>(document: JsonObject) {
    return this.required(this.call<T>('/settings/preview', 'POST', { document }));
  }

  spendingPlan() {
    return this.required(this.call<EditableDocument>('/spending-plan'));
  }

  saveSpendingPlan(document: JsonObject) {
    return this.required(this.call<EditableDocument>('/spending-plan', 'PUT', { document }));
  }

  images() {
    return this.required(this.call<ImageSummary[]>('/images'));
  }

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.required(this.call<ImageSummary>('/images', 'POST', form));
  }

  linkTargets() {
    return this.required(this.call<LinkTarget[]>('/link-targets'));
  }

  pendingChanges() {
    return this.required(this.call<{ changes: PendingChange[]; rebuildConfigured: boolean }>('/publish'));
  }

  publish() {
    return this.required(this.call<{ published: PendingChange[]; rebuild: RebuildResult }>('/publish', 'POST'));
  }
}
