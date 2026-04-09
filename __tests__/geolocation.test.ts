import { Geolocation } from '@capacitor/geolocation';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Capacitor Geolocation
jest.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
    requestPermissions: jest.fn(),
    checkPermissions: jest.fn(),
  },
}));

describe('Geolocation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentPosition', () => {
    it('should return current position coordinates', async () => {
      const mockPosition = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10
        },
        timestamp: Date.now()
      };

      (Geolocation.getCurrentPosition as jest.Mock<any>).mockResolvedValue(mockPosition);

      const result = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      expect(result.coords.latitude).toBe(37.7749);
      expect(result.coords.longitude).toBe(-122.4194);
      expect(result.coords.accuracy).toBe(10);
    });

    it('should handle geolocation errors', async () => {
      const mockError = new Error('Location permission denied');
      (Geolocation.getCurrentPosition as jest.Mock<any>).mockRejectedValue(mockError);

      await expect(Geolocation.getCurrentPosition()).rejects.toThrow('Location permission denied');
    });
  });

  describe('watchPosition', () => {
    it('should watch position changes', () => {
      const mockCallback = jest.fn();
      const mockWatchId = 'watch-123';

      (Geolocation.watchPosition as jest.Mock<any>).mockReturnValue(mockWatchId);

      const watchId = Geolocation.watchPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }, mockCallback);

      expect(watchId).toBe(mockWatchId);
      expect(Geolocation.watchPosition).toHaveBeenCalledWith({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }, mockCallback);
    });
  });

  describe('clearWatch', () => {
    it('should clear position watch', () => {
      const mockWatchId = 'watch-123';
      (Geolocation.clearWatch as jest.Mock<any>).mockResolvedValue(undefined);

      Geolocation.clearWatch({ id: mockWatchId });

      expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: mockWatchId });
    });
  });

  describe('permissions', () => {
    it('should request location permissions', async () => {
      const mockPermissionsResult = {
        location: 'granted',
        coarseLocation: 'granted'
      };

      (Geolocation.requestPermissions as jest.Mock<any>).mockResolvedValue(mockPermissionsResult);

      const result = await Geolocation.requestPermissions({
        permissions: ['location', 'locationAlways'] as any
      });

      expect(result.location).toBe('granted');
      expect(result.coarseLocation).toBe('granted');
    });

    it('should check current permissions', async () => {
      const mockPermissions = {
        location: 'granted',
        coarseLocation: 'prompt'
      };

      (Geolocation.checkPermissions as jest.Mock<any>).mockResolvedValue(mockPermissions);

      const result = await Geolocation.checkPermissions();

      expect(result.location).toBe('granted');
      expect(result.coarseLocation).toBe('prompt');
    });
  });
});
