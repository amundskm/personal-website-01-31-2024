import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import { filter } from "rxjs";
import { AuthService } from "../../core/auth/auth.service";
import { MyProfileService } from "../../core/events/my-profile.service";
import { MemberAvatar } from "../../shared/member-avatar/member-avatar";
import type { SiteLink, SiteSettings } from "../../core/models";
import { resolveLink } from "../../core/paths";
import { WizardHat } from "../../shared/wizard/wizard-hat";

const internalLink = (key: string, label: string, path: string) =>
  ({
    _key: key,
    label,
    path,
    kind: "internal",
    url: null,
    style: null,
    internal: null,
  }) satisfies SiteLink & {
    _key: string;
  };

const DEFAULT_NAV = [
  internalLink("blog", "Blog", "/blog"),
  internalLink("projects", "Projects", "/projects"),
];

@Component({
  selector: "app-header",
  imports: [RouterLink, RouterLinkActive, WizardHat, MemberAvatar],
  host: {
    "(document:click)": "closeOnOutsideClick($event)",
    "(document:keydown.escape)": "closeAccount(true)",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="container header__inner">
        <a routerLink="/" class="header__brand">
          <app-wizard-hat />
          <span>{{ settings()?.title || "Home" }}</span>
        </a>

        <button
          type="button"
          class="header__toggle"
          [attr.aria-expanded]="menuOpen()"
          aria-controls="site-nav"
          (click)="menuOpen.set(!menuOpen())"
        >
          <span class="visually-hidden">Toggle navigation</span>
          <span class="header__toggle-bar" aria-hidden="true"></span>
        </button>

        <nav
          id="site-nav"
          class="header__nav"
          [class.is-open]="menuOpen()"
          aria-label="Main"
        >
          <ul>
            @for (item of navItems(); track item._key) {
              @let target = resolve(item);
              <li>
                @if (target?.kind === "internal") {
                  <a
                    [routerLink]="target.path"
                    routerLinkActive="is-active"
                    [routerLinkActiveOptions]="{ exact: target.path === '/' }"
                    >{{ item.label }}</a
                  >
                } @else if (target?.kind === "external") {
                  <a
                    [href]="target.href"
                    [attr.target]="target.newTab ? '_blank' : null"
                    [attr.rel]="target.newTab ? 'noopener noreferrer' : null"
                    >{{ item.label }}</a
                  >
                }
              </li>
            }
            <!-- Only known in the browser, so nothing is prerendered here -->
            @switch (auth.state().status) {
              @case ("signedIn") {
                <li>
                  <a routerLink="/members" routerLinkActive="is-active"
                    >NEIA Boiz</a
                  >
                </li>
                <li class="account" #account>
                  <button
                    #accountButton
                    type="button"
                    class="account__button"
                    aria-haspopup="menu"
                    aria-controls="account-menu"
                    [attr.aria-expanded]="accountOpen()"
                    (click)="toggleAccount()"
                  >
                    <app-member-avatar
                      [name]="displayName()"
                      [url]="avatarUrl()"
                      [size]="34"
                    />
                    <span class="account__label">{{ displayName() }}</span>
                    <span class="visually-hidden">: account menu</span>
                  </button>
                  @if (accountOpen()) {
                    <ul
                      id="account-menu"
                      class="account__menu"
                      role="menu"
                      (keydown)="menuKeys($event)"
                    >
                      @if (profiles.available()) {
                        <li role="none">
                          <a
                            role="menuitem"
                            routerLink="/profile"
                            (click)="closeAccount()"
                          >
                            Profile settings
                          </a>
                        </li>
                      }
                      @if (auth.isAdmin()) {
                        <li role="none">
                          <a
                            role="menuitem"
                            routerLink="/admin"
                            (click)="closeAccount()"
                          >
                            Edit site
                          </a>
                        </li>
                      }
                      <li role="none">
                        <button
                          role="menuitem"
                          type="button"
                          (click)="signOut()"
                        >
                          Log out
                        </button>
                      </li>
                    </ul>
                  }
                </li>
              }
              @case ("signedOut") {
                <li>
                  <a routerLink="/login" routerLinkActive="is-active">Log in</a>
                </li>
              }
            }
          </ul>
        </nav>
      </div>
    </header>
  `,
  styleUrl: "./header.scss",
})
export class Header {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly profiles = inject(MyProfileService);

  private readonly account = viewChild<ElementRef<HTMLElement>>("account");
  private readonly accountButton =
    viewChild<ElementRef<HTMLButtonElement>>("accountButton");
  protected readonly accountOpen = signal(false);

  /** Profile name if set, else the part of the email before the @. */
  protected readonly displayName = computed(
    () =>
      this.profiles.profile()?.name ??
      this.auth.user()?.email.split("@")[0] ??
      "Account",
  );
  protected readonly avatarUrl = computed(
    () => this.profiles.profile()?.avatarUrl ?? null,
  );

  readonly settings = input<SiteSettings | null>();

  /** CMS navigation, falling back to the built-in sections until it is configured. */
  protected readonly navItems = computed(() => {
    const nav = this.settings()?.navigation;
    return nav?.length ? nav : DEFAULT_NAV;
  });
  protected readonly menuOpen = signal(false);
  protected readonly resolve = resolveLink;

  constructor() {
    // Close the mobile menu after navigating
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.accountOpen.set(false);
      });
  }

  protected toggleAccount(): void {
    const open = !this.accountOpen();
    this.accountOpen.set(open);
    // Move focus into the menu so it works from the keyboard
    if (open) setTimeout(() => this.menuItems()[0]?.focus());
  }

  protected closeAccount(returnFocus = false): void {
    if (!this.accountOpen()) return;
    this.accountOpen.set(false);
    if (returnFocus) this.accountButton()?.nativeElement.focus();
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    const account = this.account()?.nativeElement;
    if (
      this.accountOpen() &&
      account &&
      !account.contains(event.target as Node)
    ) {
      this.accountOpen.set(false);
    }
  }

  /** Arrow keys move between items; Tab leaves the menu and closes it. */
  protected menuKeys(event: KeyboardEvent): void {
    const items = this.menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      this.accountOpen.set(false);
    }
  }

  private menuItems(): HTMLElement[] {
    return [
      ...(this.account()?.nativeElement.querySelectorAll<HTMLElement>(
        '[role="menuitem"]',
      ) ?? []),
    ];
  }

  protected async signOut(): Promise<void> {
    this.accountOpen.set(false);
    await this.auth.signOut();
    this.menuOpen.set(false);
    // Leave pages that need a login
    if (/^\/(members|family|events|profile)(\/|$|\?|#)/.test(this.router.url)) {
      await this.router.navigateByUrl("/");
    }
  }
}
