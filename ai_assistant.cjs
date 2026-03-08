const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

async function run() {
  const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const dashboardPath = path.join(__dirname, "components", "Dashboard.tsx");
  const dashboardCode = fs.readFileSync(dashboardPath, "utf8");

  const prompt = `你是一个高级全栈架构师。这是我正在开发的 Bahati Jackpots 管理系统的核心组件代码。
  该系统运行在非洲弱网环境下，通过 Supabase 管理。
  请根据这段代码分析出 3 个最可能导致性能瓶颈或用户体验问题的点，并给出具体的改进代码段。
  
  代码如下：
  ${dashboardCode.substring(0, 5000)} ... (代码已截断)`;

  console.log("🚀 正在启动 AI 深度审计...");
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log("\n--- 🧠 AI 架构师的审计报告 ---\n");
    console.log(response.text());
  } catch (error) {
    console.error("AI 审计出错:", error);
  }
}

run();
