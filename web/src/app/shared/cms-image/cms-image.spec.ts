import { TestBed } from '@angular/core/testing';
import { IMAGE_WIDTHS } from '../../core/image';
import type { CmsImage } from '../../core/models';
import { CmsImageComponent } from './cms-image';

const image: CmsImage = {
  alt: 'A forest',
  asset: {
    _id: 'image-abc-6000x4000-jpg',
    url: 'https://api.example.com/images/image-abc-6000x4000-jpg?hotspot=0.3000%2C0.5000&s=sig',
    metadata: { lqip: 'data:image/jpeg;base64,AAAA', dimensions: { width: 6000, height: 4000 } },
  },
};

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(CmsImageComponent);
  for (const [name, value] of Object.entries({ image, ...inputs })) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('img') as HTMLImageElement;
}

const widthsOf = (srcset: string) =>
  srcset.split(', ').map((candidate) => Number(/&w=(\d+)/.exec(candidate)?.[1]));

describe('CmsImageComponent', () => {
  it('requests sizes from the signed usage URL, keeping the original ratio', () => {
    const img = render({ width: 800 });
    expect(img.getAttribute('src')).toBe(`${image.asset!.url}&w=800`);
    expect(img.getAttribute('height')).toBe('533');
    expect(img.alt).toBe('A forest');
    expect(img.style.backgroundImage).toContain('data:image/jpeg');
  });

  it('crops to a forced aspect ratio with a matching height at every width', () => {
    const img = render({ width: 1200, aspectRatio: 2 });
    expect(img.getAttribute('src')).toBe(`${image.asset!.url}&w=1200&h=600`);
    for (const candidate of img.getAttribute('srcset')!.split(', ')) {
      const [, w, h] = /&w=(\d+)&h=(\d+)/.exec(candidate)!;
      expect(Number(h)).toBe(Math.round(Number(w) / 2));
    }
  });

  it('only asks for widths the API serves, up to twice the display width', () => {
    const widths = widthsOf(render({ width: 720 }).getAttribute('srcset')!);
    expect(widths.every((w) => IMAGE_WIDTHS.includes(w) && w <= 1440)).toBe(true);
    expect(widths).toContain(720);
  });

  it('renders nothing without an image file', () => {
    expect(render({ image: { asset: null } })).toBeNull();
  });
});
