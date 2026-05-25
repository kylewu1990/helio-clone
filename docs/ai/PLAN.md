# AI Workforce Workspace 改造执行计划

角色：1 号主控 PM / 架构师 Agent  
范围：基于 `docs/ai/TASK.md` 拆解 Phase 1 + Phase 2，不改业务代码。

## 1. 当前项目结构判断

当前项目不是纯前端 demo，而是一个已有聊天工作区产品：

- 根目录是 pnpm workspace 风格入口，`package.json` 只负责 `pnpm dev` 并行启动 `server` 和 `web`。
- 后端在 `server/`，技术栈是 Fastify + Prisma + SQLite + WebSocket，入口集中在 `server/src/index.ts`。
- 前端在 `web/`，技术栈是 React 19 + Vite + Tailwind v4 + lucide-react，主应用入口是 `web/src/App.tsx`。
- 现有 UI 已有左侧 Rail、Sidebar、频道聊天、收件箱、任务看板、终端、线程面板、助手创建/编辑弹窗。
- 现有 AI 能力已经比较重：助手作为特殊 User，支持多供应商配置、技能、频道响应、状态流、记忆字段、任务指派。
- 当前产品定位还是“Helio 同款团队聊天 + AI 助手”，信息中心在频道消息流；本次目标要把首屏重心调整为“AI Team Workspace / Mission Control”。

关键判断：

- 本轮不应该重写后端，也不应该改 Prisma schema。
- 本轮应该优先在前端增加一个 AI Workspace 首页或主视图，把已有 `assistants`、`tasks`、`inbox`、`channels`、`statuses` 等数据重组为工作台表达。
- 已有 `TasksView` 可以保留作为详细任务页；新首页里的 Mission Board 可以先用同一批 task 数据做更高层的信息呈现。
- 当前任务状态只有 `todo | doing | done`，Markus 式 `Backlog / In Progress / Review / Delivered` 本轮可以通过前端映射或 mock 扩展表达，不急着改数据库。
- 视觉系统已有 `theme.css` token 和暗色模式基础，但仍偏 Helio 暖色聊天产品；本轮需要增加更“mission control / AI constellation”的视觉层，同时保持现有 token 和组件可复用。

## 2. Phase 1 本轮必须做什么

目标：打开首页，一眼看出这是 AI Team Workspace，而不是普通团队聊天。

必须交付：

1. 新增 AI Workspace 主视图
   - 在 Rail 增加一个工作台入口，建议作为默认首屏。
   - 页面标题方向使用中文为主，保留少量英文产品感，例如“AI Team Mission Control”。
   - 不替换原有频道聊天，只把聊天降级为工作区内的协作/执行入口。

2. Mission Command 首屏区域
   - 显示当前项目目标：“组建你的 AI 团队，把想法推进到交付。”
   - 显示本轮状态摘要：活跃 Agent 数、进行中任务数、Review 数、待人工确认数。
   - 加入克制的 constellation / orbit / lab 视觉隐喻，可以用 CSS 背景、细线、光点，不引入大型图形依赖。

3. AI Team Status
   - 基于现有 `assistants` 数据渲染 Agent 卡片。
   - 每张卡显示名称、角色/模型线索、状态、当前任务、权限或信任等级。
   - 状态来源优先用已有 WebSocket `assistant-status`，不足部分用前端派生或 mock。

4. Mission Board
   - 基于现有 `tasks` 数据做四列工作台表达：Backlog / In Progress / Review / Delivered。
   - 现有 `todo | doing | done` 先映射到工作台列；Review 可用 mock 或派生规则展示。
   - 任务卡显示标题、负责人、优先级、状态、预期输出物。
   - 保留现有任务创建、移动、指派能力，不破坏 `TasksView`。

5. Live Activity Timeline
   - 展示最近运行记录：Agent 开始任务、修改文件、Reviewer 请求修复、交付通过等。
   - 本轮可用前端状态模型 + mock activity。
   - 未来再接真实 WebSocket / 后端日志。

6. Delivery Panel
   - 展示本轮交付摘要、修改文件、测试结果、风险、人工确认按钮。
   - 本轮按钮只做 UI 状态表达，不触发真实发布或后端审批。

7. Context Vault 入口
   - 展示 PROJECT_CONTEXT、TASK、REVIEW、DELIVERY、DESIGN_PRINCIPLES 等上下文入口。
   - 本轮先做静态/前端数据入口，不要求真实文档读取 API。

8. 保持现有聊天/执行能力
   - 频道、私信、线程、消息编辑删除、反应、搜索、收件箱、任务、终端、助手管理都不能被移除。
   - 当前 `api` 方法、WebSocket 事件处理、身份切换、主题切换必须继续可用。

## 3. Phase 2 后续做什么

目标：让 Phase 1 的 UI 不是死页面，而是有可扩展的前端状态模型。

建议交付：

1. 定义 Workspace 类型
   - `WorkspaceAgent`
   - `WorkspaceTask`
   - `WorkspaceActivity`
   - `WorkspaceDelivery`
   - `ContextVaultItem`

2. 建立前端数据适配层
   - 从现有 `Assistant[]` 派生 `WorkspaceAgent[]`。
   - 从现有 `Task[]` 派生 `WorkspaceTask[]`。
   - 从现有 `statuses`、`inbox`、`tasks`、`channels` 派生 activity summary。
   - mock delivery 和 context vault 独立放在常量或 helper 中，不散落在 JSX。

3. 拆组件
   - `WorkspaceView`
   - `MissionCommand`
   - `AgentStatusGrid`
   - `MissionBoard`
   - `ActivityTimeline`
   - `DeliveryPanel`
   - `ContextVault`

4. 建立状态命名规范
   - Agent status：`idle | working | reviewing | blocked | done`
   - Task status：`backlog | inProgress | review | delivered`
   - Activity type：`task | file | review | delivery | human`
   - Delivery status：`draft | waitingReview | approved | needsFix`

5. 为 Phase 3 预留接口形状
   - 前端类型先稳定下来，后续后端可以按同名资源补 API。
   - 不在 Phase 2 内强制新增数据库。

## 4. 现在只做 UI 表达、不做真实 runtime 的 Markus 能力

本轮只做产品壳和状态表达，以下能力不能宣称已真实完成：

- 真实多 Agent 并行 runtime：只用 UI 表达多个 Agent 并行，不启动多个真实 worker。
- 自动任务拆解：可以展示 mock/派生子任务，不接真实 Planner。
- 自动指派 Agent：可以展示负责人，不做真实调度器。
- Agent 间依赖执行：可以展示依赖，不做 runtime dependency graph。
- Reviewer 自动审查：可以展示 review 状态和 notes，不做真实审查流水线。
- Final delivery 自动生成：可以展示 Delivery Panel，不做真实交付包生成。
- 审批流：人工确认按钮只做前端状态，不触发发布、合并或数据库审批。
- Context Vault 文档系统：只做入口和信息架构，不做真实文件索引、向量记忆或权限系统。
- Audit Trail 持久化：Live Activity 可先 mock，不落库。

## 5. 必须保留的现有功能

以下功能是当前产品资产，本轮不能破坏：

- `pnpm dev` 同时启动后端和前端。
- `web` 的 Vite dev server 继续运行在当前方式下。
- `server` 的 Fastify API、SQLite 数据、Prisma schema 不随意改动。
- 无登录身份切换：`x-user-id` 请求头 + 左下角身份切换。
- 频道列表、私信、频道详情、消息列表。
- WebSocket 实时消息、presence、typing、assistant-status。
- 消息发送、编辑、删除、批量删除、emoji reaction、pin。
- 线程面板和 thread reply。
- 收件箱 unread 和 mark read。
- 现有任务 API：创建、移动、删除、指派。
- 终端视图。
- 助手创建/编辑/删除、presets、skills、providers。
- AI key / baseURL / model 配置路径。
- 明暗主题切换。
- 移动端 Sidebar 抽屉行为。

## 6. 2 号实现者可能修改的文件

建议 2 号实现者优先只改前端和交付文档：

- `web/src/App.tsx`
  - 增加默认 workspace view。
  - 传入 assistants、tasks、users、statuses、inbox 等数据给新工作台。

- `web/src/components/Rail.tsx`
  - 增加 Workspace/Mission Control 导航入口。
  - 扩展 `MainView` 类型。

- `web/src/components/WorkspaceView.tsx`
  - 新增工作台主页面。

- `web/src/components/workspace/*`
  - 可选新增组件目录，放 MissionCommand、AgentStatusGrid、MissionBoard、ActivityTimeline、DeliveryPanel、ContextVault。

- `web/src/lib/types.ts`
  - 增加前端 workspace 类型，不破坏现有 API 类型。

- `web/src/lib/workspace.ts`
  - 可选新增适配层，把现有 assistants/tasks/statuses 转成 workspace 数据。

- `web/src/theme.css`
  - 可少量增加 workspace 专用 token，例如 glass、glow、constellation line。
  - 不要大规模替换现有色彩系统。

- `web/src/index.css`
  - 仅在必要时增加全局背景/滚动/字体细节。

- `docs/ai/DELIVERY.md`
  - 实现完成后写交付说明、修改文件、验证结果、风险和后续建议。

通常不建议本轮修改：

- `server/src/*`
- `server/prisma/schema.prisma`
- `server/prisma/dev.db`
- `package.json`
- `pnpm-lock.yaml`

除非 2 号发现现有 build 必须修复，否则不要碰后端和依赖。

## 7. 验收清单

产品验收：

- 首页默认进入 AI Workspace / Mission Control，而不是普通聊天空状态。
- 首屏能回答：有哪些 AI 队员、他们在做什么、我下一步要确认什么。
- 页面包含 Mission Command、AI Team Status、Mission Board、Live Activity、Delivery Panel、Context Vault。
- Mission Board 体现 Backlog / In Progress / Review / Delivered 的交付流。
- 页面有独立审美：深色优先、克制 glass、清晰秩序、轻微科技感，不像普通后台模板。
- 不复制 Markus 的 UI 文案和布局。
- 中文体验完整，不出现大量英文占位导致产品割裂。

功能验收：

- 频道聊天仍可打开、发送消息、接收实时消息。
- 助手列表和助手创建/编辑不受影响。
- 任务创建、移动、指派、删除仍可用。
- 收件箱、终端、线程面板仍可访问。
- 主题切换和身份切换仍可用。
- 移动端可通过菜单打开 Sidebar。

工程验收：

- mock 数据集中在类型/适配层或组件顶部，不散落硬编码在多个 JSX 片段。
- 新组件命名清晰，后续 Phase 3 容易接真实 API。
- 不新增大型依赖。
- 不修改后端数据库结构。
- 不删除现有功能代码。
- `pnpm -C web build` 通过。
- `pnpm -C server build` 通过。
- 根目录没有编造测试结果；如果某个命令失败，必须在 `docs/ai/DELIVERY.md` 记录原因。

交付文档验收：

- `docs/ai/DELIVERY.md` 说明本轮完成内容。
- 记录修改文件。
- 记录实际执行过的 build/test/lint 命令和结果。
- 记录未实现的真实 runtime 能力。
- 记录后续 Phase 3/Phase 4 建议。

---

# 附录 · 本轮(Command Center Consolidation)增量计划

> 更新日期: 2026-05-25 | 性质: **小步增强, 不重写, 不删功能**
> 依据: `docs/ai/PROJECT_AUDIT.md` 第 3/6/8 节缺口。

## A. 当前已有成果(承接 Phase 1 + Phase 2)

工作台首屏(`WorkspaceView` + `workspace/*`)已具备: AI 团队(AgentRoster)、任务看板(MissionBoard 四列)、运行日志(ActivityFeed)、交付确认(DeliveryPanel)、上下文抽屉(ContextVault); 适配层(`lib/workspace.ts`)与集中 mock(`lib/mockData.ts`)已就位。`pnpm -C web build` 上一轮通过。

## B. 必须保留(不变)

频道/私信/实时/Thread/Inbox/Tasks/Terminal、助手增删改、provider/baseURL/key/model 配置、AI skills/tool calling、停止生成、主题切换、身份切换、`pnpm dev`、`dev.db`、所有 REST/WS payload 形状。详见 PROJECT_AUDIT 第 4/5 节。

## C. 本轮只做这些小步增强

1. **任务拆解 Task Breakdown**(新增 `workspace/TaskBreakdown.tsx`)
   - 表达: 总目标 → 子任务 → 负责人 Agent → 状态 → 依赖关系 → 预计交付物。
   - 同一组件内**可视化并行执行**(Parallel Execution): 多条执行轨道(lane)按 Agent 并行推进, 用进度/状态体现「同时进行」。
   - 数据: 以当前进行中的真实任务标题作为「总目标」(有则用真实, 无则示例); 子任务为前端规划/示例, 明确「示例」角标。
2. **质量审查 Quality Review**(新增 `workspace/QualityReview.tsx`)
   - 表达: review 状态(复核中/通过/需修复)、reviewer、检查清单、notes。
   - 数据: 集中 mock, 角标标注; 计入首屏「待复核」摘要。
3. **人工确认门 Human Approval**(新增 `workspace/ApprovalGate.tsx`)
   - 表达: 聚合所有「等待人类确认」的事项(待确认交付 + 需人工签署的审查), 顶部门控条, 内联确认/暂缓。
   - 数据: 由 deliveries(pending) + reviews(待签署) + activities(requiresHuman) 派生, 纯前端状态动作。
4. **品牌收束**(`Rail.tsx`)
   - 把 `H` + `Helio · 内部版` 收束为独立 AI Command Center 标识(orbit/constellation 隐喻), 不再直白「Helio 同款」。不改导航结构与 `MainView`。
5. **数据层小步扩展**
   - `lib/types.ts` 追加 `Subtask / SubtaskStatus / MissionPlan / ReviewItem / ReviewVerdict / ApprovalItem / ApprovalKind`(纯追加, 现有类型零改动)。
   - `lib/mockData.ts` 集中追加示例(不散落 JSX)。
   - `lib/workspace.ts` 追加 `buildMissionPlan / buildReviews / computeApprovals`, 并让 `computeSummary` 纳入 review 数。
6. **CSS 小步**
   - `theme.css` 追加并行轨道 / 审查 verdict 色 token; `index.css` 追加 lane 进度等克制动效, `prefers-reduced-motion` 下关闭。

## D. 文件影响

**会改/新增(全部前端 + 文档)**:
- 新增: `web/src/components/workspace/{TaskBreakdown,QualityReview,ApprovalGate}.tsx`
- 改: `web/src/components/workspace/WorkspaceView.tsx`(集成新分区)、`web/src/components/workspace/CommandHeader.tsx`(如需对齐摘要)、`web/src/components/Rail.tsx`(品牌)、`web/src/lib/{types,mockData,workspace}.ts`、`web/src/theme.css`、`web/src/index.css`
- 文档: `docs/ai/{PROJECT_AUDIT,PLAN,DESIGN_BRIEF,DELIVERY,REVIEW,BUILD_RESULT,FINAL_REPORT}.md`

**禁止改动**: `server/*`、`prisma/schema.prisma`、`dev.db`、根 `package.json`、`pnpm-lock.yaml`、`api.ts` 现有方法、`types.ts` 内 `WsEvent` 与既有 API 类型、所有现有非工作台视图组件。

## E. 如何验证

- 类型: `pnpm -C web exec tsc --noEmit`。
- 构建: `pnpm -C web build`(必须通过); `pnpm -C server build`(记录真实结果, 预期因缺 `@types/node` 失败, 与本轮无关)。
- 人工: 见 `FINAL_REPORT.md` 验收步骤(首屏八大结构可见 + 旧视图无回归)。

## F. build 失败处理

最多自动修复 3 轮, 每轮只做最小必要修改, 重跑对应 build, 更新 `BUILD_RESULT.md` 与 `REVIEW.md`。3 轮仍失败则停止并记 `NEED_FIX`。不为通过 build 删功能 / 隐藏错误 / 编造结果。

---

# 附录 · 第 3 轮(Real-Data Driven, 去 mock)

> 更新日期: 2026-05-25 | 性质: **小步增强, 不重写, 不删功能**。
> 触发: 新约束「禁止假数据, 优先真实后端/助手/任务/日志」。

## A. 现状(承接第 2 轮)

工作台八大结构已就位, 但 Quality Review / Delivery / Task Breakdown 子任务 / 部分 Activity / 兜底 Agent/Mission 由 `lib/mockData.ts` 的假数据驱动。后端实测有 **10 个真实助手 + 9 个真实任务**, 足以真实驱动。

## B. 本轮只做这些小步

1. **移除假产品数据**(`lib/mockData.ts`): 删除 `MOCK_AGENTS / MOCK_MISSIONS / MOCK_ACTIVITIES / MOCK_DELIVERIES / MOCK_SUBTASKS / MOCK_REVIEWS`。仅保留指向**真实仓库文档**的 `CONTEXT_VAULT_ITEMS`(它们是真实 .md, 非假数据)。
2. **派生改真实**(`lib/workspace.ts`):
   - `deriveAgents`: 去掉 mock 兜底, 真实助手为空则返回 `[]`(组件空状态)。角色由真实 skills + 名称推断。
   - `buildBoardMissions`: 去掉 mock 填充, 仅真实任务映射。Review 列后端无状态 → 留空。
   - `deriveActivities`: 去掉 `MOCK_ACTIVITIES`, 仅真实任务事件(+实时状态)。
   - `buildMissionPlan`: 改为真实 —— 按 `channel` 把真实任务分组(频道=总目标, 任务=子任务, 真实 owner/status); 无 channel 时以进行中/待办任务成组。不伪造依赖与百分比进度。
   - `parallelLaneCount`: 由真实 `doing` 任务的不同 assignee(+实时 statuses)计。
   - **新增** `deriveDeliveries(tasks)`: 真实 `done` 任务 → 交付物(不伪造 test/risk)。`computeApprovals` 据其聚合。
   - 删除 `buildReviews`(无真实源)。
3. **组件适配真实/空状态**:
   - `TaskBreakdown`: 去掉假百分比, `doing` 子任务用**不定态**进度条(只表「进行中」不报具体数值); 无依赖数据则不显示依赖。
   - `QualityReview`: 改为诚实空状态(后端无审查状态机, 不展示任何 fabricated 结论)。
   - `DeliveryPanel`: 适配可选 test/risk, 真实 done 任务展示真实标题/负责人/时间; 空状态。
   - `ApprovalGate`: 由真实 deliveries 聚合, 空则隐藏。
   - `AgentRoster / MissionBoard / ActivityFeed`: 既有空状态即可。
4. **类型微调**(`lib/types.ts`): `Delivery.testResult / riskLevel` 改为可选(真实 done 任务不伪造)。`Subtask.progress` 已可选。
5. CSS: 复用既有 `.lane-fill` 表达不定态; 必要时小步加不定态动画。不新增大型依赖。

## C. 文件影响

改: `web/src/lib/{mockData,workspace,types}.ts`、`web/src/components/workspace/{WorkspaceView,TaskBreakdown,QualityReview,DeliveryPanel,ApprovalGate}.tsx`、`web/src/index.css`(如需)。
**不改**: server/*、schema、`dev.db`、`package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx` 业务逻辑、Rail 导航、其它现有视图组件、所有 REST/WS payload。

## D. 验证

`pnpm -C web exec tsc --noEmit`(注意 `noUnusedLocals`, 删 mock 后不得留未用导入); `pnpm -C web build`; `pnpm -C server build`(记录, 预期 @types/node 失败)。人工: 工作台用真实助手/任务渲染, 无假人物/假交付; 旧视图无回归。

## E. build 失败处理

同第 2 轮附录 F: 最多 3 轮最小修复, 真实记录, 不删功能 / 不隐藏 / 不编造。

---

# 附录 · 第 4 轮(Full Delivery 完整版,真实工作流内核)

> 更新日期: 2026-05-25 | 性质: 小步增强, 在现有结构上加真实持久化, 不重写。

## A. 范围(P0)

打通 `Goal/Mission → Task Breakdown → Review → Delivery → Human Approval → Audit Trail` 的**真实持久化**闭环;去品牌残留与 stale mock;修复 server build。

## B. Schema / 迁移(不丢数据)

- 新增模型: `Mission`(title/goal/status/createdById/contextDocIds)、`Review`(missionId/taskId/reviewerId/verdict/checksJson/notes)、`Delivery`(missionId/taskId/title/summary/artifactJson/testResult/riskLevel/status/approvedById/approvedAt)、`AuditEvent`(missionId/taskId/actorId/type/summary/payloadJson, append-only)。
- 扩展 `Task`: missionId / priority / expectedOutput / reviewerId(均可选)。
- **外键用标量字段, 不建 Prisma 关系**, 避免改动既有 User/Channel/Message 关系; 展示名由前端用 users 列表解析。
- 迁移方式: `prisma db push`(增量, 不丢数据); **禁止** `db:reset`。迁移前已 `cp dev.db dev.db.bak-<ts>` 备份。

## C. API

missions(list/detail/create/patch)、reviews(list/create)、deliveries(list/create/patch 审批)、audit-events(list)、context-docs(list + 读全文 + 搜索)。所有写操作写 AuditEvent 并广播 `{type:'workspace'}`。

## D. 前端

- types: 加真实行类型(MissionRow/ReviewRow/DeliveryRow/AuditEventRow/ContextDoc), 去 isReal/source/ContextVaultItem。
- api.ts: 加对应方法; createTask 支持 missionId 等。
- App.tsx: 加载 missions/reviews/deliveries/audit, WS `workspace`/`tasks` 刷新, 提供 create/submit/decide/addTask 回调。
- workspace.ts: 全部改 mapper(真实行 → UI 类型), 删 mock。
- 组件: CommandHeader 改 Mission 目标输入; 新增 MissionStrip; TaskBreakdown 接选中 Mission 真实子任务 + 加子任务; QualityReview 提交真实 review; DeliveryPanel/ApprovalGate 真实落库审批; ActivityFeed 读真实审计; ContextVault 读真实文档 + 搜索。
- 品牌: Rail/Sidebar → `Heliox · AI 工作台`。

## E. 工程

- server build: pnpm v10→v11 store 迁移阻断 `pnpm install`; 采用 vendored `@types/node` + 修 `ws` 类型/隐式 any 使 `pnpm -C server build` 通过(详见 BUILD_RESULT)。

## F. 验证

web build / server build / API smoke(users/assistants/tasks/missions/reviews/deliveries/audit/context-docs)/ 真实 AI smoke(发+删测试消息)。所有测试数据用后即删, 不留假数据。
