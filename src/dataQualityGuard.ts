/**
 * Data-Centric AI Guard for B-ht Project
 * 基于《高质量训练数据研究报告》：在数据入库（Supabase）前清洗脏数据，提升 AI 审计精度。
 */

export interface TransactionData {
  previousScore: number;
  currentScore: number;
  gpsDeviation: number;
  revenue: number;
}

/**
 * 实现研究报告中的“脏数据过滤”逻辑：
 * 1. 物理逻辑一致性 (Score consistency)
 * 2. 金额计算模型校验 (Revenue validation)
 * 3. 空间地理围栏 (GPS Confidence)
 */
export const validateDataQuality = (data: TransactionData) => {
  const issues: string[] = [];

  // 1. 逻辑一致性检查 (防止训练集中出现无效负样本)
  if (data.currentScore < data.previousScore) {
    issues.push("SCORE_INVERSION: Current score cannot be less than previous.");
  }

  // 2. 物理常识检查 (防止模型学习到错误的营收逻辑)
  const calculatedRevenue = (data.currentScore - data.previousScore) * 200;
  if (Math.abs(calculatedRevenue - data.revenue) > 1) {
    issues.push("REVENUE_MISMATCH: Calculated revenue does not match reported revenue.");
  }

  // 3. 地理空间置信度 (报告中提到的“过滤低质量标注”)
  if (data.gpsDeviation > 1000) {
    issues.push("GPS_EXTREME_DEVIATION: Distance exceeds 1km from registered site.");
  }

  return {
    isValid: issues.length === 0,
    qualityScore: Math.max(0, 100 - issues.length * 30),
    issues,
    isHighDensityData: issues.length === 0 && data.revenue > 0 // 标记为高价值微调样本
  };
};

/**
 * 数据蒸馏逻辑：从原始日志中提炼高质量 Prompt 微调样本
 */
export const distillToFinetuneSample = (data: any, aiResult: any) => {
  if (data.revenue === 0) return null; // 排除低信息密度样本
  
  return {
    instruction: "Perform an automated audit on a vending machine transaction.",
    input: `PrevScore: ${data.previousScore}, CurScore: ${data.currentScore}, Revenue: ${data.revenue}`,
    output: JSON.stringify({
      audit_status: aiResult.isValid ? "VERIFIED" : "ANOMALY_DETECTED",
      confidence: data.gpsDeviation < 100 ? 0.98 : 0.75,
      reasoning: aiResult.comment
    })
  };
};
