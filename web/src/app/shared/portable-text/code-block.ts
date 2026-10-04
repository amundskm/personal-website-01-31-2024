import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

/** Maps @sanity/code-input language values to highlight.js language names. */
const LANGUAGE_ALIASES: Record<string, string> = { html: 'xml', sh: 'bash' };

export interface CodeValue {
  code?: string;
  language?: string;
  filename?: string;
}

/** Syntax-highlighted code block for @sanity/code-input values. */
@Component({
  selector: 'app-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="code">
      @if (value().filename) {
        <figcaption>{{ value().filename }}</figcaption>
      }
      @if (highlighted(); as html) {
        <pre><code class="hljs" [innerHTML]="html"></code></pre>
      } @else {
        <pre><code class="hljs">{{ value().code }}</code></pre>
      }
    </figure>
  `,
})
export class CodeBlockComponent {
  readonly value = input.required<CodeValue>();

  protected readonly highlighted = computed(() => {
    const { code, language } = this.value();
    if (!code || !language) return null;
    const lang = LANGUAGE_ALIASES[language] ?? language;
    return hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : null;
  });
}
