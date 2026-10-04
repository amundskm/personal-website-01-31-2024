import { DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { urlFor } from './image';
import type { SanityImage, Seo, SiteSettings } from './models';

export interface PageMeta {
  title?: string | null;
  description?: string | null;
  image?: SanityImage | null;
  seo?: Seo;
  type?: 'website' | 'article';
}

/** Keeps <title> and meta tags in sync with the current page and site defaults. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  private readonly site = signal<SiteSettings | null>(null);
  private readonly page = signal<PageMeta | null>(null);

  constructor() {
    effect(() => this.apply(this.site(), this.page()));
  }

  setSiteDefaults(settings: SiteSettings | null): void {
    this.site.set(settings);
  }

  setPage(meta: PageMeta | null): void {
    this.page.set(meta);
  }

  private apply(site: SiteSettings | null, page: PageMeta | null): void {
    const siteTitle = site?.title ?? '';
    const pageTitle = page?.seo?.title ?? page?.title;
    const fullTitle =
      pageTitle && pageTitle !== siteTitle ? `${pageTitle} | ${siteTitle}` : siteTitle;
    const description =
      page?.seo?.description ??
      page?.description ??
      site?.seo?.description ??
      site?.description ??
      '';
    const image = page?.seo?.image ?? page?.image ?? site?.seo?.image;
    const imageUrl = urlFor(image)?.width(1200).height(630).fit('crop').url() ?? null;
    const noIndex = page?.seo?.noIndex ?? site?.seo?.noIndex ?? false;

    if (fullTitle) this.title.setTitle(fullTitle);
    this.setTag('name', 'description', description);
    this.setTag('property', 'og:title', fullTitle);
    this.setTag('property', 'og:description', description);
    this.setTag('property', 'og:type', page?.type ?? 'website');
    this.setTag('property', 'og:url', this.document.location?.href ?? '');
    this.setTag('property', 'og:image', imageUrl);
    this.setTag('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    this.setTag('name', 'robots', noIndex ? 'noindex, nofollow' : null);
  }

  private setTag(attr: 'name' | 'property', key: string, content: string | null): void {
    const selector = `${attr}="${key}"`;
    if (content) {
      this.meta.updateTag({ [attr]: key, content }, selector);
    } else {
      this.meta.removeTag(selector);
    }
  }
}
