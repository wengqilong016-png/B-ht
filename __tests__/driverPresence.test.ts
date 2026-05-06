import { getDriverPresence, isDriverOnline } from '../utils/driverPresence';

describe('getDriverPresence', () => {
  it('returns offline when lastActive is null', () => {
    expect(getDriverPresence(null)).toEqual(expect.objectContaining({ status: 'offline', labelKey: 'driverOffline' }));
  });

  it('returns offline when lastActive is undefined', () => {
    expect(getDriverPresence(undefined)).toEqual(expect.objectContaining({ status: 'offline', labelKey: 'driverOffline' }));
  });

  it('returns offline when lastActive is an invalid date string', () => {
    expect(getDriverPresence('not-a-date')).toEqual(expect.objectContaining({ status: 'offline', labelKey: 'driverOffline' }));
  });

  it('returns offline when lastActive is in the future (clock skew)', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(getDriverPresence(future)).toEqual(expect.objectContaining({ status: 'offline', labelKey: 'driverOffline' }));
  });

  it('returns online when lastActive is recent (within 5 min)', () => {
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    expect(getDriverPresence(recent)).toEqual(expect.objectContaining({ status: 'online', labelKey: 'driverOnline' }));
  });

  it('returns away when lastActive is between 5 and 30 min ago', () => {
    const away = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(getDriverPresence(away)).toEqual(expect.objectContaining({ status: 'away', labelKey: 'driverAway' }));
  });

  it('returns offline when lastActive is older than 30 min', () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(getDriverPresence(old)).toEqual(expect.objectContaining({ status: 'offline', labelKey: 'driverOffline' }));
  });

  it('returns online exactly at the 5 min boundary', () => {
    const boundary = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(getDriverPresence(boundary).status).toBe('online');
  });

  it('returns away exactly at the 30 min boundary', () => {
    const boundary = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(getDriverPresence(boundary).status).toBe('away');
  });
});

describe('isDriverOnline', () => {
  it('returns true for online driver', () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(isDriverOnline(recent)).toBe(true);
  });

  it('returns false for away driver', () => {
    const away = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    expect(isDriverOnline(away)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDriverOnline(null)).toBe(false);
  });
});
