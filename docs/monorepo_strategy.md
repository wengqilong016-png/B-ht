# Monorepo / Multi-App Strategy

This repository contains **two separate React applications** that share a Supabase backend but are built and deployed independently.

---

## Applications at a Glance

| | Root app (`/`) | Driver app (`driver-app/`) |
|---|---|---|
| **Purpose** | Full admin + driver PWA | Lightweight driver-only PWA for low-end devices |
| **React version** | 19.x | 18.x |
| **Vite version** | 6.x | 5.x |
| **TypeScript** | ~5.8 | ^5.6 |
| **Deployment** | Firebase Hosting / Vercel | Independent (own Vercel/Firebase project or sub-path) |
| **Package manager** | npm (`package-lock.json`) | npm (`package-lock.json`) |
| **Install command** | `npm ci` | `cd driver-app && npm ci` |
| **Build command** | `npm run build` | `cd driver-app && npm run build` |

---

## Why Are the Versions Different?

`driver-app/` was introduced in PR #100 as a **separate, lightweight bundle** targeting drivers using older Android devices with limited memory and bandwidth. It intentionally uses an older, smaller React 18 + Vite 5 stack to:

1. Keep the bundle smaller (React 19 and Vite 6 have no meaningful size advantage for the simple collection flow).
2. Avoid risking regressions in the driver-facing UX while the admin app iterates quickly.
3. Allow a separate deployment and release cadence.

---

## Package Manager

Both apps use **npm**.

- Root: `package-lock.json` is tracked; `pnpm-lock.yaml` is gitignored.
- `driver-app/`: has its own `package-lock.json`.
- Always install with `npm ci` (not `npm install`) in CI to get reproducible builds.

---

## Upgrade Strategy

### Upgrading `driver-app` to React 19 + Vite 6

When the driver-app feature set is stable enough to warrant an upgrade:

1. Update `driver-app/package.json`:
   ```json
   {
     "dependencies": {
       "react": "^19.0.0",
       "react-dom": "^19.0.0"
     },
     "devDependencies": {
       "@types/react": "^19.0.0",
       "@types/react-dom": "^19.0.0",
       "@vitejs/plugin-react": "^5.0.0",
       "vite": "^6.0.0"
     }
   }
   ```
2. Run `npm install` inside `driver-app/`.
3. Run `npm run build` inside `driver-app/` and fix any type errors.
4. Test on a low-end Android device before merging.

### Keeping versions in sync long-term

- Pin both apps to the same minor version of TypeScript to avoid divergent type-checking behavior.
- Review `driver-app` dependency versions at least once per quarter.
- When `@supabase/supabase-js` is updated in the root, update `driver-app` in the same PR (currently root uses `^2.98.0`, driver-app uses `^2.45.0`).

---

## Shared Code

Currently, no code is shared between the root app and `driver-app/` at the module level. The `driver-app/` intentionally re-implements only the collection wizard so it can be deployed independently.

If shared logic grows (e.g., shared type definitions, Supabase client factory), consider extracting it to a `packages/shared/` directory and updating both `package.json` files to reference it via a local path dependency.

---

## CI Coverage

Both apps are built in CI — see `.github/workflows/ci.yml` for the PR gate and `.github/workflows/deploy.yml` for the deployment pipeline.
