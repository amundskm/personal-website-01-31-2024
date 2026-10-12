import { effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { ProfileInfo } from './events';

/**
 * The signed-in member's profile (name, photo, preferences), shared by the
 * header's account menu and the profile page. Loaded for NEIA Boiz members
 * once they're signed in; others don't have a profile.
 */
@Injectable({ providedIn: 'root' })
export class MyProfileService {
  private readonly auth = inject(AuthService);
  private readonly _profile = signal<ProfileInfo | null>(null);
  readonly profile = this._profile.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user && this.auth.hasAnyRole(['neia-boiz'])) void this.reload();
      else this._profile.set(null);
    });
  }

  /** Whether the signed-in user has a profile (NEIA Boiz members and admins). */
  readonly available = () => this.auth.hasAnyRole(['neia-boiz']);

  /** Called by the profile page after a save, so the header updates right away. */
  set(profile: ProfileInfo): void {
    this._profile.set(profile);
  }

  async reload(): Promise<void> {
    try {
      this._profile.set(await this.auth.fetchMembersApi<ProfileInfo>('/events/profile'));
    } catch {
      // The menu falls back to initials; the profile page shows its own errors
    }
  }
}
