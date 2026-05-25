# DELIVERY —— AI Workforce Command Center (Phase 1 + Phase 2)

> 交付轮次:第 1 轮(Phase 1 信息架构 + Phase 2 前端状态模型)
> 实现者:2 号代码实现 Agent
> 日期:2026-05-25
> 依据:`docs/ai/TASK.md` / `docs/ai/PLAN.md` / `docs/ai/DESIGN_BRIEF.md`

---

## 1. 本轮范围

把 `helio-clone` 的首屏从"团队聊天空状态"重塑为 **AI Team Workspace / Mission Control 驾驶舱**,并落地一套可扩展的前端状态模型。**纯前端改造**,未触碰后端、数据库、依赖。

打开应用默认进入工作台,一屏回答三件事:有哪些 AI 队员、他们在做什么、我下一步要确认什么。

---

## 2. 修改 / 新增文件

### 新增

| 文件 | 作用 |
|------|------|
| `web/src/lib/mockData.ts` | 集中存放示例 Agent / Mission / Activity / Delivery / ContextVault 数据 |
| `web/src/lib/workspace.ts` | 适配层:真实 Assistant / Task / WS 状态 → 工作台数据结构(纯函数) |
| `web/src/components/workspace/WorkspaceView.tsx` | Command Center 主视图(组合层) |
| `web/src/components/workspace/CommandHeader.tsx` | Mission Command:目标 + 状态摘要 + CTA + constellation 背景 |
| `web/src/components/workspace/AgentRoster.tsx` | AI Team Status 队员列表(含状态徽章、信任等级、working 光环) |
| `web/src/components/workspace/MissionBoard.tsx` | 四列看板 Backlog / 进行中 / 待复核 / 已交付 |
| `web/src/components/workspace/ActivityFeed.tsx` | Live Activity 运行日志时间线 |
| `web/src/components/workspace/DeliveryPanel.tsx` | 交付确认区(Approve / 打回,仅前端状态) |
| `web/src/components/workspace/ContextVault.tsx` | 上下文文档入口抽屉(指向仓库真实 .md) |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/lib/types.ts` | **追加** `Agent / AgentRole / AgentStatus / Mission / MissionStatus / MissionPriority / ActivityEvent / Delivery / ContextVaultItem` 类型;现有类型零改动 |
| `web/src/lib/format.ts` | 追加 `relativeTime()` 工具 |
| `web/src/components/Rail.tsx` | `MainView` 扩展为 `'workspace' \| 'channel' \| 'inbox' \| 'tasks' \| 'terminal'`;新增工作台(LayoutGrid)导航,置于顶部 |
| `web/src/App.tsx` | 默认 `view` 改为 `'workspace'`;新增 `view === 'workspace'` 渲染分支,传入 assistants / tasks / statuses;其余逻辑零改动 |
| `web/src/theme.css` | `:root` 与 `:root[data-theme='dark']` 末尾追加 agent 状态色、glass 表面、优先级、constellation token;未替换现有色彩 |
| `web/src/index.css` | 追加 `agent-pulse` / `activity-in` keyframes、`.constellation-bg`、`.card-lift`,及 `prefers-reduced-motion` 关闭规则 |
| `docs/ai/DELIVERY.md` | 本文件 |

> 未改动:`server/*`、`prisma/schema.prisma`、`dev.db`、根 `package.json`、`pnpm-lock.yaml`、`api.ts` 现有接口、所有现有视图组件。

---

## 3. 功能完成情况

| 任务要求 | 状态 | 说明 |
|----------|------|------|
| 1. 界面优化为 AI Team Workspace / Command Center | 完成 | 新增工作台主视图并设为默认首屏 |
| 2. AI Team Status 区域 | 完成 | `AgentRoster`:队员卡含名称、角色、状态、当前任务、信任等级;working/reviewing 有光环区分 |
| 3. Mission Board | 完成 | 四列 Backlog / 进行中 / 待复核 / 已交付,优先级竖条 + 指派头像 + 输出物标签 |
| 4. Live Activity Timeline | 完成 | `ActivityFeed`:时间线 + 事件类型图标 + 相对时间 + "待人工确认"标记 |
| 5. Delivery Panel | 完成 | `DeliveryPanel`:摘要、改动文件、测试徽章、风险等级、确认/打回(前端状态) |
| 6. Context Vault | 完成 | 右侧抽屉,5 个上下文条目指向仓库真实文档路径 |
| 7. 可扩展前端数据结构 | 完成 | `types.ts` 定义 Agent / Mission / ActivityEvent / Delivery / ContextVaultItem |
| 8. 不破坏现有聊天/核心功能 | 完成 | 频道、私信、线程、收件箱、任务、终端、助手管理、主题/身份切换代码路径均未改动 |
| 9. 高级克制科技感独立视觉 | 完成 | 见第 4 节;延续暖色 token,叠加 glass + constellation,不复制 Markus |
| 10. 运行 build | 完成 | `pnpm -C web build` 通过(见第 5 节) |

### 数据驱动方式(Phase 2)

- **Agent**:由真实 `assistants` 派生(角色按名称/skills 推断,状态由其被指派任务 + WebSocket `assistant-status` 派生,信任等级按 skills 数量),真实助手为空时回退示例数据。
- **Mission**:由真实 `tasks` 派生(`todo/doing/done` → `backlog/in_progress/delivered`),"待复核"列由示例数据补充(后端暂无 review 状态)。示例卡右上角标注「示例」以区分真实数据。
- **Activity**:由最近真实任务派生少量事件,拼接示例日志,按时间倒序。
- **Delivery / Context Vault**:本轮为示例 / 静态入口(后端暂无对应资源)。

mock 全部集中在 `lib/mockData.ts`,派生逻辑全部集中在 `lib/workspace.ts`,组件保持纯展示(props-in)。

---

## 4. 视觉改造说明

- **气质**:calm command center / AI constellation。延续现有暖色「纸/墨」OKLCH token,**未改成冷蓝**(保留差异化),在其上叠加克制的科技感层。
- **层次**:body(canvas)→ 分区面板(chrome-frame)→ 卡片(canvas)三级表面,深浅模式均形成 depth;活跃态(working/reviewing/待确认交付)用 glassmorphism(半透明 + blur + 微弱边框光)凸显。
- **Mission Command 背景**:`.constellation-bg` 用纯 CSS 径向光 + 细网格线表达"星座/实验室"隐喻,不引入任何图形库。
- **状态语言**:agent 状态色(空闲/执行/复核/受阻/完成)、优先级竖条(urgent/high/medium/low)、活动事件类型图标,全部走 `var(--token)`,无行内硬编码颜色。
- **动效**:working 光环呼吸、活动项进入位移、卡片 hover 微浮,均为原生 CSS,且 `prefers-reduced-motion` 下全部关闭。
- **中文优先**:界面文案以中文为主,保留少量英文产品标识(Command Center / Backlog),不出现大量英文占位。

---

## 5. 测试 / Build 结果(真实执行,未编造)

| 命令 | 结果 |
|------|------|
| `pnpm -C web build`(`tsc -b && vite build`) | **通过**。1876 modules transformed,产物 `index.js 813.66 kB / gzip 227.75 kB`,`index.css 41.08 kB / gzip 9.17 kB`。 |
| `pnpm -C web exec tsc --noEmit` | **通过**,exit 0,无类型报错。 |
| `pnpm -C server build`(`tsc`) | **失败**,`error TS2688: Cannot find type definition file for 'node'`。 |

### 关于 server build 失败

- **与本轮改动无关**:本轮只改 `web/` 与 `docs/`,未触碰 `server/`。
- **根因(改造前已存在)**:`server/tsconfig.json` 声明 `"types": ["node"]`,但 `@types/node` 未列入 `server/package.json` 的 devDependencies,当前环境也未安装,故 tsc 找不到 node 类型定义。
- **不影响运行**:`pnpm -C server dev` 使用 `tsx watch`(运行时直译,不经 tsc 类型检查),后端实际运行不受此影响。
- **本轮未修复**:按 `PLAN.md` / `DESIGN_BRIEF.md` 约束(不动 `server/*`、`package.json`、`pnpm-lock.yaml`),未擅自增改后端依赖。修复建议见第 7 节。

> 说明:vite build 的 "chunk > 500 kB" 提示为改造前已存在的基线警告,非本轮引入。

### 未进行的验证

- 未在本环境实际启动前后端做可视化/交互回归(workspace 首屏依赖 `api.me()` 返回,需后端在线;本轮未拉起全栈)。现有功能判断基于"相关代码路径未改动"的回归风险评估,而非运行验证。

---

## 6. 现有功能保留情况

以下功能代码路径本轮**未改动**,预期无回归(未做运行时验证,见上):频道/私信/实时消息、emoji 反应、话题串、@提及、编辑删除、固定、收件箱、任务看板(`TasksView` 原样保留并作为工作台"完整看板"入口)、终端、助手创建/编辑/删除、多供应商配置、明暗主题切换、身份切换、移动端 Sidebar 抽屉。

`MainView` 仅做扩展(新增 `'workspace'`),原有 `'channel' | 'inbox' | 'tasks' | 'terminal'` 全部保留。

---

## 7. 未完成风险 & 后续建议

### 本轮明确未做(仅 UI 表达,非真实 runtime)

- 真实多 Agent 并行 runtime、自动任务拆解、自动指派、依赖执行、Reviewer 自动审查、Final delivery 自动生成、审批落库——**均为前端壳/示例**,DELIVERY/Activity 不落库,确认按钮不触发后端。
- Context Vault 仅做入口,未做真实文档读取 / 向量记忆 / 权限。

### 风险

1. **server build 在本环境失败**(见第 5 节),需要补 `@types/node` 才能让 `pnpm -C server build` 通过——是否修复需 1 号 / 用户裁定(涉及后端依赖)。
2. **示例数据与真实数据混排**:Mission Board 的"待复核"列、Delivery、部分 Activity 为示例,已用「示例」角标区分;接真实后端后应移除 mock 兜底。
3. **未做运行时回归**:建议拉起 `pnpm dev` 后人工走查首屏与各原有视图。

### Phase 3 建议(后端整合)

- 后端按已定型的前端类型补资源:`/api/agents`、`/api/missions`(或扩展 `/api/tasks` 增加 review 状态与 priority/output 字段)、`/api/activities`、`/api/deliveries`。
- 用真实 WebSocket 事件驱动 Activity 时间线(替换 `deriveActivities` 的 mock 拼接)。
- Context Vault 接真实文档读取 API,渲染 `docs/ai/*.md`、`PROJECT_CONTEXT.md` 等内容。

### Phase 4 建议(交付闭环)

- 打通"目标 → 拆解 → 指派 → 执行 → 审查 → 交付":Delivery Panel 的确认/打回接后端审批,Mission 状态机接真实流转。

### 工程建议

- 给 `server/package.json` 补 `@types/node`(devDependencies),修复 server 类型构建。
- 前端产物已偏大(>500kB),后续可考虑对 xterm / react-markdown 做按需 code-split。

---

# DELIVERY — 第 2 轮(Command Center Consolidation)

> 交付轮次: 第 2 轮(在 Phase 1 + Phase 2 成果之上补齐 AI Workforce 结构)
> 日期: 2026-05-25
> 依据: `docs/ai/PROJECT_AUDIT.md` / `docs/ai/PLAN.md`(附录)/ `docs/ai/DESIGN_BRIEF.md`(附录)
> 性质: **纯前端小步增强, 不重写, 不删功能, 未触碰 server / 数据库 / 依赖。**

## 1. 本轮目标

工作台首屏已具备 AI 团队 / 任务看板 / 运行日志 / 交付确认 / 上下文抽屉。本轮在其上**补齐目标要求但尚未明确表达的四个 AI Workforce 结构**, 并把品牌从「Helio 同款」收束为独立 AI Command Center 标识, 使主界面完整体现:

AI Team · Mission Board · **Task Breakdown** · **Parallel Execution** · **Quality Review** · Delivery Panel · Context Vault · Activity/Audit Trail · **Human Approval** · 项目记忆/上下文。

## 2. 修改 / 新增文件

### 新增

| 文件 | 作用 |
|------|------|
| `web/src/components/workspace/TaskBreakdown.tsx` | 任务拆解 + 并行执行: 总目标 → 子任务(负责人/状态/依赖/交付物), running 子任务用并行轨道进度条表达多 Agent 同时推进 |
| `web/src/components/workspace/QualityReview.tsx` | 质量审查: verdict(复核中/通过/需修复)+ reviewer + 检查清单 ✓/✗ + notes |
| `web/src/components/workspace/ApprovalGate.tsx` | 人工确认门 Human Approval: 聚合待人类确认事项, 内联确认/暂缓(仅前端状态) |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/lib/types.ts` | **追加** `SubtaskStatus / Subtask / MissionPlan / ReviewVerdict / ReviewCheck / ReviewItem / ApprovalKind / ApprovalItem`; 现有类型(含 `WsEvent`、API 类型)零改动 |
| `web/src/lib/mockData.ts` | **追加** `MOCK_SUBTASKS`、`MOCK_REVIEWS`(集中存放, 未散落 JSX) |
| `web/src/lib/workspace.ts` | **追加** `buildMissionPlan / parallelLaneCount / buildReviews / computeApprovals`; `computeSummary` 改为纳入审查与审批数(签名更新, 仅 `WorkspaceView` 调用) |
| `web/src/components/workspace/WorkspaceView.tsx` | 集成新分区(中排: 任务拆解 \| 质量审查)、在 header 下渲染 `ApprovalGate`; 派生新数据 |
| `web/src/components/workspace/AgentRoster.tsx` | 新增可选 `parallelLanes` prop, AI 团队标题旁显示「N 路并行」并行执行指示 |
| `web/src/components/Rail.tsx` | 品牌标记 `H` + 「Helio · 内部版」→ orbit 渐变标记 + 「AI Workforce · Command Center」; 导航/`MainView` 不变 |
| `web/src/theme.css` | 追加并行轨道色(`--lane-1/2/3`、`--lane-track`)、审查 verdict 色(`--verdict-*`); 未替换现有 token |
| `web/src/index.css` | 追加 `.lane-fill` 轨道进度流光动效, 并入 `prefers-reduced-motion` 关闭规则 |

### 文档

`docs/ai/PROJECT_AUDIT.md`(新建)、`PLAN.md`(附录)、`DESIGN_BRIEF.md`(附录)、`DELIVERY.md`(本节)、`REVIEW.md`、`BUILD_RESULT.md`、`FINAL_REPORT.md`。

> **未改动**: `server/*`、`prisma/schema.prisma`、`dev.db`、根 `package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx` 业务逻辑、所有现有非工作台视图组件、所有 REST/WS payload 形状。

## 3. 主界面结构完成度

| 目标要求结构 | 状态 | 落地位置 |
|--------------|------|----------|
| AI Team | ✅ | `AgentRoster`(含并行执行指示) |
| Mission Board | ✅ | `MissionBoard`(四列) |
| Task Breakdown | ✅ 新增 | `TaskBreakdown`(总目标→子任务→负责人→状态→依赖→交付物) |
| Parallel Execution | ✅ 新增 | `TaskBreakdown` 并行轨道 + `AgentRoster`「N 路并行」 |
| Quality Review | ✅ 新增 | `QualityReview`(verdict/checks/notes) |
| Delivery Panel | ✅ | `DeliveryPanel` |
| Context Vault / 项目记忆 | ✅ | `ContextVault` 抽屉 |
| Activity / Audit Trail | ✅ | `ActivityFeed` |
| Human Approval | ✅ 新增 | `ApprovalGate`(header 下门控条) |

## 4. 数据真实性边界(mock vs 真实)

- **真实派生**: Agent(由 assistants + tasks + WS statuses)、Mission Board(由真实 tasks 映射 + 示例补 Review 列)、Activity(真实任务事件 + 示例)、Task Breakdown 的**总目标**(取真实进行中/待办任务标题, `goalIsReal` 标识)。
- **示例/前端状态(已标注「示例」或语义明示)**: Task Breakdown 子任务、Quality Review 列表、Delivery 卡、Approval 门项、ContextVault 文档内容(仅路径)。
- mock 全部集中在 `lib/mockData.ts`; 派生集中在 `lib/workspace.ts`; 组件保持纯展示。

## 5. 现有功能保留(代码路径未改动)

频道/私信/实时消息/Thread/Inbox/Tasks/Terminal、emoji 反应、@提及、编辑删除、固定、搜索定位、助手创建/编辑/删除、provider/baseURL/key/model 配置、AI skills/tool calling、停止生成、主题切换、身份切换、移动端抽屉 —— 代码路径本轮**未改动**。`MainView` 与所有 `view===` 分支保持不变。

## 6. 验证

- `pnpm -C web exec tsc --noEmit` → PASS(exit 0)。
- `pnpm -C web build` → PASS(1879 modules, 见 `BUILD_RESULT.md`)。
- `pnpm -C server build` → FAIL(预先存在的 `@types/node` 缺失, 范围外, 已记录)。
- 未做运行时可视化回归(workspace 首屏依赖 `api.me()`, 需后端在线; 本轮未拉起全栈)。现有功能判断基于「相关代码路径未改动」的回归风险评估。

## 7. 仍是 UI 表达 / 非真实 runtime(如实声明)

- 真实多 Agent 并行 runtime、自动任务拆解、自动指派、依赖调度、Reviewer 自动审查流水线、Final delivery 自动生成、审批落库 —— **均未实现**, 本轮为界面表达 + 前端状态 + 示例。
- Task Breakdown 子任务、Quality Review、Approval 门的动作不触发后端, 不落库。
- Context Vault 仅展示文档入口/路径, 未读取真实文档内容。

## 8. 风险与后续建议

- 工作台首屏纵向变长(三排 + 门控条), 已为每个 Panel 设 `max-height` 内部滚动; 后续可考虑折叠/tab 化。
- 接真实后端时: 为 task 增加 review 状态/priority/output、补 `/api/reviews`、`/api/approvals`、Activity 用真实 WS 事件驱动、ContextVault 接文档读取。
- server build 若纳入工程基线, 补 `@types/node`(见 `BUILD_RESULT.md`)。

---

# DELIVERY — 第 3 轮(Real-Data Driven, 去 mock)

> 交付轮次: 第 3 轮(把工作台从 mock 兜底改为真实数据驱动)
> 日期: 2026-05-25
> 触发: 新约束「禁止假数据, 优先真实后端/助手/任务/日志」。
> 性质: **纯前端小步增强, 不重写, 不删功能, 未触碰 server / 数据库 / 依赖。**

## 1. 本轮目标

第 2 轮为「首屏不空」引入了多组假数据(MOCK_AGENTS/MISSIONS/ACTIVITIES/DELIVERIES/SUBTASKS/REVIEWS)。本轮按新约束**移除全部假产品数据**, 工作台改为完全由**真实后端数据**驱动(实测有 10 真实助手 + 9 真实任务), 无真实数据源的分区改为**诚实空状态**, 不再用假卡片填充。

## 2. 修改文件

| 文件 | 改动 |
|------|------|
| `web/src/lib/mockData.ts` | **删除** `MOCK_AGENTS / MOCK_MISSIONS / MOCK_ACTIVITIES / MOCK_DELIVERIES / MOCK_SUBTASKS / MOCK_REVIEWS`; 仅保留指向**真实仓库文档**的 `CONTEXT_VAULT_ITEMS`(更新为指向 PROJECT_CONTEXT / PROJECT_AUDIT / DESIGN_BRIEF / DECISIONS / DELIVERY)。文件头注释说明已去假数据。 |
| `web/src/lib/workspace.ts` | **重写为真实数据驱动**: `deriveAgents` 去 mock 兜底(空→[]); `buildBoardMissions` 去 mock 填充(review 列留空); `deriveActivities` 去 `MOCK_ACTIVITIES`; `buildMissionPlan` 改为按真实 `channel` 分组(频道=总目标, 任务=子任务, 真实 owner/status, 不伪造依赖/进度); `parallelLaneCount` 由真实 `doing` 任务不同负责人计; **新增** `deriveDeliveries`(真实 done 任务, 不伪造测试/风险); `computeApprovals` 由真实交付聚合; 删除 `buildReviews`; 角色推断增强以贴合真实助手。 |
| `web/src/lib/types.ts` | `Delivery.testResult / riskLevel` 改为**可选**(真实 done 任务不伪造), 追加 `assigneeName / assigneeColor`。 |
| `web/src/components/workspace/WorkspaceView.tsx` | 接真实派生; 移除 `MOCK_DELIVERIES`; `QualityReview` 不再传假数据。 |
| `web/src/components/workspace/TaskBreakdown.tsx` | `plan` 可为 null → 空状态; 去掉伪造的百分比进度, `running` 子任务改**不定态**轨道条; 无真实依赖则不显示依赖。 |
| `web/src/components/workspace/QualityReview.tsx` | 改为**诚实空状态**(后端无审查状态机, 不展示任何示例结论); 保留真实 review 渲染能力供未来。 |
| `web/src/components/workspace/DeliveryPanel.tsx` | 适配可选 test/risk(无则不显示伪造徽章), 空 changedFiles 隐藏文件展开, 显示真实负责人; 空态文案明示。 |
| `web/src/index.css` | `.lane-fill`(假进度流光)→ `.lane-indeterminate`(不定态条), 并入 reduced-motion。 |

> **未改动**: `server/*`、`schema.prisma`、`dev.db`、`package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx`、`Rail.tsx`、`AgentRoster.tsx`、`ApprovalGate.tsx`、`CommandHeader.tsx`、`MissionBoard.tsx`、`ActivityFeed.tsx`、所有现有非工作台视图、所有 REST/WS payload。

## 3. 真实数据 → 结构映射(本轮核心)

| 结构 | 真实来源 | 当前真实呈现(实测数据) |
|------|----------|--------------------------|
| AI Team | 真实 `assistants` | 10 个真实助手, 角色由真实 skills/名称推断, 忙闲由任务/实时状态派生 |
| Mission Board | 真实 `tasks` | 8 Backlog + 1 进行中 + 0 已交付; Review 列空(后端无该状态, 诚实) |
| Task Breakdown | 真实 `tasks` 按 channel 分组 | 总目标 `#公司内部决策群` + 3 个真实子任务 |
| Parallel Execution | 真实 `doing` 任务不同负责人 | 当前 1 路(单个进行中任务)→ 不虚标「N 路并行」 |
| Activity / Audit | 真实任务更新 | 9 条真实任务事件 |
| Quality Review | 无真实源 | 诚实空状态 |
| Delivery Panel | 真实 `done` 任务 | 当前 0 个 → 诚实空状态 |
| Human Approval | 真实待确认交付 | 当前无 → 门控条隐藏 |
| Context Vault / 记忆 | 真实仓库文档 | 5 个真实 .md 入口 |

## 4. 没有新增任何假数据(对照完成条件)

- 未新增假人物 / 假 Agent / 假 mission / 假 delivery / 假 review / 假测试结果。
- 已有 mock **净减少**(整批删除), 仅保留真实文档指针。
- 本地测试 LLM 配置(model / baseURL / key)**未写入任何代码、前端或本报告**。

## 5. 现有功能保留

频道/私信/实时/Thread/Inbox/Tasks/Terminal、助手增删改、provider/baseURL/key/model 配置、AI skills/tool calling、停止生成、主题切换、身份切换、Rail 导航 —— 代码路径本轮未改动。

## 6. 验证

- `pnpm -C web exec tsc --noEmit` → PASS。
- `pnpm -C web build` → PASS(见 `BUILD_RESULT.md` 第 3 轮)。
- `pnpm -C server build` → FAIL(预先存在的 `@types/node`, 范围外)。
- 真实接口连通核验: `/api/users`(5)、`/api/assistants`(10)、`/api/tasks`(9) 均返回真实数据。
- 未做浏览器可视化回归(首屏需后端在线, 已确认后端在线且接口正常; 但未截图)。

## 7. 仍是 UI 表达 / 非真实 runtime(如实声明)

- Delivery「确认/打回」、Approval「确认/暂缓」为**本地 UI 状态**, 不落库、不触发后端。
- Quality Review 无真实审查流水线(诚实空状态)。
- Task Breakdown 的「依赖关系」「进度百分比」后端无真实数据, **不展示**(不伪造)。
- 真实多 Agent 并行 runtime / 自动拆解 / 自动审查 / 自动交付 —— 未实现(Phase 3/4)。

## 8. 风险与后续

- 当 DB 中无助手/任务时, 工作台多区为空状态(真实即如此)。
- 接真实后端: 补 review/approval 状态机与 API, 即可让 Quality Review / Delivery / Approval 全程真实。
- server build 修复需补 `@types/node`(改 lock, 交人工裁定)。

---

# DELIVERY — 第 4 轮(Full Delivery 完整版,真实工作流内核)

> 交付轮次: 第 4 轮(把第 3 轮的「真实数据驱动展示」升级为「真实持久化工作流」)
> 日期: 2026-05-25
> 性质: 在现有结构上小步增强, 新增后端真实模型/API + 前端接入。保留全部现有核心功能。

## 1. 本轮目标

落地 P0:真实 `Mission / Review / Delivery / AuditEvent / Context Docs` 模型与 API, 被 UI 真实使用;首页创建真实 Mission;Mission 显示真实任务拆解;Review/Delivery/Human Approval 持久化;Activity Feed 读真实 AuditEvent;Context Vault 读真实文档;去品牌残留与 stale mock;修复 server build。

## 2. 后端改动

| 文件 | 改动 |
|------|------|
| `server/prisma/schema.prisma` | 新增 `Mission / Review / Delivery / AuditEvent`(标量外键); `Task` 加 `missionId/priority/expectedOutput/reviewerId`。`db push` 增量迁移, 不丢数据 |
| `server/src/index.ts` | 新增 `writeAudit()` + `broadcastWorkspace()`;新增 missions / reviews / deliveries / audit-events / context-docs 路由;task 创建/状态变更写审计;终端命令(回车缓冲)写 `terminal.command`;助手回复用工具写 `ai.tool_call`;`node:fs` 加 `statSync/readFileSync` |
| `server/src/realtime.ts` | `ws` 类型改本地最小结构类型(连带 server build 修复) |
| `server/node_modules/@types/node` | vendored(server build 修复, 详见 BUILD_RESULT R4.2) |

## 3. 前端改动

| 文件 | 改动 |
|------|------|
| `web/src/lib/types.ts` | 加真实行类型 `MissionRow/MissionDetail/ReviewRow/DeliveryRow/AuditEventRow/ContextDoc` + `workspace` WS 事件;**删除** `Agent.isReal`、`Mission.source`、`ContextVaultItem/Kind`;`DeliveryStatus`/`ReviewVerdict` 对齐后端;`Task` 加可选工作流字段 |
| `web/src/lib/api.ts` | 加 missions/reviews/deliveries/auditEvents/contextDocs 方法;`createTask` 支持 missionId 等 |
| `web/src/lib/workspace.ts` | 全部改真实 mapper(`mapActivities/mapDeliveries/mapReviews/buildPlanFromTasks` 等), 删 mock 与 isReal/source |
| `web/src/lib/mockData.ts` | **删除**(stale mock 清理) |
| `web/src/App.tsx` | 加载 missions/reviews/deliveries/audit;WS `workspace`/`tasks` 刷新;`createMission/submitReview/createDelivery/decideDelivery/addMissionTask` 回调;传入 WorkspaceView |
| `web/src/components/workspace/WorkspaceView.tsx` | 编排真实数据 + Mission 选择 + 详情拉取 |
| `web/src/components/workspace/CommandHeader.tsx` | CTA 改为 Mission 目标输入(创建真实 Mission) |
| `web/src/components/workspace/MissionStrip.tsx` | 新增:真实 Mission 列表 + 选择 |
| `web/src/components/workspace/TaskBreakdown.tsx` | 选中 Mission 显示其真实子任务 + 内联加子任务;去伪造进度 |
| `web/src/components/workspace/QualityReview.tsx` | 真实 Review 渲染 + 提交表单(pass/needs_fix/blocked) |
| `web/src/components/workspace/DeliveryPanel.tsx` | 真实交付;approve/reject 落库;从已完成任务生成交付 |
| `web/src/components/workspace/ApprovalGate.tsx` | 真实待审批;approve/reject 经后端落库 |
| `web/src/components/workspace/ActivityFeed.tsx` | (数据源改真实 AuditEvent, 组件不变) |
| `web/src/components/workspace/ContextVault.tsx` | 读真实文档 + 搜索 + 打开全文 |
| `web/src/components/workspace/AgentRoster.tsx` | 去「示例」徽章, 改「无 key」可用性标记 |
| `web/src/components/workspace/MissionBoard.tsx` | 去 `source==='mock'` 示例分支 |
| `web/src/components/Rail.tsx` / `Sidebar.tsx` | 品牌 `Helio 内部版` → `Heliox · AI 工作台`;去「内部测试用」 |

## 4. 完成条件对照

| 条件 | 结论 | 证据 |
|------|------|------|
| Mission/Review/Delivery/AuditEvent/Context docs 真实模型或 API 存在且被 UI 使用 | ✅ | Prisma 模型 + 6 组 API + WorkspaceView 全接入 |
| 首页能创建真实 Mission | ✅ | CommandHeader 目标输入 → POST /api/missions(smoke 通过) |
| Mission 能显示真实任务拆解 | ✅ | 选中 Mission → GET /api/missions/:id → TaskBreakdown 渲染真实子任务;可加子任务 |
| Review/Delivery/Human Approval 持久化 | ✅ | POST /reviews、POST/PATCH /deliveries 落库;approvedById/approvedAt 持久(smoke 验证) |
| Activity Feed 来自真实 AuditEvent | ✅ | mapActivities(GET /api/audit-events) |
| Context Vault 可读真实文档 | ✅ | GET /api/context-docs(+ :id 全文 + ?q 搜索) |
| 无新增假数据, 现有核心功能不回归 | ✅ | 删 mockData;聊天/DM/Thread/Inbox/Tasks/Terminal/助手/配置/skills/stop/主题/身份 代码路径未破坏;smoke 全部清理 |
| web/server build 都通过 | ✅ | 见 BUILD_RESULT R4 |

## 5. 仍是占位 / 后续(如实)

- 交付物 artifact、测试结果、风险等级:后端字段已就位, 当前由人工/任务派生, 未接自动测试/CI。
- Planner/Reviewer Agent 自动拆解与自动审查:未做(Stage 2),当前为人工 + AI 聊天回复。
- AI `run_command` 的工具级 artifact、终端输出附加到任务:未做(P1)。
- `ai.tool_call` 审计按「助手回复用到的工具」记录一条, 非逐次工具调用粒度。
- Context Pack 绑定到 Mission(contextDocIds 字段已存在, UI 绑定交互未做)。
- 前端 code-splitting 未做(JS 833 kB)。
- server `@types/node` 以 vendored 形式存在(环境 pnpm store 限制), 见 BUILD_RESULT R4.2。
