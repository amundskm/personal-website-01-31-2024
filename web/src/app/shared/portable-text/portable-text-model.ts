import {
  buildMarksTree,
  isPortableTextBlock,
  isPortableTextToolkitList,
  isPortableTextToolkitSpan,
  isPortableTextToolkitTextNode,
  LIST_NEST_MODE_HTML,
  nestLists,
  type ToolkitPortableTextList,
} from '@portabletext/toolkit';
import type { PortableTextBlock } from '@portabletext/types';
import type { SanityImage } from '../../core/models';
import type { CodeValue } from './code-block';

/**
 * A flattened, template-friendly view of Portable Text. Converting up front
 * keeps the Angular template free of type checks on Sanity's raw structures.
 */
export type PtNode =
  | { kind: 'block'; key: string; style: string; children: PtSpan[] }
  | { kind: 'list'; key: string; ordered: boolean; items: PtListItem[] }
  | { kind: 'image'; key: string; image: SanityImage }
  | { kind: 'code'; key: string; value: CodeValue }
  | { kind: 'unknown'; key: string; type: string };

export interface PtListItem {
  key: string;
  children: PtSpan[];
  sublists: Extract<PtNode, { kind: 'list' }>[];
}

export type PtSpan =
  | { kind: 'text'; text: string }
  | { kind: 'mark'; mark: string; link?: PtLink; children: PtSpan[] };

export interface PtLink {
  href: string;
  internal: boolean;
  newTab: boolean;
}

type AnyNode = { _type: string; _key?: string };

export function toPtNodes(value: readonly AnyNode[] | null | undefined): PtNode[] {
  if (!value?.length) return [];
  const nested: AnyNode[] = nestLists(value as unknown as PortableTextBlock[], LIST_NEST_MODE_HTML);
  return nested.map((node, index) => toNode(node, index));
}

function toNode(node: AnyNode, index: number): PtNode {
  const key = node._key ?? String(index);

  if (isPortableTextToolkitList(node as never)) {
    return toList(node as unknown as ToolkitPortableTextList);
  }
  if (isPortableTextBlock(node as never)) {
    const block = node as unknown as PortableTextBlock;
    return {
      kind: 'block',
      key,
      style: block.style ?? 'normal',
      children: toSpans(buildMarksTree(block)),
    };
  }
  if (node._type === 'accessibleImage' || node._type === 'image') {
    return { kind: 'image', key, image: node as unknown as SanityImage };
  }
  if (node._type === 'code') {
    return { kind: 'code', key, value: node as CodeValue };
  }
  return { kind: 'unknown', key, type: node._type };
}

function toList(list: ToolkitPortableTextList): Extract<PtNode, { kind: 'list' }> {
  return {
    kind: 'list',
    key: list._key,
    ordered: list.listItem === 'number',
    items: (list.children as AnyNode[]).map((item, i) => {
      const children = (item as { children?: AnyNode[] }).children ?? [];
      const sublists = children
        .filter((c) => isPortableTextToolkitList(c as never))
        .map((c) => toList(c as unknown as ToolkitPortableTextList));
      const spans = children.filter((c) => !isPortableTextToolkitList(c as never));
      const block = { ...item, children: spans } as unknown as PortableTextBlock;
      return { key: item._key ?? String(i), children: toSpans(buildMarksTree(block)), sublists };
    }),
  };
}

function toSpans(nodes: ReturnType<typeof buildMarksTree>): PtSpan[] {
  return nodes.map((node): PtSpan => {
    if (isPortableTextToolkitTextNode(node)) {
      return { kind: 'text', text: node.text };
    }
    if (isPortableTextToolkitSpan(node)) {
      return {
        kind: 'mark',
        mark: node.markType,
        link: node.markType === 'link' ? toLink(node.markDef) : undefined,
        children: toSpans(node.children),
      };
    }
    // Inline objects are not part of the schema; render nothing for them.
    return { kind: 'text', text: '' };
  });
}

function toLink(markDef: unknown): PtLink | undefined {
  const def = markDef as { href?: string; openInNewTab?: boolean } | undefined;
  if (!def?.href) return undefined;
  const internal = def.href.startsWith('/');
  return { href: def.href, internal, newTab: !internal && !!def.openInNewTab };
}
