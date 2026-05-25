# PROJECT_AUDIT_FOR_GOAL

> 生成目的: 给 Claude Code `/goal` 使用前的只读项目审计。  
> 项目路径: `/Users/kaiwu/Documents/kyle-agent/helio-clone`  
> 审计日期: 2026-05-25  
> 外部参考: Markus README, 只借鉴产品逻辑, 不复制 UI 或文案: https://github.com/markus-global/markus/blob/main/README.md

## 1. 当前技术栈判断

这是一个已有全栈半成品, 不是空项目, 也不是纯前端 demo。

- 根目录是 `pnpm` workspace 风格项目, 根 `package.json` 负责 `pnpm dev` 同时启动前后端。
- 前端在 `web/`, 使用 React 19 + Vite + Tailwind v4 + lucide-react + xterm + react-markdown。
- 后端在 `server/`, 使用 Fastify + Prisma + SQLite + WebSocket + node-pty。
- 数据库是 `server/prisma/dev.db`, schema 在 `server/prisma/schema.prisma`。
- AI 助手调用逻辑在 `server/src/ai.ts`, 工具调用逻辑在 `server/src/skills.ts`, 主路由和 WebSocket 在 `server/src/index.ts`。
- 当前项目路径下不是 git 仓库, `git status` 和 `git diff` 会返回 `fatal: not a git repository`。如果后续需要 diff, 需要先确认真实仓库根目录。

## 2. 当前项目已有功能

项目已经具备完整的 Helio-style 内部 AI 工作区基础:

- 频道和私信。
- 实时 WebSocket 消息。
- 未读、在线状态、typing、收件箱。
- 消息发送、编辑、删除、批量删除、emoji reaction、pin。
- Thread 话题串。
- 搜索和消息定位。
- 图片/文件上传。
- 任务看板, 支持创建、移动、删除、指派。
- 终端视图, 前端 `TerminalView` + 后端 `/ws/terminal` + `node-pty`。
- 助手作为特殊 User, 复用成员、频道、私信、消息、在线、任务机制。
- 创建/编辑/删除助手, 支持 preset、skills、provider/baseURL/key/model、autoRespond、memory。
- 多供应商 OpenAI-compatible LLM 调用。
- 频道主动响应、严格 `@handle` 路由、多助手链式协作和停止生成。
- L2 长期记忆注入。
- 工具调用可见, 包括当前时间、搜索消息、列频道、计算器、建任务、读网页、生成图片、记忆、日程、本地只读文件、受限命令执行。
- 日历事件与提醒 Cron。
- 当前已经有工作台首页: `WorkspaceView`, `AgentRoster`, `MissionBoard`, `ActivityFeed`, `DeliveryPanel`, `ContextVault`, `CommandHeader`。

## 3. 当前 UI 半成品状态

UI 已经从单纯聊天产品推进到第一版 AI Workforce Command Center:

- `web/src/App.tsx` 默认 `view` 是 `workspace`。
- `web/src/components/Rail.tsx` 已有工作台、消息、收件箱、任务、终端入口。
- `web/src/components/workspace/` 已有工作台组件:
  - `WorkspaceView.tsx`
  - `CommandHeader.tsx`
  - `AgentRoster.tsx`
  - `MissionBoard.tsx`
  - `ActivityFeed.tsx`
  - `DeliveryPanel.tsx`
  - `ContextVault.tsx`
- `web/src/lib/workspace.ts` 已有前端适配层, 将真实 assistants/tasks/statuses 派生为 workspace 数据。
- `web/src/lib/mockData.ts` 集中存放 mock agent/mission/activity/delivery/context 数据。
- `web/src/theme.css` 和 `web/src/index.css` 已追加 AI Workspace token、glass、constellation 背景和轻动效。

当前主要半成品问题:

- 工作台已有壳, 但 Delivery、Activity、Review、Context Vault 仍大量依赖 mock/静态数据。
- Mission Board 的 Review 列还没有后端真实状态机支撑。
- `TasksView` 仍是传统三列 todo/doing/done, 与工作台四列 mission flow 不完全统一。
- `Rail` 品牌仍显示 `H` 和 `Helio · 内部版`, 与最终 AI Team Command Center 定位不完全一致。
- Context Vault 只展示路径, 未真实读取文档内容。
- Delivery Panel 的 Approve / Request Fix 只是前端状态, 不落库。
- Activity / Audit Trail 还不是完整真实审计流。

## 4. 当前 AI / server / tool / stream 逻辑

核心逻辑在 `server/src/index.ts`:

- `currentUser()` 使用 `x-user-id`, 项目无登录。
- `shapeMessage()` 统一输出前端消息形状。
- `parseMentions()` 严格解析 `@handle` / `@name` / `@all`。
- `maybeTriggerAssistants()` 是助手触发主流程:
  - DM 中助手必回。
  - 群聊中被 `@` 的助手必回。
  - 没有任何 `@` 的真人顶层消息, 走 `pickResponders` 主动路由。
  - 单条主动响应最多 2 个助手。
  - 同助手同频道 8 秒冷却。
  - 多助手链式协作最多深度 3。
  - `stopChannelGen()` 通过 AbortController 硬停止生成。
- `/ws` 推送 presence、message、message-updated、message-chunk、thread-reply、typing、assistant-status、tasks 等事件。
- `/ws/terminal` 为每个连接创建一个独立 pty, cwd 是项目根。

AI 调用在 `server/src/ai.ts`:

- 支持 `server/providers.json` 或 `.env` 默认供应商。
- 支持助手自带 `baseUrl/apiKey/model`。
- 使用 OpenAI-compatible `/chat/completions`。
- 统一流式 SSE, 支持工具调用流式累积。
- 工具循环最多 `MAX_TOOL_ROUNDS = 5`。
- `generate_image` 的图片结果会兜底拼进最终回复。
- 普通助手默认注入简短 IM 风格回复规范。

工具逻辑在 `server/src/skills.ts`:

- `toolsFor()` 根据助手 skills 输出 function schemas。
- `runTool()` 调用 handler。
- 现有工具覆盖消息搜索、任务、网页、图片、记忆、日程、文件只读、受限命令。
- `run_command` 有项目根限制、危险词预检、超时与输出截断, 权限隔离给 engineer / tech-lead 类角色。

## 5. 当前已有 docs/ai 内容

当前 `docs/ai` 已存在:

- `docs/ai/TASK.md`: AI Workforce Workspace 改造任务说明。
- `docs/ai/PLAN.md`: Phase 1 + Phase 2 执行计划。
- `docs/ai/DESIGN_BRIEF.md`: AI Workforce Command Center 设计方案。
- `docs/ai/DELIVERY.md`: 已有改造交付记录, 包括本轮完成内容、build 结果和风险。

当前缺口:

- 尚无 `docs/ai/PROJECT_AUDIT.md`。
- 尚无 `docs/ai/REVIEW.md`。
- 尚无 `docs/ai/FINAL_REPORT.md`。
- 尚无 `docs/ai/BUILD_RESULT.md`。
- 本次新增 `PROJECT_AUDIT_FOR_GOAL.md`, `CLAUDE_GOAL_PROMPT.md`, `HOW_TO_RUN_CLAUDE_GOAL.md`, 作为启动 `/goal` 的准备资料。

## 6. 哪些内容必须保留

以下是已有核心资产, `/goal` 执行时必须保留:

- 根目录 `pnpm dev` 的运行方式。
- 前端 React/Vite/Tailwind 结构。
- 后端 Fastify/Prisma/SQLite/WebSocket 结构。
- `server/prisma/dev.db` 中现有数据。
- 无登录身份切换和 `x-user-id` 请求头机制。
- 频道、私信、消息、Thread、reaction、pin、search、inbox。
- 助手作为特殊 User 的设计。
- 助手 preset、skills、provider/baseURL/key/model 配置。
- AI key 不回传前端, 只暴露 `hasApiKey`。
- 主动响应、严格 `@handle` 路由、多助手协作、停止生成。
- L2 memory 注入逻辑。
- 工具调用体系和现有安全边界。
- Terminal 视图与 `/ws/terminal`。
- 当前已做出的 AI Workspace 首页与 `workspace/` 组件。
- 已有 `docs/ai/TASK.md`, `PLAN.md`, `DESIGN_BRIEF.md`, `DELIVERY.md` 的有用内容。

## 7. 哪些地方可以优化

适合下一轮 `/goal` 自动执行的优化方向:

- 把现有工作台再向 AI Team Command Center 收束, 让首页更清晰表达 AI Team / Mission / Activity / Delivery / Context。
- 将 mock 数据进一步集中标注, 避免用户误以为是真实 runtime。
- 改进 Mission Board 与真实 `Task` 的映射, 让真实任务优先显示。
- 给 Delivery / Review / Activity 建立更清晰的前端状态与文档闭环, 暂不强行改数据库。
- 优化 Context Vault, 至少能清楚展示项目记忆、上下文、决策、交付文档的关系。
- 改进品牌文案, 从 “Helio 同款” 逐步转为独立的 AI Workspace / AI Team Command Center, 但不要删除历史上下文。
- 完善 `docs/ai/PROJECT_AUDIT.md`, `PLAN.md`, `DESIGN_BRIEF.md`, `DELIVERY.md`, `REVIEW.md`, `FINAL_REPORT.md`, `BUILD_RESULT.md`。
- 修复 build 中真实出现的问题, 但每一轮修复必须小步、可解释、不得推翻重写。

## 8. 哪些地方不能乱动

严禁事项:

- 不要全量重写项目。
- 不要删除现有聊天、任务、终端、助手、AI 工具能力。
- 不要复制 Markus UI、文案或品牌表达。
- 不要把项目改成 Markus clone。
- 不要删除或重置 `server/prisma/dev.db`。
- 不要运行 `pnpm db:reset`。
- 不要直接对 SQLite 数据做无确认 DELETE/UPDATE。
- 不要把 `apiKey`、provider secret、用户隐私写进文档或前端。
- 不要破坏 `x-user-id` 内部身份机制。
- 不要改动 WebSocket event payload 而不同步前端类型和处理逻辑。
- 不要让 mock 数据散落在多个 JSX 文件里。
- 不要为视觉效果引入大型依赖或 3D 库。
- 不要只做文档不做实现。
- 不要只做 UI 而破坏已有核心功能。

## 9. 适合 Claude /goal 的最小可行目标

推荐 `/goal` 的最小可行目标:

在现有代码基础上完成一次 “AI Team Command Center consolidation”:

1. 先读取项目和当前文档, 生成真实 `docs/ai/PROJECT_AUDIT.md`。
2. 制定 `docs/ai/PLAN.md`, 明确只做小步增强, 不重写。
3. 更新 `docs/ai/DESIGN_BRIEF.md`, 明确独立审美, 不复制 Markus。
4. 在现有 `WorkspaceView` 与 `workspace/` 组件基础上优化主界面, 让首页稳定体现:
   - AI Team
   - Mission Board
   - Task Breakdown
   - Parallel Execution
   - Quality Review
   - Delivery Panel
   - Context Vault
   - Activity / Audit Trail
   - Human Approval
   - 项目记忆 / 上下文管理
5. 保留现有聊天、任务、助手、终端和 AI 工具能力。
6. 生成 `docs/ai/DELIVERY.md`, `REVIEW.md`, `BUILD_RESULT.md`, `FINAL_REPORT.md`。
7. 运行 build, 失败则最多自动修复 3 轮。
8. 最后输出明确完成状态。

## 10. 风险点

- 项目路径下不是 git 仓库, 自动任务无法可靠输出 git diff, 除非先确认仓库根目录。
- 现有 `docs/ai/DELIVERY.md` 记录过 `server build` 失败, 原因是缺少 `@types/node`; `/goal` 如果要求全栈 build, 可能需要修复依赖。
- `server/prisma/dev.db` 是真实本地数据, 任何 reset 都会丢数据。
- 当前工作台已有 Phase 1 + Phase 2 结果, `/goal` 如果误判为空项目, 很容易重复造组件或覆盖已有成果。
- AI 真实执行、Review、Delivery、Audit Trail 目前仍未完整后端化, 需要清楚区分 “界面表达/前端状态” 与 “真实 runtime”。
- 终端、工具调用和文件读取有安全边界, 不应为了产品表达随意放宽。
- 外部 Markus 只能作为产品逻辑参考, 不能复制 UI、文案、架构命名或品牌。
