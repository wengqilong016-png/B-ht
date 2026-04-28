# Bahati Jackpots — 问题研究报告

> 生成日期: 2026-04-28
> 项目版本: 1.0.12
> 审查范围: 核心财务计算、离线同步、数据库 RLS、TypeScript 类型安全
> 方法: 静态代码审查 + schema 审计（无运行时测试）

---

## 🔴 高危问题

### 问题 1: 本地与服务器财务计算不一致 — 负数 expenses/tip 处理

**文件**: `services/financeCalculator.ts` 第 114 行 vs `supabase/schema.sql` 第 1669、1773 行

**严重级别**: 🔴 高危

**问题描述**:

服务器端 `calculate_finance_v2` 和 `submit_collection_v2` 使用了 `ABS()` 保护：

```sql
-- schema.sql line 1669, 1773
v_revenue - v_final_retention - ABS(COALESCE(p_expenses, 0)) - ABS(COALESCE(p_tip, 0))
```

但本地回退计算器 `calculateCollectionFinanceLocal` 没有：

```typescript
// financeCalculator.ts line 114
const availableAfterCoreDeductions = Math.max(0, revenue - finalRetention - normalized.expenses - normalized.tip);
```

如果 expenses 或 tip 为负数（例如输入错误、恶意输入），本地计算的 `netPayable` 会比服务器高（负数费用被当作收入），因为 `revenue - (-100) = revenue + 100`。服务器会用 `ABS()` 取绝对值，导致两端结果不同。

**影响范围**: 

- 离线模式下，司机看到的财务预览基于本地计算，可能与服务器实际值不一致
- 离线队列 replay 时，服务器会用 `submit_collection_v2` 重新计算（权威值），所以最终数据以服务器为准
- 但 `createCollectionTransaction` 使用的是本地计算结果写入 IndexedDB，导致离线显示金额错误

**修复建议**:

```typescript
// financeCalculator.ts line 114
const availableAfterCoreDeductions = Math.max(
  0,
  revenue - finalRetention - Math.abs(normalized.expenses) - Math.abs(normalized.tip)
);
```

同时在 `normalizeFinanceInput` 中添加费用/tip 的负值检测警告。

---

### 问题 2: submit_collection_v2 对 locations 行缺少 FOR UPDATE 锁 — 并发竞态

**文件**: `supabase/schema.sql` 第 1753-1829 行

**严重级别**: 🔴 高危

**问题描述**:

`submit_collection_v2` 在第 1753 行通过 `SELECT ... INTO v_location` 读取 `lastScore`、`remainingStartupDebt` 等值时，没有使用 `FOR UPDATE`。而在第 1814-1829 行的 UPDATE 中会修改这些值：

```sql
-- 读取 (无锁)
SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt" INTO v_location
FROM public.locations WHERE id = p_location_id;

-- 更新 (无锁保护)
UPDATE public.locations
SET "lastScore" = /* ... */,
    "remainingStartupDebt" = GREATEST(0, COALESCE("remainingStartupDebt", 0) - v_startup_debt_deduction),
    "dividendBalance" = /* ... */
WHERE id = p_location_id;
```

当同一位置有两名司机快速提交收款时（或一名司机 + 一次离线 replay 并发），两个事务会读取相同的 `remainingStartupDebt`，各自计算 `startupDebtDeduction`，然后各自更新。第二次更新会覆盖第一次的扣减，导致重复扣减或扣减丢失。

**影响范围**:
- 多司机共用同一位置时（换班场景）
- 离线事务批量 replay 时
- `remainingStartupDebt` 可能被错误地减到负数（已被 GREATEST(0,...) 保护），但实际扣减总额可能小于预期
- `lastScore` 可能被覆盖为更旧的值（虽然有 `p_current_score >= "lastScore"` 的保护）

**修复建议**:

```sql
-- line 1753, 添加 FOR UPDATE 锁定该行
SELECT id, name, "lastScore", "commissionRate", "machineId", "remainingStartupDebt" INTO v_location
FROM public.locations WHERE id = p_location_id
FOR UPDATE;
```

对比：`approve_reset_request_v1` (line 700) 和 `approve_payout_request_v1` (line 771) 已正确使用 `FOR UPDATE`。

---

### 问题 3: createBaseTransaction 中 currentScore 初始化值与语义不符

**文件**: `utils/transactionBuilder.ts` 第 30-31 行

**严重级别**: 🔴 高危

**问题描述**:

```typescript
function createBaseTransaction(location, driver, gpsCoords): BaseTransactionFields {
  return {
    // ...
    previousScore: location.lastScore,
    currentScore: location.lastScore,   // ← bug: 初始化为 lastScore
    gps: gpsCoords || { lat: 0, lng: 0 },
    isSynced: false,
  };
}
```

`createBaseTransaction` 将 `currentScore` 初始化为 `location.lastScore`（与 previousScore 相同）。

- `createCollectionTransaction` 在第 133 行通过 spread 覆盖了 `currentScore` — 正确
- `createPayoutRequestTransaction` (line 57-75) 和 `createResetRequestTransaction` (line 80-98) **没有覆盖** currentScore

这意味着 payout request 和 reset request 的交易记录的 `currentScore = previousScore = location.lastScore`。虽然这对非收款的请求类型可能"合理"（没有新的读数），但在数据库 schema 中 `currentScore` 和 `previousScore` 被定义为 `BIGINT`，下游报表如果盲目计算 `diff = currentScore - previousScore` 会得到 0，掩盖了真实的业务含义差异。

对于 reset request，schema 中的 `create_reset_request_v1` (line 985) 正确地设置两者都为 lastScore。但 `createPayoutRequestTransaction` 创建的离线交易在 replay 时会携带这个初始值。

**影响范围**:
- 离线创建的 payout/reset 请求的 currentScore 永远是 lastScore，可能导致查询分析时误导
- 如果下游（报表/AI）依赖 currentScore 做判断，可能得到错误结果

**修复建议**:

方案 A — 让 `createBaseTransaction` 将 currentScore 设为 null/undefined：
```typescript
currentScore: undefined as unknown as number,  // 由调用方提供
```

方案 B — 在 `createPayoutRequestTransaction` 和 `createResetRequestTransaction` 中显式设置有意义的值（如 null 或 0），并在 Type 层面标记非收款交易不需要 score 字段。

---

## 🟡 中危问题

### 问题 4: ~~buildCollectionSubmissionInput 强行置零 expenses~~ → 已确认：设计正确 ✅

**文件**: `services/collectionSubmissionOrchestrator.ts` 第 180 行

**严重级别**: ~~🟡 中危~~ → 🟢 非问题（已证实为设计特性）

**调查结论** (2026-04-28):
expenses=0 是**有意设计**，不是 bug。费用通过独立 `type='expense'` 交易记录
（`createExpenseTransaction()` 在 `DriverCollectionFlow.tsx` line 298 被调用）。
这种设计优势：
- 收款交易财务计算干净，不受费用干扰
- 费用通过独立交易记录可追踪（有 expenseStatus/approvalStatus）
- 日结/月薪报表分别处理两类交易

已在 `buildCollectionSubmissionInput` 添加设计说明注释。

---

### 问题 5: drivers 表列级安全与 SECURITY DEFINER 潜在冲突

**文件**: `supabase/schema.sql` 第 2214-2225 行

**严重级别**: 🟡 中危

**问题描述**:

```sql
-- 列级权限撤销
REVOKE UPDATE ("baseSalary", "commissionRate", "initialDebt", "remainingDebt")
    ON public.drivers FROM authenticated;
```

列级 `REVOKE UPDATE` 只影响普通 SQL 操作，不影响 SECURITY DEFINER 函数（以 postgres 超级用户身份运行）。目前项目中没有 SECURITY DEFINER 函数更新驱动的这些字段，但随着系统演进：

1. 如果未来添加 SECURITY DEFINER 函数修改 drivers 敏感字段，RLS 和列级权限将被绕过
2. `apply_location_change_request` 函数可以通过 jsonb patch 修改 location 的 `commissionRate` 和 `remainingStartupDebt`（Security Definer），这是正确的设计，但对 drivers 表没有类似保护函数

**影响范围**: 
- 当前无直接影响
- 属于架构设计层面的潜在风险
- 未来增加 SECURITY DEFINER 函数时需额外注意

**修复建议**:

在 schema.sql 顶部添加注释说明此安全假设，或在新增 SECURITY DEFINER 函数时增加审计检查。更好的做法是建立敏感字段的 UPDATE TRIGGER 记录所有变更（即使来自 SECURITY DEFINER 函数）。

---

### 问题 6: offlineQueue flushQueue 超时后未重置 _isFlushing

**文件**: `offlineQueue.ts` 第 636-657、800-801 行

**严重级别**: 🟡 中危

**问题描述**:

`flushQueue` 有 120 秒超时保护（line 638），超时后会 `break` 退出循环。`finally` 块（line 800-801）将 `_isFlushing = false`。所以这部分的 finally 确保锁会被释放。

但实际上仔细看代码，超时后有 `break`，然后 `return flushed`（line 799），然后 `finally` 会执行。这看起来是正确的。

**然而**，如果在超时期间一个 `submitCollection` 调用卡住但不 reject（慢速网络、无响应），整个 `flushQueue` 会被 `break` 打断但那个 pending 的 Promise 仍在后台运行。当它最终 resolve/reject 时，可能已经超过了 120s，此时 `_isFlushing` 可能已经被其他调用设为 true。

**影响范围**:
- 极低概率的并发提交
- 已提交的数据不会因 `_isFlushing` 状态丢失（数据库是权威的）

**修复建议**: 为每个 `submitCollection` 调用添加独立的 AbortController，在超时时取消所有进行中的请求。

---

### 问题 7: RLS — transactions DELETE 策略允许 admin 删除任何交易

**文件**: `supabase/schema.sql` 第 2268-2270 行

**严重级别**: 🟡 中危

**问题描述**:

```sql
CREATE POLICY transactions_delete ON public.transactions FOR DELETE TO authenticated
    USING (public.is_admin());
```

任何 admin 角色用户可以删除任意交易记录，没有审计追踪。对于财务系统，交易记录不应被物理删除，只应标记为已取消/无效。

对比 `review_anomaly_transaction_v1` 和 `review_daily_settlement_v1` 都只 UPDATE status，不 DELETE。

**影响范围**:
- 恶意或误操作的 admin 可以永久删除交易记录
- 无法追溯历史数据
- 日结/月薪报表可能产生不一致结果

**修复建议**:

方案 A — 移除 DELETE 策略，只允许 UPDATE 状态：
```sql
-- 移除 transactions_delete policy
-- 或在 transactions 表添加 deleted_at 软删除列
```

方案 B — 添加 BEFORE DELETE TRIGGER 将删除操作转为软删除并写入 audit_log。

---

### 问题 8: GPS heartbeat 使用火即忘的 Promise 无错误处理

**文件**: `hooks/useOfflineSyncLoop.ts` 第 216-240 行

**严重级别**: 🟡 中危

**问题描述**:

```typescript
supabase!
  .from('drivers')
  .update({ lastActive: new Date().toISOString(), currentGps: newPos })
  .eq('id', activeDriverId)
  .abortSignal(AbortSignal.timeout(5000))
  .then(({ error }) => {
    if (error) {
      console.warn('[GPS] Heartbeat update failed:', error.message);
    }
    // 错误仅 console.warn，没有任何上报
  });
```

GPS 心跳更新失败时只做 `console.warn`，不记录到 Sentry、不重试、不通知用户。在网络不稳定的环境下（坦桑尼亚），心跳可能大量失败但 admin 端看不到司机离线。

此外，`isUpdatingGps` 模块级变量在 GPS 获取失败（line 248）或成功但 update 尚未完成时被释放，可能导致两个 update 同时发出。

**影响范围**:
- Admin 端司机在线状态不准确
- GPS 定位数据丢失
- 不影响核心收款流程

**修复建议**:
- 将 GPS 更新失败上报到 Sentry
- 使用 `void` 替代 `.then()` 避免未处理 Promise 警告
- 考虑在 GPS update 的 `.then` 中释放锁，而不是在 geolocation callback 的 finally 中

---

### 问题 9: approve_expense_request_v1 — 允许非 admin 用户触发但检查不完整

**文件**: `supabase/schema.sql` 第 808-861 行

**严重级别**: 🟡 中危

**问题描述**:

```sql
IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' ...;
END IF;
IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: only admins may approve expense requests' ...;
END IF;
```

这个检查是正确的。但函数没有验证 `p_tx_id` 对应的交易是否确实为 `expense` 类型，只检查了 `expenses > 0` 和 `expenseStatus = 'pending'`。恶意用户可能构造一个非 expense 类型但是 expenses > 0 的交易来触发审批。

**影响范围**:
- 低，因为 expenses > 0 且 expenseStatus = 'pending' 的交易几乎一定是 expense 类型
- 但类型检查缺失属于安全最佳实践的漏洞

**修复建议**:

```sql
IF v_tx.type IS DISTINCT FROM 'expense' THEN
    RAISE EXCEPTION 'Transaction % is not an expense request' ...;
END IF;
```

---

### 问题 10: TypeScript 类型 — QueueMeta 的 Partial 导致运行时 null 访问

**文件**: `offlineQueue.ts` 第 120-148 行

**严重级别**: 🟡 中危

**问题描述**:

`QueueMeta` 中的所有字段都定义为 `Optional` 或非 null 但实际存储时可能缺失。在 `readLocalQueue()` 中（line 150-163），代码从 localStorage JSON.parse 后直接断言为 `Array<Transaction & Partial<QueueMeta>>`。如果 localStorage 中的数据来自旧版本的格式（DB_VERSION 升级前），`retryCount`、`_queuedAt` 等字段可能不存在。

虽然代码多处使用 `?? 0` 或 `?? 0` 做了防御，但以下场景可能漏掉：

- `getReplayIneligibilityReason` (line 1202) — `entry.retryCount ?? 0` — 正确
- `classifyError` (line 814) — 纯字符串操作 — 正确
- `recordRetryFailure` (line 882) — `(item.retryCount ?? 0) + 1` — 正确

经过全面检查，大部分代码确实有防御。但 `getRequiredCollectionReplayPhotoUrl` (line 51-60) 中 `entry.rawInput?.photoUrl` 的 `?.` 操作假设了 Optional Chaining 正常工作，这在 TypeScript 编译到目标较低 ES 版本时可能被 polyfill 出 bug。

**影响范围**:
- 低概率，仅在 localStorage 格式降级时触发
- `retryCount` 在 `enqueueTransaction` 中总是初始化为 0（line 332）

**修复建议**:
- 在 `readLocalQueue` 和 `getAllQueuedTransactions` 的 fallback 路径中增加 schema 验证
- 对旧格式数据提供迁移逻辑

---

### 问题 11: ~~review_daily_settlement_v1 批量更新 transactions 无行锁~~ → 已确认：设计正确 ✅

**文件**: `supabase/schema.sql` 第 1352-1356 行

**严重级别**: ~~🟡 中危~~ → 🟢 非问题（已证实为正确设计）

**调查结论** (2026-04-28):
批量 UPDATE 是正确的设计语义：结算代表对该日该司机**所有**收款的审查确认。
- 结算行自身已经 `FOR UPDATE` (line 1330-1331) 防止并发结算审批
- 新插入的并发交易被包含在 UPDATE 中是正确行为（READ COMMITTED 隔离级别下可见）
- 结算确认后到达的延迟离线同步交易保持 `paymentStatus='pending'`（由 submit_collection_v2 设置），这是正确语义——它们尚未被审查
- 已添加设计注释

---

## 🟢 低危问题

### 问题 12: extractGpsFromExif 依赖全局 EXIF 对象

**文件**: `offlineQueue.ts` 第 1558-1560 行

**严重级别**: 🟢 低危

**问题描述**:

```typescript
const EXIFLib = (window as any).EXIF;
```

依赖全局 `(window as any).EXIF` 存在。如果 EXIF.js 未加载，函数直接返回 null（line 1559）。不会崩溃，但 EXIF GPS 提取功能静默失效。

**修复建议**: 在应用初始化时检查 EXIF.js 是否可用，并在 Sentry 中报告缺失。

---

### 问题 13: ~~日结 expectedTotal 公式未考虑 startupDebtDeduction~~ → 已确认：KNOWLEDGE_BASE 文档有误 ✅

**文件**: `KNOWLEDGE_BASE.md` 第 341-342 行（已修正）；实际代码在 `SettlementTab.tsx` line 123

**严重级别**: ~~🟢 低危~~ → 🟢 已修复（文档错误）

**调查结论** (2026-04-28):
KNOWLEDGE_BASE.md 中的文档公式 `expectedTotal = totalNetPayable + totalExpenses` 是**错误的**。

实际代码（SettlementTab.tsx）：
```
totalNet = sum(netPayable)
expectedTotal = max(0, totalNet - settlementExpenseAmount)
```

`netPayable` 已包含 `startupDebtDeduction`（见 6.1 公式），所以 `expectedTotal` 正确反映了
司机应上交的总额。文档已修正。

---

### 问题 14: generate_health_alerts_v1 全表扫描 queue_health_reports

**文件**: `supabase/schema.sql` 第 1990 行

**严重级别**: 🟢 低危

**问题描述**:

```sql
FOR r IN SELECT * FROM public.queue_health_reports LOOP
```

每次调用此函数都会全表扫描所有设备报告，然后循环检查每个设备的 4 种 alert 类型。当设备数量增长到 100+ 时性能可能下降。

**修复建议**: 添加 `WHERE reported_at > NOW() - INTERVAL '3 hours'` 或其他时间窗口限制。

---

### 问题 15: 离线事务使用 Date.now()-based ID 可能冲突

**文件**: `utils/transactionBuilder.ts` 第 65、88、130 行

**严重级别**: 🟢 低危

**问题描述**:

```typescript
id: `PAY-${Date.now()}`,           // payout_request
id: `RST-${Date.now()}`,           // reset_request
id: options.txId || `TX-${Date.now()}`,  // collection
```

`Date.now()` 基于毫秒时间戳，在快速连续操作中可能产生重复 ID。`createExpenseTransaction` (line 166) 使用了 `safeRandomUUID()` 相对更安全。

**影响范围**:
- 极低（需要同一毫秒内创建两个相同类型的交易）
- 但在自动测试或快速操作中可能发生

**修复建议**:
所有交易 ID 统一使用 `safeRandomUUID()` 或 `options.txId`（外部传入的 UUID）。

---

## 🟢 已验证 — 设计正确的方面

以下设计在项目代码中实现正确，值得肯定：

1. **calculate_finance_v2 与 submit_collection_v2 计算逻辑一致** — 都使用 `GREATEST`、`FLOOR`、`ABS` 等 SQL 函数，与本地 fallback 基本对齐（除问题 1 指出的 ABS 差异）

2. **离线队列 replay 通过 rawInput + submit_collection_v2 重新计算** — 不将本地计算值直接 upsert 到数据库，而是让服务器作为权威来源重新计算（`offlineQueue.ts` line 680-745）

3. **指数退避 + 死信队列** — 实现完整的 2s→4s→8s→16s→32s 退避，超过 5 次重试后进入死信状态可被 admin 查看（`offlineQueue.ts` line 62-63, 667-669, 864-909）

4. **flushQueue 模块级防并发** — `_isFlushing` 防止同一实例内并发提交（`offlineQueue.ts` line 594, 632）

5. **RLS 策略** — 大多数表的 SELECT/INSERT/UPDATE/DELETE 都按角色做了正确的隔离。admin 可看全部数据，driver 只能看自己的数据

6. **结算审批使用 `FOR UPDATE`** — `approve_reset_request_v1` 和 `approve_payout_request_v1` 正确地对 locations 行加锁（`schema.sql` line 700, 771）

7. **日结确认后才更新司机零钱** — `review_daily_settlement_v1` 只在 `p_status = 'confirmed'` 时更新 `dailyFloatingCoins`（`schema.sql` line 1358-1361）

---

## 是否建议立即修复

**Yes** — 建议优先修复以下高危问题：

| 优先级 | 问题 | 级别 | 修复工作量 |
|--------|------|------|-----------|
| P0 | 问题 2: submit_collection_v2 缺少 FOR UPDATE 锁 | 🔴 | 小（一行 SQL） |
| P0 | 问题 1: 本地/服务器 ABS 不一致 | 🔴 | 小（一行 TS） |
| P1 | 问题 3: createBaseTransaction currentScore 语义 | 🔴 | 中（需评估影响面） |
| P1 | 问题 4: expenses 被强置为零 | 🟡 | 中（需确认业务意图） |
| P2 | 问题 7: 管理员可物理删除交易 | 🟡 | 小（移除策略或加软删除） |
| P2 | 问题 11: 批量更新 paymentStatus 无锁 | 🟡 | 中 |
| P3 | 问题 8: GPS 心跳无错误上报 | 🟡 | 小 |
| P3 | 问题 15: Date.now() ID 可能冲突 | 🟢 | 小 |

### 排序理由

- **P0**: 直接涉及财务计算正确性 + 并发数据一致性，在高并发/离线 replay 场景下会导致数据错误
- **P1**: 可能影响财务审计和报表准确性
- **P2**: 安全最佳实践，当前无直接影响但属于风险点
- **P3**: 低概率 bug，修复成本低
