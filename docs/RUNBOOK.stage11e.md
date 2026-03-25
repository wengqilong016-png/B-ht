# Stage 11E — FK Validation Readiness Runbook (Preparation Only)

## Goal

Prepare for validating `support_audit_log_case_id_fkey`
(`support_audit_log.case_id → support_cases.id`).

**This stage DOES NOT execute `VALIDATE CONSTRAINT`.**
Validation itself is deferred to Stage 11F.

---

## Prerequisites from prior stages

| Stage | What it established | How to confirm |
|-------|---------------------|----------------|
| 11A | `normalizeCaseId()` in service layer; `NOT VALID` CHECK preventing blank `case_id` | `SELECT conname FROM pg_constraint WHERE conname = 'support_audit_log_case_id_not_blank';` returns 1 row |
| 11B/11C | Historical data cleanup (blanks, orphans) | Baseline queries in §1 below all return 0 |
| 11D | `support_audit_log_case_id_fkey` added as `NOT VALID` | Constraint state query in §2 returns `convalidated = false` |

All prerequisites must be confirmed before proceeding.

---

## 1. Data integrity checks

Run each query independently. **Every result must be 0.**

### 1a. Blank / whitespace-only case_id values

```sql
SELECT COUNT(*) AS blank_count
FROM public.support_audit_log
WHERE case_id IS NOT NULL
  AND btrim(case_id) = '';
```

### 1b. Untrimmed case_id values

```sql
SELECT COUNT(*) AS untrimmed_count
FROM public.support_audit_log
WHERE case_id IS NOT NULL
  AND case_id <> btrim(case_id);
```

### 1c. Orphan rows (case_id references a non-existent case)

```sql
SELECT COUNT(*) AS orphan_count
FROM public.support_audit_log a
LEFT JOIN public.support_cases c ON c.id = a.case_id
WHERE a.case_id IS NOT NULL
  AND c.id IS NULL;
```

> **If any count > 0:** STOP. Do not proceed. See §5 (Stop conditions).

---

## 2. Constraint state verification

```sql
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.support_audit_log'::regclass
  AND conname  = 'support_audit_log_case_id_fkey';
```

| Check | Expected |
|-------|----------|
| Row exists | Yes — exactly 1 row |
| `convalidated` | `false` |
| Definition | `FOREIGN KEY (case_id) REFERENCES support_cases(id)` |

> **If the constraint is missing or already validated:** STOP. See §5.

---

## 3. Operational safety checks

Before declaring go for Stage 11F, confirm:

- [ ] No ongoing bulk imports or batch writes to `support_audit_log`
- [ ] No pending or in-flight migration touching `support_cases` or `support_audit_log`
- [ ] Realtime subscriptions stable (no abnormal retry storms in Supabase dashboard)
- [ ] No active support case cleanup or data remediation scripts running
- [ ] Application error rates normal (check logs for FK violation errors from Stage 11D)

---

## 4. Go / No-go decision

| # | Criterion | Pass | Fail action |
|---|-----------|------|-------------|
| 1 | §1a blank count = 0 | ✅ | STOP — clean blanks first |
| 2 | §1b untrimmed count = 0 | ✅ | STOP — run normalization |
| 3 | §1c orphan count = 0 | ✅ | STOP — remediate orphans |
| 4 | §2 FK exists, `convalidated = false` | ✅ | STOP — investigate state |
| 5 | §3 all operational checks pass | ✅ | STOP — resolve before continuing |

**GO for Stage 11F** only when all five criteria show ✅.

---

## 5. Stop conditions

Do **NOT** proceed to `VALIDATE CONSTRAINT` (Stage 11F) if any of the following are true:

- Any data integrity query in §1 returns a count > 0
- The FK constraint `support_audit_log_case_id_fkey` is missing from `pg_constraint`
- The FK constraint is unexpectedly already validated (`convalidated = true`)
- Recent application logs show FK violation errors on new writes (indicates
  the service layer is inserting case_id values that don't exist in `support_cases`)
- Bulk write operations or data migrations are in progress
- The `support_cases` table schema has been altered since Stage 11D

If stopped, investigate and resolve the blocking condition before re-running
this checklist from §1.

---

## 6. Performance and lock considerations for Stage 11F

`VALIDATE CONSTRAINT` acquires a `SHARE UPDATE EXCLUSIVE` lock on
`support_audit_log`. This lock:

- **Blocks:** `ALTER TABLE`, `VACUUM FULL`, other schema DDL on the same table
- **Does not block:** normal `SELECT`, `INSERT`, `UPDATE`, `DELETE`

Estimated duration depends on table size. Check row count before scheduling:

```sql
SELECT COUNT(*) AS total_rows FROM public.support_audit_log;
SELECT COUNT(*) AS non_null_case_ids
FROM public.support_audit_log
WHERE case_id IS NOT NULL;
```

For tables under ~100k rows, validation typically completes in seconds.
For larger tables, plan for a maintenance window.

---

## 7. What Stage 11F will do

Only after all checks in §4 pass, Stage 11F will execute:

```sql
ALTER TABLE public.support_audit_log
    VALIDATE CONSTRAINT support_audit_log_case_id_fkey;
```

After validation, confirm:

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conname = 'support_audit_log_case_id_fkey';
```

Expected: `convalidated = true`.

---

## 8. Rollback guidance (if Stage 11F validation fails)

If `VALIDATE CONSTRAINT` fails in Stage 11F:

1. **Do NOT drop the FK.** The `NOT VALID` constraint still protects new writes.
2. Identify failing rows:
   ```sql
   SELECT a.id, a.case_id
   FROM public.support_audit_log a
   LEFT JOIN public.support_cases c ON c.id = a.case_id
   WHERE a.case_id IS NOT NULL
     AND c.id IS NULL;
   ```
3. Remediate: either create the missing `support_cases` rows or set orphan
   `case_id` values to `NULL`.
4. Re-run this checklist from §1 before retrying validation.

If the FK must be removed entirely (emergency only):

```sql
ALTER TABLE public.support_audit_log
    DROP CONSTRAINT support_audit_log_case_id_fkey;
```

This reverts to pre-Stage-11D state. Re-add via the Stage 11D migration
after resolving the root cause.
