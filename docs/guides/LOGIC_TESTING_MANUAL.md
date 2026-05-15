# BHT 逻辑测试使用手册

> 适用项目: Bahati Jackpots PWA / Admin / Driver / Supabase
> 适用对象: 接手工程师、功能开发工程师、测试工程师、值班支持工程师
> 核心原则: 任何业务改动都必须沿真实链路验证，不只测单个函数。

---

## 1. 测试目标

本手册用于规范本项目的逻辑测试方式，确保每次修改都能覆盖以下链路：

```text
页面/组件
  -> hook/context
  -> service
  -> repository
  -> Supabase RPC / DB / RLS / Edge Function
  -> 本地缓存 / 离线队列 / 副作用
```

逻辑测试不是只证明代码能运行，而是证明业务状态在不同入口、网络状态、权限角色、缓存状态和异常分支下都保持一致。

---

## 2. 项目测试分层

### 2.1 单元测试

位置:

```text
__tests__/*.test.ts
__tests__/*.test.tsx
```

主要覆盖:

- `services/*`: 业务计算、提交编排、审计、认证、更新检查。
- `hooks/*`: 状态机、同步状态、认证启动、实时订阅。
- `driver/hooks/*`: 司机端提交完成、草稿、下一台机器选择。
- `repositories/*`: Supabase table / RPC / Edge Function 调用封装。
- `utils/*`: 财务规则、日期、身份归一、坐标、字段清洗。
- `offlineQueue.ts`: 离线入队、回放、死信、重试、fallback。

常用命令:

```bash
npm test -- --runInBand
npm run test:unit -- --runInBand
npm run test:integration -- --runInBand
npm run test:coverage:ci -- --runInBand
```

### 2.2 组件与 Hook 测试

位置示例:

```text
__tests__/QuickCollect.test.tsx
__tests__/DriverGrid.test.tsx
__tests__/SettlementTab.test.tsx
__tests__/useCollectionSubmission.test.ts
__tests__/useAuthBootstrap.test.ts
```

必须验证:

- UI 输入如何变成 service 参数。
- loading / submitting / success / error 状态是否正确流转。
- 用户重复点击、空输入、非法输入是否被拦截。
- React Query cache 是否被更新或失效。
- toast、telemetry、audit log 等副作用是否按预期触发。

### 2.3 集成测试

位置:

```text
__tests__/integration/*.test.ts
```

主要覆盖:

- 认证链路。
- 收款提交流。
- 离线同步流。

集成测试必须尽量从一个真实入口开始，例如从 hook 或 service 编排层进入，而不是直接调用最底层工具函数。

### 2.4 Playwright E2E 测试

位置:

```text
e2e/*.spec.ts
```

常用命令:

```bash
VITE_DISABLE_AUTH=true \
VITE_SUPABASE_URL=http://localhost:54321 \
VITE_SUPABASE_ANON_KEY=test-anon-key \
npm run test:e2e
```

E2E 用于验证真实页面路径:

- 登录页加载与 profile 获取。
- 司机收款 happy path。
- 离线提交入队与恢复同步。
- 权限隔离，例如司机只能看到自己的 transactions。
- 静态资源、manifest、service worker。

---

## 3. 必跑门禁

### 3.1 本地快速门禁

开发一个小改动后至少运行:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

### 3.2 接近 CI 的完整门禁

准备合并或推送前运行:

```bash
node scripts/sync-pwa-cache-version.cjs --check
npm run typecheck
npm run lint
npm run security:audit
npm run test:coverage:ci -- --runInBand
npm run build
```

如果改动影响页面主路径、认证、离线、收款、权限、缓存或 PWA 行为，还必须运行:

```bash
VITE_DISABLE_AUTH=true \
VITE_SUPABASE_URL=http://localhost:54321 \
VITE_SUPABASE_ANON_KEY=test-anon-key \
npm run test:e2e
```

### 3.3 CI 对应关系

当前 `.github/workflows/ci.yml` 包含:

- Type Check: `npm run typecheck`
- Lint: `npm run lint`
- Security Audit: `npm run security:audit`
- Unit, Integration & Coverage: `npm run test:coverage:ci`
- E2E Tests: `npm run test:e2e`
- Production Build: `npm run build`

本地修复必须尽量复现这些命令，不能只跑单个相关测试就结束。

---

## 4. 逻辑测试编写流程

每个缺陷或功能改动按以下顺序写测试。

### 4.1 先画真实链路

在动代码前确认:

```text
入口组件是谁
状态来自哪个 hook/context
参数在哪里组装
service 是否做编排或降级
repository 调哪个 table/RPC/Edge Function
数据库函数/RLS/trigger 是否改变业务语义
是否有缓存、离线队列、localDB、toast、telemetry、副作用
```

示例: 司机收款提交链路

```text
QuickCollect / DriverCollectionFlow
  -> SubmitReview / useCollectionSubmission
  -> collectionSubmissionOrchestrator
  -> collectionSubmissionService.submitCollectionV2
  -> supabase.rpc('submit_collection_v2')
  -> transactions / locations / audit / queue health
```

### 4.2 再定测试入口

按风险选择最合适的入口:

| 改动类型 | 首选测试入口 |
| --- | --- |
| 纯计算、字段归一、规则判断 | `utils` 或 `services` 单元测试 |
| UI 参数组装或按钮状态 | 组件测试 |
| hook 状态机 | hook 测试 |
| 提交、离线、回放、降级 | service / integration 测试 |
| Supabase 调用封装 | repository 测试 |
| 用户完整路径 | Playwright E2E |
| RLS / migration / RPC 语义 | SQL 验证 + repository/service 测试 |

### 4.3 写失败用例

修 bug 时先写能失败的测试，测试名应描述业务事实:

```typescript
it('falls back to offline queue when submit_collection_v2 returns a transient network error', async () => {
  // ...
});
```

不要使用只描述实现的名字:

```typescript
it('calls function correctly', async () => {
  // 不推荐
});
```

### 4.4 最小修复

修复只改真实根因所在层。

- UI 只负责输入、展示、交互锁。
- hook 只负责状态机和上下文连接。
- service 负责业务编排、降级和错误分类。
- repository 只封装 Supabase 调用，不塞 UI 规则。
- SQL/RPC 负责服务端权威计算、权限和并发一致性。

### 4.5 跑相关测试再跑门禁

先跑最小相关测试:

```bash
npm test -- collectionSubmissionOrchestrator --runInBand
npm test -- offlineQueueReplay --runInBand
```

再跑完整门禁:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

---

## 5. 核心业务链路测试清单

### 5.1 收款提交

覆盖文件参考:

```text
__tests__/collectionSubmissionService.test.ts
__tests__/collectionSubmissionOrchestrator.test.ts
__tests__/collectionSubmissionAudit.test.ts
__tests__/useCollectionSubmission.test.ts
__tests__/driverCollectionFlowKeyPath.test.tsx
e2e/driver-collection-flow.spec.ts
e2e/driver-collection-flow.local-supabase.spec.ts
```

必须覆盖:

- 分数为空、非数字、低于 `lastScore`。
- 有照片、无照片、照片上传失败。
- GPS live / EXIF / estimated / none。
- 在线成功走 `submit_collection_v2`。
- 在线失败时只对 transient 错误降级离线。
- 离线时入队，保留 `rawInput`。
- server 返回重复 `txId` 时视为幂等成功。
- 服务端成功后以服务器 transaction 为准，不使用本地财务结果覆盖。
- 成功后更新 `locations`、`transactions` cache 和 localDB。
- audit / telemetry 事件包含必要上下文。

### 5.2 离线队列与同步

覆盖文件参考:

```text
__tests__/offlineQueue.test.ts
__tests__/offlineQueueReplay.test.ts
__tests__/offlineQueueDiagnostics.test.ts
__tests__/offlineQueueObservability.test.ts
__tests__/manualReplay.test.ts
__tests__/integration/offlineSyncFlow.test.ts
e2e/offline-sync-reliability.spec.ts
```

必须覆盖:

- IndexedDB 可用时写入 IDB。
- IDB 不可用时 fallback 到 localStorage。
- localStorage 不可用时 fallback 到 memory。
- transient 错误进入指数退避。
- permanent 错误进入 dead-letter。
- `Authentication required` 归类为 transient，因为重新登录可恢复。
- 权限、外键、非法输入、not found 归类为 permanent。
- 缺少 replay callback 时不能静默丢失，必须 dead-letter。
- 手动 replay 成功后清理或标记同步。
- pending / retry-waiting / dead-letter 统计准确。

### 5.3 司机与地点管理

覆盖文件参考:

```text
__tests__/driverManagementService.test.ts
__tests__/DriverGrid.test.tsx
__tests__/machineSelectorAssignmentGuard.test.tsx
__tests__/locationWorkflow.test.ts
__tests__/repositories.test.ts
```

必须覆盖:

- 创建司机调用 Edge Function，不绕过 Auth/profile 创建。
- 删除司机调用 `delete-driver` Edge Function。
- 司机地点分配变更时 drivers 和 locations 状态一致。
- 乐观更新失败后回滚。
- 离线时禁止服务端变更或给出明确错误。
- 同一机器不能被多个司机错误持有。
- driver/profile/auth_user id 归一逻辑正确。

### 5.4 审批、结算、工资

覆盖文件参考:

```text
__tests__/approvalRepository.test.ts
__tests__/settlementRepositoryActions.test.ts
__tests__/settlementWorkflowFlow.test.tsx
__tests__/monthlyPayrollRepository.test.ts
__tests__/SettlementTab.test.tsx
__tests__/PayrollActionModal.test.tsx
```

必须覆盖:

- approve / reject / reset request 参数完整。
- settlement paid / unpaid / pending 状态转换正确。
- 零收入结算保护逻辑不被绕过。
- 工资月份、司机、状态过滤准确。
- repository 调用失败向上传播，不吞错。
- UI 操作成功后缓存失效或更新。

### 5.5 认证与权限

覆盖文件参考:

```text
__tests__/authService.test.ts
__tests__/appAuthFlow.test.tsx
__tests__/loginProfileFlow.test.tsx
__tests__/supabaseRoleScope.test.ts
e2e/login.spec.ts
```

必须覆盖:

- 登录成功后读取 profile 并进入正确 shell。
- admin / driver 路由隔离。
- driver 查询范围只能包含自己的数据。
- profile 缺失、role 缺失、driver_id 缺失有明确错误。
- session restore 后状态不闪退。
- sign out 清理本地状态。

### 5.6 Realtime、缓存与本地 DB

覆盖文件参考:

```text
__tests__/useRealtimeSubscription.test.ts
__tests__/useRealtimeSubscriptionHook.test.tsx
__tests__/localDB.test.ts
__tests__/useSyncStatus.test.ts
```

必须覆盖:

- realtime channel 只在中心 hook 中订阅。
- 事件去重和 debounce 生效。
- 相关 query key 被正确 invalidate。
- localDB 读写失败不会导致页面崩溃。
- sync status 对 pending、retry、dead-letter 的展示准确。

---

## 6. Mock 与测试数据规范

### 6.1 Supabase Mock

repository/service 测试中应 mock Supabase client，并断言调用参数。

推荐断言:

- table 名称。
- select / insert / update / upsert / delete 参数。
- `.eq()` 的字段和值。
- RPC 名称和 payload。
- Edge Function 名称和 body。

不要只断言“被调用过”。

### 6.2 业务对象工厂

测试中使用本地工厂函数构造最小对象:

```typescript
function makeLocation(overrides = {}) {
  return {
    id: 'loc-1',
    name: 'Test Location',
    machineId: 'M-1',
    commissionRate: 0.2,
    lastScore: 100,
    coords: { lat: -6.8, lng: 39.2 },
    ...overrides,
  };
}
```

工厂对象必须包含被测逻辑真正依赖的字段，避免复制完整生产对象造成测试噪声。

### 6.3 时间、UUID、网络状态

涉及时间、UUID、网络状态时必须固定输入:

- 使用固定 ISO 时间。
- mock `crypto.randomUUID` 或传入 `draftTxId`。
- 显式设置 `isOnline`。
- 不依赖真实网络。

### 6.4 浏览器 API

`jest.setup.js` 已统一 mock:

- `matchMedia`
- `IntersectionObserver`
- `ResizeObserver`
- Leaflet
- Supabase client
- Capacitor Geolocation
- Sentry

新增浏览器 API 时，应优先加到具体测试内；多个测试复用时再放入 `jest.setup.js`。

---

## 7. 权限与分支测试规则

每个涉及数据读写的改动至少考虑以下角色:

| 角色 | 必测点 |
| --- | --- |
| admin | 可读写管理端数据，操作失败应有回滚或错误提示 |
| driver | 只能读取和提交自己范围内的数据 |
| 未登录 | 不能进入受保护 shell |
| profile 异常用户 | 不能静默进入错误角色 |

每个涉及网络的改动至少考虑:

| 状态 | 必测点 |
| --- | --- |
| online success | 服务端成功路径 |
| online transient failure | 是否允许离线降级或重试 |
| online permanent failure | 是否阻止降级并给出错误 |
| offline | 是否使用本地队列或禁用操作 |
| reconnect | 是否自动 flush 并更新缓存 |

---

## 8. 数据库、RPC、Migration 测试规则

修改 `supabase/migrations/*`、RPC、RLS、trigger 时必须额外检查:

```bash
supabase db lint
supabase migration list
```

如果本地 Supabase 已配置，可执行:

```bash
supabase db reset
```

数据库相关改动必须提供以下至少一种验证:

- SQL 级别验证语句。
- repository/service 测试验证 RPC payload。
- E2E 或 integration 测试验证用户路径。
- GitHub Actions 的 Supabase validation workflow 通过。

重点 RPC:

- `submit_collection_v2`
- `calculate_finance_v2`
- settlement / approval 相关 action RPC
- driver / location change 相关 RPC

重点检查:

- `SECURITY DEFINER` 函数是否设置安全 `search_path`。
- RLS 是否允许目标角色访问，且不扩大权限。
- `ON CONFLICT` 是否保持幂等。
- money / numeric / integer 类型是否一致。
- trigger 是否造成重复副作用。

---

## 9. 缺陷回归测试模板

修复 bug 时，在 PR 或提交说明中记录:

```text
问题:
  用户做了什么，看到什么错误。

真实根因:
  错误发生在哪一层，哪个状态或参数传错。

修复:
  改了哪个文件，为什么是最小修复。

新增测试:
  - 测试文件:
  - 覆盖分支:
  - 失败前表现:
  - 修复后表现:

验证命令:
  - npm run typecheck
  - npm run lint
  - npm test -- --runInBand
  - npm run build
```

---

## 10. 推荐测试命名

使用业务事实命名:

```typescript
it('queues a collection with rawInput when the browser is offline', async () => {});
it('does not let a driver see another driver transaction', async () => {});
it('rolls back driver cache when the repository update fails', async () => {});
it('classifies permission denied as a permanent offline replay error', async () => {});
```

避免模糊命名:

```typescript
it('works', async () => {});
it('handles error', async () => {});
it('calls api', async () => {});
```

---

## 11. 提交前检查清单

合并或推送前确认:

- [ ] 已从真实用户入口追踪到数据落点。
- [ ] 已覆盖 online / offline / retry / permanent failure 中受影响的分支。
- [ ] 已覆盖 admin / driver / 未登录中受影响的角色。
- [ ] 已覆盖缓存更新、缓存失效或 localDB 副作用。
- [ ] 已覆盖 telemetry / audit / toast 等用户可见或运维可见副作用。
- [ ] 已跑相关测试。
- [ ] 已跑 `typecheck`、`lint`、`test`、`build`。
- [ ] 数据库改动已验证 migration/RPC/RLS。
- [ ] `git diff --check` 无空白错误。
- [ ] `git status` 只包含本次任务相关文件。

---

## 12. 常用定位命令

查找业务入口:

```bash
rg "orchestrateCollectionSubmission|submitCollectionV2|flushQueue|useCollectionSubmission"
```

查找 Supabase RPC:

```bash
rg "rpc\\(|submit_collection_v2|calculate_finance_v2"
```

查找 repository 调用:

```bash
rg "from\\(|functions.invoke|upsert|delete\\(" repositories services hooks
```

查找缓存副作用:

```bash
rg "setQueryData|invalidateQueries|localDB|enqueueTransaction|flushQueue"
```

查找权限分支:

```bash
rg "role|driver_id|driverId|isAdmin|isDriver|profile"
```

---

## 13. 本项目优先保护的业务不变量

测试应优先保护以下不变量:

- 服务器是在线收款的最终财务权威。
- 离线队列必须保留可回放的 `rawInput`。
- 同一个 `txId` 重放必须幂等。
- permanent 错误不能无限重试。
- transient 错误不能直接丢弃。
- 司机不能读取或修改其他司机的数据。
- 管理端乐观更新失败必须回滚。
- 删除司机必须经过 Edge Function，不能只删 public table。
- PWA manifest、service worker、版本清单改动不能破坏构建。
- Realtime 订阅集中在 `useRealtimeSubscription`，避免重复订阅和缓存抖动。

