# Driver App Architecture

This document describes the architecture and optimization strategies for the Bahati Jackpots driver application, specifically designed for low-performance mobile devices.

## Overview

The driver app is a Progressive Web App (PWA) optimized for Tanzania's field collection routes. It runs on low-end Android devices with limited memory and processing power.

## Directory Structure

```
/driver/
├── AppDriverShell.tsx           # Main driver UI shell with tab navigation
├── components/                   # Driver-specific components
│   ├── ReadingCapture.tsx       # AI-powered camera scanning (optimized)
│   ├── MachineSelector.tsx      # Location selection with smart prioritization
│   ├── DriverStatusPanel.tsx    # Driver profile and stats
│   ├── FinanceSummary.tsx       # Financial breakdown
│   ├── SubmitReview.tsx         # Transaction submission
│   └── ...
├── hooks/                        # Driver-specific React hooks
│   ├── useCollectionDraft.ts    # Draft state management
│   └── usePerformanceMode.ts    # Device performance detection
├── pages/                        # Driver page views
│   └── DriverCollectionFlow.tsx # Main collection wizard
└── utils/                        # Driver-specific utilities
    └── imageOptimization.ts     # Image compression & performance utils
```

## Performance Optimizations

### 1. Device Performance Detection

The app uses `usePerformanceMode` hook to detect low-end devices based on:
- CPU cores (≤2 cores = low-end)
- Device memory (≤1GB = low-end)
- Network type (2G/slow-2g = low-end)

Located: `/driver/hooks/usePerformanceMode.ts`, `/shared/utils/deviceProfile.ts`

### 2. AI Scanning Optimization

**Problem**: Gemini Vision API calls every 1.5 seconds caused rapid quota exhaustion and memory issues.

**Solutions Implemented**:
- **Debouncing**: Minimum 2-3 seconds between API calls (3s for low-end devices)
- **Reduced Resolution**:
  - Low-end: 640×480 video, 384×384 AI processing
  - Normal: 1280×720 video, 512×512 AI processing
- **Aggressive Compression**:
  - Low-end: 50-60% JPEG quality
  - Normal: 60-70% JPEG quality
- **Memory Management**: Canvas cleared after each capture
- **Scan Interval Adjustment**: 3.5s for low-end, 2.5s for normal devices

Located: `/driver/components/ReadingCapture.tsx`, `/driver/utils/imageOptimization.ts`

### 3. MachineSelector Performance

**Problem**: O(n) priority calculation on every filter change caused lag with 100+ locations.

**Solutions Implemented**:
- **Memoization**: Location metadata cached in Map structure
- **Separated Calculations**: Metadata computed once, then filtered/sorted
- **Optimized Filters**: Separate useMemo for each stage (metadata → cards → overview)

Located: `/driver/components/MachineSelector.tsx` (lines 57-129)

### 4. Image Compression Utilities

Centralized image optimization functions:
- `compressCanvasImage()`: Device-aware compression
- `getOptimalVideoConstraints()`: Resolution selection
- `getOptimalScanInterval()`: API call timing
- `getOptimalAIImageSize()`: Processing size selection
- `clearCanvasMemory()`: Memory cleanup

Located: `/driver/utils/imageOptimization.ts`

## Code Separation from Admin

### Architecture Pattern

```
App.tsx (root)
  └── AppRouterShell (role-based routing)
      ├── AppAdminShell (admin-only)
      └── AppDriverShell (driver-only)
```

### Shared vs. Driver-Specific

**Shared** (used by both):
- Data types (`/types.ts`)
- Data fetching hooks (`/hooks/useSupabaseData.ts`, etc.)
- Common components (`Dashboard`, `TransactionHistory`, `DebtManager`)
- Offline queue (`/offlineQueue.ts`)

**Driver-Specific**:
- Driver UI shell (`/driver/AppDriverShell.tsx`)
- Collection flow (`/driver/pages/DriverCollectionFlow.tsx`)
- Reading capture (`/driver/components/ReadingCapture.tsx`)
- Performance utilities (`/driver/utils/`, `/driver/hooks/`)

### CollectionForm Pattern

Admin uses `CollectionForm.tsx` (a thin wrapper) that internally delegates to `DriverCollectionFlow`, allowing code reuse without duplication.

## Offline Support

The driver app works fully offline:
1. Transactions stored in IndexedDB via `offlineQueue.ts`
2. LocalStorage mirrors critical state (excluding large photos)
3. Auto-sync when connection returns
4. Visual offline indicators in UI

Located: `/offlineQueue.ts`, `/driver/hooks/useCollectionDraft.ts`

## Memory Management

### Critical Considerations

1. **Photos Not Persisted**: Photos excluded from localStorage to avoid 5MB quota
2. **Canvas Cleanup**: `clearCanvasMemory()` called after every capture
3. **Draft Limits**: Only essential data persisted between sessions
4. **Lazy Loading**: Components loaded on-demand via React.lazy()

### Memory Leak Prevention

- Interval refs properly cleaned up in `useEffect` cleanup functions
- Video streams stopped and tracks released on scanner close
- Canvas contexts cleared after image processing

## Bundle Size Optimization

Current production build:
- Driver-specific chunks: ~73KB (DriverCollectionFlow)
- Lazy-loaded components: 9 components in AppDriverShell
- Code splitting by route and feature

See `package.json` scripts:
```bash
npm run build          # Production build
npm run typecheck      # TypeScript validation
```

## Testing

Run tests with:
```bash
npm test               # Run test suite
npm run test:coverage  # Coverage report
npm run test:watch     # Watch mode
```

Test infrastructure: Jest + ts-jest + @testing-library/react

## Performance Metrics

### Before Optimization
- AI scan: Every 1500ms (40 calls/minute)
- Image size: 512×512 @ 60% quality (~80KB)
- Video: 1280×720 (all devices)
- Priority calc: O(n) on every filter change

### After Optimization
- AI scan: Every 2500-3500ms (17-24 calls/minute)
- Image size: 384×384 @ 50% quality (~40KB) on low-end
- Video: 640×480 on low-end devices
- Priority calc: O(1) lookup via memoization

**Estimated savings**: 40% reduction in API calls, 50% reduction in image bandwidth

## Environment Variables

Required for AI features:
```bash
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Known Limitations

1. **AI Quota**: Gemini Vision API has rate limits; manual fallback provided
2. **GPS Dependency**: Some features require GPS permission
3. **Storage Limits**: LocalStorage capped at ~5MB (photos not persisted)
4. **Browser Support**: Requires modern browser with mediaDevices API

## Future Improvements

1. **WebP Support**: Detect and use WebP for smaller images
2. **Image Caching**: Cache recent AI responses to avoid redundant calls
3. **Virtual Scrolling**: For 1000+ location lists
4. **Service Worker Caching**: Cache AI models locally
5. **IndexedDB for Photos**: Move photo storage to IndexedDB

## Contributing

When making changes to driver code:
1. Test on low-end Android device (2GB RAM or less)
2. Verify bundle size impact: `npm run build`
3. Check TypeScript: `npm run typecheck`
4. Run tests: `npm test`
5. Update this documentation if architecture changes

## Contact

For questions about driver app architecture, see:
- `/driver/hooks/usePerformanceMode.ts` - Device detection
- `/driver/utils/imageOptimization.ts` - Image utilities
- `/driver/components/ReadingCapture.tsx` - AI scanning
- `/driver/components/MachineSelector.tsx` - Location selection
