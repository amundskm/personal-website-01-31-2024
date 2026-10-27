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
import { ImageField } from './image-field';

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
  imports: [ImageField],
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
        <button type="button" title="Insert image" (click)="insertImage()">Image</button>
        <button type="button" title="Code block" [attr.aria-pressed]="!!state().code" (click)="run((c) => c.toggleCodeBlock())">Code block</button>
        <span class="rt-sep"></span>
        <button type="button" title="Undo (Ctrl+Z)" (click)="run((c) => c.undo())" aria-label="Undo">↶</button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" (click)="run((c) => c.redo())" aria-label="Redo">↷</button>
      </div>

      @if (linkOpen()) {
        <form class="rt-panel" (submit)="$event.preventDefault(); applyLink(href.value, newTab.checked)">
          <label class="adm-field">
            <span>Link to</span>
            <input #href type="text" [value]="linkHref()" placeholder="https://…, /about, mailto:…" autofocus />
          </label>
          <label class="adm-check"><input #newTab type="checkbox" [checked]="linkNewTab()" /> Open in a new tab</label>
          @if (linkError(); as message) {
            <p class="adm-error" role="alert">{{ message }}</p>
          }
          <div class="button-row">
            <button type="submit" class="btn btn--secondary adm-btn-sm">Apply</button>
            @if (state().marks.link) {
              <button type="button" class="btn btn--text" (click)="removeLink()">Remove link</button>
            }
            <button type="button" class="btn btn--text" (click)="linkOpen.set(false)">Cancel</button>
          </div>
        </form>
      }

      @if (state().image; as image) {
        <div class="rt-panel">
          <app-image-field [value]="image" [caption]="true" (valueChange)="updateImage($event)" />
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
  protected readonly linkOpen = signal(false);
  protected readonly linkHref = signal('');
  protected readonly linkNewTab = signal(false);
  protected readonly linkError = signal<string | null>(null);

  constructor() {
    afterNextRender(() => {
      this.editor = new Editor({
        element: this.content().nativeElement,
        extensions: richTextExtensions({ thumbnail: (id) => this.context.assets()[id]?.thumbnailUrl }),
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

  protected openLink(): void {
    const attrs = this.editor?.getAttributes('link') ?? {};
    this.linkHref.set(attrs['href'] ?? '');
    this.linkNewTab.set(attrs['target'] === '_blank');
    this.linkError.set(null);
    this.linkOpen.set(true);
  }

  protected applyLink(href: string, newTab: boolean): void {
    href = href.trim();
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) {
      this.linkError.set('Use a full URL (https://…), a path on this site (/about), mailto: or tel:.');
      return;
    }
    this.run((c) => c.extendMarkRange('link').setLink({ href, target: newTab ? '_blank' : null }));
    this.linkOpen.set(false);
  }

  protected removeLink(): void {
    this.run((c) => c.extendMarkRange('link').unsetLink());
    this.linkOpen.set(false);
  }

  /**
   * Adds an empty image after the current block (images aren't inline, so the
   * text isn't split) and selects it, which opens the image panel.
   */
  protected insertImage(): void {
    const editor = this.editor;
    if (!editor) return;
    const { selection } = editor.state;
    const pos = selection.$from.depth ? selection.$from.after(1) : selection.to;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, { type: 'ptImage', attrs: { data: { _type: 'accessibleImage' } } })
      .setNodeSelection(pos)
      .run();
  }

  /** Changes the selected image, or removes it when the image field is cleared. */
  protected updateImage(data: JsonObject | undefined): void {
    if (!data) this.run((c) => c.deleteSelection());
    else this.editor?.commands.updateAttributes('ptImage', { data: { _type: 'accessibleImage', ...data } });
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
