# Contributing

## Local setup

```bash
npm ci
cp .env.example .env.local
```

Use **npm** only. This repository is pinned to Node.js 22 / npm 10 in CI.

## Required validation before opening a PR

Run the same commands CI runs for merge gates:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run test:coverage:ci
npm run security:audit
npm run build
```

If your change touches end-to-end flows, also run:

```bash
npm run test:e2e
```

## Code style expectations

- Prefer **small, surgical TypeScript changes** over broad refactors.
- Follow the repository ESLint rules for import ordering and hook safety.
- Keep admin-facing text in Chinese (`zh`) and driver-facing text in Swahili (`sw`).
- Extend shared types in `types/` or `types.ts` instead of redefining inline shapes.
- Reuse existing helpers such as `safeRandomUUID()`, `resizeImage()`, and `normalizeCaseId()` instead of duplicating logic.

## Testing expectations

- Add unit tests for new business logic, hooks, or persistence behavior.
- Prefer focused tests around services, hooks, utilities, and edge-function behavior.
- Keep coverage changes honest: the enforced coverage gate applies to the repository's **core unit-testable surface** (services, reusable hooks, utilities, repositories, shared types, and a small set of root modules).
- Heavy integration-oriented modules such as live Supabase data/mutation hooks, AI-heavy hooks, the offline sync loop, and runtime GPS capture are intentionally excluded from the unit coverage threshold until they receive dedicated integration-focused coverage.
- Future PRs should keep expanding that covered surface rather than letting the exclusion list grow.

## CI and merge protection

The repository includes CI, CodeQL, and Dependabot config in version control. To fully enforce “all green before merge,” enable GitHub branch protection on `main`:

1. Open **Repository Settings → Branches**.
2. Add or edit the protection rule for `main`.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging**.
5. Select the CI and CodeQL checks after they have run at least once.
6. Optionally enable **Require branches to be up to date before merging**.

## PR checklist

- Explain the user-visible or operational impact.
- Mention any schema, config, or environment-variable changes.
- Include screenshots for UI changes when helpful.
- Call out follow-up debt if you intentionally leave warnings or staged thresholds behind.
