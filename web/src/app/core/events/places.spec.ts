import { toPlaceDetails, toSuggestions, validCoords } from './places';

// Made-up places only: the repository is public.
describe('places', () => {
  it('lists places and addresses, skipping query refinements', () => {
    const rows = toSuggestions([
      {
        Title: 'Example Tap',
        SuggestResultItemType: 'Place',
        Place: {
          PlaceId: 'p1',
          PlaceType: 'PointOfInterest',
          Address: { Label: 'Example Tap, 1 Main St, Anytown, IA 50000, United States' },
        },
      },
      { Title: 'example taps near me', SuggestResultItemType: 'Query' },
      {
        Title: '2 Oak Rd, Anytown, IA 50000, United States',
        SuggestResultItemType: 'Place',
        Place: {
          PlaceId: 'p2',
          PlaceType: 'PointAddress',
          Address: { Label: '2 Oak Rd, Anytown, IA 50000, United States' },
        },
      },
    ]);
    expect(rows).toEqual([
      {
        id: 'p1',
        title: 'Example Tap',
        subtitle: '1 Main St, Anytown, IA 50000, United States',
        isPlace: true,
      },
      {
        id: 'p2',
        title: '2 Oak Rd',
        subtitle: 'Anytown, IA 50000, United States',
        isPlace: false,
      },
    ]);
  });

  it('gives a named place its name, and the address without it', () => {
    expect(
      toPlaceDetails({
        PlaceType: 'PointOfInterest',
        Title: 'Example Tap',
        Address: { Label: 'Example Tap, 1 Main St, Anytown, IA 50000, United States' },
        Position: [-92.123456789, 42.987654321],
      }),
    ).toEqual({
      name: 'Example Tap',
      address: '1 Main St, Anytown, IA 50000, United States',
      coords: { lat: 42.98765, lon: -92.12346 },
    });
  });

  it('handles a place whose title differs from the name in its address', () => {
    // Shapes as Amazon Location returns them
    const [row] = toSuggestions([
      {
        Title: 'Example Brewing Company (Example Brewing)',
        SuggestResultItemType: 'Place',
        Place: {
          PlaceId: 'p3',
          PlaceType: 'PointOfInterest',
          Address: { Label: 'Example Brewing Company, 5 Elm St, Anytown, IA 50000, United States' },
        },
      },
    ]);
    expect(row.title).toBe('Example Brewing Company (Example Brewing)');
    expect(row.subtitle).toBe('5 Elm St, Anytown, IA 50000, United States');
  });

  it('gives a plain address no name, and no coordinates if they are missing', () => {
    expect(
      toPlaceDetails({ PlaceType: 'PointAddress', Address: { Label: '2 Oak Rd, Anytown' } }),
    ).toEqual({ name: null, address: '2 Oak Rd, Anytown', coords: null });
    expect(toPlaceDetails({})).toBeNull();
  });

  it('checks coordinates', () => {
    expect(validCoords({ lat: 42.5, lon: -92.4 })).toBe(true);
    expect(validCoords({ lat: 91, lon: 0 })).toBe(false);
    expect(validCoords({ lat: 0, lon: Number.NaN })).toBe(false);
    expect(validCoords({ lat: '42', lon: 0 })).toBe(false);
    expect(validCoords(null)).toBe(false);
  });
});
