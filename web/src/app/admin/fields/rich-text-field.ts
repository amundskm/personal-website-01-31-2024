import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { EditorContext } from '../editor-context';
import { richTextExtensions } from '../rich-text/extensions';
import { fromDoc, type PmNode, toDoc } from '../rich-text/portable-text-doc';
import type { Json, JsonObject } from '../schema';
import { ImageDialog } from './image-dialog';
import { LinkDialog, type LinkValue } from './link-dialog';

/** Languages offered for code blocks (as in the old Studio). */
const LANGUAGES = [
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['scss', 'SCSS'],
  ['json', 'JSON'],
  ['sh', 'Bash'],
  ['python', 'Python'],
  ['csharp', 'C#'],
  ['java', 'Java'],
  ['sql', 'SQL'],
  ['yaml', 'YAML'],
  ['markdown', 'Markdown'],
] as const;

type BlockStyle = 'paragraph' | 'h2' | 'h3' | 'h4';

/** What the toolbar reflects about the current selection. */
interface SelectionState {
  style: BlockStyle;
  marks: Record<'bold' | 'italic' | 'code' | 'strike' | 'link', boolean>;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  /** The selected image's Portable Text, when an image is selected. */
  image: JsonObject | null;
  /** Language and filename of the code block the cursor is in. */
  code: { language: string; filename: string } | null;
}

const EMPTY_STATE: SelectionState = {
  style: 'paragraph',
  marks: { bold: false, italic: false, code: false, strike: false, link: false },
  bulletList: false,
  orderedList: false,
  blockquote: false,
  image: null,
  code: null,
};

/**
 * Rich text, edited with TipTap and stored as Portable Text (see
 * rich-text/portable-text-doc.ts for the conversion).
 */
@Component({
  selector: 'app-rich-text-field',
  imports: [ImageDialog, LinkDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rich-text-field.scss',
  template: `
    <div class="rt" [class.rt--focused]="focused()">
      <div class="rt-toolbar" role="toolbar" aria-label="Formatting">
        <select aria-label="Text style" [value]="state().style" (change)="setStyle($any($event.target).value)">
          <option value="paragraph">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>
        <span class="rt-sep"></span>
        <button type="button" title="Bold (Ctrl+B)" [attr.aria-pressed]="state().marks.bold" (click)="run((c) => c.toggleBold())"><b>B</b></button>
        <button type="button" title="Italic (Ctrl+I)" [attr.aria-pressed]="state().marks.italic" (click)="run((c) => c.toggleItalic())"><i>I</i></button>
        <button type="button" title="Inline code" [attr.aria-pressed]="state().marks.code" (click)="run((c) => c.toggleCode())"><code>&lt;/&gt;</code></button>
        <button type="button" title="Strikethrough" [attr.aria-pressed]="state().marks.strike" (click)="run((c) => c.toggleStrike())"><s>S</s></button>
        <button type="button" title="Link" [attr.aria-pressed]="state().marks.link" (click)="openLink()">Link</button>
        <span class="rt-sep"></span>
        <button type="button" title="Bulleted list" [attr.aria-pressed]="state().bulletList" (click)="run((c) => c.toggleBulletList())">• List</button>
        <button type="button" title="Numbered list" [attr.aria-pressed]="state().orderedList" (click)="run((c) => c.toggleOrderedList())">1. List</button>
        <button type="button" title="Quote" [attr.aria-pressed]="state().blockquote" (click)="run((c) => c.toggleBlockquote())">Quote</button>
        <span class="rt-sep"></span>
        <button type="button" title="Insert image" (click)="openImagePicker()">Image</button>
        <button type="button" title="Code block" [attr.aria-pressed]="!!state().code" (click)="run((c) => c.toggleCodeBlock())">Code block</button>
        <span class="rt-sep"></span>
        <button type="button" title="Undo (Ctrl+Z)" (click)="run((c) => c.undo())" aria-label="Undo">↶</button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" (click)="run((c) => c.redo())" aria-label="Redo">↷</button>
      </div>

      @if (state().image) {
        <div class="rt-panel rt-panel--bar">
          <span class="rt-panel__title">Image selected</span>
          <button type="button" class="btn btn--secondary adm-btn-sm" (click)="editSelectedImage()">Edit image</button>
          <button type="button" class="btn btn--text adm-danger" (click)="run((c) => c.deleteSelection())">Remove</button>
        </div>
      }

      @if (state().code; as code) {
        <div class="rt-panel rt-panel--row">
          <label class="adm-field">
            <span>Language</span>
            <select (change)="updateCode('language', $any($event.target).value)">
              <option value="" [selected]="!code.language">Plain text</option>
              @for (lang of languages; track lang[0]) {
                <option [value]="lang[0]" [selected]="code.language === lang[0]">{{ lang[1] }}</option>
              }
            </select>
          </label>
          <label class="adm-field">
            <span>File name</span>
            <input type="text" [value]="code.filename" (change)="updateCode('filename', $any($event.target).value)" />
          </label>
        </div>
      }

      <div #content class="rt-content prose"></div>
    </div>

    <app-link-dialog #linkDialog (applied)="applyLink($event)" (removed)="removeLink()" />
    <app-image-dialog (saved)="saveImage($event)" (removed)="removeImage()" />
  `,
})
export class RichTextField {
  private readonly context = inject(EditorContext);

  readonly value = input<Json | undefined>();
  readonly valueChange = output<Json[] | undefined>();

  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private editor: Editor | null = null;
  /**
   * The content this editor last emitted (canonical JSON), so its own changes,
   * and the same content saved and reloaded, aren't loaded back in: that would
   * reset the cursor and drop an empty line you're about to type on.
   */
  private lastEmitted: string | null = null;

  protected readonly languages = LANGUAGES;
  protected readonly state = signal<SelectionState>(EMPTY_STATE);
  protected readonly focused = signal(false);
  private readonly linkDialog = viewChild.required(LinkDialog);
  private readonly imageDialog = viewChild.required(ImageDialog);
  /** What the open link dialog applies to: the selection, or the link being edited. */
  private linkRange = { from: 0, to: 0 };
  /** The image dialog's target: where a new image goes, or the image being edited. */
  private imageTarget: { editing: boolean; pos: number } = { editing: false, pos: 0 };

  constructor() {
    afterNextRender(() => {
      this.editor = new Editor({
        element: this.content().nativeElement,
        extensions: richTextExtensions({
          thumbnail: (id) => this.context.assets()[id]?.thumbnailUrl,
          editImage: (pos) => this.editImage(pos),
        }),
        content: toDoc(this.blocks()),
        onUpdate: ({ editor }) => this.emit(editor),
        onTransaction: ({ editor }) => this.state.set(readState(editor)),
        onFocus: () => this.focused.set(true),
        onBlur: () => this.focused.set(false),
      });
      this.lastEmitted = canonical(this.blocks());
    });

    // Load the value when it changes from outside (e.g. a discarded draft)
    effect(() => {
      const blocks = this.blocks();
      if (!this.editor || canonical(blocks) === this.lastEmitted) return;
      this.lastEmitted = canonical(blocks);
      this.editor.commands.setContent(toDoc(blocks), { emitUpdate: false });
    });

    inject(DestroyRef).onDestroy(() => this.editor?.destroy());
  }

  private blocks(): unknown[] {
    const value = this.value();
    return Array.isArray(value) ? value : [];
  }

  private emit(editor: Editor): void {
    const blocks = fromDoc(editor.getJSON() as PmNode) as Json[];
    this.lastEmitted = canonical(blocks);
    this.valueChange.emit(blocks.length ? blocks : undefined);
  }

  /** Runs editor commands on the current selection. */
  protected run(commands: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>): void {
    if (this.editor) commands(this.editor.chain().focus()).run();
  }

  protected setStyle(style: BlockStyle): void {
    this.run((c) => (style === 'paragraph' ? c.setParagraph() : c.setHeading({ level: Number(style.slice(1)) as 2 | 3 | 4 })));
  }

  /**
   * Opens the link dialog for the selected text, or for the whole link when
   * the cursor is in one. With nothing selected, the dialog's text is inserted.
   */
  protected openLink(): void {
    const editor = this.editor;
    if (!editor) return;
    const editing = editor.isActive('link');
    if (editing) editor.commands.extendMarkRange('link');
    const { from, to } = editor.state.selection;
    this.linkRange = { from, to };
    const attrs = editor.getAttributes('link');
    this.linkDialog().show(
      {
        text: editor.state.doc.textBetween(from, to, ' '),
        href: editing ? (attrs['href'] ?? '') : '',
        newTab: editing && attrs['target'] === '_blank',
      },
      editing,
    );
  }

  protected applyLink({ text, href, newTab }: LinkValue): void {
    const editor = this.editor;
    if (!editor) return;
    const { from, to } = this.linkRange;
    const link = { href, target: newTab ? '_blank' : null };
    const unchanged = from < to && editor.state.doc.textBetween(from, to, ' ') === text;
    const chain = editor.chain().focus();
    if (unchanged) {
      // Same text: keep its other formatting and just link it
      chain.setTextSelection({ from, to }).setLink(link);
    } else {
      chain.insertContentAt({ from, to }, { type: 'text', text, marks: [{ type: 'link', attrs: link }] });
    }
    // Carry on typing after the link, not inside it
    chain.setTextSelection(from + text.length).unsetMark('link').run();
  }

  protected removeLink(): void {
    const { from, to } = this.linkRange;
    this.editor?.chain().focus().setTextSelection({ from, to }).unsetLink().run();
  }

  /** Opens the image dialog to add one after the block the cursor is in. */
  protected openImagePicker(): void {
    const editor = this.editor;
    if (!editor) return;
    const { selection } = editor.state;
    this.imageTarget = { editing: false, pos: selection.$from.depth ? selection.$from.after(1) : selection.to };
    this.imageDialog().add();
  }

  protected editSelectedImage(): void {
    const selection = this.editor?.state.selection;
    if (selection instanceof NodeSelection) this.editImage(selection.from);
  }

  /** Opens the image dialog for the image at `pos` (clicked, or selected). */
  private editImage(pos: number): void {
    const node = this.editor?.state.doc.nodeAt(pos);
    if (node?.type.name !== 'ptImage') return;
    this.imageTarget = { editing: true, pos };
    this.imageDialog().edit((node.attrs['data'] ?? {}) as JsonObject);
  }

  /** Adds the image from the dialog, or saves changes to the one being edited. */
  protected saveImage(image: JsonObject): void {
    const editor = this.editor;
    if (!editor) return;
    const data = { _type: 'accessibleImage', ...image };
    const { editing, pos } = this.imageTarget;
    if (editing) {
      editor.chain().focus().setNodeSelection(pos).updateAttributes('ptImage', { data }).run();
    } else {
      const at = Math.min(pos, editor.state.doc.content.size);
      editor.chain().focus().insertContentAt(at, { type: 'ptImage', attrs: { data } }).run();
    }
  }

  protected removeImage(): void {
    const { editing, pos } = this.imageTarget;
    if (editing) this.editor?.chain().focus().setNodeSelection(pos).deleteSelection().run();
  }

  protected updateCode(name: 'language' | 'filename', value: string): void {
    this.editor?.commands.updateAttributes('codeBlock', { [name]: value.trim() || null });
  }
}

/**
 * JSON with object keys sorted: equal for the same content however it was
 * serialized (Postgres returns saved JSON with its keys reordered).
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

function readState(editor: Editor): SelectionState {
  const { selection } = editor.state;
  const selected = selection instanceof NodeSelection ? selection.node : null;
  const heading = [2, 3, 4].find((level) => editor.isActive('heading', { level }));
  const inCode = editor.isActive('codeBlock');
  const codeAttrs = inCode ? editor.getAttributes('codeBlock') : {};
  return {
    style: heading ? (`h${heading}` as BlockStyle) : 'paragraph',
    marks: {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      code: editor.isActive('code'),
      strike: editor.isActive('strike'),
      link: editor.isActive('link'),
    },
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    image: selected?.type.name === 'ptImage' ? ((selected.attrs['data'] ?? {}) as JsonObject) : null,
    code: inCode ? { language: codeAttrs['language'] ?? '', filename: codeAttrs['filename'] ?? '' } : null,
  };
}
