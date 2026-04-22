# Supabase 连接设置指南

## 当前状态

**本地 Supabase**: ❌ 不可用（需要 Docker，Proot 环境中无法运行）

**解决方案**:

### Option 1: Supabase Cloud (推荐)

#### 步骤 1: 获取凭证
1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目 `bahati-jackpots`
3. 进入 **Settings** → **API**
4. 复制以下信息：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key: `eyJhbG...`

#### 步骤 2: 创建 .env 文件
```bash
cd ~/bht
cat > .env << 'EOF'
# Supabase Cloud Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Service role key (for admin operations)
# SUPABASE_SERVICE_KEY=your-service-key-here

# Optional: Enable debug mode
# VITE_DEBUG_MODE=true
EOF
```

#### 步骤 3: 测试连接
```bash
# 方法 1: 使用 curl 测试 API
curl -X GET "https://your-project-id.supabase.co/rest/v1/" \
  -H "apikey: your-anon-key-here" \
  -H "Authorization: Bearer your-anon-key-here"

# 预期响应: 应返回 API 文档信息
```

### Option 2: 本地开发数据库 (Docker)

如果你想使用本地 Supabase，需要：

```bash
# 1. 在 Termux 中安装 Docker
pkg install docker
dockerd &

# 2. 启动 Supabase
cd ~/bht
supabase start

# 3. 验证
supabase status
```

### Option 3: Mock 模式 (前端测试)

如果暂时无法连接 Supabase，可以启用 mock 模式：

```typescript
// 在 src/env.ts 或相关配置文件中
const MOCK_MODE = true;  // 设置为 true 启用 mock 数据
```

---

## 验证连接

创建 `.env` 后，运行以下命令验证：

```bash
# 1. 检查环境变量是否正确加载
cd ~/bht
grep VITE_SUPABASE .env

# 2. 启动开发服务器测试
npm run dev

# 3. 在浏览器中打开应用
# 应该显示登录界面而不是错误
```

---

## 常见问题

### 问题 1: CORS 错误
**现象**: `Access to fetch has been blocked by CORS policy`

**解决**:
- 确保 `.env` 中的 URL 是正确的 Supabase 项目 URL
- 检查 Supabase Dashboard 中的 CORS 设置
- 添加 `http://localhost:5173` 和 `http://localhost:3000` 到 CORS 允许列表

### 问题 2: Invalid API Key
**现象**: `Invalid API key` 或 `JWT error`

**解决**:
- 检查 `.env` 文件中的 `VITE_SUPABASE_ANON_KEY` 是否正确
- 确保没有多余的空格或换行符
- 确保使用的是 **anon key** 而不是 service role key

### 问题 3: Connection Refused
**现象**: `Failed to fetch` 或 `net::ERR_CONNECTION_REFUSED`

**解决**:
- 检查 Supabase 项目是否处于活跃状态
- 检查网络连接
- 验证 URL 格式（应为 `https://project-id.supabase.co`）

---

## 快速设置命令

```bash
# 1. 进入项目目录
cd ~/bht

# 2. 创建 .env 文件（替换为你的实际凭证）
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
EOF

# 3. 安装依赖（如果还没安装）
npm install

# 4. 启动开发服务器
npm run dev
```

---

## 安全提醒

⚠️ **重要**:
- 不要将 `.env` 文件提交到 Git
- `.env` 文件已添加到 `.gitignore`
- service role key 只能在服务器端使用
- anon key 可以在前端使用，但要注意权限控制

---

**需要帮助?** 请提供你的 Supabase 项目 URL（不含 anon key），我可以帮你检查配置。
