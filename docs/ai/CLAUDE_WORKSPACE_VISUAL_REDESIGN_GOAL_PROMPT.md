/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 进入产品体验大改阶段。安全强隔离暂时后置,优先把「发布任务→AI 指派→真实执行→工具调用→沙盒/浏览器验证→质量审查→交付验收」做成用户一眼看懂的 AI Workspace。先读 `docs/ai/WORKSPACE_VISUAL_REDESIGN_BRIEF.md`、`RUNTIME_PRODUCTIZATION_TEST_REPORT.md`、`REVIEW.md` 和当前代码。

本机测试可用 OpenAI-compatible: `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。内部测试可写 docs/脚本/本地配置,不要写进业务代码、前端展示、构建产物或分发配置。

放宽授权:
- 可以大幅重构前端布局、组件、样式、状态组织和必要后端 API。
- 可以新增轻量依赖,但必须说明原因并保持 build 可跑。
- 可以调整 task/runtime/report 数据结构以服务实时 UI。
- 不要被上一轮安全限制绑死;本轮目标是流程跑通和体验可用。

硬约束:
- 不从零重写,不删除现有聊天、助手、任务、Mission、Review、Delivery、Audit、TaskRun、SandboxRun、Approval、Context docs。
- 不复制 Genspark/Markus UI、文案、品牌;只借鉴产品逻辑。
- 不造假人物、假任务、假日志、假截图、假测试结果。
- 无 Docker/OS sandbox 时继续诚实写「本机信任沙盒(非强隔离)」。

参考逻辑:
- Genspark: all-in-one workspace、Workflows、Teams、Drive、自然语言建 workflow、Test Run、Turn On、run history、右侧结果详情、等待用户输入时可在 run record 处理。
- Markus: AI team、role/skill、task breakdown、delegation、parallel execution、quality gate、delivery、audit trail、memory、heartbeat/runtime。安装器只借鉴零门槛启动/向导/health/open-browser 逻辑。

必须实现:
1. 主界面重构为 AI Team Command Center:目标输入、Mission/Tasks、Live Runs、Delivery、Context、Activity 信息层级清晰,深色优先,Apple/Linear/Notion/Genspark 式干净但有独立审美。
2. 发布任务后不要只在聊天气泡回复。必须自动打开或明显提示一个 Execution Window / Run Drawer,展示执行人、状态机、当前步骤、下一步、是否等待用户。
3. 工具调用可视化:run_command/write_file/browser_* 都显示时间线、输入摘要、输出摘要、耗时、状态、日志、截图/artifact/diff 链接。
4. 任务卡显示真实状态:未指派/已指派/排队/执行中/等待审批/待验收/失败/已交付;可直接指派 AI、自动推荐、开始/继续/取消、打开报告。
5. Delivery/Review 可从界面找到:成功任务能生成交付包,交付包含 summary、artifacts、diff、build/test、risk、review notes、approve/discard。
6. Activity Feed 必须读真实 AuditEvent,可看见任务生命周期和工具轨迹。
7. Context Vault 支持在创建 Mission/Task 时选择上下文文档,并在 Run Window 显示本次使用的上下文。
8. 改善 `/api/tasks/:id/execute` 长阻塞体验:优先改成异步立即返回 runId + WS/轮询更新;如果暂不改,必须在 UI 和报告里规避超时体验。
9. 写真实 smoke:创建任务→指派 AI→打开执行窗口→真实执行工具→查看日志/截图/diff→生成交付→审批或丢弃→清理测试数据。

评分与循环:
- 每轮按 100 分自评:设计品质30、原创性30、技术执行20、可用性20。
- 低于 85 必须继续修;低于 75 允许重排主界面结构。最多自动迭代 3 轮,每轮记录问题和改动。

验收:
- `pnpm -C server exec prisma validate`、`pnpm -C server build`、`pnpm -C web exec tsc --noEmit`、`pnpm -C web build` 均 PASS。
- smoke 使用真实 API + 本地 LLM + 浏览器验证,不得编造。
- 测试残留为 0:测试任务/助手/SandboxRun/Log/Artifact/.helio/sandboxes/bshot 截图清理干净。
- 生成/更新 `docs/ai/WORKSPACE_REDESIGN_PLAN.md`、`WORKSPACE_REDESIGN_DELIVERY.md`、`WORKSPACE_REDESIGN_REVIEW.md`、`WORKSPACE_REDESIGN_BUILD_RESULT.md`、`WORKSPACE_REDESIGN_FINAL_REPORT.md`。
- `WORKSPACE_REDESIGN_REVIEW.md` 最后一行必须是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。

最终回复格式:
`WORKSPACE_VISUAL_REDESIGN_READY` 或 `WORKSPACE_VISUAL_REDESIGN_NEED_FIX`,附真实 build/smoke 结果、评分、人工验收步骤。
