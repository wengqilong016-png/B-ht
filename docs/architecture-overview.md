# BHT (Bahati Jackpots) 架构总览

> 摸底时间: 2026-05-18 | 版本: 1.0.15
> 栈: React 19 + TypeScript + Vite + Capacitor + Supabase

## 部署形态
- **Web**: Vercel (SPA)
- **Mobile**: Android APK (Capacitor, 离线下可用)
- **DB**: Supabase (Postgres + RLS + RPC + Realtime)

## 目录结构

```
bht/
├── App.tsx                          # 根组件: Auth → Data → Mutation Provider 嵌套
├── index.tsx                        # ReactDOM 入口
│
├── services/                        # 业务服务层
│   ├── financeCalculator.ts         # ★ 财务计算引擎 (local + RPC fallback)
│   ├── financeAuditService.ts       # ★ 审计日志 (fire-and-forget)
│   ├── collectionSubmissionService.ts # 收款提交
│   ├── collectionSubmissionOrchestrator.ts
│   ├── authService.ts               # 认证
│   ├── scanMeterService.ts          # AI 读表
│   ├── evidenceStorage.ts           # 证据图片
│   ├── driverManagementService.ts
│   ├── driverFlowTelemetry.ts
│   ├── translateService.ts
│   ├── adminNotifications.ts
│   └── realtimeInvalidation.ts
│
├── repositories/                    # 数据仓储层
│   ├── authRepository.ts
│   ├── driverRepository.ts
│   ├── locationRepository.ts
│   ├── transactionRepository.ts
│   ├── settlementRepository.ts
│   ├── approvalRepository.ts
│   ├── requestRepository.ts
│   ├── monthlyPayrollRepository.ts
│   └── aiLogRepository.ts
│
├── hooks/                           # React Hooks (TanStack Query)
│   ├── useSupabaseData.ts           # 数据查询 (30s polling)
│   ├── useSupabaseMutations.ts      # 数据变更
│   ├── useCollectionSubmission.ts
│   ├── useOfflineSyncLoop.ts        # 离线同步循环
│   ├── useRealtimeSubscription.ts
│   └── ...
│
├── driver/                          # 司机端 (Swahili/English)
│   ├── AppDriverShell.tsx
│   ├── pages/DriverCollectionFlow.tsx  # 4步收款向导
│   ├── hooks/useCollectionFinancePreview.ts  # 金融预览hook
│   └── components/
│       ├── QuickCollect.tsx         # 3击快速收款
│       ├── FinanceSummary.tsx       # 财务摘要
│       ├── finance/FinanceSummarySections.tsx
│       ├── MachineSelector.tsx
│       ├── ReadingCapture.tsx       # AI 读数拍照
│       ├── PayoutRequest.tsx
│       ├── ResetRequest.tsx
│       └── SubmitReview.tsx
│
├── admin/                           # 管理员端 (Chinese)
│   ├── AppAdminShell.tsx
│   ├── adminShellConfig.tsx
│   ├── MonthlyReportPage.tsx
│   ├── DriverFlowDiagnosticsPage.tsx
│   └── components/
│       └── AdminAIAssistant.tsx
│
├── components/                      # 共享组件
│   ├── dashboard/                   # 管理面板 (Overview/Settlement/Sites/Tracking/AiLogs)
│   │   ├── SettlementTab.tsx        # ★ 结算审批面板
│   │   ├── PayrollActionModal.tsx
│   │   ├── settlementApprovalTasks.ts
│   │   └── hooks/useDashboardData.ts
│   ├── driver-management/           # 司机管理 CRUD
│   ├── DebtManager.tsx              # 债务管理
│   ├── TransactionHistory.tsx
│   └── ...
│
├── contexts/                        # React Context
│   ├── AuthContext.tsx
│   ├── DataContext.tsx
│   ├── MutationContext.tsx
│   └── ...
│
├── shared/                          # 共享布局
│   └── layout/ (AppShell, Sidebar, Header, MobileNav, MainContent)
│
├── offlineQueue.ts                  # ★ 离线队列 (IDB + localStorage + 内存三级降级)
├── supabaseClient.ts                # Supabase 客户端单例
├── types.ts + types/                # 类型定义
│
├── supabase/
│   ├── schema.sql                   # 完整数据库 schema
│   ├── migrations/ (60+ 迁移)       # ★ 财务相关重点迁移见下
│   └── functions/ (Edge Functions)
│
├── public/
│   ├── sw.js                        # Service Worker (已修复: network-first API)
│   └── version.json
│
├── __tests__/ (75+ 测试文件)         # Jest 测试
│   ├── financeCalculator.test.ts    # 金融计算测试 (386行)
│   ├── transactionBuilder.test.ts
│   ├── settlementRules.test.ts
│   ├── settlementWorkflowFlow.test.tsx
│   └── integration/ (auth, collection, offline)
│
├── e2e/                             # Playwright E2E
├── docs/reports/code-review-20260518.json  # 上一次代码审查报告
├── vercel.json                      # Vercel 部署配置
├── capacitor.config.ts              # Capacitor 配置
├── vite.config.ts
└── tailwind.config.js
```

## 金融计算核心流程

```
司机拍照读表 → currentScore
        ↓
  diff = max(0, currentScore - lastScore)
        ↓
  revenue = diff × 200 TZS (COIN_VALUE_TZS)
        ↓
  commission = floor(revenue × commissionRate)  // 默认 15%
        ↓
  finalRetention = ownerRetention ?? commission  // 车主提成
        ↓
  availableAfterCore = max(0, revenue - finalRetention - abs(expenses) - abs(tip))
        ↓
  startupDebtDeduction = min(requested, remainingStartupDebt)  // 债务偿还
        ↓
  netPayable = max(0, availableAfterCore + startupDebtDeduction)
        ↓
  结算 → remainingCoins = initialFloat + netPayable - coinExchange
  审计 → finance_audit_log 追加入库
```

## 关键 Supabase 迁移

| 迁移 | 用途 |
|------|------|
| `calculate_finance_v2.sql` | 服务端财务计算 RPC（与前端双路校验） |
| `submit_collection_v2.sql` | 收款提交 RPC |
| `finance_audit_log.sql` | 审计日志表（RLS: admin 可读, 全员可写追加） |
| `zero_revenue_settlement_guard.sql` | 零收入结算防护 |
| `transactions_payment_status_check.sql` | 付款状态约束 |

## 离线架构

```
offlineQueue.ts
  ├── IDB (IndexedDB) — 持久化队列
  ├── localStorage — 降级方案
  └── 内存 Map — 最快读写
        ↓
  useOfflineSyncLoop.ts — 后台同步循环
        ↓
  service worker sync event + postMessage FLUSH_OFFLINE_QUEUE
```
