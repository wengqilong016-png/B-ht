# 🏗️ Bahati 系统重建计划
> **版本**: v1.0 | **创建日期**: 2026-03-14 | **状态**: 执行中
>
> ⚠️ 本文档是所有 AI 对话和开发工作的唯一锚点。
> 每次开始新的 AI 对话时，请先把本文档内容发给 AI。

---

## 📌 项目背景

- **业务**: 坦桑尼亚博彩机器运营管理
- **团队规模**: ~20 人（1-3 名管理员 + 15-20 名外勤司机）
- **核心流程**: 司机每天出门 → 跑各机器网点 → 读取机器分数 → 收款 → 晚上对账
- **现有数据**: Supabase 数据库已有真实运营数据，**必须保留**
- **部署平台**: Vercel（域名 bahatiwin.space）

---

## 🎯 重建目标

### 根本原因分析（为什么之前崩掉）
1. 司机端和管理端混在同一个 React 应用 → 老手机加载慢、崩溃
2. 多次 AI 辅助重构留下中间产物，新旧代码并存
3. 地图组件（AdminMapPage）是空壳，没有接真实数据
4. 数据丢失：IndexedDB 中转没有服务端确认机制
5. GPS 心跳失败静默无提示

### 重建后的目标
- ✅ 司机端：极轻量，< 400KB，老手机 2 秒内打开
- ✅ 管理端：功能完整，GPS 实时地图真实可用
- ✅ 数据：提交有服务端确认，不再丢失
- ✅ 架构：干净分离，AI 可以局部修改不影响全局

---

## 🗺️ 目标架构

```
B-ht/
├── driver-app/              ← 【新建】司机端（极轻量 PWA）
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── supabaseClient.ts    ← 只引入 @supabase/supabase-js
│       ├── types.ts             ← 从主项目提炼，只含司机需要的类型
│       ├── offlineQueue.ts      ← 从主项目复制，保持逻辑不变
│       ├── pages/
│       │   ├── LoginPage.tsx    ← 司机登录
│       │   ├── CollectPage.tsx  ← 核心：选机器→拍照→填数→提交
│       │   ├── HistoryPage.tsx  ← 查看自己的历史记录（近 30 条）
│       │   └── ProfilePage.tsx  ← 个人信息、债务余额
│       └── components/
│           ├── MachineSelector.tsx
│           ├── ScoreInput.tsx
│           ├── PhotoCapture.tsx
│           ├── SubmitButton.tsx
│           └── OfflineBanner.tsx  ← 无网络时显示黄色横幅
│
├── admin-app/               ← 【新建】管理端（功能完整，电脑使用）
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── supabaseClient.ts
│       ├── pages/
│       │   ├── DashboardPage.tsx    ← 今日概览 KPI
│       │   ├── MapPage.tsx          ← 【真实 GPS 地图】（Leaflet，接真实数据）
│       │   ├── TransactionsPage.tsx ← 交易记录审查
│       │   ├── SettlementPage.tsx   ← 日结算审批
│       │   ├── DriversPage.tsx      ← 司机管理
│       │   └── SitesPage.tsx        ← 机器网点管理
│       └── components/
│           ├── LiveDriverMap.tsx    ← Leaflet 地图组件（实时 GPS）
│           ├── DriverStatusCard.tsx ← 每个司机状态卡（在线/离线/最后更新时间）
│           └── KPICard.tsx
│
├── shared/                  ← 两端共用（不含任何 UI）
│   ├── types.ts             ← 所有 TypeScript 类型定义
│   └── constants.ts         ← COIN_VALUE_TZS 等业务常数
│
├── supabase/                ← 数据库 migrations（不动）
│   └── migrations/
│
└── [旧文件保留，不删除，逐步停用]
    ├── App.tsx              ← 保留，但新用户用新 app
    ├── BAHATI_DATA_BACKUP.json ← 移入 /backups/ 目录
    └── ...
```

---

## 📋 四个阶段执行计划

---

### 🔴 阶段 0：准备工作（你手动操作，不需要 AI）
> 预计时间：30 分钟
> AI 操作比例：0%

**你需要手动做的事：**

#### 0-A. Supabase 检查（登录 supabase.com）
- [ ] 登录 Supabase Dashboard → 项目 `yctsiudhicztvppddbvk`
- [ ] 进入 **Table Editor** → 确认以下表存在且有数据：
  - `locations`（机器网点）
  - `drivers`（司机）
  - `transactions`（交易记录）
  - `daily_settlements`（日结算）
- [ ] 进入 **Authentication > Users** → 确认司机账号存在
- [ ] 进入 **Settings > API** → 记录下：
  - Project URL（已知：`https://yctsiudhicztvppddbvk.supabase.co`）
  - anon public key（已知，在 supabaseClient.ts 里）

#### 0-B. Vercel 检查（登录 vercel.com）
- [ ] 确认项目已连接 GitHub 仓库 `wengqilong016-png/B-ht`
- [ ] 记录当前的 **Build Command** 和 **Output Directory**（截图保存）
- [ ] 确认域名 `bahatiwin.space` 已正确配置

#### 0-C. 你的本地环境
- [ ] 确认已安装 Node.js（运行 `node -v`，需要 >= 18）
- [ ] 确认已安装 pnpm（运行 `pnpm -v`，没有就运行 `npm install -g pnpm`）
- [ ] 克隆仓库到本地：`git clone https://github.com/wengqilong016-png/B-ht.git`

---

### 🟡 阶段 1：司机端重建（AI 主导）
> 预计时间：2-3 天（AI 开发）
> AI 操作比例：90%
> 你的操作比例：10%（验收测试）

**AI 负责（通过 GitHub Copilot / Claude Code）：**

1. **搭建 `driver-app/` 骨架**
   - 创建 Vite + React + TypeScript 项目
   - 配置 Tailwind CSS
   - **禁止引入**: Leaflet、Recharts、@google/genai、lucide-react（改用内联 SVG）
   - 目标：`npm run build` 后 dist < 400KB

2. **实现登录页（LoginPage.tsx）**
   - 输入用户名 + 密码
   - 调用 Supabase Auth
   - 登录成功后存 session，下次自动登录
   - 加载慢时显示 loading 状态（不能白屏超过 2 秒）

3. **实现收款页（CollectPage.tsx）—— 核心功能**
   - Step 1: 从 Supabase 拉取分配给该司机的机器列表
   - Step 2: 司机选择机器 → 显示上次分数
   - Step 3: 拍照（调用手机相机 API）
   - Step 4: 填写当前分数 + 支出金额
   - Step 5: 自动计算收入、留成、净应付款
   - Step 6: 提交 → 先存 IndexedDB → 再尝试写 Supabase → 等待服务端确认 ID

4. **实现离线支持（offlineQueue.ts）**
   - 从现有 `offlineQueue.ts` 直接复制核心逻辑
   - 提交成功后本地标记 `isSynced: true`
   - 失败后 60 秒重试，最多 5 次

5. **实现 GPS 心跳**
   - 司机登录后，每 30 秒上报一次 GPS
   - 失败时显示明确提示（"GPS 上报失败，请检查网络"）

**你需要手动做的事（验收）：**
- [ ] 在你自己的手机（或找一台老安卓机）打开司机端
- [ ] 完整走一遍收款流程
- [ ] 关掉网络，再走一遍（测试离线）
- [ ] 恢复网络，检查 Supabase 里是否有这条记录

**阶段 1 完成标准：**
```
✅ 司机能正常登录
✅ 能选机器、填数据、拍照、提交
✅ 离线状态下能保存，联网后自动同步
✅ dist 包体积 < 400KB
✅ 2G 网络下首屏 < 3 秒（Chrome DevTools 模拟测试）
```

---

### 🟢 阶段 2：管理端地图修复（AI 主导）
> 预计时间：1-2 天
> AI 操作比例：85%
> 你的操作比例：15%（配置 + 验收）

**AI 负责：**

1. **修复 AdminMapPage.tsx 的地图**
   - 移除空壳 Placeholder
   - 接入 Leaflet + 真实 drivers 数据
   - 每个司机在地图上显示为彩色标记点
   - 点击标记显示：司机名、最后更新时间、今日收款次数

2. **加入"最后更新时间"显示**
   - 绿色：< 5 分钟（在线）
   - 黄色：5-30 分钟（可能断网）
   - 红色：> 30 分钟（离线告警）

3. **Supabase Realtime 接通**
   - 司机 GPS 更新 → 管理端地图标记实时移动
   - 不需要手动刷新

4. **管理端今日 KPI 看板**
   - 今日总收入
   - 在线司机数 / 总司机数
   - 待审批交易数量（红色角标）
   - 异常交易数量（GPS 偏差 > 300m 的）

**你需要手动做的事：**
- [ ] 在 Vercel 检查 admin-app 是否成功部署
- [ ] 确认地图能正确显示坦桑尼亚地区（默认中心点：达累斯萨拉姆）
- [ ] 让一个司机登录司机端，观察管理端地图是否实时更新

**阶段 2 完成标准：**
```
✅ 地图能显示所有司机的实时位置
✅ 离线司机显示红色标记
✅ 司机 GPS 更新后，管理端 < 60 秒内看到变化
✅ KPI 数据准确（与 Supabase 数据一致）
```

---

### 🔵 阶段 3：数据安全加固（AI 主导）
> 预计时间：1 天
> AI 操作比例：70%
> 你的操作比例：30%（Supabase 配置）

**AI 负责：**

1. **提交确认机制**
   - 司机提交后，必须收到 Supabase 返回的 `id`
   - 没收到 id = 没成功，继续保存在本地队列
   - 司机端显示"✅ 已确认上传"vs"⏳ 等待上传"状态

2. **失败可视化**
   - 司机端顶部显示待同步数量（如"3 条待上传"）
   - 管理端能看到哪些司机有"离线待同步"状态

3. **数据重复提交保护**
   - 每条交易有唯一 `id`（`TX-时间戳-司机ID`）
   - Supabase 加 UNIQUE 约束，重复提交自动忽略（UPSERT）

**你需要手动做的事（Supabase 配置）：**
- [ ] 登录 Supabase Dashboard
- [ ] 进入 **Database > Tables > transactions**
- [ ] 确认 `id` 列有 UNIQUE 约束（如果没有，AI 会提供 SQL 语句让你执行）
- [ ] 进入 **Database > Realtime** → 确认 `drivers` 表已启用 Realtime

**阶段 3 完成标准：**
```
✅ 断网提交 → 联网后自动重传 → Supabase 里只有一条记录（不重复）
✅ 司机端能看到"待上传"数量
✅ 管理端能看到哪些司机有未同步数据
```

---

### ⚫ 阶段 4：清理和稳定（AI 主导）
> 预计时间：半天
> AI 操作比例：80%

**AI 负责：**
1. 把根目录的调试脚本移入 `scripts/` 目录
2. 把 `BAHATI_DATA_BACKUP.json`（15MB）移出 git 追踪（加入 .gitignore）
3. 删除所有 `stage2_context.txt`、`MAP_AUDIT_PROMPT.txt` 等中间产物
4. 更新 `vercel.json` 配置两个 app 的部署路径

---

## 🔧 技术约束（所有 AI 对话必须遵守）

### 司机端（driver-app）
```
✅ 允许的依赖：
   - react, react-dom
   - @supabase/supabase-js
   - vite, @vitejs/plugin-react
   - tailwindcss

❌ 禁止的依赖（会使包体积爆炸）：
   - leaflet / react-leaflet
   - recharts / d3
   - @google/genai
   - lucide-react（改用内联 SVG 或 emoji）
   - @tanstack/react-query（司机端逻辑简单，直接 fetch 即可）
```

### 管理端（admin-app）
```
✅ 允许的依赖：
   - 司机端所有依赖
   - leaflet, react-leaflet（地图）
   - recharts（图表）
   - lucide-react（图标）
   - @tanstack/react-query（复杂数据管理）

❌ 禁止的做法：
   - 在管理端组件里直接写 SQL 逻辑（通过 supabaseClient.ts 统一管理）
   - 把 15MB 数据文件放进 git
```

---

## 🗄️ Supabase 现有数据库（不变动）

### 已存在的表
| 表名 | 用途 | 关��字段 |
|------|------|---------|
| `drivers` | 司机信息 | id, name, username, currentGps, lastActive, status |
| `locations` | 机器网点 | id, name, coords, assignedDriverId, lastScore, commissionRate |
| `transactions` | 收款记录 | id, timestamp, driverId, locationId, currentScore, revenue, netPayable, gps |
| `daily_settlements` | 日结算 | id, date, driverId, totalRevenue, status |
| `ai_logs` | AI 查询日志 | id, driverId, query, response |

### GPS 字段说明
```
drivers.currentGps  = { lat: number, lng: number }  ← 司机实时位置（心跳更新）
drivers.lastActive  = ISO timestamp                  ← 最后活跃时间
transactions.gps    = { lat: number, lng: number }  ← 提交时的 GPS 坐标
```

### 关键业务常数
```typescript
COIN_VALUE_TZS = 10    // 每分对应坦桑尼亚先令（需确认实际值）
TX_LIMIT_DRIVER = 500  // 司机端最多拉取的交易数量
TX_LIMIT_ADMIN = 2000  // 管理端最多拉取的交易数量
```

---

## 🚦 对每个 AI 对话的指令模板

### 开始新对话时，固定发送：
```
背景：这是一个坦桑尼亚博彩机器运营管理系统，团队 20 人。
仓库：wengqilong016-png/B-ht
当前阶段：[填写：阶段 0 / 1 / 2 / 3 / 4]
今天要做：[填写具体任务]

约束：
- 司机端（driver-app/）禁止引入 Leaflet、Recharts、lucide-react
- 不要修改 Supabase 数据库结构
- 不要删除任何现有文件，只新建或修改指定文件
- 所有代码改动通过 PR 提交，不直接推 main
```

---

## ✅ 总体进度追踪

| 阶段 | 状态 | 负责方 | 完成时间 |
|------|------|--------|---------|
| 阶段 0：准备工作 | ⬜ 未开始 | 你（手动） | - |
| 阶段 1：司机端重建 | ⬜ 未开始 | AI 主导 | - |
| 阶段 2：管理端地图 | ⬜ 未开始 | AI 主导 | - |
| 阶段 3：数据安全 | ⬜ 未开始 | AI + 你（Supabase 配置） | - |
| 阶段 4：清理稳定 | ⬜ 未开始 | AI 主导 | - |

---

## 📞 紧急情况处理

### 如果司机说"提交不了"
1. 让他检查手机网络（切换 4G/WiFi）
2. 让他截图"待上传数量"
3. 管理端查看该司机的 `lastActive` 时间
4. 如果数据在 IndexedDB 里：通知你，你登录 Supabase 手动补录

### 如果管理端地图不更新
1. 检查 Supabase Dashboard > Realtime 是否正常
2. 检查司机手机是否有 GPS 权限（设置 > 应用 > 权限）
3. 强制刷新管理端页面

### 如果数据丢失（最坏情况）
1. 先检查 IndexedDB（让司机用 Chrome DevTools 导出）
2. 使用 `BAHATI_DATA_BACKUP.json` 恢复历史数据
3. 手动在 Supabase 补录当天数据

---

*最后更新：2026-03-14 | 下次更新：阶段 0 完成后*