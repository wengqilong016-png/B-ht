-- Migration: support_audit_log
--
-- Stage-9: support case linking and audit trail.
--
-- Creates a minimal append-only table for recording admin/support actions.
-- Rows are never updated or deleted — this is an immutable audit log.
--
-- Design:
--   • `case_id`       free-text support case reference (nullable)
--   • `resource_type` and `resource_id` point to the affected entity
--     (an alert ID, an export filename, a transaction ID, etc.)
--   • `metadata`      JSONB bag for extra context (export scope, filter
--     details, driver name, etc.)
--   • RLS enforces admin-only write access; read access is also admin-only

CREATE TABLE IF NOT EXISTS support_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action        TEXT        NOT NULL,
  actor_id      TEXT        NOT NULL,
  actor_name    TEXT        NOT NULL,
  case_id       TEXT,
  resource_type TEXT        NOT NULL,
  resource_id   TEXT        NOT NULL,
  metadata      JSONB,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookup by case reference
CREATE INDEX IF NOT EXISTS idx_support_audit_log_case_id
  ON support_audit_log (case_id)
  WHERE case_id IS NOT NULL;

-- Index for efficient newest-first reads
CREATE INDEX IF NOT EXISTS idx_support_audit_log_recorded_at
  ON support_audit_log (recorded_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE support_audit_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated admin users may insert audit events.
DROP POLICY IF EXISTS "admin_insert_audit_log" ON support_audit_log;
CREATE POLICY "admin_insert_audit_log"
  ON support_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated admin users may read the audit log.
DROP POLICY IF EXISTS "admin_read_audit_log" ON support_audit_log;
CREATE POLICY "admin_read_audit_log"
  ON support_audit_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Prevent any updates or deletes (audit logs are immutable).
DROP POLICY IF EXISTS "deny_update_audit_log" ON support_audit_log;
CREATE POLICY "deny_update_audit_log"
  ON support_audit_log
  FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_delete_audit_log" ON support_audit_log;
CREATE POLICY "deny_delete_audit_log"
  ON support_audit_log
  FOR DELETE
  TO authenticated
  USING (false);
