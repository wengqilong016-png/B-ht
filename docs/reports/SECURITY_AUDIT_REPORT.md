# BHT 安全审计统一报告

> 审计日期：2026-05-06 | 审计范围：TypeScript 前端 + Supabase 后端（26张表、86个 SECURITY DEFINER 函数、50个 SQL 迁移文件）
> 
> 审计来源：T1 类型安全扫描（3个文件） + T2 SQL注入/权限扫描 + T3 RLS 策略审计

---

## 一、总览

| 维度 | 数量 | 状态 |
|------|------|------|
| CRITICAL | 3 | 必须立即修复 |
| MEDIUM | 8 | 应在本迭代修复 |
| LOW | 6 | 技术债，排入 backlog |
| INFO | 2 | 无风险，记录备查 |
| **合计** | **19** | |
| **总预估工时** | **14–19 小时** | |

## 二、总体评价

**正面：**
- 86 个 SECURITY DEFINER 函数全部设置了 search_path，无 SQL 注入风险（参数化查询全覆盖）
- 26 张表全部启用 RLS，无 public/anon 数据泄露
- TypeScript 代码整体类型安全性良好：0 个 `any` 类型，无 null crash 风险点，可选链和 `??` 守卫使用正确
- Edge Functions 全部参数化查询

**需改进：**
- 2 个 SECURITY DEFINER 函数缺少权限校验，任何已认证用户可绕过 RLS 直接操作财务数据
- 5 处 RLS 策略缺口（DELETE 缺失、管理员写入口缺失）
- GPS 类型断言无运行时验证，NaN 可静默污染经纬度数据
- 1 处 `!` 非空断言存在运行时崩溃风险

---

## 三、修复优先级列表（按经济风险排序）

### 🔴 CRITICAL — 必须立即修复

| # | 风险 | 严重度 | 影响 | 修复建议 | 文件 | 行号 | 预估工时 |
|---|------|--------|------|----------|------|------|----------|
| 1 | **SECURITY DEFINER 函数缺权限校验** — record_task_settlement 和 submit_daily_reconciliation 任何已认证用户可直接调用，绕过 RLS 篡改财务对账数据 | CRITICAL | 极高：可能导致资金数据被篡改，对账系统完全失效 | 在函数体内新增 auth.uid() 权限校验，确保调用者要么是 driver 本人要么是 admin 角色 | `supabase/schema.sql`（函数定义） | — | 4–6h |
| 2 | **GPS 类型断言无运行时验证** — `row['gps'] as {lat:number; lng:number}` 若服务端返回 `{lat:'abc'}` 则 `??` 不拦截，NaN 污染经纬度 | CRITICAL | 高：GPS 定位数据被污染后，收款位置追踪全部失效，影响对账和路线审核 | 运行时 `typeof lat === 'number' && typeof lng === 'number'` 校验，不是则 fallback 到 null | `services/collectionSubmissionService.ts` | 224 | 1h |
| 3 | **`!` 非空断言崩溃风险** — `getEntry` 调用 `find()!` 无 null guard，若 entry 不存在直接抛 TypeError 白屏 | CRITICAL | 高：司机端收款流程崩溃，无法提交收款，直接影响业务运转 | 将 `!` 改为 `??` 或 `if (!entry) return` 守卫 | `driver/components/QuickCollect.tsx` | 129 | 0.5h |

### 🟡 MEDIUM — 应在本迭代修复

| # | 风险 | 严重度 | 影响 | 修复建议 | 文件 | 行号 | 预估工时 |
|---|------|--------|------|----------|------|------|----------|
| 4 | **RLS 策略缺口 ×5** — 部分表 DELETE 无策略（数据不可删除）、driver-only 表无管理员写入口 | MEDIUM | 中：管理员无法在 Web 后台修正司机数据，运维受限 | 补齐 DELETE 策略 + 管理员 USING 子句 | `supabase/migrations/20260424000000_tighten_permissive_policies.sql` 等 | — | 3–4h |
| 5 | **NaN 通过 parseInt + ?? 传播** — `parseInt` 返回 NaN 时 `??` 不拦截，污染 `aiScore` 导致 `isAnomaly` 异常检测静默失效 | MEDIUM | 中：AI 异常评分功能失效，异常交易无法标记 | 用 `Number.isNaN()` 包裹 parseInt 结果，fallback 到 null/undefined | `services/collectionSubmissionOrchestrator.ts` | 205 | 0.5h |
| 6 | **双重断言类型矛盾** — L165 断言 `message:string`，L174 断言 `message?:string`，若 Supabase error 无 message 字段则落降级文案丢原始错误 | MEDIUM | 中：错误上报丢失关键信息，排查困难 | 统一为 `{message?:string}` 一种形态 | `services/collectionSubmissionService.ts` | 165/174 | 0.5h |
| 7 | **幽灵 i18n key** — `t.invalidScore` 和 `t.submitError` 在 zh.ts/sw.ts 中不存在，永远不会被翻译 | MEDIUM | 低–中：UI 显示原始 key 而非翻译文本，司机看到英文 key | 在 zh.ts 和 sw.ts 中添加对应翻译条目 | `i18n/zh.ts`, `i18n/sw.ts` | — | 1h |
| 8 | **setQueriesData 复数语义歧义** — 应使用 `setQueryData`（单数），当前 `setQueriesData` 会过度更新子查询缓存 | MEDIUM | 低：缓存更新范围过大，可能触发不必要的重渲染 | 改为 `setQueryData` | `driver/components/QuickCollect.tsx` | 250 | 0.5h |

### 🟢 LOW — 技术债，排入 backlog

| # | 风险 | 严重度 | 影响 | 修复建议 | 文件 | 行号 | 预估工时 |
|---|------|--------|------|----------|------|------|----------|
| 9 | 死代码可选链 — `selectedLocation?.status`，`selectedLocation` 始终有值 | LOW | 无运行时影响，仅代码意图不清 | 移除 `?.` | `services/collectionSubmissionOrchestrator.ts` | 209 | 0.25h |
| 10 | 冗余 Record 断言 — 同一 `data` 重复断言为 `Record<string,unknown>` | LOW | 无影响 | 删除重复断言 | `services/collectionSubmissionService.ts` | 181/203 | 0.25h |
| 11 | 枚举断言无运行时守卫 — `expenseType/expenseCategory/expenseStatus` 的 `as Transaction[...]` 断言，服务端返回 union 外值会静默通过 | LOW | 极低：后端约束已足够，前端为防御性编程 | 加运行时 includes 校验 | `services/collectionSubmissionService.ts` | 238–246 | 0.5h |
| 12 | 宽泛 Record 类型 — `Location` 应使用 `Location['status']` union 而非 `Record<string,string>` | LOW | 无运行时影响 | 改用 `Location['status']` | `driver/components/QuickCollect.tsx` | 67 | 0.25h |
| 13 | 魔法零坐标哨兵 — null GPS 变成 `{lat:0,lng:0}`，与编排器隐式约定 | LOW | 可能混淆真实数据和哨兵值 | 用 `null` 替代零坐标哨兵 | `driver/components/QuickCollect.tsx` | 245 | 0.5h |
| 14 | reader.result 类型静默跳过 — 无非字符串分支，若类型扩展则静默丢失 | LOW | 当前无影响 | 加 else 分支处理 | `driver/components/QuickCollect.tsx` | 387 | 0.25h |

### ℹ️ INFO — 记录备查，无需修复

| # | 内容 | 文件 | 说明 |
|---|------|------|------|
| 15 | `check_driver_transaction_rate` 的 search_path 在两次迁移中不一致（`''` → `public,pg_temp`），最终状态正确 | `migrations/20260506100000_fix_driver_transaction_rate_search_path.sql` | 迁移按序执行后最终态正确，仅历史迁移文件存在中间不一致 |
| 16 | `log_sensitive_transaction_updates` 和 `get_rls_coverage_report` 使用 `search_path=''`（空字符串），是 Postgres SECURITY DEFINER 触发器函数推荐做法 | `migrations/20260423000000_rls_security_audit_improvements.sql` | 符合最佳实践，无需修改 |

---

## 四、修复路线图（建议）

### 第一阶段：止血（1–2 天，约 5.5–7.5h）
- ✅ **#1** RLS 绕过 — 加权限校验（4–6h）
- ✅ **#2** GPS NaN — 运行时校验（1h）
- ✅ **#3** 非空断言崩溃 — null guard（0.5h）

### 第二阶段：加固（1–2 天，约 5.5–6.5h）
- ✅ **#4** RLS 策略补齐（3–4h）
- ✅ **#5** parseInt NaN 守卫（0.5h）
- ✅ **#6** 双重断言统一（0.5h）
- ✅ **#7** i18n 幽灵 key（1h）
- ✅ **#8** setQueriesData 修正（0.5h）

### 第三阶段：清理（可排入 backlog，约 2h）
- ✅ **#9–#14** 技术债清理（2h）

---

## 五、未覆盖区域

以下区域本次审计未涉及，建议排入后续扫描：
- **Edge Functions** 的认证 token 校验逻辑（仅扫描了 SQL 注入风险）
- **前端认证** — token 刷新、本地存储安全性
- **依赖供应链** — npm 包漏洞扫描
- **CSRF/XSS** — 前端输入消毒

---

*报告由 Hermes Kanban Worker 自动编译，数据来源：T1（类型安全）×3 + T2（SQL/权限） + T3（RLS 策略）共 5 份子扫描报告。*
