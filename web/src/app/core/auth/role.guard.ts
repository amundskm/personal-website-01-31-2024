import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { Role } from './roles';

/**
 * Requires a signed-in user with one of `allowed` (admins always pass).
 * With no roles given, any signed-in user may enter.
 *
 * e.g. `{ path: 'members/recipes', canActivate: [requireRole('wife')], ... }`
 *
 * This only controls navigation: gated *data* must still come from the members
 * API, which checks the user's groups on the server.
 */
export function requireRole(...allowed: Role[]): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.ready;

    if (!auth.user()) {
      return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
    }
    if (!allowed.length || auth.hasAnyRole(allowed)) return true;
    return router.createUrlTree(['/members']);
  };
}
