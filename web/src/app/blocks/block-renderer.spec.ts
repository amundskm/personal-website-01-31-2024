import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PageSection } from '../core/models';
import { BLOCK_REGISTRY } from './block-registry';
import { BlockRenderer } from './block-renderer';

@Component({
  selector: 'app-fake-hero',
  template: `<p class="fake-hero">{{ block().heading }}</p>`,
})
class FakeHero {
  readonly block = input.required<{ heading: string }>();
}

@Component({
  selector: 'app-fake-cta',
  template: `<p class="fake-cta">{{ block().heading }}</p>`,
})
class FakeCta {
  readonly block = input.required<{ heading: string }>();
}

const section = (type: string, key: string, heading: string) =>
  ({ _type: type, _key: key, heading }) as unknown as PageSection;

describe('BlockRenderer', () => {
  async function render(sections: PageSection[]) {
    const fixture = TestBed.createComponent(BlockRenderer);
    fixture.componentRef.setInput('sections', sections);
    fixture.componentRef.setInput('registry', { heroBlock: FakeHero, ctaBlock: FakeCta });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders each section with its registered component, in order', async () => {
    const el = await render([
      section('heroBlock', 'a', 'Hello'),
      section('ctaBlock', 'b', 'Get in touch'),
      section('heroBlock', 'c', 'Again'),
    ]);

    const rendered = Array.from(el.querySelectorAll('p')).map(
      (p) => `${p.className}:${p.textContent}`,
    );
    expect(rendered).toEqual(['fake-hero:Hello', 'fake-cta:Get in touch', 'fake-hero:Again']);
  });

  it('skips block types without a registered component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = await render([
      section('mysteryBlock', 'x', 'Nope'),
      section('ctaBlock', 'y', 'Yes'),
    ]);

    expect(el.querySelectorAll('p').length).toBe(1);
    expect(el.textContent).toContain('Yes');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mysteryBlock'));
    warn.mockRestore();
  });

  it('renders nothing for empty or missing sections', async () => {
    expect((await render([])).children.length).toBe(0);
  });
});

describe('BLOCK_REGISTRY', () => {
  const image = {
    _type: 'accessibleImage',
    alt: 'Alt text',
    caption: 'A caption',
    asset: {
      _id: 'image-abc123-1600x900-jpg',
      url: 'https://cdn.sanity.io/images/your-project-id/production/abc123-1600x900.jpg',
      metadata: { lqip: null, dimensions: { width: 1600, height: 900, aspectRatio: 16 / 9 } },
    },
  };
  const link = {
    _key: 'l',
    label: 'Contact',
    kind: 'internal',
    path: '/contact',
    url: null,
    style: 'primary',
    internal: null,
  };
  const text = [
    {
      _type: 'block',
      _key: 't',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: 's', text: 'Body text', marks: [] }],
    },
  ];
  const card = { _id: 'p1', title: 'Card title', slug: 'card', coverImage: image };

  const allBlocks = [
    {
      _type: 'heroBlock',
      _key: '1',
      heading: 'Hero heading',
      subheading: 'Sub',
      image,
      buttons: [link],
      layout: 'split',
      theme: 'dark',
    },
    { _type: 'richTextBlock', _key: '2', content: text, width: 'narrow' },
    { _type: 'imageBlock', _key: '3', image, width: 'wide' },
    {
      _type: 'twoColumnBlock',
      _key: '4',
      heading: 'Columns',
      left: { content: text, image: null },
      right: { content: null, image },
    },
    {
      _type: 'projectGridBlock',
      _key: '5',
      heading: 'Projects',
      mode: 'featured',
      limit: 6,
      showViewAll: true,
      items: [card],
    },
    {
      _type: 'postListBlock',
      _key: '6',
      heading: 'Posts',
      count: 3,
      showViewAll: true,
      items: [{ ...card, _id: 'b1', publishedAt: '2026-01-01T00:00:00Z', tags: ['a'] }],
    },
    {
      _type: 'ctaBlock',
      _key: '7',
      heading: 'CTA heading',
      text: 'CTA text',
      button: link,
      theme: 'accent',
    },
  ] as unknown as PageSection[];

  it('has a test fixture for every registered block type', () => {
    expect(allBlocks.map((b) => b._type).sort()).toEqual(Object.keys(BLOCK_REGISTRY).sort());
  });

  it('renders every real block component without errors', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BlockRenderer);
    fixture.componentRef.setInput('sections', allBlocks);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    for (const expected of [
      'Hero heading',
      'Body text',
      'A caption',
      'Columns',
      'Card title',
      'Posts',
      'CTA heading',
    ]) {
      expect(el.textContent).toContain(expected);
    }
    expect(el.querySelector('h1')?.textContent).toBe('Hero heading');
    expect(el.querySelector('a.btn.btn--primary')?.getAttribute('href')).toBe('/contact');
    expect(el.querySelector('img')?.getAttribute('srcset')).toContain('cdn.sanity.io');
  });
});
