import type { PtBlock, PtTextBlock } from './portable-text-doc';

/**
 * What a round trip must preserve: everything except span keys, and how text
 * is split into spans with identical marks (the editor merges those).
 */
export function normalize(blocks: readonly PtBlock[]): unknown[] {
  return blocks.map((block) => {
    if (block._type !== 'block') return block;
    const text = block as PtTextBlock;
    const spans: { text: string; marks: string[] }[] = [];
    for (const span of text.children ?? []) {
      const marks = [...(span.marks ?? [])].sort();
      const last = spans.at(-1);
      if (last && last.marks.join() === marks.join()) last.text += span.text;
      else spans.push({ text: span.text, marks });
    }
    return {
      _type: 'block',
      _key: text._key,
      style: text.style ?? 'normal',
      ...(text.listItem ? { listItem: text.listItem, level: text.level ?? 1 } : {}),
      markDefs: [...(text.markDefs ?? [])].sort((a, b) => a._key.localeCompare(b._key)),
      children: spans.filter((span) => span.text || spans.length === 1),
    };
  });
}
