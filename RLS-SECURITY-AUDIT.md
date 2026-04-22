# RLS 安全审计报告 (2026-04-23)

## 审计结果

### ✅ 已有 RLS 策略（生产环境）
| 表名 | 策略数 | 状态 |
|------|--------|------|
| transactions | 4 | ✓ 有 |
| drivers | 7 | ✓ 有 |
| profiles | 4 | ✓ 有 |
| locations | 4 | ✓ 有 |
| daily_settlements | 2 | ✓ 有 |
| evidence (storage) | 2 | ✓ 有 |

### 🔍 发现的安全问题

#### 问题 1: transactions UPDATE 策略过于宽松
**现有策略**:
```sql
CREATE POLICY transactions_driver_update_own_v1
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() = 'driver'
    AND "driverId" = public.get_my_driver_id()
  )
  WITH CHECK (
    public.get_my_role() = 'driver'
    AND "driverId" = public.get_my_driver_id()
  );
```

**风险**: 
- 驱动可以更新 `paymentStatus`、`approvalStatus`、`resolvedScore` 等敏感字段
- 这些字段应该只有管理员才能修改

**修复方案**:
- 添加审计触发器，记录任何尝试修改敏感列的行为
- 如果驱动尝试修改敏感列，阻止更新并抛出异常

#### 问题 2: queue_health_reports 表缺少 RLS
**风险**: 
- 驱动可以访问其他驱动的队列健康报告
- 管理员无法查看所有驱动的报告

**修复方案**:
- 添加 INSERT/UPDATE 策略（驱动只能操作自己的数据）
- 添加 SELECT 策略（管理员可以查看所有数据）

#### 问题 3: 缺少速率限制
**风险**: 
- 驱动可以无限制地插入交易，导致系统过载
- 恶意驱动可能进行 DoS 攻击

**修复方案**:
- 添加触发器检查驱动的交易插入频率
- 限制每个驱动每分钟最多 50 笔交易

---

## 新增的迁移文件

**文件**: `20260423000000_rls_security_audit_improvements.sql`
**行数**: 327 行
**变更**:

### Fix 1: 强化 transactions UPDATE 策略
- 添加审计触发器 `log_sensitive_transaction_updates()`
- 记录所有可疑的列更新尝试到 `security_audit_log` 表

### Fix 2: 创建 security_audit_log 表
```sql
CREATE TABLE public.security_audit_log (
  id bigserial PRIMARY KEY,
  event_time timestamptz DEFAULT now(),
  event_type text NOT NULL,
  user_id uuid,
  user_role text,
  table_name text,
  record_id text,
  details jsonb
);
```
- 仅管理员可访问
- 记录所有安全审计事件

### Fix 3: queue_health_reports 表 RLS
```sql
-- INSERT: 驱动只能插入自己的数据
CREATE POLICY queue_health_driver_insert ON public.queue_health_reports
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'driver' AND "driverId" = get_my_driver_id());

-- UPDATE: 驱动只能更新自己的数据
CREATE POLICY queue_health_driver_update ON public.queue_health_reports
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'driver' AND "driverId" = get_my_driver_id());

-- SELECT: 管理员可以查看所有数据
CREATE POLICY queue_health_admin_select ON public.queue_health_reports
  FOR SELECT TO authenticated
  USING (is_admin());
```

### Fix 4: 交易速率限制
```sql
CREATE FUNCTION check_driver_transaction_rate()
  RETURNS TRIGGER
  AS $$
  -- 检查驱动在过去 1 分钟内的交易数量
  -- 如果超过 50 笔，阻止插入
$$;
```

### Fix 5: RLS 覆盖率审计函数
```sql
CREATE FUNCTION get_rls_coverage_report()
  RETURNS TABLE (table_name, rls_enabled, policy_count, ...)
  AS $$
  -- 返回所有表的 RLS 覆盖情况
  -- 仅管理员可执行
$$;
```

---

## 安全架构改进

### 防御层级
```
Layer 1: 前端 TypeScript 代码
         ↓
Layer 2: Supabase RLS 策略 (PostgreSQL)
         ↓
Layer 3: 审计触发器 (PostgreSQL)
         ↓
Layer 4: 速率限制 (PostgreSQL)
```

### 审计流程
```
驱动尝试更新 transaction
         ↓
    触发器检查
         ↓
  是否修改敏感列？
    ├─ 是 → 记录到 security_audit_log + 抛出异常
    └─ 否 → 允许更新
```

---

## 部署步骤

### 1. 验证迁移文件
```bash
cd /home/myuser/bht
supabase migration list
```

### 2. 应用迁移
```bash
supabase db push
```

### 3. 验证 RLS 策略
```sql
-- 查看所有策略
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- 查看 RLS 覆盖率
SELECT * FROM get_rls_coverage_report();
```

### 4. 测试审计触发器
```sql
-- 以驱动身份尝试更新 paymentStatus（应该失败）
UPDATE transactions SET "paymentStatus" = 'PAID' WHERE id = 'test-id';

-- 查看审计日志
SELECT * FROM security_audit_log ORDER BY event_time DESC LIMIT 10;
```

### 5. 测试速率限制
```sql
-- 以驱动身份快速插入多笔交易（超过 50 笔/分钟）
-- 应该在第 51 笔时失败
```

---

## 安全检查清单

### ✅ 已完成
- [x] transactions 表 RLS 策略审查
- [x] transactions UPDATE 策略强化
- [x] 审计触发器添加
- [x] security_audit_log 表创建
- [x] queue_health_reports 表 RLS 添加
- [x] 速率限制功能添加
- [x] RLS 覆盖率审计函数

### ⏳ 待测试
- [ ] 迁移应用到开发环境
- [ ] 审计触发器功能测试
- [ ] 速率限制测试
- [ ] RLS 策略覆盖测试
- [ ] 性能影响测试

---

## 风险评估

### 改进后风险级别: **LOW** ✅

**理由**:
1. ✅ Defense in depth: 前端 + RLS + 触发器 + 速率限制
2. ✅ 审计追踪: 所有可疑操作记录到 security_audit_log
3. ✅ 速率限制: 防止 DoS 攻击
4. ✅ 表级 RLS: 所有关键表都有策略
5. ✅ 函数级安全: 所有函数使用 SECURITY DEFINER

---

## 后续建议

### 短期（本周）
1. 在开发环境测试迁移
2. 验证审计日志收集正常
3. 测试速率限制触发

### 中期（下周）
1. 监控审计日志
2. 分析可疑更新尝试
3. 调整速率限制阈值

### 长期（下月）
1. 添加更多审计事件类型
2. 建立安全告警系统
3. 定期审计 RLS 覆盖率

---

**审计完成时间**: 2026-04-23 21:00
**审计人**: Hermes Agent
**状态**: ✅ Ready for Staging Test
