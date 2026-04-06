require('@testing-library/jest-dom');

// Mock @vercel/analytics
jest.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock Leaflet
jest.mock('leaflet', () => ({
  map: jest.fn(() => ({
    on: jest.fn(),
    remove: jest.fn(),
    addLayer: jest.fn(),
    setView: jest.fn(),
    invalidateSize: jest.fn(),
  })),
  tileLayer: jest.fn(() => ({
    addTo: jest.fn(),
  })),
  marker: jest.fn(() => ({
    addTo: jest.fn(),
    bindPopup: jest.fn(),
  })),
  circle: jest.fn(() => ({
    addTo: jest.fn(),
  })),
  icon: jest.fn(),
}));

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          data: [],
          error: null,
        })),
        order: jest.fn(),
        limit: jest.fn(),
      })),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    })),
  })),
}));

// Mock @capacitor/geolocation
jest.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: jest.fn().mockResolvedValue({
      coords: { latitude: -6.7924, longitude: 39.2083, accuracy: 10 },
      timestamp: Date.now(),
    }),
    watchPosition: jest.fn().mockReturnValue('watch-id-1'),
    clearWatch: jest.fn().mockResolvedValue(undefined),
    checkPermissions: jest.fn().mockResolvedValue({ location: 'granted' }),
    requestPermissions: jest.fn().mockResolvedValue({ location: 'granted' }),
  },
}));

// Mock @sentry/react
jest.mock('@sentry/react', () => ({
  init: jest.fn(),
  withScope: jest.fn((cb) => cb({ setExtra: jest.fn() })),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  ErrorBoundary: ({ children }) => children,
}));