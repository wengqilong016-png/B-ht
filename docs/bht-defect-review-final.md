# BHT 项目 - 上线前缺陷审查 - 最终报告

**执行时间**: 2026-04-22  
**审查范围**: 路线收款管理系统（React 19 + Supabase + Capacitor）  
**审查方法**: 系统性风险建模 + 状态流梳理 + 代码分析  

---

## 快速概览

- **审查对象**: 12 个高风险模块，306 行审查计划
- **发现问题**: 12 个，其中 **5 个 Critical**，4 个 High，3 个 Medium
- **必修修复**: 3 个 Blocking 项（权限隔离、数据验证、照片处理）
- **上线建议**: 修复 Blocking 项后可上线；建议同时修复 High 优先级项
- **预计工期**: 修复 6-8 天 + 验证 2-3 天

---

## 1 核心发现

### Blocking（必须修复）

| # | 问题 | 文件 | 风险 | 修复时间 |
|---|------|------|------|--------|
| 1 | **RLS 权限隔离无前端验证** | repositories/transactionRepository.ts | 隐私泄露 | 1h |
| 2 | **markSynced 无数据验证** | offlineQueue.ts | 数据损坏 | 2h |
| 3 | **photoUrl 丢失处理** | offlineQueue.ts | 审计不完整 | 3h |

### High Priority

| # | 问题 | 文件 | 风险 | 修复时间 |
|---|------|------|------|--------|
| 4 | 重复同步触发 | useOfflineSyncLoop.ts | 浪费资源 | 2h |
| 5 | isOnline 滞后 | useSupabaseData.ts | 体验差 | 0.5h |
| 6 | flushQueue 无超时 | offlineQueue.ts | 同步卡死 | 2h |
| 7 | 订阅清理不完整 | useRealtimeSubscription.ts | 内存泄漏 | 1.5h |

### Medium Priority

| # | 问题 | 风险 | 修复时间 |
|---|------|------|--------|
| 8 | localStorage 降级失败 | 离线功能失效 | 1h |
| 9 | 错误分类不完整 | 重试策略错误 | 1h |
| 10 | GPS 心跳竞争 | 同步延迟 | 1.5h |
| 11 | E2E 测试覆盖不足 | 隐藏缺陷风险 | 2h |

---

## 2 问题详解

### [CRITICAL] 问题 1：RLS 权限隔离完全依赖 Supabase 配置

**现象**: Driver 账户可能看到其他 Driver 的交易数据  
**根因**: 前端仅做客户端过滤 `.eq('driverId', ...)`,  完全依赖 Supabase RLS 配置  
**触发**: RLS 策略禁用或配置错误  
**影响**: Critical - 严重隐私泄露  

**修复**:  
```typescript
export async function fetchTransactions(opts: FetchTransactionsOptions): Promise<Transaction[]> {
  // ... existing query ...
  const result = await query;
  if (opts.isDriver && opts.driverIdFilter) {
    // 双重验证：确保所有返回的交易都属于该 driver
    if (result.some(tx => tx.driverId !== opts.driverIdFilter)) {
      throw new Error('RLS violation: fetched data contains other drivers\'s transactions');
    }
  }
  return result;
}
```

---

### [CRITICAL] 问题 2：markSynced 无数据验证

**现象**: 服务器返回异常数据时，markSynced 直接存储，导致数据损坏  
**根因**: 没有 schema 验证外部输入  
**触发**: 后端 RPC 返回格式错误或字段类型异常  
**影响**: Critical - 数据损坏、UI 崩溃  

**修复**:  
```typescript
export async function markSynced(id: string, authoritativeData?: Partial<Transaction>): Promise<void> {
  if (authoritativeData) {
    // 验证关键字段
    if (typeof authoritativeData.id !== 'string') {
      throw new Error('Invalid authoritativeData: id must be string');
    }
    if (typeof authoritativeData.currentScore !== 'number' || !isFinite(authoritativeData.currentScore)) {
      throw new Error('Invalid authoritativeData: currentScore must be finite number');
    }
  }
  // ... rest of function ...
}
```

---

### [CRITICAL] 问题 3：photoUrl 丢失导致交易数据不完整

**现象**: 离线提交交易同步时，照片 URL 变成 null  
**根因**: 
- rawInput.photoUrl 被刻意设为 null（省存储空间）
- 回放时从 entry.photoUrl 恢复，但如果 Storage 上传失败，也是 null
- 同步仍继续，导致"无照片"交易被记录

**触发**: 离线提交 + Supabase Storage 不可达  
**影响**: Critical - 审计证据丧失  

**修复**:  
在 flushQueue 中硬性要求 photoUrl：
```typescript
const persistedPhotoUrl = await persistEvidencePhotoUrl(input.photoUrl, ...);

if (entry.rawInput && !persistedPhotoUrl) {
  // 标记为需要人工补传，而非让 null 过关
  await recordRetryFailure(
    tx.id,
    'photo_upload_failed: Storage unavailable',
    'transient'
  );
  continue;  // 不标记为同步，留在队列中
}

const result = await options.submitCollection({...entry.rawInput, photoUrl: persistedPhotoUrl});
```

---

### [CRITICAL] 问题 4：离线恢复时重复同步

**现象**: 网络恢复时，可能在短时间内多次调用 triggerSync()  
**根因**:
- Effect 1: offline→online React state 变化 → triggerSync()
- Effect 2: window.online 浏览器事件 → triggerSync()
- 两个事件可能同时到达，导致并发调用

**触发**: 网络中断恢复  
**影响**: High - 浪费带宽、电池、计算  

**修复**:  
合并两个 effect，用单一的同步触发机制：
```typescript
// ❌ 删除 window.online listener effect
// ✅ 保留 React state effect

useEffect(() => {
  // 这个 effect 已经捕获了 offline→online 转移
  const wasOffline = !prevOnlineRef.current;
  prevOnlineRef.current = isOnline;
  
  if (!isOnline || !wasOffline || isSyncingRef.current) return;
  
  // 单一的触发点
  triggerSync();
}, [isOnline, triggerSync, unsyncedCount]);
```

---

### [HIGH] 问题 5：isOnline 状态滞后 15 秒

**现象**: dbHealth 查询间隔为 15s，短暂网络抖动时 UI 状态不同步  
**触发**: 短暂网络中断（< 15s）  
**影响**: High - 同步延迟，用户体验差  

**修复**:  
```typescript
const { data: isOnline = false, refetch: refetchHealth } = useQuery({
  queryKey: ['dbHealth'],
  queryFn: async () => await checkDbHealth(),
  refetchInterval: 5000,  // ← 改为 5s
  refetchOnWindowFocus: true,
});
```

---

### [HIGH] 问题 6：flushQueue 无整体超时保护

**现象**: 某一项 submitCollection 挂起时，整个 flush 被阻塞  
**触发**: Storage 上传极慢或悬挂  
**影响**: High - 同步卡死，其他项无法处理  

**修复**:  
给 flushQueue 加整体超时：
```typescript
export async function flushQueue(
  supabaseClient: SupabaseClient,
  options?: FlushOptions,
): Promise<number> {
  const QUEUE_FLUSH_TIMEOUT_MS = 120_000;  // 120s 整体超时
  const startTime = Date.now();
  
  // ... existing code ...
  
  for (const tx of pending) {
    if (Date.now() - startTime > QUEUE_FLUSH_TIMEOUT_MS) {
      console.warn('[OfflineQueue] flushQueue timeout, stopping processing');
      break;  // ← 强制停止，避免无限卡顿
    }
    // ... process item ...
  }
}
```

---

### [HIGH] 问题 7：realtime 订阅清理不完整

**现象**: 用户切换角色或重新登录时，订阅可能未正确卸载，导致内存泄漏  
**触发**: 用户切换角色或长期使用  
**影响**: High - 内存占用增加，app 变慢  

**修复**:  
需要代码审查 useRealtimeSubscription.ts，确保 effect cleanup 正确卸载订阅。

---

## 3 修复路径图

### 第一轮（Day 1）- 核心 Blocking 项
```
问题 1（RLS 验证） ............ 1h
问题 2（markSynced 验证） .... 2h
问题 5（isOnline 改进） ...... 0.5h
━━━━━━━━━━━━━━━━━━━━━━━━━━
小计: 3.5h
```

### 第二轮（Day 2）- 高优先级
```
问题 3（photoUrl 处理） ...... 3h
问题 4（重复同步去重） ...... 2h
━━━━━━━━━━━━━━━━━━━━━━━━━━
小计: 5h
```

### 第三轮（Day 3）- 稳定性
```
问题 6（flushQueue 超时） .... 2h
问题 7（realtime 订阅清理） .. 1.5h
问题 8-11（其他 Medium 项） ... 5.5h
━━━━━━━━━━━━━━━━━━━━━━━━━━
小计: 9h
```

### 第四轮（验证）- 2-3 天
```
npm run typecheck
npm run lint
npm run test:ci
npm run test:e2e
npm run build
npm run cap:build:android

人工验证:
  - 离线同步流程
  - 权限隔离验证
  - 重复提交防护
  - 照片上传完整性
```

---

## 4 验证清单

### 静态验证
- [ ] `npm run typecheck` - 无类型错误
- [ ] `npm run lint` - 无 linting 错误
- [ ] 代码审查 - 所有修改符合 AGENTS.md 规范

### 单元 + 集成测试
- [ ] `npm run test:ci` - 所有测试通过
- [ ] 覆盖新增的数据验证逻辑
- [ ] 覆盖错误处理路径

### E2E 测试（补充）
- [ ] `npm run test:e2e` - 所有用例通过
- [ ] 新增离线场景用例
- [ ] 新增权限隔离用例
- [ ] 新增重复提交防护用例

### 构建验证
- [ ] `npm run build` - 生产构建成功
- [ ] `npm run cap:build:android` - 移动端构建成功
- [ ] 无构建警告

### 人工验证（真实场景）
| 场景 | 验证步骤 | 预期 | 状态 |
|------|--------|------|------|
| 离线同步 | 关网→提交交易→联网 | 自动同步，数据一致 | [ ] |
| 重复提交 | 快速双击提交按钮 | 仅记录一笔 | [ ] |
| 权限隔离 | Driver 查看交易 | 仅看自己的 | [ ] |
| 照片完整 | 离线提交→同步 | 照片成功上传 | [ ] |
| 内存稳定 | 长期使用 | 内存占用稳定 | [ ] |

---

## 5 上线决策

### 当前状态
**不建议上线**（存在 Critical 缺陷）

### 修复后状态
**建议上线**（修复 3 个 Blocking 项后）

### 上线可交付物
1. 修复所有 Blocking 项 + High 优先级项
2. 所有测试通过（静态 + 单元 + E2E）
3. 生产构建成功
4. 人工验证清单完成
5. 修改记录和验证报告

---

## 附录：问题完整清单

### Critical (5 个)
1. RLS 权限隔离无前端验证
2. markSynced 无数据验证
3. photoUrl 丢失导致数据不完整
4. 离线恢复时重复同步
5. useAuthBootstrap 会话恢复（需进一步审查）

### High (4 个)
6. isOnline 状态滞后 15 秒
7. flushQueue 无整体超时
8. realtime 订阅清理不完整
9. localStorage 降级失败

### Medium (3 个)
10. 错误分类不完整
11. GPS 心跳与同步竞争
12. E2E 测试覆盖不足

---

**报告生成时间**: 2026-04-22 03:50 UTC  
**审查人**: Hermes Agent  
**建议**: 立即启动修复计划，预计 1-2 周内完成
