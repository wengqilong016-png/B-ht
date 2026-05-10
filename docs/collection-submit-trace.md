# BHT 收款提交流程深度追踪

> 生成时间: 2026-05-10
> 追踪路径: QuickCollect / DriverCollectionFlow → submit_collection_v2 RPC → SQL 服务端
> 补充文档: `/root/bht/docs/COLLECTION_SUBMISSION_TRACE.md` (全链路含离线队列), `/root/bht/docs/offline-queue-sync-trace.md` (IDB/队列)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        UI 入口层                                   │
│  QuickCollect.tsx              DriverCollectionFlow.tsx            │
│  handleSubmit(id)              SubmitReview.handleSubmit()         │
│       │                              │                             │
│       │ orchestrateCollection        │ submitCollection()          │
│       │ Submission()                 │ → orchestrateCollection     │
│       ▼                              │   Submission()              │
│  ┌───────────────────────────────────┴──────────────────────────┐ │
│  │        collectionSubmissionOrchestrator.ts                    │ │
│  │        buildCollectionSubmissionInput → 在线/离线决策          │ │
│  └─────┬──────────────────────────────┬─────────────────────────┘ │
│        │ 在线 (isOnline=true)         │ 离线 (isOnline=false)      │
│        ▼                              ▼                            │
│  ┌──────────────────┐    ┌──────────────────────────────┐        │
│  │submitCollectionV2│    │ fallbackToOffline()           │        │
│  │→ persistEvidence │    │ → buildOfflineTransaction     │        │
│  │  PhotoUrl        │    │ → enqueueTransaction(IDB)     │        │
│  │→ supabase.rpc    │    └──────────────────────────────┘        │
│  │  ('submit_       │                                              │
│  │   collection_v2')│                                              │
│  └──────┬───────────┘                                              │
│         ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │             PostgreSQL: submit_collection_v2                  │ │
│  │  SECURITY DEFINER → 认证/鉴权 → FOR UPDATE 行锁 → 财务计算   │ │
│  │  → INSERT ON CONFLICT DO NOTHING → UPDATE locations           │ │
│  │  → RETURN JSON (含 tx_conflict 信号)                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

两个入口最终收敛到同一个编排器 `orchestrateCollectionSubmission`。区别仅在于：
- **QuickCollect**: 直接调用编排器，无状态机中间层
- **DriverCollectionFlow**: 通过 SubmitReview → useCollectionSubmission 状态机 → 编排器

---

## 2. 入口 1: QuickCollect.tsx — handleSubmit

### 文件: `/root/bht/driver/components/QuickCollect.tsx`

### 2.1 数据结构

```
MachineEntry (每个机器独立状态):
  score: string          用户输入的分数
  photo: string | null   base64 data URL
  submitting: boolean    防重复提交锁
  submitted: boolean     已提交标记
  receipt: SubmissionReceipt | null
  coinExchange, tip, ownerRetention, isOwnerRetaining, expenses: string

SubmissionReceipt:
  status: 'server' | 'offline' | 'failed'
  txId, previousScore, currentScore, revenue, netPayable, message, detail
```

### 2.2 handleSubmit 执行流程 (QuickCollect.tsx 行 162-375)

```
handleSubmit(id)
  │
  ├─ [GUARD] entry.submitting 已锁 → return (行 164)
  ├─ updateEntry(id, {submitting:true})  设置提交锁 (行 165)
  │
  ├─ [VALIDATE 1] parsedScore = parseInt(entry.score)
  │    └─ isNaN → showToast + updateEntry({submitting:false}) + return (行 168-171)
  │
  ├─ [VALIDATE 2] parsedScore <= previousScore (lastScore)
  │    └─ 失败:
  │       ├─ receipt = {status:'failed', txId:'not-submitted', revenue:0, netPayable:0}
  │       ├─ recordDriverFlowEvent('submit_validation_error')
  │       └─ return (行 173-214)
  │
  ├─ draftTxId = safeRandomUUID() (行 216)
  │
  ├─ calc = calculateCollectionFinanceLocal({...})  本地财务预览 (行 217-227)
  │
  ├─ ★ result = await orchestrateCollectionSubmission({...}) ★ (行 230-247)
  │    │  输入参数:
  │    │    selectedLocation, currentDriver, isOnline
  │    │    currentScore, photoData, aiReviewData: null
  │    │    expenses, expenseType: 'public', coinExchange, tip
  │    │    draftTxId, isOwnerRetaining, ownerRetention
  │    │    calculations: calc, resolvedGps, gpsSourceType
  │    │
  │    └─ 返回: OrchestratedCollectionSubmissionResult
  │         {source:'server'|'offline', transaction, fallbackReason}
  │
  ├─ [SUCCESS 路径]
  │    ├─ invalidateQueries(['transactions','locations','drivers']) (行 252-254)
  │    ├─ 构建 SubmissionReceipt (行 256-274)
  │    │    zeroRevenueAnomaly = source==='server' && revenue <= 0
  │    ├─ updateEntry(id, {submitted:true, receipt}) (行 276)
  │    ├─ showToast (行 277-284)
  │    ├─ recordDriverFlowEvent('quick_collect_submitted') (行 299-309)
  │    ├─ recordDriverFlowEvent('submit_success'/'submit_offline_queued'/'submit_zero_revenue') (行 310-324)
  │    └─ setTimeout(2500ms): setExpandedId(null) + 重置表单 (行 327-333)
  │
  └─ [ERROR 路径] (行 334-374)
       ├─ recordDriverFlowEvent('submit_failed')
       ├─ showToast(errorMessage)
       └─ updateEntry(id, {submitting:false, receipt:{status:'failed',...}})
```

**关键差异 vs DriverCollectionFlow**:
- QuickCollect 不使用 `useCollectionSubmission` 状态机，直接调用编排器
- 有 `parsedScore <= previousScore` 的前端校验（向导流在 SubmitReview 里校验）
- 成功后 `setTimeout(2500ms)` 自动折叠卡片
- 使用 `invalidateQueries` 而非 `setQueryData` 来更新缓存（避免多司机数据泄露）

---

## 3. 入口 2: DriverCollectionFlow.tsx — 向导提交流

### 文件链

```
/root/bht/driver/pages/DriverCollectionFlow.tsx  (主流程, 行 37-551)
  └→ /root/bht/driver/components/SubmitReview.tsx (第4步确认, 行 69-552)
       └→ /root/bht/hooks/useCollectionSubmission.ts (状态机, 行 36-57)
            └→ /root/bht/services/collectionSubmissionOrchestrator.ts (编排器)
```

### 3.1 DriverCollectionFlow 流程步骤

```
FlowStep = 'selection' | 'capture' | 'amounts' | 'confirm'

Step 1 'selection' → MachineSelector 组件
Step 2 'capture'    → ReadingCapture 组件 (输入分数 + 拍照)
Step 3 'amounts'    → FinanceSummary 组件 (调整零钱/小费/留存)
Step 4 'confirm'    → SubmitReview 组件 (确认 + 提交)
```

### 3.2 SubmitReview.handleSubmit (SubmitReview.tsx 行 272-389)

```
handleSubmit()
  │
  ├─ [GUARD] isProcessing || submittedRef.current → return (行 273)
  │
  ├─ [VALIDATE 1] 分数格式: !trimmedScore || isNaN(parseInt)
  │    └─ showToast + telemetry('submit_validation_error','invalid_score') + return (行 278-290)
  │
  ├─ [VALIDATE 2] 分数低于上次: isScoreBelowLastReading
  │    └─ showToast + telemetry('score_below_last_reading') + return (行 291-303)
  │
  ├─ [CONFIRM 1] 缺少照片 → confirm() 弹窗 (行 304-319)
  ├─ [CONFIRM 2] 零钱不足 → confirm() 弹窗 (行 320-332)
  ├─ [CONFIRM 3] 当日重复提交 → confirm() 弹窗 (行 334-352)
  │
  ├─ [GPS 解析优先级] (行 354-388)
  │    ├─ gpsCoords 存在 → processSubmission(gpsCoords, 'live')
  │    ├─ 有照片 → extractGpsFromExif(photoData) → 'exif'
  │    ├─ EXIF失败 → estimateLocationFromContext() → 'estimated' (需用户确认)
  │    └─ 全部失败 → {lat:0, lng:0}, 'none' (需用户确认)
  │
  └─ processSubmission(resolvedGps, gpsSourceType) (行 244-270)
       ├─ submittedRef.current = true (防重复)
       └─ ★ await submitCollection({...}) ★
            → useCollectionSubmission.submit()
              → orchestrateCollectionSubmission()
```

### 3.3 useCollectionSubmission 状态机 (`/root/bht/hooks/useCollectionSubmission.ts`)

```
状态转换:
  {status:'idle'}
    → submit() 调用
      → {status:'submitting'}
        → orchestrateCollectionSubmission() 成功
          → {status:'success', source:'server'|'offline', transaction}
        → orchestrateCollectionSubmission() 失败
          → {status:'error', message}

SubmitReview 消费状态 (useEffect, 行 131-182):
  success → onSubmitRef.current(completion)
    → DriverCollectionFlow.onSubmit (行 519-529)
      → recordFlowEvent → onSubmit(result)
        → useDriverSubmissionCompletion() (行 43-111)
          ├─ 更新 locations 缓存 (lastScore)
          ├─ 更新 transactions 缓存
          ├─ localDB.set 持久化
          └─ 在线+服务器成功 → getQueueHealthSummary()
               → if pending>0 → syncOfflineData.mutate() (触发 flushQueue)
  error   → showToast + telemetry('submit_failed')
```

### 3.4 useDriverSubmissionCompletion (`/root/bht/driver/hooks/useDriverSubmissionCompletion.ts`)

```
onSubmit({source, transaction})
  │
  ├─ reset_request / payout_request → submitTransaction.mutateAsync (行 44-68)
  │
  └─ collection 类型 (行 70-110)
       ├─ 更新 locations 缓存: lastScore = tx.currentScore (React Query setQueryData)
       ├─ 更新 transactions 缓存: prepend tx 到列表首部
       ├─ localDB.set 持久化到 IDB
       └─ if (isOnline && source==='server')
            └─ getQueueHealthSummary()
                 └─ if pending>0 || retryWaiting>0 || deadLetter>0
                      → syncOfflineData.mutate() → flushQueue()
```

---

## 4. 编排器: collectionSubmissionOrchestrator.ts

### 文件: `/root/bht/services/collectionSubmissionOrchestrator.ts`

这是两个入口的收敛点，所有收款提交最终都经过此函数。

### 4.1 核心入口 (行 258-340)

```typescript
export async function orchestrateCollectionSubmission(
  input: OrchestrateCollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps = defaultDeps,
): Promise<OrchestratedCollectionSubmissionResult>
```

### 4.2 完整决策树

```
orchestrateCollectionSubmission(input)
  │
  ├─ rawInput = buildCollectionSubmissionInput(input) (行 262)
  │    │
  │    │  输入转换 (行 178-245):
  │    │    - expenses 强制设 0 (collection类型不含expense)
  │    │    - 解析 currentScore: Number.parseInt(trimmedScore)
  │    │    - ANOMALY检测: |userScore - aiScore| > ANOMALY_SCORE_DIFF_THRESHOLD
  │    │    - reportedStatus: normalizeReportedStatus(ai condition, loc.status)
  │    │      ('damaged'→'broken', 'maintenance'→'maintenance', 其他→'active')
  │    │    - ownerRetention: parseAmount() 或 null
  │    │    - gps: {lat:0,lng:0} → null
  │    │
  │    │  ⚠ 行 191-204: 空/非数字分数 → throw "Invalid current score"
  │
  ├─ appendCollectionSubmissionAudit('submit_attempt') (行 264-279)
  │
  ├─ ★ IF input.isOnline === true ★ (行 281)
  │    │
  │    ├─ result = deps.submitCollectionV2(rawInput) (行 282)
  │    │    │
  │    │    ├─ [SUCCESS] result.success === true
  │    │    │    ├─ 审计: 'submit_server_success'
  │    │    │    └─ return {source:'server', transaction, fallbackReason:null}
  │    │    │
  │    │    ├─ [EVIDENCE FAILURE] result.kind === 'evidence'
  │    │    │    │  证据类错误 (缺少照片/照片无效/上传失败)
  │    │    │    │  → 不 fallback 到离线 (离线也无法解决)
  │    │    │    └─ throw Error (QuickCollect 的 catch 块会显示给用户)
  │    │    │
  │    │    └─ [OTHER FAILURE] → fallbackToOffline(input, rawInput, deps, error)
  │    │         │  审计: 'submit_server_failure'
  │    │         │  → 服务端调用失败 → 降级到离线队列
  │    │         └─ return {source:'offline', transaction, fallbackReason}
  │    │
  │    └─ ELSE (离线) (行 339)
  │         └─ fallbackToOffline(input, rawInput, deps, null)
  │
  └─ fallbackToOffline (行 247-256)
       ├─ offlineTransaction = buildOfflineTransaction(input, rawInput, deps)
       │    │  调用 createCollectionTransaction() (来自 transactionBuilder)
       │    │  使用本地计算的 financials: revenue, commission, netPayable
       │    │  设置 paymentStatus='pending', 附加 expenseType/Category/Description
       │    │
       │    ⚠ 离线交易的财务值来自客户端计算，同步时会被服务器重新计算覆盖
       │
       ├─ enqueueOfflineTransaction(offlineTransaction, rawInput, ...)
       │    ├─ enqueueTransaction(offlineTransaction, rawInput)
       │    │    → offlineQueue.ts → IDB + rawInput 保存
       │    └─ appendCollectionSubmissionAudit('submit_offline_enqueued')
       │
       └─ return {source:'offline', transaction:offlineTransaction, fallbackReason}
```

---

## 5. RPC 调用层: collectionSubmissionService.ts

### 文件: `/root/bht/services/collectionSubmissionService.ts`

这是 `submit_collection_v2` RPC 的 TypeScript 封装层。

### 5.1 submitCollectionV2 函数 (行 115-263)

```
submitCollectionV2(input)
  │
  ├─ [Gate 0] if (!supabase) → {success:false, kind:'config'} (行 118-120)
  │
  ├─ [Gate 1] if (!input.photoUrl?.trim()) → {success:false, kind:'evidence'} (行 122-124)
  │
  ├─ [Gate 2] URL格式校验: isDataImageUrl || isValidHttpUrl (行 126-128)
  │
  ├─ [STEP] persistedPhotoUrl = persistEvidencePhotoUrl(input.photoUrl, {required:true})
  │    (行 131-141)  将 base64 照片上传到 Supabase Storage
  │    失败 → {success:false, kind:'evidence'}
  │
  ├─ [Gate 3] isValidHttpUrl(persistedPhotoUrl) 验证 (行 143-145)
  │
  ├─ ★ supabase.rpc('submit_collection_v2', {参数}) ★ (行 152-172)
  │    │
  │    │  参数映射 (TypeScript → PostgreSQL):
  │    │    p_tx_id               → input.txId
  │    │    p_location_id          → input.locationId
  │    │    p_driver_id            → input.driverId
  │    │    p_current_score        → input.currentScore
  │    │    p_expenses             → input.expenses (始终=0)
  │    │    p_tip                  → input.tip
  │    │    p_startup_debt_deduction → input.startupDebtDeduction
  │    │    p_is_owner_retaining   → input.isOwnerRetaining
  │    │    p_owner_retention      → input.ownerRetention
  │    │    p_coin_exchange        → input.coinExchange
  │    │    p_gps                  → input.gps
  │    │    p_photo_url            → persistedPhotoUrl (Storage URL)
  │    │    p_ai_score             → input.aiScore
  │    │    p_anomaly_flag         → input.anomalyFlag
  │    │    p_notes                → input.notes
  │    │    p_expense_type         → input.expenseType
  │    │    p_expense_category     → input.expenseCategory
  │    │    p_reported_status      → input.reportedStatus
  │    │    p_expense_description  → input.expenseDescription
  │    │
  │    │  超时: AbortSignal.timeout(30_000) ← 30秒硬超时
  │    │
  │    └─ catch → classifyRpcException(error)
  │         ↓
  │         timeout/abort/network/fetch/offline/connection → 'network'
  │         其他 → 'rpc'
  │
  ├─ [Gate 4] RPC返回 error || !data → {success:false, kind:'rpc'} (行 180-186)
  │
  ├─ [Gate 5] rpcData['error'] 存在 → SQL EXCEPTION (行 191-197)
  │
  ├─ [Gate 6] rpcData['tx_conflict'] === true (行 203-209)
  │    │  表示 ON CONFLICT (id) DO NOTHING 触发了
  │    │  相同 txId 的重复提交被阻止
  │    └─ → {success:false, error:'Transaction already exists'}
  │
  └─ [SUCCESS] 构建 Transaction 对象 (行 212-262)
       │
       │  关键服务器权威值:
       │    type: 'collection', isSynced: true, approvalStatus: 'approved'
       │    paymentStatus: row['paymentStatus'] ?? 'pending'
       │    所有财务字段 (revenue, commission, netPayable 等) 来自服务器计算
       │
       └─ return {success:true, transaction, source:'server'}
```

---

## 6. 后端 SQL: submit_collection_v2 完整定义

### 最新定义文件: `/root/bht/supabase/migrations/20260509043000_add_owner_retention_mode_to_transactions.sql`

### 6.1 函数签名 (行 11-33)

```sql
CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id                  TEXT,      -- 客户端生成的 UUID，幂等键
    p_location_id            UUID,      -- 机器/位置 ID
    p_driver_id              TEXT,      -- 司机 ID
    p_current_score          INTEGER,   -- 当前计数器读数
    p_expenses               INTEGER  DEFAULT 0,       -- 始终为0 (collection类型)
    p_tip                    INTEGER  DEFAULT 0,       -- 小费
    p_startup_debt_deduction INTEGER  DEFAULT 0,       -- 创业债扣除
    p_is_owner_retaining     BOOLEAN  DEFAULT TRUE,    -- 机主是否留存分红
    p_owner_retention        NUMERIC  DEFAULT NULL,    -- 机主留存金额 (null=用系统计算)
    p_coin_exchange          INTEGER  DEFAULT 0,       -- 零钱兑换
    p_gps                    JSONB    DEFAULT NULL,    -- GPS坐标 {lat, lng}
    p_photo_url              TEXT     DEFAULT NULL,    -- 照片URL (Storage)
    p_ai_score               INTEGER  DEFAULT NULL,    -- AI识别分数
    p_anomaly_flag           BOOLEAN  DEFAULT FALSE,   -- 异常标记
    p_notes                  TEXT     DEFAULT NULL,    -- 备注
    p_expense_type           TEXT     DEFAULT NULL,    -- 始终为NULL
    p_expense_category       TEXT     DEFAULT NULL,    -- 始终为NULL
    p_reported_status        TEXT     DEFAULT 'active',-- 机器状态报告
    p_expense_description    TEXT     DEFAULT NULL     -- 费用描述
)
RETURNS JSON                          -- 返回完整交易行 + tx_conflict 信号
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
```

### 6.2 权限控制

```sql
REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION ... TO authenticated;
```

仅通过 Supabase Auth 认证的用户（`authenticated` 角色）可调用。

### 6.3 完整执行流程 (行 34-157)

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: 认证检查 (行 56-58)                                       │
│   IF auth.uid() IS NULL                                          │
│     → RAISE EXCEPTION 'Authentication required' (SQLSTATE 42501) │
├─────────────────────────────────────────────────────────────────┤
│ Step 2: 权限鉴权 (行 60-70)                                       │
│   SELECT role, driver_id FROM public.profiles                    │
│     WHERE auth_user_id = auth.uid()                              │
│   IF NOT FOUND → 'Caller profile not found'                     │
│   IF role='driver' AND caller_driver_id ≠ p_driver_id            │
│     → 'Forbidden: driver may not submit for another driver'      │
├─────────────────────────────────────────────────────────────────┤
│ Step 3: 地点行锁 (行 72-79)                                       │
│   SELECT id, name, lastScore, commissionRate,                    │
│          remainingStartupDebt, dividendBalance                   │
│   FROM public.locations WHERE id = p_location_id                 │
│   FOR UPDATE  ← 行级排他锁, 防止并发写入                           │
│   IF NOT FOUND → 'Location not found'                           │
├─────────────────────────────────────────────────────────────────┤
│ Step 4: 司机验证 (行 81-86)                                       │
│   SELECT id, name FROM public.drivers WHERE id = p_driver_id     │
│   IF NOT FOUND → 'Driver not found'                             │
├─────────────────────────────────────────────────────────────────┤
│ Step 5: 财务计算 (行 88-98) — 服务器权威计算                        │
│                                                                   │
│   v_diff             = GREATEST(0, p_current_score - lastScore)  │
│   v_revenue          = v_diff * get_coin_value_tzs()              │
│                         ↑ 从 constants 表读取 coin_value_tzs       │
│   v_commission       = FLOOR(v_revenue * commissionRate)          │
│   v_final_retention  = GREATEST(0, COALESCE(p_owner_retention,   │
│                                             v_commission))        │
│   v_available_after  = v_revenue - v_final_retention              │
│   _core                - ABS(expenses) - ABS(tip)                │
│   v_startup_deduct   = LEAST(p_startup_debt_deduction,            │
│                              remainingStartupDebt)                │
│   v_net_payable      = GREATEST(0, v_available_after_core         │
│                                   + v_startup_debt_deduct)        │
├─────────────────────────────────────────────────────────────────┤
│ Step 6: 插入交易 (行 100-128)                                      │
│   INSERT INTO public.transactions (                               │
│     id, timestamp, uploadTimestamp,                               │
│     locationId, locationName, driverId, driverName,               │
│     previousScore, currentScore,                                  │
│     revenue, commission, ownerRetention, isOwnerRetaining,        │
│     debtDeduction, startupDebtDeduction,                          │
│     expenses, coinExchange, extraIncome, netPayable,              │
│     paymentStatus, gps, photoUrl,                                 │
│     aiScore, isAnomaly, isClearance, isSynced,                    │
│     type, dataUsageKB, reportedStatus, notes,                     │
│     expenseType, expenseCategory, expenseStatus,                  │
│     approvalStatus, expenseDescription                            │
│   ) VALUES (                                                      │
│     p_tx_id, NOW(), NOW(),  -- timestamp = uploadTimestamp = NOW()│
│     ...,                                                          │
│     'pending',  -- paymentStatus                                  │
│     TRUE,       -- isSynced                                       │
│     'collection', -- type                                         │
│     120,        -- dataUsageKB (硬编码, 固定值)                    │
│     'approved', -- approvalStatus                                 │
│     ...                                                           │
│   )                                                               │
│   ON CONFLICT (id) DO NOTHING  ← 幂等性保证                        │
├─────────────────────────────────────────────────────────────────┤
│ Step 7: 获取插入行数 (行 130)                                       │
│   GET DIAGNOSTICS v_rows_inserted = ROW_COUNT                     │
│   → 0 = 重复提交 (ON CONFLICT 触发)                                │
│   → 1 = 成功插入                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Step 8: 更新地点 (行 132-147) — 仅当 v_rows_inserted = 1            │
│   UPDATE public.locations SET                                     │
│     "lastScore" = CASE                                            │
│       WHEN lastScore IS NULL OR p_current_score >= lastScore      │
│         THEN p_current_score                                       │
│       ELSE lastScore                                              │
│     END,                                                          │
│     "remainingStartupDebt" = GREATEST(0,                          │
│       remainingStartupDebt - v_startup_debt_deduct),              │
│     "dividendBalance" = CASE                                      │
│       WHEN p_is_owner_retaining                                   │
│         THEN dividendBalance + v_final_retention                   │
│       ELSE dividendBalance                                        │
│     END                                                           │
│   WHERE id = p_location_id                                        │
├─────────────────────────────────────────────────────────────────┤
│ Step 9: 返回结果 (行 149-155)                                       │
│   RETURN (                                                         │
│     SELECT row_to_json(t)::jsonb                                  │
│       || jsonb_build_object(                                       │
│            'tx_conflict',                                         │
│            CASE WHEN v_rows_inserted = 0 THEN true ELSE false END │
│          )                                                        │
│     FROM public.transactions t WHERE t.id = p_tx_id               │
│   )                                                               │
│                                                                   │
│   返回格式:                                                        │
│   {                                                               │
│     "id": "...",                                                  │
│     "locationId": "...",                                          │
│     "currentScore": 12345,                                        │
│     "revenue": 50000,      ← 服务器权威计算                        │
│     "commission": 7500,                                           │
│     "netPayable": 42500,                                          │
│     "paymentStatus": "pending",                                   │
│     "isSynced": true,                                             │
│     "type": "collection",                                         │
│     ...                                                           │
│     "tx_conflict": false   ← 幂等重放信号                          │
│   }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 安全特性

| 特性 | 实现 |
|------|------|
| 认证 | `auth.uid()` 检查 JWT 令牌 |
| 鉴权 | `profiles` 表检查角色 + driver 身份 |
| 行级锁 | `FOR UPDATE` 防止并发覆盖 |
| 幂等性 | `ON CONFLICT (id) DO NOTHING` + `tx_conflict` 信号 |
| 隔离 | `SECURITY DEFINER` + `SET search_path = public, pg_temp` |
| 财务安全 | 所有金额由服务器计算，客户端仅提供原始读数 |
| 审计 | `remainingStartupDebt` 和 `dividendBalance` 原子更新 |

### 6.5 关键设计决策

1. **expenses 在 collection 交易中强制为 0**：费用（办公借款等）通过独立的 `type='expense'` 交易记录，保持 collection 的财务计算纯净。

2. **`p_owner_retention` 可为 NULL**：当为 NULL 时，`v_final_retention` 使用系统计算的 `v_commission`；当显式传入时使用该值。

3. **`isOwnerRetaining` 影响 `dividendBalance`**：
   - `TRUE`：机主留存金额累加到 `locations.dividendBalance`
   - `FALSE`：机主当场领取，不影响 dividendBalance

4. **`get_coin_value_tzs()` 从常数表读取**：硬币价值由 `constants` 表管理，可通过管理面板动态调整。

5. **`tx_conflict` 信号**：客户端通过此字段判断是否为重复提交，避免重复记录 `submit_success` 遥测事件。

---

## 7. submit_collection_v2 迁移历史

| 迁移文件 | 日期 | 变更内容 |
|---------|------|---------|
| `20260325156000_submit_collection_v2.sql` | 2026-03-25 | 初始版本: 基本 INSERT + 财务计算 |
| `20260403000000_fix_submit_collection_update_last_score.sql` | 2026-04-03 | 增加 `UPDATE locations SET lastScore` |
| `20260404033000_manual_merchant_debt_and_payment_state.sql` | 2026-04-04 | 增加 merchant debt / payment state |
| `20260404232000_owner_share_retention_logic.sql` | 2026-04-04 | 机主分红留存逻辑 |
| `20260406000000_add_expense_description_to_submit_collection.sql` | 2026-04-06 | 增加 `p_expense_description` 参数 |
| `20260406010000_hotfix_submit_collection_auth.sql` | 2026-04-06 | 修复 `user_profiles` → `profiles` 表引用 |
| `20260406030000_fix_submit_collection_revenue_and_retention.sql` | 2026-04-06 | 修复 revenue/retention 计算逻辑 |
| `20260406040000_extract_coin_value_constant.sql` | 2026-04-06 | 提取 `get_coin_value_tzs()` 到独立函数 |
| `20260424043000_fix_merchant_debt_repayment_cash_direction.sql` | 2026-04-24 | 修复 merchant debt 还款方向 |
| `20260505120000_submit_collection_v2_tx_conflict_signal.sql` | 2026-05-05 | 增加 `tx_conflict` 幂等重放信号 |
| `20260505200000_fix_submit_collection_v2_created_at.sql` | 2026-05-05 | 修复 `created_at` 列不存在错误 |
| `20260509043000_add_owner_retention_mode_to_transactions.sql` | 2026-05-09 | **当前最新**: 增加 `isOwnerRetaining` 列到 transactions |

---

## 8. 两个入口的关键对比

| 特性 | QuickCollect | DriverCollectionFlow |
|------|-------------|---------------------|
| 目标 | 老手快速收 (2-4点击) | 新手向导收 (4步流程) |
| 状态管理 | 组件内部 `useState<Record<string, MachineEntry>>` | `useCollectionDraft()` 单草稿 |
| 提交入口 | `handleSubmit(id)` 直接调用编排器 | `SubmitReview.handleSubmit()` → 状态机 → 编排器 |
| 分数校验 | `parsedScore <= lastScore` 在提交时校验 | `isScoreBelowLastReading` 在确认步骤校验 |
| 照片需求 | 可选 (组件有拍照按钮) | 强要求 (无照片有确认弹窗) |
| 重复提交检查 | 无 | `alreadyCollectedToday` 当日重复检测 |
| 零钱库存检查 | 无 (依赖 `financePreviews`) | `isCoinStockNegative` 确认弹窗 |
| GPS 解析 | 使用 props 传入的 `gpsCoords` | 多层 fallback: live → EXIF → estimated → none |
| 提交后处理 | `invalidateQueries` (React Query) | `useDriverSubmissionCompletion` (手动 setQueryData + localDB) |
| 遥测 | `quick_collect_*` 事件 | `submit_*` / `confirm_*` 事件 |
| UI 反馈 | 2.5秒后自动折叠卡片 | 独立成功页面 (CheckCircle2 动画) |
| 批量收 | ✓ 支持 (GPS排序列表, 逐台收) | ✗ (单机草稿模式) |

---

## 9. 错误处理分类

```
┌──────────────────────────────────────────────────────────────┐
│                    错误分层处理                                │
├────────────┬─────────────────────────────────────────────────┤
│ 层级        │ 处理方式                                        │
├────────────┼─────────────────────────────────────────────────┤
│ 前端校验    │ 拦截 bad input (空分数/分数≤上次/无照片警告)     │
│ (UI层)     │ 不进入编排器                                     │
├────────────┼─────────────────────────────────────────────────┤
│ 编排器      │ evidence 错误 → throw (不 fallback 到离线)      │
│ (决策层)    │ 其他在线失败 → fallbackToOffline (离线队列)       │
│            │ 离线 → 直接 enqueue (离线队列)                    │
├────────────┼─────────────────────────────────────────────────┤
│ RPC调用层   │ config: Supabase未配置                          │
│            │ evidence: 照片缺失/格式错误/上传失败              │
│            │ network: timeout/abort/offline/connection        │
│            │ rpc: SQL异常/tx_conflict/返回空数据               │
├────────────┼─────────────────────────────────────────────────┤
│ SQL函数层   │ 42501: 认证/鉴权失败                             │
│            │ P0002: Location/Driver 不存在                    │
│            │ EXCEPTION: 其他运行时错误 → json_build_object     │
│            │ ON CONFLICT: 幂等阻止 → tx_conflict=true         │
└────────────┴─────────────────────────────────────────────────┘
```

---

## 10. 数据流总结

```
用户输入 (score, photo, tip, coinExchange, ownerRetention...)
  │
  ▼
前端校验 (非空 / > lastScore / 照片检查 / 重复检查)
  │
  ▼
calculateCollectionFinanceLocal() — 客户端财务预览 (仅供参考)
  │
  ▼
buildCollectionSubmissionInput() — 构建服务器输入 (expenses=0, 仅原始读数)
  │
  ├─── [在线] ──────────────────────────────────────────┐
  │                                                     ▼
  │   persistEvidencePhotoUrl() — base64 → Supabase Storage URL
  │                                                     │
  │                                                     ▼
  │   supabase.rpc('submit_collection_v2', {19个参数})
  │                                                     │
  │                                                     ▼
  │   ┌─── PostgreSQL submit_collection_v2 ────────────┐
  │   │ auth.uid() → profiles.role/driver_id           │
  │   │ FOR UPDATE locations → 财务计算                  │
  │   │ INSERT transactions ON CONFLICT DO NOTHING      │
  │   │ UPDATE locations (lastScore/debt/dividend)      │
  │   │ RETURN row_to_json + tx_conflict                │
  │   └────────────────────────────────────────────────┘
  │                         │
  │                         ▼
  │   返回 {success:true, transaction (isSynced:true, 服务器权威值)}
  │
  └─── [离线 或 在线失败] ──────────────────────────────┐
                                                        ▼
      buildOfflineTransaction() — 客户端本地构建交易
      enqueueTransaction(tx, rawInput) → IDB
                                                        │
      ⚠ 离线交易携带 rawInput                              │
         flushQueue() 时重放 → submitCollectionV2(rawInput)
         服务器重新计算财务值覆盖本地值
```

---

## 相关文件索引

| 文件 | 作用 |
|------|------|
| `/root/bht/driver/components/QuickCollect.tsx` | 快速收组件 (入口1) |
| `/root/bht/driver/pages/DriverCollectionFlow.tsx` | 向导收主流程 (入口2) |
| `/root/bht/driver/components/SubmitReview.tsx` | 向导第4步确认提交 |
| `/root/bht/hooks/useCollectionSubmission.ts` | 提交状态机 |
| `/root/bht/driver/hooks/useDriverSubmissionCompletion.ts` | 提交后缓存更新 |
| `/root/bht/services/collectionSubmissionOrchestrator.ts` | 编排器 (两个入口收敛点) |
| `/root/bht/services/collectionSubmissionService.ts` | RPC 调用封装 |
| `/root/bht/services/collectionSubmissionAudit.ts` | 审计日志 |
| `/root/bht/services/evidenceStorage.ts` | 证据照片上传到 Storage |
| `/root/bht/services/financeCalculator.ts` | 客户端财务预览计算 |
| `/root/bht/offlineQueue.ts` | 离线队列 (IDB + flushQueue) |
| `/root/bht/utils/transactionBuilder.ts` | 交易对象构建工具 |
| `/root/bht/supabase/migrations/20260509043000_add_owner_retention_mode_to_transactions.sql` | 最新 SQL 定义 |
| `/root/bht/docs/COLLECTION_SUBMISSION_TRACE.md` | 全链路补充文档 (含离线队列) |
| `/root/bht/docs/offline-queue-sync-trace.md` | 离线队列详细文档 |
