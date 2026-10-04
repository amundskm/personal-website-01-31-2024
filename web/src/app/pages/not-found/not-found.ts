import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section status container">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or has moved.</p>
      <a routerLink="/" class="btn btn--primary">Go home</a>
    </section>
  `,
})
export class NotFound implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.setPage({
      title: 'Page not found',
      seo: { title: null, description: null, image: null, noIndex: true },
    });
  }
}
