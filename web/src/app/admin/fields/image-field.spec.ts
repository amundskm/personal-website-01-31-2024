import { TestBed } from '@angular/core/testing';
import { AdminApi, type ImageSummary } from '../admin-api';
import { EditorContext } from '../editor-context';
import type { JsonObject } from '../schema';
import { ImageField } from './image-field';

const forest: ImageSummary = {
  id: 'image-forest',
  thumbnailUrl: 'https://api.example.com/images/image-forest?s=x&w=320',
  width: 600,
  height: 400,
  filename: 'forest.jpg',
};

async function render(value?: JsonObject) {
  TestBed.configureTestingModule({
    providers: [
      EditorContext,
      { provide: AdminApi, useValue: { images: async () => [forest], linkTargets: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(ImageField);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('caption', true);
  const emitted: (JsonObject | undefined)[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => {
    emitted.push(v);
    fixture.componentRef.setInput('value', v);
  });
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, last: () => emitted.at(-1) };
}

describe('ImageField', () => {
  it('uses an image from the library, dropping the old crop and focal point', async () => {
    const { fixture, el, last } = await render({
      _type: 'accessibleImage',
      alt: 'Trees',
      asset: { _type: 'reference', _ref: 'image-old' },
      crop: { top: 0.1, bottom: 0, left: 0, right: 0 },
      hotspot: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
    });
    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Choose from library'))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.adm-library__item')!.click();
    fixture.detectChanges();

    expect(last()).toEqual({
      _type: 'accessibleImage',
      alt: 'Trees',
      asset: { _type: 'reference', _ref: 'image-forest' },
    });
    expect(el.querySelector('img')!.getAttribute('src')).toBe(forest.thumbnailUrl);
  });

  it('sets the focal point where the preview is clicked', async () => {
    const { el, last } = await render({ asset: { _type: 'reference', _ref: 'image-forest' } });
    const focus = el.querySelector<HTMLButtonElement>('.adm-image__focus')!;
    focus.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 }) as DOMRect;
    focus.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 125 }));
    expect(last()!['hotspot']).toEqual({ _type: 'sanity.imageHotspot', x: 0.25, y: 0.75, width: 0.3, height: 0.3 });
  });
});
