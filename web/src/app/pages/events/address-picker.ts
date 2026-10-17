import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { type EventCoords, mapLink } from '../../core/events/events';
import {
  MAX_PLACE_QUERY,
  MIN_PLACE_QUERY,
  type PlaceDetails,
  type PlaceSuggestion,
} from '../../core/events/places';

/** Wait this long after the last keystroke before searching. */
const SEARCH_DELAY_MS = 250;

let nextId = 0;

/**
 * The event form's address field: type to search for an address or a named
 * place, then pick one so the address is complete and pinned on the map. An
 * address that isn't found (a cabin up a gravel road) can still be typed in.
 */
@Component({
  selector: 'app-address-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ev-field ev-address">
      <label [for]="ids.input">Address</label>
      <div class="ev-address-box">
        <input
          [id]="ids.input"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="ids.list"
          [attr.aria-activedescendant]="active() >= 0 ? ids.option + active() : null"
          [attr.aria-describedby]="ids.status"
          [value]="address()"
          (input)="type($any($event.target).value)"
          (keydown)="key($event)"
          (focus)="reopen()"
          (blur)="open.set(false)"
          maxlength="300"
          autocomplete="off"
          placeholder="Start typing an address or place"
        />
        @if (open()) {
          <ul class="ev-address-list" role="listbox" [id]="ids.list" aria-label="Addresses">
            @for (s of suggestions(); track s.id; let i = $index) {
              <li
                role="option"
                [id]="ids.option + i"
                [attr.aria-selected]="i === active()"
                [class.is-active]="i === active()"
                (mousedown)="$event.preventDefault()"
                (click)="choose(s)"
                (mouseenter)="active.set(i)"
              >
                <span class="ev-address-title">{{ s.title }}</span>
                @if (s.subtitle) {
                  <span class="visually-hidden">, </span>
                  <span class="ev-meta">{{ s.subtitle }}</span>
                }
              </li>
            } @empty {
              <li class="ev-meta ev-address-none" aria-disabled="true">
                No matches. Keep typing, or leave the address as you typed it.
              </li>
            }
          </ul>
        }
      </div>
      <p class="ev-meta ev-address-status" [id]="ids.status" aria-live="polite">
        @if (loadingPlace()) {
          Getting the address…
        } @else if (coords()) {
          <span class="ev-address-ok">✓ Found on the map</span> ·
          <a [href]="checkLink()" target="_blank" rel="noopener">Check the pin</a>
        } @else if (unavailable()) {
          Address search isn't working right now. Type the full address.
        } @else if (address().trim()) {
          Not matched to a map address. Pick a suggestion so the map link is exact, or keep it as
          typed.
        } @else {
          Optional. Pick a suggestion to fill in the full address.
        }
      </p>
    </div>
  `,
  styles: `
    .ev-address-box {
      position: relative;
    }

    .ev-address-list {
      position: absolute;
      inset: calc(100% + var(--space-1)) 0 auto;
      z-index: 10;
      max-height: 18rem;
      overflow-y: auto;
      margin: 0;
      padding: var(--space-1) 0;
      list-style: none;
      font-weight: 400;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);

      li {
        display: flex;
        flex-direction: column;
        padding: var(--space-2) var(--space-3);
        cursor: pointer;

        &.is-active {
          background: var(--color-surface-deep);
        }
      }

      .ev-address-none {
        cursor: default;
      }
    }

    .ev-address-title {
      font-weight: 500;
    }

    .ev-address-status {
      margin: 0;
      font-weight: 400;
    }

    .ev-address-ok {
      font-weight: 500;
      color: var(--color-accent);
    }
  `,
})
export class AddressPicker {
  private readonly auth = inject(AuthService);

  /** The address text, as typed or as picked. */
  readonly address = model('');
  /** Set when the address was picked from the suggestions; cleared by typing. */
  readonly coords = model<EventCoords | null>(null);
  /** A suggestion was picked (its name can fill in an empty "Place"). */
  readonly picked = output<PlaceDetails>();

  protected readonly maxLength = 300;
  protected readonly ids = (() => {
    const n = nextId++;
    return {
      input: `address-${n}`,
      list: `address-${n}-list`,
      option: `address-${n}-option-`,
      status: `address-${n}-status`,
    };
  })();

  protected readonly suggestions = signal<PlaceSuggestion[]>([]);
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  protected readonly unavailable = signal(false);
  protected readonly loadingPlace = signal(false);

  private readonly cache = new Map<string, PlaceSuggestion[]>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every search and pick, so a slow, older response is ignored. */
  private request = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected checkLink(): string {
    return mapLink({ name: '', address: this.address() });
  }

  protected type(text: string): void {
    this.address.set(text);
    this.coords.set(null);
    // Typing wins over a pick that's still loading
    this.request++;
    this.loadingPlace.set(false);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search(text), SEARCH_DELAY_MS);
  }

  /** Focusing the field again shows the last suggestions, unless one was already picked. */
  protected reopen(): void {
    if (!this.coords() && this.address().trim().length >= MIN_PLACE_QUERY) this.open.set(true);
  }

  protected key(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!count) return;
        event.preventDefault();
        if (!this.open()) {
          this.open.set(true);
          return;
        }
        this.active.update((i) =>
          event.key === 'ArrowDown' ? (i + 1) % count : (i <= 0 ? count : i) - 1,
        );
        break;
      case 'Enter':
        // Pick the highlighted suggestion instead of submitting the form
        if (this.open() && this.active() >= 0) {
          event.preventDefault();
          this.choose(this.suggestions()[this.active()]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.open.set(false);
        }
        break;
    }
  }

  private async search(text: string): Promise<void> {
    const query = text.trim().slice(0, MAX_PLACE_QUERY);
    const mine = ++this.request;
    if (query.length < MIN_PLACE_QUERY) {
      this.show([], false);
      return;
    }
    const cached = this.cache.get(query.toLowerCase());
    if (cached) {
      this.show(cached, true);
      return;
    }
    try {
      const result = await this.auth.fetchMembersApi<{ suggestions: PlaceSuggestion[] }>(
        `/events/places?q=${encodeURIComponent(query)}`,
      );
      const suggestions = result?.suggestions ?? [];
      this.cache.set(query.toLowerCase(), suggestions);
      if (mine === this.request) this.show(suggestions, true);
    } catch {
      if (mine === this.request) {
        this.unavailable.set(true);
        this.show([], false);
      }
    }
  }

  private show(suggestions: PlaceSuggestion[], open: boolean): void {
    this.suggestions.set(suggestions);
    this.active.set(-1);
    this.open.set(open);
    if (open) this.unavailable.set(false);
  }

  protected async choose(suggestion: PlaceSuggestion): Promise<void> {
    clearTimeout(this.timer);
    const mine = ++this.request;
    this.open.set(false);
    // Shown right away; replaced by the full address below
    this.address.set([suggestion.title, suggestion.subtitle].filter(Boolean).join(', '));
    this.loadingPlace.set(true);
    try {
      const place = await this.auth.fetchMembersApi<PlaceDetails>(
        `/events/places?id=${encodeURIComponent(suggestion.id)}`,
      );
      if (mine !== this.request || !place) return;
      this.address.set(place.address.slice(0, this.maxLength));
      this.coords.set(place.coords);
      this.picked.emit(place);
    } catch {
      if (mine === this.request) this.unavailable.set(true);
    } finally {
      if (mine === this.request) this.loadingPlace.set(false);
    }
  }
}
