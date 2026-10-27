import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ApiError, AuthService } from '../../core/auth/auth.service';
import { EditorPage } from './editor-page';

interface Call {
  path: string;
  method?: string;
  body?: unknown;
}

const post = {
  id: 'post-1',
  status: 'published',
  title: 'Hello',
  slug: 'hello',
  updatedAt: '2030-01-01T00:00:00Z',
  document: { title: 'Hello', slug: 'hello', publishedAt: '2030-01-01T00:00:00.000Z' },
  assets: {},
};

async function render(inputs: Record<string, unknown>, respond: (call: Call) => unknown = () => post) {
  const calls: Call[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AuthService,
        useValue: {
          fetchContentApi: async (path: string, options: { method?: string; body?: unknown } = {}) => {
            // Every editor loads link targets for its pickers; not what these tests check
            if (path === '/admin/link-targets') return [];
            const call = { path, method: options.method, body: options.body };
            calls.push(call);
            return respond(call);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, calls };
}

function titleInput(el: HTMLElement) {
  return el.querySelector<HTMLInputElement>('#f-title')!;
}

describe('EditorPage', () => {
  it('loads a document and saves edits as a draft', async () => {
    const { fixture, el, calls } = await render({ collection: 'posts', id: 'post-1' }, (call) =>
      call.method === 'PUT' ? { ...post, status: 'changed', document: call.body && (call.body as { document: object }).document } : post,
    );
    expect(calls[0].path).toBe('/admin/posts/post-1');
    expect(titleInput(el).value).toBe('Hello');
    const save = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(save.disabled).toBe(true);

    titleInput(el).value = 'Hello again';
    titleInput(el).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.dirty()).toBe(true);
    save.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/admin/posts/post-1');
    expect(put.body).toEqual({ document: { ...post.document, title: 'Hello again' } });
    expect(fixture.componentInstance.dirty()).toBe(false);
    expect(el.textContent).toContain('Unpublished changes');
    expect(el.textContent).toContain('Draft saved.');
  });

  it('shows the error when a save is rejected', async () => {
    const { fixture, el } = await render({ collection: 'posts', id: 'post-1' }, (call) => {
      if (call.method === 'PUT') throw new ApiError('Slug has already been taken', 422, { slug: ['has already been taken'] });
      return post;
    });
    titleInput(el).value = 'Changed';
    titleInput(el).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Slug has already been taken');
    expect(fixture.componentInstance.dirty()).toBe(true);
  });

  it('starts a new document with its defaults and creates it on save', async () => {
    const { fixture, el, calls } = await render({ collection: 'projects', id: 'new' }, (call) =>
      call.method === 'POST' ? { ...post, id: 'project-9', status: 'new', document: (call.body as { document: object }).document } : null,
    );
    expect(el.querySelector('h1')!.textContent).toContain('New project');
    expect(calls.filter((c) => c.path.startsWith('/admin/projects'))).toEqual([]);

    titleInput(el).value = 'Robot';
    titleInput(el).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();

    const create = calls.find((c) => c.method === 'POST' && c.path === '/admin/projects')!;
    expect(create.body).toEqual({ document: { title: 'Robot', order: 100 } });
    expect(navigate).toHaveBeenCalledWith(['/admin', 'projects', 'project-9'], { replaceUrl: true });
  });

  it('saves the spending plan directly', async () => {
    const plan = { document: { categories: [], stages: [] } };
    const { fixture, el, calls } = await render({ mode: 'spending-plan' }, () => plan);
    expect(calls[0].path).toBe('/admin/spending-plan');
    expect(el.querySelector('h1')!.textContent).toContain('Spending plan');
    expect(el.querySelector('button[type=submit]')!.textContent).toContain('Save');
    expect(el.textContent).not.toContain('Publish');
    fixture.destroy();
  });
});
