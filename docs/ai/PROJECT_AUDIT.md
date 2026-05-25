# PROJECT_AUDIT — 真实只读审计

> 审计日期: 2026-05-25
> 项目路径: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 审计方式: 只读现有代码与文档, 未修改任何源码。
> 外部参考: Markus README, 仅借鉴产品逻辑, 不复制 UI / 文案 / 品牌。

本轮目标: 在现有半成品基础上, 把项目收束为有独立审美的 AI Team Workspace / Command Center, 补齐尚未明确表达的 AI Workforce 结构, 保留全部现有核心功能。

---

## 0. 仓库与运行状态

- **不是 git 仓库**: 在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 运行 `git status --short` / `git diff --stat` 均返回 `fatal: not a git repository`。本审计与后续交付**不提供 git diff**, 改动以文件清单方式如实记录。
- pnpm workspace (`pnpm-workspace.yaml` → `server` + `web`), 根 `package.json` 用 `concurrently` 同起前后端 (`pnpm dev`)。
- pnpm 版本 11.3.0; `web/node_modules` 与 `server/node_modules` 均已安装。
- 工作区根、`server`、`web` 三处各有 node_modules, 但**全局/各包 `@types/node` 未安装**(见第 7 节 build 风险)。

---

## 1. 技术栈(真实)

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Vite 6 + Tailwind v4 + lucide-react + @xterm/xterm + react-markdown(remark-gfm/breaks) |
| 后端 | Fastify 5 + Prisma 6 + SQLite + @fastify/websocket + node-pty |
| 数据库 | `server/prisma/dev.db`(真实本地数据, 持久化), schema 在 `server/prisma/schema.prisma` |
| 身份 | 无登录, `x-user-id` 请求头 + 前端身份切换 |
| AI | OpenAI 兼容 `/chat/completions`, 支持 per-assistant `baseUrl/apiKey/model`, 流式 SSE + 工具循环 |

端口: 后端 5373, 前端 5173。多数助手实际指向本地 LLM 代理 CLIProxyAPI(`127.0.0.1:8317`), 由用户在外部运行。

---

## 2. 已有功能(均为既有资产, 必须保留)

### 聊天底座
频道 / 私信(DM) / 实时 WebSocket / 未读 / 在线状态 / typing / 明暗主题 / 移动端抽屉。
emoji 反应、话题串(Thread)、@提及补全、消息编辑删除、批量删除、固定(pin)、全局搜索 + 消息定位、收件箱(Inbox)、任务看板(TasksView)、Markdown + 图片/文件上传。

### AI 助手(招牌能力)
- 助手 = 特殊 `User`(`isAssistant`), 复用成员 / 私信 / 消息 / 实时 / 任务全部机制。
- 多供应商: UI 可为每个助手配 `provider / baseURL / apiKey / model`; **key 不回传前端**(只暴露 `hasApiKey`)。
- 34 个职业预设(`server/src/presets.ts`, 双层人设法) + `PRESET_SKILLS` 技能映射。
- 真实 function-calling 技能(`server/src/skills.ts`): 当前时间、搜消息、列频道、计算器、建任务、读网页、生成图片、记忆(remember)、日历/日程、本地只读文件(list_dir/read_file 全局只读)、受限命令执行(run_command)。
- 统一流式(含工具助手最终回答) + **停止生成硬刹车**(`POST /channels/:id/stop`, AbortController)。
- 频道主动响应(`pickResponders` LLM 路由 + 四层防吵: 开关 / 最多 2 个 / 8s 冷却 / 无 key 不进候选)。
- 严格 `@handle` 路由: 被 @ 必回、整条有 @ 即关主动路由、@多人按序、@all; 多助手协作 `MAX_ASSISTANT_DEPTH = 3` 防循环。
- L2 长期记忆(`memory` 字段 XML 注入 + `remember` 工具)、AI 工作状态广播、cede 透明、任务可派 AI。
- 日历事件协作轴(`Event` 模型 + 事件卡即讨论线程根 + Cron 60s 提醒)。

### 终端
Rail 第四视图。人用交互终端(独立 WS `/ws/terminal` + node-pty + @xterm/xterm, 刷新即重建, cwd = 项目根) + AI `run_command` 技能(cwd 限项目根 / 超时 / 截断 / 危险词预检, 权限隔离给 engineer/tech-lead)。

### 已有 AI Workspace 首屏(Phase 1 + Phase 2 成果)
- `web/src/App.tsx` 默认 `view = 'workspace'`。
- `web/src/components/Rail.tsx`: 工作台 / 消息 / 收件箱 / 任务 / 终端 五个入口; `MainView = 'workspace' | 'channel' | 'inbox' | 'tasks' | 'terminal'`。
- `web/src/components/workspace/`:
  - `WorkspaceView.tsx`(组合层) / `CommandHeader.tsx`(Mission Command + 摘要 + CTA + constellation 背景) / `AgentRoster.tsx`(AI 团队) / `MissionBoard.tsx`(四列看板) / `ActivityFeed.tsx`(运行日志) / `DeliveryPanel.tsx`(交付确认) / `ContextVault.tsx`(上下文抽屉)。
- `web/src/lib/workspace.ts`: 纯函数适配层, 把真实 `assistants/tasks/statuses` 派生为工作台数据, 真实为空时回退 mock。
- `web/src/lib/mockData.ts`: 集中存放 MOCK_AGENTS / MOCK_MISSIONS / MOCK_ACTIVITIES / MOCK_DELIVERIES / CONTEXT_VAULT_ITEMS。
- `web/src/theme.css` / `index.css`: 已追加 agent 状态色、glass 表面、优先级、constellation 背景与轻动效 token。

---

## 3. UI 半成品状态(对照本轮目标的缺口)

工作台已具备壳, 但对照目标要求的「主界面结构」, 以下结构尚**未明确表达**:

| 目标要求结构 | 现状 |
|--------------|------|
| AI Team | ✅ AgentRoster 已有 |
| Mission Board | ✅ MissionBoard 已有(四列) |
| Activity / Audit Trail | ✅ ActivityFeed 已有 |
| Delivery Panel | ✅ DeliveryPanel 已有(Approve/打回, 仅前端状态) |
| Context Vault / 项目记忆 | ✅ ContextVault 抽屉已有(仅展示路径, 未读内容) |
| **Task Breakdown(任务拆解)** | ❌ 缺: 无「总目标 → 子任务 → 负责人 → 状态 → 依赖 → 交付物」表达 |
| **Parallel Execution(并行执行)** | ❌ 缺: 未可视化多 Agent 并行 |
| **Quality Review(质量审查)** | ⚠️ 只有看板「待复核」列, 无 pass/need-fix/reviewer notes 表达 |
| **Human Approval(人工确认)** | ⚠️ 仅 DeliveryPanel 内按钮, 无聚合的人工确认门 |

其它已知问题:
- `Rail` 品牌仍是 `H` + `Helio · 内部版`, 与「独立审美 AI Team Command Center」定位不一致。
- Delivery / Activity / Review 仍大量依赖 mock / 派生数据(后端无对应状态机); 已用「示例」角标区分, 本轮需继续保持边界清晰。
- `TasksView` 仍是三列 todo/doing/done, 与工作台四列 mission flow 并存(作为完整看板入口, 保留)。

---

## 4. AI / server / tool / stream 逻辑(关键契约, 不可破坏)

`server/src/index.ts`(约 1695 行):
- `currentUser()` 读 `x-user-id`; `shapeMessage()` 统一前端消息形状; `parseMentions()` 严格解析 @handle/@name/@all。
- `maybeTriggerAssistants()`: DM 必回 / 群聊被 @ 必回 / 无 @ 真人顶层走 `pickResponders` 主动路由 / 单条最多 2 个 / 同助手同频道 8s 冷却 / 链式深度 3 / `stopChannelGen()` 经 AbortController 硬停。
- `/ws` 事件: presence、message、message-updated、message-chunk(流式)、channel-created/updated、reaction、thread-reply、typing、assistant-status、inbox、tasks、message-deleted、messages-deleted、channel-deleted、event-deleted。
- `/ws/terminal`: 每连接一个 node-pty, cwd = 项目根; 出站 data/exit, 入站 input/resize。

`server/src/ai.ts`: `generateReply`(供应商解析 / SSE 流式 / 工具循环 `MAX_TOOL_ROUNDS = 5`) + `pickResponders` + `canGenerate`; `generate_image` 结果兜底拼回。

`server/src/skills.ts`: `toolsFor()` 按助手 skills 输出 function schema; `runTool()` 调 handler; `run_command` 有项目根限制 / 危险词预检 / 超时 / 输出截断 / 角色权限隔离。

REST(都需 `x-user-id`)与 WS payload 形状由 `web/src/lib/api.ts` 与 `web/src/lib/types.ts`(`WsEvent`) 镜像。**本轮前端改动不得改变任何 REST/WS payload 形状。**

---

## 5. 必须保留(本轮硬约束)

频道/私信/实时消息/Thread/Inbox/Tasks/Terminal; 助手创建/编辑/删除; 助手 provider/baseURL/apiKey/model 配置路径; AI skills 与 tool calling; 停止生成; 主题切换; 身份切换; 现有 `workspace/*` 组件; `pnpm dev` 运行方式; `server/prisma/dev.db` 数据。

---

## 6. 本轮可优化(小步, 不重写)

- 在现有 `WorkspaceView` 内**新增**: 任务拆解(Task Breakdown)、并行执行可视化(Parallel Execution)、质量审查(Quality Review)、人工确认门(Human Approval)。
- `Rail` 品牌收束为独立 AI Command Center 标识(orbit/constellation 隐喻), 去掉「Helio 同款」直接表述。
- 保持 mock 集中在 `lib/mockData.ts`、派生集中在 `lib/workspace.ts`、组件纯展示; 继续用「示例」角标标清 mock/真实边界。
- `theme.css` / `index.css` 仅小步追加 token / 动效(并行执行轨道、审查徽章色等), 不替换现有体系。
- 文案中文优先、信息层级清晰、深色优先、克制科技感。

---

## 7. 不能乱动 / 风险

**禁止**: 重写项目; 删除现有功能; 改 WS/REST payload 而不同步前端; 复制 Markus UI/文案/品牌; 删除或重置 `dev.db`; 跑 `pnpm db:reset`; 把 mock 散落进多个 JSX; 引入大型视觉/3D 依赖; 把 key 写进文档或前端; 只做文档不做实现; 只做 UI 而丢现有功能。

**风险点**:
1. **server build 预期失败**: `server/tsconfig.json` 声明 `"types": ["node"]`, 但 `@types/node` 未在 `server/package.json` devDeps 且未安装。`pnpm -C server build`(tsc)会报 `TS2688: Cannot find type definition file for 'node'`。该问题改造前已存在, 与本轮前端改动无关; `pnpm -C server dev`(tsx 运行时直译)不受影响。本轮验收以 `pnpm -C web build` 为主; server build 真实结果照实记录在 `BUILD_RESULT.md`。
2. 非 git 仓库, 无法提供 diff。
3. AI 真实多 Agent runtime / 自动拆解 / 自动审查 / 审批落库**均未后端化**; 本轮新增的 Task Breakdown / Parallel Execution / Quality Review / Human Approval 是**界面表达 + 前端状态/示例**, 必须如实标注, 不得宣称真实 runtime。
4. 终端、工具调用、文件读取有安全边界, 不为产品表达放宽。
5. 前端产物已偏大(>500kB 基线警告), 非本轮引入。

---

## 8. 本轮最小可行目标(MVP)

在不重写、不删功能的前提下完成一次 "AI Team Command Center consolidation":
1. 本审计 + PLAN + DESIGN_BRIEF 更新。
2. 在 `WorkspaceView` 内补齐 Task Breakdown、Parallel Execution、Quality Review、Human Approval 四个结构, 与已有 AI Team / Mission Board / Activity / Delivery / Context Vault 组成完整 Command Center。
3. Rail 品牌收束为独立标识。
4. 保留全部现有核心功能与契约。
5. 运行 build, 失败最多自动修复 3 轮, 真实记录。
6. 输出 DELIVERY / REVIEW / BUILD_RESULT / FINAL_REPORT。

---

## 9. 审计补充 · 第 3 轮(真实数据驱动, 去 mock)

> 补充日期: 2026-05-25 | 新增硬约束: **禁止假数据**。

### 9.1 新增硬约束(本轮最重要)

- 禁止添加假 Agent / 假 mission / 假 delivery / 假 review / 假测试结果 / 看上去像假的 demo 数据。
- 已有 mock 只能**减少 / 替换 / 明确隔离**, 不得继续扩大。
- 优先使用**真实后端、真实助手、真实任务、真实运行日志**。
- 临时测试不得把测试人物 / 测试任务留在产品界面当成果。
- 本地测试 LLM 配置(model `gemini-2.5-flash`, 本地代理 baseURL, key)**仅限本机助手配置**, 严禁写入业务代码 / 前端 / 报告。

> 与第 2 轮(Command Center Consolidation)的取舍冲突: 第 2 轮为「首屏不空」新增了 `MOCK_AGENTS / MOCK_MISSIONS / MOCK_ACTIVITIES / MOCK_DELIVERIES / MOCK_SUBTASKS / MOCK_REVIEWS` 作为兜底。本轮按新约束**移除这些假产品数据**, 改为真实数据驱动 + 诚实空状态。

### 9.2 真实数据盘点(后端在线, 实测)

`curl localhost:5373/api/...`(带 `x-user-id`)实测:

- **真实用户**: 5 人(amy / kyle / leo / mia / sam)。
- **真实助手**: 10 个, 均为真实创建, 含真实 skills / model / hasApiKey:
  数据分析师、技术负责人、产品经理、设计师、设计师gpt-image-2、市场研究、教研架构师(Edu)、会议秘书、测试工程师、软件工程师。
- **真实任务**: 9 个(8 todo + 1 doing「复刻收尾:四模块联调」); 部分有真实 assignee(产品经理)与真实 channel(公司内部决策群, 该频道下有 3 个真实任务, 构成天然的真实「目标→子任务」分组)。

结论: 工作台**完全可以用真实数据驱动** —— AI 团队取真实助手, 看板/拆解取真实任务, 并行/活动取真实任务状态。无需任何假数据。

### 9.3 本轮去 mock 映射(真实源 → 结构; 无真实源 → 诚实空状态)

| 主界面结构 | 真实数据源 | 无源时 |
|------------|------------|--------|
| AI Team | 真实 `assistants`(+任务/状态派生角色与忙闲) | 空状态「还没有 AI 队员」 |
| Mission Board | 真实 `tasks`(todo/doing/done→列) | 列内空态;Review 列后端无状态 → 留空(诚实) |
| Task Breakdown | 真实 `tasks` 按 `channel` 分组(频道=目标, 任务=子任务) | 空状态 |
| Parallel Execution | 真实 `doing` 任务的不同 assignee + 实时 `statuses` | 不显示「N 路并行」 |
| Activity / Audit Trail | 真实任务更新事件(+实时状态) | 空状态「暂无运行记录」 |
| Quality Review | 后端无审查状态机 | 诚实空状态(不展示任何 fabricated 结论) |
| Delivery Panel | 真实 `done` 任务(不伪造测试/风险) | 空状态(当前 0 个 done) |
| Human Approval | 真实 `done` 任务待确认聚合 | 无待确认 → 门控条隐藏 |
| Context Vault / 项目记忆 | **真实仓库文档**(PROJECT_CONTEXT / docs/ai/* / DECISIONS) | 文件真实存在 |

### 9.5 审计补充 · 第 4 轮(Full Delivery 完整版)

> 补充日期: 2026-05-25 | 目标: 真实工作流内核(Goal/Mission → Tasks → Review → Delivery → Approval → Audit)。

P0 全部落地为**真实持久化**(非前端 state):
- 新增 Prisma 模型 `Mission / Review / Delivery / AuditEvent`(标量外键, 不动既有关系), 扩展 `Task`(missionId/priority/expectedOutput/reviewerId)。`prisma db push` 增量迁移, **未丢数据**(迁移前 15 users / 9 tasks / 127 messages, 迁移后一致)。
- 新增后端 API: `GET/POST/PATCH /api/missions`、`GET /api/missions/:id`(含真实任务拆解)、`GET/POST /api/reviews`、`GET/POST/PATCH /api/deliveries`(approve/reject 落库)、`GET /api/audit-events`、`GET /api/context-docs`(+ `:id` 读全文, `?q=` 搜索)。
- 关键动作写 append-only `AuditEvent`: mission.created / mission.status_changed / task.created / task.status_changed / review.submitted / delivery.created / approval.decided / terminal.command / ai.tool_call。
- 前端去 stale mock: 删除 `lib/mockData.ts`; 移除 `Agent.isReal`、`Mission.source:'mock'`、`ContextVaultItem`; 工作台全部读真实 API。
- 品牌统一: `Helio 内部版` → `Heliox · AI 工作台`(Rail + Sidebar); Helio 仅作历史来源留在 README/文档。
- `pnpm -C server build` 修复: 因 pnpm v10→v11 store 迁移导致无法 `pnpm install`(会触发 modules 目录清除), 采用**vendored** `@types/node`(放入 `server/node_modules/@types/node`)使 tsc 通过; 并修复 `realtime.ts` 的 `ws` 类型与两处 `raw` 隐式 any。两端 build 均通过。

### 9.4 本轮不变的硬约束

承接第 5/7 节: 不改 server 源码、schema、`dev.db`; 不跑 `db:reset`; 不破坏 REST/WS payload; 不复制 Markus; 不引入大型依赖; key 不入代码/前端/报告。`server build` 仍因缺 `@types/node` 失败(预先存在, 范围外, 项目方在 `AI_START.md`/`TASKS.md` 已声明并以 tsx 运行)。
