import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { AddressPicker } from './address-picker';

// Made-up places only: the repository is public.
describe('AddressPicker', () => {
  let calls: string[];
  let failSearch: boolean;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function render() {
    calls = [];
    failSearch = false;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            fetchMembersApi: (path: string) => {
              calls.push(path);
              if (path.includes('?q=')) {
                return failSearch
                  ? Promise.reject(new Error('down'))
                  : Promise.resolve({
                      suggestions: [
                        { id: 'p1', title: 'Example Tap', subtitle: '1 Main St', isPlace: true },
                        { id: 'p2', title: '2 Oak Rd', subtitle: 'Anytown', isPlace: false },
                      ],
                    });
              }
              return Promise.resolve({
                name: 'Example Tap',
                address: '1 Main St, Anytown, IA',
                coords: { lat: 42.5, lon: -92.4 },
              });
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AddressPicker);
    const picked: unknown[] = [];
    fixture.componentInstance.picked.subscribe((p) => picked.push(p));
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();
    };
    const press = async (key: string) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      input.dispatchEvent(event);
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      return event;
    };
    const options = () =>
      [...fixture.nativeElement.querySelectorAll('[role="option"]')] as HTMLElement[];
    return { fixture, input, type, press, options, picked };
  }

  it('waits for a few letters, then suggests', async () => {
    const { type, options, input } = await render();
    await type('Ex');
    expect(calls).toEqual([]);
    await type('Exam');
    expect(calls).toEqual(['/events/places?q=Exam']);
    expect(options().map((o) => o.textContent?.trim())).toEqual([
      'Example Tap, 1 Main St',
      '2 Oak Rd, Anytown',
    ]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('picks with the keyboard and fills in the full address and pin', async () => {
    const { fixture, type, press, options, input, picked } = await render();
    await type('Exam');
    await press('ArrowDown');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id);
    const enter = await press('Enter');
    expect(enter.defaultPrevented).toBe(true); // doesn't submit the form
    expect(calls.at(-1)).toBe('/events/places?id=p1');
    expect(fixture.componentInstance.address()).toBe('1 Main St, Anytown, IA');
    expect(fixture.componentInstance.coords()).toEqual({ lat: 42.5, lon: -92.4 });
    expect(picked).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Found on the map');
  });

  it('forgets the pin once the address is edited by hand', async () => {
    const { fixture, type } = await render();
    fixture.componentInstance.coords.set({ lat: 1, lon: 2 });
    await type('3 Gravel Rd');
    expect(fixture.componentInstance.coords()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Not matched to a map address');
  });

  it('still lets you type when search is down', async () => {
    const { fixture, type, options } = await render();
    failSearch = true;
    await type('3 Gravel Rd');
    expect(options()).toEqual([]);
    expect(fixture.componentInstance.address()).toBe('3 Gravel Rd');
    expect(fixture.nativeElement.textContent).toContain("Address search isn't working");
  });
});
