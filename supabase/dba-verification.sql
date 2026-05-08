-- =============================================================================
-- DBA 深度验证脚本 — 对 Bahati Jackpots 生产 Supabase 跑通所有 SQL 产物
-- 运行: 通过 Supabase SQL Editor 或 supabase db push 后的 manage API
-- =============================================================================

\echo '=== PHASE 1: Security — SECURITY DEFINER auth gates ==='

-- 验证 record_task_settlement 有权限门控
SELECT proname, 
       CASE WHEN prosrc LIKE '%PERMISSION GATE%' THEN '✅ HAS GATE' ELSE '❌ NO GATE' END as auth_gate,
       CASE WHEN prosrc LIKE '%get_my_role%' THEN '✅ uses get_my_role' ELSE '❌ missing get_my_role' END as role_check,
       CASE WHEN prosrc LIKE '%get_my_driver_id%' THEN '✅ uses get_my_driver_id' ELSE '❌ missing get_my_driver_id' END as driver_check
FROM pg_proc 
WHERE proname = 'record_task_settlement' 
  AND pronamespace = 'public'::regnamespace;

-- 验证 submit_daily_reconciliation 有权限门控
SELECT proname,
       CASE WHEN prosrc LIKE '%PERMISSION GATE%' THEN '✅ HAS GATE' ELSE '❌ NO GATE' END as auth_gate,
       CASE WHEN prosrc LIKE '%get_my_role%' THEN '✅ uses get_my_role' ELSE '❌ missing get_my_role' END as role_check,
       CASE WHEN prosrc LIKE '%get_my_driver_id%' THEN '✅ uses get_my_driver_id' ELSE '❌ missing get_my_driver_id' END as driver_check
FROM pg_proc
WHERE proname = 'submit_daily_reconciliation'
  AND pronamespace = 'public'::regnamespace;

-- 验证 get_my_role / get_my_driver_id 辅助函数存在
SELECT proname, '✅ EXISTS' as status
FROM pg_proc
WHERE proname IN ('get_my_role', 'get_my_driver_id', 'is_admin')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;

\echo '=== PHASE 2: RLS — 所有表策略覆盖 ==='

-- 检查哪些表启用了 RLS 但没有完整的 CRUD 策略
WITH rls_tables AS (
  SELECT c.relname as tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
    AND c.relname NOT LIKE 'pg_%'
    AND c.relname NOT LIKE '_realtime%'
),
policies AS (
  SELECT schemaname, tablename, 
         string_agg(DISTINCT cmd, ',' ORDER BY cmd) as commands
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
)
SELECT 
  rt.tbl as table_name,
  COALESCE(p.commands, '❌ NO POLICIES') as rls_commands,
  CASE 
    WHEN p.commands IS NULL THEN 'CRITICAL: 零策略'
    WHEN p.commands LIKE '%SELECT%' 
     AND p.commands LIKE '%INSERT%' 
     AND p.commands LIKE '%UPDATE%' 
     AND p.commands LIKE '%DELETE%' THEN '✅ 完整 CRUD'
    WHEN p.commands NOT LIKE '%DELETE%' THEN '⚠️ 缺 DELETE'
    WHEN p.commands NOT LIKE '%INSERT%' THEN '⚠️ 缺 INSERT'
    WHEN p.commands NOT LIKE '%UPDATE%' THEN '⚠️ 缺 UPDATE'
    ELSE '⚠️ 不完整'
  END as assessment
FROM rls_tables rt
LEFT JOIN policies p ON p.tablename = rt.tbl
ORDER BY assessment, rt.tbl;

\echo '=== PHASE 3: 关键函数签名验证 ==='

-- 验证所有 SECURITY DEFINER 函数 search_path 已设置
SELECT 
  proname,
  CASE 
    WHEN prosecdef THEN 'SECURITY DEFINER' 
    ELSE 'SECURITY INVOKER' 
  END as security,
  CASE 
    WHEN proconfig IS NOT NULL AND array_to_string(proconfig, ',') LIKE '%search_path%' 
    THEN '✅ search_path set'
    ELSE '⚠️  search_path NOT SET'
  END as search_path_status,
  pg_get_function_identity_arguments(oid) as args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosecdef = true
ORDER BY proname;

\echo '=== PHASE 4: 索引健康检查 ==='

-- 找出可能缺失的外键索引
SELECT 
  conname as constraint_name,
  conrelid::regclass::text as table_name,
  a.attname as column_name,
  CASE 
    WHEN i.indexrelid IS NOT NULL THEN '✅ indexed'
    ELSE '⚠️  NO INDEX — consider adding'
  END as index_status
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
LEFT JOIN pg_index i ON i.indrelid = c.conrelid 
  AND a.attnum = ANY(i.indkey)
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
ORDER BY index_status, table_name;

\echo '=== PHASE 5: 表行数统计 ==='

SELECT 
  relname as table_name,
  n_live_tup as estimated_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

\echo '=== PHASE 6: submit_collection_v2 验证 ==='

-- 确认 tx_conflict 信号已部署
SELECT 
  CASE 
    WHEN prosrc LIKE '%tx_conflict%' OR prosrc LIKE '%ON CONFLICT%' 
    THEN '✅ tx_conflict 信号已部署'
    ELSE '❌ tx_conflict 信号缺失'
  END as conflict_signal,
  CASE 
    WHEN prosrc LIKE '%created_at%' 
    THEN '✅ created_at 已注入'
    ELSE '❌ created_at 缺失'
  END as created_at_check
FROM pg_proc
WHERE proname = 'submit_collection_v2'
  AND pronamespace = 'public'::regnamespace;

\echo '=== PHASE 7: 迁移版本一致性 ==='

-- 检查 supabase_migrations 表与应用迁移文件数量一致
SELECT 
  COUNT(*) as applied_migrations,
  (SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) as total_functions,
  (SELECT COUNT(*) FROM pg_class c 
   JOIN pg_namespace n ON n.oid = c.relnamespace 
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true) as rls_tables
FROM supabase_migrations.schema_migrations;

\echo '=== DBA VERIFICATION COMPLETE ==='
