import { TestBed } from '@angular/core/testing';
import { AdminApi } from '../admin-api';
import { EditorContext } from '../editor-context';
import type { Json } from '../schema';
import { RichTextField } from './rich-text-field';

const paragraph = (key: string, text: string, marks: string[] = []) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}-0`, text, marks }],
});

async function render(value?: Json) {
  TestBed.configureTestingModule({
    providers: [
      EditorContext,
      { provide: AdminApi, useValue: { linkTargets: async () => [], images: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(RichTextField);
  fixture.componentRef.setInput('value', value);
  const emitted: (Json[] | undefined)[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const editor = () => (fixture.componentInstance as unknown as { editor: import('@tiptap/core').Editor }).editor;
  const button = (title: string) => el.querySelector<HTMLButtonElement>(`.rt-toolbar button[title^="${title}"]`)!;
  return { fixture, el, emitted, editor, button, last: () => emitted.at(-1) };
}

describe('RichTextField', () => {
  it('shows existing Portable Text without reporting a change', async () => {
    const { el, emitted } = await render([paragraph('a', 'Hello', ['strong'])]);
    expect(el.querySelector('.ProseMirror strong')!.textContent).toBe('Hello');
    expect(emitted).toEqual([]);
  });

  it('emits Portable Text as you format', async () => {
    const { fixture, editor, button, last } = await render([paragraph('a', 'Hello world')]);
    editor().commands.setTextSelection({ from: 1, to: 6 });
    button('Bold').click();
    fixture.detectChanges();
    const [block] = last() as { children: { text: string; marks: string[] }[]; _key: string }[];
    expect(block._key).toBe('a');
    expect(block.children.map((s) => [s.text, s.marks])).toEqual([
      ['Hello', ['strong']],
      [' world', []],
    ]);
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
  });

  it('turns text into a heading and a list', async () => {
    const { editor, el, last } = await render([paragraph('a', 'Title'), paragraph('b', 'Item')]);
    const style = el.querySelector<HTMLSelectElement>('.rt-toolbar select')!;
    editor().commands.setTextSelection(2);
    style.value = 'h3';
    style.dispatchEvent(new Event('change'));
    editor().commands.setTextSelection(9);
    el.querySelector<HTMLButtonElement>('button[title="Numbered list"]')!.click();
    expect(last()).toEqual([
      expect.objectContaining({ _key: 'a', style: 'h3' }),
      expect.objectContaining({ _key: 'b', listItem: 'number', level: 1 }),
    ]);
  });

  it('adds links, refusing unsafe URLs', async () => {
    const { fixture, el, editor, button, last } = await render([paragraph('a', 'Read more')]);
    editor().commands.setTextSelection({ from: 1, to: 10 });
    button('Link').click();
    fixture.detectChanges();
    const href = el.querySelector<HTMLInputElement>('.rt-panel input[type=text]')!;
    const apply = () => el.querySelector<HTMLFormElement>('.rt-panel')!.dispatchEvent(new Event('submit'));

    href.value = 'javascript:alert(1)';
    apply();
    fixture.detectChanges();
    expect(el.querySelector('.rt-panel [role=alert]')!.textContent).toContain('Use a full URL');

    href.value = 'https://example.com';
    el.querySelector<HTMLInputElement>('.rt-panel input[type=checkbox]')!.checked = true;
    apply();
    fixture.detectChanges();
    const [block] = last() as { markDefs: object[]; children: { marks: string[] }[] }[];
    expect(block.markDefs).toEqual([
      expect.objectContaining({ _type: 'link', href: 'https://example.com', openInNewTab: true }),
    ]);
    expect(el.querySelector('.rt-panel')).toBeNull();
  });

  it('inserts an image and edits it in the panel', async () => {
    const { fixture, el, last } = await render([paragraph('a', 'Text')]);
    el.querySelector<HTMLButtonElement>('button[title="Insert image"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.rt-panel app-image-field')).not.toBeNull();
    expect(last()).toContainEqual(expect.objectContaining({ _type: 'accessibleImage' }));
  });

  it('loads a new value from outside, e.g. a discarded draft', async () => {
    const { fixture, el, emitted } = await render([paragraph('a', 'Draft')]);
    fixture.componentRef.setInput('value', [paragraph('a', 'Published')]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('.ProseMirror')!.textContent).toBe('Published');
    expect(emitted).toEqual([]);
  });

  it('reports cleared text as no value', async () => {
    const { editor, last } = await render([paragraph('a', 'Gone')]);
    editor().commands.clearContent(true);
    expect(last()).toBeUndefined();
  });
});
