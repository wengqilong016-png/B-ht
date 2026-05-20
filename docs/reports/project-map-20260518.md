# BHT（BAHATI JACKPOTS）项目地图

> 生成日期: 2026-05-18
> 版本: 1.0.15
> 框架: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4
> 后端: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
> 跨平台: PWA + Capacitor 8 (Android/iOS)

---

## 1. 入口文件链 (Entry Chain)

```
public/sw.js                  ← Service Worker (PWA, 资产缓存, version pin)
index.html                    ← HTML 入口: PWA meta, 加载动画, SW 注册, 模块恢复
  └─> index.tsx               ← React 挂载: Sentry init, TanStack QueryClient, Vercel Analytics
       └─> App.tsx            ← 应用根组件: 错误边界, Toast/Confirm 上下文, 认证引导
```

### 启动时序

1. `index.html` 显示 fallback loading spinner
2. 并行: SW 注册 (`sw.js`) + 模块加载
3. `index.tsx`: QueryClientProvider → `<App />` → Analytics
4. `App.tsx`: ErrorBoundary → ToastProvider → ConfirmProvider → `useAuthBootstrap()`
5. `useAuthBootstrap()`: 尝试从 localStorage 恢复缓存用户 → Supabase session 恢复（8s 超时）
6. 未登录 → `<Login />` | 强制改密 → `<ForcePasswordChange />` | 已登录 → `<AuthenticatedApp />`

---

## 2. 路由 / 视图系统 (View-State Routing)

**不使用 React Router**，采用自定义视图状态模式（`useState<ViewType>` + 懒加载组件渲染）。

### 整体架构

```
AppRouterShell
  ├── 角色检测: currentUser.role === 'admin' ? AppAdminShell : AppDriverShell
  ├── Suspense + React.lazy 延迟加载两个 Shell
  └── 两个 Shell 永不共存
```

### 管理员视图 (Admin Shell)

| View ID | 中文名 | 页面组件 | 导航位置 |
|---------|--------|---------|---------|
| `dashboard` | 工作台 | `DashboardPage` (overview tab) | 主导航 |
| `settlement` | 审批中心 | `DashboardPage` (settlement tab) | 主导航 + badge |
| `map` | 地图与轨迹 | `DashboardPage` (tracking tab) | 主导航 |
| `sites` | 网点管理 | `DashboardPage` (locations tab) | 主导航 |
| `team` | 车队与薪资 | `DriverManagement` | 主导航 |
| `collect` | 采集录入 | `DriverCollectionFlow` | 副导航 |
| `debt` | 债务管理 | `DebtManager` | 副导航 |
| `driver-flow` | 司机卡点 | `DriverFlowDiagnosticsPage` | 副导航 |
| `dead-letter` | 同步故障 | `AdminDeadLetterPage` | 副导航 |
| `monthly` | 月度报表 | `MonthlyReportPage` | 副导航 |
| `history` | 操作记录 | `TransactionHistory` | 副导航 |

> `dashboard/settlement/map/sites` 四个视图共享一个 `DashboardPage` 组件，通过 `mapAdminViewToDashboardTab()` 映射内部 tab。

### 司机视图 (Driver Shell)

| View ID | 英文标签 | 页面组件 |
|---------|---------|---------|
| `quick` | Quick Collect | `QuickCollect` (快速 3 键收集) |
| `collect` | Collect | `DriverCollectionFlow` (4 步向导) |
| `settlement` | Daily Settlement | `DashboardPage` (settlement tab) |
| `debt` | Debt | `DebtManager` |
| `history` | History | `TransactionHistory` |
| `status` | Status | `DriverStatusPanel` |

### 布局组件

```
AppShell (flex h-screen)
  ├── ShellSidebar (桌面左侧)
  ├── ShellHeader (顶部)
  │    └── ShellMobileNav (移动端顶栏导航)
  ├── ShellMainContent (主内容区)
  └── ShellMobileNav (移动端底部导航, driver only)
```

---

## 3. 数据流 (Supabase → Hooks → Contexts → Components)

### 数据流转路径

```
Supabase DB
    ↓ (React Query fetch)
repositories/*.ts           ← 纯函数, 封装 Supabase RPC/SELECT
    ↓
hooks/useSupabaseData.ts   ← 6 个 useQuery, 带 12s 超时 + localDB 降级
hooks/useSupabaseMutations.ts ← 12 个 useMutation, 带乐观更新 + 离线队列
    ↓ (useMemo stabilized objects)
contexts/index.ts           ← AuthContext / DataContext / MutationContext
    ↓ (useContext)
AppAdminShell / AppDriverShell → view renderers → page components
```

### 核心数据实体

| 实体 | 类型 | Supabase Table | 本地缓存 key | 主要字段 |
|------|------|---------------|-------------|---------|
| 地点/机器 | `Location` | `locations` | `kiosk_locations_data` | id, name, machineId, coords, status, assignedDriverId |
| 司机 | `Driver` | `drivers` | `kiosk_drivers_data_v3` | id, name, phone, dailyFloatingCoins, status |
| 交易 | `Transaction` | `transactions` | `kiosk_transactions_data` | id, locationId, driverId, revenue, currentScore |
| 日结 | `DailySettlement` | `daily_settlements` | `kiosk_daily_settlements` | id, date, driverId, totalRevenue, status |
| AI日志 | `AILog` | `ai_logs` | `kiosk_ai_logs` | id, query, response, modelUsed |
| 用户 | `User` | `auth.users` (auth联动) | kiosk_auth_cache (localStorage) | id, username, role, driverId |

### React Query Cache Keys

| Key | 数据 | 冷却时间 | 自动刷新 |
|-----|------|---------|---------|
| `['dbHealth']` | 在线状态 | — | 5s 轮询 + `online`/`offline` 事件 |
| `['locations']` | 全部地点 | 10 min | 离线时读取 `localDB` |
| `['drivers']` | 全部司机 | 2 min | 离线时读取 `localDB` |
| `['transactions', scope]` | 交易列表 | 2 min | admin 每 2min 轮询 |
| `['dailySettlements', scope]` | 日结 | 5 min | — |
| `['aiLogs', role]` | AI 日志 | 10 min | admin only |

> scope 为 `admin`（管理员全量）或 `driver:{driverId}`（司机按 driverId 过滤 100 条）。

### 数据流中的角色隔离

- **Driver** 只查询自己的 `transactions`（driverId 过滤）和 `dailySettlements`
- **Driver** 不加载 `aiLogs`（skip）
- **Admin** 全量数据, 但前端通过记忆化 filter 实现页面级行级过滤
- Repository 层有 **RLS 验证**: Driver 查询 transaction 时校验返回数据的 driverId 一致性

### 认证流

```
useAuthBootstrap()
  ├── readCachedUser()              ← localStorage 快速恢复
  ├── restoreUserWithTimeout(8s)    ← Supabase getSession() + 查询 profile
  ├── onAuthStateChange(SIGNED_OUT) ← 被动登出
  └── handleLogin / handleLogout    ← 用户操作
```

支持 **auth-disabled 模式** (`VITE_DISABLE_AUTH=true`)：无 Supabase session 时读本地缓存用户。

支持 **运行时凭据** (`saveRuntimeCredentials`)：允许用户在登录界面手动输入 Supabase URL/Key，持久化到 localStorage。

---

## 4. 离线架构 (Offline Architecture)

三层离线保障，从最上层到最底层：

### 4.1 Service Worker (PWA 缓存层)

**文件**: `public/sw.js` (63 行)

- 基于 Cache API (`CACHE_NAME = 'bahati-pro-{version}-{gitSha}'`)
- **Navigation 请求**: 网络优先 → 离线时回退缓存（确保部署后拿到最新 index.html）
- **其他资产**: 缓存优先 → 网络回退
- 版本号含 git SHA，每次部署自动使旧缓存失效
- `activate` 事件清除所有旧版本缓存
- 支持 `sw-update-ready` 事件通知 React 显示更新横幅

### 4.2 IndexedDB 离线队列 (offlineQueue.ts)

**文件**: `offlineQueue.ts` (1625 行)

**数据库**: `bahati_offline_db` / `pending_transactions` 表 (IDB)

**设计要点**:
- 队列项携带 `operationId` + `entityVersion` 保证幂等性
- **指数退避重试**: base 2s → 4s → 8s → 16s → 32s, 最大 5 次
- **死信机制**: 超过 MAX_RETRIES=5 进入 dead letter, 标记 `isDeadLetter`
- 过期清理: 保留 7 天，定期 `pruneOldSynced()`
- 支持照片持久化: data URL → 转 HTTP URL 后存储
- localStorage 可用性检测 + 内存缓存降级

**flushQueue()** 流程:
1. 读取 IDB 中所有 pending 项（按 createdAt 排序）
2. 跳过 retryWaiting（未到退避窗口）和 dead letter
3. 对每条:
   - 照片先持久化 (`persistEvidencePhotoUrl`)
   - 调用 `submitCollectionV2` 或 Edge RPC
   - 成功后标记 `successAt` + `isSynced`
   - 失败后递增 retryCount
4. 返回 flush 数量

### 4.3 自动同步循环 (useOfflineSyncLoop)

**文件**: `hooks/useOfflineSyncLoop.ts` (315 行)

| 触发器 | 条件 | 频率 |
|--------|------|------|
| 离线→在线切换 | `unsyncedCount > 0` 或 IDB 队列非空 | 即时 |
| 定时轮询 | 在线且有未同步项 | 60s |
| SW 消息 | `FLUSH_OFFLINE_QUEUE` | 事件驱动 |
| Background Sync | Service Worker `bahati-flush-queue` tag | 浏览器决定 |

**GPS 心跳**:
- 仅 driver 角色, 在线时运行
- 60s 间隔 + 即时推送（挂载时立即上报）
- 移动超过 50m 才更新 GPS 坐标, 否则只更新 `lastActive`
- 5s 超时, 并发锁 (`isUpdatingGps`) 防止竞争

### 4.4 本地缓存 (localDB)

**文件**: `services/localDB.ts` (39 行)

基于 `idb-keyval` 的封装, IndexedDB 优先, localStorage 降级。
存储所有查询快照: locations, drivers, transactions, settlements, aiLogs。

---

## 5. 关键模块依赖关系图

### 5.1 模块层级分层

```
index.html ─────────── public/sw.js
    │
index.tsx  ─────────── env.ts / supabaseClient.ts
    │
 App.tsx (ErrorBoundary + Provider 嵌套)
    │
    ├─ useAuthBootstrap ───── useAuthPersistence / authService / supabase.auth
    │
    └─ AuthenticatedApp
         │
         ├─ useSupabaseData ──── repositories/* / localDB / supabaseRoleScope
         ├─ useSupabaseMutations ── repositories/* / offlineQueue / services/*
         ├─ useRealtimeSubscription ── supabase.channel / realtimeInvalidation
         ├─ useOfflineSyncLoop ── triggerSync() / GPS heartbeat / SW sync
         │
         └─ Context 传递
              ├─ AuthProvider    →  currentUser, lang, userRole
              ├─ DataProvider    →  locations, drivers, transactions, settlements
              └─ MutationProvider →  syncOfflineData, submitTransaction, createSettlement ...
                        │
                        └─ AppRouterShell
                              ├─ AppAdminShell ── renderAdminShellView
                              │    ├─ DashboardPage (overview / settlement / tracking / locations)
                              │    ├─ DriverManagement (CRUD 司机 + 薪资)
                              │    ├─ DriverCollectionFlow (采集录入)
                              │    ├─ DebtManager
                              │    ├─ TransactionHistory
                              │    ├─ MonthlyReportPage
                              │    ├─ DriverFlowDiagnosticsPage
                              │    └─ AdminDeadLetterPage
                              │
                              └─ AppDriverShell ── renderDriverShellView
                                   ├─ QuickCollect (3-click fast)
                                   ├─ DriverCollectionFlow (4-step wizard)
                                   ├─ DashboardPage (settlement tab only)
                                   ├─ DebtManager
                                   ├─ TransactionHistory
                                   └─ DriverStatusPanel
```

### 5.2 Repository 层 (数据访问)

| 模块 | 文件 | Supabase 表 |
|------|------|------------|
| `locationRepository` | 51 行 | `locations` — upsert/delete/fetch |
| `driverRepository` | — | `drivers` — update/updateCoins |
| `transactionRepository` | 74 行 | `transactions` — fetch(带 RLS 验证)/upsert |
| `settlementRepository` | — | `daily_settlements` — fetch(按 scope)/create/review |
| `approvalRepository` | — | 费用/提现/重置审批 + 异常交易复审 |
| `requestRepository` | — | 创建提现/重置请求 |
| `aiLogRepository` | — | insert/fetch AI 日志 |
| `authRepository` | — | 用户 profile 查询 |
| `monthlyPayrollRepository` | — | 月度工资报表 |

### 5.3 Services 层 (业务逻辑)

| 服务 | 文件 | 职责 |
|------|------|------|
| `authService` | authService.ts | Supabase 登录/登出/改密/邮箱绑定 |
| `apkUpdate` | apkUpdate.ts | Android APK 版本检测 + 下载 + 安装 |
| `localDB` | localDB.ts | idb-keyval 封装, IDB + localStorage 双降级 |
| `collectionSubmissionService` | 263 行 | Stage-2 服务端权威收款提交 |
| `collectionSubmissionOrchestrator` | — | 编排离线/在线提交逻辑 |
| `collectionSubmissionAudit` | — | 提交审计日志 |
| `financeCalculator` | — | 本地财务预计算 (commission/debt/deduction) |
| `financeAuditService` | — | 财务审计操作追踪 |
| `driverManagementService` | — | 边缘函数创建/删除司机 |
| `driverFlowTelemetry` | — | 司机操作流程追踪上报 |
| `evidenceStorage` | — | 证据照片上传 (Supabase Storage) |
| `realtimeInvalidation` | — | Realtime 事件防抖 + React Query 失效 |
| `supabaseRoleScope` | 61 行 | 按角色计算查询 scope/limit |
| `adminNotifications` | — | 管理员通知逻辑 |
| `adminSubmissionNotifications` | — | 日结提交通知管理 |
| `scanMeterService` | — | 水/电表扫码读数 (API routes) |
| `translateService` | — | 翻译 API |
| `identityNormalization` | — | 用户身份归一化处理 |

### 5.4 Supabase Edge Functions

| 函数 | 文件 | 用途 |
|------|------|------|
| `create-driver` | supabase/functions/create-driver/ | 创建司机账号 (auth.users + public.drivers) |
| `delete-driver` | supabase/functions/delete-driver/ | 删除司机账号 (auth + profile) |
| `authz` (shared) | supabase/functions/_shared/authz.ts | 权限验证中间件 |
| `supabaseAdmin` (shared) | supabase/functions/_shared/supabaseAdmin.ts | 管理员 Supabase 客户端 |

### 5.5 API Routes (Vite Server Proxy → Edge)

| 路由 | 文件 | 用途 |
|------|------|------|
| `POST /api/scan-meter` | api/scan-meter.ts | 扫码获取读数 |
| `POST /api/translate` | api/translate.ts | 文本翻译 |
| `GET /api/tz-pulse` | api/tz-pulse.ts | 坦桑尼亚时区心跳保持 |
| `POST /api/admin-ai` | api/admin-ai.ts | 管理员 AI 助手 |

### 5.6 Shared Hooks (跨 Shell 复用)

| Hook | 文件 | 职责 |
|------|------|------|
| `useAuthBootstrap` | hooks/useAuthBootstrap.ts | 认证初始化 + session 恢复 |
| `useSupabaseData` | hooks/useSupabaseData.ts | 5 个 React Query 数据获取 |
| `useSupabaseMutations` | hooks/useSupabaseMutations.ts | 12 个数据变更操作 |
| `useOfflineSyncLoop` | hooks/useOfflineSyncLoop.ts | 离线同步 + GPS 心跳 |
| `useRealtimeSubscription` | hooks/useRealtimeSubscription.ts | Supabase Realtime 订阅 |
| `useSyncStatus` | hooks/useSyncStatus.ts | 同步状态 UI 绑定 |
| `useDevicePerformance` | hooks/useDevicePerformance.ts | 设备性能检测 |
| `useAppUpdateCheck` | hooks/useAppUpdateCheck.ts | APK/web 更新检查 |
| `useAdminAI` | hooks/useAdminAI.ts | 管理员 AI 助手 |
| `useCollectionSubmission` | hooks/useCollectionSubmission.ts | 收款提交 hook |
| `useFormStatus` | hooks/useFormStatus.ts | 表单状态管理 |

### 5.7 Driver Hooks (司机端专用)

| Hook | 文件 | 职责 |
|------|------|------|
| `useCollectionDraft` | driver/hooks/useCollectionDraft.ts | 收款草稿状态 |
| `useCollectionFinancePreview` | driver/hooks/useCollectionFinancePreview.ts | 财务预计算 |
| `useDriverSubmissionCompletion` | driver/hooks/useDriverSubmissionCompletion.ts | 提交完成跟踪 |
| `useGpsCapture` | driver/hooks/useGpsCapture.ts | GPS 坐标捕获 |
| `useNextQueuedMachine` | driver/hooks/useNextQueuedMachine.ts | 下一台机器队列 |

---

## 6. 整体架构特征

### 架构风格
- **离线优先 (Offline-First)**: 所有数据通过 localDB 本地缓存, 在线时同步到 Supabase
- **乐观更新 (Optimistic Updates)**: 所有 mutations 先更新 React Query cache → 后台同步
- **弹性网络**: 3 层降级 (network → IDB queue → localDB fallback)
- **角色隔离**: admin/driver 共享代码但在 hooks 层做数据权限过滤
- **UI 状态路由**: 不使用 URL 路由, 纯组件状态驱动视图切换

### 关键技术依赖

| 依赖 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript 6 | 类型系统 |
| Vite 8 | 构建 + dev server |
| Tailwind CSS 4 | 样式 |
| @supabase/supabase-js | 数据库 + Auth + Realtime |
| @tanstack/react-query | 服务端状态管理 |
| @capacitor/* 8 | 原生桥接 (Android/iOS) |
| @sentry/react | 错误追踪 |
| idb-keyval | IndexedDB 简单封装 |
| leaflet + react-leaflet | 地图渲染 |
| lucide-react | 图标库 |
| recharts | 数据图表 |
| openai | AI 助手 (openai SDK) |
| @vercel/analytics | 分析 |

### 部署目标

| 平台 | 构建方式 | CI/CD |
|------|---------|-------|
| WEB (Vercel) | `npm run build` → vercel.json | GitHub Actions + Vercel Deploy |
| Android (Google Play) | Capacitor build → APK/AAB | GitHub Actions build-apk |
| iOS (App Store) | Capacitor build → IPA | GitHub Actions (配置中) |
| PWA (自托管) | SW + IndexedDB | 同上 Vercel 部署 |

> 项目地图基于对源代码的全面分析生成。以上所有路径和组件均为真实存在的文件。
