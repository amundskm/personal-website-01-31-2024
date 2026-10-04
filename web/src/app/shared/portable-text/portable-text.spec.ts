import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PortableTextComponent } from './portable-text';
import { toPtNodes } from './portable-text-model';

const span = (text: string, marks: string[] = []) => ({ _type: 'span', _key: text, text, marks });

const block = (key: string, children: object[], extra: object = {}) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children,
  ...extra,
});

describe('toPtNodes', () => {
  it('groups consecutive list items into nested lists', () => {
    const nodes = toPtNodes([
      block('1', [span('One')], { listItem: 'bullet', level: 1 }),
      block('2', [span('Two')], { listItem: 'bullet', level: 1 }),
      block('3', [span('Two-A')], { listItem: 'bullet', level: 2 }),
      block('4', [span('After')]),
    ]);

    expect(nodes.map((n) => n.kind)).toEqual(['list', 'block']);
    const list = nodes[0];
    if (list.kind !== 'list') throw new Error('expected list');
    expect(list.ordered).toBe(false);
    expect(list.items.length).toBe(2);
    expect(list.items[1].sublists[0].items[0].children).toEqual([{ kind: 'text', text: 'Two-A' }]);
  });

  it('resolves link annotations as internal or external', () => {
    const nodes = toPtNodes([
      block('p', [span('home', ['l1']), span('ext', ['l2'])], {
        markDefs: [
          { _key: 'l1', _type: 'link', href: '/about' },
          { _key: 'l2', _type: 'link', href: 'https://example.com', openInNewTab: true },
        ],
      }),
    ]);

    const first = nodes[0];
    if (first.kind !== 'block') throw new Error('expected block');
    const links = first.children.map((c) => (c.kind === 'mark' ? c.link : undefined));
    expect(links).toEqual([
      { href: '/about', internal: true, newTab: false },
      { href: 'https://example.com', internal: false, newTab: true },
    ]);
  });

  it('maps images and code blocks', () => {
    const content = [
      { _type: 'accessibleImage', _key: 'img', asset: { _id: 'image-abc-100x100-png' } },
      { _type: 'code', _key: 'code', code: 'const a = 1;', language: 'typescript' },
    ];
    const nodes = toPtNodes(content);
    expect(nodes.map((n) => n.kind)).toEqual(['image', 'code']);
  });

  it('returns an empty array for missing content', () => {
    expect(toPtNodes(null)).toEqual([]);
    expect(toPtNodes(undefined)).toEqual([]);
  });
});

describe('PortableTextComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('renders headings, marks and lists as HTML', async () => {
    const fixture = TestBed.createComponent(PortableTextComponent);
    fixture.componentRef.setInput('value', [
      block('h', [span('Title')], { style: 'h2' }),
      block('p', [span('Hello '), span('world', ['strong']), span('.')]),
      block('l', [span('Item')], { listItem: 'number', level: 1 }),
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h2')?.textContent).toBe('Title');
    expect(el.querySelector('p')?.textContent).toBe('Hello world.');
    expect(el.querySelector('p strong')?.textContent).toBe('world');
    expect(el.querySelector('ol li')?.textContent?.trim()).toBe('Item');
  });

  it('highlights code blocks', async () => {
    const fixture = TestBed.createComponent(PortableTextComponent);
    fixture.componentRef.setInput('value', [
      { _type: 'code', _key: 'c', code: 'const x = 1;', language: 'typescript', filename: 'x.ts' },
    ]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('figcaption')?.textContent).toBe('x.ts');
    expect(el.querySelector('code .hljs-keyword')?.textContent).toBe('const');
  });
});
