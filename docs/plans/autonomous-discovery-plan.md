# BHT 自主发现与接手管理计划

> 生效日期: 2026-05-15
> 负责人模式: Codex 接手式巡检、定位、修复、验证、推送、CI 跟踪
> 当前基线: `main` / `22aa102`，CI、Vercel、Android APK、CodeQL 均已通过

---

## 1. 接手目标

本计划用于把 BHT 项目从“被动修 bug”切换为“主动发现、主动验证、主动收敛风险”的维护方式。

目标不是积累报告，而是持续输出可验证的结果:

- 发现真实问题，而不是复述旧审计结论。
- 沿页面、hook/context、service、repository、RPC/DB 全链路定位根因。
- 优先修复会造成资金、权限、数据一致性、离线丢单、发布失败的问题。
- 每次修复都补测试、跑本地门禁、推送远端，并确认 CI/workflow 通过。
- 对外部阻塞点只保留可执行说明，例如需要轮换密钥、需要 Supabase Dashboard 操作、需要人工确认业务口径。

---

## 2. 工作原则

### 2.1 事实优先

历史报告只作为线索，不作为结论。每个问题必须重新取证:

```text
旧报告/用户反馈
  -> 当前代码搜索
  -> 当前测试或本地复现
  -> 数据库迁移/RPC/RLS 复核
  -> 最小修复
  -> 回归测试
  -> CI 通过
```

### 2.2 链路优先

任何业务问题都按链路排查:

```text
UI 入口
  -> hook/context 状态来源
  -> service 编排与降级
  -> repository 调用
  -> RPC / DB / RLS / Edge Function
  -> React Query cache / localDB / offlineQueue
  -> telemetry / audit / toast / realtime 副作用
```

### 2.3 最小修复

只改真实根因所在层:

- UI 层只修交互、输入、展示、按钮锁。
- hook/context 只修状态机、订阅、上下文边界。
- service 只修业务编排、降级、错误分类、审计。
- repository 只修 Supabase 调用契约。
- SQL/RPC/RLS 只修服务端权威逻辑、权限、一致性和并发。

---

## 3. 自主发现循环

### 3.1 每次接手前基线检查

固定执行:

```bash
git status --short --branch
git log -1 --oneline --decorate
gh run list --repo wengqilong016-png/bht --branch main --limit 10
```

目的:

- 确认工作区是否干净。
- 确认 `main` 与 `origin/main` 是否同步。
- 确认最新 workflow 状态。
- 避免覆盖用户未提交改动。

### 3.2 快速健康检查

固定执行:

```bash
node scripts/sync-pwa-cache-version.cjs --check
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

若改动涉及主路径、认证、离线、权限或缓存，追加:

```bash
npm run test:coverage:ci -- --runInBand
VITE_DISABLE_AUTH=true \
VITE_SUPABASE_URL=http://localhost:54321 \
VITE_SUPABASE_ANON_KEY=test-anon-key \
npm run test:e2e
```

### 3.3 深挖入口

每轮自主发现从以下入口选择一个主题，不并行发散:

| 主题 | 目标 |
| --- | --- |
| 收款提交 | 防止资金计算错误、重复提交、离线丢单 |
| 离线队列 | 防止 pending、retry、dead-letter 状态失真 |
| 权限/RLS | 防止司机越权读取或写入 |
| 司机/地点管理 | 防止分配错乱、删除残留、Auth/profile 不一致 |
| 审批/结算/工资 | 防止 paymentStatus、settlement、payroll 状态错配 |
| Realtime/cache | 防止缓存污染、重复订阅、UI 状态抖动 |
| 发布链路 | 防止 PWA、Vercel、Android APK、manifest 失效 |
| 安全配置 | 防止密钥、密码策略、Edge Function 权限风险 |

每个主题都必须产出以下一种结果:

- 修复提交。
- 测试增强提交。
- 文档修正提交。
- 明确的外部阻塞点。
- 明确的“复核后无需修复”记录。

---

## 4. 当前已知雷达

以下是 2026-05-15 接手时快速扫描得到的待复核项目。它们不是最终判定，必须按当前代码和运行结果重新验证。

| 编号 | 优先级 | 线索 | 当前证据 | 下一步 |
| --- | --- | --- | --- | --- |
| R1 | P1 | Dockerfile Node 版本可能与 package engines 不一致 | `Dockerfile` 使用 `node:20-slim`，`package.json` 要求 Node `22.x` | 复核 Dockerfile 是否仍用于生产或 CI；若使用，改为 Node 22 并跑 build |
| R2 | P1 | Supabase 密码最小长度偏低 | `supabase/config.toml` 为 `minimum_password_length = 6` | 确认业务登录口径；若无兼容阻塞，调到 8 并补说明 |
| R3 | P1 | `transactions.paymentStatus` schema 约束可能不足 | `supabase/schema.sql` 中 `paymentStatus` 是 TEXT；需要复核最终迁移是否已有 CHECK | 检查最新迁移链和 DB validation；必要时新增 CHECK 迁移 |
| R4 | P1 | schema.sql 可能与 migrations 漂移 | 历史报告提到 schema 漂移；当前迁移数量较多 | 用 Supabase CLI 或 schema diff 重新验证，避免旧报告误判 |
| R5 | P2 | 根目录保留 APK 二进制 | `bahati-v1.0.12-rpc-fix.apk` 存在于仓库根目录 | 确认是否仍需追踪；若不需，迁移到 release artifact 或清理 |
| R6 | P2 | 根目录临时脚本异常 | 根目录存在换行样式异常的 `python_script.py` 文件名显示 | 确认是否未使用调试残留；若无用，删除并补检查 |
| R7 | P2 | 历史报告与当前事实可能脱节 | 多份报告对同一问题状态描述不一致 | 建立“已复核/未复核/已修复/外部阻塞”的单一状态表 |
| R8 | P2 | Supabase mock 不模拟 RLS 过滤 | 历史报告提到 mock 过浅 | 检查 `__tests__/helpers` 与权限测试；必要时增强 dataset 过滤 |

---

## 5. 优先级规则

### P0 立即处理

满足任一条件即为 P0:

- 可能造成资金错误、重复结算、漏结算。
- 可能造成司机读取或修改其他司机数据。
- 可能造成收款数据丢失、离线队列不可回放。
- 可能泄露服务端密钥或管理凭据。
- `main` CI、Vercel、Android APK、CodeQL 失败。

### P1 本轮处理

满足任一条件即为 P1:

- 生产发布链路与项目 engines / runtime 不一致。
- 安全配置低于项目声明标准。
- 数据库 schema 与迁移存在可验证漂移。
- 权限测试覆盖不足，且相关路径是核心业务。
- 用户主路径存在 UI 与服务端状态不一致。

### P2 排期处理

满足任一条件即为 P2:

- 文档与代码状态不一致，但不直接影响运行。
- 测试可读性、mock 真实性、维护体验不足。
- 仓库卫生、历史产物、无用文件清理。
- 性能和可观测性优化。

---

## 6. 第一阶段计划

### 阶段 A: 项目卫生与发布一致性

目标:

- 修正或确认 Node runtime 一致性。
- 清理或确认根目录 APK、临时脚本。
- 确认 PWA manifest / service worker / version.json 生成路径。

验证:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
git diff --check
```

### 阶段 B: Supabase schema 与安全配置复核

目标:

- 复核 `schema.sql` 与 migrations 是否仍漂移。
- 复核 `paymentStatus` 是否需要 CHECK 约束。
- 复核密码最小长度从 6 调到 8 是否会影响现有账号。
- 复核历史敏感凭据是否仍在当前 tracked files 中。

验证:

```bash
rg "SUPABASE_ACCESS_TOKEN|service_role|anon" -n . -g '!node_modules' -g '!dist'
supabase db lint
```

若本地 Supabase 可用:

```bash
supabase db reset
```

### 阶段 C: 权限与 RLS 测试增强

目标:

- 增强 Supabase mock 或新增权限测试 dataset。
- 验证 driver 查询只能返回自己范围内的数据。
- 验证 admin 操作失败时乐观更新可回滚。

优先测试:

```bash
npm test -- supabaseRoleScope --runInBand
npm test -- repositories --runInBand
npm test -- appAuthFlow --runInBand
npm test -- loginProfileFlow --runInBand
```

### 阶段 D: 收款与离线链路回归

目标:

- 复核 `submit_collection_v2` 参数、幂等、错误降级。
- 复核 offline queue 的 rawInput、照片持久化、dead-letter、manual replay。
- 复核 QuickCollect 与 DriverCollectionFlow 两个入口是否一致。

优先测试:

```bash
npm test -- collectionSubmissionOrchestrator --runInBand
npm test -- collectionSubmissionService --runInBand
npm test -- offlineQueueReplay --runInBand
npm test -- driverCollectionFlowKeyPath --runInBand
npm run test:e2e
```

---

## 7. 每轮输出格式

每轮自主发现结束时，输出固定结构:

```text
本轮主题:
发现:
真实根因:
修复:
新增/更新测试:
本地验证:
远端状态:
遗留风险:
下一轮建议:
```

如果没有发现代码问题，也必须说明:

- 查了哪些链路。
- 哪些旧问题已经过期。
- 哪些风险仍需外部确认。

---

## 8. 提交与发布规则

每次改动必须遵守:

1. `git status --short --branch` 确认工作区范围。
2. 只提交本轮任务相关文件。
3. 提交信息使用清晰前缀:
   - `fix: ...`
   - `test: ...`
   - `docs: ...`
   - `chore: ...`
   - `ci: ...`
4. 推送后使用 `gh run list` 和 `gh run watch` 跟踪 workflow。
5. 如果 CI 失败，先查 job 日志并继续修到通过。
6. 如果失败是外部条件，例如缺失 secret、Supabase IP 限制、服务不可用，必须写明阻塞点和下一步人工动作。

---

## 9. 当前可执行下一步

推荐下一轮从 P1 开始:

1. 复核并修正 Dockerfile Node 版本。
2. 复核并修正 Supabase 密码最小长度。
3. 复核 `paymentStatus` CHECK 约束是否需要 migration。
4. 处理根目录 APK 和异常临时脚本的仓库卫生问题。

执行方式:

```text
一次只处理一个主题。
先复现/取证，再最小修复。
补测试或补验证说明。
跑门禁。
提交、推送、看 CI。
```
