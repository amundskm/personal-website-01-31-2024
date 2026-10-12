import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { hasAnyRole, isRole, type Role } from './roles';

type AuthApi = typeof import('aws-amplify/auth');

export interface AuthUser {
  email: string;
  roles: Role[];
}

export type AuthState =
  /** Not known yet (and always, during prerendering). */
  | { status: 'loading' }
  /** No `amplify_outputs.json`, e.g. running locally without `ampx sandbox`. */
  | { status: 'unavailable' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AuthUser };

/** Result of a sign-in step: done, or what the login form must ask for next. */
export type SignInStep = 'done' | 'newPassword';

interface Backend {
  auth: AuthApi;
  membersApiUrl: string;
}

/**
 * Cognito sign-in via Amplify. Amplify is configured from `/amplify_outputs.json`
 * (written by the Amplify build or `ampx sandbox`) and lazy-loaded, so the
 * public pages don't pay for it and the site still works without a backend.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _state = signal<AuthState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  readonly user = computed(() => {
    const state = this._state();
    return state.status === 'signedIn' ? state.user : null;
  });

  private readonly backend: Promise<Backend | null> = this.isBrowser
    ? this.loadBackend()
    : Promise.resolve(null);

  /** Resolves once the signed-in state is known. */
  readonly ready: Promise<void> = this.backend.then((backend) => this.refresh(backend));

  readonly isAdmin = computed(() => this.user()?.roles.includes('admin') ?? false);

  hasAnyRole(allowed: readonly Role[]): boolean {
    const user = this.user();
    return !!user && hasAnyRole(user.roles, allowed);
  }

  async signIn(email: string, password: string): Promise<SignInStep> {
    const { auth } = await this.requireBackend();
    // A stale session makes Amplify refuse to sign in again
    await auth.signOut();
    const { nextStep } = await auth.signIn({ username: email.trim(), password });
    return this.handleStep(nextStep.signInStep);
  }

  /** Sets a permanent password after signing in with an invite's temporary one. */
  async confirmNewPassword(password: string): Promise<SignInStep> {
    const { auth } = await this.requireBackend();
    const { nextStep } = await auth.confirmSignIn({ challengeResponse: password });
    return this.handleStep(nextStep.signInStep);
  }

  /** Emails a verification code for resetting a forgotten password. */
  async requestPasswordReset(email: string): Promise<void> {
    const { auth } = await this.requireBackend();
    await auth.resetPassword({ username: email.trim() });
  }

  async confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
    const { auth } = await this.requireBackend();
    await auth.confirmResetPassword({
      username: email.trim(),
      confirmationCode: code.trim(),
      newPassword: password,
    });
  }

  async signOut(): Promise<void> {
    const { auth } = await this.requireBackend();
    await auth.signOut();
    this._state.set({ status: 'signedOut' });
  }

  /**
   * Calls the members API with the user's access token. Returns null on 404;
   * other errors throw with the API's message.
   */
  async fetchMembersApi<T>(
    path: string,
    options: { method?: 'GET' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
  ): Promise<T | null> {
    const { auth, membersApiUrl } = await this.requireBackend();
    const { tokens } = await auth.fetchAuthSession();
    if (!tokens) throw new Error('Not signed in');

    const response = await fetch(`${membersApiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken.toString()}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const { message } = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(message ?? `Members API responded ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async handleStep(step: string): Promise<SignInStep> {
    switch (step) {
      case 'DONE':
        await this.refresh(await this.backend);
        return 'done';
      case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
        return 'newPassword';
      default:
        // MFA and other challenges aren't enabled on the user pool
        throw new Error(`Unsupported sign-in step: ${step}`);
    }
  }

  private async refresh(backend: Backend | null): Promise<void> {
    if (!backend) {
      // While prerendering, leave the state as 'loading' so nothing auth-related is rendered
      if (this.isBrowser) this._state.set({ status: 'unavailable' });
      return;
    }
    try {
      const { tokens } = await backend.auth.fetchAuthSession();
      if (!tokens) {
        this._state.set({ status: 'signedOut' });
        return;
      }
      const groups = (tokens.accessToken.payload['cognito:groups'] ?? []) as string[];
      this._state.set({
        status: 'signedIn',
        user: {
          email: String(tokens.idToken?.payload['email'] ?? ''),
          roles: groups.filter(isRole),
        },
      });
    } catch {
      this._state.set({ status: 'signedOut' });
    }
  }

  private async requireBackend(): Promise<Backend> {
    const backend = await this.backend;
    if (!backend) throw new Error('Sign-in is not available right now.');
    return backend;
  }

  private async loadBackend(): Promise<Backend | null> {
    try {
      const response = await fetch('/amplify_outputs.json');
      if (!response.ok) return null;
      const outputs = await response.json();
      const membersApiUrl: string | undefined = outputs?.custom?.membersApiUrl;
      if (!outputs?.auth || !membersApiUrl) return null;

      const [{ Amplify }, auth] = await Promise.all([
        import('aws-amplify'),
        import('aws-amplify/auth'),
      ]);
      Amplify.configure(outputs);
      return { auth, membersApiUrl: membersApiUrl.replace(/\/$/, '') };
    } catch {
      // Missing file (the dev server answers with index.html) or a network error
      return null;
    }
  }
}
