# Deployment Guide

This document describes how to configure environment variables for deploying this Vite + React app on Vercel (or locally).

## Required Environment Variables

All frontend variables **must** be prefixed with `VITE_` so that Vite exposes them to the browser bundle via `import.meta.env`.

| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `VITE_GEMINI_API_KEY` | Google Gemini API key | Yes |
| `VITE_STATUS_API_BASE` | Base URL for the status API (e.g. `https://your-status-api.example.com`) | Optional |
| `VITE_INTERNAL_API_KEY` | API key sent as `X-API-KEY` header to the status API | Optional |
| `SUPABASE_URL` | Your Supabase project URL for the backend status API (`status_api.py`) | Yes (backend) |
| `SUPABASE_KEY` | Supabase service role key for the backend status API (`status_api.py`) | Yes (backend) |

> **Security note:** `SUPABASE_KEY` (service role key) grants admin-level access to your database and **must never be placed in frontend code or any `VITE_` variable**. Keep it only in server-side/backend environments.

## Vercel Setup

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard).
2. Go to **Settings → Environment Variables**.
3. Add each variable from the table above with the appropriate value for each environment (Production, Preview, Development).
4. Redeploy the project after saving the variables.

> **If you see a white screen after deployment**, the most common cause is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Check the browser console for a `[Bahati] Supabase is not configured` warning. A second common cause is a stale service-worker cache – the service worker has been updated to always fetch fresh HTML, so a hard-refresh (`Ctrl+Shift+R`) or clearing site data will resolve it on existing installs.

## Local Development

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

`.env.local` contents:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_STATUS_API_BASE=http://localhost:5000
VITE_INTERNAL_API_KEY=your_internal_api_key_here
```

Then start the dev server:

```bash
npm install
npm run dev
```

> `.env.local` is listed in `.gitignore` and will not be committed to the repository.

---

## ⚠️ Supabase 配置建议（意见）

### 1. 硬编码备用凭据（中等风险）

`supabaseClient.ts` 中存在硬编码的项目 URL 和 `anon` 密钥作为备用值：

```ts
export const SUPABASE_URL = envUrl || 'https://yctsiudhicztvppddbvk.supabase.co';
export const SUPABASE_ANON_KEY = envKey || '...';
```

**说明：** Supabase 的 `anon` 密钥设计上是可以公开的（通过 RLS 策略进行权限控制），但将其硬编码进源代码并提交至 GitHub 后，任何人都能拿到这对凭据直接访问你的 Supabase 项目。

**建议：**
- 生产部署时务必通过 GitHub Secrets / Vercel 环境变量注入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，不要依赖备用值。
- 若担心密钥泄露，可前往 Supabase 控制台 → Settings → API 重新生成 `anon` 密钥，并同步更新所有环境变量。
- 长期建议：将硬编码备用值替换为空字符串，强制要求环境变量存在才能启动：
  ```ts
  if (!envUrl || !envKey) throw new Error('[Bahati] Supabase env vars are required.');
  ```

### 2. 邮件域名推断角色（高安全风险）

`services/authService.ts` 中存在以下逻辑：

```ts
if (fallbackEmail.includes('admin@bahati.com')) {
  return { success: true, user: { role: 'admin', ... } };
}
if (fallbackEmail.includes('@bahati.com')) {
  return { success: true, user: { role: 'driver', ... } };
}
```

**问题：** 当 `profiles` 表查询失败时（例如 RLS 配置有误），系统会根据邮件域名来推断权限角色。任何拥有 `@bahati.com` 邮箱的用户都会被自动赋予 `driver` 权限，这绕过了正常的数据库授权流程。

**建议：**
- 确保 RLS 策略正确配置，让合法用户能够读取自己的 `profiles` 行。
- 将此回退逻辑替换为明确的错误返回，避免任何"猜测"授权：
  ```ts
  if (error || !profile) {
    return { success: false, error: 'Profile not found' };
  }
  ```
- 该 fallback 应仅在开发环境（`import.meta.env.DEV`）中保留，生产环境应完全移除。

### 3. 数据库健康检查频率（性能建议）

当前每 30 秒查询一次 `locations` 表来检测在线状态：

```ts
refetchInterval: 30000,
queryFn: async () => await checkDbHealth(), // SELECT id FROM locations LIMIT 1
```

**建议：** 使用 Supabase 的 Realtime 或更轻量的 ping 端点（如 `supabase.from('_pgsodium_key_id').select('count')` 或直接 `HEAD` 请求），减少对业务表的无效查询负担，或将间隔延长至 60 秒。

### 4. Supabase Edge Functions 尚未激活

`supabase/functions/create-driver/` 已编写 Deno Edge Function，但当前应用中未使用。若需要在服务端安全地创建司机账户，应通过 Supabase CLI 部署：

```bash
supabase functions deploy create-driver
```

并在 Vercel / GitHub Actions 中设置 `SUPABASE_SERVICE_ROLE_KEY` 环境变量（仅限服务端，绝不放在 `VITE_` 前缀变量中）。

---

## ⚠️ Vercel 配置建议（意见）

### 1. 双部署平台冲突（架构风险）

项目同时存在：
- `.github/workflows/deploy.yml` → 部署到 **GitHub Pages**
- `vercel.json` + `.github/workflows/lint.yml` → 配置了 **Vercel** 部署检查

**问题：** 两个平台都尝试托管同一应用，可能导致：用户访问 GitHub Pages 版本，而 Vercel 版本（如 `bahatiwin.space`）同时存在但配置不同。

**建议：**
- **选择一个主部署平台**，明确废弃另一个：
  - 若使用 **Vercel**（推荐，因为已有 `vercel.json` 和域名绑定 `bahatiwin.space`）：删除 `deploy.yml` 并通过 Vercel 控制台直接集成 GitHub 仓库。
  - 若坚持使用 **GitHub Pages**：删除 `vercel.json` 并停用 Vercel 项目，同时删除 `lint.yml`。

### 2. Vercel 通知步骤缺少 `token`（CI 失败风险）

`.github/workflows/lint.yml` 中的 Vercel 回报步骤：

```yaml
- name: 'notify vercel'
  uses: 'vercel/repository-dispatch/actions/status@v1'
  with:
    name: 'Vercel - b-ht: lint'
    # ❌ 缺少 token 参数
```

**建议：** 补充 GitHub Token（或 Vercel 专用 token）：

```yaml
- name: 'notify vercel'
  uses: 'vercel/repository-dispatch/actions/status@v1'
  with:
    name: 'Vercel - b-ht: lint'
    token: ${{ secrets.GITHUB_TOKEN }}
```

### 3. `vercel.json` 缺少 SPA 路由回退（潜在404）

当前 `vercel.json` 的 rewrite 规则：

```json
{
  "source": "/((?!assets/)(?!.*\\.[^/]+$).*)",
  "destination": "/index.html"
}
```

此规则理论上正确，但正则复杂度高。**建议**使用更简洁的标准写法：

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

同时确保 Vercel 控制台的 Framework Preset 设为 **Vite**，可自动处理 SPA 路由。

### 4. 环境变量未同步至 Vercel 控制台

当前 GitHub Actions `deploy.yml` 中传入了以下 secrets：

```
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY,
VITE_STATUS_API_BASE, VITE_INTERNAL_API_KEY
```

但 `.env.example` 中还有 `VITE_GOOGLE_MAPS_API_KEY`，它既没有在 CI 中传入，也没有在任何 TypeScript 文件中被使用。

**建议：**
- 若 Google Maps 功能已废弃，从 `.env.example` 中删除该变量以减少混淆。
- 若计划使用，在 `vite-env.d.ts` 中补充声明，在 CI 中添加对应 secret，并在 Vercel 控制台同步设置。

