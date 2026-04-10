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

### 明确取消的功能

| 功能 | 说明 |
|------|------|
| 司机端 AI 读数扫描 | 已确认取消。`ReadingCapture` 中的 `currentDriver`/`aiReviewData`/`draftTxId`/`onLogAI` props 保留为 `_` 前缀（接口兼容），内部不执行任何 AI 逻辑。 |

---

## 待实现功能（下个 Agent 接手）

### 1. 管理端 AI 代理审核分析面板

**需求描述：** 在管理端新增一个"AI 代理审核"功能，允许管理员一键对当前区域（或指定司机/点位）进行智能汇总分析，并支持下一步行动。

**建议实现方式：**

```
admin/components/AdminReviewAgent.tsx   ← 新组件（抽屉面板）
api/admin-review-agent.ts               ← Vercel Edge Function（调用 Gemini/OpenAI）
```

核心功能：
- **区域电话号码汇总**：从 `locations.shopOwnerPhone` / `drivers.phone` 提取，按区域/司机分组，一键复制
- **AI 异常分析摘要**：基于当日 transactions + anomalies，生成自然语言摘要（已有 `useAdminAI` hook 可复用）
- 将来可接 SMS 网关，但 **先实现无网关版本**（复制号码列表 + 手动发送）

**入口位置：** 管理端 `SettlementTab` 右上角或 `OverviewTab` 的 Action Items 区域，增加"AI 代理审核"按钮

---

### 2. SMS 群发 / 电话回访集成

**现状：** 尚未实现，需要外部 API。

**推荐网关（非洲市场）：**

| 服务 | 优点 | 适合场景 |
|------|------|---------|
| [Africa's Talking](https://africastalking.com) | 覆盖坦桑尼亚，价格低 | SMS 群发 |
| [Twilio](https://twilio.com) | API 成熟，文档好 | SMS + 语音回访 |
| [Vonage](https://vonage.com) | 有中文支持 | 企业级 |

**实现步骤（未开始）：**
1. 在 `.env.local` / Vercel 环境变量中添加 `SMS_API_KEY`、`SMS_SENDER_ID`
2. 创建 `api/send-sms.ts` Edge Function（Vercel）
3. 在管理端 UI 中添加"批量发送"按钮，传入电话号码数组 + 消息模板
4. 发送结果写入 `ai_logs` 表做审计

> ⚠️ **重要：** SMS 功能需要真实 API Key，本地开发无法测试。建议先在 Staging 环境配置。

---

### 3. App 图标进一步优化（可选）

**现状：** `public/icons/` 目录已有 SVG 源文件和生成的 PNG。
当前图标是代码生成的槽机主题图案（深色背景 + 金色符号 + "Bahati"字样）。

**如需进一步优化：**
- 编辑 `public/icons/icon.svg`（源文件）
- 重新用 cairosvg 生成：`python3 -c "import cairosvg; cairosvg.svg2png(url='public/icons/icon.svg', write_to='public/icons/icon-512.png', output_width=512, output_height=512)"`
- iOS 图标需要额外的 `apple-touch-icon.png`（180×180），在 `index.html` 添加 `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`

---

### 4. 地图稳定性

**现状：** 地图使用 **OpenStreetMap + Leaflet（免费，无需 API Key）**，不是 Google Maps。
- `components/LiveMap.tsx` → `TileLayer` 使用 `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- **不需要** Google Maps API Key

**已知问题：** 地图稳定性问题通常来自以下原因：
1. Leaflet CSS 未正确加载（`import 'leaflet/dist/leaflet.css'` 已在 LiveMap.tsx 中）
2. 地图容器高度为 0（父容器需要明确高度）
3. Realtime 更新触发父组件重渲染，导致 `MapContainer` key 变化重新挂载

**建议下一步修复：**
- 为 `MapContainer` 添加稳定的 key（避免不必要的卸载重挂载）
- 可选：切换到 CartoDB Voyager tile（更美观）：`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`

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
