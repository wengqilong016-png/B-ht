# Copilot Instructions for Bahati Jackpots

## Project Overview

**Bahati Jackpots** is a progressive web application (PWA) for managing slot-machine collection routes in Tanzania. It serves two roles:

- **Admin** – oversees all drivers, machines (locations), revenue, settlements, and reporting.
- **Driver** – collects cash from assigned machines, submits daily collections, and records expenses.

The admin panel is primarily in Chinese (zh); the driver interface is in Swahili (sw). Both are handled through the `TRANSLATIONS` map in `types.ts`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| UI components | Lucide React icons, Recharts (charts), Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL) |
| AI | Google Gemini via `@google/genai` |
| Offline support | localStorage queue + 20-second sync loop |
| Maps (planned) | Google Maps JavaScript API (see Roadmap below) |

Build: `npm run build` (Vite).  
Dev server: `npm run dev`.  
No test suite exists; validate changes manually.

---

## Architecture & Key Conventions

### File layout
```
App.tsx                  – Root component, routing, data fetching, sync loop
types.ts                 – All shared TypeScript interfaces and constants
supabaseClient.ts        – Supabase client + health-check helper
components/
  Dashboard.tsx          – Admin overview, driver cards, map panel
  CollectionForm.tsx     – Driver data-entry form (GPS, photo, score)
  TransactionHistory.tsx – Audit log
  FinancialReports.tsx   – Revenue/expense charts
  AIHub.tsx              – Gemini-powered audit queries
  DebtManager.tsx        – Startup-debt and driver-loan tracking
  DriverManagement.tsx   – CRUD for driver accounts
  Login.tsx              – Shared login screen
```

### State & sync pattern
- All mutable collections (`transactions`, `drivers`, `locations`, `dailySettlements`, `aiLogs`) live in `App.tsx` state and are mirrored to `localStorage`.
- Items are saved with `isSynced: false`; the 20-second interval loop calls `syncOfflineData()` to flush pending records to Supabase.
- Always mark `isSynced: false` before updating local state, then set `isSynced: true` after a successful Supabase upsert.
- Supabase tables: `locations`, `drivers`, `transactions`, `daily_settlements`, `ai_logs`, `notifications`.

### Roles
- `admin` – full access; default language `zh`.
- `driver` – restricted to `collect` and `debt` views; default language `sw`.

### GPS & location
- `Location.coords` stores a machine's fixed GPS coordinate `{ lat, lng }`.
- `Driver.currentGps` and `Driver.lastActive` are updated every 20 seconds by the heartbeat when the driver is online.
- `Transaction.gps` records where the driver was when they submitted a collection.
- `getDistance()` in `types.ts` implements the Haversine formula (returns meters).

---

## Desired Feature Roadmap

The following features are planned and should be implemented following the conventions above.

### 1. Google Maps Integration (Admin Panel)
- Embed the **Google Maps JavaScript API** in the Dashboard using the admin's personal API key (stored in env var `VITE_GOOGLE_MAPS_API_KEY`).
- Show all active `Location` markers (machines) on the map using their `coords` field.
- Show live driver positions using `Driver.currentGps`, refreshed in real time.
- Clicking a location marker should open an info-window with: machine name, last score, assigned driver, debt status.
- Clicking a driver marker should open an info-window with: driver name, last active time, today's collection count.
- Implement a `MapView` component in `components/MapView.tsx`; load the Maps API script dynamically (avoid SSR issues).

### 2. Driver Daily Route Timeline
- For each driver, aggregate their `transactions` for a selected date into a chronological timeline.
- On the map, **draw a polyline** connecting each transaction's `gps` coordinate in submission order, forming the day's route.
- In the admin panel, provide a **timeline sidebar** listing each stop: time, location name, revenue, and GPS deviation.
- Export the route as a downloadable PNG using the Google Maps Static API, or as a PDF by printing the timeline page view.

### 3. Daily Work Check-in
- Drivers should "check in" at the start of their shift. Capture GPS at check-in time and store it as a `check_in` transaction type (or a dedicated field on `DailySettlement`).
- Show a check-in / check-out timestamp on the driver's daily settlement card in the admin panel.
- Display a timeline widget per driver showing: check-in → each collection stop → check-out.

### 4. Admin Map Dashboard Optimisations
- Add a **date picker** to the admin map panel so the admin can replay any past day's routes.
- Add a **heatmap layer** (Google Maps Visualization library) showing machine revenue density.
- Add a **filter bar** to show/hide drivers, areas, or machine statuses on the map.
- Use clustering (MarkerClusterer) when more than 20 machine markers are visible.

---

## Environment Variables

```
VITE_SUPABASE_URL=         # Supabase project URL
VITE_SUPABASE_ANON_KEY=    # Supabase anon/public key
VITE_GEMINI_API_KEY=       # Google Gemini API key
VITE_GOOGLE_MAPS_API_KEY=  # Google Maps JavaScript API key (admin map)
```

---

## Coding Guidelines

- Use **TypeScript** for all new files; extend interfaces in `types.ts` rather than defining inline types.
- Match the existing Tailwind CSS dark/light pattern: dark header (`bg-slate-900`), light main area (`bg-slate-50`).
- Use `lucide-react` for icons; do not introduce a second icon library.
- Keep API keys out of source code; always read from `import.meta.env.VITE_*`.
- For new Supabase tables, add the SQL in `setup_db.sql`.
- All user-facing strings for admin should have a `zh` entry and for drivers a `sw` entry in `TRANSLATIONS` inside `types.ts`.
- Follow the offline-first pattern: save locally first (`isSynced: false`), then upsert to Supabase.
