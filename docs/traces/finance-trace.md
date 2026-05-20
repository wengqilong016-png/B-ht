# BHT 财务计算链路深度追踪文档

> 生成日期: 2026-05-10
> 审查范围: 收款财务计算 → 日结 → 分红 → 提现 → 债务管理
> 方法: 静态代码追踪 + SQL 函数审查

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────┐
│ UI 层                                               │
│ SubmitReview.tsx (司机端财务预览)                     │
│ DebtManager.tsx (管理端债务管理)                      │
├─────────────────────────────────────────────────────┤
│ 计算层                                              │
│ financeCalculator.ts                                │
│   ├─ calculateCollectionFinanceLocal()  本地计算     │
│   └─ calculateCollectionFinanceServer() RPC 计算     │
├─────────────────────────────────────────────────────┤
│ SQL RPC 层 (SECURITY DEFINER)                       │
│   calculate_finance_v2     — 纯计算预览 (STABLE)      │
│   submit_collection_v2     — 收款提交+分红更新        │
│   create_daily_settlement_v1 — 日结创建              │
│   review_daily_settlement_v1  — 日结审核+余额更新     │
│   approve_payout_request_v1   — 提现审批+余额扣减     │
│   approve_reset_request_v1    — 重置审批+lastScore归零│
└─────────────────────────────────────────────────────┘
```

---

## 2. 核心计算公式

### 2.1 统一公式

```
diff              = MAX(0, currentScore - lastScore)
revenue           = diff × get_coin_value_tzs()  (~200 TZS，动态读取)
commission        = FLOOR(revenue × commissionRate)
finalRetention    = ownerRetention ?? commission   (前端)
                  = GREATEST(0, COALESCE(p_owner_retention, commission))  (SQL)
available         = MAX(0, revenue - finalRetention - |expenses| - |tip|)
startupDebtDeduction = MIN(request, remainingStartupDebt, available)
netPayable        = MAX(0, available + startupDebtDeduction)
```

**注意：netPayable = available + startupDebtDeduction（加法，非减法）。**
逻辑：startupDebtDeduction 是司机的债务抵扣，会减少 debt 但增加司机实得现金。所有当前生效的代码（前端 `financeCalculator.ts`、最新 `submit_collection_v2`（`20260509043000`）、最新 `calculate_finance_v2`（`20260406040000`））均使用加法。过时的 4月4日版本（`20260404232000`）使用减法，已被覆盖。

**关键差异：**
- 前端: `startupDebtDeduction` 直接由 `parseAmount` 解析
- SQL: `startupDebtDeduction` 被 `LEAST(deduction, remainingStartupDebt, available)` 三重限制
- 前端: `finalRetention` 用 `ownerRetention ?? commission`（nullish）
- SQL: `finalRetention` 用 `GREATEST(0, COALESCE(...))`（非负保护）

### 2.2 计算入口

| 文件 | 函数 | 触发时机 |
|------|------|---------|
| `financeCalculator.ts:101` | `calculateCollectionFinanceLocal()` | 离线 / 本地 fallback |
| `financeCalculator.ts:135` | `calculateCollectionFinancePreview()` | 在线预览入口 |
| `supabase/...calculate_finance_v2.sql` | `calculate_finance_v2()` | 服务端预览 RPC |

### 2.3 前端预览逻辑

```typescript
// financeCalculator.ts (实际代码)
export async function calculateCollectionFinancePreview(
  input: CollectionFinanceInput
): Promise<FinanceCalculationResult> {
  // 1. 先计算本地 fallback
  const localResult = calculateCollectionFinanceLocal(input);
  
  // 2. 尝试 RPC → 失败就返回 fallback
  try {
    const { data, error } = await supabase.rpc('calculate_finance_v2', {...});
    if (error || !data) return localResult;
    return buildServerFinanceResult(data, localResult);
  } catch {
    return localResult;  // 网络不可达 → 静默 fallback
  }
}
```

不通过 `isOnline` 显式分支，而是靠网络是否可达自动选择。

---

## 3. submit_collection_v2 中的财务逻辑

详见 `/root/bht/docs/collection-submit-trace.md`。

**SQL 函数最新位置:** `supabase/migrations/20260509043000_add_owner_retention_mode_to_transactions.sql`
（4月4日版本 `20260404232000` 已被 5月9日版本覆盖）

**关键财务操作：**

```sql
-- 写入 transactions 表（注意: debtDeduction 列硬编码为 0，实际值在 startupDebtDeduction）
INSERT INTO public.transactions (
  revenue, commission, "ownerRetention",
  "debtDeduction", "startupDebtDeduction",
  expenses, "netPayable", ...
) VALUES (
  v_revenue, v_commission, v_final_retention,
  0, v_startup_debt_deduction,   -- debtDeduction=0, startupDebtDeduction=实际值
  ...
)

-- 更新 locations 表（注意 COALESCE 防止 NULL 传播）
UPDATE public.locations SET
  "lastScore" = CASE WHEN ... THEN p_current_score ELSE "lastScore" END,
  "remainingStartupDebt" = GREATEST(0,
    COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduction
  ),
  "dividendBalance" = CASE
    WHEN p_is_owner_retaining
      THEN COALESCE("dividendBalance", 0) + v_final_retention
    ELSE COALESCE("dividendBalance", 0)
  END
WHERE id = p_location_id;
```

**分红余额 (dividendBalance) 的存储位置：`public.locations.dividendBalance`**

---

## 4. 日结 (Daily Settlement)

### 4.1 创建日结

**SQL:** `create_daily_settlement_v1(p_id, p_date, p_driver_id, ...)`
**文件:** `supabase/migrations/20260404020000_settlement_actions.sql:1-122`

**调用链：**
```
UI (settlement 创建页)
  → useSupabaseMutations.createSettlement
    → supabase.rpc('create_daily_settlement_v1', {...})
```

**关键校验（两级）：**
- 同一 `p_id` 已存在 → 静默返回已有记录（幂等），不抛错
- 同一 driverId + 同日期 + status IN ('pending','confirmed') → **抛出异常**（ERRCODE=23505），不静默
- 新结算状态为 `'pending'`

### 4.2 审核日结

**SQL:** `review_daily_settlement_v1(p_settlement_id, p_status, p_note)`
**文件:** `supabase/migrations/20260404020000_settlement_actions.sql:124-205`

**只有 admin 可以审核。**

**confirmed 时的副作用：**
```sql
UPDATE public.drivers
   SET "dailyFloatingCoins" = COALESCE(v_settlement."actualCoins", 0)
 WHERE id = v_settlement."driverId";
```

→ 日结确认后，司机的随身硬币数自动更新为实际硬币数。

**前端 mutation（useSupabaseMutations.ts）中的 `reviewSettlement`：**
- `onMutate`: 乐观更新 `daily_settlements` cache
- `mutationFn`: `supabase.rpc('review_daily_settlement_v1', {...})`
- `onSuccess`: **额外更新** drivers 表的 `dailyFloatingCoins`（管理端），更新 `transactions` 的 `paymentStatus`
- 这是唯一在 `onSuccess` 中做额外更新的 mutation

---

## 5. 分红与提现 (Dividend & Payout)

### 5.1 分红余额增（submit_collection_v2）

每次收款提交（`isOwnerRetaining=true`）时：
```
locations.dividendBalance += finalRetention
```

### 5.2 提现审批

**SQL:** `approve_payout_request_v1(p_tx_id, p_approve)`
**文件:** `supabase/migrations/20260404010000_admin_approval_actions.sql:80-154`

**审批通过时的扣减：**
```sql
UPDATE public.locations
   SET "dividendBalance" = COALESCE("dividendBalance", 0) - COALESCE(v_tx."payoutAmount", 0)
 WHERE id = v_tx."locationId";
```

**余额不足：**
```sql
IF p_approve AND COALESCE(v_location."dividendBalance", 0) < COALESCE(v_tx."payoutAmount", 0) THEN
  RAISE EXCEPTION 'Insufficient dividend balance for payout approval'
    USING ERRCODE = '22023';
END IF;
```

### 5.3 关键数据字段

| 字段 | 表 | 含义 |
|------|-----|------|
| `transactions."ownerRetention"` | transactions | 本次分红金额（包含直接支付和留存） |
| `transactions."isOwnerRetaining"` | transactions | TRUE=留存, FALSE=现场支付, NULL=历史 |
| `locations."dividendBalance"` | locations | 当前留存余额 |
| `transactions."payoutAmount"` | transactions | 提现金额 |

**⚠️ 不要从 `transactions.ownerRetention` 汇总留存余额。用 `locations.dividendBalance`。**

---

## 6. 债务管理

### 6.1 债务类型

| 类型 | 存储 | 来源 |
|------|------|------|
| 初始欠款 (initialDebt) | `drivers.initialDebt` | 管理端创建司机时设置 |
| 当前欠款 (remainingDebt) | `drivers.remainingDebt` | 管理端编辑 / 收款扣减 |
| 机器启动债 (remainingStartupDebt) | `locations.remainingStartupDebt` | 机器注册时设置 |

### 6.2 扣减路径

```
每次 collection 提交:
  locations.remainingStartupDebt -= startupDebtDeduction   (SQL)
  drivers.remainingDebt -= startupDebtDeduction             (前端 onUpdateDrivers)
```

限制规则:
- `startupDebtDeduction` ≤ `remainingStartupDebt` (SQL 三重 LEAST)
- `startupDebtDeduction` ≤ `available` (防止扣成负数)

---

## 7. 机器重置 (Reset)

**SQL:** `approve_reset_request_v1(p_tx_id, p_approve)`
**文件:** `supabase/migrations/20260404010000_admin_approval_actions.sql:11-78`

**审批通过：** `locations.lastScore = 0`, `locations.resetLocked = FALSE`
**审批拒绝：** `locations.resetLocked = FALSE`（仅解锁）

---

## 8. 边界条件

| 场景 | 处理 |
|------|------|
| 分数未增长 (diff=0) | revenue=0, 零收入提交（zero_revenue 遥测） |
| 负数 expenses/tip | 取绝对值 (ABS) |
| ownerRetention 未填 | 默认 = commission |
| 债务余额不足 | `startupDebtDeduction = MIN(request, balance, available)` |
| netPayable 负数 | `GREATEST(0, ...)` 钳制为 0 |
| 分红余额不足 | 提现审批抛异常 `ERRCODE=22023` |
| 重复日结 | 返回已存在结算，不抛错 |

---

## 9. 前端财务相关组件

| 文件 | 职责 |
|------|------|
| `driver/components/SubmitReview.tsx` | 提交前的财务预览（红色显示负数） |
| `components/DebtManager.tsx` | 管理端债务管理 UI |
| `components/driver-management/DriverSalaryModal.tsx` | 月薪计算弹窗 |
| `services/financeCalculator.ts` | 核心计算（本地+RPC） |

---

## 10. 修改联动文件

修改财务计算逻辑时，必须同步检查：

| 修改位置 | 联动文件 |
|----------|---------|
| `financeCalculator.ts` | `SubmitReview.tsx`（预览显示）、`DriverSalaryModal.tsx`（月薪） |
| `calculate_finance_v2` SQL | `submit_collection_v2` SQL（内部有重复公式） |
| `submit_collection_v2` SQL | `collectionSubmissionOrchestrator.ts`（buildCollectionSubmissionInput 参数映射） |
| `approve_payout_request_v1` SQL | `useSupabaseMutations.ts`（前端 mutation 的 onSuccess 逻辑） |
| `review_daily_settlement_v1` SQL | `useSupabaseMutations.ts`（onSuccess 更新 drivers 的 dailyFloatingCoins） |
| COIN_VALUE_TZS (get_coin_value_tzs()) | 所有 SQL 函数 + `CONSTANTS.ts` + 前端计算 |
| commissionRate 逻辑 | `locations` 表 + `drivers` 表 + RPC + 前端 |

---

## 11. 相关迁移文件索引

| 迁移文件 | 内容 |
|----------|------|
| `20260424043000_fix_merchant_debt_repayment_cash_direction.sql` | 最新 finance 计算（9参数含startupDebt） |
| `20260325156000_submit_collection_v2.sql` | 初始 submit_collection_v2 |
| `20260404010000_admin_approval_actions.sql` | reset + payout 审批 |
| `20260404020000_settlement_actions.sql` | 日结创建+审核 |
| `20260404232000_owner_share_retention_logic.sql` | owner retention 逻辑 + debtDeduction（已被后续版本覆盖） |
| `20260406020000_hotfix_calculate_finance_drop_integer_overload.sql` | 移除旧版 integer 重载 |
| `20260406030000_fix_submit_collection_revenue_and_retention.sql` | 修复 revenue/retention 计算 |
| `20260406040000_extract_coin_value_constant.sql` | **引入 `get_coin_value_tzs()` 动态读取** |
| `20260505120000_submit_collection_v2_tx_conflict_signal.sql` | 引入 `tx_conflict` 幂等信号 |
| `20260505200000_fix_submit_collection_v2_created_at.sql` | 修复 created_at 字段 |
| `20260509043000_add_owner_retention_mode_to_transactions.sql` | **当前最新 submit_collection_v2**（isOwnerRetaining、get_coin_value_tzs()、tx_conflict） |
| `20240104000000_phase1_complete_schema.sql` | 完整 schema（表定义） |
| `20240105000000_phase2_ledger_reconciliation.sql` | 账本对账 |
