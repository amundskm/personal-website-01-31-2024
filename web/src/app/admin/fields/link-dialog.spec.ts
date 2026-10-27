import { normalizeHref } from './link-dialog';

describe('normalizeHref', () => {
  it('adds https:// to addresses typed without it', () => {
    expect(normalizeHref('example.com')).toBe('https://example.com');
    expect(normalizeHref(' www.example.com/docs?page=2 ')).toBe('https://www.example.com/docs?page=2');
  });

  it('keeps full addresses and pages on this site', () => {
    expect(normalizeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeHref('http://example.com')).toBe('http://example.com');
    expect(normalizeHref('/blog/hello')).toBe('/blog/hello');
    expect(normalizeHref('mailto:me@example.com')).toBe('mailto:me@example.com');
  });

  it('turns email addresses and phone numbers into links', () => {
    expect(normalizeHref('me@example.com')).toBe('mailto:me@example.com');
    expect(normalizeHref('+1 (563) 555-0100')).toBe('tel:+15635550100');
  });

  it('refuses what cannot be a link', () => {
    for (const bad of ['', '   ', 'about', 'javascript:alert(1)', 'data:text/html,hi', 'not a link']) {
      expect(normalizeHref(bad)).toBeNull();
    }
  });
});
