# Stage 11E — FK Validation Runbook (Preparation Only)

## Goal
Prepare for validating `support_audit_log.case_id -> support_cases.id` FK.

This stage DOES NOT execute `VALIDATE CONSTRAINT`.

---

## 1. Preconditions (must all be TRUE)

### Data integrity
```sql
-- blank / whitespace
SELECT COUNT(*) FROM public.support_audit_log
WHERE case_id IS NOT NULL AND btrim(case_id) = '';

-- trim changes
SELECT COUNT(*) FROM public.support_audit_log
WHERE case_id IS NOT NULL AND case_id <> btrim(case_id);

-- orphan rows
SELECT COUNT(*) FROM public.support_audit_log a
LEFT JOIN public.support_cases c ON c.id = a.case_id
WHERE a.case_id IS NOT NULL AND c.id IS NULL;
```

All must be 0.

---

## 2. Constraint state check

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conname = 'support_audit_log_case_id_fkey';
```

Expected:
- exists
- `convalidated = false`

---

## 3. Safety checks

- no ongoing bulk writes to `support_audit_log`
- no migration touching `support_cases`
- realtime subscriptions stable (no abnormal retry storms)

---

## 4. Stop conditions

Do NOT proceed to validation if:
- any baseline query > 0
- FK missing or already validated unexpectedly
- recent writes show inconsistent case_id formatting

---

## 5. Next stage (11F)

Only after all checks pass:

```sql
ALTER TABLE public.support_audit_log
VALIDATE CONSTRAINT support_audit_log_case_id_fkey;
```

---

## 6. Rollback plan (if validation fails)

- investigate failing rows via `NOT VALID` scan
- revert data to previous cleaned state
- DO NOT drop FK, keep NOT VALID for protection
