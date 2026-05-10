# BHT 管理端 CRUD 全链路深度追踪文档

> 生成日期: 2026-05-10
> 审查范围: 管理员 Dashboard 所有增删改查操作 (Drivers, Locations, Transactions, Settlements)
> 方法: 静态代码追踪 + 调用链分析 + Schema 约束审查

---

## 目录

1. [架构总览](#1-架构总览)
2. [Drivers CRUD 全链路](#2-drivers-crud-全链路)
3. [Locations CRUD 全链路](#3-locations-crud-全链路)
4. [Transactions 审批全链路](#4-transactions-审批全链路)
5. [Settlements CRUD 全链路](#5-settlements-crud-全链路)
6. [乐观更新策略与回滚机制](#6-乐观更新策略与回滚机制)
7. [Error Handling 全景](#7-error-handling-全景)
8. [级联删除影响矩阵](#8-级联删除影响矩阵)
9. [调用链速查表](#9-调用链速查表)

---

## 1. 架构总览

### 1.1 分层架构

```
┌─────────────────────────────────────────────────┐
│  UI 层 (Components)                              │
│  DriverManagementPage.tsx / SitesTab.tsx         │
├─────────────────────────────────────────────────┤
│  React Query Mutation 层 (hooks/useSupabaseMutations.ts) │
│  - 乐观更新 (onMutate)                            │
│  - 服务端调用 (mutationFn)                       │
│  - 回滚 (onError)                                 │
│  - 缓存失效 (onSettled)                          │
├─────────────────────────────────────────────────┤
│  Repository 层 (repositories/*.ts)               │
│  - 纯 Supabase 调用                               │
│  - driverRepository / locationRepository /       │
│    transactionRepository / settlementRepository  │
│    approvalRepository / requestRepository        │
├─────────────────────────────────────────────────┤
│  Service 层 (services/*.ts)                      │
│  - driverManagementService (Edge Functions)      │
│  - financeAuditService (审计日志)                 │
├─────────────────────────────────────────────────┤
│  Supabase Backend                                │
│  - REST API (from().upsert/update/delete)        │
│  - RPC Functions (SECURITY DEFINER)              │
│  - Edge Functions (create-driver, delete-driver) │
│  - RLS Policies                                   │
│  - Schema Constraints (FOREIGN KEY cascade)       │
└─────────────────────────────────────────────────┘
```

### 1.2 Context 注入路径

```
App.tsx
 ├─ useSupabaseData()                     → 数据查询
 │   ├─ fetchDrivers / fetchLocations
 │   ├─ fetchTransactions / fetchSettlements
 │   └─ 输出: DataContext (useAppData)
 │
 ├─ useSupabaseMutations(isOnline, user, onError)
 │   └─ 输出: MutationContext (useMutations)
 │
 └─ 组件从两个 Context 取数据:
     useAppData()  → filteredDrivers, locations, transactions
     useMutations() → updateDrivers, deleteDrivers, updateLocations, ...
```

---

## 2. Drivers CRUD 全链路

### 2.1 创建司机 (Create)

```
UI: DriverManagementPage.tsx → handleSave() (editingId === null)
  │
  ├─ 1. 输入验证:
  │     - form.name 非空
  │     - form.password 非空且 ≥ 8 字符
  │
  ├─ 2. 调用 Edge Function:
  │     createDriverAccount({
  │       email: deriveDriverEmail(form.name),
  │       password, username, name
  │     })
  │     └─ POST supabase.functions.invoke('create-driver', { body })
  │        ├─ 30s 超时 (Promise.race)
  │        ├─ Edge Function 内部:
  │        │   ├─ 1. 创建 Supabase Auth user
  │        │   ├─ 2. INSERT INTO public.drivers (id, name, username)
  │        │   └─ 3. INSERT INTO public.profiles (auth_user_id, role='driver', driver_id)
  │        └─ 返回: { success, driverId } 或 { success:false, code, message }
  │
  ├─ 3. 持久化业务字段:
  │     persistDriverBusinessFields(createdDriverId, driverData)
  │     └─ supabase.from('drivers').update({ phone, vehicleInfo,
  │          dailyFloatingCoins, baseSalary, commissionRate,
  │          initialDebt, remainingDebt }).eq('id', driverId)
  │     ★ 这是独立步骤，失败不阻塞整体流程
  │
  └─ 4. 合并到本地状态:
        newDriver = { id: createdDriverId, ...driverData, remainingDebt }
        onUpdateDrivers([...drivers, newDriver])
        └─ updateDrivers.mutateAsync([...drivers, newDriver])
           └─ 走 updateDrivers mutation (乐观更新 + upsertDrivers)
```

**关键点**:
- 创建通过 Edge Function 而非直接 INSERT，确保 Auth user + drivers row + profiles row 原子性
- 业务字段 (phone, vehicleInfo, salary 等) 由 Edge Function 创建骨架后再通过 `persistDriverBusinessFields` 单独填充
- 如果 `persistDriverBusinessFields` 失败，Warning toast 提示管理员手动补填

### 2.2 更新司机 (Update)

```
UI: DriverManagementPage.tsx → handleSave() (editingId !== null)
  │
  ├─ 1. 构建 updatedDrivers:
  │     drivers.map(d => d.id === editingId
  │       ? { ...d, ...driverData, remainingDebt }
  │       : d)
  │
  ├─ 2. 检查地点分配是否变化:
  │     原 assignedLocationIds vs 新 pendingLocationIds
  │     若变化 → 同时更新 updatedLocationsBase
  │
  └─ 3. 并发调用:
        Promise.all([
          onUpdateDrivers(updatedDrivers),
          onUpdateLocations(updatedLocationsBase)  // 仅当分配变化
        ])
        │
        └─ updateDrivers.mutateAsync(updatedDrivers)
           │
           ├─ onMutate: 乐观更新
           │   - cancelQueries(['drivers'])
           │   - 快照 previousDrivers
           │   - setQueryData(['drivers'], updatedDrivers)
           │   - return { previousDrivers }
           │
           ├─ mutationFn:
           │   - 检查 isOnline → 离线抛错
           │   - stripClientFields(updatedDrivers)
           │   - upsertDrivers(partialDrivers)
           │     └─ supabase.from('drivers').upsert(drivers)
           │        ★ 全量 upsert，不是逐条 update
           │
           ├─ onError:
           │   - setQueryData(['drivers'], context.previousDrivers)  ← 回滚
           │   - onMutationError?.(error)
           │
           └─ onSettled:
               - if (isOnline) invalidateQueries(['drivers'])
```

**关键点**:
- 更新用的是 `upsert`（全量），不是 `update`（逐条）。这意味传整个 Driver[] 数组
- 司机分配地点变更时，`updateDrivers` 和 `updateLocations` 并发执行，非事务性
- 状态切换 (toggleStatus) 也走同一 `updateDrivers` mutation

### 2.3 删除司机 (Delete)

```
UI: DriverManagementPage.tsx → handleDeleteDriver(id)
  │
  ├─ 1. 离线检查: !isOnline → toast warning + return
  │
  ├─ 2. 确认弹窗: confirm({ destructive: true })
  │
  └─ 3. deleteDrivers.mutate([id])
       │
       ├─ onMutate:
       │   - cancelQueries(['drivers'])
       │   - snapshot previousDrivers
       │   - setQueryData: old.filter(d => !ids.includes(d.id))
       │   - return { previousDrivers }
       │
       ├─ mutationFn: deleteDriverAccount(id)  // 逐个调用 Edge Function
       │   │
       │   ├─ POST supabase.functions.invoke('delete-driver', { driver_id })
       │   │  └─ Edge Function 内部:
       │   │     ├─ 1. 通过 profiles 查找 auth_user_id
       │   │     ├─ 2. DELETE FROM auth.users (级联删除 profiles)
       │   │     └─ 3. DELETE FROM public.drivers WHERE id = driver_id
       │   │
       │   ├─ 收集失败: errors.push(`${id}: ${result.message}`)
       │   ├─ 有错误则 throw new Error(errors.join('; '))
       │   │
       │   └─ 成功: 同步 localDB
       │       localDB.set(DRIVERS_KEY, cached.filter(d => !ids.includes(d.id)))
       │
       ├─ onError:
       │   - setQueryData(['drivers'], context.previousDrivers)  ← 回滚
       │   - onMutationError?.(error)
       │
       └─ onSettled:
           - if (isOnline) invalidateQueries(['drivers'])
```

**关键点**:
- 调用 Edge Function `delete-driver`，确保 Auth user + profiles + drivers 完整删除
- 批量删除时逐个调用，非并行
- 同步 localDB 缓存

### 2.4 级联删除影响

```
DELETE FROM public.drivers WHERE id = <driver_id>;

Schema 级联规则:
├─ profiles.driver_id       → ON DELETE SET NULL
├─ locations.assignedDriverId → ON DELETE SET NULL
├─ transactions.driverId     → ON DELETE SET NULL
├─ daily_settlements.driverId → ON DELETE SET NULL
├─ monthly_payrolls.driverId  → ON DELETE CASCADE      ← ⚠️ 工资单会被物理删除!
├─ location_change_requests.requested_by_driver_id → ON DELETE SET NULL
├─ queue_health_reports.driver_id → ON DELETE SET NULL
└─ health_alerts.driver_id  → ON DELETE SET NULL

Edge Function 额外操作:
└─ auth.users               → DELETE (级联 profiles CASCADE)
```

**⚠️ 重要**:
- `transactions.driverId` 使用 `SET NULL`，历史交易保留但失去司机关联
- `monthly_payrolls` 使用 `CASCADE`，删除司机会导致其所有工资单被物理删除
- 前端 `handleDeleteLocation` 在删除前先解绑司机: `assignedDriverId = undefined` → `onUpdateLocations`

---

## 3. Locations CRUD 全链路

### 3.1 创建/注册机器 (Create via registerLocation)

```
UI: 司机端新店入驻流程 (非管理端 Dashboard 直接入口)
    管理端通过 updateLocations 批量 upsert 实现

hook: registerLocation mutation
  │
  ├─ onMutate: 乐观插入
  │   - cancelQueries(['locations'])
  │   - snapshot previousLocations
  │   - setQueryData: old.filter(loc => loc.id !== newLocation.id)
  │                   .push({ ...newLocation, isSynced: false })
  │   - return { previousLocations }
  │
  ├─ mutationFn:
  │   - 离线抛错
  │   - AbortController 20s 超时
  │   - upsertLocationsWithSignal([newLocation], signal)
  │     └─ supabase.from('locations').upsert(toDbLocation(payload))
  │       ★ toDbLocation: 删除 createdAt, lastRelocatedAt (DB 自动管理)
  │
  ├─ onError: 回滚 previousLocations
  └─ onSettled: invalidateQueries(['locations'])
```

### 3.2 编辑机器 (Update)

```
UI: SitesTab.tsx → handleSaveLocation()
  │
  ├─ 1. 输入验证:
  │     - normalizedMachineId 非空
  │     - 机器编号不重复 (除自身外)
  │     - GPS 坐标有效 (lat -90..90, lng -180..180)
  │
  ├─ 2. 构建 updated:
  │     { ...editingLoc, ...formFields, isSynced: false }
  │
  ├─ 3. onUpdateLocations(locations.map(l => l.id === updated.id ? updated : l))
  │     └─ updateLocations.mutateAsync(updatedLocations)
  │        │
  │        ├─ onMutate: 乐观更新
  │        │   - cancelQueries(['locations'])
  │        │   - snapshot previousLocations
  │        │   - setQueryData(['locations'], updatedLocations)
  │        │   - return { previousLocations }
  │        │
  │        ├─ mutationFn:
  │        │   - 离线抛错
  │        │   - AbortController 20s 超时
  │        │   - upsertLocationsWithSignal(updatedLocations, signal)
  │        │     └─ supabase.from('locations').upsert(toDbLocation(payload))
  │        │        ★ 全量 upsert 整个 locations 数组
  │        │
  │        ├─ onError: setQueryData → previousLocations
  │        └─ onSettled: invalidateQueries(['locations'])
  │
  └─ 4. 审计日志 (fire-and-forget):
        if (commissionRate 变化 || remainingStartupDebt 变化)
          logFinanceAuditBatch([{ event_type, entity_type, ... }])
```

**Schema 触发器**:
- `trg_touch_location_relocation_timestamp`: 当 area 或 coords 变化时，自动更新 `last_relocated_at`

### 3.3 删除机器 (Delete)

```
UI: SitesTab.tsx → handleDeleteLocation(locId)
  │
  ├─ 1. 权限检查: isAdmin === false → return
  │
  ├─ 2. 离线检查: !isOnline → return
  │
  ├─ 3. 删除前置诊断 (getLocationDeletionDiagnostics):
  │     blockers (硬阻塞，必须清零):
  │     ├─ remainingStartupDebt > 0       → "未清启动债务"
  │     ├─ dividendBalance > 0            → "未付业主分红余额"
  │     ├─ resetLocked === true           → "重置锁定状态"
  │     ├─ pendingResetRequests > 0       → "待处理重置申请"
  │     ├─ pendingPayoutRequests > 0      → "待处理提现申请"
  │     ├─ pendingApprovalTransactions > 0 → "等待审批的交易"
  │     └─ unsettledCollections > 0       → "未结算收款"
  │     ★ 如有 blockers → 显示禁用按钮 + "强制清除阻塞" 按钮
  │
  ├─ 4. "强制清除阻塞" (handleForceClearBlockers):
  │     - 清零 remainingStartupDebt, dividendBalance, resetLocked
  │     - 通过 onUpdateLocations() 更新
  │     - 审计日志记录
  │
  ├─ 5. 确认弹窗 (显示关联明细):
  │     - 绑定司机 (会先解绑)
  │     - 历史交易数 (保留不删除)
  │     - 待审批交易数
  │
  ├─ 6. 删除前解绑司机:
  │     if (loc.assignedDriverId)
  │       onUpdateLocations(locations.map(l =>
  │         l.id === locId ? { ...loc, assignedDriverId: undefined } : l))
  │
  └─ 7. onDeleteLocations([locId])
        └─ deleteLocations.mutate([locId])
           │
           ├─ onMutate:
           │   - cancelQueries(['locations'])
           │   - snapshot previousLocations
           │   - setQueryData: old.filter(l => !ids.includes(l.id))
           │   - return { previousLocations }
           │
           ├─ mutationFn:
           │   - if (isOnline) repoDeleteLocations(ids)
           │     └─ supabase.from('locations').delete().in('id', ids)
           │     ★ 离线时跳过（不执行删除）
           │
           ├─ onError: 回滚 previousLocations
           ├─ onSettled: invalidateQueries(['locations'])
           │
           └─ 审计日志 (fire-and-forget):
               logFinanceAuditBatch([{ event_type: 'location_delete', ... }])
```

### 3.4 级联删除影响

```
DELETE FROM public.locations WHERE id = <location_id>;

Schema 级联规则:
├─ transactions.locationId        → ON DELETE SET NULL
│   ★ 历史交易保留，locationId 变为 NULL
├─ location_change_requests       → ON DELETE CASCADE
│   ★ 该地点的变更请求全部删除
└─ notifications.relatedLocationId → 无 FK 约束 (仅 UUID 字段)
    ★ 通知保留但关联中断
```

**关键点**:
- `ON DELETE SET NULL` 确保历史交易不丢失，但失去地点关联
- 前端通过 `getLocationDeletionDiagnostics` 做业务层阻塞检查，数据库层依赖 FK `SET NULL` 而非 `CASCADE`
- 审计日志记录 `unlinkMode: 'transactions.locationId -> NULL on delete'`

---

## 4. Transactions 审批全链路

### 4.1 普通交易更新 (Update Transaction)

```
updateTransaction mutation
  │
  ├─ onMutate:
  │   - cancelQueries(['transactions'])
  │   - snapshot previousTransactions
  │   - setQueryData: old.map(t => t.id === txId ? { ...t, ...updates, isSynced: false })
  │   - persistQuerySnapshot (写入 localDB)
  │   - return { previousTransactions }
  │
  ├─ mutationFn:
  │   - if (isOnline) upsertTransaction(stripClientFields({ id: txId, ...updates }))
  │     └─ supabase.from('transactions').upsert(tx)
  │   ★ 离线时不执行
  │
  ├─ onError: 回滚 + persistQuerySnapshot
  └─ onSettled: invalidateQueries(['transactions'])
```

### 4.2 重置请求审批 (Approve Reset Request)

```
UI: 管理端审批面板
  │
  └─ approveResetRequest.mutate({ txId, approve })
       │
       ├─ onMutate: 乐观更新 2 个 query
       │   - cancelQueries(['transactions'])
       │   - cancelQueries(['locations'])
       │   - snapshot previousTransactions, previousLocations
       │   - 更新 transaction: approvalStatus = approved|rejected
       │   - 更新 location:
       │       if (approve) lastScore = 0, resetLocked = false
       │       if (!approve) 不变
       │   - return { previousTransactions, previousLocations }
       │
       ├─ mutationFn:
       │   - 离线抛错
       │   - repoApproveResetRequest(txId, approve)
       │     └─ supabase.rpc('approve_reset_request_v1', { p_tx_id, p_approve })
       │        │
       │        │  Server-side (SECURITY DEFINER):
       │        │  ├─ 权限: is_admin() 检查
       │        │  ├─ 验证: type='reset_request', approvalStatus='pending'
       │        │  ├─ FOR UPDATE 锁 location
       │        │  ├─ UPDATE transactions SET approvalStatus = v_status
       │        │  ├─ UPDATE locations SET lastScore = 0 (if approve),
       │        │  │                    resetLocked = FALSE
       │        │  └─ RETURN json (txId, approvalStatus, locationId, lastScore, resetLocked)
       │        │
       │        └─ 返回 ResetApprovalResult
       │
       ├─ onError: 回滚 transactions + locations 两个缓存
       │
       └─ onSettled: invalidateQueries(['transactions', 'locations'])
```

### 4.3 提现请求审批 (Approve Payout Request)

```
approvePayoutRequest.mutate({ txId, approve })
  │
  ├─ onMutate: 乐观更新 2 个 query
  │   - 更新 transaction: approvalStatus
  │   - 更新 location (仅 approve 时):
  │       dividendBalance -= targetTx.payoutAmount (不低于 0)
  │
  ├─ mutationFn:
  │   └─ supabase.rpc('approve_payout_request_v1', { p_tx_id, p_approve })
  │      │
  │      │  Server-side:
  │      │  ├─ 验证: type='payout_request', approvalStatus='pending'
  │      │  ├─ 余额检查: dividendBalance >= payoutAmount
  │      │  ├─ UPDATE transactions SET approvalStatus
  │      │  ├─ UPDATE locations SET dividendBalance -= payoutAmount (if approve)
  │      │  └─ RETURN json (dividendBalance)
  │      │
  │      └─ 返回 PayoutApprovalResult
  │
  ├─ onError: 回滚 transactions + locations
  └─ onSettled: invalidateQueries(['transactions', 'locations'])
```

### 4.4 费用审批 (Approve Expense)

```
approveExpenseRequest.mutate({ txId, approve })
  │
  ├─ onMutate: 乐观更新 transactions only
  │   - expenseStatus = approved|rejected
  │
  ├─ mutationFn:
  │   └─ supabase.rpc('approve_expense_request_v1', { p_tx_id, p_approve })
  │      │
  │      │  Server-side:
  │      │  ├─ 验证: type='expense', expenses > 0, expenseStatus='pending'
  │      │  ├─ UPDATE transactions SET expenseStatus, isSynced=TRUE
  │      │  └─ RETURN json (txId, expenseStatus)
  │      │
  │      └─ 返回 ExpenseApprovalResult
  │
  ├─ onError: 回滚 transactions
  └─ onSettled: invalidateQueries(['transactions'])
```

### 4.5 异常交易审核 (Review Anomaly)

```
reviewAnomalyTransaction.mutate({ txId, approve })
  │
  ├─ onMutate:
  │   - approvalStatus = approved|rejected
  │   - isAnomaly = approve ? false : true  ← 批准则清除异常标记
  │
  ├─ mutationFn:
  │   └─ supabase.rpc('review_anomaly_transaction_v1', { p_tx_id, p_approve })
  │      │
  │      │  Server-side:
  │      │  ├─ 验证: isAnomaly=TRUE, approvalStatus NOT IN ('approved','rejected')
  │      │  ├─ UPDATE transactions SET approvalStatus, isAnomaly, isSynced=TRUE
  │      │  └─ RETURN json (txId, approvalStatus, isAnomaly)
  │      │
  │      └─ 返回 AnomalyApprovalResult
  │
  ├─ onError: 回滚 transactions
  └─ onSettled: invalidateQueries(['transactions'])
```

### 4.6 Transaction 不可物理删除

```
Schema 注释 (line 2381-2386):
"Transactions cannot be physically deleted. This is a financial ledger —
records must be immutable."

RLS: 没有 DELETE policy for transactions
UI:  没有暴露删除按钮
```

---

## 5. Settlements CRUD 全链路

### 5.1 创建结算 (Create Settlement)

```
createSettlement.mutate(settlement)
  │
  ├─ onMutate:
  │   - cancelQueries(['dailySettlements'])
  │   - snapshot previousSettlements
  │   - setQueryData: upsert into list (去重 id)
  │   - persistQuerySnapshot (localDB)
  │   - return { previousSettlements }
  │
  ├─ mutationFn:
  │   - 离线抛错
  │   - repoCreateSettlement(settlement)
  │     └─ supabase.rpc('create_daily_settlement_v1', { ... })
  │        │
  │        │  Server-side:
  │        │  ├─ 鉴权: driver 只能提交自己的 settlement
  │        │  ├─ 幂等: ON CONFLICT (id) → 返回已有记录
  │        │  ├─ 防重: driver + date 组合唯一 (pending/confirmed 状态)
  │        │  ├─ INSERT INTO daily_settlements
  │        │  └─ RETURN json (完整 settlement)
  │        │
  │        └─ 返回 DailySettlement
  │
  ├─ onError: 回滚 + persistQuerySnapshot
  └─ onSettled: invalidateQueries(['dailySettlements'])
```

### 5.2 审核结算 (Review Settlement) — 最复杂的 mutation

```
reviewSettlement.mutate({ settlementId, status, note })
  │
  ├─ onMutate: 乐观更新 3 个 query (settlements + transactions + drivers)
  │   │
  │   ├─ cancelQueries(['dailySettlements'])
  │   ├─ cancelQueries(['drivers'])
  │   ├─ cancelQueries(['transactions'])
  │   │
  │   ├─ snapshot 全部 3 个缓存
  │   │
  │   ├─ 更新 settlement: status, note, isSynced
  │   │
  │   ├─ 更新 transactions (级联):
  │   │   targetSettlement.driverId + date 匹配的 collection 交易
  │   │   → paymentStatus = status === 'confirmed' ? 'paid' : 'rejected'
  │   │
  │   ├─ 更新 drivers (条件):
  │   │   if (shouldApplySettlementDriverCoinUpdate(status))
  │   │   → driver.dailyFloatingCoins = targetSettlement.actualCoins
  │   │
  │   └─ return { previousSettlements, previousDrivers, previousTransactions }
  │
  ├─ mutationFn:
  │   - 离线抛错
  │   - repoReviewSettlement(settlementId, status, note)
  │     └─ supabase.rpc('review_daily_settlement_v1', {
  │          p_settlement_id, p_status, p_note })
  │        │
  │        │  Server-side (SECURITY DEFINER):
  │        │  ├─ 权限: is_admin() 检查 (仅管理员)
  │        │  ├─ 验证: settlement.status === 'pending'
  │        │  ├─ P2 guard: confirmed + totalRevenue <= 0 → 拒绝
  │        │  ├─ FOR UPDATE 锁 settlement
  │        │  ├─ UPDATE daily_settlements SET status, adminId, adminName
  │        │  │
  │        │  ├─ 级联 UPDATE transactions:
  │        │  │   SET paymentStatus = paid|rejected
  │        │  │   WHERE driverId = settlement.driverId
  │        │  │     AND type = 'collection'
  │        │  │     AND date = settlement.date
  │        │  │
  │        │  ├─ 更新 driver dailyFloatingCoins (if confirmed):
  │        │  │   UPDATE drivers SET dailyFloatingCoins = actualCoins
  │        │  │
  │        │  └─ RETURN row_to_json(updated settlement)
  │        │
  │        └─ 返回 reviewedSettlement
  │
  ├─ onSuccess:
  │   - setQueryData: 用服务器返回的 reviewedSettlement 更新缓存
  │   - persistQuerySnapshot (settlement + transactions)
  │   - localDB.set(DRIVERS_KEY, ...)
  │
  ├─ onError: 回滚全部 3 个缓存
  │   - previousSettlements
  │   - previousTransactions
  │   - previousDrivers
  │
  └─ onSettled: invalidateQueries(['dailySettlements', 'drivers', 'transactions'])
```

**⚠️ 重要设计决策**:
- `reviewSettlement` 是唯一一个在 `onSuccess` 中做额外更新的 mutation
- 服务器端在同一个 RPC 中执行 settlement + transactions + drivers 三表更新
- 前端乐观更新模拟服务器端逻辑在 `onMutate` 中，确保 UI 即时响应
- `onSuccess` 用服务器权威数据覆盖乐观更新，修正任何计算偏差

---

## 6. 乐观更新策略与回滚机制

### 6.1 标准乐观更新模式

所有 mutation 遵循 React Query 标准乐观更新模式:

```
Phase 1: onMutate (乐观更新)
  ├─ cancelQueries       ← 取消进行中的查询，避免覆盖乐观更新
  ├─ getQueryData        ← 快照当前数据
  ├─ setQueryData        ← 立即写入 UI 预期结果
  └─ return { previous } ← 保存快照供回滚

Phase 2: mutationFn (服务端执行)
  ├─ 离线检查
  ├─ 剥离客户字段 (stripClientFields)
  └─ Repository / RPC 调用

Phase 3a: onError (回滚)
  ├─ setQueryData ← context.previous
  └─ onMutationError callback

Phase 3b: onSuccess (仅 reviewSettlement 使用)
  └─ setQueryData ← server data (覆盖乐观更新)

Phase 4: onSettled (最终)
  └─ invalidateQueries (online only)
```

### 6.2 各 Mutation 乐观更新范围

| Mutation | 乐观更新 queries | localDB 持久化 | onSuccess 覆盖 |
|---|---|---|---|
| updateDrivers | ['drivers'] | - | - |
| updateLocations | ['locations'] | - | - |
| registerLocation | ['locations'] | - | - |
| deleteLocations | ['locations'] | - | - |
| deleteDrivers | ['drivers'] | localDB | - |
| updateTransaction | [transactions] (scoped) | ✓ | - |
| submitTransaction | [transactions] + ['locations'] | ✓ (txn) | - |
| createSettlement | [dailySettlements] (scoped) | ✓ | - |
| **reviewSettlement** | [settlements] + [txns] + ['drivers'] | ✓ (all 3) | ✓ (settlement) |
| approveResetRequest | [transactions] + ['locations'] | - | - |
| approveExpenseRequest | [transactions] | - | - |
| reviewAnomalyTransaction | [transactions] | - | - |
| approvePayoutRequest | [transactions] + ['locations'] | - | - |
| logAI | ['aiLogs'] | - | - |

### 6.3 localDB 持久化策略

```typescript
// useSupabaseMutations.ts
const persistQuerySnapshot = <T>(queryKey, storageKey) => {
  const snapshot = queryClient.getQueryData<T[]>(queryKey);
  if (!snapshot) return;
  localDB.set(storageKey, snapshot).catch((error) => {
    console.warn(`Failed to persist query snapshot for ${storageKey}.`, error);
  });
};
```

当事 mutation 执行后，缓存快照被持久化到 localDB:
- 用于离线时恢复 UI 数据
- `persistQuerySnapshot` 在 `onMutate` (写入乐观数据后) 和 `onError` (回滚后) 都调用
- 失败仅 warn，不抛异常

### 6.4 回滚机制代码分析

```typescript
// 标准回滚模板
onError: (error, _variables, context) => {
  if (context?.previousData !== undefined) {
    queryClient.setQueryData(queryKey, context.previousData);
  }
  // 多 query 回滚: 逐一检查并回滚
  if (context?.previousLocations !== undefined) {
    queryClient.setQueryData(['locations'], context.previousLocations);
  }
  // 持久化回滚后的数据
  persistQuerySnapshot(queryKey, storageKey);
  // 通知全局错误处理器
  onMutationError?.(error);
}
```

**回滚覆盖范围**: 仅 React Query 缓存。localDB 中的过时快照不会被回滚（下次 sync 会修正）。

**潜在风险**:
- 如果 `onMutate` 和 `onError` 之间用户做了其他操作，回滚会覆盖这些操作的结果
- `reviewSettlement` 的 `onSuccess` 用服务器数据覆盖了乐观更新，但之前的 `onMutate` 写入的 localDB 快照可能未更新
- 多 query 回滚 (`reviewSettlement`, `approveResetRequest`, `approvePayoutRequest`) 不是原子性的：如果回滚过程中(setQueryData)崩溃，可能部分回滚

---

## 7. Error Handling 全景

### 7.1 离线检测

```typescript
// 所有需要在线操作的 mutation 都在 mutationFn 中检查:
if (!isOnline) {
  throw new Error('当前处于离线状态，无法... / Offline — cannot ...');
}
```

| Mutation | 离线行为 |
|---|---|
| updateDrivers | 抛错 (不可离线) |
| updateLocations | 抛错 (不可离线) |
| registerLocation | 抛错 (不可离线) |
| deleteLocations | 静默跳过 (isOnline 检查；离线时不调用 repo) |
| deleteDrivers | 抛错 (不可离线) |
| createSettlement | 抛错 (不可离线) |
| reviewSettlement | 抛错 (不可离线) |
| approveResetRequest | 抛错 (不可离线) |
| approveExpenseRequest | 抛错 (不可离线) |
| reviewAnomalyTransaction | 抛错 (不可离线) |
| approvePayoutRequest | 抛错 (不可离线) |
| updateTransaction | 静默跳过 |
| submitTransaction | 降级入队 (enqueueTransaction) |

### 7.2 超时保护

```typescript
// updateLocations / registerLocation:
const controller = new AbortController();
const timeoutMs = 20000;
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  await upsertLocationsWithSignal(data, controller.signal);
} catch (error) {
  if (controller.signal.aborted) {
    throw new Error('注册请求超时（20 秒）。请检查网络后重试。');
  }
  throw error;
} finally {
  clearTimeout(timer);
}
```

### 7.3 UI 层 Error Handling

```typescript
// DriverManagementPage.tsx:
try {
  await onUpdateDrivers(updatedDrivers);
  resetForm();
} catch (error) {
  console.error('Failed to save driver assignment changes.', error);
  const msg = error instanceof Error ? error.message : String(error);
  showToast(`保存失败：${msg}`, 'error');
} finally {
  setIsSaving(false);
}
```

### 7.4 全局 Error Handler

```typescript
// useSupabaseMutations 接收可选的 onMutationError 回调:
const onMutationError = (error: unknown) => {
  // 由调用方注入，通常用于 Toast 或其他全局提示
};
// 每个 mutation 的 onError 中都调用:
onMutationError?.(error);
```

### 7.5 RPC 函数服务端错误

所有 SECURITY DEFINER RPC 函数使用标准 PostgreSQL 错误码:

| ERRCODE | 含义 | 触发场景 |
|---|---|---|
| `42501` | Permission denied | 非 admin 用户尝试审批 |
| `P0002` | No data found | 交易/地点/司机/结算不存在 |
| `22023` | Invalid parameter | 状态已变更、类型不匹配 |
| `23505` | Unique violation | 结算重复创建 |

---

## 8. 级联删除影响矩阵

### 8.1 Drivers 表 FK 关系

```
public.drivers (id TEXT PK)
 │
 ├── profiles.driver_id → ON DELETE SET NULL
 │
 ├── locations.assignedDriverId → ON DELETE SET NULL
 │
 ├── transactions.driverId → ON DELETE SET NULL
 │
 ├── daily_settlements.driverId → ON DELETE SET NULL
 │
 ├── monthly_payrolls.driverId → ON DELETE CASCADE ⚠️
 │
 ├── location_change_requests.requested_by_driver_id → ON DELETE SET NULL
 │
 ├── queue_health_reports.driver_id → ON DELETE SET NULL
 │
 └── health_alerts.driver_id → ON DELETE SET NULL
```

### 8.2 Locations 表 FK 关系

```
public.locations (id UUID PK)
 │
 ├── transactions.locationId → ON DELETE SET NULL
 │
 └── location_change_requests.location_id → ON DELETE CASCADE
```

### 8.3 Profiles 表 FK 关系

```
public.profiles (auth_user_id UUID PK → auth.users(id) ON DELETE CASCADE)
 │
 └── (无其他表 FK 引用 profiles)
```

### 8.4 Auth Users 级联链

```
auth.users (id UUID PK)
 └── profiles.auth_user_id → ON DELETE CASCADE
     ★ deleteDriverAccount Edge Function 先删 auth.users,
       自动级联删除 profiles
```

### 8.5 业务影响总结

| 操作 | 影响的表 | 级联类型 | 数据丢失风险 |
|---|---|---|---|
| 删除 Driver | profiles | SET NULL | 低 (profile 可能变成孤儿) |
| 删除 Driver | locations.assignedDriverId | SET NULL | 低 (机器解除绑定) |
| 删除 Driver | transactions.driverId | SET NULL | **中** (交易失去司机关联，报表困难) |
| 删除 Driver | daily_settlements.driverId | SET NULL | 中 |
| 删除 Driver | **monthly_payrolls** | **CASCADE** | **高** (工资单数据销毁) |
| 删除 Location | transactions.locationId | SET NULL | **中** (交易失去地点关联) |
| 删除 Location | location_change_requests | CASCADE | 低 |
| 删除 Auth User | profiles | CASCADE | 中 |

**建议**:
- `monthly_payrolls` 的 CASCADE 可能导致合规问题，建议改为 `SET NULL` 并保留历史工资记录
- 删除 Driver 前应确保所有 payrolls 已导出/归档
- Transactions 使用 `SET NULL` 是正确设计 (financial ledger 不可变)

---

## 9. 调用链速查表

### 9.1 Drivers

| 操作 | UI 入口 | Mutation | Repository/Service | DB 操作 |
|---|---|---|---|---|
| 读取 | useAppData().filteredDrivers | - | driverRepository.fetchDrivers() | SELECT |
| 创建 | DriverManagementPage.handleSave (new) | updateDrivers.mutateAsync | createDriverAccount() → persistDriverBusinessFields() | Edge Fn + UPDATE |
| 编辑 | DriverManagementPage.handleSave (edit) | updateDrivers.mutateAsync | driverRepository.upsertDrivers() | upsert |
| 状态切换 | toggleStatus() | updateDrivers.mutateAsync | driverRepository.upsertDrivers() | upsert |
| 删除 | handleDeleteDriver() | deleteDrivers.mutate() | deleteDriverAccount() | Edge Fn |

### 9.2 Locations

| 操作 | UI 入口 | Mutation | Repository/Service | DB 操作 |
|---|---|---|---|---|
| 读取 | useAppData().locations | - | locationRepository.fetchLocations() | SELECT |
| 注册 | 司机端 (非管理端主要入口) | registerLocation.mutate() | upsertLocationsWithSignal() | upsert |
| 编辑 | SitesTab.handleSaveLocation() | updateLocations.mutateAsync | upsertLocationsWithSignal() | upsert |
| 强制清除阻塞 | SitesTab.handleForceClearBlockers() | updateLocations.mutateAsync | upsertLocationsWithSignal() | upsert |
| 删除 | SitesTab.handleDeleteLocation() | deleteLocations.mutate() → onDeleteLocations | deleteLocations() | DELETE |

### 9.3 Transactions (审批操作)

| 操作 | Mutation | RPC Function | DB 影响 |
|---|---|---|---|
| 更新交易 | updateTransaction.mutate() | upsertTransaction() | transactions.upsert |
| 审批重置 | approveResetRequest.mutate() | approve_reset_request_v1 | transactions + locations |
| 审批提现 | approvePayoutRequest.mutate() | approve_payout_request_v1 | transactions + locations |
| 审批费用 | approveExpenseRequest.mutate() | approve_expense_request_v1 | transactions |
| 审核异常 | reviewAnomalyTransaction.mutate() | review_anomaly_transaction_v1 | transactions |
| 提交收款 | submitTransaction.mutate() | submit_collection_v2 | transactions + locations |

### 9.4 Settlements

| 操作 | Mutation | RPC Function | DB 影响 |
|---|---|---|---|
| 创建结算 | createSettlement.mutate() | create_daily_settlement_v1 | daily_settlements |
| 审核结算 | reviewSettlement.mutate() | review_daily_settlement_v1 | settlements + transactions + drivers |

### 9.5 所有 API 端点速查

| 端点 | 类型 | 鉴权 | 说明 |
|---|---|---|---|
| `drivers` 表 | upsert/select/delete | RLS | 管理员全权，司机只读自己 |
| `locations` 表 | upsert/select/delete | RLS | 管理员全权，司机读 assigned + insert 自己 |
| `transactions` 表 | upsert/select | RLS | 不可删除 |
| `daily_settlements` 表 | insert/select/update/delete | RLS | 审核 update 限管理员 |
| `approve_reset_request_v1` | RPC | is_admin() | SECURITY DEFINER |
| `approve_payout_request_v1` | RPC | is_admin() | SECURITY DEFINER |
| `approve_expense_request_v1` | RPC | is_admin() | SECURITY DEFINER |
| `review_anomaly_transaction_v1` | RPC | is_admin() | SECURITY DEFINER |
| `create_reset_request_v1` | RPC | auth + driver match | SECURITY DEFINER |
| `create_payout_request_v1` | RPC | auth + driver match | SECURITY DEFINER |
| `create_daily_settlement_v1` | RPC | auth + driver match | SECURITY DEFINER |
| `review_daily_settlement_v1` | RPC | is_admin() | SECURITY DEFINER |
| `create-driver` | Edge Function | Service role | 创建 Auth user + drivers + profiles |
| `delete-driver` | Edge Function | Service role | 删除 Auth user + drivers，级联 profiles |

---

## 附录: 关键文件索引

| 文件 | 路径 | 用途 |
|---|---|---|
| useSupabaseMutations.ts | `/root/bht/hooks/useSupabaseMutations.ts` | 所有 mutation 定义 (720 行) |
| driverRepository.ts | `/root/bht/repositories/driverRepository.ts` | drivers 表 CRUD |
| locationRepository.ts | `/root/bht/repositories/locationRepository.ts` | locations 表 CRUD |
| transactionRepository.ts | `/root/bht/repositories/transactionRepository.ts` | transactions 表 CRUD |
| settlementRepository.ts | `/root/bht/repositories/settlementRepository.ts` | settlements 表 CRUD + RPC |
| approvalRepository.ts | `/root/bht/repositories/approvalRepository.ts` | 审批 RPC 调用 |
| requestRepository.ts | `/root/bht/repositories/requestRepository.ts` | 重置/提现请求 RPC |
| driverManagementService.ts | `/root/bht/services/driverManagementService.ts` | Edge Function 封装 |
| DriverManagementPage.tsx | `/root/bht/components/driver-management/DriverManagementPage.tsx` | 司机管理 UI |
| SitesTab.tsx | `/root/bht/components/dashboard/SitesTab.tsx` | 机器管理 UI |
| schema.sql | `/root/bht/supabase/schema.sql` | 完整 DB schema (2558 行) |
| locationWorkflow.ts | `/root/bht/utils/locationWorkflow.ts` | 删除阻塞诊断逻辑 |
| stripClientFields.ts | `/root/bht/utils/stripClientFields.ts` | 客户端字段剥离 |
| settlementRules.ts | `/root/bht/utils/settlementRules.ts` | 结算驱动币更新规则 |
| DataContext.tsx | `/root/bht/contexts/DataContext.tsx` | 数据提供 Context |
| MutationContext.tsx | `/root/bht/contexts/MutationContext.tsx` | Mutation 提供 Context |
