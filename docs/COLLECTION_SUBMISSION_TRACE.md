# BHT 收款提交流程全链路追踪

> 生成时间: 2026-05-10
> 追踪范围: QuickCollect + DriverCollectionFlow → submit_collection_v2 RPC → IDB 离线队列 → flushQueue 同步

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UI 入口层                                      │
│  QuickCollect.tsx               DriverCollectionFlow.tsx             │
│  (快速收: 3次点击)               (向导收: 4步流程)                     │
│       │                                │                              │
│       │ handleSubmit()                  │ SubmitReview.handleSubmit() │
│       ▼                                ▼                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │         useCollectionSubmission.ts (状态机)                       │ │
│  │         orchestrateCollectionSubmission()                        │ │
│  └────────────────────────────┬────────────────────────────────────┘ │
│                               ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │      collectionSubmissionOrchestrator.ts (决策中心)               │ │
│  │      buildCollectionSubmissionInput → 在线? 离线?                  │ │
│  └───────┬──────────────────────────────────┬──────────────────────┘ │
│          │ 在线                             │ 离线                    │
│          ▼                                  ▼                         │
│  ┌──────────────────┐            ┌──────────────────────────┐       │
│  │ submitCollectionV2│            │ fallbackToOffline()       │       │
│  │ → supabase.rpc()  │            │ → buildOfflineTransaction │       │
│  │ → SQL函数          │            │ → enqueueTransaction()    │       │
│  └──────────────────┘            │ → IDB / localStorage     │       │
│                                   └───────┬──────────────────┘       │
│                                           │                           │
│                              ┌────────────▼──────────────────┐       │
│                              │  flushQueue() 同步时重放        │       │
│                              │  → flushSingleItem()           │       │
│                              │  → submitCollectionV2(rawInput)│       │
│                              └───────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 入口 1: QuickCollect（快速收）

### 文件: `/root/bht/driver/components/QuickCollect.tsx`

### 2.1 数据结构

```typescript
// 组件 Props (行 34-37)
interface QuickCollectProps {
  gpsCoords: { lat: number; lng: number } | null;
  currentDriver: Driver | undefined;
}

// 单台机器状态 (行 39-52)
interface MachineEntry {
  location: Location;
  score: string;           // 用户输入的分数
  photo: string | null;    // base64 照片
  submitting: boolean;     // 提交中锁
  submitted: boolean;      // 已提交标记
  receipt: SubmissionReceipt | null;  // 提交回执
  coinExchange: string;
  tip: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  expenses: string;
}

// 提交回执 (行 54-63)
interface SubmissionReceipt {
  status: 'server' | 'offline' | 'failed';
  txId?: string;
  previousScore: number;
  currentScore: number;
  revenue: number;
  netPayable: number;
  message: string;
  detail: string;
}
```

### 2.2 完整调用链

```
QuickCollect (函数组件, 行 88)
  │
  ├─ 行 96: useState<Record<string, MachineEntry>> entries
  ├─ 行 97: useState<string | null> expandedId
  ├─ 行 99-102: useMemo → assignedMachines (按 assignedDriverId 过滤)
  ├─ 行 106-123: useMemo → sortedMachines (GPS距离排序)
  ├─ 行 126-134: getEntry(id) → 获取/初始化单机状态
  ├─ 行 136-137: updateEntry(id, patch) → 更新单机状态
  ├─ 行 140-159: useMemo → financePreviews (本地财务预览)
  │
  └─ 行 162-375: handleSubmit(id) ← 核心提交逻辑
       │
       ├─ 行 163-165: 防重复提交检查 (entry.submitting)
       ├─ 行 167-171: 分数格式校验 (isNaN)
       ├─ 行 173-214: 分数必须大于 lastScore 校验
       │    └─ 失败: 设 receipt.status='failed', 记录遥测, return
       │
       ├─ 行 216: safeRandomUUID() → draftTxId
       ├─ 行 217-227: calculateCollectionFinanceLocal() → calc (本地财务)
       │
       ├─ 行 230-247: ★ orchestrateCollectionSubmission({...}) ★
       │    │  输入参数 (行 230-247):
       │    │    selectedLocation, currentDriver, isOnline,
       │    │    currentScore, photoData, aiReviewData: null,
       │    │    expenses, expenseType: 'public', expenseCategory: undefined,
       │    │    coinExchange, tip, draftTxId,
       │    │    isOwnerRetaining, ownerRetention, calculations: calc,
       │    │    resolvedGps, gpsSourceType
       │    │
       │    │  返回类型: OrchestratedCollectionSubmissionResult
       │    │    {source: 'server'|'offline', transaction, fallbackReason}
       │    │
       │    ├─ 行 252-254: 成功后 invalidateQueries (transactions/locations/drivers)
       │    ├─ 行 256-274: 构建 SubmissionReceipt
       │    ├─ 行 276-284: updateEntry + showToast
       │    └─ 行 286-325: recordDriverFlowEvent 遥测记录
       │
       └─ 行 334-374: catch → 错误处理 + 设 receipt.status='failed'
```

---

## 3. 入口 2: DriverCollectionFlow（向导收）

### 3.1 文件链

```
/root/bht/driver/pages/DriverCollectionFlow.tsx (主流程, 行 37-551)
  → /root/bht/driver/components/SubmitReview.tsx (第4步确认提交, 行 69-552)
    → /root/bht/hooks/useCollectionSubmission.ts (状态机, 行 36-57)
      → /root/bht/services/collectionSubmissionOrchestrator.ts (编排器)
```

### 3.2 DriverCollectionFlow 状态管理

```typescript
// 流程步骤 (行 35)
type FlowStep = 'selection' | 'capture' | 'amounts' | 'confirm';

// 草稿状态 ← useCollectionDraft() (行 53)
draft: {
  selectedLocId, draftTxId, currentScore, photoData,
  aiReviewData, coinExchange, ownerRetention, isOwnerRetaining,
  startupDebtDeduction, tip, gpsCoords, gpsPermission
}
```

### 3.3 完整调用链

```
DriverCollectionFlow (行 37)
  │
  ├─ 行 53: useCollectionDraft() → draft 状态
  ├─ 行 54: flowIdRef = safeRandomUUID()
  ├─ 行 58-65: onSubmit = useDriverSubmissionCompletion({...})
  │    (提交后的缓存更新与同步触发)
  ├─ 行 68: useGpsCapture(draft.gpsCoords) → gpsCoords
  ├─ 行 79-81: useEffect → isOnline时 flushDriverFlowEvents()
  │
  ├─ Step 1 'selection' (行 388-420) → MachineSelector
  ├─ Step 2 'capture'    (行 428-464) → ReadingCapture
  ├─ Step 3 'amounts'    (行 467-497) → FinanceSummary
  │
  └─ Step 4 'confirm'    (行 500-549) → SubmitReview
       │
       └─ SubmitReview.tsx (行 69)
            │
            ├─ 行 84: useCollectionSubmission() → {state, submit, reset}
            ├─ 行 85-86: completionResult / completionPending 本地状态
            │
            ├─ 行 272-389: handleSubmit() ← 提交按钮 onClick
            │    │
            │    ├─ 行 277-290: 分数格式校验
            │    ├─ 行 291-303: 分数低于上次读数校验
            │    ├─ 行 304-319: 缺少照片确认弹窗
            │    ├─ 行 320-332: 零钱不足确认弹窗
            │    ├─ 行 334-352: 当日重复提交确认弹窗
            │    │
            │    ├─ 行 354: 有GPS → processSubmission(gpsCoords, 'live')
            │    ├─ 行 356-360: 无GPS有照片 → extractGpsFromExif → 'exif'
            │    ├─ 行 363-374: 无GPS无EXIF → estimateLocationFromContext → 'estimated'
            │    └─ 行 377-388: 都失败 → 确认后用 {lat:0, lng:0} → 'none'
            │
            ├─ 行 244-270: processSubmission(resolvedGps, gpsSourceType)
            │    │
            │    ├─ 行 248: submittedRef.current 防重复
            │    └─ 行 250-269: ★ submitCollection({...}) ★
            │         → useCollectionSubmission.submit()
            │
            ├─ 行 131-182: useEffect 消费 submissionState
            │    ├─ success → 调 onSubmitRef.current(completion)
            │    │   → DriverCollectionFlow 的 onSubmit (行 519-529)
            │    │   → 记录遥测 → onSubmit(result)
            │    │   → useDriverSubmissionCompletion (行 43-111)
            │    │       ├─ 更新 locations 缓存 (lastScore)
            │    │       ├─ 更新 transactions 缓存
            │    │       ├─ localDB.set 持久化
            │    │       └─ 在线+服务器成功 → getQueueHealthSummary → syncOfflineData.mutate()
            │    │
            │    └─ error → showToast + 遥测
            │
            └─ 行 184-242: completionResult 已设置 → 成功页面 UI
```

### 3.4 useCollectionSubmission 状态机

文件: `/root/bht/hooks/useCollectionSubmission.ts`

```typescript
// 状态机 (行 17-21)
type CollectionSubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; source: 'server' | 'offline'; transaction: Transaction }
  | { status: 'error'; message: string };

// 行 39-52: submit() 
//   1. setState({status:'submitting'})
//   2. result = await orchestrateCollectionSubmission(input)
//   3. setState({status:'success', source, transaction})
//   4. catch → setState({status:'error', message})
```

---

## 4. 编排器: collectionSubmissionOrchestrator.ts

### 文件: `/root/bht/services/collectionSubmissionOrchestrator.ts`

### 4.1 核心入口

```typescript
// 行 258-340
export async function orchestrateCollectionSubmission(
  input: OrchestrateCollectionSubmissionInput,
  deps: CollectionSubmissionOrchestratorDeps = defaultDeps,
): Promise<OrchestratedCollectionSubmissionResult>
```

### 4.2 输入参数 (行 34-53)

```typescript
interface OrchestrateCollectionSubmissionInput {
  selectedLocation: Location;
  currentDriver: Driver;
  isOnline: boolean;              // 控制在线/离线路径
  currentScore: string;           // 原始分数字符串
  photoData: string | null;       // base64 照片
  aiReviewData: CollectionSubmissionAiReview | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  expenseDescription?: string;
  coinExchange: string;
  tip: string;
  draftTxId: string;              // 客户端生成的 UUID
  isOwnerRetaining: boolean;
  ownerRetention: string;
  calculations: CollectionSubmissionCalculations; // 本地财务预览结果
  resolvedGps: { lat: number; lng: number };
  gpsSourceType: SubmissionGpsSource;
}
```

### 4.3 输出类型 (行 55-57)

```typescript
type OrchestratedCollectionSubmissionResult =
  | { source: 'server'; transaction: Transaction; fallbackReason: null }
  | { source: 'offline'; transaction: Transaction; fallbackReason: string | null };
```

### 4.4 完整决策流程

```
orchestrateCollectionSubmission (行 258)
  │
  ├─ 行 262: rawInput = buildCollectionSubmissionInput(input)
  │    │  构建 CollectionSubmissionInput (行 178-245)
  │    │  - expenses 强制为 0 (collection不包含expense)
  │    │  - 解析 currentScore (trim + parseInt)
  │    │  - 异常检测: AI分数与用户分数差 > ANOMALY_SCORE_DIFF_THRESHOLD
  │    │  - 状态推断: normalizeReportedStatus (AI condition → 'active'|'maintenance'|'broken')
  │    │  - 返回: {txId, locationId, driverId, currentScore, expenses:0, tip,
  │    │           startupDebtDeduction, isOwnerRetaining, ownerRetention,
  │    │           coinExchange, gps, photoUrl, aiScore, anomalyFlag, notes,
  │    │           expenseType:null, expenseCategory:null, reportedStatus}
  │    │
  │    │  ⚠ 行 191-204: 分数为空/NaN → 抛异常 "Invalid current score"
  │
  ├─ 行 264-279: appendCollectionSubmissionAudit('submit_attempt')
  │
  ├─ 行 281 ★: if (input.isOnline)
  │    │
  │    ├─ 行 282: result = await deps.submitCollectionV2(rawInput)
  │    │    → submitCollectionV2() in collectionSubmissionService.ts
  │    │
  │    ├─ 行 283-306: if result.success
  │    │    ├─ 审计: 'submit_server_success'
  │    │    └─ return {source: 'server', transaction, fallbackReason: null}
  │    │
  │    ├─ 行 308-314: 失败日志 (区分 evidence 类型)
  │    ├─ 行 315-330: 审计: 'submit_server_failure'
  │    │
  │    ├─ 行 332-334: if kind==='evidence' → throw Error (阻断, 不下沉离线)
  │    │    ⚠ evidence 类错误 (缺少照片/照片无效/上传失败)
  │    │    不fallback到离线队列, 因为离线也无法解决
  │    │
  │    └─ 行 336: return await fallbackToOffline(input, rawInput, deps, fallbackError)
  │
  └─ 行 339 ★: else (离线)
       └─ return await fallbackToOffline(input, rawInput, deps, null)

fallbackToOffline (行 247-256)
  │
  ├─ 行 253: offlineTransaction = buildOfflineTransaction(input, rawInput, deps)
  │    │  调用 deps.createCollectionTransaction() (来自 transactionBuilder)
  │    │  设置 expenseType/expenseCategory/expenseDescription
  │    │  设置 paymentStatus='pending', aiScore, reportedStatus
  │    │
  │    ⚠ 注意: buildOfflineTransaction 使用本地计算的 financials
  │       (revenue, commission, netPayable等), 不是服务器的权威值
  │
  ├─ 行 254: await enqueueOfflineTransaction(offlineTransaction, rawInput, input, reason, deps)
  │    │
  │    ├─ 行 156: deps.enqueueTransaction(offlineTransaction, rawInput)
  │    │    → offlineQueue.enqueueTransaction()
  │    │
  │    ├─ 行 157-169: appendCollectionSubmissionAudit('submit_offline_enqueued')
  │    │
  │    └─ 行 170-175: catch → 抛异常(采集数据暂存失败)
  │
  └─ 行 255: return {source: 'offline', transaction: offlineTransaction, fallbackReason: reason}
```

---

## 5. RPC 调用层: collectionSubmissionService.ts

### 文件: `/root/bht/services/collectionSubmissionService.ts`

### 5.1 数据结构

```typescript
// 行 52-76: 服务器写入入口接受的原始输入
interface CollectionSubmissionInput {
  txId: string;                    // 客户端生成，用于幂等
  locationId: string;
  driverId: string;
  currentScore: number;
  expenses: number;                // 始终为0（collection类型）
  tip: number;
  startupDebtDeduction: number;
  isOwnerRetaining: boolean;
  ownerRetention: number | null;
  coinExchange: number;
  gps: { lat: number; lng: number } | null;
  photoUrl: string | null;
  aiScore: number | null;
  anomalyFlag: boolean;
  notes: string | null;
  expenseType: 'public' | 'private' | null;  // 始终为null
  expenseCategory: Transaction['expenseCategory'] | null;
  expenseDescription?: string;
  reportedStatus: 'active' | 'maintenance' | 'broken';
}

// 行 79-83: 带区分的结果类型
type CollectionSubmissionFailureKind = 'evidence' | 'rpc' | 'config' | 'network';
type CollectionSubmissionResult =
  | { success: true; transaction: Transaction; source: 'server' }
  | { success: false; error: string; kind?: CollectionSubmissionFailureKind };
```

### 5.2 submitCollectionV2 调用链

```
submitCollectionV2(input) (行 115)
  │
  ├─ 行 118-120: if (!supabase) → {success:false, kind:'config'}
  │
  ├─ 行 122-124: if (!input.photoUrl?.trim()) → {success:false, kind:'evidence'}
  │    ⚠ 证据错误: 缺少照片 → 不同离线fallback, 直接throw
  │
  ├─ 行 126-128: URL格式校验 (data:image 或 http(s))
  │
  ├─ 行 130-141: persistedPhotoUrl = await persistEvidencePhotoUrl(...)
  │    └─ 失败 → {success:false, kind:'evidence'}
  │
  ├─ 行 143-145: 验证持久化后的URL是有效的HTTP URL
  │
  ├─ 行 150-178: ★ supabase.rpc('submit_collection_v2', {参数}) ★
  │    │
  │    │  参数映射 (行 152-171):
  │    │    p_tx_id             → input.txId
  │    │    p_location_id       → input.locationId
  │    │    p_driver_id         → input.driverId
  │    │    p_current_score     → input.currentScore
  │    │    p_expenses          → input.expenses (始终0)
  │    │    p_tip               → input.tip
  │    │    p_startup_debt_deduction → input.startupDebtDeduction
  │    │    p_is_owner_retaining → input.isOwnerRetaining
  │    │    p_owner_retention   → input.ownerRetention
  │    │    p_coin_exchange     → input.coinExchange
  │    │    p_gps               → input.gps
  │    │    p_photo_url         → persistedPhotoUrl
  │    │    p_ai_score          → input.aiScore
  │    │    p_anomaly_flag      → input.anomalyFlag
  │    │    p_notes             → input.notes
  │    │    p_expense_type      → input.expenseType
  │    │    p_expense_category  → input.expenseCategory
  │    │    p_reported_status   → input.reportedStatus
  │    │    p_expense_description → input.expenseDescription
  │    │
  │    │  abortSignal: AbortSignal.timeout(30_000) ← 30秒硬超时
  │    │
  │    └─ 行 175-177: catch → {success:false, kind: classifyRpcException(e)}
  │         classifyRpcException (行 91-104):
  │           timeout/abort/network/fetch/offline/connection → 'network'
  │           其他 → 'rpc'
  │
  ├─ 行 180-186: Gate 1 — RPC返回 error || !data
  │    └─ → {success:false, kind:'rpc'}
  │
  ├─ 行 190-197: Gate 2 — rpcData['error'] 字段存在
  │    └─ SQL函数 EXCEPTION块返回 json_build_object('error', ...)
  │    └─ → {success:false, kind:'rpc'}
  │
  ├─ 行 203-209: Gate 3 — rpcData['tx_conflict'] 为 true
  │    └─ 表示 ON CONFLICT (id) DO NOTHING 触发, 交易已存在
  │    └─ → {success:false, kind:'rpc'}
  │    ⚠ 幂等重放: 相同txId的重复提交被阻止
  │
  └─ 行 212-262: 成功 → 标准化服务器返回的 Transaction 对象
       │
       │  关键字段:
       │    isSynced: true (行 242)
       │    type: 'collection' (行 243)
       │    approvalStatus: 'approved' (行 244)
       │    paymentStatus: 'pending' (行 245)
       │    所有财务字段来自服务器: revenue, commission, netPayable等
       │
       └─ return {success:true, transaction, source:'server'}
```

---

## 6. 后端 SQL: submit_collection_v2

### 最新定义文件: `/root/bht/supabase/migrations/20260509043000_add_owner_retention_mode_to_transactions.sql`

### 6.1 函数签名 (行 11-31, 159-168)

```sql
CREATE OR REPLACE FUNCTION public.submit_collection_v2(
    p_tx_id                  TEXT,
    p_location_id            UUID,
    p_driver_id              TEXT,
    p_current_score          INTEGER,
    p_expenses               INTEGER  DEFAULT 0,
    p_tip                    INTEGER  DEFAULT 0,
    p_startup_debt_deduction INTEGER  DEFAULT 0,
    p_is_owner_retaining     BOOLEAN  DEFAULT TRUE,
    p_owner_retention        NUMERIC  DEFAULT NULL,
    p_coin_exchange          INTEGER  DEFAULT 0,
    p_gps                    JSONB    DEFAULT NULL,
    p_photo_url              TEXT     DEFAULT NULL,
    p_ai_score               INTEGER  DEFAULT NULL,
    p_anomaly_flag           BOOLEAN  DEFAULT FALSE,
    p_notes                  TEXT     DEFAULT NULL,
    p_expense_type           TEXT     DEFAULT NULL,
    p_expense_category       TEXT     DEFAULT NULL,
    p_reported_status        TEXT     DEFAULT 'active',
    p_expense_description    TEXT     DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
```

权限: 仅 `authenticated` 角色可执行 (行 159-169)

### 6.2 执行流程 (行 34-157)

```
1. 认证检查 (行 56-58)
   auth.uid() IS NULL → RAISE EXCEPTION 'Authentication required' (42501)

2. 权限检查 (行 60-70)
   SELECT role, driver_id FROM public.profiles WHERE auth_user_id = auth.uid()
   IF NOT FOUND → 'Caller profile not found'
   IF role='driver' AND caller_driver_id ≠ p_driver_id
     → 'Forbidden: driver may not submit on behalf of another driver'

3. 地点锁 (行 72-79)
   SELECT id, name, lastScore, commissionRate, remainingStartupDebt, dividendBalance
   FROM public.locations WHERE id = p_location_id
   FOR UPDATE  ← 行级锁防止并发写入
   IF NOT FOUND → 'Location not found'

4. 司机检查 (行 81-86)
   SELECT id, name FROM public.drivers WHERE id = p_driver_id
   IF NOT FOUND → 'Driver not found'

5. 财务计算 (行 88-98)
   v_diff             = GREATEST(0, p_current_score - lastScore)
   v_revenue          = v_diff * get_coin_value_tzs()  ← 从常量表读取
   v_commission       = FLOOR(v_revenue * commissionRate)
   v_final_retention  = GREATEST(0, COALESCE(p_owner_retention, v_commission))
   v_available_after_core = v_revenue - v_final_retention - |expenses| - |tip|
   v_startup_debt_deduct  = LEAST(p_startup_debt_deduction, remainingStartupDebt)
   v_net_payable      = GREATEST(0, v_available_after_core + v_startup_debt_deduct)

6. 插入交易 (行 100-128)
   INSERT INTO public.transactions (...) VALUES (...)
     paymentStatus = 'pending'
     isSynced      = TRUE
     type          = 'collection'
     approvalStatus = 'approved'
     dataUsageKB   = 120
   ON CONFLICT (id) DO NOTHING  ← 幂等性保证

7. 获取插入行数 (行 130)
   GET DIAGNOSTICS v_rows_inserted = ROW_COUNT

8. 更新地点 (行 132-147) — 仅当 v_rows_inserted = 1
   UPDATE public.locations SET
     lastScore = CASE WHEN lastScore IS NULL OR p_current_score >= lastScore
                      THEN p_current_score ELSE lastScore END,
     remainingStartupDebt = MAX(0, remainingStartupDebt - v_startup_debt_deduct),
     dividendBalance = CASE WHEN p_is_owner_retaining
                       THEN dividendBalance + v_final_retention
                       ELSE dividendBalance END
   WHERE id = p_location_id

9. 返回结果 (行 149-155)
   RETURN (
     SELECT row_to_json(t)::jsonb || jsonb_build_object(
       'tx_conflict', CASE WHEN v_rows_inserted = 0 THEN true ELSE false END
     )
     FROM public.transactions t WHERE t.id = p_tx_id
   )
```

### 6.3 历史版本迁移文件

| Migration | 变更内容 |
|-----------|---------|
| `20260325156000_submit_collection_v2.sql` | 初始版本 |
| `20260403000000_fix_submit_collection_update_last_score.sql` | 增加 locations.lastScore 更新 |
| `20260404033000_manual_merchant_debt_and_payment_state.sql` | 增加 manual_merchant_debt/payment_state |
| `20260404232000_owner_share_retention_logic.sql` | 红owner留存逻辑 |
| `20260406000000_add_expense_description_to_submit_collection.sql` | 增加 p_expense_description |
| `20260406010000_hotfix_submit_collection_auth.sql` | 修复 user_profiles 表引用 |
| `20260406030000_fix_submit_collection_revenue_and_retention.sql` | 修复 revenue/retention 计算 |
| `20260406040000_extract_coin_value_constant.sql` | 提取 get_coin_value_tzs() 函数 |
| `20260505120000_submit_collection_v2_tx_conflict_signal.sql` | 增加 tx_conflict 信号 |
| `20260505200000_fix_submit_collection_v2_created_at.sql` | 修复 created_at 列不存在 |
| `20260509043000_add_owner_retention_mode_to_transactions.sql` | **当前最新**: 增加 isOwnerRetaining 列 |

---

## 7. 离线队列: offlineQueue.ts

### 文件: `/root/bht/offlineQueue.ts`

### 7.1 存储架构

```
主存储: IndexedDB (bahati_offline_db v2, pending_transactions store)
降级存储: localStorage (bahati_offline_queue)
终极降级: 内存 Map (memoryQueueCache)
```

### 7.2 QueueMeta 元数据 (行 122-151)

```typescript
interface QueueMeta {
  operationId: string;       // 唯一操作ID (idempotency key)
  entityVersion: number;     // 单调版本号
  _queuedAt: string;         // ISO时间戳
  retryCount: number;        // 重试次数 (0..MAX_RETRIES=5)
  lastError?: string;        // 上次错误信息
  nextRetryAt?: string;      // 下次允许重试的时间 (指数退避)
  rawInput?: CollectionSubmissionInput;  // ★ 原始输入, 用于服务端重放
  lastErrorCategory?: 'transient' | 'permanent';
  photoPending?: boolean;    // 证据照片尚未持久化
  lastEvidenceError?: string;
}
```

### 7.3 enqueueTransaction (行 333-367)

```
enqueueTransaction(tx, rawInput?) (行 333)
  │
  ├─ 行 337: prepared = prepareCollectionEvidenceForQueue(tx, rawInput)
  │    │  (行 266-322)
  │    │  如果 rawInput.photoUrl 是 data:image base64 → 尝试 persistEvidencePhotoUrl
  │    │    成功 → 将公开URL写入 rawInput.photoUrl + tx.photoUrl
  │    │    失败 → 设置 photoPending=true, lastEvidenceError
  │    │  如果不是base64 → 保留原值
  │    │
  │    ⚠ 入队时照片上传是可选的 (required: false),
  │       与 submitCollectionV2 中的 required: true 形成对比
  │
  ├─ 行 341-349: 构建 QueueMeta
  │    operationId = generateOperationId()  (行 259-263: op-{timestamp}-{random})
  │    entityVersion = Date.now()
  │    retryCount = 0
  │    rawInput = storedRawInput
  │
  ├─ 行 351-359: try IDB
  │    openDB() → store.put({...storedTx, isSynced: false, ...meta})
  │    键路径: 'id' (tx.id)
  │    索引: driverId, timestamp, isSynced, retryCount
  │
  └─ 行 360-366: catch → localStorage 降级
       readLocalQueue → filter+push → writeLocalQueue
```

### 7.4 flushQueue (行 773-829)

```
flushQueue(supabaseClient, options?) (行 773)
  │
  ├─ 行 778-779: 并发保护
  │    if (_isFlushing) return 0;  (全局互斥锁)
  │    _isFlushing = true;
  │
  ├─ 行 784: 全局超时: QUEUE_FLUSH_TIMEOUT_MS = 120_000 (2分钟)
  │
  ├─ 行 788: pending = getPendingTransactions()
  │    │  从 IDB 读全部, filter(!isSynced)
  │    └─ 降级: readLocalQueue().filter(!isSynced)
  │
  ├─ 行 794-824: for each tx in pending
  │    │
  │    ├─ 行 796-803: 全局超时检查
  │    ├─ 行 808-810: 跳过未到重试时间的条目 (exponential backoff)
  │    ├─ 行 813-816: 跳过死信条目 (retryCount >= MAX_RETRIES)
  │    │
  │    └─ 行 818: outcome = flushSingleItem(entry, supabaseClient, options)
  │         → 行 819-822: 成功则 flushed++
  │
  └─ 行 826-828: finally { _isFlushing = false }

flushSingleItem (行 614-740) — 单条目重放
  │
  ├─ 行 621-694: ★ 集合类条目 (entry.rawInput 存在) ★
  │    │
  │    ├─ 行 622-629: 检查 submitCollection 回调
  │    │    无 → recordRetryFailure(permanent) → 'failed'
  │    │
  │    ├─ 行 631-635: 证据照片持久化
  │    │    persistQueuedEvidencePhoto(entry)
  │    │    如果入队时照片未持久化 (photoPending), 现在强制重试
  │    │    失败 → recordRetryFailure → 'failed'
  │    │
  │    ├─ 行 637-655: 构建 replayInput + 90s超时
  │    │    replayInput = {...entry.rawInput, photoUrl: 持久化的URL}
  │    │    Promise.race([submitCollection(replayInput), timeout(90_000)])
  │    │    → 实际调用 submitCollectionV2()
  │    │
  │    ├─ 行 656-673: result.success →
  │    │    审计'queue_flush_success' → markSynced(id, result.transaction)
  │    │    → 返回 'flushed'
  │    │
  │    └─ 行 676-693: result 失败 →
  │         kind='config' → 'permanent'
  │         其他 → classifyError(error) (行 840-887)
  │         recordRetryFailure → 返回 'failed'
  │
  ├─ 行 696-708: reset_request 类型 → submitResetRequest
  ├─ 行 710-722: payout_request 类型 → submitPayoutRequest
  │
  └─ 行 725-734: 旧版条目 (无rawInput) → 直接 upsert 降级路径

markSynced (行 443-470)
  │ 将条目标记为 isSynced=true
  │ 如果提供了 authoritativeData (服务器返回的交易),
  │ 会用服务器值覆盖本地计算的财务字段
  │ IDB 操作失败 → localStorage 降级

recordRetryFailure (行 904-976)
  │ permanent → retryCount = MAX_RETRIES (立即死信)
  │ transient → retryCount + 1
  │ 指数退避: BASE_BACKOFF_MS * 2^(min(retryCount-1, 4))
  │   即 2s → 4s → 8s → 16s → 32s
  │ retryCount >= MAX_RETRIES → Sentry 上报 'offline_queue_dead_lettered'
```

### 7.5 错误分类 (行 840-887)

```typescript
// transient (可重试):
'timeout', 'network error', 'fetch failed', 'connection reset',
'econnrefused', 'econnreset', 'etimedout', 'dns', 'socket hang up',
'500', '502', '503', '504', 'request aborted', 'offline',
'evidence photo upload failed'

// permanent (不可重试, 立即死信):
'missing required collection evidence photourl', 'forbidden',
'not found', 'invalid', 'permission denied', 'unauthorized',
'violates', 'bad request', 'validation error', 'schema mismatch',
'duplicate key', 'constraint', 'supabase not configured',
'evidence photo persistence failed'

// 特殊: 'authentication required' 被排除在 permanent 之外,
// 因为 JWT 过期是可恢复的 (用户重新登录后可重试)
```

---

## 8. 同步触发链路

### 文件: `/root/bht/driver/hooks/useDriverSubmissionCompletion.ts`

```
useDriverSubmissionCompletion (行 28-120)
  │ 在 DriverCollectionFlow → SubmitReview 成功后调用
  │
  ├─ 行 44-68: reset_request / payout_request → submitTransaction.mutateAsync
  │
  └─ 行 70-110: collection 提交后处理
       │
       ├─ 行 70-76: 更新 locations 缓存 (lastScore)
       ├─ 行 89-92: 更新 transactions 缓存 (React Query)
       ├─ 行 94-98: localDB.set (IDB 持久化缓存)
       │
       └─ 行 100-110: if (isOnline && source === 'server')
            │
            └─ getQueueHealthSummary()
                 │  检查队列中 pending/retryWaiting/deadLetter 数量
                 │
                 └─ if (pending>0 || retryWaiting>0 || deadLetter>0)
                      → syncOfflineData.mutate()
                      → 触发 flushQueue()
```

### 定时同步: `/root/bht/hooks/useOfflineSyncLoop.ts`

- 在线时每60秒自动触发 flushQueue
- 在线状态变为true时立即触发
- Service Worker background sync 作为补充

---

## 9. 边界条件与易错点

### 9.1 分数边界

| 条件 | 位置 | 行为 |
|------|------|------|
| 分数为空或非数字 | QuickCollect: 行 168, Orchestrator: 行 191-204 | 抛异常 "Invalid current score" |
| 分数 ≤ lastScore | QuickCollect: 行 174-214 | 前端拦截，设 receipt 为 failed，不提交 |
| 分数 < lastScore | SubmitReview: 行 291-303 | 前端拦截并提示提交重置申请 |
| SQL层 lastScore为NULL | SQL: 行 134-138 | CASE处理，lastScore IS NULL时任何值都能写入 |
| 分数差为0 | SQL: 行 88 | v_diff = GREATEST(0, ...) = 0 → revenue = 0 |

### 9.2 证据（照片）边界

| 条件 | 位置 | 行为 |
|------|------|------|
| 无照片 | CollectionSubmissionService: 行 122-124 | kind='evidence' → orchestrator抛异常，不下沉离线 |
| 照片为data:image base64 | Service: 行 130-141 | persistEvidencePhotoUrl → 转公开URL |
| data:image 持久化失败 | Service: 行 138-141 | kind='evidence' → 抛异常 |
| 离线入队时 data:image 持久化失败 | offlineQueue: 行 302-310 | 设置 photoPending=true，允许继续入队 |
| flushQueue重放时 photoPending=true | offlineQueue: 行 631-635 | 强制重试证据上传，失败则 dead-letter |

### 9.3 网络边界

| 条件 | 位置 | 行为 |
|------|------|------|
| supabase 不可用 | Service: 行 118-120 | kind='config' → 下沉离线队列 |
| RPC 30s超时 | Service: 行 172 | AbortSignal.timeout → kind='network' |
| RPC 抛异常 | Service: 行 175-178 | classifyRpcException → 'network'/'rpc' |
| 在线但RPC失败 (非evidence) | Orchestrator: 行 336 | fallbackToOffline |
| flushQueue 90s单条目超时 | offlineQueue: 行 644-653 | 作为transient错误，进入重试队列 |
| flushQueue 120s全局超时 | offlineQueue: 行 796-803 | 停止处理，剩余条目等下次 |

### 9.4 幂等性边界

| 条件 | 位置 | 行为 |
|------|------|------|
| 相同 txId 重复提交 | SQL: 行 128 ON CONFLICT(id) DO NOTHING | 不插入，ROW_COUNT=0 |
| tx_conflict=true | Service: 行 203-209 | {success:false, kind:'rpc'} |
| flushQueue 重放 tx_conflict | offlineQueue: 行 758-760 | 视为成功同步，markSynced |

### 9.5 离线队列边界

| 条件 | 位置 | 行为 |
|------|------|------|
| IDB 不可用 | offlineQueue: 行 360-366 | 降级到 localStorage/memory |
| localStorage 不可用 | offlineQueue: 行 67-79, 179-191 | 降级到内存 Map |
| 并发 flushQueue 调用 | offlineQueue: 行 778-779 | _isFlushing 互斥锁 → 返回0 |
| retryCount >= 5 | offlineQueue: 行 814-816, 894-896 | 跳过，进入死信队列 |
| permanent 错误 | offlineQueue: 行 894-896 | 直接设 retryCount=MAX_RETRIES |
| flushQueue 回调缺失(无submitCollection) | offlineQueue: 行 623-629 | permanent错误，死信 |

### 9.6 数据一致性

- **乐观UI vs 服务端权威**: 本地计算的财务值在离线路径中使用，flushQueue 重放时由服务器 `submit_collection_v2` 重新计算并覆盖（通过 markSynced 的 authoritativeData）。
- **位置 lastScore 更新**: 仅当交易新插入（非冲突）时更新。SQL层有保护：如果 currentScore < lastScore 则不更新 lastScore。
- **dividendBalance 累加**: 仅在 isOwnerRetaining=true 时累加 ownerRetention。

---

## 10. 修改时需要关注的联动文件列表

修改收款提交流程时，以下文件可能需要同步调整：

### 核心流（任何改动都会影响）
| 文件 | 说明 |
|------|------|
| `/root/bht/services/collectionSubmissionOrchestrator.ts` | 编排决策中心，在线/离线路径选择 |
| `/root/bht/services/collectionSubmissionService.ts` | RPC调用、证据上传、结果标准化 |
| `/root/bht/offlineQueue.ts` | IDB存储、入队、flushQueue重放、死信管理 |

### 入口层
| 文件 | 说明 |
|------|------|
| `/root/bht/driver/components/QuickCollect.tsx` | 快速收入口 |
| `/root/bht/driver/components/SubmitReview.tsx` | 向导收确认步骤 |
| `/root/bht/driver/pages/DriverCollectionFlow.tsx` | 向导收主流程 |

### 状态与钩子
| 文件 | 说明 |
|------|------|
| `/root/bht/hooks/useCollectionSubmission.ts` | 提交状态机 |
| `/root/bht/driver/hooks/useDriverSubmissionCompletion.ts` | 提交后缓存更新 + 同步触发 |
| `/root/bht/hooks/useOfflineSyncLoop.ts` | 定时同步触发 |

### 后端 SQL（修改参数或计算逻辑时）
| 文件 | 说明 |
|------|------|
| `/root/bht/supabase/schema.sql` (行 1719-1937) | 主Schema中的定义 |
| `/root/bht/supabase/migrations/20260509043000_...sql` | 最新迁移（isOwnerRetaining） |

### 辅助服务
| 文件 | 说明 |
|------|------|
| `/root/bht/services/collectionSubmissionAudit.ts` | 提交审计日志 |
| `/root/bht/services/evidenceStorage.ts` | 证据照片持久化 |
| `/root/bht/services/financeCalculator.ts` | 本地财务计算（预览用） |
| `/root/bht/utils/transactionBuilder.ts` | createCollectionTransaction 构建器 |
| `/root/bht/services/driverFlowTelemetry.ts` | 遥测事件记录 |

### 测试文件（修改后必须验证）
| 文件 | 说明 |
|------|------|
| `/root/bht/__tests__/collectionSubmissionService.test.ts` | RPC调用单元测试 |
| `/root/bht/__tests__/collectionSubmissionOrchestrator.test.ts` | 编排器单元测试 |
| `/root/bht/__tests__/offlineQueue.test.ts` | 离线队列单元测试 |
| `/root/bht/__tests__/offlineQueueReplay.test.ts` | 队列重放测试 |
| `/root/bht/__tests__/useCollectionSubmission.test.ts` | 状态机测试 |
| `/root/bht/__tests__/integration/collectionSubmissionFlow.test.ts` | 集成测试 |
| `/root/bht/e2e/driver-collection-flow.spec.ts` | E2E测试 |

### 上下文/依赖注入
| 文件 | 说明 |
|------|------|
| `/root/bht/contexts/MutationContext.tsx` | syncOfflineData / submitTransaction 提供 |
| `/root/bht/hooks/useSupabaseMutations.ts` | flushQueue 实际调用处 |
| `/root/bht/supabaseClient.ts` | supabase 客户端实例 |

---

## 11. 数据流总结

```
┌──────────────────────────────────────────────────────────────┐
│ 参数流转                                        │
│                                                              │
│ UI表单值 (string)                                            │
│   └─→ calculateCollectionFinanceLocal() → 本地财务预览       │
│                                                              │
│ OrchestrateCollectionSubmissionInput (混合类型)               │
│   └─→ buildCollectionSubmissionInput()                       │
│       └─→ CollectionSubmissionInput (标准化数值)              │
│                                                              │
│ 在线路径:                                                     │
│   CollectionSubmissionInput                                  │
│     └─→ persistEvidencePhotoUrl (data:image → URL)           │
│       └─→ supabase.rpc('submit_collection_v2', {...params})   │
│         └─→ SQL: 财务重算 → INSERT → UPDATE locations        │
│           └─→ JSON → CollectionSubmissionService: 标准化      │
│             └─→ Transaction (isSynced=true, 服务端财务值)     │
│                                                              │
│ 离线路径:                                                     │
│   CollectionSubmissionInput                                  │
│     └─→ createCollectionTransaction (本地计算财务)            │
│       └─→ enqueueTransaction(tx, rawInput)                   │
│         └─→ IDB.put({...tx, isSynced:false, ...QueueMeta})   │
│                                                              │
│ 同步重放:                                                     │
│   flushQueue() → getPendingTransactions()                    │
│     └─→ flushSingleItem(entry)                               │
│       └─→ if entry.rawInput:                                 │
│           ├─→ persistQueuedEvidencePhoto (入队时未持久化的)    │
│           └─→ submitCollectionV2(entry.rawInput)             │
│             └─→ (同上在线路径, 服务端权威计算)                 │
│               └─→ markSynced(id, serverResult)               │
│                 └─→ IDB.put({...entry, isSynced:true, ...serverResult})
│       └─→ else: upsert 降级                                   │
│                                                              │
│ 提交后清理:                                                   │
│   Transaction (isSynced=true)                                │
│     └─→ useDriverSubmissionCompletion                        │
│       ├─→ queryClient.setQueryData (React Query 缓存)        │
│       ├─→ localDB.set (IDB 本地缓存)                          │
│       └─→ getQueueHealthSummary → syncOfflineData.mutate()   │
│           └─→ flushQueue (如果队列还有待处理)                  │
└──────────────────────────────────────────────────────────────┘
```
