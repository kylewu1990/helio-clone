/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续优化已有半成品。不要推翻重写, 不要删除现有功能。先读取项目和 `docs/ai/PROJECT_AUDIT_FOR_GOAL.md`。目标: 基于现有代码把项目收束为独立审美的 AI Workspace / AI Team Command Center / AI Workforce Platform。

参考 Markus README 只借鉴产品逻辑: AI Team、任务拆解、并行执行、审查、交付、上下文、审计轨迹、人工确认。禁止复制 Markus UI/文案/品牌, 不做 Markus clone。

必须保留: 频道/私信/实时消息/Thread/Inbox/Tasks/Terminal/助手创建编辑删除/provider baseURL key model 配置/AI skills tool calling/stop generation/主题切换/身份切换/现有 workspace 组件。

真实可运行限制: 不要添加无用人物、假 Agent、假 mission、假 delivery、假测试结果或看上去像假的 demo 数据。已有 mock 只能作为待替换遗留处理, 不要继续扩大; 优先使用真实后端、真实助手、真实任务、真实运行日志。若需要临时测试, 不要把测试人物/测试任务留在产品界面当成果。

本地 AI 测试可用 OpenAI-compatible 配置: model `gemini-2.5-flash`, Base URL `http://127.0.0.1:8317/v1`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。该 key 仅限本机测试请求/本地助手配置, 不要写入业务代码、前端展示或交付报告。

审美: 深色优先, Apple 干净, Linear 秩序, Notion 清晰, Genspark 科技感, 克制高级, 少量 glassmorphism, 轻微 orbit/AI constellation/神经网络隐喻, 中文友好, 不像普通后台模板。

执行顺序:
1. 只读审计: 读取 package、README、AI_START、PROJECT_CONTEXT、TASKS、DECISIONS、docs/ai、web/src/App.tsx、Rail、TasksView、workspace 组件、types/workspace/mockData/api/ws、theme/index CSS、server/src/index.ts、ai.ts、skills.ts、realtime.ts、presets.ts、schema.prisma。运行 `git status --short` 和 `git diff --stat`; 若非 git 仓库如实记录。
2. 生成/更新 `docs/ai/PROJECT_AUDIT.md`, 真实记录技术栈、已有功能、UI 状态、AI/server/tool/stream 逻辑、必须保留、可优化、不能乱动、风险。
3. 更新 `docs/ai/PLAN.md` 和 `docs/ai/DESIGN_BRIEF.md`, 计划必须是小步增强, 不得全量重写。
4. 小步实现: 在现有 `WorkspaceView` 与 `workspace/*` 基础上优化主界面, 清楚体现 AI Team、Mission Board、Task Breakdown、Parallel Execution、Quality Review、Delivery Panel、Context Vault、Activity/Audit Trail、Human Approval、项目记忆/上下文管理。优先改 web/src/components/workspace、lib/workspace.ts、types、App、Rail、theme/index CSS; `mockData` 只允许减少、替换或明确隔离, 不允许新增假数据。谨慎改后端。
5. 生成/更新 `docs/ai/DELIVERY.md`, `docs/ai/REVIEW.md`, `docs/ai/BUILD_RESULT.md`, `docs/ai/FINAL_REPORT.md`。
6. 运行 `pnpm -C web build`; 如你把后端纳入验收, 再运行 `pnpm -C server build`。真实结果写入 BUILD_RESULT, 不得编造。

Build 失败处理: 最多自动修复 3 轮。每轮只做最小必要修改, 重新运行失败命令, 更新 BUILD_RESULT 和 REVIEW。3 轮后仍失败就停止, 记录 NEED_FIX, 不要隐藏错误, 不要删除功能来通过 build。

禁止: 不要运行 `pnpm db:reset`; 不要删除/重置 `server/prisma/dev.db`; 不要把 key 写入业务代码/前端/报告; 不要破坏 WebSocket/API contract; 不要新增假人物或 fake test/demo data; 不要把 mock 数据散落到多个 JSX; 不要引入大型视觉依赖; 不要只做文档不做实现; 不要只做 UI 而丢现有功能。

完成条件:
- `docs/ai/PROJECT_AUDIT.md` 存在。
- `docs/ai/PLAN.md` 存在。
- `docs/ai/DESIGN_BRIEF.md` 存在。
- `docs/ai/DELIVERY.md` 存在。
- `docs/ai/REVIEW.md` 存在。
- `docs/ai/BUILD_RESULT.md` 存在。
- `docs/ai/FINAL_REPORT.md` 存在。
- 首页/主界面体现 AI Team Workspace。
- 包含 AI Team/Mission Board/Activity/Delivery/Context 结构。
- 体现 Task Breakdown/Parallel Execution/Quality Review/Human Approval/项目记忆。
- 没有新增无用人物、假 Agent、假任务、假交付或假测试结果。
- 保留现有核心功能。
- 未复制 Markus UI/文案。
- build 已运行且结果写入 BUILD_RESULT。
- REVIEW 最后一行是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。
- 若 NEED_FIX, 已尝试最多 3 轮修复并记录。
- FINAL_REPORT 包含人工验收步骤。

最终回复:
`GOAL_COMPLETE`
然后给 Status、Build、changed files、docs、manual acceptance、remaining risks。
