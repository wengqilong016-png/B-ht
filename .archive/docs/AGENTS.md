# AGENTS.md — Bahati Jackpots 代码修改规范
# （适用于 Gemini CLI / OpenCode / Codex / 任何 AI Agent）

## ⚠️ 首先必读

本项目是部署在 Vercel 的 React 19 + TypeScript PWA，后端数据存储在 Supabase。
任何一处 TypeScript 错误都会导致 Vercel 构建失败，App 直接无法访问。
**每次修改后必须在本地运行 `npm run build`，build 成功才能提交。**

---

## ⛔ 绝对禁区 — 这些文件非明确要求不得修改

| 文件 | 为什么危险 |
|------|-----------|
| `App.tsx` | 根状态 / 路由 / 认证 / 同步循环全在这里，改错必崩 |
| `types.ts` | 所有共享 Interface、常量、TRANSLATIONS，牵一发动全身 |
| `offlineQueue.ts` | IndexedDB 离线队列，逻辑极其复杂，改错数据丢失 |
| `supabaseClient.ts` | Supabase 连接配置，改错所有数据读写失败 |
| `index.tsx` | 入口文件，Tailwind CSS 导入方式不能变 |
| `vite.config.ts` | 构建配置，`base: './'` 和 chunk 分割策略必须保留 |
| `vercel.json` | Vercel 路由/重写规则，改错 SPA 路由全部 404 |
| `public/sw.js` | Service Worker，改错离线缓存全毁 |
| `hooks/useAuthBootstrap.ts` | 认证引导，改错用户无法登录 |
| `hooks/useSupabaseData.ts` | React Query 数据层，改错数据不显示或重复请求 |
| `hooks/useSupabaseMutations.ts` | 所有写操作，改错数据无法保存 |
| `hooks/useOfflineSyncLoop.ts` | 离线同步 + GPS 心跳，改错司机位置消失 |
| `shared/AppRouterShell.tsx` | 顶层路由 Shell，改错页面无法切换 |
| `setup_db.sql` | 数据库 Schema，不能随意修改（会破坏 Supabase 数据结构）|

---

## ✅ 相对安全的修改区域

- `components/` 目录下的 UI 组件（改完必须 build 验证）
- `admin/` 目录下的管理端页面
- `driver/` 目录下的司机端页面
- `styles/` 目录下的样式文件
- `TRANSLATIONS` 对象里的**字符串值**（在 `types.ts` 里，只能改引号内的文字，不能改 key 名或结构）
- `sql/` 目录下的迁移 SQL（仅新增，不删除已有表/列）

---

## 🔴 每次修改后的强制验证步骤

```bash
# 第一步：安装依赖（如果 node_modules 不存在）
npm ci

# 第二步：构建验证（必须通过，0 个 error）
npm run build

# 如果 build 失败 → 立即撤销修改，不要 commit
```

---

## 📏 修改原则（按优先级排序）

### 1. 最小改动原则
只改任务要求的代码行。不要"顺手重构"、不要"顺手优化"、不要改格式。

### 2. 类型安全原则
- `types.ts` 里的 Interface 只能**新增**字段，不能删除或重命名已有字段
- 不要用 `any` 替代具体类型
- 用 `safeRandomUUID()` from `types.ts`，不要用 `crypto.randomUUID()`（iOS Safari 不兼容）

### 3. 离线优先原则
所有写操作遵循：
```
本地存储 (isSynced: false) → Supabase upsert → 标记 isSynced: true
```
不能跳过本地存储直接写 Supabase。

### 4. 不要引入新依赖
除非明确被要求，只用已有的 npm 包。添加新包会改变 bundle 体积，可能触发 Supabase RLS 或 Vercel 构建问题。

### 5. Import 路径不能改
Vite 有路径别��� `@` → 项目根目录。不要改已有的 import 语句路径。

### 6. 不要动 CSS 类名
Tailwind 做静态分析 purge，动态拼接的类名会被移除。

---

## 🌐 语言规范

| 位置 | 语言 |
|------|------|
| 管理员界面字符串 | 中文 `zh`，放在 `TRANSLATIONS.zh` |
| 司机界面字符串 | 斯瓦希里语 `sw`，放在 `TRANSLATIONS.sw` |
| 代码注释 | 英文 |
| 新增 console.log/warn | 英文，带 `[Bahati]` 前缀 |

---

## 🗺️ 项目结构速览

```
App.tsx                    ← 根组件（🚫 危险区）
types.ts                   ← 类型+常量+翻译（🚫 危险区）
offlineQueue.ts            ← 离线队列（🚫 危险区）
supabaseClient.ts          ← 数据库连接（🚫 危险区）
hooks/
  useAuthBootstrap.ts      ← 认证（🚫 危险区）
  useSupabaseData.ts       ← 数据读取（🚫 危险区）
  useSupabaseMutations.ts  ← 数据写入（🚫 危险区）
  useOfflineSyncLoop.ts    ← 同步循环（🚫 危险区）
  useDevicePerformance.ts  ← 性能检测（可改）
  useSyncStatus.ts         ← 同步状态（谨慎）
components/                ← UI 组件（✅ 相对安全）
admin/                     ← 管理端页面（✅ 相对安全）
driver/                    ← 司机端页面（✅ 相对安全）
shared/                    ← 共享组件（⚠️ 谨慎）
services/                  ← 本地 DB 服务（⚠️ 谨慎）
utils/                     ← 工具函数（⚠️ 谨慎）
styles/                    ← 样式文件（✅ 相对安全）
```

---

## 🔗 Vercel + Supabase 连通性须知

- 环境变量 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 必须在 Vercel 项目设置中配置
- 代码里有硬编码的默认值作为兜底，但生产环境应使用环境变量
- Supabase RLS（行级安全）策略保护数据，anon key 只能访问策略允许的行
- `checkDbHealth()` 每 15 秒检查一次连通性，`isOnline` 状态控制所有数据查询的开关

---

## ❓ 如何安全地添加新功能

1. 在 `components/`、`admin/` 或 `driver/` 里新建文件
2. 如需新类型，在 `types.ts` 末尾**追加**新 Interface，不改已有内容
3. 如需新的 Supabase 查询，在 `hooks/useSupabaseData.ts` 里**追加**新的 `useQuery`，不改已有查询
4. 如需新的写操作，在 `hooks/useSupabaseMutations.ts` 里**追加**新的 `useMutation`
5. 运行 `npm run build` 确认无错误
6. 提交前用 `git diff` 确认改动范围符合预期
