# Bahati Jackpots — 安全配置指南

## 一、已完成的安全加固（代码层）

| 项目 | 状态 | 说明 |
|------|------|------|
| 前端硬编码管理员密码 | ✅ 已清除 | 登录全部走 Supabase Auth |
| 司机明文密码登录 | ✅ 已清除 | `drivers.password` 列已在 migration 中 DROP |
| Supabase Auth 接入 | ✅ 已完成 | `services/authService.ts` |
| profiles 表 + auth_user_id 绑定 | ✅ 已完成 | `setup_db.sql` Section 4 |
| RLS 策略 | ✅ 已写入 SQL | 见 `setup_db.sql` Section 10 / migration `20240103000000_enable_rls.sql` |
| `get_my_role()` 辅助函数 | ✅ 已写入 SQL | SECURITY DEFINER，避免 profiles 循环检查 |
| 密码残留字段清理 | ✅ 已完成 | `sanitizeDriver()` 在写入 localStorage 前剥除 password 字段 |

---

## 二、必须在 Supabase 控制台手动完成的步骤

> ⚠️ 以下步骤**无法**通过前端代码完成，需要登录 [supabase.com](https://supabase.com) 操作。

### 2.1 在线数据库执行 RLS Migration

进入 **Supabase 控制台 → SQL Editor**，执行以下文件之一：

- **全库重建**（新环境）：`setup_db.sql`
- **已有数据库增量升级**：`supabase/migrations/20240103000000_enable_rls.sql`

执行后验证：

```sql
-- 确认所有表已启用 RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
-- rowsecurity 列应全部为 true

-- 确认策略已创建
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 2.2 创建管理员账号

在 **Supabase 控制台 → Authentication → Users → Invite user** 创建管理员邮箱账号，然后在 SQL Editor 插入 profile：

```sql
-- 替换 <auth_user_id> 为新建用户的 UUID（在 auth.users 表中查看）
INSERT INTO public.profiles (auth_user_id, role, display_name)
VALUES ('<auth_user_id>', 'admin', 'Jack');
```

### 2.3 创建司机账号

```sql
-- 1. 先在 Authentication → Users 创建司机邮箱账号，取得其 UUID
-- 2. 在 drivers 表插入司机基础信息
INSERT INTO public.drivers (
  id, name, username, phone, status,
  "baseSalary", "commissionRate", "dailyFloatingCoins",
  "initialDebt", "remainingDebt", "vehicleInfo"
)
VALUES (
  'D-XXX', 'Driver Name', 'driver_username', '+255 6X XXX XXXX', 'active',
  300000, 0.05, 10000, 0, 0,
  '{"model":"TVS King","plate":"T 000 XXX"}'
);

-- 3. 插入 profile，绑定 auth_user_id 与 driver_id
INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
VALUES ('<driver_auth_user_id>', 'driver', 'Driver Name', 'D-XXX');
```

### 2.4 验证 RLS 是否正常工作

在 SQL Editor 查询策略确认生效：

```sql
-- 司机只应看到自己的交易（用 Supabase Auth 司机账号登录后验证）
SELECT COUNT(*) FROM public.transactions;
```

---

## 三、环境变量配置

复制 `.env.example` 为 `.env.local`，填入真实值：

```bash
cp .env.example .env.local
```

| 变量 | 用途 | 获取方式 |
|------|------|----------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | 控制台 → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | 前端匿名密钥 | 控制台 → Settings → API |
| `VITE_GEMINI_API_KEY` | Google Gemini AI | [aistudio.google.com](https://aistudio.google.com) |
| `SUPABASE_KEY` | Service Role 密钥（后端专用，勿提交） | 控制台 → Settings → API |

> ⛔ `SUPABASE_KEY`（service_role）**严禁**出现在前端代码或提交到 Git 中。

---

## 四、不可行项说明（P3 高风险操作后移）

以下操作当前由前端直接调用 Supabase，存在安全风险。迁移至 Edge Functions 需要 Supabase CLI 和部署访问权限，**无法仅通过前端代码完成**：

| 操作 | 当前位置 | 推荐迁移目标 |
|------|----------|-------------|
| 创建司机账号 | `DriverManagement.tsx` | Edge Function `POST /admin/create-driver` |
| 审批 transaction | `Dashboard.tsx` | Edge Function `POST /admin/approve-transaction` |
| 审批 payout | `Dashboard.tsx` | Edge Function `POST /admin/approve-payout` |
| 重置机器分数 | `Dashboard.tsx` / `CollectionForm.tsx` | Edge Function `POST /admin/reset-machine` |
| 修改司机状态 | `DriverManagement.tsx` | Edge Function `PATCH /admin/driver-status` |
| 删除 location | `App.tsx handleDeleteLocations` | Edge Function `DELETE /admin/location` |

Edge Function 创建示例（需本地安装 Supabase CLI）：

```bash
supabase functions new admin-create-driver
# 编辑 supabase/functions/admin-create-driver/index.ts
# 在函数中使用 service_role key，校验调用方身份后再执行写库
supabase functions deploy admin-create-driver
```

---

## 五、RLS 策略速查表

| 表 | SELECT | INSERT | UPDATE | DELETE |
|----|--------|--------|--------|--------|
| `profiles` | 本人或管理员 | service_role | service_role | service_role |
| `locations` | 已认证用户 | 管理员 | 管理员 / 负责司机 | 管理员 |
| `drivers` | 已认证用户 | 管理员 | 管理员 / 本人 | 管理员 |
| `transactions` | 管理员 / 本人 | 管理员 / 本人 | 管理员 | 管理员 |
| `daily_settlements` | 管理员 / 本人 | 管理员 / 本人 | 管理员 | 管理员 |
| `ai_logs` | 管理员 / 本人 | 管理员 / 本人 | 管理员 | 管理员 |
| `notifications` | 管理员 / 本人 / 系统通知 | 管理员 | 管理员 / 本人 | 管理员 |

---

## 六、漏洞报告

如发现安全漏洞，请通过仓库 Issues（选择 Security 标签）或直接联系仓库所有者，**请勿公开披露**。
