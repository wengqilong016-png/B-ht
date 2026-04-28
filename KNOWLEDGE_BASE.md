# Bahati Jackpots — 结构化知识库

> 版本: 1.0.12 | 创建日期: 2026-04-28
> 技术栈: React 19 + TypeScript + Vite + Supabase + TailwindCSS 4 + Capacitor (Android/iOS)
> Node 22.x, npm 10.x

---

## 1. 项目概述

Bahati Jackpots 是一套面向坦尼亚市场的**老虎机点位收款管理系统**。公司（Bahati）在多个商户/商铺点位部署老虎机，雇佣司机每日前往各点位抄表（读取计数器读数）、收款、拍照留证，系统自动计算营收、佣金、扣债和净缴款。

**两大角色:**

| 角色 | 职责 | 入口 |
|------|------|------|
| **司机 (Driver)** | 现场巡检 → 拍照抄表 → 录入读数 → 提交交易 → 离线队列 | `driver/` 子应用 |
| **管理员 (Admin)** | 日终对账结算 → 月度工资核算 → 审批点位变更 → 财务审计 → AI 分析 | `admin/` 子应用 |

**核心业务闭环:**
1. 司机去 Location（机器点位）收款
2. 提交 Transaction（含 revenue/commission/expenses/coinExchange/netPayable）
3. 管理员每日做 DailySettlement 核对 actualCash/actualCoins vs expectedTotal
4. 月末生成 MonthlyPayroll: baseSalary + commission - privateLoanDeduction - shortageDeduction

**支持能力:**
- 离线优先 (IndexedDB → localStorage → memory cache 三级降级)
- 后台自动同步 (指数退避重试, 最多 5 次, 死信队列可见)
- AI 识别仪表读数 + 异常检测 (OpenAI)
- GPS 定位验证 + EXIF 提取
- 多语言: 斯瓦希里语 (sw), 中文 (zh)
- Sentry 错误监控
- RLS (Row Level Security) 权限隔离

---

## 2. 技术架构层级

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (React)                         │
│  App.tsx → AdminShell / DriverShell → Pages → Components        │
│  i18n (sw/zh) · TailwindCSS 4 · lucide-react · recharts        │
├─────────────────────────────────────────────────────────────────┤
│                      State & Data Layer                         │
│  Contexts: Auth | Data | Mutation | Toast | Confirm            │
│  React Query (TanStack) @tanstack/react-query                   │
│  Custom Hooks: useCollectionSubmission | useOfflineSyncLoop     │
│            useSupabaseData | useSupabaseMutations               │
├─────────────────────────────────────────────────────────────────┤
│                       Services Layer                            │
│  collectionSubmissionOrchestrator (提交编排)                    │
│  collectionSubmissionService (在线/离线分发)                    │
│  financeCalculator / calculate_finance_v2 (RPC) (财务计算)     │
│  transactionBuilder (交易构建器)                                │
│  offlineQueue (IndexedDB 离线队列)                              │
│  evidenceStorage (Supabase Storage 照片)                        │
│  authService | driverManagementService                         │
│  realtimeInvalidation | financeAuditService                    │
├─────────────────────────────────────────────────────────────────┤
│                      Repositories Layer                         │
│  transactionRepository | settlementRepository                   │
│  monthlyPayrollRepository | locationRepository                  │
│  driverRepository | approvalRepository | authRepository         │
├─────────────────────────────────────────────────────────────────┤
│                      Supabase Backend                           │
│  PostgreSQL 数据库 · RLS 策略 · Edge Functions                  │
│  Storage Bucket (evidence: JPEG/PNG/WebP, max 5MB)             │
│  Realtime 订阅 · auth.users + profiles 关联                     │
├─────────────────────────────────────────────────────────────────┤
│                Native Layer (Capacitor)                         │
│  @capacitor/geolocation · @capacitor/core (Android/iOS)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心业务流程

### 3.1 收款流程 (Collection Flow)

```
司机登录 → 选择 Location → 拍照(证据) → 录入仪表读数 → [AI识别读数]
                                      ↓
                            financeCalculator 计算:
                              diff = currentScore - lastScore
                              revenue = diff × 200(TZS)
                              commission = revenue × commissionRate
                              netPayable = revenue - commission - expenses - tip + startupDebtDeduction
                                      ↓
                  线上: submitCollectionV2 → Supabase RPC calculate_finance_v2
                  离线: createCollectionTransaction → enqueueTransaction → IndexedDB
                                      ↓
                  [后台 useOfflineSyncLoop 定时 flushQueue, 指数退避重试 5 次]
```

**关键文件链路:**
- `driver/pages/CollectionPage.tsx` (UI 入口)
- `services/collectionSubmissionOrchestrator.ts` (编排)
- `services/financeCalculator.ts` (财务计算)
- `services/collectionSubmissionService.ts` (提交服务)
- `utils/transactionBuilder.ts` (构建 Transaction 对象)
- `offlineQueue.ts` (离线队列)

### 3.2 日结流程 (Daily Settlement Flow)

```
管理员进入日结页面 → 选择 Driver + Date
                   → 系统从 transactions 聚合:
                        totalRevenue, totalNetPayable, totalExpenses, driverFloat
                   → expectedTotal = totalNetPayable + totalExpenses
                   → 管理员录入: actualCash, actualCoins
                   → shortage = expectedTotal - (actualCash + actualCoins)
                   → 确认/驳回 → 写入 daily_settlements
```

**核对公式:**
```
expectedTotal = totalNetPayable + totalExpenses
shortage = expectedTotal - (actualCash + actualCoins)
```

**关键文件:**
- `admin/AdminShell.tsx` → 日结页面组件
- `repositories/settlementRepository.ts`
- `supabase/schema.sql: daily_settlements 表`

### 3.3 月薪流程 (Monthly Payroll Flow)

```
月末 → 管理员选择 Driver + Month
     → 系统从 transactions 月度聚合:
         totalRevenue, commission 总额, collectionCount
     → 生成 MonthlyPayroll:
         netPayable = baseSalary + commission
                      - privateLoanDeduction    (司机私人借款扣款)
                      - shortageDeduction       (日结短缺扣款)
     → 状态: pending → paid → 录入 paymentMethod/paymentProofUrl
```

**计算:**
```
netPayable = baseSalary + commission - privateLoanDeduction - shortageDeduction
```

**关键文件:**
- `admin/MonthlyReportPage.tsx`
- `repositories/monthlyPayrollRepository.ts`
- `supabase/schema.sql: monthly_payrolls 表`

---

## 4. 数据模型关系图

```
┌──────────────┐     1:N      ┌───────────────┐
│    drivers   │◄────────────│  transactions  │
├──────────────┤             ├───────────────┤
│ id (PK)      │             │ id (PK)       │
│ name         │             │ locationId FK │  ┌──────────────────┐
│ username     │             │ driverId  FK  │  │    locations     │
│ status       │             │ type          │  ├──────────────────┤
│ baseSalary   │             │ previousScore ├─►│ id (PK)          │
│ commissionRate│            │ currentScore  │  │ name             │
│ initialDebt  │        ┌───►│ revenue       │  │ machineId UNIQUE │
│ remainingDebt│        │    │ commission    │  │ assignedDriverId │
│ dailyFloatingCoins│       │ netPayable    │  │ commissionRate   │
│ vehicleInfo  │        │    │ paymentStatus │  │ lastScore        │
│ currentGps   │        │    │ photoUrl      │  │ status           │
└──────┬───────┘        │    │ isAnomaly     │  │ coords           │
       │                │    └───────────────┘  │ remainingStartupDebt│
       │ 1:1            │                       └──────────────────┘
       │                │
┌──────▼───────┐        │    ┌──────────────────┐
│   profiles   │        │    │ daily_settlements│
├──────────────┤        │    ├──────────────────┤
│auth_user_idFK│        │    │ id (PK)          │
│ role         │        │    │ driverId FK      │
│ display_name │        │    │ date             │
│ driver_id FK │        ├───►│ totalRevenue     │
└──────────────┘        │    │ expectedTotal    │
                        │    │ actualCash       │     ┌─────────────────┐
                        │    │ actualCoins      │     │ monthly_payrolls│
                        │    │ shortage         │     ├─────────────────┤
                        │    │ status           │     │ id (PK)         │
                        │    └──────┬───────────┘     │ driverId FK     │
                        │           │                 │ month           │
                        │           │                 │ baseSalary      │
                        │    ┌──────▼───────────┐     │ commission      │
                        │    │location_change_  │     │privateLoanDeduct│
                        │    │    requests       │     │shortageDeduct   │
                        │    ├──────────────────┤     │ netPayable      │
                        │    │ id (PK)           │     │ status          │
                        │    │ location_id FK    │     └─────────────────┘
                        │    │ patch (JSONB)     │
                        │    │ status            │     ┌─────────────────┐
                        │    └──────────────────┘     │  finance_audit  │
                        │                             │    _log         │
                        │                             ├─────────────────┤
                        │                             │ id (PK)         │
                        │                             │ event_type      │
                        │                             │ entity_type     │
                        │                             │ old/new_value   │
                        │                             └─────────────────┘
```

**核心表关系:**
- `drivers` 1:N `transactions` (司机提交交易)
- `locations` 1:N `transactions` (每个点位多条交易)
- `drivers` 1:1 `profiles` (通过 driver_id 关联)
- `locations` N:1 `drivers` (通过 assignedDriverId 分配负责司机)
- `drivers` 1:N `daily_settlements` (每日结算记录)
- `drivers` 1:N `monthly_payrolls` (每月工资单)
- `drivers` 1:N `monthly_payrolls` (每月可有多条)
- `locations` 1:N `location_change_requests`
- `(drivers|locations)` 1:N `finance_audit_log` (审计日志)

---

## 5. 模块职责与关键文件表

### 5.1 UI 层

| 目录/文件 | 职责 |
|-----------|------|
| `App.tsx` | 应用入口，Bootstrapping + 角色路由分发 |
| `driver/` | 司机端子应用: 收款、注册、财务、AI 审计 |
| `admin/` | 管理端子应用: 日结、月薪、报表、审批、AI |
| `components/` | 共享 UI 组件 (登录、地图、债务管理、交易历史) |
| `contexts/` | React Context 提供者 (认证、数据、通知、Toast) |
| `hooks/` | 自定义 Hook (离线同步、实时订阅、Supabase CRUD) |

### 5.2 服务层 (services/)

| 文件 | 职责 |
|------|------|
| `collectionSubmissionOrchestrator.ts` | **提交编排中枢**: 校验分数 → AI 异常检测 → GPS 解析 → 选择线上提交或离线入队 |
| `collectionSubmissionService.ts` | **提交服务**: 在线调用 Supabase Edge Function / RPC; 返回结果封装 |
| `financeCalculator.ts` | **财务计算器**: 本地计算 (fallback) + Server RPC 预览 `calculate_finance_v2` |
| `evidenceStorage.ts` | **证据存储**: 照片上传到 Supabase Storage bucket `evidence` |
| `offlineQueue.ts` | **离线队列**: IndexedDB 持久化 + localStorage 降级 + 指数退避重试 + 死信处理 |
| `authService.ts` | 认证服务: 登录、会话管理、密码修改 |
| `financeAuditService.ts` | 财务审计日志: 记录 startupDebt/commissionRate 等变更 |
| `driverManagementService.ts` | 司机管理操作 |
| `realtimeInvalidation.ts` | Supabase Realtime 订阅 → React Query 缓存失效 |
| `scanMeterService.ts` | 仪表扫描服务 |
| `collectionSubmissionAudit.ts` | 提交审计日志 (内存中) |

### 5.3 工具层 (utils/)

| 文件 | 职责 |
|------|------|
| `transactionBuilder.ts` | **交易构建器**: 从 Location + Driver + 计算结果构建 Transaction 对象 |
| `settlementRules.ts` | 日结规则: 确认后才更新司机零钱 (shouldApplySettlementDriverCoinUpdate) |
| `locationWorkflow.ts` | 点位工作流辅助 |
| `stripClientFields.ts` | 过滤客户端不应提交的字段 |
| `imageUtils.ts` / `imageOptimization.ts` | 图片处理 (压缩、缩放) |
| `dateUtils.ts` | 日期工具 |

### 5.4 数据库层 (repositories/)

| 文件 | 职责 |
|------|------|
| `transactionRepository.ts` | Transaction 表 CRUD |
| `settlementRepository.ts` | DailySettlement 表 CRUD |
| `monthlyPayrollRepository.ts` | MonthlyPayroll 表 CRUD |
| `locationRepository.ts` | Locations 表 CRUD |
| `driverRepository.ts` | Drivers 表 CRUD |
| `approvalRepository.ts` | 审批流 (reset_request, payout_request) |
| `authRepository.ts` | 认证相关查询 |

### 5.5 类型与常量 (types/)

| 文件 | 内容 |
|------|------|
| `types/models.ts` | 所有领域模型接口: Location, Driver, Transaction, DailySettlement, MonthlyPayroll |
| `types/constants.ts` | 业务常量 (Coin value, commission rate 等) |
| `types/enums.ts` | 枚举类型 |
| `types/index.ts` | Barrel export |

### 5.6 其他关键文件

| 文件 | 职责 |
|------|------|
| `supabase/schema.sql` | 完整生产 Schema (2442 行), 含所有表/索引/触发器/RLS 策略 |
| `offlineQueue.ts` | 离线队列实现 (1604 行) |
| `env.ts` | 环境变量校验 |
| `i18n/sw.ts` | 斯瓦希里语翻译 |
| `i18n/zh.ts` | 中文翻译 |
| `i18n/index.ts` | i18n 入口 |
| `supabaseClient.ts` | Supabase 客户端初始化 |
| `AGENTS.md` | 开发约定与工作流程规范 |

---

## 6. 关键业务规则

### 6.1 财务计算公式

**单笔交易计算 (financeCalculator):**
```
diff = max(0, currentScore - location.lastScore)
revenue = diff × COIN_VALUE_TZS (200 TZS)
commissionRate = location.commissionRate ?? DEFAULT_PROFIT_SHARE (0.15)
commission = floor(revenue × commissionRate)

finalRetention = ownerRetention ?? commission

remainingStartupDebt = max(0, location.remainingStartupDebt)
availableAfterCoreDeductions = max(0, revenue - finalRetention - expenses - tip)
startupDebtDeduction = min(startupDebtDeductionRequest, remainingStartupDebt)
netPayable = max(0, availableAfterCoreDeductions + startupDebtDeduction)  ← 注意这里

remainingCoins = initialFloat + netPayable - coinExchange
isCoinStockNegative = remainingCoins < 0
```

**关键常量 (types/constants.ts):**

| 常量 | 值 | 说明 |
|------|-----|------|
| `COIN_VALUE_TZS` | 200 | 每游戏分值的货币价值 (坦桑尼亚先令) |
| `DEFAULT_PROFIT_SHARE` | 0.15 | 默认佣金率 (15%) |
| `DEBT_RECOVERY_RATE` | 0.10 | 债务回收率 (10%) |
| `ROLLOVER_THRESHOLD` | 10000 | 结转阈值 |
| `ANOMALY_SCORE_DIFF_THRESHOLD` | 50 | AI 识别分数差异异常标记阈值 |
| `STAGNANT_DAYS_THRESHOLD` | 7 | 停滞天数阈值 |

### 6.2 扣债规则

| 扣债类型 | 来源 | 计算 |
|----------|------|------|
| `startupDebtDeduction` | Location 级 | startupDebtDeduction 由司机输入, 上限为 remainingStartupDebt |
| `debtDeduction` | Driver 级 | 司机私人债务扣款 (按 DEBT_RECOVERY_RATE 10%) |
| `shortageDeduction` | MonthlyPayroll | 日结短缺累计扣款, 从月工资中扣除 |
| `privateLoanDeduction` | MonthlyPayroll | 司机私人借款扣款, 从月工资中扣除 |

### 6.3 日结账目核对

```
expectedTotal = totalNetPayable + totalExpenses
shortage = expectedTotal - (actualCash + actualCoins)
```

- `actualCash`: 实际现金金额
- `actualCoins`: 实际硬币数量 (会按 COIN_VALUE_TZS 换算)
- `shortage > 0`: 缺款, 会计入月末 shortageDeduction
- `shortage < 0`: 溢款 (多出钱)

**日结状态:** `pending` → `confirmed` / `rejected`
- 仅 `confirmed` 状态才触发司机零钱更新 (settlementRules.ts)

### 6.4 月薪计算

```
monthlyPayroll.netPayable = baseSalary + commission - privateLoanDeduction - shortageDeduction
```

- `baseSalary`: 来自 drivers.baseSalary (默认 300,000 TZS)
- `commission`: 该月所有交易 commission 的总和
- 每个 driver + month 唯一键约束 (idx_monthly_payrolls_driver_month)

### 6.5 Commission Rate 层级

| 级别 | 字段 | 说明 |
|------|------|------|
| Location | `locations.commissionRate` | 每个点位独立设置 (默认 0.15 = 15%) |
| Driver | `drivers.commissionRate` | 司机个人佣金率 (默认 0.05 = 5%) |
| 默认值 | `CONSTANTS.DEFAULT_PROFIT_SHARE` | 0.15, 未指定时使用 |

### 6.6 Transaction 类型

| type | 说明 |
|------|------|
| `collection` | 常规收款交易 |
| `expense` | 支出 (public=公司成本, private=司机借款) |
| `check_in` | 司机签到 |
| `check_out` | 司机签退 |
| `reset_request` | 仪表清零申请 |
| `payout_request` | 店主分红提现申请 |
| `debt` | 债务记录 |
| `startup_debt` | 启动债务记录 |

---

## 7. 开发约定要点 (来自 AGENTS.md)

### 核心原则
1. **先理解再修改** — 禁止盲目改代码
2. **先根因后修复** — 必须输出调用链分析 + 1~3 个根因 (按概率排序)
3. **最小必要改动** — 禁止顺手重构, 禁止扩大范围
4. **不重复失败路径** — 连续 2 次失败必须停止当前思路, 重新分析
5. **不破坏业务换测试通过**
6. **保持接口与行为一致**

### 工作流程 (7 阶段)
1. **问题定义** — 复现步骤 / 预期行为 / 实际行为 / 报错信息
2. **范围锁定** — 初始 ≤ 3 个文件, 扩展须说明原因
3. **根因分析** — 禁止在此阶段修改代码
4. **最小修复** — 只修改直接相关代码
5. **验证 (分级)** — 默认最小验证; 全量验证 (lint/test/build) 必须有理由
6. **失败处理** — 连续 2 次失败 → 停止 → 重新根因分析 → 新方案
7. **输出** — 根因 / 修改内容 / 修改目的 / 命令 / 结果 / 风险

### 验证执行规则
- 禁止重复运行同一命令
- 单文件纯逻辑改动 → 优先对应单测或 `npm run typecheck`
- UI 局部改动 → 优先启动页面
- 数据库/认证/离线同步/支付/权限改动 → 必须说明风险
- 只有修改共享基础设施、构建配置、依赖、类型定义时才考虑完整验证

### 验证命令参考
```
npm run typecheck          # 类型检查 (最常用, 轻量)
npm run test:unit          # 单元测试
npm run test:ci            # CI 测试 (含 unit + integration)
npm run lint               # 代码检查
npm run build              # 生产构建 (最重量级)
```

### 明确禁止
- 跳过验证
- 注释代码假修复
- 删除报错代码
- 无依据改依赖
- 修改无关文件
- 编造结果
- 扫描整个仓库

### 额度与智力平衡
- 限制读取范围 (1~3 个文件), 不限制推理深度
- 禁止扫描整个仓库 (除非必要且说明原因)
- 每次只解决一个问题
- 输出精简, 但推理必须完整

---

## 8. AI 辅助开发指南

### 8.1 开发前必读
1. 先读 `AGENTS.md` — 了解开发约束和工作流
2. 再读 `types/models.ts` — 理解数据模型
3. 最后读 `supabase/schema.sql` 相关表段 — 理解数据库约束

### 8.2 文件搜索建议
```
# 优先使用 rg (ripgrep) 搜索
rg "pattern" --type ts -l

# 搜索类型引用
rg "interface.*Transaction" --type ts

# 搜索函数调用
rg "calculateCollectionFinance" --type ts

# 搜索特定文件
```

### 8.3 开发流程规范

**添加新功能:**
1. 确定涉及的模型 → 修改 `types/models.ts`
2. 如涉及数据库 → 同步修改 `supabase/schema.sql` (migration)
3. 编写 Service 逻辑 → `services/`
4. 编写 Repository CRUD → `repositories/`
5. 编写 UI 组件 → `components/` 或 `admin/`/`driver/`
6. 添加 i18n key → `i18n/sw.ts` + `i18n/zh.ts`
7. 编写测试 → `__tests__/`

**修复 Bug:**
1. 按 AGENTS.md 7 阶段流程执行
2. 范围锁定 ≤ 3 文件
3. 最小修复
4. `npm run typecheck` 验证

### 8.4 常见陷阱

| 陷阱 | 说明 |
|------|------|
| `netPayable = max(0, availableAfterCoreDeductions + startupDebtDeduction)` | Startup debt deduction 是**加**到 netPayable 中的 (因为它是司机代扣的启动债务还款, 应该上交) |
| offlineQueue 三级降级 | IndexedDB → localStorage → memory cache, 修改队列逻辑需覆盖全部三条路径 |
| `financeCalculator` 本地计算 | Server RPC `calculate_finance_v2` 失败时的 fallback, 两者逻辑必须一致 |
| 离线事务 replay | 使用 `rawInput` 通过 `submitCollectionV2` 重新计算, 而非直接 upsert 本地值 |
| RLS 策略 | drivers/transactions 等表有严格 RLS, 修改表结构需同步检查策略 |
| `isSynced` 字段 | 所有业务表都有此字段, 标记本地/服务器同步状态 |

### 8.5 离线同步机制
- `enqueueTransaction()`: 离线时入队 (IndexedDB)
- `flushQueue()`: 联网时批量提交
- 指数退避: 2s → 4s → 8s → 16s → 32s
- 最大重试: 5 次 (`MAX_RETRIES`)
- 死信队列: `dead_letter_count` → 可在 admin 端查看
- `useOfflineSyncLoop`: React Hook, 后台定时触发 flush

### 8.6 测试策略
```
__tests__/
  ├── unit/           # 单测 (financeCalculator, transactionBuilder, etc.)
  ├── integration/    # 集成测试
  └── *.test.ts       # 根级测试文件
e2e/                  # Playwright E2E 测试
```

---

*知识库结束. 如有更新请同步修改此文件.*
