import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import type { EventDetail, GroupEvent } from '../../core/events/events';
import { EventAttachments } from './event-attachments';

// Made-up event and files only: the repository is public.
const event = (extra: Partial<GroupEvent> = {}): GroupEvent => ({
  id: 'evt1',
  title: 'Lake weekend',
  details: '',
  location: null,
  timeZone: 'America/Chicago',
  status: 'confirmed',
  createdBy: 'org',
  createdAt: '2030-01-01T00:00:00Z',
  options: [],
  votes: {},
  confirmed: { date: '2030-06-01' },
  rsvps: {},
  reminders: [],
  attachments: [
    {
      id: 'f1',
      name: 'map.pdf',
      size: 2048,
      type: 'application/pdf',
      uploadedAt: '',
      url: 'https://files.example/map',
    },
  ],
  ...extra,
});

describe('EventAttachments', () => {
  let fixture: ComponentFixture<EventAttachments>;
  let calls: { path: string; method?: string; body?: unknown }[];
  let emitted: GroupEvent[];

  async function render(meId: string, e = event()) {
    calls = [];
    emitted = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (path: string, options: { method?: string; body?: unknown } = {}) => {
              calls.push({ path, ...options });
              if (options.method === 'POST') {
                return Promise.resolve({
                  id: 'a1b2c3d4e5f6',
                  name: 'notes.txt',
                  uploadUrl: 'https://s3.example/put',
                });
              }
              return Promise.resolve(event({ attachments: [] }));
            },
          },
        },
      ],
    });
    const detail: EventDetail = {
      me: { id: meId, name: 'Me', hasName: true, isAdmin: false },
      members: [],
      event: e,
      comments: [],
    };
    fixture = TestBed.createComponent(EventAttachments);
    fixture.componentRef.setInput('detail', detail);
    fixture.componentInstance.changed.subscribe((updated) => emitted.push(updated));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists files with download links and sizes for everyone', async () => {
    const el = await render('guest');
    const link = el.querySelector<HTMLAnchorElement>('.ev-files a')!;
    expect(link.href).toBe('https://files.example/map');
    expect(link.getAttribute('download')).toBe('map.pdf');
    expect(el.querySelector('.ev-files')!.textContent).toContain('2 KB');
    expect(el.textContent).not.toContain('Attach a file');
    expect(el.textContent).not.toContain('Remove');
  });

  it('uploads a file: asks for a link, sends it to storage, then attaches it', async () => {
    const put = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const el = await render('org');
    const input = [...el.querySelectorAll<HTMLInputElement>('input[type="file"]')].at(-1)!;
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(calls[0]).toEqual({
      path: '/events/evt1/attachments',
      method: 'POST',
      body: { kind: 'file', name: 'notes.txt', size: 5, type: 'text/plain' },
    });
    expect(put).toHaveBeenCalledWith('https://s3.example/put', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: file,
    });
    expect(calls[1]).toEqual({
      path: '/events/evt1/attachments/a1b2c3d4e5f6',
      method: 'PUT',
      body: { kind: 'file', name: 'notes.txt', type: 'text/plain' },
    });
    expect(emitted.length).toBe(1);
    put.mockRestore();
  });

  it('hides "Attach a file" once there are 5 files, and lets the organizer remove one', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`,
      name: `f${i}.pdf`,
      size: 1,
      type: 'application/pdf',
      uploadedAt: '',
      url: `https://files.example/${i}`,
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await render('org', event({ attachments: five }));
    expect(el.textContent).not.toContain('Attach a file');
    el.querySelector<HTMLButtonElement>('.ev-files button')!.click();
    await fixture.whenStable();
    expect(calls).toEqual([{ path: '/events/evt1/attachments/f0', method: 'DELETE' }]);
  });
});
