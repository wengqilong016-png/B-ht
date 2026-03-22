# B-ht 项目全面审查（2026-03-22）

> 范围：业务结构、前端架构、安全、Supabase 集成、移动端打包、离线同步、定位功能、测试覆盖率、目录规范、可维护性。

## 1) 业务结构

### 现状
- 业务主线清晰：同一套系统支持管理员与司机两类角色，登录后按角色分流。
- 司机端闭环完整：选点位 → 采集读数/照片/定位 → 提交交易/结算。
- 管理端具备运营视角：司机管理、交易审核、结算、地图追踪、AI 日志。

### 问题
- “业务规则”散落在页面组件、hooks、工具函数中，规则与界面耦合严重。
- 事务边界不清：例如交易、司机状态、结算更新多处并发写 Supabase，缺少统一业务服务层。

### 可执行建议
1. 新增 `domain/`（或 `modules/`）目录，把“交易、结算、司机、点位”各自拆成用例层（use-cases）。
2. 所有“写操作”统一走 service/use-case，不允许 UI 组件直接拼接 upsert/update。
3. 把审批流（pending/approved/rejected）封装为状态机，避免字符串散落。

---

## 2) 前端架构

### 现状
- 使用 React + React Query + Context，已经有“认证/数据/变更”上下文分层。
- 有 admin/driver 角色壳层，路由入口较直观。

### 问题
- `App.tsx` 过重，承担初始化、鉴权、数据回退、离线同步、角色过滤等多种职责。
- 组件目录按“页面 + 功能”混搭，`components/` 与 `driver/components/`、`admin/` 的边界不一致。
- 状态来源较多（Query Cache + localDB + offlineQueue + localStorage fallback），排障成本高。

### 可执行建议
1. 拆分 `App.tsx`：`bootstrap`、`session-gate`、`shell-router` 三层。
2. 采用 feature-first 结构：`features/transactions`、`features/settlements` 等，每个 feature 自带 ui/hooks/service/types。
3. 明确“单一真相源”：线上以 Supabase + React Query 为主，离线采用统一 repository 适配，不再多套 fallback 并行。

---

## 3) 安全

### 现状
- 数据库层有 RLS 与角色函数（admin/driver）策略，方向正确。
- Edge Function `create-driver` 实现了 admin 鉴权与异常回滚，基础安全意识较好。

### 主要风险
1. **客户端硬编码 Supabase URL 与 anon key**（虽是 anon key，但泄露管理不规范，且会降低环境隔离能力）。
2. **README 出现默认账号与弱口令示例**，容易被误用于生产。
3. `SECURITY.md` 仍是模板内容，缺少真实漏洞响应 SLA、披露流程与联系人。
4. Android Manifest 仍包含旧版外部存储权限，且背景定位权限使用场景与合规说明不足。

### 可执行建议
1. 立即移除硬编码凭证，仅允许 `env` 注入；轮换 anon key。
2. 默认账号改为“仅本地 seed”，生产环境部署脚本强制随机密码。
3. 补齐正式安全运营文档：漏洞分级、响应时限、密钥轮换 Runbook、日志留存策略。
4. 审核最小权限：移除不必要存储权限；背景定位改为按业务开关与显式告知。

---

## 4) Supabase 集成

### 现状
- 已使用 Auth + RLS + Realtime + Edge Functions，体系完整。
- driver GPS/交易实时订阅已接入，管理员实时可见性较好。

### 问题
- 前端直接大量 `from(...).upsert/update`，缺少后端聚合 API；业务一致性依赖客户端实现细节。
- migration 命名与时间线不统一，维护成本偏高。
- 缺少明确的“schema 版本与前端发布版本对应表”。

### 可执行建议
1. 高频关键写操作（交易提交、结算确认、审批）迁移到 RPC/Edge Function，前端只调用单一入口。
2. 建立 migration 规范：`YYYYMMDDHHMM__feature.sql`，每次只做单一变更。
3. 增加 `db-contract-tests`（最少覆盖 RLS 读写、角色越权、关键 RPC 成功/失败分支）。

---

## 5) 移动端打包

### 现状
- 已接入 Capacitor，Android 工程可构建，脚本齐全（sync/build/open）。
- 有移动端构建文档，具备交付基础。

### 问题
- 文档提及的插件（camera/network）与 `package.json` 依赖不完全一致，存在“文档-实现漂移”。
- iOS 侧仅有指导，无 CI 验证链路。
- Android 权限偏宽，未体现 Android 13+ 精细权限实践。

### 可执行建议
1. 建立 mobile capability 清单（代码实际依赖自动扫描 + 文档自动校验）。
2. 增加 Android release 与 iOS build 的 CI smoke（至少编译通过）。
3. 权限最小化整改并补齐隐私说明文案（定位、相机、存储）。

---

## 6) 离线同步

### 现状
- 有 IndexedDB 队列 + localStorage fallback + reconnect 自动 flush。
- 有 Service Worker 与后台同步 tag，具备基础离线可用性。

### 问题
1. 队列语义偏“尽力而为”，缺少幂等键、冲突策略、失败重试退避与死信队列。
2. `flushQueue` 单条循环 upsert，缺乏批量与事务性保证。
3. 业务对象离线策略不统一（transactions/settlements/ai logs 行为不一致）。

### 可执行建议
1. 定义统一离线协议：`operationId`、`entityVersion`、`retryCount`、`lastError`、`nextRetryAt`。
2. 引入指数退避 + 最大重试 + 死信视图（管理员可见失败项）。
3. 对关键数据增加服务端幂等约束（唯一索引或 RPC 幂等键）。

---

## 7) 定位功能

### 现状
- 有 GPS 心跳上报（司机在线且网络可用时）与采集流程内定位请求。
- 有 EXIF 读取与上下文估算兜底。

### 问题
- Web 端主要使用 `navigator.geolocation`，Capacitor Geolocation 并未形成统一抽象层，跨平台行为不一致。
- 后台定位策略与电量策略（前台/后台/低电）未统一配置。
- 隐私告知与权限拒绝后的降级路径不够显式。

### 可执行建议
1. 新建 `LocationService`：统一封装 Web + Capacitor，提供同一接口与错误码。
2. 位置上报分层：实时心跳（低频）+ 采集点位校验（高精度一次性）。
3. 增加“定位健康状态”UI（权限、最近上报时间、精度），便于现场排障。

---

## 8) 测试覆盖率

### 现状
- 已有单测集（i18n、utils、offlineQueue、geolocation 等）。
- Jest 配置了 coverage threshold（30%）。

### 问题
- 实测覆盖率远低于阈值，当前 CI 基本无法反映真实质量。
- 关键路径（鉴权、RLS 边界、离线冲突、核心页面交互）缺少集成测试/E2E。
- Geolocation 测试偏“接口 mock 正常性”，缺少业务断言（例如权限拒绝时流程行为）。

### 可执行建议
1. 分层目标：单测 40%→55%，集成测试覆盖交易与结算主流程，E2E 覆盖登录与提交流程。
2. 先补 6 条关键用例：登录恢复、离线提交、重连回放、司机越权失败、管理员审批、定位拒绝降级。
3. coverage 门槛改为“按目录分层阈值”，避免全局阈值被噪音掩盖。

---

## 9) 目录规范

### 现状
- 已有 admin、driver、shared、hooks、services 等模块基础。
- 存在 `driver-app/` 子应用，具备多端策略意识。

### 问题
- 根目录历史文档与总结文件较多，噪声较高。
- `components/` 与 `admin/`、`driver/` 并存，职责边界模糊。
- `driver-app/` 与主应用并行，但共享策略未制度化（类型、SDK 版本漂移风险）。

### 可执行建议
1. 推行目录约定：`apps/admin`、`apps/driver`、`packages/shared`（渐进迁移）。
2. 根目录只保留“入口配置 + 核心文档”，其余归档到 `docs/adr/`、`docs/reports/`。
3. 建立 lint 规则与 import boundaries，禁止跨层随意引用。

---

## 10) 可维护性

### 现状
- TypeScript 覆盖广，注释较多，已有一定工程化基础。

### 问题
- 当前存在 TypeScript 编译错误，说明主干稳定性不足。
- 大文件组件较多（300~500 行常见），认知负荷高。
- 业务常量与硬编码字符串分散，多语言与状态枚举没有统一规范。

### 可执行建议
1. 先把 `typecheck` 与 `test` 变为“必须绿灯”的合并门禁。
2. 设定文件复杂度阈值（例如 >250 行拆分；圈复杂度 >12 告警）。
3. 抽离统一领域常量与枚举（交易状态、审批状态、错误码）。

---

# 按你要求的 5 个输出

## 1. 项目现状总结
- 这是一个“功能完整但工程一致性不足”的项目：业务闭环已经跑通，管理员/司机双角色、离线、定位、Supabase 实时能力都有。
- 当前短板不在“有没有功能”，而在“规则是否可控、风险是否可管理、发布是否可持续”。

## 2. 主要风险（按严重度）
1. **安全与配置风险**：客户端内置 Supabase 凭证、默认弱口令示例、安全流程文档缺失。
2. **质量门禁风险**：测试覆盖率远低于门槛且 typecheck 有报错，意味着回归风险高。
3. **离线一致性风险**：离线队列缺少幂等与冲突治理，规模化后容易出现重复/脏数据。
4. **架构演进风险**：App 入口与核心 hooks 过重，功能继续叠加会快速失控。

## 3. 最值得保留的部分
- Supabase 架构方向（Auth + RLS + Realtime + Edge Function）是正确路线，继续深化即可。
- 司机端采集流程（拍照/AI/定位/离线）具备真实业务可用性。
- React Query + 本地缓存 + 自动重连同步这条链路具备离线优先潜力。

## 4. 最该重构的部分
- **第一优先：数据写入与离线同步层**（统一 service + 幂等协议 + 冲突策略）。
- **第二优先：App 启动与状态组织**（拆 `App.tsx`，收敛数据来源，减少全局副作用）。
- **第三优先：安全与配置治理**（去硬编码凭证、补齐安全流程、权限最小化）。

## 5. 按优先级排序的落地改造清单

### P0（1~2 周，必须先做）
1. 移除硬编码 Supabase 凭证，完成 key 轮换与环境变量校验。
2. 修复全部 TypeScript 报错；把 `npm run typecheck` 设为 CI 必过。
3. 把默认账号/默认密码从 README 主流程移除，改成本地开发专用脚本。
4. 统一关键写操作入口（交易提交、结算、审批）到 RPC/Edge Function。

### P1（2~4 周，稳定性提升）
5. 离线队列升级为幂等协议 + 指数退避 + 死信队列。
6. 建立 `LocationService` 统一 Web/Capacitor 定位实现，补齐权限拒绝降级。
7. 拆分 `App.tsx` 并引入 feature-first 目录，限制跨层引用。
8. 增加 6 条关键集成测试并把覆盖率拉到可用区间（先 40% 以上）。

### P2（1~2 月，长期演进）
9. 推进 `apps/* + packages/shared` 的多应用结构，消除 driver-app 与主应用漂移。
10. 建立 ADR（架构决策记录）与 migration 发布说明模板，保障团队协作一致性。
11. 移动端 CI 化（Android/iOS 至少编译通过），并完成权限最小化与隐私文案整改。
