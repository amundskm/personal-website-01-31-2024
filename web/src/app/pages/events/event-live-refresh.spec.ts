import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { EventComment } from '../../core/events/comments';
import type { EventDetail } from '../../core/events/events';
import { EventPage } from './event-page';

// Made-up people and comments only: the repository is public.
const comment = (id: string, authorId: string): EventComment => ({
  id,
  eventId: 'evt1',
  parentId: null,
  authorId,
  kind: 'comment',
  body: `Body ${id}`,
  createdAt: `2030-01-0${id.length}T00:00:00Z`,
  deleted: false,
  status: null,
  reactions: {},
});

const detail = (comments: EventComment[]): EventDetail => ({
  me: { id: 'me', name: 'Me', hasName: true, isAdmin: false },
  members: [
    { id: 'me', name: 'Me' },
    { id: 'bob', name: 'Bob' },
  ],
  event: {
    id: 'evt1',
    title: 'Lake weekend',
    details: '',
    location: null,
    timeZone: 'America/Chicago',
    status: 'confirmed',
    createdBy: 'me',
    createdAt: '2030-01-01T00:00:00Z',
    options: [],
    votes: {},
    confirmed: { date: '2030-06-01' },
    rsvps: {},
    reminders: [],
  },
  comments,
});

describe('EventPage live refresh', () => {
  let visibility: DocumentVisibilityState;
  let gets: number;
  let next: () => Promise<EventDetail>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render() {
    gets = 0;
    next = () => Promise.resolve(detail([comment('c1', 'bob')]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (_path: string, options: { method?: string } = {}) => {
              if (options.method) return Promise.resolve({});
              gets++;
              return next();
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventPage);
    fixture.componentRef.setInput('id', 'evt1');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    return fixture;
  }

  it("checks for new activity every 25 seconds and shows other people's new comments", async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(gets).toBe(1);
    expect(el.querySelectorAll('.ev-comment').length).toBe(1);

    next = () => Promise.resolve(detail([comment('c1', 'bob'), comment('c22', 'bob')]));
    await vi.advanceTimersByTimeAsync(25_000);
    fixture.detectChanges();
    expect(gets).toBe(2);
    expect(el.querySelectorAll('.ev-comment').length).toBe(2);
    expect(el.querySelector('#comment-c22')!.classList).toContain('is-new');
    expect(el.querySelector('#comment-c1')!.classList).not.toContain('is-new');
    expect(el.querySelector('[aria-live="polite"]')!.textContent).toContain('1 new comment');

    // The highlight fades after a few seconds
    await vi.advanceTimersByTimeAsync(8_000);
    fixture.detectChanges();
    expect(el.querySelector('#comment-c22')!.classList).not.toContain('is-new');
  });

  it("doesn't check while the tab is hidden, and checks right away on coming back", async () => {
    const fixture = await render();
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gets).toBe(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(gets).toBe(2);
  });

  it('keeps the page if a background check fails', async () => {
    const fixture = await render();
    next = () => Promise.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(25_000);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')!.textContent).toContain('Lake weekend');
    expect(el.textContent).not.toContain('Something went wrong');
  });
});
