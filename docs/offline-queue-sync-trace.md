# BHT 离线队列与同步链路深度追踪文档

> 生成日期: 2026-05-10
> 审查范围: offlineQueue.ts (1625行), useSupabaseData.ts, QuickCollect.tsx, collectionSubmissionOrchestrator.ts, useOfflineSyncLoop.ts, localDB.ts
> 方法: 静态代码追踪 + 调用链分析

---

## 1. IndexedDB Schema 完整结构

### 1.1 数据库元信息

| 属性 | 值 |
|------|---|
| 数据库名 | `bahati_offline_db` |
| 版本 | `2` (v1→v2 migration: 新增 retryCount 索引) |
| Object Store | `pending_transactions` (单 store) |
| 主键 | `id` (Transaction.id，UUID) |

### 1.2 Object Store: `pending_transactions`

**keyPath**: `id`

**索引列表**:

| 索引名 | 字段 | unique | 用途 |
|--------|------|--------|------|
| `driverId` | `driverId` | false | 按司机查询队列 |
| `timestamp` | `timestamp` | false | 按时间范围清理过期条目 (`pruneOldSynced`) |
| `isSynced` | `isSynced` | false | (注: 不能用于IDBKeyRange.only(false), 代码中用内存过滤替代) |
| `retryCount` | `retryCount` | false | v2新增, 死信条目查询 |

### 1.3 存储的条目结构

每个条目包含 **Transaction 的完整字段** + **QueueMeta 的扩展字段**:

```typescript
// Transaction 字段 (部分)
{
  id: string;           // UUID, 主键
  driverId: string;
  locationId: string;
  locationName: string;
  currentScore: number;
  previousScore: number;
  revenue: number;
  netPayable: number;
  photoUrl: string | null;
  timestamp: string;    // ISO-8601
  type: 'collection' | 'reset_request' | 'payout_request';
  isSynced: boolean;    // false=待同步, true=已完成
  // ... 其他 Transaction 字段
}

// QueueMeta 扩展字段 (附加到同一对象)
{
  operationId: string;       // 幂等键，服务器端去重用
  entityVersion: number;     // 单调版本号，丢弃过期覆盖
  _queuedAt: string;         // ISO-8601，入队时间
  retryCount: number;        // 已尝试次数
  lastError?: string;        // 最近同步错误
  lastErrorCategory?: 'transient' | 'permanent';
  nextRetryAt?: string;      // 下次重试的最早时间 (exponential backoff)
  rawInput?: CollectionSubmissionInput;  // 原始提交输入，用于服务器权威回放
  photoPending?: boolean;    // 证据照片尚未持久化
  lastEvidenceError?: string;
}
```

### 1.4 版本迁移 (v1 → v2)

```typescript
// offlineQueue.ts lines 236-251
req.onupgradeneeded = (e) => {
  const db = (e.target as IDBOpenDBRequest).result;
  if (!db.objectStoreNames.contains(STORE_TX)) {
    // 首次创建
    const store = db.createObjectStore(STORE_TX, { keyPath: 'id' });
    store.createIndex('driverId',  'driverId',  { unique: false });
    store.createIndex('timestamp', 'timestamp', { unique: false });
    store.createIndex('isSynced',  'isSynced',  { unique: false });
    store.createIndex('retryCount', 'retryCount', { unique: false });
  } else {
    // v1 → v2: 已存在store，只添加缺失的索引
    const txn = (e.target as IDBOpenDBRequest).transaction!;
    const store = txn.objectStore(STORE_TX);
    if (!store.indexNames.contains('retryCount')) {
      store.createIndex('retryCount', 'retryCount', { unique: false });
    }
  }
};
```

---

## 2. 启动初始化: `createLocalDatabase` / `openDB`

### 2.1 IDB 初始化

```typescript
// offlineQueue.ts lines 229-256
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ...;  // 创建/迁移 schema
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
```

### 2.2 调用时机

`openDB()` 不在启动时预初始化，而是在每次操作时被调用（enqueue/markSynced/flushQueue 等）。这是一个 **懒初始化** 模式。

### 2.3 localStorage fallback 初始化

```typescript
// offlineQueue.ts lines 67-79
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.localStorage === 'undefined') return false;
  try {
    const test = '__storage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}
```

写+读测试确保 localStorage 完全可用（某些浏览器隐私模式/CORS iframe 会静默失败）。

### 2.4 memory fallback

```typescript
// offlineQueue.ts line 81
const memoryQueueCache = new Map<string, Array<Transaction & Partial<QueueMeta>>>();

// 当 localStorage 也不可用时，队列数据存在内存中
// 页面刷新后丢失
```

---

## 3. 入队: `enqueueTransaction`

### 3.1 完整调用链

```
QuickCollect.tsx: handleSubmit()
  ├─ calculateCollectionFinanceLocal()         // 本地财务计算
  └─ orchestrateCollectionSubmission()         // services/collectionSubmissionOrchestrator.ts
       ├─ buildCollectionSubmissionInput()     // 构建 rawInput
       ├─ if isOnline:
       │    ├─ submitCollectionV2(rawInput)    // 在线提交
       │    ├─ if success → return { source: 'server', ... }
       │    └─ if failure → fallbackToOffline() // 服务器失败降级
       └─ else (offline):
            fallbackToOffline()
              ├─ buildOfflineTransaction()     // 创建本地交易对象
              └─ enqueueOfflineTransaction()
                   └─ enqueueTransaction(tx, rawInput)  ← 核心入队
```

### 3.2 `enqueueTransaction` 内部流程

```
enqueueTransaction(tx, rawInput)
  1. prepareCollectionEvidenceForQueue(tx, rawInput)
     ├─ 如果 rawInput.photoUrl 是 data:image base64:
     │    └─ persistEvidencePhotoUrl() → 上传到 Supabase Storage
     │         ├─ 成功: 替换为 HTTP URL, photoPending=false
     │         └─ 失败: 保留 base64, photoPending=true, 记录错误
     └─ 如果已是 HTTP URL: 直接使用
     
  2. 创建 QueueMeta:
     { operationId: generateOperationId(),   // op-{ts36}-{rand36}
       entityVersion: Date.now(),
       _queuedAt: new Date().toISOString(),
       retryCount: 0,
       rawInput: storedRawInput,             // 原始提交参数
       photoPending: storedTx.photoPending,
       lastEvidenceError: storedTx.lastEvidenceError }
       
  3. 写入 IndexedDB:
     try {
       db = await openDB()
       store = db.transaction('pending_transactions', 'readwrite').objectStore(...)
       store.put({ ...storedTx, isSynced: false, ...meta })
       db.close()
     } catch {
       // fallback: localStorage / memory cache
       list = readLocalQueue()
       updated = [...list.filter(t => t.id !== tx.id), { ...storedTx, isSynced: false, ...meta }]
       writeLocalQueue(updated)
     }
```

### 3.3 入队关键特性

- **去重**: 相同 `tx.id` 的 put 会覆盖已有条目
- **幂等**: `operationId` 供服务器端做幂等去重
- **照片处理**: base64 照片尝试提前持久化，减少队列条目体积
- **double fallback**: IDB → localStorage → memory

---

## 4. 出队同步: `flushQueue`

### 4.1 触发源

```
App.tsx
  └─ useOfflineSyncLoop({ isOnline, unsyncedCount, syncOfflineData })
       ├─ 离线→在线转移时 (isOnline: false→true + unsyncedCount>0)
       ├─ 每60秒定时器 (online + hasPendingWork + !isSyncing)
       └─ Service Worker FLUSH_OFFLINE_QUEUE 消息
            ↓
       triggerSync() → syncOfflineData.mutate()  ← React Query mutation
```

### 4.2 `syncOfflineData` mutation 流程

```
useSupabaseMutations.ts: syncOfflineData.mutate()
  1. 检查: (!isOnline && !navigator.onLine) || !supabase → return
  
  2. 刷新 JWT session:
     supabase.auth.getSession()           // 静默刷新过期token
  
  3. 清除 backoff 时间戳:
     resetRetryBackoff()                  // 让等待中的条目立即可重试
  
  4. 核心: flushQueue(supabase, {         // ← offlineQueue.ts
       submitCollection: submitCollectionV2,
       submitResetRequest: createResetRequest,
       submitPayoutRequest: createPayoutRequest,
     })
  
  5. 队列健康上报:
     if (currentUser.role === 'driver'):
       reportQueueHealthToServer()        // 火后即忘
  
  6. 等待传播:
     if (flushed > 0): await setTimeout(2_000)
  
  7. 刷新 React Query 缓存:
     Promise.race([
       refetchQueries(['transactions', 'dailySettlements', 'locations', 'drivers', 'aiLogs']),
       timeout(20_000)
     ])
```

### 4.3 `flushQueue` 内部流程

```
flushQueue(supabaseClient, options)
  ├─ 防并发: if (_isFlushing) return 0    // 模块级互斥锁
  ├─ _isFlushing = true
  ├─ 获取待处理: pending = await getPendingTransactions()
  │    └─ IDB getAll() → filter(!isSynced)
  │       或 fallback: readLocalQueue().filter(!isSynced)
  │
  ├─ 全局超时: QUEUE_FLUSH_TIMEOUT_MS = 120_000
  │
  ├─ for each tx in pending:
  │    ├─ 检查全局超时 → break
  │    ├─ 跳过 backoff: if nextRetryAt > now → continue
  │    ├─ 跳过死信: if retryCount >= MAX_RETRIES(5) → continue
  │    │
  │    └─ flushSingleItem(entry, supabaseClient, options)
  │         ├─ rawInput 存在 → 走 collection 回放路径
  │         │    ├─ 检查 options.submitCollection 存在
  │         │    ├─ persistQueuedEvidencePhoto()  // 照片持久化
  │         │    ├─ submitCollection(replayInput)  // 90s超时
  │         │    ├─ if success: markSynced(id, result.transaction)
  │         │    │              → return 'flushed'
  │         │    └─ if failure: recordRetryFailure() → return 'failed'
  │         │
  │         ├─ type==='reset_request' → submitResetRequest
  │         ├─ type==='payout_request' → submitPayoutRequest
  │         └─ 其他/legacy → upsert to 'transactions' 表
  │
  └─ finally: _isFlushing = false
       return flushed (成功同步的数量)
```

### 4.4 单条回放的超时保护

```typescript
// offlineQueue.ts lines 644-654
// 每条 collection 回放独立 90s 超时
const SUBMIT_TIMEOUT_MS = 90_000;
const submitPromise = options.submitCollection(replayInput);
const timeoutPromise = new Promise<never>((_, reject) => {
  timerId = setTimeout(
    () => reject(new Error(`Collection replay timed out after ${SUBMIT_TIMEOUT_MS}ms`)),
    SUBMIT_TIMEOUT_MS,
  );
});
const result = await Promise.race([submitPromise, timeoutPromise]);
```

这样单个慢请求不会阻塞整个队列。

---

## 5. 标记完成: `markSynced`

### 5.1 函数签名

```typescript
export async function markSynced(
  id: string,
  authoritativeData?: Partial<Transaction>
): Promise<void>
```

### 5.2 流程

```
markSynced(id, authoritativeData?)
  1. 验证 authoritativeData (如果提供):
     validateAuthoritativeData(data)
       ├─ id: 必须是 string
       ├─ currentScore: 必须是有限数字
       ├─ previousScore: 必须是有限数字
       ├─ timestamp: 必须是有效 ISO 字符串
       └─ photoUrl: 必须是 string 或 null

  2. 合并更新: update = { ...authoritativeData, isSynced: true }

  3. 写入 IDB:
     try {
       db = await openDB()
       store = db.transaction('pending_transactions', 'readwrite').objectStore(...)
       item = await store.get(id)
       if (item):
         await store.put({ ...item, ...update })  // 合并服务器权威数据
       db.close()
     } catch {
       // fallback: readLocalQueue → 查找并覆盖 → writeLocalQueue
     }
```

### 5.3 服务器权威数据合并

当 flushQueue 中 collection 回放成功，服务器返回完整 Transaction 对象：

```
服务器返回 result.transaction (权威 finance 值)
  ↓
markSynced(entry.id, result.transaction)
  ↓
IDB 条目更新为: { ...本地entry, ...服务器transaction, isSynced: true }
  ↓
本地计算的 finance 值被服务器权威值覆盖
```

这确保离线计算的 finance（可能因计算差异而不准确）被服务器重新计算的权威值替换。

---

## 6. 重试策略: 指数退避 + 死信

### 6.1 错误分类

```typescript
classifyError(msg): 'transient' | 'permanent'

// transient (可重试):
'network error', 'timeout', 'fetch failed', 'connection reset',
'econnrefused', 'dns', '500/502/503/504', 'offline',
'evidence photo upload failed'

// permanent (重试无意义):
'forbidden', 'not found', 'invalid', 'permission denied',
'unauthorized', 'violates', 'bad request', 'validation error',
'schema mismatch', 'duplicate key', 'constraint',
'missing required collection evidence photourl'
```

**特别说明**: `'authentication required'` 被 **明确排除** 在 permanent 之外——过期的 JWT 是 transient 条件，用户重新登录后即可重试。

### 6.2 退避计算

```typescript
computeRetryState(currentRetryCount, category)

permanent:
  newRetry = MAX_RETRIES (5)     // 立即死信
  backoffMs = 0

transient:
  newRetry = currentRetryCount + 1
  backoffMs = BASE_BACKOFF_MS(2000) × 2^min(newRetry-1, 4)
  // 2s → 4s → 8s → 16s → 32s (最多 32s)
```

### 6.3 生命状态机

```
enqueued (retryCount=0)
  │
  ├─ flushQueue 成功 → markSynced() → isSynced=true ✓
  │
  └─ flushQueue 失败
       ├─ transient → retryCount++, nextRetryAt = now + backoffMs
       │              → 状态: "retry-waiting"
       │              → 下次 flushQueue 时检查 nextRetryAt
       │
       └─ permanent → retryCount = MAX_RETRIES(5)
                    → 状态: "dead-letter"
                    → 不再自动重试
                    → 需要管理员手动 replay或废弃
```

---

## 7. 离线检测逻辑

### 7.1 检测架构

```
isOnline (React Query state)
  └─ useSupabaseData.ts
       ├─ 初始值: navigator.onLine (浏览器原生在线状态)
       │
       ├─ 定期轮询: checkDbHealth() 每 5 秒
       │    └─ fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(10_000) })
       │         ├─ res.ok → isOnline=true
       │         └─ throw/!ok → isOnline=false
       │
       └─ 浏览器事件 (即时):
            ├─ window 'offline' → queryClient.setQueryData(['dbHealth'], false)
            └─ window 'online'  → queryClient.setQueryData(['dbHealth'], true)
                                → refetchHealth() (异步确认)
```

### 7.2 双重 Bug 详解

#### Bug A: 冷启动窗口期（已修复）

**原问题**: `refetchInterval` 原为 15 秒。应用冷启动时，若网络实际在线但 `checkDbHealth` 尚未返回（fetch 可能耗时 10s），`isOnline` 为 `navigator.onLine`(true) 但 health check 尚未确认。这期间如果 `navigator.onLine` 返回 true 但真实网络不可达，会导致提交误入在线路径而实际失败。

**当前状态**: 已修复，refetchInterval 改为 5 秒。但仍有 5s 的理论窗口。

#### Bug B: 慢网络下的 isOnline 滞后 + 查询误降级（已认知，未完全修复）

**问题链**:
```
慢网络 (TZ 环境典型)
  ↓
checkDbHealth() fetch → 10s timeout → 超时 → isOnline=false
  ↓
但实际网络可用! 只是健康检查端点慢
  ↓
useSupabaseData 中的查询:
  注释明确说明: "Don't gate on isOnline: the health-check poll lags behind reality"  
  ↓
代码第 109/133 行: if (isAuthenticated) { try Supabase first } 
  而不是 if (isAuthenticated && isOnline) { try Supabase first }
  ↓
✓ 正确: 查询不依赖 isOnline, 直接尝试 Supabase 并从错误中降级
✗ 但提交逻辑 (orchestrateCollectionSubmission) 依赖 isOnline:
  if (input.isOnline) { submitCollectionV2() } else { enqueueTransaction() }
  ↓
当 isOnline=false 但网络实际可用时 → 所有提交都会进离线队列
```

**关键差异**:
- **数据查询** (locations/drivers/transactions): 不依赖 `isOnline`，直接尝试 Supabase → 正确
- **数据提交** (collection submission): 完全依赖 `isOnline` → 可能错误降级

**修复状态**:
- queries 端: ✅ 已正确处理 (不依赖 isOnline gating)
- submit 端: ⚠️ 仍依赖 isOnline。当慢网络导致 health check 超时但网络实际可用时，提交会错误进入离线队列。

### 7.3 `navigator.onLine` 的局限性

`navigator.onLine` 只表示设备有网络接口（WiFi/蜂窝已连接），**不代表互联网可达**。常见陷阱:
- WiFi 已连但需要 portal 认证
- 蜂窝网络有信号但数据套餐用尽
- VPN/代理环境中的路由问题

BHT 项目通过 `checkDbHealth()` 补充了真实可达性检测，但 5s 轮询间隔 + 10s fetch 超时 = 最多 15s 的检测延迟。

---

## 8. localStorage / memory fallback

### 8.1 三层存储降级链

```
IndexedDB (主要存储)
  ├─ 可用 → 直接读写
  └─ 不可用 → 降级到 localStorage
       ├─ 可用 → 读写 localStorage (key: 'bahati_offline_queue')
       └─ 不可用 → 降级到内存 Map
            └─ memoryQueueCache.set(QUEUE_STORAGE_KEY, ...)
```

### 8.2 localDB (React Query 缓存持久化)

```typescript
// services/localDB.ts — 使用 idb-keyval 库
export const localDB = {
  async get<T>(key): Promise<T|null> {
    try { return await idb.get(key) }
    catch { /* fallback: localStorage.getItem + JSON.parse */ }
  },
  async set<T>(key, value): Promise<void> {
    try { await idb.set(key, value) }
    catch { /* fallback: localStorage.setItem + JSON.stringify */ }
  }
}
```

**用途**: 持久化 React Query 的数据快照（locations, drivers, transactions, settlements, aiLogs），供离线时读取。

### 8.3 writeLocalQueue 的健壮性

```typescript
function writeLocalQueue(queue): void {
  if (!isLocalStorageAvailable()) {
    memoryQueueCache.set(QUEUE_STORAGE_KEY, queue);  // 内存降级
    return;
  }
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineQueue] localStorage write failed, using memory cache', err);
    memoryQueueCache.set(QUEUE_STORAGE_KEY, queue);  // 写入失败时内存降级
  }
}
```

不仅检查 localStorage 可用性，还捕获写入时的异常（配额满、跨域限制等）。

---

## 9. React Query Cache 与离线队列的交互

### 9.1 双层数据流

```
┌─────────────────────────────────────────────────┐
│              React Query Cache                   │
│  - transactions (含 isSynced 标记)              │
│  - dailySettlements                              │
│  - locations, drivers, aiLogs                    │
│                                                  │
│  unsyncedCount = filter(!isSynced).length        │
│  hasPendingWork = unsyncedCount>0 || idbPending>0│
└────────────┬────────────────────────────────────┘
             │
             ▼    仅当 server/offline 提交成功后
         invalidateQueries / refetchQueries
             │
             ▼
┌─────────────────────────────────────────────────┐
│              IndexedDB Queue                     │
│  - pending_transactions store                    │
│  - 独立于 React Query 管理                       │
│  - 通过 getQueueHealthSummary() 暴露状态         │
│  - idbPendingCount = pending + retryWaiting      │
└─────────────────────────────────────────────────┘
```

### 9.2 提交后的缓存更新

```typescript
// QuickCollect.tsx lines 252-254
// 提交后使缓存失效 → 触发 refetch
void queryClient.invalidateQueries({ queryKey: ['transactions'] });
void queryClient.invalidateQueries({ queryKey: ['locations'] });
void queryClient.invalidateQueries({ queryKey: ['drivers'] });
```

**注意**: 第 249 行的注释解释了为什么不做乐观更新:
> optimistic update removed — setQueriesData with fuzzy prefix match would pollute other drivers' caches

### 9.3 同步后的缓存刷新

```typescript
// useSupabaseMutations.ts lines 91-112
if (flushed > 0) {
  await new Promise(r => setTimeout(r, 2_000));  // 等待 Supabase 写入传播
}
await Promise.race([
  Promise.all([
    queryClient.refetchQueries({ queryKey: ['transactions'] }),
    queryClient.refetchQueries({ queryKey: ['dailySettlements'] }),
    queryClient.refetchQueries({ queryKey: ['locations'] }),
    queryClient.refetchQueries({ queryKey: ['drivers'] }),
    queryClient.refetchQueries({ queryKey: ['aiLogs'] }),
  ]),
  new Promise((resolve) => setTimeout(resolve, 20_000)),  // 20s 天花板
]);
```

**关键**: 使用 `refetchQueries` 而非 `invalidateQueries`，确保数据被立即替换，而不是等下一次组件渲染。

### 9.4 hasPendingWork 的双重检查

```typescript
// useOfflineSyncLoop.ts lines 110
const hasPendingWork = unsyncedCount > 0 || idbPendingCount > 0;
```

- `unsyncedCount`: 来自 React Query cache (filter transactions/dailySettlements/aiLogs by !isSynced)
- `idbPendingCount`: 来自 IDB `getQueueHealthSummary()` (pending + retryWaiting)

这确保即使 React Query cache 显示无未同步项，IDB 中仍有待刷新的条目时，自动同步仍会触发。

### 9.5 useSupabaseData 中缓存持久化

```typescript
// useSupabaseData.ts — 每次 Supabase 查询成功后持久化到 localDB
const data = await fetchTransactions(...);
const mapped = data.map(t => ({ ...t, isSynced: true }));
await localDB.set(transactionStorageKey, mapped);  // ← 持久化快照
return mapped;
```

这样离线时，查询不会返回空数组，而是返回最近一次成功的快照。

---

## 10. 边界条件

### 10.1 并发提交保护

```
flushQueue 级别:
  _isFlushing (模块级 mutex)
    → 同时两个 triggerSync 调用: 第二个直接 return 0
    → 等待下一个 60s 循环

单条回放级别:
  Promise.race(submitCollection, timeout(90_000))
    → 单条 90s 超时 → recordRetryFailure → 不阻塞后续条目

全局超时:
  QUEUE_FLUSH_TIMEOUT_MS = 120_000
    → 总处理时间超过 2 分钟 → break 退出循环
    → _isFlushing 在 finally 中释放

GPS 心跳:
  isUpdatingGps (模块级锁)
    → 防止 GPS 更新与同步竞争 Supabase 写入
```

### 10.2 队列满处理

当前代码 **没有** 队列容量上限。风险:
- IDB 无限制增长 → `pruneOldSynced(7)` 每 30s 清理 7 天外的已同步条目
- 如果大量未同步条目积累 → IDB 可能超过配额 → 降级到 localStorage → 再降级到内存

### 10.3 同步失败重试的边界

| 条件 | 行为 |
|------|------|
| transient error + retryCount < 5 | exponential backoff, 下次 flush 重试 |
| transient error + retryCount >= 5 | 实际上不会发生 (transient 最多到 retry 4) |
| permanent error | 立即 retryCount=5, dead-letter |
| dead-letter | 不再自动重试, 需手动 replay |
| 手动 replay 失败 | lastError 更新, 保持在 dead-letter 状态 |
| `resetDeadLetterItems()` | retryCount → 0, 清除所有错误元数据 |
| `resetRetryBackoff()` | 仅清除 nextRetryAt, 保留 retryCount |

### 10.4 照片持久化的败退

```
入队时:
  base64 photo → persistEvidencePhotoUrl({required: false})
    ├─ 成功 → 存储 HTTP URL
    └─ 失败 → 保留 base64, photoPending=true

回放时:
  persistQueuedEvidencePhoto({required: true})
    ├─ HTTP URL → 直接使用
    ├─ base64 + photoPending → 重新尝试持久化
    ├─ 成功 → 更新 IDB 条目
    └─ 失败 → 标记 permanent error, dead-letter

缺失照片:
  getRequiredCollectionReplayPhotoUrl() 返回 null
  → 'missing required collection evidence photourl'
  → classifyError → permanent → 死信
```

---

## 11. 修改时的联动文件

如需修改离线队列相关逻辑，以下文件必须同步检查:

### 核心队列
| 文件 | 职责 |
|------|------|
| `offlineQueue.ts` (1625行) | 队列核心: enqueue/flush/markSynced/retry/dead-letter |
| `services/collectionSubmissionOrchestrator.ts` | 提交流水线，决定走在线还是离线路径 |

### 离线检测
| 文件 | 职责 |
|------|------|
| `hooks/useSupabaseData.ts` | isOnline 状态管理 + 所有数据查询 + localDB 持久化 |
| `supabaseClient.ts` | checkDbHealth() 实现 |
| `hooks/useOfflineSyncLoop.ts` | 自动同步调度 + GPS 心跳 |

### 存储降级
| 文件 | 职责 |
|------|------|
| `services/localDB.ts` | IDB-keyval 封装 + localStorage fallback |
| `offlineQueue.ts` (内部) | isLocalStorageAvailable + memoryQueueCache + writeLocalQueue |

### React Query 集成
| 文件 | 职责 |
|------|------|
| `hooks/useSupabaseMutations.ts` | syncOfflineData mutation + 缓存刷新 + 乐观更新 |
| `contexts/DataContext.tsx` | isOnline, unsyncedCount 透传到 UI |
| `App.tsx` | useOfflineSyncLoop 挂载 |

### UI 入口
| 文件 | 职责 |
|------|------|
| `driver/components/QuickCollect.tsx` | 快速收款提交入口 |
| `driver/pages/DriverCollectionFlow.tsx` | 完整收款向导 |
| `driver/AppDriverShell.tsx` | 司机端壳，syncStatus 显示 |
| `admin/AppAdminShell.tsx` | 管理端壳 |

### 测试
| 文件 | 职责 |
|------|------|
| `__tests__/offlineQueueReplay.test.ts` | flushQueue 回放逻辑测试 |
| `__tests__/supabaseClient.test.ts` | checkDbHealth 测试 |
| `__tests__/settlementWorkflowFlow.test.tsx` | 结算流程集成测试 |

### 文档
| 文件 | 职责 |
|------|------|
| `docs/RUNBOOK.md` | 运维手册 (离线队列章节) |
| `docs/bht-defect-review-final.md` | 缺陷审查报告 |
| `docs/QUICK-FIX-GUIDE.md` | 快速修复指南 |
| `docs/RLS-MIGRATION-ANALYSIS-20260423.md` | RLS 迁移分析 |

---

## 12. 已修复问题一览

| # | 问题 | 状态 | 修复内容 |
|---|------|------|---------|
| 1 | RLS 权限隔离无前端验证 | ✅ | 添加客户端双重验证 |
| 2 | markSynced 无数据验证 | ✅ | validateAuthoritativeData() |
| 3 | photoUrl 丢失处理 | ✅ | prepareCollectionEvidenceForQueue + persistQueuedEvidencePhoto |
| 4 | 离线恢复时重复同步 | ✅ | 删除 window.online listener, 单一触发点 |
| 5 | isOnline 轮询间隔 15s | ✅ | 改为 5s |
| 6 | flushQueue 无超时保护 | ✅ | 120s 全局超时 + 90s 单条超时 |
| 7 | 订阅清理不完整 | ✅ | 修复 useRealtimeSubscription |
| 8 | localStorage 降级失败 | ✅ | isLocalStorageAvailable() + memory cache |
| 9 | 错误分类不完整 | ✅ | classifyError 新增 transient/permanent 模式 |
| 10 | GPS 心跳竞争 | ✅ | isUpdatingGps 互斥锁 |

## 13. 剩余风险

| 风险 | 级别 | 说明 |
|------|------|------|
| isOnline 慢网络滞后 | Medium | 提交层仍依赖 isOnline, health check 超时时错误降级 |
| 无队列容量上限 | Low | IDB 无限制, 仅靠 pruneOldSynced 清理 |
| for 循环串行回放 | Low | 大量条目时可能慢, 但有 global timeout 保护 |
| navigator.onLine 不可靠 | Low | 有 checkDbHealth 补充, 但提交层仍部分依赖 |
| 离线提交 finance 与服务器不一致 | Low | 服务器 replay 时会权威重算, 但本地财务预览可能误导 |
