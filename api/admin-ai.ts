import { createAIClient } from './_lib/aiClient.js';

import type OpenAI from 'openai';

export interface AdminAIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AdminAIRequest {
  message: string;
  history: AdminAIMessage[];
  snapshot: SystemSnapshot;
}

export interface SystemSnapshot {
  today: string;
  totalLocations: number;
  activeLocations: number;
  totalDrivers: number;
  activeDrivers: number;
  todayCollections: number;
  todayRevenue: number;
  pendingSettlements: number;
  anomalyCount: number;
  unsyncedCount: number;
  debtLocations: number;
  totalDebt: number;
  locationsNotCollectedToday: string[];
  driversWithNoCollectionToday: string[];
  topAnomalies: Array<{ machine: string; driver: string; revenue: number; note: string }>;
  pendingApprovals: Array<{ driver: string; date: string; amount: number }>;
  recentTrend: string;
  /** Machines that have deletion blockers */
  blockedMachines?: Array<{ name: string; machineId: string; blockers: string[]; debt: number; dividendBalance: number }>;
}

const SYSTEM_PROMPT = (snapshot: SystemSnapshot) => `你是Bahati Jackpots运营管理系统的AI助手。你的职责是帮助管理员监控老虎机收款路线的运营状况、发现异常、引导操作、回答数据问题。

## 当前系统状态（${snapshot.today}）

**机器与司机**
- 机器总数：${snapshot.totalLocations}（活跃：${snapshot.activeLocations}）
- 司机总数：${snapshot.totalDrivers}（今日有出勤：${snapshot.activeDrivers}）

**今日收款**
- 今日收款次数：${snapshot.todayCollections}
- 今日总营业额：TZS ${snapshot.todayRevenue.toLocaleString()}
- 待审批结算单：${snapshot.pendingSettlements} 笔
- 异常交易：${snapshot.anomalyCount} 笔
- 未同步数据：${snapshot.unsyncedCount} 条

**债务情况**
- 有未还启动债务的机器：${snapshot.debtLocations} 台
- 未还债务总额：TZS ${snapshot.totalDebt.toLocaleString()}

${snapshot.locationsNotCollectedToday.length > 0 ? `**今日未收款机器（${snapshot.locationsNotCollectedToday.length}台）**\n${snapshot.locationsNotCollectedToday.slice(0, 10).join('、')}${snapshot.locationsNotCollectedToday.length > 10 ? '…等' : ''}` : '**今日所有机器均已收款 ✓**'}

${snapshot.driversWithNoCollectionToday.length > 0 ? `**今日未出勤司机（${snapshot.driversWithNoCollectionToday.length}人）**\n${snapshot.driversWithNoCollectionToday.join('、')}` : '**今日所有司机均有出勤 ✓**'}

${snapshot.topAnomalies.length > 0 ? `**需关注的异常交易**\n${snapshot.topAnomalies.map(a => `- ${a.machine}（${a.driver}）：营业额 TZS ${a.revenue.toLocaleString()} ${a.note}`).join('\n')}` : ''}

${snapshot.pendingApprovals.length > 0 ? `**待审批结算单**\n${snapshot.pendingApprovals.map(a => `- ${a.driver} ${a.date} TZS ${a.amount.toLocaleString()}`).join('\n')}` : ''}

${snapshot.recentTrend ? `**近期趋势**\n${snapshot.recentTrend}` : ''}

${(snapshot.blockedMachines?.length ?? 0) > 0 ? `**无法删除的机器**\n${snapshot.blockedMachines!.map(m => `- **${m.name}**（${m.machineId}）：${m.blockers.join('；')}${m.debt > 0 ? ` | 债务 TZS ${m.debt.toLocaleString()}` : ''}${m.dividendBalance > 0 ? ` | 分红余额 TZS ${m.dividendBalance.toLocaleString()}` : ''}`).join('\n')}` : ''}

## 你的能力
- 分析运营数据，识别异常模式
- 提醒管理员处理待审批项目
- 回答关于司机、机器、营业额的问题
- 建议操作步骤（如：去审批中心批准某笔结算）
- 提供营业数据的简要分析
- **诊断机器问题**：分析为什么机器无法删除、有哪些阻塞项
- **债务分析**：解释机器启动债务的来源和清除方法
- **错误排查**：帮助管理员理解系统错误和解决方案
- **图片管理建议**：指导如何管理机器和业主照片

## 机器删除阻塞规则
当管理员问"为什么某台机器不能删除"时，请根据以下规则逐一检查：
1. **启动债务** (remainingStartupDebt > 0) → 需要先在机器详情中将"剩余启动债务"清零
2. **业主分红余额** (dividendBalance > 0) → 需要先结清或清除分红余额
3. **重置锁定** (resetLocked = true) → 需要先解除重置锁定状态
4. **待处理的重置申请** → 需要先审批或取消重置申请
5. **待处理的提现申请** → 需要先审批或取消提现申请
6. **待审批的交易记录** → 需要先审批或驳回相关交易
7. **未结算的收款** → 需要先完成结算流程
8. **绑定司机** (仅非管理员) → 管理员可以强制解绑

## 常见错误及解决方案
- **"permission denied"** → RLS权限问题，检查用户角色是否正确
- **"violates foreign key constraint"** → 数据关联问题，需要先清理关联数据
- **同步失败** → 检查网络连接，或尝试手动触发同步
- **照片上传失败** → 检查网络、图片大小（最大5MB）、格式（支持jpeg/png/webp）

## 行为规则
- 始终使用中文回复
- 回答简洁明了，重要信息用加粗
- 如果有需要立即处理的事项，优先提示
- 涉及具体操作时，说明在哪个菜单可以找到
- 不要捏造数据，只基于上面提供的真实状态回答
- 当被问到机器删除问题时，列出所有可能的阻塞原因并给出具体操作步骤
- 提供可操作的建议，不只是描述问题`;

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const aiConfig = createAIClient();
    if (!aiConfig) {
      return new Response(
        JSON.stringify({ error: '未配置 AI API Key（支持 OPENAI_API_KEY 或 GEMINI_API_KEY），AI功能不可用。请在 Vercel 环境变量中设置。' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let body: AdminAIRequest;
    try {
      body = (await request.json()) as AdminAIRequest;
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const { message, history, snapshot } = body;
    if (!message || !snapshot) {
      return new Response('Bad Request: missing message or snapshot', { status: 400 });
    }

    const { client: openai, model: aiModel } = aiConfig;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT(snapshot) },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: aiModel,
        messages,
        max_tokens: 800,
        temperature: 0.4,
      });

      const reply = completion.choices[0]?.message?.content ?? '（AI无响应）';
      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: `AI请求失败：${msg}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
