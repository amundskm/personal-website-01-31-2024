import { Editor } from '@tiptap/core';
import { richTextExtensions } from './extensions';
import { fromDoc, type PmNode, type PtBlock, toDoc } from './portable-text-doc';
import { normalize } from './testing';

/** Loads Portable Text into a real editor and reads it back out. */
function throughEditor(blocks: PtBlock[]): PtBlock[] {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: richTextExtensions({ thumbnail: () => undefined }),
    content: toDoc(blocks),
  });
  try {
    return fromDoc(editor.getJSON() as PmNode);
  } finally {
    editor.destroy();
  }
}

const span = (text: string, marks: string[] = []) => ({ _type: 'span' as const, text, marks });

describe('Portable Text through the TipTap editor', () => {
  it('survives the editor schema unchanged', () => {
    const blocks: PtBlock[] = [
      { _type: 'block', _key: 'h', style: 'h2', markDefs: [], children: [span('Heading')] },
      {
        _type: 'block',
        _key: 'p',
        style: 'normal',
        markDefs: [
          { _type: 'link', _key: 'l1', href: 'https://example.com', openInNewTab: true },
          { _type: 'link', _key: 'l2', href: '/about' },
        ],
        children: [
          span('Bold', ['strong']),
          span(' '),
          span('italic', ['em']),
          span(' '),
          span('code', ['code']),
          span(' '),
          span('strike', ['strike-through']),
          span(' '),
          span('external', ['l1']),
          span(' '),
          span('internal', ['l2', 'strong']),
          span('\nnext line'),
        ],
      },
      { _type: 'block', _key: 'q', style: 'blockquote', markDefs: [], children: [span('Quoted')] },
      { _type: 'block', _key: 'a', style: 'normal', listItem: 'bullet', level: 1, markDefs: [], children: [span('One')] },
      { _type: 'block', _key: 'b', style: 'normal', listItem: 'number', level: 2, markDefs: [], children: [span('Nested')] },
      { _type: 'block', _key: 'c', style: 'normal', listItem: 'bullet', level: 1, markDefs: [], children: [span('Two')] },
      { _type: 'code', _key: 'k', language: 'typescript', filename: 'a.ts', code: 'let a = 1;\n', highlightedLines: [1] },
      {
        _type: 'accessibleImage',
        _key: 'i',
        alt: 'Alt',
        caption: 'Caption',
        asset: { _type: 'reference', _ref: 'image-abc-10x10-png' },
        hotspot: { x: 0.2, y: 0.4, width: 0.3, height: 0.3 },
      },
      { _type: 'video', _key: 'v', url: 'https://example.com/v.mp4' },
      { _type: 'block', _key: 'end', style: 'normal', markDefs: [], children: [span('The end.')] },
    ];

    expect(normalize(throughEditor(blocks))).toEqual(normalize(blocks));
  });

  it('gives a paragraph split with Enter its own key', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: richTextExtensions({ thumbnail: () => undefined }),
      content: toDoc([{ _type: 'block', _key: 'only', style: 'normal', markDefs: [], children: [span('AB')] }]),
    });
    editor.commands.setTextSelection(2);
    editor.commands.splitBlock();
    const keys = fromDoc(editor.getJSON() as PmNode).map((b) => b._key);
    editor.destroy();
    expect(keys[0]).toBe('only');
    expect(keys[1]).not.toBe('only');
    expect(keys.length).toBe(2);
  });
});
