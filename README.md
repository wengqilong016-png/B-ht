# Bahati Jackpots

路线收款管理系统 — slot-machine collection route management for Tanzania.

**两个角色，一个网址** — auto-routes to Admin or Driver based on account role.

| | 管理员 (Admin) | 司机 (Driver) |
|---|---|---|
| **账号** | `profiles.role = 'admin'` | `profiles.role = 'driver'` + `driver_id` |
| **语言** | 中文 | Swahili |
| **功能** | 仪表盘、网点管理、司机管理、审批、报表 | HARAKA 快速收、向导收、日结、状态查看 |

**测试：** 77 suites · 753 tests · ✅ 全绿

---

## 文档导航

| 想找什么 | 看这里 |
|----------|--------|
| 管理员怎么用 | `docs/guides/user-guide-dashboard.md` · `user-guide-driver-management.md` · `user-guide-locations.md` · `user-guide-approval-settlement.md` |
| 司机怎么收款 | `docs/guides/user-guide-collection.md` |
| 系统架构全链路 | `docs/traces/` — 5 份深度追踪文档 |
| 运维操作 | `docs/guides/RUNBOOK.md` |
| 快速修复 | `docs/guides/QUICK-FIX-GUIDE.md` |
| 部署指南 | `docs/guides/DEPLOYMENT.md` · `docs/guides/MOBILE_BUILD_GUIDE.md` |
| 安全相关 | `docs/reports/SECURITY_AUDIT_REPORT.md` · `docs/guides/SECURITY_OPERATIONS.md` |
| 数据模型 | `docs/reference/DATA_MODEL_AUDIT.md` |

---

## 架构

```
App.tsx  →  AuthContext / DataContext / MutationContext
              ↓
           hooks/  (useSupabaseData, useSupabaseMutations, …)
              ↓
           services/  (collectionSubmissionOrchestrator, financeCalculator, …)
              ↓
           repositories/  (locationRepository, driverRepository, …)
              ↓
           Supabase (Auth + RLS + Realtime + Edge Functions)
```

| 目录 | 用途 |
|------|------|
| `admin/` | 管理端页面和视图 |
| `driver/` | 司机端页面、组件、hooks |
| `components/` | 共享 UI（Login, DriverManagement, SitesTab, …） |
| `contexts/` | React Context（Auth, Data, Mutation, Toast, Confirm） |
| `hooks/` | 数据查询和认证 hooks |
| `services/` | 业务逻辑（collection, finance, realtime, translate） |
| `repositories/` | Supabase 查询封装 |
| `types/` | TypeScript 类型、常量 |
| `i18n/` | 中文 + Swahili 翻译 |
| `supabase/` | 迁移、Edge Functions、schema |
| `scripts/` | 构建和验证脚本 |
| `offlineQueue.ts` | IndexedDB 离线队列（1625 行核心） |

**离线优先：** 写入先进 IndexedDB，联网后自动 flush。

---

## 本地开发

```bash
npm ci
cp .env.example .env.local   # 填入 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                   # http://localhost:3000
```

**测试：**
```bash
npx jest --no-coverage --passWithNoTests   # 753 tests
./scripts/verify.sh                        # lint + test + build
```

---

## 数据库

`supabase/schema.sql` — 完整 schema 快照（可在 SQL Editor 直接运行）。
增量更新在 `supabase/migrations/` 按时间戳执行。

**推送迁移：**
```bash
SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN supabase/.env | cut -d= -f2) npx supabase db push
```

---

## Edge Functions

| Function | 用途 |
|----------|------|
| `create-driver` | 一键创建 Auth 用户 + drivers + profiles |
| `delete-driver` | 一键删除 Auth 用户 + 关联数据 |

```bash
supabase functions deploy create-driver --no-verify-jwt
supabase functions deploy delete-driver --no-verify-jwt
```

---

## 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `VITE_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon 公钥 |
| `VITE_DISABLE_AUTH` | — | 本地跳过认证（生产环境忽略） |

---

## CI

push 到 main 自动：typecheck → lint → security audit → 753 tests → build → Vercel 部署。
