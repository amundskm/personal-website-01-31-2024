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
      {
        provide: AdminApi,
        useValue: {
          linkTargets: async () => [],
          images: async () => [
            { id: 'image-tree', thumbnailUrl: 'https://api.example.com/images/image-tree?s=x&w=320', width: 4, height: 3, filename: 'tree.jpg' },
          ],
        },
      },
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

  /** The open dialog's inputs and buttons. */
  function dialog(el: HTMLElement, selector: string) {
    const d = el.querySelector<HTMLDialogElement>(selector)!;
    return {
      open: () => d.hasAttribute('open'),
      input: (id: string) => d.querySelector<HTMLInputElement>(`#${id}`)!,
      type: (id: string, text: string) => {
        const input = d.querySelector<HTMLInputElement>(`#${id}`)!;
        input.value = text;
        input.dispatchEvent(new Event('input'));
      },
      button: (text: string) => [...d.querySelectorAll('button')].find((b) => b.textContent!.trim() === text)!,
      element: d,
    };
  }

  it('links selected text from the dialog, refusing unsafe URLs', async () => {
    const { fixture, el, editor, button, last } = await render([paragraph('a', 'Read more')]);
    editor().commands.setTextSelection({ from: 1, to: 10 });
    button('Link').click();
    fixture.detectChanges();
    const link = dialog(el, 'app-link-dialog dialog');
    expect(link.open()).toBe(true);
    expect(link.input('link-dialog-text').value).toBe('Read more');

    link.type('link-dialog-url', 'javascript:alert(1)');
    fixture.detectChanges();
    expect(link.element.querySelector('[role=alert]')!.textContent).toContain('Enter a web address');
    expect(link.button('Add link').disabled).toBe(true);

    // Typed the way people do: no https://
    link.type('link-dialog-url', 'example.com');
    fixture.detectChanges();
    expect(link.element.textContent).toContain('Links to: https://example.com');
    (link.element.querySelector('input[type=checkbox]') as HTMLInputElement).checked = true;
    link.button('Add link').click();
    fixture.detectChanges();
    const [block] = last() as { markDefs: object[]; children: { text: string; marks: string[] }[] }[];
    expect(block.markDefs).toEqual([
      expect.objectContaining({ _type: 'link', href: 'https://example.com', openInNewTab: true }),
    ]);
    expect(block.children.map((s) => s.text)).toEqual(['Read more']);
    expect(link.open()).toBe(false);
  });

  it('inserts linked text when nothing is selected', async () => {
    const { fixture, el, editor, button, last } = await render([paragraph('a', 'See ')]);
    editor().commands.setTextSelection(5);
    button('Link').click();
    fixture.detectChanges();
    const link = dialog(el, 'app-link-dialog dialog');
    expect(link.input('link-dialog-text').value).toBe('');
    link.input('link-dialog-text').value = 'my about page';
    link.type('link-dialog-url', '/about');
    fixture.detectChanges();
    link.button('Add link').click();
    const [block] = last() as { markDefs: { _key: string; href: string }[]; children: { text: string; marks: string[] }[] }[];
    expect(block.children.map((s) => [s.text, s.marks.length])).toEqual([
      ['See ', 0],
      ['my about page', 1],
    ]);
    expect(block.markDefs[0].href).toBe('/about');
  });

  it('edits and removes an existing link', async () => {
    const linked = {
      ...paragraph('a', 'Docs', ['l1']),
      markDefs: [{ _type: 'link', _key: 'l1', href: 'https://old.example.com' }],
    };
    const { fixture, el, editor, button, last } = await render([linked]);
    editor().commands.setTextSelection(2); // Inside the link, nothing selected
    button('Link').click();
    fixture.detectChanges();
    const link = dialog(el, 'app-link-dialog dialog');
    expect(link.input('link-dialog-text').value).toBe('Docs');
    expect(link.input('link-dialog-url').value).toBe('https://old.example.com');

    link.button('Remove link').click();
    const [block] = last() as { markDefs: object[]; children: { text: string; marks: string[] }[] }[];
    expect(block.children).toEqual([expect.objectContaining({ text: 'Docs', marks: [] })]);
  });

  it('adds an image only once it is chosen and confirmed', async () => {
    const { fixture, el, button, last } = await render([paragraph('a', 'Text')]);
    button('Insert image').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const images = dialog(el, 'app-image-dialog dialog');
    expect(images.open()).toBe(true);
    expect(images.button('Add image').disabled).toBe(true);

    // Choosing shows the image's details; nothing is added yet
    images.element.querySelector<HTMLButtonElement>('.adm-library__item')!.click();
    fixture.detectChanges();
    expect(images.open()).toBe(true);
    expect(last()).toBeUndefined();
    const alt = images.element.querySelector<HTMLInputElement>('app-image-field input[type=text]')!;
    alt.value = 'A tree';
    alt.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    images.button('Add image').click();
    fixture.detectChanges();
    expect(images.open()).toBe(false);
    expect(last()).toContainEqual(
      expect.objectContaining({ _type: 'accessibleImage', alt: 'A tree', asset: { _type: 'reference', _ref: 'image-tree' } }),
    );
  });

  it('adds nothing when the image dialog is cancelled, even after choosing', async () => {
    const { fixture, el, button, emitted } = await render([paragraph('a', 'Text')]);
    button('Insert image').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const images = dialog(el, 'app-image-dialog dialog');
    images.element.querySelector<HTMLButtonElement>('.adm-library__item')!.click();
    fixture.detectChanges();
    images.button('Cancel').click();
    fixture.detectChanges();
    expect(images.open()).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('edits an image in its own dialog: Cancel discards, Save applies, Remove deletes', async () => {
    const tree = {
      _type: 'accessibleImage',
      _key: 'img',
      alt: 'Old alt',
      asset: { _type: 'reference', _ref: 'image-tree' },
    };
    const { fixture, el, last } = await render([paragraph('a', 'Text'), tree]);
    const images = dialog(el, 'app-image-dialog dialog');
    const openEditor = () => {
      el.querySelector<HTMLElement>('.rt-atom--ptImage')!.click();
      fixture.detectChanges();
      return images.element.querySelector<HTMLInputElement>('app-image-field input[type=text]')!;
    };
    const setAlt = (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    let alt = openEditor();
    expect(images.open()).toBe(true);
    expect(el.querySelector('#image-dialog-title')!.textContent).toBe('Edit image');
    expect(alt.value).toBe('Old alt');
    setAlt(alt, 'Discarded');
    images.button('Cancel').click();
    expect(last()).toBeUndefined();

    alt = openEditor();
    expect(alt.value).toBe('Old alt');
    setAlt(alt, 'New alt');
    images.button('Save').click();
    expect(last()).toContainEqual(expect.objectContaining({ _key: 'img', alt: 'New alt' }));

    openEditor();
    images.button('Remove image').click();
    expect((last() as { _type: string }[]).map((b) => b._type)).toEqual(['block']);
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

  it('keeps block keys from one change to the next', async () => {
    const { editor, emitted } = await render([]);
    editor().commands.insertContent('One');
    editor().commands.splitBlock();
    editor().commands.insertContent('Two');
    editor().commands.insertContent('!');
    const keys = (value: Json[] | undefined) => (value as { _key: string }[]).map((b) => b._key);
    const [before, after] = emitted.slice(-2);
    expect(keys(after)).toEqual(keys(before));
    expect(new Set(keys(after)).size).toBe(2);
  });

  it('does not reload the same content saved back with its keys reordered', async () => {
    const { fixture, editor, last } = await render([paragraph('a', 'First line')]);
    editor().commands.setTextSelection(11);
    editor().commands.splitBlock(); // An empty line to type on next
    // A save returns the same content with Postgres's key order
    const reorder = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)]))
          : v;
    fixture.componentRef.setInput('value', reorder(last()));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(editor().getJSON().content!.length).toBe(2);
    expect(editor().state.selection.$from.parent.textContent).toBe('');
    expect(editor().state.selection.$from.index(0)).toBe(1);
  });
});
