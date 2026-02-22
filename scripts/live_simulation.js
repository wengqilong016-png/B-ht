import fs from 'fs';

const mockInputs = [
  { tone: "Furious", msg: "YOUR MACHINE IS A THIEF! STOLE 5000 TZS AT LOC_101! REFUND NOW!" },
  { tone: "Technical", msg: "HTTP 504 Gateway Timeout on callback at Dar Central. TxID: SK-999. Amount: 1200 TZS." },
  { tone: "Confused", msg: "Hello? I paid with M-Pesa but the credits didn't show up. Is it because the network is slow? My id is D-001." }
];

console.log("\n--- 🤖 B-ht SmartKiosk 多代理模拟开始 ---\n");

mockInputs.forEach((input, index) => {
  console.log(`[用户输入 - ${input.tone}]: "${input.msg}"`);
  
  // 模拟 AI 代理 (Agent B) 的思维链 (CoT)
  let analysis = {};
  if (input.tone === "Furious") {
    analysis = { urgency: "HIGH", intent: "REFUND", category: "PAYMENT_LOSS", risk_level: "RED" };
  } else if (input.tone === "Technical") {
    analysis = { urgency: "MEDIUM", intent: "BUG_REPORT", category: "INFRASTRUCTURE", risk_level: "YELLOW" };
  } else {
    analysis = { urgency: "LOW", intent: "SUPPORT", category: "USER_GUIDANCE", risk_level: "GREEN" };
  }

  // 模拟系统动作 (Agent C)
  console.log(`[AI 审计分析]: 优先级: ${analysis.urgency} | 类别: ${analysis.category} | 风险: ${analysis.risk_level}`);
  
  const action = analysis.urgency === "HIGH" 
    ? "⚠️ 已自动通知区域经理并标记为待退款" 
    : analysis.intent === "BUG_REPORT" 
    ? "⚙️ 已关联 GitHub Issue #LOG-2026 并在后台重试回调"
    : "📚 已通过 WhatsApp 发送《支付故障排查指南》给用户";
    
  console.log(`[系统执行动作]: ${action}`);
  console.log("-------------------------------------------\n");
});

console.log("✅ 模拟结束：所有交互已作为‘精炼数据’存入微调库。");
