import { Extension, type Extensions, Node } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { newKey } from '../schema';

/**
 * The editor's schema: what Portable Text can hold (see blockContent in the
 * old Studio schema) and nothing more.
 */
export interface RichTextOptions {
  /** Thumbnail URL for an image asset id, if known. */
  thumbnail: (assetId: string) => string | undefined;
  /** An image in the text was clicked (at this document position). */
  editImage?: (pos: number) => void;
}

/** Attributes that carry Portable Text data the editor doesn't display. */
const PortableTextAttributes = Extension.create({
  name: 'portableTextAttributes',
  addGlobalAttributes() {
    // Not copied when a block is split with Enter: the new block needs its own key
    const key = { default: null, rendered: false, keepOnSplit: false };
    return [
      { types: ['paragraph', 'heading', 'codeBlock'], attributes: { ptKey: key } },
      {
        types: ['codeBlock'],
        attributes: {
          filename: { default: null, rendered: false },
          highlightedLines: { default: null, rendered: false },
        },
      },
      { types: ['link'], attributes: { ptKey: { default: null, rendered: false } } },
    ];
  },
});

/** Blocks whose Portable Text `_key` is a node attribute; atoms keep it in `data`. */
const KEYED = new Set(['paragraph', 'heading', 'codeBlock']);
const ATOMS = new Set(['ptImage', 'ptUnknown']);

/**
 * Gives every block a key as soon as it exists (new paragraphs, split ones,
 * inserted images), so keys stay the same from one change to the next.
 */
const StableKeys = Extension.create({
  name: 'portableTextKeys',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('portableTextKeys'),
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const seen = new Set<string>();
          let tr: Transaction | null = null;
          const fresh = (key: unknown) => typeof key !== 'string' || !key || seen.has(key);
          state.doc.descendants((node, pos) => {
            if (KEYED.has(node.type.name)) {
              let key = node.attrs['ptKey'];
              if (fresh(key)) (tr ??= state.tr).setNodeAttribute(pos, 'ptKey', (key = newKey()));
              seen.add(key);
            } else if (ATOMS.has(node.type.name)) {
              const data = (node.attrs['data'] ?? {}) as Record<string, unknown>;
              let key = data['_key'];
              if (fresh(key)) (tr ??= state.tr).setNodeAttribute(pos, 'data', { ...data, _key: (key = newKey()) });
              seen.add(key as string);
            }
          });
          // Keys aren't an edit: keep them out of undo
          return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
});

/** A block stored whole: an image usage, or a block type the editor doesn't know. */
function atomBlock(
  name: string,
  render: (data: Record<string, unknown>, dom: HTMLElement) => void,
  onClick?: (pos: number) => void,
) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return { data: { default: null, rendered: false } };
    },
    parseHTML() {
      return [{ tag: `div[data-${name}]` }];
    },
    renderHTML() {
      return ['div', { [`data-${name}`]: '' }];
    },
    addNodeView() {
      return ({ node, getPos }) => {
        const dom = document.createElement('figure');
        dom.className = `rt-atom rt-atom--${name}`;
        dom.contentEditable = 'false';
        if (onClick) {
          dom.title = 'Click to edit';
          dom.addEventListener('click', () => {
            const pos = getPos();
            if (typeof pos === 'number') onClick(pos);
          });
        }
        render((node.attrs['data'] ?? {}) as Record<string, unknown>, dom);
        return {
          dom,
          // Re-render when the data changes (e.g. alt text edited in the panel)
          update: (updated) => {
            if (updated.type.name !== name) return false;
            dom.replaceChildren();
            render((updated.attrs['data'] ?? {}) as Record<string, unknown>, dom);
            return true;
          },
        };
      };
    },
  });
}

export function richTextExtensions(options: RichTextOptions): Extensions {
  const PtImage = atomBlock('ptImage', (data, dom) => {
    const ref = (data['asset'] as { _ref?: string } | undefined)?._ref;
    const url = ref ? options.thumbnail(ref) : undefined;
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = String(data['alt'] ?? '');
      dom.append(img);
    } else {
      dom.append(Object.assign(document.createElement('span'), { textContent: ref ? 'Image' : 'Choose an image' }));
    }
    const caption = String(data['caption'] ?? data['alt'] ?? '');
    if (caption) dom.append(Object.assign(document.createElement('figcaption'), { textContent: caption }));
  }, options.editImage);

  const PtUnknown = atomBlock('ptUnknown', (data, dom) => {
    dom.textContent = `Unsupported block (${String(data['_type'] ?? 'unknown')}): kept as is`;
  });

  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      // No Portable Text equivalent
      horizontalRule: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        // Links open in the same tab unless "open in new tab" is chosen
        HTMLAttributes: { target: null, rel: null },
        isAllowedUri: (url) => /^(https?:|mailto:|tel:|\/)/i.test(url),
      },
    }),
    PortableTextAttributes,
    StableKeys,
    PtImage,
    PtUnknown,
  ];
}
