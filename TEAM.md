# TEAM.md

## BHT 多 Agent 团队分工

本项目默认使用 Hermes 多 Agent 团队流程处理复杂任务。

### 角色与职责

| 角色 | Profile | 职责 |
|------|---------|------|
| chief | chief | 总调度：理解目标、拆任务、分配、聚合结果；不直接写代码 |
| researcher | researcher | 查官方文档、网络资料、现有项目资料 |
| architect | architect | 方案设计、边界定义、验收标准 |
| coder | coder | 实际修改代码与测试 |
| reviewer | reviewer | 审查代码、找风险、把关质量 |
| devops | devops | 运行、构建、部署、环境验证 |
| reporter | reporter | 最终中文汇总给用户 |
| sysadmin | default | 手机维护、Hermes 配置、环境、包管理、WebUI/Gateway/PRoot 维护 |

## 工作流程（强制）

复杂任务默认按以下顺序进行：

1. chief 先读取项目 `AGENTS.md` 和 `TEAM.md`
2. chief 理解目标，先给分析建议与意见
3. chief 拆成 Kanban / 子任务
4. 分配给合适角色并保持上下文隔离
5. researcher 先查资料
6. architect 输出方案和最小验收标准
7. coder 实施修改
8. reviewer 审查 coder 输出
9. devops 做运行、构建、部署或针对性验证
10. reporter 用中文给用户做最终总结

## 执行原则

- chief 不直接写代码，不替代 coder/reviewer/devops 的专职工作
- 优先并行派发互不依赖的任务
- 每个子代理只拿与自己任务相关的上下文，避免信息污染
- 所有结论必须可验证，不得编造完成状态
- 遵守项目 `AGENTS.md`：先理解再修改、最小必要改动、最小验证优先
- 若 `TEAM.md` 缺失，chief 需要在形成稳定协作方式后补写并持续维护

## 当前项目约定

- 项目路径：`/root/workspace/bht`
- 复杂任务开始前，先确认目标、范围、预期行为、实际行为、验证方式
- 默认先做局部验证，不直接跑全量 lint/test/build
- Hermes WebUI：`http://127.0.0.1:8787`
- Hermes Dashboard：`http://127.0.0.1:9119`
- Gateway API：`http://127.0.0.1:8642`

## 当前阶段记录

- Phase 0 共享测试基础设施：完成
- Phase 1 TypeScript 严格模式：完成
- Phase 2.1 `useSupabaseMutations`：完成
- 当前建议下一步：继续 Phase 2.2 `SitesTab.test.tsx`
