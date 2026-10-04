import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PostCard } from '../../core/models';
import { SanityImageComponent } from '../sanity-image/sanity-image';
import { WizardHat } from '../wizard/wizard-hat';

@Component({
  selector: 'app-post-card',
  imports: [DatePipe, RouterLink, SanityImageComponent, WizardHat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card">
      @if (post().coverImage?.asset) {
        <a
          [routerLink]="['/blog', post().slug]"
          class="card__media"
          tabindex="-1"
          aria-hidden="true"
        >
          <app-sanity-image
            [image]="post().coverImage"
            [width]="640"
            [aspectRatio]="16 / 9"
            sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
          />
        </a>
      } @else {
        <div class="card__media card__placeholder" style="aspect-ratio: 16 / 9" aria-hidden="true">
          <app-wizard-hat />
        </div>
      }
      <div class="card__body">
        @if (post().publishedAt) {
          <time class="card__meta" [attr.datetime]="post().publishedAt">{{
            post().publishedAt | date: 'mediumDate'
          }}</time>
        }
        <h3 class="card__title">
          <a [routerLink]="['/blog', post().slug]">{{ post().title }}</a>
        </h3>
        @if (post().excerpt) {
          <p class="card__text">{{ post().excerpt }}</p>
        }
        @if (post().tags?.length) {
          <ul class="tags" aria-label="Tags">
            @for (tag of post().tags; track tag) {
              <li class="tag">{{ tag }}</li>
            }
          </ul>
        }
      </div>
    </article>
  `,
  styleUrl: './card.scss',
})
export class PostCardComponent {
  readonly post = input.required<PostCard>();
}
