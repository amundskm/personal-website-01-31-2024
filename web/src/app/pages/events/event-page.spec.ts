import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { EventDetail, GroupEvent } from '../../core/events/events';
import { EventPage } from './event-page';

// Made-up people and events only: the repository is public.
const poll: GroupEvent = {
  id: 'evt1',
  title: 'Lake weekend',
  details: 'Bring a chair',
  location: { name: 'The cabin' },
  timeZone: 'America/Chicago',
  status: 'polling',
  createdBy: 'me',
  createdAt: '2030-05-01T00:00:00Z',
  options: [
    { id: 'a', date: '2030-06-01' },
    { id: 'b', date: '2030-06-08', startTime: '18:00' },
  ],
  votes: { bob: { a: 'yes', b: 'no' }, me: { a: 'maybe' } },
  confirmed: null,
  rsvps: {},
  reminders: [{ offsetMinutes: 10080 }],
};

/** Visible text, without the initials drawn in avatar placeholders. */
function textWithoutAvatars(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('app-member-avatar').forEach((a) => a.remove());
  return copy.textContent!.trim();
}

describe('EventPage', () => {
  let sent: { path: string; method?: string; body?: unknown }[];
  let fixture: ComponentFixture<EventPage>;

  async function render(event: GroupEvent, meId = 'me') {
    sent = [];
    const detail: EventDetail = {
      me: { id: meId, name: 'Me', hasName: true, isAdmin: false },
      members: [
        { id: 'bob', name: 'Bob' },
        { id: 'me', name: 'Me' },
        { id: 'zed', name: 'Zed' },
      ],
      event,
      comments: [],
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (path: string, options: { method?: string; body?: unknown } = {}) => {
              if (options.method) sent.push({ path, ...options });
              return Promise.resolve(options.method ? {} : detail);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(EventPage);
    fixture.componentRef.setInput('id', event.id);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the poll grid with you first, everyone else, and the best date', async () => {
    const el = await render(poll);
    const rows = [...el.querySelectorAll('.ev-poll tbody tr')].map((tr) =>
      textWithoutAvatars(tr.querySelector('th')!),
    );
    expect(rows).toEqual(['You', 'Bob', 'Zed']);
    // a: yes + maybe = 3, b: no = 0
    const best = [...el.querySelectorAll('.ev-poll thead th.is-best')].map((th) =>
      th.textContent!.trim(),
    );
    expect(best).toEqual(['Sat, Jun 1']);
    // The organizer can confirm a date
    expect(el.querySelectorAll('.ev-poll tfoot button').length).toBe(2);
  });

  it('saves your vote when you change it', async () => {
    const el = await render(poll);
    const select = el.querySelectorAll<HTMLSelectElement>('.ev-poll tbody tr.is-me select')[1];
    select.value = 'yes';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(sent).toEqual([
      { path: '/events/evt1/votes', method: 'PUT', body: { votes: { a: 'maybe', b: 'yes' } } },
    ]);
  });

  it("doesn't offer organizer controls to other members", async () => {
    const el = await render(poll, 'bob');
    expect(el.querySelectorAll('.ev-poll tfoot button').length).toBe(0);
    expect(el.textContent).not.toContain('Cancel event');
  });

  it('shows RSVPs for a confirmed event and saves yours', async () => {
    const confirmed: GroupEvent = {
      ...poll,
      status: 'confirmed',
      confirmed: { date: '2030-06-01' },
      rsvps: { bob: 'going', zed: 'no' },
    };
    const el = await render(confirmed);
    expect(el.querySelector('.ev-when')?.textContent).toContain('Sat, Jun 1, 2030 · All day');
    expect(el.textContent).toContain('Going (1)');
    expect(el.textContent).toContain('No reply yet (1)');
    expect(el.textContent).toContain('Email reminders: 1 week before');

    const going = [...el.querySelectorAll<HTMLButtonElement>('.ev-choices button')].find(
      (b) => b.textContent!.trim() === 'Going',
    )!;
    going.click();
    await fixture.whenStable();
    expect(sent).toEqual([{ path: '/events/evt1/rsvp', method: 'PUT', body: { rsvp: 'going' } }]);
  });

  it('offers the organizer a quiet or announced restore on a cancelled event', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await render({ ...poll, status: 'cancelled', cancelledFrom: 'polling' });
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.ev-header button')].find(
        (b) => b.textContent!.trim() === label,
      )!;
    expect(el.textContent).not.toContain('Cancel event');

    button('Restore quietly').click();
    await fixture.whenStable();
    button('Restore and email everyone').click();
    await fixture.whenStable();
    expect(sent).toEqual([
      { path: '/events/evt1/restore', method: 'POST', body: { notify: false } },
      { path: '/events/evt1/restore', method: 'POST', body: { notify: true } },
    ]);
    confirmSpy.mockRestore();
  });

  it("doesn't let other members restore", async () => {
    const el = await render({ ...poll, status: 'cancelled' }, 'bob');
    expect(el.textContent).not.toContain('Restore');
  });

  it('shows only invitees, and lets non-invitees follow along without voting', async () => {
    const picked: GroupEvent = { ...poll, invitees: ['bob'], inviteesOnly: false };
    let el = await render(picked, 'me'); // the organizer
    expect(
      [...el.querySelectorAll('.ev-poll tbody th')].map((th) => textWithoutAvatars(th)),
    ).toEqual(['You', 'Bob']);
    expect(el.textContent).toContain('2 people invited.');

    TestBed.resetTestingModule();
    el = await render(picked, 'zed');
    expect(el.querySelector('.ev-notice')?.textContent).toContain("You're not invited");
    expect(el.querySelector('.ev-poll tbody tr.is-me')).toBeNull();
    expect(el.querySelectorAll('.ev-poll select').length).toBe(0);
  });

  it('shows the deadline, and stops voting once it has passed', async () => {
    let el = await render({ ...poll, voteBy: { date: '2999-01-01', time: '17:00' } });
    expect(el.querySelector('.ev-deadline')!.textContent).toContain(
      'Voting closes Tue, Jan 1, 5:00 PM',
    );
    expect(el.querySelector<HTMLSelectElement>('.ev-poll tr.is-me select')!.disabled).toBe(false);

    TestBed.resetTestingModule();
    el = await render({ ...poll, voteBy: { date: '2000-01-01' } });
    expect(el.querySelector('.ev-deadline')!.textContent).toContain(
      'Voting closed Sat, Jan 1, 11:59 PM',
    );
    expect(el.querySelector('.ev-deadline')!.textContent).toContain('extend the deadline');
    expect(el.querySelector<HTMLSelectElement>('.ev-poll tr.is-me select')!.disabled).toBe(true);
    // The organizer can still pick a date
    expect(el.querySelectorAll('.ev-poll tfoot button').length).toBe(2);
  });
});
