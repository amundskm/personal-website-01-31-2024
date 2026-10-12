import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/** Asks a member for the display name shown in polls and RSVPs. */
@Component({
  selector: 'app-name-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="ev-card name-prompt" (submit)="save($event)">
      <label>
        <span>What should the group call you?</span>
        <input
          name="name"
          required
          maxlength="40"
          autocomplete="nickname"
          placeholder="Your name"
        />
      </label>
      <button type="submit" class="btn btn--primary" [disabled]="busy()">Save</button>
      @if (error(); as e) {
        <p class="ev-error" role="alert">{{ e }}</p>
      }
    </form>
  `,
  styleUrl: './events.scss',
})
export class NamePrompt {
  private readonly auth = inject(AuthService);
  readonly saved = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const name = String(new FormData(event.target as HTMLFormElement).get('name') ?? '').trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.fetchMembersApi('/events/profile', { method: 'PUT', body: { name } });
      this.saved.emit();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save your name.');
    } finally {
      this.busy.set(false);
    }
  }
}
