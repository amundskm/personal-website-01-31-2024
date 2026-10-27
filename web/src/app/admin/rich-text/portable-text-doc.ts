import { newKey } from '../schema';

/**
 * Converts between Portable Text (how rich text is stored and rendered) and
 * the ProseMirror document the TipTap editor edits. Pure functions, so the
 * round trip is tested without an editor.
 *
 * Portable Text is a flat list of blocks; lists are blocks with `listItem`
 * and `level`. ProseMirror nests them (bulletList > listItem > paragraph).
 * Block and link keys are carried in node/mark attributes (`ptKey`) so
 * unchanged content keeps its keys. Images, and any block type the editor
 * doesn't know, are kept whole in an atom node's `data` attribute.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PtSpan {
  _type: 'span';
  _key?: string;
  text: string;
  marks?: string[];
}

export interface PtMarkDef {
  _type: string;
  _key: string;
  href?: string;
  openInNewTab?: boolean;
  [key: string]: unknown;
}

export interface PtTextBlock {
  _type: 'block';
  _key?: string;
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs?: PtMarkDef[];
  children?: PtSpan[];
}

export interface PtCode {
  _type: 'code';
  _key?: string;
  code?: string;
  language?: string;
  filename?: string;
  highlightedLines?: number[];
}

export type PtBlock = PtTextBlock | PtCode | { _type: string; _key?: string; [key: string]: unknown };

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
}

/** Marks Portable Text calls decorators, by editor mark name. */
const DECORATORS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  code: 'code',
  strike: 'strike-through',
};
const MARKS = Object.fromEntries(Object.entries(DECORATORS).map(([mark, decorator]) => [decorator, mark]));

const HEADINGS: Record<string, number> = { h2: 2, h3: 3, h4: 4 };

/** Block types stored whole in an atom node. */
export const IMAGE_TYPES = new Set(['accessibleImage', 'image']);

// ---------------------------------------------------------------------------
// Portable Text → editor document
// ---------------------------------------------------------------------------

export function toDoc(value: readonly unknown[] | null | undefined): PmNode {
  const blocks = (value ?? []).filter((b): b is PtBlock => !!b && typeof b === 'object' && '_type' in b);
  const content: PmNode[] = [];

  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i];
    if (isListBlock(block)) {
      const [list, next] = listFrom(blocks, i, block.level ?? 1);
      content.push(list);
      i = next;
      continue;
    }
    content.push(blockNode(block));
    i++;
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function isListBlock(block: PtBlock): block is PtTextBlock & { listItem: 'bullet' | 'number' } {
  return block._type === 'block' && !!(block as PtTextBlock).listItem;
}

function blockNode(block: PtBlock): PmNode {
  if (block._type === 'code') {
    const code = block as PtCode;
    return {
      type: 'codeBlock',
      attrs: {
        ptKey: code._key ?? null,
        language: code.language ?? null,
        filename: code.filename ?? null,
        highlightedLines: code.highlightedLines ?? null,
      },
      ...(code.code ? { content: [{ type: 'text', text: code.code }] } : {}),
    };
  }
  if (IMAGE_TYPES.has(block._type)) return { type: 'ptImage', attrs: { data: block } };
  if (block._type !== 'block') return { type: 'ptUnknown', attrs: { data: block } };

  const text = block as PtTextBlock;
  const paragraph = textNode(text);
  const level = HEADINGS[text.style ?? ''];
  if (level) return { ...paragraph, type: 'heading', attrs: { ...paragraph.attrs, level } };
  if (text.style === 'blockquote') return { type: 'blockquote', content: [paragraph] };
  return paragraph;
}

/** A paragraph with the block's text (styles are applied by the caller). */
function textNode(block: PtTextBlock): PmNode {
  const defs = new Map((block.markDefs ?? []).map((def) => [def._key, def]));
  const content: PmNode[] = [];

  for (const span of block.children ?? []) {
    if (span._type !== 'span' || !span.text) continue;
    const marks = (span.marks ?? []).flatMap((mark): PmMark[] => {
      if (MARKS[mark]) return [{ type: MARKS[mark] }];
      const def = defs.get(mark);
      if (def?._type === 'link') {
        return [{ type: 'link', attrs: { href: def.href ?? '', target: def.openInNewTab ? '_blank' : null, ptKey: def._key } }];
      }
      return []; // Unknown annotations are dropped
    });
    // Line breaks inside a block are newlines in Portable Text
    span.text.split('\n').forEach((line, index) => {
      if (index > 0) content.push({ type: 'hardBreak', ...(marks.length ? { marks } : {}) });
      if (line) content.push({ type: 'text', text: line, ...(marks.length ? { marks } : {}) });
    });
  }

  return { type: 'paragraph', attrs: { ptKey: block._key ?? null }, ...(content.length ? { content } : {}) };
}

/** Consecutive list blocks from `start` at `level` or deeper, as one (nested) list. */
function listFrom(blocks: PtBlock[], start: number, level: number): [PmNode, number] {
  const first = blocks[start] as PtTextBlock;
  const kind = first.listItem;
  const items: PmNode[] = [];
  let i = start;

  while (i < blocks.length) {
    const block = blocks[i];
    if (!isListBlock(block)) break;
    const blockLevel = block.level ?? 1;
    if (blockLevel < level) break;

    if (blockLevel === level) {
      if (block.listItem !== kind) break; // A different kind of list starts here
      items.push({ type: 'listItem', content: [textNode(block)] });
      i++;
    } else {
      const [nested, next] = listFrom(blocks, i, level + 1);
      if (!items.length) items.push({ type: 'listItem', content: [{ type: 'paragraph' }] });
      items.at(-1)!.content!.push(nested);
      i = next;
    }
  }

  return [{ type: kind === 'number' ? 'orderedList' : 'bulletList', content: items }, i];
}

// ---------------------------------------------------------------------------
// Editor document → Portable Text
// ---------------------------------------------------------------------------

export function fromDoc(doc: PmNode): PtBlock[] {
  const blocks: PtBlock[] = [];
  const usedKeys = new Set<string>();
  // Splitting a paragraph copies its attributes, so keys can repeat
  const key = (candidate: unknown): string => {
    let next = typeof candidate === 'string' && candidate && !usedKeys.has(candidate) ? candidate : newKey();
    while (usedKeys.has(next)) next = newKey();
    usedKeys.add(next);
    return next;
  };

  const walk = (node: PmNode, context: { style?: string; list?: 'bullet' | 'number'; level?: number }) => {
    switch (node.type) {
      case 'paragraph':
      case 'heading': {
        const style = node.type === 'heading' ? `h${node.attrs?.['level'] ?? 2}` : (context.style ?? 'normal');
        blocks.push(textBlock(node, key(node.attrs?.['ptKey']), style, context));
        return;
      }
      case 'blockquote':
        node.content?.forEach((child) => walk(child, { ...context, style: 'blockquote' }));
        return;
      case 'bulletList':
      case 'orderedList': {
        const list = node.type === 'orderedList' ? 'number' : 'bullet';
        const level = (context.level ?? 0) + 1;
        for (const item of node.content ?? []) {
          item.content?.forEach((child) => walk(child, { list, level }));
        }
        return;
      }
      case 'codeBlock': {
        const attrs = node.attrs ?? {};
        const code: PtCode = { _type: 'code', _key: key(attrs['ptKey']) };
        if (attrs['language']) code.language = attrs['language'] as string;
        if (attrs['filename']) code.filename = attrs['filename'] as string;
        if (Array.isArray(attrs['highlightedLines'])) code.highlightedLines = attrs['highlightedLines'] as number[];
        code.code = (node.content ?? []).map((child) => child.text ?? '').join('');
        blocks.push(code);
        return;
      }
      case 'ptImage':
      case 'ptUnknown': {
        const data = node.attrs?.['data'] as PtBlock | null;
        if (data) blocks.push({ ...data, _key: key(data._key) });
        return;
      }
      default:
        node.content?.forEach((child) => walk(child, context));
    }
  };

  doc.content?.forEach((node) => walk(node, {}));

  // The editor always keeps a paragraph; trailing empty ones aren't content
  while (blocks.length && isEmptyText(blocks.at(-1)!)) blocks.pop();
  return blocks;
}

function textBlock(
  node: PmNode,
  key: string,
  style: string,
  context: { list?: 'bullet' | 'number'; level?: number },
): PtTextBlock {
  const markDefs: PtMarkDef[] = [];
  const children: PtSpan[] = [];

  for (const child of node.content ?? []) {
    const text = child.type === 'hardBreak' ? '\n' : child.type === 'text' ? child.text : undefined;
    if (!text) continue;

    // A line break has its own marks (none, unless typed inside formatting)
    const marks: string[] = [];
    for (const mark of child.marks ?? []) {
      if (DECORATORS[mark.type]) marks.push(DECORATORS[mark.type]);
      else if (mark.type === 'link') marks.push(linkDef(markDefs, mark.attrs ?? {}));
    }
    appendText(children, text, marks);
  }

  if (!children.length) children.push({ _type: 'span', text: '', marks: [] });
  children.forEach((span, i) => (span._key = `${key}-${i}`));

  return {
    _type: 'block',
    _key: key,
    style,
    ...(context.list ? { listItem: context.list, level: context.level } : {}),
    markDefs,
    children,
  };
}

/** Adds text to the last span when its marks match, else as a new span. */
function appendText(children: PtSpan[], text: string, marks: string[]): void {
  const last = children.at(-1);
  if (last && sameMarks(last.marks ?? [], marks)) last.text += text;
  else children.push({ _type: 'span', text, marks: [...marks] });
}

function sameMarks(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

/** The markDef key for a link, reusing one with the same key or target. */
function linkDef(defs: PtMarkDef[], attrs: Record<string, unknown>): string {
  const href = String(attrs['href'] ?? '');
  const openInNewTab = attrs['target'] === '_blank';
  const wanted = typeof attrs['ptKey'] === 'string' ? attrs['ptKey'] : null;
  const existing = defs.find((def) => (wanted ? def._key === wanted : def.href === href && !!def.openInNewTab === openInNewTab));
  if (existing) return existing._key;

  const def: PtMarkDef = { _type: 'link', _key: wanted ?? newKey(), href };
  if (openInNewTab) def.openInNewTab = true;
  defs.push(def);
  return def._key;
}

function isEmptyText(block: PtBlock): boolean {
  if (block._type !== 'block') return false;
  const text = block as PtTextBlock;
  return !text.listItem && (text.style ?? 'normal') === 'normal' && (text.children ?? []).every((span) => !span.text);
}
