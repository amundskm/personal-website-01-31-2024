import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../admin-api';
import { type Collection, DOCUMENTS } from '../schemas';
import { StatusBadge } from './status-badge';

/** Every page, post, project or members page, with its publish status. */
@Component({
  selector: 'app-document-list-page',
  imports: [DatePipe, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header adm-header">
      <div>
        <p class="eyebrow">Admin</p>
        <h1>{{ schema().title }}</h1>
      </div>
      <a class="btn btn--primary" [routerLink]="['/admin', collection(), 'new']">New {{ schema().singular }}</a>
    </header>

    @if (documents.hasValue()) {
      <table class="adm-table">
        <thead>
          <tr><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th></tr>
        </thead>
        <tbody>
          @for (doc of documents.value(); track doc.id) {
            <tr>
              <td><a [routerLink]="['/admin', collection(), doc.id]">{{ doc.title || 'Untitled' }}</a></td>
              <td><code>{{ doc.slug }}</code></td>
              <td><app-status-badge [status]="doc.status" /></td>
              <td>{{ doc.updatedAt | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="empty">Nothing here yet.</td></tr>
          }
        </tbody>
      </table>
    } @else if (documents.error()) {
      <p class="adm-error" role="alert">This list could not be loaded.</p>
    } @else {
      <p class="status">Loading…</p>
    }
  `,
})
export class DocumentListPage {
  private readonly api = inject(AdminApi);

  /** From the route's data. */
  readonly collection = input.required<Collection>();

  protected readonly schema = computed(() => DOCUMENTS[this.collection()]);
  protected readonly documents = resource({
    params: () => this.collection(),
    loader: ({ params }) => this.api.list(params),
  });
}
