# BHT 项目 - 快速修复指南

## 3 个 Blocking 项（今天必须开始）

### Issue #1：RLS 权限隔离验证 (1h)

**问题**: Driver 可能看到其他司机的数据  
**根因**: 前端仅做客户端过滤，服务器没有验证

**修复位置**: `repositories/transactionRepository.ts` line 36-49

```typescript
export async function fetchTransactions(opts: FetchTransactionsOptions): Promise<Transaction[]> {
  if (!supabase) throw new Error('Supabase client unavailable');
  const fields = opts.isDriver ? DRIVER_TX_FIELDS : ADMIN_TX_FIELDS;
  let query = supabase
    .from('transactions')
    .select(fields)
    .order('timestamp', { ascending: false });
  if (opts.driverIdFilter) query = query.eq('driverId', opts.driverIdFilter);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.signal) query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw error;
  
  // ✅ 添加这段（双重验证）
  if (opts.isDriver && opts.driverIdFilter) {
    if (data?.some(tx => tx.driverId !== opts.driverIdFilter)) {
      throw new Error('RLS violation: fetched data contains other drivers\'s transactions');
    }
  }
  
  return (data ?? []) as unknown as Transaction[];
}
```

**验证**: 
```bash
# 单测：mock 混杂数据 → 断言失败
npm run test:ci -- transactionRepository
```

---

### Issue #2：markSynced 数据验证 (2h)

**问题**: 异常返回值直接存储，导致数据损坏  
**根因**: 没有 schema 验证

**修复位置**: `offlineQueue.ts` line 270-287

```typescript
export async function markSynced(id: string, authoritativeData?: Partial<Transaction>): Promise<void> {
  // ✅ 添加数据验证
  if (authoritativeData) {
    // 必须字段检查
    const required = ['id', 'currentScore', 'driverId', 'locationId'];
    for (const field of required) {
      if (!(field in authoritativeData)) {
        throw new Error(`Invalid authoritativeData: missing required field "${field}"`);
      }
    }
    
    // 类型检查
    if (typeof authoritativeData.id !== 'string') {
      throw new Error('Invalid authoritativeData: id must be string');
    }
    if (typeof authoritativeData.currentScore !== 'number' || !isFinite(authoritativeData.currentScore)) {
      throw new Error('Invalid authoritativeData: currentScore must be finite number');
    }
  }
  
  const update = { ...authoritativeData, isSynced: true };
  try {
    const db    = await openDB();
    const txDb = db.transaction(STORE_TX, 'readwrite');
    const store = txDb.objectStore(STORE_TX);
    const item  = await new Promise<Transaction | undefined>((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
    if (item) {
      await new Promise<void>((res, rej) => {
        const r = store.put({ ...item, ...update });
        r.onsuccess = () => res();
        r.onerror   = () => rej(r.error);
      });
    }
    db.close();
  } catch (err) {
    // ... existing error handling ...
  }
}
```

**验证**:
```bash
# 单测：异常数据 → 断言失败
npm run test:ci -- offlineQueue
```

---

### Issue #3：photoUrl 丢失处理 (3h)

**问题**: 离线提交的照片同步时变成 null  
**根因**: Storage 上传失败时，仍然提交 null photoUrl

**修复位置**: `offlineQueue.ts` line 394-420

```typescript
// 在 submitCollection 路径中
if (entry.rawInput) {
  if (!options?.submitCollection) {
    await recordRetryFailure(
      tx.id,
      'submitCollection callback unavailable for collection replay',
      'permanent',
    );
    continue;
  }

  // ✅ 硬性要求 photoUrl
  const persistedPhotoUrl = await persistEvidencePhotoUrl(entry.photoUrl, {
    category: 'collection',
    entityId: entry.id,
    driverId: entry.driverId,
  }).catch(err => {
    console.error('[OfflineQueue] Photo upload failed:', err);
    return null;
  });

  // ✅ 新增：如果 photoUrl 无法上传，标记为 transient 重试
  if (entry.rawInput && !persistedPhotoUrl) {
    await recordRetryFailure(
      tx.id,
      'photo_upload_failed: Unable to upload evidence photo. Will retry.',
      'transient'  // ← transient，会重试
    );
    continue;  // ← 跳过本次提交，保留在队列
  }

  const replayInput: CollectionSubmissionInput = {
    ...entry.rawInput,
    photoUrl: persistedPhotoUrl ?? entry.photoUrl ?? null,
  };

  const result = await options.submitCollection(replayInput);
  // ... rest of logic ...
}
```

**验证**:
```bash
# 单测：offline + Storage 失败 → 验证 isSynced 仍为 false
npm run test:ci -- offlineQueue
```

---

## 4 个 High Priority 项（强烈建议）

### Issue #4：离线恢复重复同步 (2h)

**文件**: `hooks/useOfflineSyncLoop.ts`

**修复**:  
- 删除 window.online 事件 listener effect（line 137-161）
- 保留 React state effect（line 109-132）
- 合并两个同步触发点

### Issue #5：isOnline 滞后 (0.5h)

**文件**: `hooks/useSupabaseData.ts` line 71

```diff
- refetchInterval: 15_000,
+ refetchInterval: 5_000,  // 改为 5s
```

### Issue #6：flushQueue 超时保护 (2h)

**文件**: `offlineQueue.ts` line 364+

```typescript
const QUEUE_FLUSH_TIMEOUT_MS = 120_000;  // 120s 整体超时
const startTime = Date.now();

for (const tx of pending) {
  // ✅ 添加整体超时检查
  if (Date.now() - startTime > QUEUE_FLUSH_TIMEOUT_MS) {
    console.warn('[OfflineQueue] flushQueue timeout, stopping processing');
    break;
  }
  // ... process item ...
}
```

### Issue #7：realtime 订阅清理 (1.5h)

**文件**: `hooks/useRealtimeSubscription.ts`

需要代码审查，确保 effect cleanup 调用 unsubscribe()。

---

## 快速测试

```bash
# 1. 类型检查
npm run typecheck

# 2. Lint
npm run lint

# 3. 单元测试
npm run test:ci

# 4. E2E（需新增用例）
npm run test:e2e

# 5. 构建验证
npm run build
npm run cap:build:android

# 6. 人工验证（关键场景）
# - 离线提交 + 联网同步 → 无重复记账
# - 权限隔离 → Driver 仅看自己的数据
# - 照片上传 → 完整无丢失
# - 内存泄漏 → 长期使用无内存增长
```

---

## 时间表

| 日期 | 任务 | 工时 |
|------|------|------|
| Day 1 | Issue #1, #2, #5 | 3.5h |
| Day 2 | Issue #3, #4 | 5h |
| Day 3 | Issue #6, #7, #8-11 | 9h |
| Day 4-5 | 全量测试 + 人工验证 | 2-3 天 |

**总计**: 8-11 天

---

## Commit 模板

```
fix: [Issue #N] 问题描述

具体改动:
- 文件位置
- 改动理由
- 验证方式

Fixes: #N (根据实际编号)
```

---

## 常见问题

**Q: RLS 验证怎么测试?**
A: 单测中 mock fetchTransactions 返回混杂的 driver 数据，验证断言失败。

**Q: photoUrl 为 null 还能提交吗?**
A: 不能。修复后如果 Storage 失败，会标记为 transient 重试，不会允许 null 提交。

**Q: 为什么要删除 window.online listener?**
A: React state 更新已经捕获了网络状态变化，window.online 事件会导致重复触发，浪费资源。

---

**最后**: 修复完成后，运行全量测试并人工验证关键场景，然后即可合并到主分支准备上线。
