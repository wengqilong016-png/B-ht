# BHT 实时功能、GPS 与证据照片链路深度追踪

> 生成日期: 2026-05-10
> 审查范围: useRealtimeSubscription.ts, useGpsCapture.ts, evidenceStorage.ts, driverFlowTelemetry.ts,
>            realtimeInvalidation.ts, collectionSubmissionService.ts, 迁移脚本 (realtime triggers + driver_flow_events)
> 方法: 静态代码追踪 + 调用链分析

---

## 1. Supabase Realtime 订阅系统

### 1.1 架构概览：Broadcast Channels 替代 postgres_changes

BHT 项目使用 **专用私有 Broadcast Channels** 而非 Supabase 原生 `postgres_changes` 实现实时推送。
架构理由：`postgres_changes` 在高频写入场景下会产生大量连接和事件，Broadcast Channels 更可扩展。

```
┌──────────────────────────────────────────────────────────┐
│                   PostgreSQL 数据库                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  notify_table_changes() 触发器函数                 │    │
│  │  SECURITY DEFINER, SECURITY INVOKER 混合         │    │
│  │                                                   │    │
│  │  PERFORM realtime.broadcast_changes(              │    │
│  │    'db:' || TG_TABLE_NAME,  ── 主题名             │    │
│  │    TG_OP,                   ── 事件类型            │    │
│  │    TG_OP,                   ── 事件名称            │    │
│  │    TG_TABLE_NAME,                                 │    │
│  │    TG_TABLE_SCHEMA,                               │    │
│  │    NEW, OLD                                       │    │
│  │  );                                               │    │
│  └──────────────────────────────────────────────────┘    │
│                         │                                │
│         ┌───────────────┼───────────────────┐            │
│         ▼               ▼                   ▼            │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────┐  │
│  │transactions│ │  drivers   │ │daily_settlements   │  │
│  │broadcast   │ │ broadcast  │ │broadcast trigger   │  │
│  │trigger     │ │ trigger    │ │                    │  │
│  └────────────┘ └────────────┘ └────────────────────┘  │
│                                 │                        │
│  ┌──────────────────────────────┘                        │
│  │ locations_broadcast_trigger (20260406 迁移添加)       │
│  ▼                                                       │
│  ┌────────────┐                                         │
│  │ locations  │                                         │
│  │ broadcast  │                                         │
│  │ trigger    │                                         │
│  └────────────┘                                         │
│                                                          │
│  RLS on realtime.messages:                               │
│    允许 authenticated 角色 SELECT                        │
│    主题白名单: db:transactions, db:drivers,              │
│               db:daily_settlements, db:locations          │
└──────────────────────────────────────────────────────────┘
```

### 1.2 Channel 配置 (按角色区分)

**文件**: `/root/bht/hooks/useRealtimeSubscription.ts` (行 34-51)

| 角色 | Channel 主题 | 对应表 | 说明 |
|------|-------------|--------|------|
| admin | `db:transactions` | transactions | 所有交易变更 |
| admin | `db:drivers` | drivers | 司机信息变更 |
| admin | `db:daily_settlements` | daily_settlements | 日结对账变更 |
| admin | `db:locations` | locations | 机器状态/位置变更 |
| driver | `db:transactions` | transactions | 仅自己的交易变更 |

**设计决策**: 司机端只订阅 `db:transactions`，不订阅其他 channel，避免不必要的数据暴露和带宽消耗。
用户角色未确定前（`!userRole`）不建立订阅，防止未认证会话接收到 admin 范围的广播事件。

### 1.3 触发器和 RLS 策略

**基础迁移** (`supabase/migrations/20260328000001_realtime_broadcast_triggers.sql`):
```sql
-- 创建触发器函数 notify_table_changes()
-- 在 transactions, drivers, daily_settlements 上创建 AFTER 触发器

-- RLS 策略（初版，3 个主题）:
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (topic IN ('db:transactions', 'db:drivers', 'db:daily_settlements'));
```

**locations 扩展迁移** (`supabase/migrations/20260406000001_realtime_locations.sql`):
```sql
-- 在 locations 表上添加触发器
CREATE TRIGGER locations_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.notify_table_changes();

-- 更新 RLS 策略（4 个主题）:
DROP POLICY ... ;  -- 删除旧策略
CREATE POLICY "authenticated_users_can_receive_broadcasts" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    topic IN ('db:transactions', 'db:drivers',
              'db:daily_settlements', 'db:locations')
  );
```

**幂等设计**: 使用 `DROP TRIGGER IF EXISTS` + `DROP POLICY IF EXISTS`，可重复执行。

**性能优化**: 创建索引 `idx_realtime_messages_topic ON realtime.messages (topic)`。

### 1.4 客户端订阅流程

**文件**: `/root/bht/hooks/useRealtimeSubscription.ts` (行 104-163)

```
useRealtimeSubscription(userRole, isOnline)
  │
  ├─ [Guard] !supabase || !userRole → return (不订阅)
  │
  ├─ useEffect #1: 建立/拆除订阅 (依赖 [queryClient, userRole])
  │    │
  │    ├─ createRealtimeInvalidator(queryClient)
  │    │    └─ 返回 { queue, cleanup }
  │    │
  │    ├─ supabase.realtime.setAuth()  ← 设置 JWT token
  │    │
  │    ├─ getChannelConfigs(userRole)  ← 按角色选 channel 集合
  │    │
  │    ├─ subscribeToRealtimeChannels()
  │    │    │  对每个 { topic, table }:
  │    │    │    client.channel(topic, { config: { private: true } })
  │    │    │    channel.on('broadcast', { event: 'INSERT|UPDATE|DELETE' },
  │    │    │                () => queue(table))
  │    │    │    channel.subscribe(statusHandler)
  │    │    │
  │    │    └─ statusHandler 追踪 SUBSCRIBED/CLOSED/reconnecting
  │    │       所有 channel SUBSCRIBED → realtimeStatus='connected'
  │    │       所有 channel CLOSED     → realtimeStatus='disconnected'
  │    │
  │    └─ Cleanup (组件卸载/角色变更):
  │         channels.forEach(ch => {
  │           ch.unsubscribe()          ← 显式卸载事件监听器
  │           client.removeChannel(ch)  ← 释放 channel 资源
  │         })
  │         cleanup()                   ← 清理 debounce 计时器
  │
  └─ useEffect #2: 重连时刷新 JWT (依赖 [isOnline, userRole])
       ├─ if supabase && userRole && isOnline:
       │    supabase.auth.getSession()
       │      .then(() => supabase.realtime.setAuth())
       └─ 防止离线期间 JWT 过期导致重连静默失败
```

### 1.5 invalidation 防抖机制

**文件**: `/root/bht/services/realtimeInvalidation.ts` (47行)

```
Table → React Query Key 映射:
  transactions      → ['transactions']
  drivers           → ['drivers']
  daily_settlements → ['dailySettlements']
  locations         → ['locations']

debounce: 250ms
  - 在 250ms 窗口内，同一个 key 的多次广播只触发一次 invalidateQueries
  - 防止事件风暴导致的重复网络请求
  - 不同 key 的广播共享同一个 timer，一次性刷入
```

### 1.6 通知 (Notification) 现状

项目中**不存在独立的 `db:notifications` channel**。当前的实时"通知"机制是通过：
- Realtime broadcast → React Query cache invalidation → UI 重新渲染来实现
- 离线时的通知通过 `checkDbHealth()` 5 秒轮询和 `flushQueue` 后的 `refetchQueries` 覆盖

---

## 2. GPS 采集和上传

### 2.1 useGpsCapture Hook

**文件**: `/root/bht/driver/hooks/useGpsCapture.ts` (63行)

```
状态机:
  idle ──request()──▶ requesting ──success──▶ granted (coords 可用)
    │                     │
    │                     ├─ PERMISSION_DENIED ──▶ denied
    │                     ├─ TIMEOUT (10s)     ──▶ timeout
    │                     └─ 其他错误           ──▶ error

参数:
  navigator.geolocation.getCurrentPosition(success, error, {
    timeout: 10000,           ← 10 秒超时
    enableHighAccuracy: true  ← 优先高精度 (GPS 而非基站)
  })

返回 GpsCoords:
  { lat: number, lng: number }
  // 错误时 resolve(null)，不 reject Promise
```

**关键设计**:
- `request()` 返回 `Promise<GpsCoords | null>`，错误统一返回 `null`（不抛异常）
- 支持 `initialCoords` 参数，用于从草稿恢复时保持 `granted` 状态
- `request()` 可安全多次调用（重试场景）

### 2.2 GPS 解析优先级 (SubmitReview)

**文件**: `/root/bht/driver/components/SubmitReview.tsx` (行 354-388)

```
resolveGps() 决策树:
  │
  ├─ gpsCoords 已存在 (useGpsCapture 已获取)
  │    └─ processSubmission(gpsCoords, 'live')  ← 最高优先级
  │
  ├─ 有照片数据 (photoData)
  │    └─ extractGpsFromExif(photoData)
  │         ├─ 成功 → processSubmission(coords, 'exif')
  │         └─ 失败 → 继续
  │
  ├─ estimateLocationFromContext()
  │    ├─ 成功 → processSubmission(coords, 'estimated')
  │    │         └─ 需要用户确认弹窗
  │    └─ 失败 → 继续
  │
  └─ 全部失败
       └─ processSubmission({lat:0, lng:0}, 'none')
            └─ 需要用户确认弹窗
```

**GPS 来源类型** (`gpsSourceType`):
- `'live'` — 浏览器 GPS API 实时获取
- `'exif'` — 照片 EXIF 元数据提取
- `'estimated'` — 上下文推测（可能需要用户确认）
- `'none'` — 无坐标，使用 {0, 0} 占位

### 2.3 GPS 在提交流中的传递

**文件**: `/root/bht/services/collectionSubmissionOrchestrator.ts` (行 230-247)

```
orchestrateCollectionSubmission(input)
  │  input.resolvedGps, input.gpsSourceType
  │
  └─ buildCollectionSubmissionInput(input)
       │
       ├─ gps: input.resolvedGps.lat === 0 && input.resolvedGps.lng === 0
       │       ? null    ← {0,0} 被视为"无 GPS"
       │       : input.resolvedGps
       │
       └─ notes: gpsSourceType !== 'live'
                ? `[GPS: ${gpsSourceType}]`  ← 标注 GPS 来源
```

**RPC 参数映射** (`collectionSubmissionService.ts` 行 163):
```typescript
p_gps: input.gps  // { lat: number, lng: number } | null
```

**SQL 端存储** (`submit_collection_v2`):
```sql
p_gps JSONB DEFAULT NULL   -- 直接存入 transactions.gps 列
```

### 2.4 NaN 防护机制

**位置 1**: `collectionSubmissionService.ts` 行 35-42
```typescript
/** Runtime NaN guard */
function isValidGps(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== 'object') return false;
  const gps = value as { lat: number; lng: number };
  return typeof gps.lat === 'number' && !Number.isNaN(gps.lat)
      && typeof gps.lng === 'number' && !Number.isNaN(gps.lng);
}
```
**触发点**: 服务器返回数据后，在构建 Transaction 对象时 (行 234):
```typescript
gps: (isValidGps(row['gps']) ? (row['gps'] as ...) : undefined)
     ?? input.gps ?? { lat: 0, lng: 0 }
```

**位置 2**: `collectionSubmissionOrchestrator.ts` 行 191
```typescript
if (trimmedScore === '' || Number.isNaN(parsedScore)) {
  throw new Error('Invalid current score');  // 阻止 NaN 分数提交
}
```

**位置 3**: `offlineQueue.ts` 行 413-423
```typescript
// markSynced 时的 authority data 验证
if (typeof data.currentScore !== 'number' || !isFinite(data.currentScore)) { ... }
if (typeof data.previousScore !== 'number' || !isFinite(data.previousScore)) { ... }
if (typeof data.timestamp !== 'string' || isNaN(Date.parse(data.timestamp))) { ... }
```

**防护层级**:
1. **输入层**: `useGpsCapture` 始终返回 `{lat, lng}` 有效数字或 `null`
2. **编排层**: `buildCollectionSubmissionInput` 过滤 `{0,0}` 为 `null`
3. **转换层**: RPC 返回后 `isValidGps()` 运行时守卫，fallback 到 `input.gps` 或 `{0,0}`
4. **存储层**: `markSynced` 验证权威数据中数值字段的有限性

### 2.5 采集频率

GPS 采集是**按需触发**，而非持续追踪：
- 用户在 DriverCollectionFlow 的 `capture` 步骤触发 `request()`
- 单次调用 `getCurrentPosition()` — 获取一次坐标后即停止
- 无后台位置追踪、无 watchPosition、无定时采集
- 10 秒超时限制单次采集的最大等待时间

---

## 3. 证据照片上传

### 3.1 Supabase Storage Bucket 结构

**文件**: `/root/bht/services/evidenceStorage.ts` (138行)

```
Bucket 名称: 'evidence'

对象路径规范:
  {category}/{driverId}/{entityId}.{extension}
  
  示例:
    collection/driver-abc/tx-123.jpg         ← 收款证据照
    reset-request/driver-abc/reset-456.jpg   ← 重置请求照
    payroll/driver-abc/payroll-789.jpg       ← 工资照
    driver-profile/driver-abc/background-photo.jpg  ← 司机头像
```

**路径构建** (`buildObjectPath`, 行 48-51):
```typescript
function buildObjectPath(options, extension) {
  const driverSegment = options.driverId?.trim()
    ? options.driverId.trim()
    : 'unknown-driver';  // 无 driverId 时的降级路径
  return `${options.category}/${driverSegment}/${options.entityId}.${extension}`;
}
```

**文件扩展名映射** (`getFileExtension`, 行 42-46):
```typescript
// image/jpeg → jpg
// image/png  → png
// image/webp → webp
// 其他非法字符替换为 '-'
```

### 3.2 上传核心流程

```
persistEvidencePhotoUrl(photoUrl, options)
  │
  ├─ [Gate 1] !photoUrl → return null (无需上传)
  │
  ├─ [Gate 2] !isDataImageUrl(photoUrl) → return photoUrl
  │    └─ 已是 HTTP URL，直接返回（已持久化过的照片）
  │
  ├─ [Gate 3] !supabase → throw Error
  │
  ├─ [Gate 4] !bucket (storage.from('evidence') 失败)
  │    └─ return photoUrl  ← 降级：保留 base64，不阻塞
  │
  ├─ parseDataUrl(photoUrl)
  │    ├─ 正则: /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  │    ├─ atob(base64) → Uint8Array
  │    └─ → { mimeType, bytes }
  │
  ├─ buildObjectPath(options, extension)
  │
  ├─ createBlobFromBytes(bytes, mimeType)
  │
  └─ uploadWithRetry(bucket, objectPath, blob, mimeType)
       │
       ├─ MAX_RETRIES = 2 (共 3 次尝试)
       ├─ 每次: bucket.upload(path, blob, {
       │           contentType: mimeType,
       │           upsert: true,           ← 幂等覆盖
       │           signal: AbortSignal.timeout(15_000)  ← 15s 硬超时
       │         })
       ├─ 重试延迟: attempt 0→无延迟, attempt 1→1s, attempt 2→2s
       │
       ├─ 成功 → return null (无错误) → 获取 publicUrl
       └─ 全部失败 → return { message } → 根据 options.required 处理
            ├─ required=true  → throw Error (致命)
            └─ required=false → return null (非致命)
```

### 3.3 uploadWithRetry 实现

**文件**: `evidenceStorage.ts` 行 73-109

```
uploadWithRetry(bucket, objectPath, blob, mimeType)
  │
  │  for attempt in [0, 1, 2]:
  │    try:
  │      { error } = bucket.upload(objectPath, blob, {
  │        contentType: mimeType,
  │        upsert: true,
  │        signal: AbortSignal.timeout(15000)
  │      })
  │      if (!error) → return null  (成功)
  │    catch (err):
  │      uploadError = { message: String(err) }
  │    
  │    if attempt < 2:
  │      await delay(1000 * (attempt + 1))
  │  
  │  → return uploadError  (所有重试失败)
```

**关键参数**:
| 参数 | 值 | 说明 |
|------|---|------|
| `contentType` | 原始 MIME type | 确保浏览器正确渲染 |
| `upsert` | `true` | 重复上传同一路径时覆盖（幂等） |
| `signal` | `AbortSignal.timeout(15000)` | 单次上传 15 秒硬超时 |
| 最大尝试 | 3 次 | 累计最长 15s×3 + 延迟 3s = 48s |
| 重试间隔 | 1s, 2s | 线性递增（非指数） |

### 3.4 照片上传的调用点

| 调用位置 | category | required | 失败行为 |
|---------|----------|----------|---------|
| `submitCollectionV2` | `collection` | `true` | 抛异常，提交失败，不降级到离线 |
| `DriverStatusPanel` handleSaveProfile | `driver-profile` | `false` | 照片为 null，但仍保存其他字段 |
| `offlineQueue` enqueueTransaction | `collection` | `false` | 保留 base64，标记 `photoPending=true` |

**提交中的照片持久化时机**:
```
submitCollectionV2(input)
  │
  ├─ Gate: 缺失 photoUrl → evidence 类失败 (不 fallback)
  ├─ Gate: URL 格式无效 → evidence 类失败
  ├─ persistEvidencePhotoUrl(photoUrl, { required: true })
  │    └─ 失败 → evidence 类失败 (证据类错误不降级到离线)
  │
  └─ supabase.rpc('submit_collection_v2', { p_photo_url: persistedPhotoUrl })
```

---

## 4. driver_flow_events 遥测系统

### 4.1 表结构

**文件**: `/root/bht/supabase/migrations/20260416120000_driver_flow_events.sql`

```sql
CREATE TABLE public.driver_flow_events (
    id UUID PRIMARY KEY,
    driver_id TEXT NOT NULL,           -- 司机 ID
    flow_id TEXT NOT NULL,             -- 流程会话 ID (同一次操作的多个事件共享)
    draft_tx_id TEXT,                  -- 草稿交易 ID
    location_id TEXT,                  -- 机器/位置 ID
    step TEXT NOT NULL,                -- 流程步骤 (9 个有效值)
    event_name TEXT NOT NULL,          -- 事件名称
    online_status BOOLEAN NOT NULL DEFAULT FALSE,
    gps_permission TEXT NOT NULL DEFAULT 'unknown',  -- 6 个有效值
    has_photo BOOLEAN NOT NULL DEFAULT FALSE,
    error_category TEXT,               -- 错误分类
    duration_ms INTEGER,               -- 步骤耗时 (毫秒)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 事件类型 (step 有效的 9 个步骤)

| step | 含义 | 典型 event_name |
|------|------|----------------|
| `selection` | 选择机器 | `machine_selected`, `location_changed` |
| `capture` | 拍照/读数 | `photo_captured`, `score_entered`, `capture_duration` |
| `amounts` | 财务调整 | `amounts_confirmed`, `expense_added` |
| `confirm` | 确认提交 | `submit_attempt`, `submit_validation_error` |
| `complete` | 完成 | `submit_success`, `submit_offline_queued`, `submit_failed`, `submit_zero_revenue` |
| `reset_request` | 重置请求 | `reset_request_submitted` |
| `payout_request` | 付款请求 | `payout_request_submitted` |
| `office_loan` | 公司贷款 | `office_loan_created` |
| `site_info` | 现场信息 | `site_info_updated` |

### 4.3 gps_permission 有效值

| 值 | 含义 |
|----|------|
| `prompt` | 浏览器正在询问权限 |
| `granted` | 用户已授权 GPS |
| `denied` | 用户拒绝 GPS 权限 |
| `timeout` | GPS 请求超时 |
| `error` | GPS 其他错误 |
| `unknown` | 未请求或状态未知 |

### 4.4 RLS 策略

```sql
-- SELECT: 仅 admin 可查看
CREATE POLICY driver_flow_events_admin_select
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT: admin 或事件所属的司机
CREATE POLICY driver_flow_events_driver_insert
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR driver_id = public.get_my_driver_id()
  );

-- 无 UPDATE / DELETE 策略 → 追加型审计日志
```

**审计特性**:
- **不可变**: 没有 UPDATE/DELETE 策略，事件一旦写入即永久保留
- **时间线重建**: `flow_id` + `created_at` 可重建每个操作会话的完整时间线
- **PII 保护**: payload 在客户端即被脱敏（见 4.5）

### 4.5 遥测客户端实现

**文件**: `/root/bht/services/driverFlowTelemetry.ts` (190行)

```
recordDriverFlowEvent(input)
  │
  ├─ buildDriverFlowEvent(input)
  │    ├─ 生成 UUID (safeRandomUUID)
  │    ├─ sanitizePayload(input.payload)  ← 脱敏
  │    │    └─ 删除含 photo/image/gps/coord/lat/lng/phone 的键
  │    └─ 返回 DriverFlowEvent
  │
  ├─ IF input.onlineStatus === false:
  │    └─ enqueueEvent(event)  → localStorage 队列
  │
  └─ ELSE (在线):
       ├─ insertEvents([event])  → supabase.from('driver_flow_events').insert()
       │    ├─ 成功 → flushDriverFlowEvents()  ← 尝试冲刷离线队列
       │    └─ 失败 → enqueueEvent(event)      ← 降级到本地队列
       │
       └─ 均为 void (fire-and-forget)，不阻塞主流程
```

**离线队列**:
```
本地存储键: 'bahati_driver_flow_events_queue' (localStorage)
最大容量: MAX_QUEUE_SIZE = 200
  - 超过 200 条时截断最旧的事件 (slice(-200))
  - 队列满时静默丢弃旧事件
  - 错误处理: try/catch 包裹所有读写操作，任何错误均静默
```

**冲刷机制**:
```
flushDriverFlowEvents()
  ├─ readQueuedEvents()
  ├─ insertEvents(all)           ← 批量插入
  └─ if success → writeQueuedEvents([])  ← 清空队列
```

### 4.6 索引设计 (4 个复合索引)

```sql
idx_driver_flow_events_created             -- (created_at DESC)
  → 按时间倒序查询 (最新事件)

idx_driver_flow_events_driver_created      -- (driver_id, created_at DESC)
  → 按司机查询事件时间线

idx_driver_flow_events_flow                -- (flow_id, created_at)
  → 重建单个操作会话的完整步骤链

idx_driver_flow_events_step_event          -- (step, event_name, created_at DESC)
  → 按步骤和事件类型统计分析
```

### 4.7 审计用途

| 审计场景 | 查询方式 | 示例 |
|---------|---------|------|
| 单次收款审查 | `WHERE flow_id = 'xxx' ORDER BY created_at` | 查看从选择机器到提交完成的完整步骤 |
| 司机操作审计 | `WHERE driver_id = 'xxx' ORDER BY created_at DESC` | 审查某位司机的所有操作轨迹 |
| 提交失败分析 | `WHERE step = 'complete' AND event_name = 'submit_failed'` | 统计提交失败率和原因 |
| GPS 权限分析 | `GROUP BY gps_permission` | 分析司机 GPS 授权率 |
| 照片缺失分析 | `WHERE has_photo = false AND step = 'capture'` | 审计无照片提交的比例 |
| 步骤耗时分析 | `WHERE duration_ms IS NOT NULL` | 分析各步骤平均耗时 |
| 异常模式检测 | `WHERE event_name = 'submit_validation_error'` | 检测频繁输入验证失败 |

---

## 5. 修改联动文件

当修改以下功能时，需要同时关注的联动文件：

### 5.1 Realtime 修改

| 修改点 | 联动文件 |
|--------|---------|
| 新增 channel/主题 | `useRealtimeSubscription.ts` (ADMIN_CHANNELS/DRIVER_CHANNELS) |
| | `realtimeInvalidation.ts` (TABLE_TO_QUERY_KEY) |
| | SQL 迁移: RLS 策略白名单更新 |
| | SQL 迁移: 新表添加 broadcast trigger |
| 修改广播事件类型 | `useRealtimeSubscription.ts` (BROADCAST_EVENTS) |
| 修改 debounce 时间 | `realtimeInvalidation.ts` (REALTIME_INVALIDATE_DEBOUNCE_MS) |

### 5.2 GPS 修改

| 修改点 | 联动文件 |
|--------|---------|
| GPS 采集参数 (timeout/accuracy) | `useGpsCapture.ts` |
| GPS 解析优先级 | `SubmitReview.tsx` (resolveGps 逻辑) |
| GPS 提交流转 | `collectionSubmissionOrchestrator.ts` (buildCollectionSubmissionInput) |
| | `collectionSubmissionService.ts` (CollectionSubmissionInput.gps) |
| | SQL: `submit_collection_v2` (p_gps 参数 + transactions.gps 列) |
| GPS 服务器返回校验 | `collectionSubmissionService.ts` (isValidGps) |
| GPS 权威数据验证 | `offlineQueue.ts` (validateAuthoritativeData) |

### 5.3 证据照片修改

| 修改点 | 联动文件 |
|--------|---------|
| Bucket 名称/结构 | `evidenceStorage.ts` (EVIDENCE_BUCKET, buildObjectPath) |
| | `collectionSubmissionService.ts` (persistEvidencePhotoUrl 调用) |
| | `offlineQueue.ts` (enqueueTransaction 中的照片持久化) |
| | `DriverStatusPanel.tsx` (handleSaveProfile 中的头像上传) |
| | Supabase Storage RLS 策略 (需手动配置) |
| 重试策略 | `evidenceStorage.ts` (uploadWithRetry: MAX_RETRIES, 延迟) |
| 照片格式支持 | `evidenceStorage.ts` (isDataImageUrl 正则, getFileExtension) |
| 超时时间 | `evidenceStorage.ts` (AbortSignal.timeout(15000)) |

### 5.4 遥测修改

| 修改点 | 联动文件 |
|--------|---------|
| 新增 step | SQL 迁移: CHECK 约束更新 |
| | `driverFlowTelemetry.ts` (类型定义 DriverFlowStep) |
| 新增 event_name | 无 DB 约束，仅需更新文档 |
| Payload 脱敏规则 | `driverFlowTelemetry.ts` (sanitizePayload 黑名单) |
| 队列容量 | `driverFlowTelemetry.ts` (MAX_QUEUE_SIZE) |
| RLS 策略变更 | SQL 迁移: 更新/新增 POLICY |
| Pull 端 (admin 查看) | `fetchDriverFlowEvents` + 管理面板组件 |

### 5.5 跨模块总联动图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Realtime    │────▶│  React Query │────▶│  UI 组件         │
│  Broadcast   │     │  Cache       │     │  (DriverStatus   │
│  Channels    │     │  Invalidation│     │   Panel 等)      │
└──────────────┘     └──────────────┘     └──────────────────┘
        │
        │ DB Triggers (notify_table_changes)
        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  PostgreSQL  │     │  Storage     │     │  Telemetry       │
│  Tables      │     │  Buckets     │     │  Events          │
│  + RLS       │     │  + Policies  │     │  + RLS           │
└──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                    │                       │
       │ GPS JSONB,         │ evidence/ 路径        │ localStorage
       │ photoUrl TEXT      │ uploadWithRetry        │ 离线队列
       ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│              submit_collection_v2 RPC                        │
│  SECURITY DEFINER → 认证 → 鉴权 → 财务 → INSERT → RETURN    │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 数据流时序总结

```
用户在 DriverCollectionFlow / QuickCollect
  │
  ├─ Step 1: selection
  │    └─ telemetry: step='selection', event='machine_selected'
  │
  ├─ Step 2: capture (拍照 + 读数)
  │    ├─ GPS: useGpsCapture.request() → {lat, lng} 或 null
  │    ├─ Photo: Camera API → base64 data URL
  │    └─ telemetry: step='capture', gps_permission=gpsStatus, has_photo=true
  │
  ├─ Step 3: amounts (财务调整)
  │    └─ telemetry: step='amounts'
  │
  ├─ Step 4: confirm → submit
  │    ├─ resolveGps: live > exif > estimated > none
  │    ├─ telemetry: step='confirm', event='submit_attempt'
  │    │
  │    ├─ IF isOnline=true:
  │    │    ├─ persistEvidencePhotoUrl(base64) → Storage URL
  │    │    │    └─ uploadWithRetry (3次, 15s/次)
  │    │    ├─ supabase.rpc('submit_collection_v2', {p_gps, p_photo_url})
  │    │    │    └─ 30s 硬超时
  │    │    └─ telemetry: step='complete', event='submit_success'
  │    │
  │    ├─ ELSE offline:
  │    │    ├─ enqueueTransaction(IDB) + rawInput + photoPending
  │    │    └─ telemetry: step='complete', event='submit_offline_queued'
  │    │
  │    └─ FAIL:
  │         └─ telemetry: step='complete', event='submit_failed'
  │
  └─ POST-SUBMIT:
       ├─ Realtime: DB trigger → broadcast_changes → client channel → invalidateQueries
       │    └─ UI 自动刷新 (250ms debounce)
       └─ flushDriverFlowEvents() → 批量写入离线遥测队列
```

---

## 7. 关键风险与已知限制

### 7.1 Realtime 限制
- 无 `notifications` channel — 所有"通知"都通过 cache invalidation 实现
- 离线期间的事件丢失 — Realtime WebSocket 断开后无事件队列，恢复后依赖 `refetchQueries` 全量刷新
- JWT 过期风险 — 依赖 `useEffect #2` 在重连时刷新，但存在竞态窗口

### 7.2 GPS 限制
- 按需获取而非持续追踪 — 无法实现实时车辆追踪
- `{0,0}` 语义模糊 — 既是"无 GPS"又是"赤道/本初子午线"
- EXIF 提取和位置推测的具体实现在 SubmitReview.tsx 中，需关注其可靠性

### 7.3 照片存储限制
- base64 data URL 内存占用 — 大照片在内存中可能造成性能问题（已通过 `resizeImage(file, 1280, 0.7)` 预处理缓解）
- Bucket RLS 策略 — 代码中未在迁移脚本中定义 (需在 Supabase Dashboard 手动配置或通过 SQL)
- 离线队列中的 base64 — `photoPending=true` 保留原始 base64，占用 IDB 空间

### 7.4 遥测限制
- localStorage 队列上限 200 条 — 超出静默丢弃
- 无法 UPDATE/DELETE — 故意设计为审计日志，但意味着无法纠正错误记录
- 脱敏策略基于键名关键字匹配 — 可能漏掉非标准键名
