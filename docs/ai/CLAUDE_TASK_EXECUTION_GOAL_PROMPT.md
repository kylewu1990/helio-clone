/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续改进。先读 `docs/ai/TASK_EXECUTION_CAPABILITY_TEST_REPORT.md`、`docs/ai/FULL_DELIVERY_REPORT.md`、`docs/ai/PROJECT_AUDIT.md`、`docs/ai/PLAN.md`,再读代码。目标:把当前“任务只记录、不执行”的 AI Workspace 升级为真实可观察、可控制、可审计的 AI Task Execution Runtime。

硬约束:
- 不重写项目,不删除现有聊天/助手/任务/终端/Mission/Review/Delivery/Audit 功能。
- 不造假 Agent/假任务/假执行日志/假测试结果。
- 不复制 Markus UI/文案/品牌。
- 禁止 `pnpm db:reset`,禁止清空 `server/prisma/dev.db`。
- 内部测试阶段可以直接使用本地 OpenAI-compatible 配置,不要因为 key 限制跳过真实 AI 测试: Base URL `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。允许写入本地 `.env`、`server/providers.json`、助手配置、测试脚本和 `docs/ai` 测试记录;如果为了快速验证临时写进业务代码/前端,必须同轮改回配置化。最终分发前必须提供一键清理/grep 验证步骤,确保该 key 不留在构建产物或分发配置里。
- 每次改动小步提交式推进,先理解现有代码再改。

必须解决:
1. 发布 Mission/Task 后不能只停留在静态 todo。新增真实执行流: queued/running/succeeded/failed/cancelled 或兼容映射。
2. Task 指派给 AI 助手后,用户可手动点击“开始执行”,或系统按明确规则自动执行;执行过程必须可见。
3. 执行时复用现有 assistant reply/tool-calling 能力,把 assistant message、toolsUsed、run_command 输出、错误信息关联到 taskId/missionId。
4. Activity Feed 必须读取真实 execution/audit events,显示谁接单、何时开始、调用了什么工具、结果是什么。
5. 终端能力分层清楚: Human terminal 是人类手动终端; Assistant `run_command` 是聊天工具;未来 computer/browser control 没实现时必须诚实标注不可用。
6. 对 run_command/写文件/未来电脑控制等高危能力增加权限矩阵与 Human Approval。危险动作不能静默执行。
7. UI 上用户发布任务后必须看得懂流程:等待执行、执行中、需要批准、失败、已交付。
8. 修复收尾问题: `web/index.html` title 仍是 Helio;`@types/node` 依赖不能只 vendored 在 node_modules;文档里的最终 DB 状态必须和真实状态一致。

验收:
- `pnpm -C web exec tsc --noEmit` PASS。
- `pnpm -C web build` PASS。
- `pnpm -C server build` PASS。
- 发布一条临时 Mission/Task,指派给有 `run_command` 的真实助手,触发执行,能看到状态变化、AI 消息、tool call、AuditEvent,最后清理临时数据。
- 测试 Human terminal 与 Assistant run_command 的边界,报告真实结果。
- 不编造测试结果;失败就记录失败并修复,最多 3 轮。

交付文档:
- 更新 `docs/ai/TASK_EXECUTION_CAPABILITY_TEST_REPORT.md`
- 更新 `docs/ai/BUILD_RESULT.md`
- 更新 `docs/ai/REVIEW.md`,最后一行必须是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`
- 更新 `docs/ai/FINAL_REPORT.md`,包含人工验收步骤

最终回复格式:
1. 完成了什么
2. 真实测试结果
3. 未完成/风险
4. 人工怎么验收
