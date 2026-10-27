import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { BlockRenderer } from '../../blocks/block-renderer';
import type { Page, Post, Project, SiteSettings } from '../../core/models';
import { Footer } from '../../layout/footer/footer';
import { Header } from '../../layout/header/header';
import { PostArticle } from '../../pages/blog/post-article';
import { ProjectArticle } from '../../pages/projects/project-article';
import type { Collection } from '../schemas';

export type PreviewKind = Collection | 'settings';

/**
 * Unsaved edits rendered by the site's own components, from the content
 * API's preview (the same resolved JSON the site gets). Links are inert so
 * clicking around doesn't leave the editor.
 */
@Component({
  selector: 'app-preview-pane',
  imports: [BlockRenderer, PostArticle, ProjectArticle, Header, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('posts') {
        <app-post-article [post]="$any(data())" />
      }
      @case ('projects') {
        <app-project-article [project]="$any(data())" />
      }
      @case ('settings') {
        <app-header [settings]="$any(data())" />
        <p class="container adm-preview__filler">The page content goes here.</p>
        <app-footer [settings]="$any(data())" />
      }
      @default {
        @let page = $any(data());
        @if (page.sections?.[0]?._type !== 'heroBlock') {
          <h1 class="container">{{ page.title }}</h1>
        }
        <app-block-renderer [sections]="page.sections" />
      }
    }
  `,
})
export class PreviewPane {
  readonly kind = input.required<PreviewKind>();
  readonly data = input.required<Page | Post | Project | SiteSettings>();

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    afterNextRender(() => {
      // Capture phase: runs before RouterLink's own click handler
      host.addEventListener(
        'click',
        (event) => {
          if ((event.target as Element).closest('a')) {
            event.preventDefault();
            event.stopPropagation();
          }
        },
        true,
      );
    });
  }
}
