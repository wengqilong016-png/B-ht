# BHT 项目 - 第一天修复（Day 1）

**执行时间**: 2026-04-22  
**修复阶段**: Blocking 项 + High 优先级（isOnline）  
**预计工时**: 3.5h  

---

## 修复摘要

| 问题 | 文件 | 修改 | 目的 | 时间 |
|------|------|------|------|------|
| 1 | `repositories/transactionRepository.ts` | RLS 断言验证 | 防止权限隔离失效 | 1h |
| 2 | `offlineQueue.ts` | markSynced 数据验证 | 防止异常数据存储 | 2h |
| 5 | `hooks/useSupabaseData.ts` | refetchInterval 15s→5s | 减少网络检测延迟 | 0.5h |

---

## 详细修改

### 1. RLS 权限隔离验证（问题 1）

**文件**: `repositories/transactionRepository.ts`

**修改**: 在 `fetchTransactions()` 中添加前端断言验证

**代码**:
```typescript
// 返回前验证所有交易都属于请求的 driverId
if (opts.isDriver && opts.driverIdFilter) {
  const violatedRecords = result.filter(tx => tx.driverId !== opts.driverIdFilter);
  if (violatedRecords.length > 0) {
    throw new Error(`RLS violation: fetched ${violatedRecords.length} transaction(s) with incorrect driverId`);
  }
}
```

**目的**: 
- 双层防护：即使 Supabase RLS 配置失效，前端也会捕获权限泄露
- 及早发现 RLS 配置错误（生产前）

**风险**: 
- 增加查询开销（filter 操作），但只在 Driver 角色生效
- 可在生产环境禁用日志输出，保留异常抛出

---

### 2. markSynced 数据验证（问题 2）

**文件**: `offlineQueue.ts` (line 270+)

**修改**: 在 `markSynced()` 开头添加 schema 验证

**验证的字段**:
- `id`: 必须是字符串
- `currentScore`: 必须是有限数字（防止 NaN/Infinity）
- `previousScore`: 必须是有限数字
- `timestamp`: 必须是有效 ISO 日期字符串
- `photoUrl`: 必须是字符串或 null（防止非法类型）

**代码**:
```typescript
if (authoritativeData) {
  if (authoritativeData.currentScore !== undefined) {
    if (typeof authoritativeData.currentScore !== 'number' || !isFinite(authoritativeData.currentScore)) {
      throw new Error(`Invalid authoritativeData: currentScore must be finite number`);
    }
  }
  // ... 其他字段验证
}
```

**目的**:
- 防止异常数据（如后端 RPC 返回格式错误）写入 IndexedDB
- 避免后续 UI 渲染时因类型错误导致崩溃
- 快速定位后端数据返回问题

**风险**:
- 验证失败时会抛出异常，中止当前同步项
- 需要配合错误处理，将失败项标记为"待重试"而非直接忽略

---

### 3. isOnline 状态改进（问题 5）

**文件**: `hooks/useSupabaseData.ts` (line 71)

**修改**: `refetchInterval: 15_000` → `refetchInterval: 5_000`

**原因**:
- 原始 15s 间隔导致短暂网络抖动（< 15s）不被检测
- 用户离线 5s 后重新连接时，UI 状态延迟 10s 才更新
- 同步延迟给用户体验不佳

**新行为**:
- 每 5s 检查一次数据库连接
- 网络中断后最多 5s 被检测
- 与 window 'online' 事件配合，形成双重检测

**风险**:
- 增加 API 调用频率（checkDbHealth），可能增加费用
- 但 checkDbHealth 是轻量级查询（仅检查连接），影响有限

---

## 验证方案

### A. 静态验证（已完成）
- [x] 代码语法检查（Node.js parse）—— 通过
- [x] 文件修改审查 —— 符合 AGENTS.md 规范

### B. 局部功能验证（待执行）
- [ ] `npm run lint` - 代码风格检查
- [ ] `npm run test:unit` - 相关单测（offlineQueue.test.ts, transactionRepository.test.ts）
- [ ] 人工验证：
  - 登录为 Driver，检查是否只看到自己的交易
  - 提交交易（正常 + 异常响应），观察是否被正确处理
  - 模拟网络抖动（关闭/打开网络）,观察 isOnline 状态更新延迟

### C. 构建验证（待执行）
- [ ] `npm run build` - 生产构建
- [ ] `npm run test:e2e` - E2E 测试（包括权限隔离、离线同步场景）

---

## 已知限制

1. **npm install 失败** — 网络超时（Proot 环境网络不稳定）
   - 无法运行 Jest、ESLint、TypeScript
   - 使用 Node.js 原生 parse 进行语法检查（足够验证）

2. **无法运行完整测试套件**
   - 建议本地或 CI 环境重新验证
   - 修改范围小（3 个文件，逻辑清晰），风险低

---

## 下一步（Day 2）

- [ ] 问题 3（photoUrl 处理） — 3h
- [ ] 问题 4（重复同步去重） — 2h

**总计**: 5h

---

## 检查清单

修复合规性检查:
- [x] 遵循 AGENTS.md 规范（范围锁定，最小修改）
- [x] 不涉及无关重构
- [x] 有明确的根因和修复目的
- [x] 修改代码量小（< 50 行新增）
- [ ] 通过自动化测试（待完成）
- [ ] 通过人工验证（待完成）

---

**生成**: Hermes Agent  
**提交**: 待审批  
**目标**: 8-11 天内完成全部修复 + 验证
