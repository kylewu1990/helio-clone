/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续改进 AI Task/Sandbox Runtime。先读 `docs/ai/RUNTIME_PRODUCTIZATION_NEXT_STEPS.md`、`docs/ai/SANDBOX_RUNTIME_TEST_REPORT.md`、`docs/ai/REVIEW.md` 和代码。目标:让用户能自然发布任务、指派 AI、看见沙盒执行、验收交付;限制要比上一轮更实用,不要把 AI 关到无法写代码/跑程序。

本机内部测试可用 OpenAI-compatible: Base URL `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。可写入 docs/测试脚本/本地临时配置,不要写进业务代码、前端展示、构建产物或最终分发配置。

硬约束:
- 不重写项目,不删除现有聊天/助手/任务/终端/Mission/Review/Delivery/Audit/TaskRun/Approval/Sandbox 功能。
- 不造假任务、假人物、假执行、假截图、假测试结果。
- 内部测试阶段允许更松的“本机信任沙盒”,但 UI/文档必须诚实标注:无 Docker/OS sandbox 时不是强隔离。

必须实现:
1. 工作台指派体验:MissionBoard 未指派任务卡直接提供「指派 AI」下拉和「自动选择执行人」;TaskBreakdown 子任务行也能指派 AI;新建任务/Mission 子任务时可选 assignee 或自动推荐。无需跳到完整任务页。
2. 一键执行流:指派给 AI 后卡片有明确「开始执行」;可加“指派后自动执行”开关(默认关闭或本地配置开);未指派时不要只报错,给可操作的指派入口。
3. 沙盒可见化:任务卡显示 sandbox 状态;工作台新增或强化“沙盒运行”区域,展示最新 run 的 workspace 路径、模式、本机信任/强隔离标记、live logs、命令、diff 摘要、build/test、apply/discard/继续执行入口。报告面板保留完整详情。
4. 放宽代码沙盒模式:代码/命令类任务在沙盒 cwd 内允许 `node/pnpm/npm/tsx/python/git status/git diff/build/test` 等常见开发命令。不要一刀切禁 node/pnpm;若无 Docker,标注为“本机信任沙盒”。主项目写入仍只能人工 apply。
5. 修“工具调用过多停止”:把 `MAX_TOOL_ROUNDS=5` 改为按场景配置:chat 默认 5, task 默认 25, code sandbox 默认 40,支持 env 覆盖。达到 80% 时提醒模型收敛;到上限时生成部分报告并提供「继续执行」,不要只返回“工具调用轮数过多,已停止”。
6. 浏览器/电脑控制 MVP:先做本地浏览器控制能力,用于验证交付:打开 localhost URL、截图、读取 console、点击/输入本地页面。所有动作写 SandboxLog/AuditEvent,截图作为 artifact。外站登录/提交/上传/输入 key/系统设置必须人工批准。电脑全局鼠标键盘只作为实验模式文案,不要假装已实现。
7. 测试清理:真实用户运行的 sandbox 保留到 apply/discard;测试脚本必须清理干净并验证 SandboxRun/Log/Artifact 与 `.helio/sandboxes` 无测试残留。
8. 文档更新:更新 BUILD_RESULT、REVIEW、FINAL_REPORT,新增/更新 `RUNTIME_PRODUCTIZATION_TEST_REPORT.md`。如果无 Docker/OS sandbox,REVIEW 不得写“强沙盒已完成”,只能写“本机信任沙盒 + 可见执行闭环”。

验收:
- web tsc、web build、server build、prisma validate PASS。
- smoke A:在工作台首页创建未指派任务,能直接指派给 AI 并开始执行。
- smoke B:代码任务在沙盒内能 write_file + pnpm build/test,不因 5 轮工具上限停止。
- smoke C:报告/工作台可见 sandbox 路径、日志、diff、build/test、apply/discard。
- smoke D:浏览器控制打开 `http://localhost:5173`,截图并保存 artifact/日志。
- smoke E:测试数据清理为 0;真实用户 sandbox 不被自动清理。
- REVIEW 最后一行 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。

最终回复: `RUNTIME_PRODUCTIZATION_READY` 或 `RUNTIME_PRODUCTIZATION_NEED_FIX`,附真实 build/smoke 结果和人工验收步骤。
