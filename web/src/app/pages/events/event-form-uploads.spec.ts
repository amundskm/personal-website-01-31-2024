import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EventFilesService } from '../../core/events/event-files.service';
import type { AttachmentKind } from '../../core/events/events';
import { EventFormPage } from './event-form-page';

// Made-up event and files only: the repository is public.
describe('EventFormPage uploads on create', () => {
  let uploaded: [string, AttachmentKind, string][];
  let failName: string | null;

  async function render() {
    uploaded = [];
    failName = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (path: string, options: { method?: string } = {}) =>
              Promise.resolve(
                options.method === 'POST' && path === '/events'
                  ? { id: 'new1' }
                  : {
                      me: { id: 'me', name: 'Me', hasName: true, isAdmin: false },
                      members: [],
                      events: [],
                    },
              ),
          },
        },
        {
          provide: EventFilesService,
          useValue: {
            prepare: (file: File) => Promise.resolve(file),
            check: () => null,
            upload: (eventId: string, kind: AttachmentKind, file: File) => {
              uploaded.push([eventId, kind, file.name]);
              return file.name === failName
                ? Promise.reject(new Error('nope'))
                : Promise.resolve(null);
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventFormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.componentInstance as unknown as {
      title: { set(v: string): void };
      mode: { set(v: string): void };
      dates: { set(v: unknown[]): void };
      coverImage: { set(v: File): void };
      files: { set(v: File[]): void };
      submit(e: Event): Promise<void>;
    };
    form.title.set('Lake weekend');
    form.mode.set('fixed');
    form.dates.set([{ key: 1, date: '2030-06-01', endDate: '', startTime: '', endTime: '' }]);
    form.coverImage.set(new File(['img'], 'cover.jpg', { type: 'image/jpeg' }));
    form.files.set([new File(['a'], 'map.pdf'), new File(['b'], 'menu.pdf')]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { form, navigate };
  }

  it('creates the event, then uploads the image and files to it', async () => {
    const { form, navigate } = await render();
    await form.submit(new Event('submit'));
    expect(uploaded).toEqual([
      ['new1', 'image', 'cover.jpg'],
      ['new1', 'file', 'map.pdf'],
      ['new1', 'file', 'menu.pdf'],
    ]);
    expect(navigate).toHaveBeenCalledWith(['/events', 'new1'], { state: undefined });
  });

  it('still opens the event when a file fails, and says which one', async () => {
    const { form, navigate } = await render();
    failName = 'map.pdf';
    await form.submit(new Event('submit'));
    expect(uploaded.length).toBe(3); // keeps going after a failure
    expect(navigate).toHaveBeenCalledWith(['/events', 'new1'], {
      state: { failedUploads: ['map.pdf'] },
    });
  });
});
