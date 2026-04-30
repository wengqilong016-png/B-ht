import { haversineM, formatDistance } from '../utils/haversine';

describe('haversineM', () => {
  // NYC→LA: ~3,944 km
  it('returns correct distance for known city pair', () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const lax = { lat: 34.0522, lng: -118.2437 };
    const d = haversineM(nyc, lax);
    expect(d).toBeGreaterThan(3_900_000);
    expect(d).toBeLessThan(4_000_000);
  });

  it('returns 0 for same point', () => {
    const p = { lat: -6.7924, lng: 39.2083 }; // Dar es Salaam
    expect(haversineM(p, p)).toBe(0);
  });

  it('handles short distances (~111 m)', () => {
    // 0.001° ≈ 111 m at equator
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0.001, lng: 0 };
    const d = haversineM(a, b);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it('handles southern hemisphere negative lat', () => {
    const a = { lat: -33.8688, lng: 151.2093 }; // Sydney
    const b = { lat: -37.8136, lng: 144.9631 }; // Melbourne
    const d = haversineM(a, b);
    expect(d).toBeGreaterThan(700_000);  // ~714 km
    expect(d).toBeLessThan(750_000);
  });

  it('handles dateline crossing', () => {
    const a = { lat: 55.7558, lng: -179.5 };  // near Russia
    const b = { lat: 55.7558, lng: 179.5 };   // near Alaska
    const d = haversineM(a, b);
    expect(d).toBeGreaterThan(30_000);  // ~60 km
    expect(d).toBeLessThan(80_000);
  });
});

describe('formatDistance', () => {
  it('shows meters for < 1000m', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(340)).toBe('340 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('shows km with one decimal for >= 1000m', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(2100)).toBe('2.1 km');
    expect(formatDistance(15340)).toBe('15.3 km');
  });
});
