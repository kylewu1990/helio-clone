/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续改进, 目标是做到“完整版可交付”的 AI Workspace / AI Team Command Center / AI Workforce Platform。不要重写项目, 不要删除现有核心功能, 不复制 Markus UI/文案/品牌。先读取 `docs/ai/FULL_DELIVERY_OPEN_ISSUES.md`, `docs/ai/USER_TEST_REPORT.md`, `docs/ai/MARKUS_INSPIRED_IMPROVEMENT_PLAN.md`, `docs/ai/REALITY_CHECK.md`, 再读代码。

硬约束:
- 真实可运行, 不新增假人物/假 Agent/假任务/假交付/假测试结果。
- 保留频道/私信/实时消息/Thread/Inbox/Tasks/Terminal/助手创建编辑删除/provider配置/AI skills/stop generation/主题/身份切换。
- 禁止 `pnpm db:reset`, 禁止删除/重置 `server/prisma/dev.db`。
- 如改 Prisma schema, 必须用不丢数据方式迁移, 可用 `pnpm -C server db:push`, 不可清库。
- 本地 AI 测试使用已有本地助手/代理配置; 不把 key 写入业务代码、前端或报告。

必须解决的 P0:
1. 去掉 UI 中 `Helio 内部版` 等产品身份残留, 建立独立产品名。
2. 修复 `pnpm -C server build` 缺 `@types/node` 问题。
3. 清理 stale mock 类型/注释: `isReal`, `source:'mock'`, “示例混合/假数据驱动”等。
4. 新增真实 Mission/Goal 模型、API、前端入口。
5. 首页 CTA 从“新建任务”升级为“新建 Mission/输入目标”。
6. 新增真实 Review 模型/API/UI, 支持 pass / needs_fix / blocked / notes / checks。
7. 新增真实 Delivery 模型/API/UI, 支持 artifact、测试结果、风险、approval 状态。
8. Human Approval 必须落库, approve/reject 刷新后仍存在。
9. 新增 append-only AuditEvent, Activity Feed 读取真实事件。
10. Context Vault 支持读取和搜索真实项目文档, 可绑定到 Mission。

执行顺序:
1. 审计当前代码和 docs, 写/更新 `docs/ai/PROJECT_AUDIT.md`。
2. 写/更新 `docs/ai/PLAN.md`, 明确小步方案、schema/API/UI、风险和迁移方式。
3. 实现 P0。优先保持现有结构, 小步改 server/src、schema、web/src/lib、workspace 组件、TasksView/App/Rail。
4. 所有关键动作写 AuditEvent: mission created, task status changed, review submitted, delivery created, approval decided, terminal command, AI tool call 如可行。
5. 写/更新 `docs/ai/DELIVERY.md`, `docs/ai/REVIEW.md`, `docs/ai/BUILD_RESULT.md`, `docs/ai/FINAL_REPORT.md`。

验证要求:
- `pnpm -C web build` 必须通过。
- `pnpm -C server build` 必须通过。
- 跑 API smoke: users/assistants/tasks/missions/reviews/deliveries/audit/context-docs。
- 做一次真实 AI smoke: 用现有可用助手发临时测试消息, 收到回复后删除测试消息和回复, 不留下假数据。
- 如果启动浏览器可行, 验证首页 Mission 创建、Review、Delivery、Approval、Context Vault、Terminal。
- 结果必须写入 `docs/ai/BUILD_RESULT.md` 和 `docs/ai/FINAL_REPORT.md`, 不得编造。

最多自动修复 3 轮。每轮只修最小原因, 重新跑失败命令。3 轮后仍失败则停止, 在 REVIEW/FINAL_REPORT 写 NEED_FIX 和人工决策点。

完成条件:
- Mission/Review/Delivery/AuditEvent/Context docs 真实模型或 API 存在并被 UI 使用。
- 首页能创建真实 Mission。
- Mission 能显示真实任务拆解。
- Review/Delivery/Human Approval 持久化。
- Activity Feed 来自真实 AuditEvent。
- Context Vault 可读真实文档。
- 无新增假数据, 现有核心功能不回归。
- web/server build 都通过。
- `docs/ai/REVIEW.md` 最后一行是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。

最终回复:
`FULL_DELIVERY_GOAL_COMPLETE`
列出 Status, Build, 主要改动, 验收步骤, 剩余风险。
