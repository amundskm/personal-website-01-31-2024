import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi, type RebuildResult } from '../admin-api';
import { StatusBadge } from './status-badge';

const REBUILD_MESSAGES: Record<RebuildResult, string> = {
  started: 'Published. The site is rebuilding and will update in a few minutes.',
  not_configured: 'Published. No rebuild webhook is set up for this environment, so start a build in Amplify.',
  failed: 'Published, but the rebuild could not be started. Start a build in Amplify.',
};

/** Pending changes across the site, and the button that makes them live. */
@Component({
  selector: 'app-publish-page',
  imports: [RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <p class="eyebrow">Admin</p>
      <h1>Publish</h1>
    </header>

    @if (message(); as text) {
      <p class="adm-notice" role="status">{{ text }}</p>
    }

    @if (pending.hasValue()) {
      @let changes = pending.value().changes;
      @if (changes.length) {
        <p>These changes are saved but not on the site yet:</p>
        <ul class="adm-changes">
          @for (change of changes; track change.collection + change.id) {
            <li>
              <a [routerLink]="change.collection === 'settings' ? '/admin/settings' : ['/admin', change.collection, change.id]">
                {{ change.title || 'Untitled' }}
              </a>
              <app-status-badge [status]="change.status" />
            </li>
          }
        </ul>
      } @else {
        <p class="empty">Everything is published.</p>
      }
      <div class="button-row">
        <button type="button" class="btn btn--primary" (click)="publish()" [disabled]="publishing()">
          {{ publishing() ? 'Publishing…' : changes.length ? 'Publish and rebuild the site' : 'Rebuild the site' }}
        </button>
      </div>
      @if (!pending.value().rebuildConfigured) {
        <small class="adm-help">No rebuild webhook (AMPLIFY_WEBHOOK_URL) is set up for this environment.</small>
      }
    } @else if (pending.error()) {
      <p class="adm-error" role="alert">Pending changes could not be loaded.</p>
    } @else {
      <p class="status">Loading…</p>
    }
  `,
})
export class PublishPage {
  private readonly api = inject(AdminApi);

  protected readonly pending = resource({ loader: () => this.api.pendingChanges() });
  protected readonly publishing = signal(false);
  protected readonly message = signal<string | null>(null);

  protected async publish(): Promise<void> {
    this.publishing.set(true);
    this.message.set(null);
    try {
      const { rebuild } = await this.api.publish();
      this.message.set(REBUILD_MESSAGES[rebuild]);
      this.pending.reload();
    } catch (error) {
      this.message.set(error instanceof Error ? `Publishing failed: ${error.message}` : 'Publishing failed.');
    } finally {
      this.publishing.set(false);
    }
  }
}
