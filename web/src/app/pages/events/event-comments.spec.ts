import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import type { EventComment } from '../../core/events/comments';
import type { EventDetail } from '../../core/events/events';
import { EventComments } from './event-comments';

// Made-up people and comments only: the repository is public.
const comment = (id: string, extra: Partial<EventComment> = {}): EventComment => ({
  id,
  eventId: 'evt1',
  parentId: null,
  authorId: 'bob',
  kind: 'comment',
  body: `Body ${id}`,
  createdAt: '2030-01-01T00:00:00Z',
  deleted: false,
  status: null,
  reactions: {},
  ...extra,
});

function detail(meId: string, comments: EventComment[]): EventDetail {
  return {
    me: { id: meId, name: 'Me', hasName: true, isAdmin: false },
    members: [
      { id: 'bob', name: 'Bob' },
      { id: 'org', name: 'Org' },
      { id: 'me', name: 'Me' },
    ],
    event: {
      id: 'evt1',
      title: 'Lake weekend',
      details: '',
      location: null,
      timeZone: 'America/Chicago',
      status: 'polling',
      createdBy: 'org',
      createdAt: '2030-01-01T00:00:00Z',
      options: [],
      votes: {},
      confirmed: null,
      rsvps: {},
      reminders: [],
    },
    comments,
  };
}

describe('EventComments', () => {
  let sent: { path: string; method?: string; body?: unknown }[];
  let fixture: ComponentFixture<EventComments>;
  let changed: number;

  async function render(meId: string, comments: EventComment[]) {
    sent = [];
    changed = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (path: string, options: { method?: string; body?: unknown } = {}) => {
              sent.push({ path, ...options });
              return Promise.resolve({});
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(EventComments);
    fixture.componentRef.setInput('detail', detail(meId, comments));
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const button = (el: HTMLElement, text: string, scope = '') =>
    [...el.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(
      (b) => b.textContent!.trim() === text,
    )!;

  it('nests replies and shows suggestions, reactions and deleted placeholders', async () => {
    const el = await render('me', [
      comment('c1', {
        kind: 'suggestion',
        status: 'accepted',
        reactions: { thumbs: ['bob', 'me'] },
      }),
      comment('c2', { parentId: 'c1', authorId: 'me', createdAt: '2030-01-02T00:00:00Z' }),
      comment('c3', { deleted: true, authorId: null, body: '' }),
      comment('c4', { parentId: 'c3', createdAt: '2030-01-03T00:00:00Z' }),
    ]);
    expect(el.querySelector('h2')!.textContent).toContain('3');
    const top = el.querySelectorAll(':scope .ev-thread > .ev-comment');
    expect(top.length).toBe(4); // both threads plus their replies
    expect(el.querySelector('#comment-c2')!.closest('.ev-comment:not(#comment-c2)')!.id).toBe(
      'comment-c1',
    );
    expect(el.querySelector('.ev-tag')!.textContent).toContain('Suggestion · Accepted');
    expect(el.querySelector('#comment-c3')!.textContent).toContain('Comment deleted');

    const thumbs = el.querySelector<HTMLButtonElement>('#comment-c1 .ev-reaction')!;
    expect(thumbs.textContent!.replace(/\s+/g, ' ').trim()).toBe('👍 2');
    expect(thumbs.getAttribute('aria-pressed')).toBe('true');
    expect(thumbs.title).toBe('Bob, You');
  });

  it('posts a suggestion, then a reply, and asks the page to reload', async () => {
    const el = await render('me', [comment('c1')]);
    el.querySelector<HTMLInputElement>('input[value="suggestion"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('#new-comment')!.value = 'Start at 7';
    el.querySelector<HTMLFormElement>('.ev-composer')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    button(el, 'Reply', '#comment-c1').click();
    fixture.detectChanges();
    el.querySelector<HTMLTextAreaElement>('#reply-c1')!.value = 'Sounds good';
    el.querySelector<HTMLFormElement>('.ev-composer--reply')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(sent).toEqual([
      {
        path: '/events/evt1/comments',
        method: 'POST',
        body: { body: 'Start at 7', kind: 'suggestion', parentId: null },
      },
      {
        path: '/events/evt1/comments',
        method: 'POST',
        body: { body: 'Sounds good', kind: 'comment', parentId: 'c1' },
      },
    ]);
    expect(changed).toBe(2);
  });

  it('toggles a reaction from the picker', async () => {
    const el = await render('me', [comment('c1')]);
    el.querySelector<HTMLButtonElement>('#comment-c1 [aria-expanded]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.ev-picker [aria-label="Cheers"]')!.click();
    await fixture.whenStable();
    expect(sent).toEqual([
      {
        path: '/events/evt1/comments/c1/reactions',
        method: 'PUT',
        body: { reaction: 'cheers', on: true },
      },
    ]);
  });

  it('lets only the author or organizer delete, and only the organizer decide suggestions', async () => {
    let el = await render('me', [comment('c1', { kind: 'suggestion', status: 'open' })]);
    expect(button(el, 'Delete', '#comment-c1')).toBeUndefined();
    expect(button(el, 'Accept', '#comment-c1')).toBeUndefined();

    TestBed.resetTestingModule();
    el = await render('org', [comment('c1', { kind: 'suggestion', status: 'open' })]);
    expect(button(el, 'Delete', '#comment-c1')).toBeDefined();
    button(el, 'Accept', '#comment-c1').click();
    await fixture.whenStable();
    expect(sent).toEqual([
      { path: '/events/evt1/comments/c1/status', method: 'PUT', body: { status: 'accepted' } },
    ]);
  });
});
