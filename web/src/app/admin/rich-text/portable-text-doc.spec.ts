import { fromDoc, type PmNode, type PtBlock, type PtSpan, type PtTextBlock, toDoc } from './portable-text-doc';
import { normalize } from './testing';

const span = (text: string, marks: string[] = []): PtSpan => ({ _type: 'span', text, marks });
const block = (key: string, children: PtSpan[], extra: Partial<PtTextBlock> = {}): PtTextBlock => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children,
  ...extra,
});

const roundTrip = (blocks: PtBlock[]) => fromDoc(toDoc(blocks));

describe('Portable Text ⇄ editor document', () => {
  it('keeps paragraphs, headings and quotes with their keys', () => {
    const blocks = [
      block('h', [span('Title')], { style: 'h2' }),
      block('p', [span('Plain text')]),
      block('q', [span('A quote')], { style: 'blockquote' }),
      block('h4', [span('Small')], { style: 'h4' }),
    ];
    expect(normalize(roundTrip(blocks))).toEqual(normalize(blocks));
    expect(toDoc(blocks).content!.map((n) => n.type)).toEqual(['heading', 'paragraph', 'blockquote', 'heading']);
  });

  it('keeps decorators and links, including "open in new tab"', () => {
    const blocks = [
      block(
        'b',
        [
          span('Some '),
          span('bold', ['strong']),
          span(' and '),
          span('both', ['em', 'strong']),
          span(', '),
          span('code', ['code']),
          span(', '),
          span('gone', ['strike-through']),
          span(', a '),
          span('link', ['l1']),
          span(' and '),
          span('another', ['l2', 'em']),
        ],
        {
          markDefs: [
            { _type: 'link', _key: 'l1', href: 'https://example.com', openInNewTab: true },
            { _type: 'link', _key: 'l2', href: '/about' },
          ],
        },
      ),
    ];
    expect(normalize(roundTrip(blocks))).toEqual(normalize(blocks));

    const link = toDoc(blocks).content![0].content!.find((n) => n.text === 'link')!;
    expect(link.marks).toEqual([{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', ptKey: 'l1' } }]);
  });

  it('nests lists by level and back', () => {
    const blocks = [
      block('a', [span('One')], { listItem: 'bullet', level: 1 }),
      block('b', [span('One.a')], { listItem: 'number', level: 2 }),
      block('c', [span('One.b')], { listItem: 'number', level: 2 }),
      block('d', [span('Deep')], { listItem: 'bullet', level: 3 }),
      block('e', [span('Two')], { listItem: 'bullet', level: 1 }),
      block('f', [span('After the list')]),
      block('g', [span('Numbered')], { listItem: 'number', level: 1 }),
    ];
    expect(normalize(roundTrip(blocks))).toEqual(normalize(blocks));

    const [bullets, , numbered] = toDoc(blocks).content!;
    expect(bullets.type).toBe('bulletList');
    expect(bullets.content!.length).toBe(2);
    expect(bullets.content![0].content![1].type).toBe('orderedList');
    expect(numbered.type).toBe('orderedList');
  });

  it('splits lists where the kind changes at the same level', () => {
    const blocks = [
      block('a', [span('Bullet')], { listItem: 'bullet', level: 1 }),
      block('b', [span('Number')], { listItem: 'number', level: 1 }),
    ];
    expect(toDoc(blocks).content!.map((n) => n.type)).toEqual(['bulletList', 'orderedList']);
    expect(normalize(roundTrip(blocks))).toEqual(normalize(blocks));
  });

  it('turns newlines into line breaks and back', () => {
    const blocks = [block('p', [span('Line one\nLine two', ['em'])])];
    expect(toDoc(blocks).content![0].content!.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(normalize(roundTrip(blocks))).toEqual(normalize(blocks));
  });

  it('keeps code blocks with language, filename and highlighted lines', () => {
    const blocks: PtBlock[] = [
      { _type: 'code', _key: 'c', language: 'typescript', filename: 'a.ts', code: 'const a = 1;\nconst b = 2;', highlightedLines: [2] },
      { _type: 'code', _key: 'e', code: '' },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('keeps images and unknown blocks whole', () => {
    const blocks: PtBlock[] = [
      {
        _type: 'accessibleImage',
        _key: 'i',
        alt: 'A forest',
        caption: 'Summer',
        asset: { _type: 'reference', _ref: 'image-abc-600x400-jpg' },
        hotspot: { x: 0.3, y: 0.6, width: 0.3, height: 0.3 },
      },
      { _type: 'video', _key: 'v', url: 'https://example.com/v.mp4' },
    ];
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it('gives repeated or missing keys new ones', () => {
    // Pressing Enter copies the paragraph's attributes, key included
    const doc: PmNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { ptKey: 'same' }, content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', attrs: { ptKey: 'same' }, content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
      ],
    };
    const keys = fromDoc(doc).map((b) => b._key);
    expect(keys[0]).toBe('same');
    expect(new Set(keys).size).toBe(3);
  });

  it('drops trailing empty paragraphs and starts empty content with one paragraph', () => {
    expect(fromDoc(toDoc([]))).toEqual([]);
    expect(toDoc(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    const doc: PmNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    };
    expect(fromDoc(doc).length).toBe(1);
  });

  it('reuses one link definition for text split by other marks', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Read ', marks: [{ type: 'link', attrs: { href: '/blog', target: null, ptKey: null } }] },
            {
              type: 'text',
              text: 'this',
              marks: [{ type: 'link', attrs: { href: '/blog', target: null, ptKey: null } }, { type: 'bold' }],
            },
          ],
        },
      ],
    };
    const [result] = fromDoc(doc) as PtTextBlock[];
    expect(result.markDefs!.length).toBe(1);
    expect(result.children!.map((s) => s.marks)).toEqual([[result.markDefs![0]._key], [result.markDefs![0]._key, 'strong']]);
  });
});
