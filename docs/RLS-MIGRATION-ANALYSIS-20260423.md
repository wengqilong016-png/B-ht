# RLS Migration 20260423000000 — 上线前冲突分析

生成时间：2026-04-22  
执行者：Hermes Agent（A 方案 Step 1）

## 1. 背景

在尝试 `supabase db push` 时发现 migration 历史漂移：

| 版本 | 本地 git | 生产已应用 |
|---|---|---|
| 20260417003000 restore_settlement_payment_status_update | ❌ | ✅ |
| 20260417004000 backfill_settlement_payment_status       | ❌ | ✅ |
| 20260423000000 rls_security_audit_improvements          | ✅ | ❌ |

前两个 migration 从未进入 git。通过 `pg_dump` + `supabase_migrations.schema_migrations` 表回溯后，内容已取回至 `/tmp/mystery_mig/`。

## 2. 神秘 migration 解码

### 20260417003000 restore_settlement_payment_status_update
- 重写 RPC `public.review_daily_settlement_v1(p_settlement_id, p_status, p_note)`
- `SECURITY DEFINER`，admin-only（内部 role 检查）
- 行为：admin 复核结算后 `UPDATE public.transactions SET "paymentStatus" = ...`
- 触发者：admin，绕过 RLS

### 20260417004000 backfill_settlement_payment_status
- 一次性数据回填：把历史 `transactions.paymentStatus` 与已复核的结算对齐
- 幂等（再跑 0 行）
- 已执行完毕

## 3. 与 20260423000000 的冲突矩阵

| 20260423 变更 | 与 20260417003000 冲突？ | 与 20260417004000 冲突？ |
|---|---|---|
| Fix 1 transactions UPDATE 策略收紧 | ✅ 无冲突（admin 调 RPC 是 SECURITY DEFINER，RLS 不生效） | ✅ 无冲突（backfill 已完成） |
| Fix 2 触发器 `trg_log_sensitive_transaction_updates` | ✅ 无冲突（仅当 `get_my_role()='driver'` 时 RAISE，admin RPC 不触发） | ✅ 无冲突（backfill 时 `auth.uid()` 为 NULL） |
| Fix 3 `security_audit_log` 表 CREATE IF NOT EXISTS | ✅ 新表，无冲突 | ✅ |
| Fix 4 `queue_health_reports` 启 RLS | ⚠️ 需确认该表是否已有数据且调用面带正确 `driverId` | ✅ |
| Fix 5 触发器 `trg_check_driver_transaction_rate` (50/min) | ✅ | ⚠️ **与 Day 3 离线恢复批量回放存在理论冲突** |
| Fix 6 `get_rls_coverage_report()` 只读函数 | ✅ | ✅ |

## 4. 剩余风险清单

### R1 — Fix 4 queue_health_reports RLS（中风险）
- 若生产当前未启 RLS，本次启用后任何不带正确 `driverId` 的读写都会失败
- **缓解**：上线前 `SELECT count(*) FROM public.queue_health_reports` + 核对前端所有 INSERT/UPDATE 都走 `driverId = get_my_driver_id()`

### R2 — Fix 5 rate limit 50/min 与离线回放（中风险）
- `offlineQueue.ts` 中 `flushQueue()` 是串行 for 循环，无显式批量上限
- 一名 driver 离线一整天后恢复在线，队列若累积 > 50 条，会被 DB 拒绝
- **缓解方案**：
  - 方案 A：将阈值从 50/min 调高（例如 500/min），只防极端 DOS
  - 方案 B：在 `flushQueue()` 中加入节流（每秒最多 N 条）
  - 方案 C：保持 50/min，但在被 RAISE 时队列继续保留未同步条目 → 下一分钟窗口再试（现有重试逻辑已能处理）

### R3 — migration 历史机制问题（流程风险）
- 有人在 2026-04-17 绕过 git 直接改生产
- 建议：要求团队今后只通过 PR 合并 migration，禁止在 Dashboard SQL Editor 里跑未入 git 的变更

## 5. 推荐上线路径

### Step A（必做）— 修复 migration 历史
把从生产取回的两个 SQL 补进代码仓库：

```bash
cp /tmp/mystery_mig/20260417003000_restore_settlement_payment_status_update.sql \
   supabase/migrations/

cp /tmp/mystery_mig/20260417004000_backfill_settlement_payment_status.sql \
   supabase/migrations/

git add supabase/migrations/2026041700{3,4}000_*.sql
git commit -m "migrations: backfill two migrations applied directly to prod on 2026-04-17"
```

### Step B — 决定 Fix 5 rate limit 策略
- 当前 50/min 可能误伤离线恢复。建议先把 `v_max_per_window` 调高到 500 再上线，或补离线批量节流。

### Step C — dry-run push
```bash
# 只打印执行计划，不执行
supabase db push --dry-run
```

### Step D — 真实上线（窗口期 + 可回滚）
```bash
# 先备份生产 schema
PGPASSWORD=*** pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 6543 \
  -U postgres.edohkcvzaisrxunwnlvk -d postgres \
  --schema-only -f backups/prod_schema_pre_20260423.sql

# push
supabase db push
```

### Step E — 上线后验证
```sql
-- 1. 确认所有新对象到位
SELECT * FROM public.get_rls_coverage_report();

-- 2. 确认触发器存在
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%transaction%';

-- 3. 模拟 driver 试改 paymentStatus → 应该被 block
-- 4. 模拟离线批量回放 → 观察 rate limit 是否误伤
```

## 6. 当前状态

- ✅ 神秘 migration 内容已取回：`/tmp/mystery_mig/`
- ✅ 无行为冲突（admin RPC 走 SECURITY DEFINER 绕 RLS）
- ⚠️ 2 处中等风险待你决定：R1 的 queue_health_reports 调用面、R2 的 rate limit 策略
- ❌ 尚未执行 db push（等你决定上述 2 项）
