# BHT Bug Fix Protocol
When fixing bugs in BHT:
1. Read the relevant deep-trace doc from docs/ first
2. Check AGENTS.md for the fix protocol (Phase 1-7)
3. Read max 3 source files initially
4. Find root cause before touching code
5. Make minimal fix — no "while I'm here" refactors
6. Run `npx jest --no-coverage --passWithNoTests`
7. Commit with descriptive message, then `git push origin main`
8. Verify Vercel deploys in ~5-8 min
