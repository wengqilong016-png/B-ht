# BHT 审批/结算/债务操作手册

> 适用角色：管理员
> 更新日期：2026-05-10

---

## 目录

1. [审批中心](#1-审批中心)
   - 1.1 [结算审批（日结审核）](#11-结算审批日结审核)
   - 1.2 [重置审批](#12-重置审批)
   - 1.3 [提现审批（分红提现）](#13-提现审批分红提现)
   - 1.4 [费用审批](#14-费用审批)
2. [日结流程](#2-日结流程)
3. [债务管理](#3-债务管理)
4. [分红提现完整流程](#4-分红提现完整流程)
5. [常见问题](#5-常见问题)

---

## 1. 审批中心

审批中心是管理员处理各类待审批请求的统一入口。涉及的操作均通过 RPC 函数在服务端执行，确保数据一致性和权限安全。

### 1.1 结算审批（日结审核）

#### 目的
司机每日结束工作后提交日结申请，管理员审核确认后：
- 司机的随身硬币数（dailyFloatingCoins）自动更新为实际硬币数
- 当天的所有收款交易（collection）的支付状态（paymentStatus）变更为 `paid` 或 `rejected`

#### 步骤

1. 进入管理端日结审批面板，查看待审批列表（status = `pending`）
2. 点击某个日结记录，查看明细：
   - 司机姓名
   - 日期
   - 预期硬币数 vs 实际硬币数
   - 当天收款总额（totalRevenue）
3. 选择操作：
   - **确认（Confirm）**：日结通过。系统自动执行：
     - `daily_settlements.status` → `confirmed`
     - `drivers.dailyFloatingCoins` → 实际硬币数
     - 当天该司机所有 `type=collection` 交易的 `paymentStatus` → `paid`
   - **拒绝（Reject）**：日结不通过。系统自动执行：
     - `daily_settlements.status` → `rejected`
     - 当天该司机所有 `type=collection` 交易的 `paymentStatus` → `rejected`
     - （不会更新硬币数）

#### 注意事项

- **只有管理员**可以审核日结（RPC 内部调用 `is_admin()` 检查）
- 日结状态必须是 `pending` 才能审核，已审核的不可重复操作
- **保护机制**：如果确认时 `totalRevenue <= 0`，服务端会拒绝（P2 guard）
- 该操作是三表联动（settlements + transactions + drivers），在单个 RPC 中原子执行
- 司机每天只能有一条 `pending` 或 `confirmed` 状态的日结

---

### 1.2 重置审批

#### 目的
当司机请求重置机器分数（lastScore 归零）时，管理员审批该请求。批准后机器分数归零，司机可重新开始计分周期。

#### 步骤

1. 进入审批面板，筛选 `type=reset_request` 且 `approvalStatus=pending` 的交易
2. 查看重置请求详情：
   - 请求司机
   - 关联机器（locationId）
   - 当前 lastScore
3. 选择操作：
   - **批准**：服务端执行：
     - `transactions.approvalStatus` → `approved`
     - `locations.lastScore` → `0`
     - `locations.resetLocked` → `false`
   - **拒绝**：服务端执行：
     - `transactions.approvalStatus` → `rejected`
     - `locations.resetLocked` → `false`（仅解锁，分数不变）

#### 注意事项

- 重置请求有 `resetLocked` 锁定机制，一次只能有一个待审批请求
- 拒绝后机器解锁，司机可重新提交重置请求
- 审批操作同时更新 transactions 和 locations 两张表

---

### 1.3 提现审批（分红提现）

#### 目的
业主（机器 owner）通过留存分红（dividendBalance）积累余额后，可申请提现。管理员审批通过后，从机器的 `dividendBalance` 中扣减对应金额。

#### 步骤

1. 进入审批面板，筛选 `type=payout_request` 且 `approvalStatus=pending` 的交易
2. 查看提现请求详情：
   - 提现金额（payoutAmount）
   - 关联机器
   - 当前分红余额（dividendBalance）
3. 选择操作：
   - **批准**：服务端执行：
     - `transactions.approvalStatus` → `approved`
     - `locations.dividendBalance` → `dividendBalance - payoutAmount`
   - **拒绝**：服务端执行：
     - `transactions.approvalStatus` → `rejected`
     - 余额不变

#### 注意事项

- **余额不足会报错**：如果 `dividendBalance < payoutAmount`，RPC 抛出异常（ERRCODE=22023），审批失败
- 分红余额存储在 `locations.dividendBalance`，不要从 `transactions.ownerRetention` 汇总
- 只有批准时才扣减余额，拒绝时余额不变

---

### 1.4 费用审批

#### 目的
司机提交的费用报销请求需要管理员审批。

#### 步骤

1. 筛选 `type=expense` 且 `expenseStatus=pending` 的交易
2. 选择批准或拒绝
3. 服务端更新 `transactions.expenseStatus` → `approved` 或 `rejected`

#### 注意事项

- 费用审批仅更新 transactions 表，不涉及其他表
- 验证条件：`type='expense'`，`expenses > 0`，`expenseStatus='pending'`

---

## 2. 日结流程

日结是司机每日收款工作的结账环节，连接司机端提交和管理端审核。

### 完整流程

```
司机端                         管理端                        数据库
───────                       ───────                       ──────
                                                                
1. 当日工作结束后                                              
   查看收款汇总                                                
                                                                
2. 提交日结申请 ─────────────→ create_daily_settlement_v1      
   (填写实际硬币数,                │                           
    备注等)                       ├─ 幂等检查：同一 id 已存在？   
                                 │   → 返回已有记录           
                                 ├─ 防重检查：同司机+同日期      
                                 │   + pending/confirmed？     
                                 │   → 抛异常 23505           
                                 └─ INSERT status='pending'   
                                                                
3. 等待审批                                                    
                                                                
                          4. 管理员审核 ──→ review_daily_settlement_v1
                             ├─ 确认                       
                             │  ├─ settlement.status = confirmed
                             │  ├─ driver.dailyFloatingCoins = actualCoins
                             │  └─ transactions.paymentStatus = paid
                             └─ 拒绝                       
                                ├─ settlement.status = rejected
                                └─ transactions.paymentStatus = rejected
```

### 前端交互细节

- 司机端提交日结后，记录状态为 `pending`，不可重复提交同日日结
- 管理端审核时，UI 执行三表乐观更新（settlements + transactions + drivers），即时响应
- `onSuccess` 用服务端权威数据覆盖乐观更新，修正计算偏差

### 注意事项

- 日结确认后 `dailyFloatingCoins` 被**直接覆盖**为实际硬币数，不是累加
- 幂等设计：用相同 `id` 重复提交不会报错，返回已有记录
- 所有审批操作必须在线，离线时会抛错提示

---

## 3. 债务管理

BHT 系统中有两种债务类型：

| 债务类型 | 存储位置 | 说明 |
|---------|---------|------|
| 司机个人债务 | `drivers.remainingDebt` | 创建司机时设置 initialDebt，剩余为 remainingDebt |
| 机器启动债务 | `locations.remainingStartupDebt` | 机器注册时设置，相当于机器的"启动资金" |

### 3.1 查看债务

管理员进入 **债务管理面板**（DebtManager），可见三块汇总：

- **Total Outstanding**：总未清债务 = 机器启动债 + 司机个人债
- **Site Startup Capital**：各机器的启动债务详情（含回收进度条）
- **Personal Loans**：各司机的个人债务详情

每块显示：当前余额、初始总额、回收进度百分比。

### 3.2 手动回收机器启动债务

#### 目的
机器启动债务通常通过收款自动抵扣（每笔 collection 中 `startupDebtDeduction` 自动扣减），但管理员也可手动记录还款。

#### 步骤

1. 在债务管理面板找到目标机器卡片
2. 点击「Pay」按钮，输入还款金额（TZS）
3. 确认提交
4. 系统更新 `locations.remainingStartupDebt`，并写入审计日志

#### 注意事项
- 金额不能为 0 或负数
- 自动生成审计日志（event_type: `startup_debt_recovery`）
- 这是**手动还款**，自动抵扣发生在每次收款提交时

### 3.3 修改司机债务

#### 目的
管理员可直接修改司机的 remainingDebt 和 dailyFloatingCoins（如纠正错误、调整欠款）。

#### 步骤

1. 在债务管理面板找到目标司机卡片
2. 点击编辑按钮（铅笔图标），进入编辑模式
3. 修改字段：
   - **当前欠款（Current Debt）**：`remainingDebt`
   - **流动硬币（Floating Coins）**：`dailyFloatingCoins`
4. 点击 Save Changes 保存
5. 系统通过 `updateDrivers` mutation（upsert）写入数据库，并自动生成审计日志

#### 注意事项
- 只有管理员可以编辑
- 每次修改自动生成审计日志（event_type: `driver_debt_change` / `floating_coins_change`）
- 修改直接覆盖原值，不是累加
- 司机个人债务也会在每次收款时自动抵扣（`drivers.remainingDebt -= startupDebtDeduction`）

### 3.4 债务自动抵扣机制

每次收款提交时，系统自动执行：

```
locations.remainingStartupDebt -= startupDebtDeduction   (SQL 端)
drivers.remainingDebt         -= startupDebtDeduction   (前端 onUpdateDrivers)
```

限制规则：
- `startupDebtDeduction` ≤ `remainingStartupDebt`（不会超扣）
- `startupDebtDeduction` ≤ `available`（不会让司机实得变负数）

---

## 4. 分红提现完整流程

### 4.1 分红积累

每次司机提交收款时，如果选择"业主留存"（`isOwnerRetaining=true`）：

```
locations.dividendBalance += finalRetention
```

其中 `finalRetention` 来自 `ownerRetention`（默认等于 commission，可由业主自定义）。

### 4.2 提现申请

```
司机端                         管理端                        数据库
───────                       ───────                       ──────

1. 业主查看分红余额
   （来自 locations.dividendBalance）

2. 提交提现申请 ─────────────→ create_payout_request_v1
   （指定金额）                    │
                                 └─ INSERT type='payout_request'
                                    approvalStatus='pending'

3. 等待审批

                          4. 管理员审批 ──→ approve_payout_request_v1
                             ├─ 余额检查：dividendBalance >= payoutAmount
                             │   不足 → 抛异常 22023
                             ├─ 批准
                             │  ├─ transactions.approvalStatus = approved
                             │  └─ locations.dividendBalance -= payoutAmount
                             └─ 拒绝
                                └─ transactions.approvalStatus = rejected

                          5. 提现完成
                             余额已扣减
```

### 4.3 注意事项

- **余额不足时审批会失败**，错误码 `22023`，需司机重新提交合理金额
- 分红余额以 `locations.dividendBalance` 为准，不要在 transactions 表中汇总
- `transactions.ownerRetention` 记录的是单笔分红的"预设金额"，不是"实际余额"
- 提现申请创建时状态为 `pending`，此时余额尚未扣减，审批通过后才扣减
- 审批拒绝后余额不变，司机可重新提交

---

## 5. 常见问题

### Q: 日结确认后硬币数没变？
A: 检查日结状态是否确实变为 `confirmed`。如果 `totalRevenue <= 0`，服务端会拒绝确认（P2 guard）。另外，`dailyFloatingCoins` 是覆盖为 `actualCoins`，不是累加。

### Q: 提现审批报错 "Insufficient dividend balance"？
A: 机器的 `dividendBalance` 小于提现金额。让业主查看当前余额后重新提交合理金额。

### Q: 重置审批后为什么机器还是锁定的？
A: 审批拒绝时仅设置 `resetLocked = false`（解锁），不会改分数。司机可以重新提交重置请求。

### Q: 如何查看审批操作的审计记录？
A: 所有审批操作自动写入审计日志。管理端可通过 FinanceAuditPanel 查看。

### Q: 司机债务怎么区分手动修改和自动抵扣？
A: 手动修改通过 DebtManager 编辑面板，会生成 `driver_debt_change` 审计事件。自动抵扣在收款提交时触发，无独立审计事件但可追踪 transactions 中的 `startupDebtDeduction` 字段。

---

## 附录：关键数据字段速查

| 字段 | 表 | 含义 |
|------|-----|------|
| `approvalStatus` | transactions | 审批状态：pending / approved / rejected |
| `paymentStatus` | transactions | 支付状态：pending / paid / rejected（日结审核联动） |
| `expenseStatus` | transactions | 费用状态：pending / approved / rejected |
| `payoutAmount` | transactions | 提现金额 |
| `ownerRetention` | transactions | 本次分红金额 |
| `isOwnerRetaining` | transactions | TRUE=留存到余额，FALSE=现场支付 |
| `dividendBalance` | locations | 当前留存分红余额 |
| `remainingStartupDebt` | locations | 机器剩余启动债务 |
| `lastScore` | locations | 机器上次结算分数 |
| `resetLocked` | locations | 重置锁定状态 |
| `remainingDebt` | drivers | 司机当前欠款 |
| `initialDebt` | drivers | 司机初始欠款 |
| `dailyFloatingCoins` | drivers | 司机随身硬币数 |
| `status` | daily_settlements | 日结状态：pending / confirmed / rejected |
| `actualCoins` | daily_settlements | 日结实际硬币数 |
