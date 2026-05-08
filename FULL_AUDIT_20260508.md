# BHT 全面深度审查报告

> 审查日期：2026-05-08 | 审查范围：全项目（228源文件、51个SQL迁移、60个测试）
> 审查方式：3 路并行分析（后端/数据库 + 前端代码 + 交叉架构）

---

## 一、总体评价

**评分：B+（良好）**

项目整体架构设计合理，代码质量高，离线同步设计健壮，RLS 覆盖全面。
此前 19 个安全审计发现中 **15 个已修复**，安全态势已大幅改善。

但本次审查发现 **全新问题 12 个**，加上之前审计 **遗留未修复 1 个**，合计 **13 个待处理问题**。

---

## 二、关键发现速览

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 CRITICAL | 3 | 数据损坏/资金风险/凭据泄露 |
| 🟡 HIGH | 3 | 权限泄露/功能失效 |
| 🟡 MEDIUM | 5 | 架构风险/数据一致性 |
| 🟢 LOW | 2 | 技术债/最佳实践 |

---

## 三、全部问题明细（按严重度排序）

### 🔴 CRITICAL

---

#### C1. Supabase Access Token 硬编码泄露

- **文件**: `supabase/.env`
- **内容**: `SUPABASE_ACCESS_TOKEN=[REDACTED]`
- **描述**: Supabase 管理令牌完整硬编码在仓库文件中，拥有完整 API 访问权限
- **风险**: ⚠️ 任何接触到仓库的人可创建/删除项目、管理数据库、访问所有数据
- **建议**: 
  1. **立即**在 Supabase Dashboard 撤销此令牌
  2. **立即**检查 Git 历史是否已推送到远端（`git log --all -p -- supabase/.env`）
  3. 改用 GitHub Secrets 注入 CI

---

#### C2. 审计触发器引用了不存在的列 `resolvedScore`

- **文件**: `supabase/migrations/20260423000000_rls_security_audit_improvements.sql`
- **行号**: 70, 93-94
- **描述**: `log_sensitive_transaction_updates` 触发器检查 `NEW."resolvedScore"`，但 `transactions` 表中**根本不存在 `resolvedScore` 列**（该列从未在任何迁移中定义过）
- **风险**: 任何 transactions UPDATE 操作触发此条件分支时，PostgreSQL 抛出 `column "resolvedScore" does not exist` → **更新失败**。而且若错误发生在 RAISE 之前，本应阻止的敏感列篡改反而可能通过
- **建议**: 修正触发器体，移除 `resolvedScore` 引用。正确的应该是 `currentScore`/`previousScore`

---

#### C3. `finance_audit_log` 插入策略过于宽松

- **文件**: `supabase/migrations/20260407100000_finance_audit_log.sql`
- **行号**: 40-42
- **描述**: `CREATE POLICY finance_audit_insert ON public.finance_audit_log FOR INSERT TO authenticated WITH CHECK (true);`
- **风险**: **任何已认证用户（包括司机）都可以向金融审计日志表插入任意虚假记录**，污染审计溯源
- **建议**: 改为 `WITH CHECK (public.get_my_role() = 'admin')`

---

### 🟡 HIGH

---

#### H1. Schema 漂移 — schema.sql 缺失 12 张表

- **文件**: `supabase/schema.sql`（缺失）/ 迁移文件（有定义）
- **描述**: `schema.sql` 只定义了 14 张表，但迁移文件中额外创建了 12 张表（`merchants`, `kiosks`, `tasks`, `merchant_ledger`, `driver_fund_ledger` 等），schema.sql 中完全没有
- **风险**: 从 `schema.sql` 全新部署会失败——函数引用的表不存在。schema.sql 并非真正的"完整单文件部署方案"
- **建议**: 将迁移中所有 CREATE TABLE 合并回 schema.sql，或用 `supabase db diff` 生成最新的 schema

---

#### H2. Supabase Anon Key 在仓库中暴露

- **文件**: `.env.local`
- **描述**: Supabase URL 和 anon key 在 `.env.local` 中明文存储在仓库里
- **风险**: 虽然 anon key 受 RLS 保护，但暴露了项目基础信息。更关键的是检查 Git 历史是否已公开
- **建议**: 
  1. 确认 `.gitignore` 包含 `.env.local`
  2. 在 Supabase Dashboard 轮换 anon key
  3. 将 `.env.local` 从 Git 历史中清除（`git filter-branch` 或 BFG）

---

#### H3. `delete-driver` Edge Function 清理不完整

- **文件**: `supabase/functions/delete-driver/index.ts`
- **行号**: 91-127
- **描述**: 删除司机时未清理 `profiles` 记录，也未清理 `locations.assignedDriverId` 引用
- **风险**: 僵尸 profile 记录和悬空引用
- **建议**: 添加 profiles 显式删除 + locations.assignedDriverId 置 NULL

---

### 🟡 MEDIUM

---

#### M1. `setQueriesData` 复数语义歧义（原审计 MEDIUM #8 仍未修复）

- **文件**: `driver/components/QuickCollect.tsx`
- **行号**: 250
- **描述**: 仍在使用 `setQueriesData` 而非 `setQueryData`，会模糊匹配所有前缀匹配的 query
- **风险**: 可能导致不必要的缓存更新和重渲染
- **建议**: 改为 `queryClient.setQueryData<Transaction[]>(...)` 精确更新单条缓存
- **备注**: 这是此前安全审计报告的 MEDIUM #8，FINAL-REPORT 声称已修复，但实际代码中仍然存在

---

#### M2. FINAL-REPORT 与代码实际状态脱节

- **文件**: `FINAL-REPORT.md`, `FIXES-PROGRESS-SUMMARY.md`
- **描述**: FINAL-REPORT 声称 12/12 (100%) 修复完成，但：
  - MEDIUM #8 (`setQueriesData`) 实际未修复（见 M1）
  - Day 4 的 4 个 Medium 问题在 FIXES-PROGRESS-SUMMARY 中列为"0%，计划 Day 4"
- **风险**: 管理层可能基于报告认为所有问题已解决，误导上线决策
- **建议**: 更新 FINAL-REPORT.md 反映真实修复状态，修正 12/12 声明

---

#### M3. Trigger `search_path = ''` 可能导致权限检查失效

- **文件**: `supabase/migrations/20260423000000_rls_security_audit_improvements.sql`
- **行号**: 56
- **描述**: 触发器使用 `SET search_path = ''`，`'pg_catalog'` 和 `'auth'` schema 不在路径中
- **风险**: `auth.uid()` 在某些 PG 版本中可能解析失败或返回 NULL → 权限检查跳过
- **建议**: 将 `search_path` 改为 `'public, pg_temp'`

---

#### M4. 测试 Mock 过浅，不模拟 RLS 过滤行为

- **文件**: `__tests__/helpers/supabaseMock.ts`
- **描述**: `makeSupabaseMock` 返回链式 mock，所有 `eq()`, `order()`, `limit()` 仅返回静态值，**不模拟 RLS 过滤逻辑**
- **风险**: 测试通过不代表 RLS 在生产中有效。driverId 过滤不被真实验证
- **建议**: 扩展 mock，使其根据传入的 `eq('driverId', X)` 参数过滤结果集

---

#### M5. `transactions.paymentStatus` 缺少 CHECK 约束

- **文件**: `supabase/schema.sql`
- **行号**: 177
- **描述**: `paymentStatus TEXT DEFAULT 'unpaid'` 但无 CHECK 约束（对比其他列如 type/status 都有）
- **风险**: 可写入任意值（如 'PAID' vs 'paid' 大小写不一致），导致查询过滤失效，结算漏记
- **建议**: 添加 `CHECK (paymentStatus IN ('pending', 'paid', 'unpaid', 'rejected'))`

---

### 🟢 LOW

---

#### L1. Dockerfile Node 版本不匹配

- **文件**: `Dockerfile` 第1行
- **描述**: `node:20-slim` 但 `package.json` 要求 `node: 22.x`
- **建议**: 改为 `node:22-slim`

#### L2. config.toml 密码最小长度过短

- **文件**: `supabase/config.toml` 第89行
- **描述**: `minimum_password_length = 6`（OWASP 推荐 ≥ 8）
- **建议**: 改为 8

---

## 四、修复路线图

### P0 — 今天必须干

| # | 问题 | 工时 | 优先级理由 |
|---|------|------|-----------|
| C1 | Access Token 泄露 | 0.2h | 凭据已暴露，每多一秒风险都在 |
| C2 | resolvedScore 触发崩溃 | 0.5h | 线上 transactions UPDATE 可能静默失败 |
| C3 | finance_audit_log 策略过松 | 0.25h | 司机可伪造审计记录 |

### P1 — 本周

| # | 问题 | 工时 |
|---|------|------|
| H1 | Schema 漂移修复 | 2-3h |
| H2 | Anon key 轮换 + 清理 Git 历史 | 1h |
| H3 | delete-driver 清理不完整 | 0.5h |
| M1 | setQueriesData 修复 | 0.25h |
| M2 | 文档状态更新 | 0.5h |
| M3 | trigger search_path 修复 | 0.5h |

### P2 — 本月

| # | 问题 | 工时 |
|---|------|------|
| M4 | Mock 深度增强 | 2h |
| M5 | paymentStatus CHECK 约束 | 0.25h |
| L1 | Dockerfile Node 版本 | 0.1h |
| L2 | 密码长度 | 0.1h |

---

## 五、已验证修复的旧问题（不再需要关注）

| 旧审计项 | 状态 | 验证证据 |
|----------|------|---------|
| CRITICAL #1 SECURITY DEFINER 缺权限 | ✅ 已修复 | 20260506110000 迁移添加了权限门 |
| CRITICAL #2 GPS NaN 类型断言 | ✅ 已修复 | `isValidGps()` 运行时校验已部署 |
| CRITICAL #3 `!` 非空断言崩溃 | ✅ 已修复 | `??` fallback 已部署 |
| MEDIUM #4-7 RLS 缺口等 | ✅ 已修复 | 2 个迁移文件已补齐 |

---

## 六、建议行动顺序

1. **现在** → 撤销 C1 的 Supabase Access Token
2. **现在** → 检查 Git 历史有无泄露（`cd /root/bht && git log --all -p -- supabase/.env`）
3. **今天** → 修复 C2（resolvedScore 列）和 C3（finance_audit_log 策略）
4. **今天** → 部署修复，`npx supabase db push`
5. **本周** → H1 Schema 合并、H2 轮换 anon key、M1 setQueriesData
6. **本周** → 更新 FINAL-REPORT.md

---

*生成：Hermes Agent 秋风 · 3 路并行深度审查*
