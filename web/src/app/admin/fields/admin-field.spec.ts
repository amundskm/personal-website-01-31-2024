import { TestBed } from '@angular/core/testing';
import { AdminApi } from '../admin-api';
import { EditorContext } from '../editor-context';
import type { Field, Json } from '../schema';
import { BLOCKS, LINK } from '../schemas';
import { AdminField } from './admin-field';

function render(field: Field, value?: Json, parent: Record<string, Json> = {}) {
  TestBed.configureTestingModule({
    providers: [
      EditorContext,
      {
        provide: AdminApi,
        useValue: {
          linkTargets: () =>
            Promise.resolve([
              { id: 'p1', type: 'page', title: 'About', slug: 'about', status: 'published' },
              { id: 'x1', type: 'project', title: 'Robot', slug: 'robot', status: 'new' },
            ]),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminField);
  fixture.componentRef.setInput('field', field);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('parent', parent);
  const emitted: (Json | undefined)[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => {
    emitted.push(v);
    fixture.componentRef.setInput('value', v);
  });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, emitted, last: () => emitted.at(-1) };
}

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

function click(el: Element | null) {
  (el as HTMLElement).click();
}

function button(el: HTMLElement, text: string) {
  return [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === text)!;
}

describe('AdminField', () => {
  it('edits text, leaving out empty values', () => {
    const { el, last } = render({ name: 'heading', title: 'Heading', kind: 'string' }, 'Hi');
    const input = el.querySelector('input')!;
    expect(input.value).toBe('Hi');
    type(input, 'Hello');
    expect(last()).toBe('Hello');
    type(input, '');
    expect(last()).toBeUndefined();
  });

  it('generates a slug from the title', () => {
    const { el, last } = render(
      { name: 'slug', title: 'Slug', kind: 'slug', source: 'title' },
      undefined,
      { title: 'Hello, Wörld!' },
    );
    click(button(el, 'From title'));
    expect(last()).toBe('hello-world');
  });

  it('stores numbers as numbers', () => {
    const { el, last } = render({ name: 'year', title: 'Year', kind: 'number' });
    type(el.querySelector('input')!, '2024');
    expect(last()).toBe(2024);
  });

  it('picks from a list, keeping option values typed', () => {
    const { el, last } = render({
      name: 'month',
      title: 'Month',
      kind: 'select',
      options: [
        { value: 1, title: 'Jan' },
        { value: 2, title: 'Feb' },
      ],
    });
    const select = el.querySelector('select')!;
    select.selectedIndex = 2;
    select.dispatchEvent(new Event('change'));
    expect(last()).toBe(2);
  });

  it('toggles checkboxes into a list', () => {
    const { el, last } = render(
      {
        name: 'audiences',
        title: 'Who',
        kind: 'checkboxes',
        options: [
          { value: 'wife', title: 'Wife' },
          { value: 'neia-boiz', title: 'NEIA Boiz' },
        ],
      },
      ['wife'],
    );
    const [wife, boiz] = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(wife.checked).toBe(true);
    click(boiz);
    expect(last()).toEqual(['wife', 'neia-boiz']);
    click(wife);
    expect(last()).toEqual(['neia-boiz']);
  });

  it('adds, reorders and removes list items with keys and types', () => {
    const { el, fixture, last } = render({ name: 'navigation', title: 'Navigation', kind: 'list', of: LINK });
    click(button(el, 'Add link'));
    fixture.detectChanges();
    const [item] = last() as Record<string, Json>[];
    expect(item).toMatchObject({ _type: 'link', kind: 'internal', style: 'primary' });
    expect(item['_key']).toMatch(/^[0-9a-f]{12}$/);

    // The new item is open: fill in its label
    type(el.querySelector('input[type=text]')!, 'Blog');
    expect(last()).toEqual([{ ...item, label: 'Blog' }]);

    click(button(el, 'Add link'));
    fixture.detectChanges();
    const [first, second] = last() as Record<string, Json>[];
    click(el.querySelectorAll('[aria-label="Move up"]')[1]);
    expect((last() as Json[])[0]).toEqual(second);
    click(el.querySelectorAll('[aria-label="Remove"]')[0]);
    expect(last()).toEqual([first]);
  });

  it('hides fields that do not apply', () => {
    const { el, fixture } = render(
      { name: 'button', title: 'Button', kind: 'object', fields: LINK.fields },
      { label: 'Go', kind: 'external' },
    );
    fixture.detectChanges();
    const labels = [...el.querySelectorAll('.adm-field > label')].map((l) => l.textContent!.trim());
    expect(labels).toContain('URL');
    expect(labels).not.toContain('Page');
    expect(labels).not.toContain('Path');
  });

  it('adds a chosen section type with its defaults', () => {
    const { el, fixture, last } = render({ name: 'sections', title: 'Sections', kind: 'blocks', of: BLOCKS });
    const select = el.querySelector<HTMLSelectElement>('.adm-add select')!;
    select.value = String(BLOCKS.findIndex((b) => b.type === 'ctaBlock'));
    click(button(el, 'Add section'));
    fixture.detectChanges();
    expect(last()).toEqual([expect.objectContaining({ _type: 'ctaBlock', theme: 'accent' })]);
    expect(el.querySelector('.adm-card__type')!.textContent).toContain('Call to action');
  });

  it('picks references from the link targets', async () => {
    const { el, fixture, last } = render({ name: 'internal', title: 'Page', kind: 'reference', to: ['page', 'post'] });
    await fixture.whenStable();
    fixture.detectChanges();
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.textContent!.trim())).toEqual(['— Choose —', 'About']);
    select.value = 'p1';
    select.dispatchEvent(new Event('change'));
    expect(last()).toEqual({ _type: 'reference', _ref: 'p1' });
  });

  it('shows a project that is not published yet', async () => {
    const { el, fixture } = render({ name: 'projects', title: 'Projects', kind: 'references', to: ['project'] }, [
      { _key: 'a', _type: 'reference', _ref: 'x1' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('select')!.selectedOptions[0].textContent).toContain('Robot (unpublished)');
  });
});
