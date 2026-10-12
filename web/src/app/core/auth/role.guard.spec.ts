import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService, type AuthUser } from './auth.service';
import { requireRole } from './role.guard';
import { hasAnyRole, type Role } from './roles';

describe('hasAnyRole', () => {
  it('lets admins through everything', () => {
    expect(hasAnyRole(['admin'], ['wife'])).toBe(true);
  });

  it('requires one of the allowed roles otherwise', () => {
    expect(hasAnyRole(['wife'], ['wife', 'neia-boiz'])).toBe(true);
    expect(hasAnyRole(['neia-boiz'], ['wife'])).toBe(false);
    expect(hasAnyRole([], ['wife'])).toBe(false);
  });
});

describe('requireRole', () => {
  function run(user: AuthUser | null, ...allowed: Role[]) {
    const current = signal(user);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            ready: Promise.resolve(),
            user: current,
            hasAnyRole: (roles: Role[]) => !!current() && hasAnyRole(current()!.roles, roles),
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      requireRole(...allowed)(
        {} as ActivatedRouteSnapshot,
        { url: '/members/secret' } as RouterStateSnapshot,
      ),
    ) as Promise<boolean | UrlTree>;
  }

  it('sends signed-out users to the login page with a redirect back', async () => {
    const result = await run(null);
    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login?redirect=%2Fmembers%2Fsecret');
  });

  it('admits any signed-in user when no roles are given', async () => {
    expect(await run({ email: 'a@b.c', roles: [] })).toBe(true);
  });

  it('admits users with an allowed role, and admins', async () => {
    expect(await run({ email: 'a@b.c', roles: ['wife'] }, 'wife')).toBe(true);
    TestBed.resetTestingModule();
    expect(await run({ email: 'a@b.c', roles: ['admin'] }, 'wife')).toBe(true);
  });

  it('sends users without the role back to the members home', async () => {
    const result = await run({ email: 'a@b.c', roles: ['neia-boiz'] }, 'wife');
    expect(result.toString()).toBe('/members');
  });
});
