import { computed, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { ProfileInfo } from '../../core/events/events';
import { MyProfileService } from '../../core/events/my-profile.service';
import { Header } from './header';

// Made-up account only: the repository is public.
describe('Header account menu', () => {
  let fixture: ComponentFixture<Header>;
  let signedOut: number;

  async function render(roles: string[], profile: Partial<ProfileInfo> | null) {
    signedOut = 0;
    const user = signal({ email: 'pat@example.com', roles });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            state: computed(() => ({ status: 'signedIn', user: user() })),
            user,
            isAdmin: computed(() => user().roles.includes('admin')),
            signOut: async () => {
              signedOut++;
            },
          },
        },
        {
          provide: MyProfileService,
          useValue: {
            profile: signal(profile),
            available: () => roles.includes('neia-boiz') || roles.includes('admin'),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const menuItems = (el: HTMLElement) =>
    [...el.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent!.trim());

  it('shows "NEIA Boiz" and the member photo, which opens Profile settings and Log out', async () => {
    const el = await render(['neia-boiz'], { name: 'Pat', avatarUrl: null });
    expect([...el.querySelectorAll('nav a')].map((a) => a.textContent!.trim())).toContain(
      'NEIA Boiz',
    );

    const button = el.querySelector<HTMLButtonElement>('.account__button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain('Pat');
    expect(el.querySelector('[role="menu"]')).toBeNull();

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(menuItems(el)).toEqual(['Profile settings', 'Log out']);
  });

  it('closes on Escape and on a click elsewhere', async () => {
    const el = await render(['neia-boiz'], { name: 'Pat' });
    const button = el.querySelector<HTMLButtonElement>('.account__button')!;

    button.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[role="menu"]')).toBeNull();

    button.click();
    fixture.detectChanges();
    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('logs out from the menu', async () => {
    const el = await render(['neia-boiz'], { name: 'Pat' });
    el.querySelector<HTMLButtonElement>('.account__button')!.click();
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].at(-1)!.click();
    await fixture.whenStable();
    expect(signedOut).toBe(1);
  });

  it('offers only Log out to accounts without a profile, named from their email', async () => {
    const el = await render(['wife'], null);
    const button = el.querySelector<HTMLButtonElement>('.account__button')!;
    expect(button.textContent).toContain('pat');
    button.click();
    fixture.detectChanges();
    expect(menuItems(el)).toEqual(['Log out']);
  });

  it('offers admins "Edit site"', async () => {
    const el = await render(['admin'], { name: 'Pat', avatarUrl: null });
    el.querySelector<HTMLButtonElement>('.account__button')!.click();
    fixture.detectChanges();
    expect(menuItems(el)).toEqual(['Profile settings', 'Edit site', 'Log out']);
    expect(el.querySelector('[role="menuitem"][href="/admin"]')).not.toBeNull();
  });

  it('does not offer "Edit site" to other members', async () => {
    const el = await render(['neia-boiz'], { name: 'Pat', avatarUrl: null });
    el.querySelector<HTMLButtonElement>('.account__button')!.click();
    fixture.detectChanges();
    expect(menuItems(el)).not.toContain('Edit site');
  });
});
