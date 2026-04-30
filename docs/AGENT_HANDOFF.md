# Agent Handoff Document
> 更新于 2026-04-10 | Updated 2026-04-10

这份文档记录当前代码库的真实状态、已完成的工作、进行中的 PR、以及下一个 Agent 应接手的任务。

---

## 当前活跃 PR

**Branch:** `copilot/code-audit-error-fixes`  
**目标:** 全面代码审计修复 — 逻辑 Bug、UI Token 统一、性能提升

### 已完成 ✅

| # | 类型 | 文件 | 说明 |
|---|------|------|------|
| Bug 1 | Logic | `driver/pages/DriverCollectionFlow.tsx` | 将 `window.confirm()` 替换为 `useConfirm()`（Capacitor WebView 中原生 confirm 静默返回 false） |
| Bug 2 | Logic | `driver/components/MachineCard.tsx` | `handleSaveSiteInfo` 增加 `catch` + Toast 错误提示；失败时不关闭表单 |
| Bug 4 | Logic | `driver/components/ReadingCapture.tsx` | 移除组件内部重复 `useGpsCapture` 实例；改为消费父组件传入的 `gpsCoords`/`gpsPermission`；新增 `onRequestGps` 回调 |
| UI 1 | Visual | `components/Login.tsx` | 修复 3 处 `text-[8px]`/`text-[9px]` → `text-caption`（≥10px 基准线） |
| UI 2 | Visual | 11 个文件 | 全局硬编码 `rounded-[*]` → 设计 Token（`rounded-card`/`rounded-subcard`/`rounded-btn`） |
| UI 3 | Visual | `driver/components/MachineCard.tsx` | 导航按钮字号 `text-[10px]` → `text-caption` |
| Perf 1 | Perf | `driver/pages/DriverCollectionFlow.tsx` | Finance 预览 RPC 增加 400ms 防抖，避免每次按键触发服务端请求 |
| Perf 2 | Perf | `components/dashboard/{OverviewTab,SettlementTab,SitesTab,TrackingTab}.tsx` | 添加 `React.memo` 防止管理端 Realtime 更新引起不相关标签页重渲染 |
| Icon | Branding | `public/icons/`, `manifest.json` | 替换 Flaticon 外链图标为本地品牌 SVG/PNG（192+512 maskable）；manifest theme_color 改为品牌琥珀色 `#d97706` |
| Contact Panel | Feature | `admin/components/AdminContactSummaryPanel.tsx` | 联系人汇总浮动面板：按司机分组展示店主电话、一键复制、导出 txt |
| AI Review | Feature | `admin/components/AdminAIAssistant.tsx`、`api/admin-ai.ts` | 新增"代理审核分析"快捷 prompt；系统 prompt 增加结构化审核报告模板；max_tokens 自动扩容至 1500 |

### 明确取消的功能

| 功能 | 说明 |
|------|------|
| 司机端 AI 读数扫描 | 已确认取消。`ReadingCapture` 中的 `currentDriver`/`aiReviewData`/`draftTxId`/`onLogAI` props 保留为 `_` 前缀（接口兼容），内部不执行任何 AI 逻辑。 |

---

## 待实现功能（下个 Agent 接手）

### 1. 电话回访自动化（Phase 4，优先级最低）

**需求：** 语音外呼任务队列，结合 AI TTS 或人工跟进。

**实现步骤（未开始）：**
1. Africa's Talking Voice API 或 Twilio Voice
2. 新建 `api/initiate-call.ts` Vercel Edge Function
3. 管理端"外呼任务"面板（可在 AdminContactSummaryPanel 中扩展）
4. 外呼状态记录写入 `ai_logs`

> 建议在 SMS 功能真实配置并投产后再推进此阶段。

---

### 2. 地图稳定性优化（中优先级）

**现状：** 地图使用 OpenStreetMap + Leaflet（免费，无需 Google API Key）。
地图瓦片 URL：`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`

**可选改进：**
- 切换到 CartoDB Voyager（更美观，更稳定）：
  `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`
- 为 `MapContainer` 添加固定 key（防止 Realtime 更新触发卸载重挂载）
- 文件：`components/LiveMap.tsx`

---

### 3. SMS 功能配置上线

所有代码已完成。需要管理员在 Vercel Dashboard 配置：

```
AT_API_KEY     = [Africa's Talking API Key]
AT_USERNAME    = [AT account username]
AT_SENDER_ID   = [可选，已注册的短信发件人ID]
```

注册地址：https://africastalking.com

---

## 代码库关键约定（供下一个 Agent 参考）

### 设计 Token（必须遵守）
```
rounded-card    = 20px  ← 卡片、模态框、面板
rounded-subcard = 16px  ← 嵌套面板
rounded-btn     = 14px  ← 按钮
rounded-tag     = 10px  ← 标签/徽章
text-caption    = 10px  ← 最小字号（不得使用 text-[8px]/text-[9px]）
```

### 验证命令
```bash
npm run typecheck                                              # TS 类型检查（必须通过）
NODE_OPTIONS=--max-old-space-size=3072 npm run test:ci -- --runInBand  # 单元测试（61 suites, 636 tests）
npm run build                                                  # Vite 生产构建
```

### 翻译
- 管理员 UI → 中文（`i18n/zh.ts`）
- 司机 UI → Swahili（`i18n/sw.ts`）
- 新增翻译 Key 需同时更新两个文件 + `i18n/index.ts`

### 类型导入
```typescript
// 旧路径（向后兼容 barrel，仍可用）
import { Location, Driver, TRANSLATIONS } from '../../types';
// 推荐新路径
import type { Location } from '../../types/models';
import { TRANSLATIONS } from '../../i18n';
```

### 离线优先模式
- 写入操作先保存本地（`offlineQueue.ts` IndexedDB），`isSynced: false`
- 网络恢复后 `flushQueue()` 同步
- 不要直接 `await supabase.from(...).insert(...)` — 使用 `enqueueTransaction()` 或 Repository 层

### 数据库 RLS 注意
- 没有 `is_driver()` 函数，用 `get_my_role() = 'driver'` 代替
- `locations` 的 INSERT/UPDATE/DELETE 仅限 `is_admin()`
- Edge Function 使用 `--no-verify-jwt` 但内部自行校验 JWT + admin 角色

---

## 文件结构速查

```
App.tsx                         # 根组件，Auth gate，Context providers，角色路由
types.ts                        # 向后兼容 barrel → ./types/index
types/models.ts                 # 数据模型接口
types/utils.ts                  # safeRandomUUID(), getDistance() 等
i18n/zh.ts + sw.ts             # 翻译字典
contexts/                       # AuthContext, DataContext, MutationContext, ToastContext, ConfirmContext
hooks/useSupabaseMutations.ts   # 所有写操作（含 logAI, submitTransaction 等）
hooks/useSupabaseData.ts        # 所有读操作（React Query）
driver/pages/DriverCollectionFlow.tsx  # 司机收款主流程（5步 wizard）
driver/components/ReadingCapture.tsx   # 步骤2：拍照+读数
admin/AppAdminShell.tsx         # 管理端主壳
components/dashboard/           # 管理端各标签页组件
services/                       # 业务逻辑（collection submit, finance calc, scan meter 等）
repositories/                   # Supabase 查询层（每个实体一个文件）
public/icons/                   # App 图标（SVG 源 + PNG）
supabase/migrations/            # 数据库迁移文件（增量，源文件真相）
```
