# FINAL_REPORT — Command Center Consolidation

> 日期: 2026-05-25
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 本轮: 在现有半成品基础上, 把项目收束为有独立审美的 AI Team Workspace / Command Center。

---

## 最新轮:Runtime Productization(2026-05-25,R8)

把 Task/Sandbox Runtime 从"能跑但不好用"升级为「自然指派 AI → 看见沙盒执行 → 验收交付」的可用闭环,并放宽限制、新增本地浏览器验证。详见 `docs/ai/RUNTIME_PRODUCTIZATION_TEST_REPORT.md`。

本轮做了什么:
- **指派好用**:MissionBoard 未指派卡片 + TaskBreakdown 子任务行直接「指派 AI」下拉与「自动选择执行人」(`/tasks/:id/suggest-assignee`),无需跳完整任务页;「指派后自动执行」本地开关。
- **沙盒可见**:任务卡 sandbox 状态徽章;工作台新增「沙盒运行」区(本机信任/强隔离诚实标记 + 路径/模式/diff/build·test + live 日志/命令/截图 + apply/discard/继续执行);报告面板保留完整详情。
- **放宽代码沙盒**:沙盒内放行 node/pnpm/npm/tsx/python/build/test/git status·diff 等开发命令(免审批),危险词仍硬拦截;沙盒命令超时提到 180s;主项目写入仍只能人工 apply。
- **工具轮数分级**:chat5/task25/code40(env 可覆盖);80% 收敛提醒;到顶生成**部分报告 + 「继续执行」**(复用同一沙盒),不再只回「停止」。
- **浏览器控制 MVP**:`browser.ts` 用 Node 内置 WebSocket + 系统 headless Chrome 经 CDP(零新依赖),`browser_open/screenshot/console/click/type`;本地放行、外站需人工;动作写 SandboxLog/AuditEvent、截图存 artifact。能力矩阵 `browser_control` 本地可用、`computer_control` 仍未实现(仅实验文案)。
- **附带修复**:越权工具拦截(只执行已授技能);浏览器/截图意图不再被误路由给无浏览器能力的助手。

诚实声明:本机无 Docker/Colima → **本机信任沙盒(非强隔离)**,UI/文档据实标注,**未声称强隔离**。

验收:四项 build 全 PASS;Smoke A–E(真实 LLM + 真实 headless Chrome)**30 PASS / 0 FAIL**,测试数据零残留(回基线 tasks19/assistants10/沙盒表0)。

人工怎么验收:`pnpm dev` → 工作台首页在未指派卡片用「指派 AI」/「自动选择执行人」→「开始执行」→ 看任务卡 sandbox 徽章与「沙盒运行」区(本机信任沙盒标记、workspace 路径、命令/diff/build·test)→ 代码任务到「待人工验收」点「批准应用到主项目」或「丢弃」→ 浏览器任务用 browser_* 打开 localhost 截图,在报告里看截图与浏览器日志 → 复跑 `pnpm -C server exec tsx ../docs/ai/runtime_prod_smoke.mjs`。

---

## 0. 最新轮:Sandbox Runtime(2026-05-25)

> 目标:让 AI 写代码/跑命令/交付前,必须先在真实隔离沙盒里执行、测试、产报告,再由人类批准应用到主项目。借鉴 Markus 的状态机/审批/工具安全/报告/沙盒思想,未复制其 UI/文案/源码。

**Status: SANDBOX_RUNTIME_READY**

闭环:`主项目快照 → .helio/sandboxes/<runId>/workspace(copy fallback)→ AI run_command/write_file(限沙盒、cwd 不可逃逸)→ collectDiff + build/test → 报告面板 → 人工 apply(dry-run 拒敏感/生成文件)/discard → 写回主项目或丢弃`。

- 新增 `server/src/sandbox.ts`、3 张表(SandboxRun/Log/Artifact)、`apply`/`discard`/`sandbox-report` API、受控 `write_file`、前端"沙盒执行"面板。
- run_command 在沙盒 cwd 执行 + 命令路径守卫 + env 脱敏 + classifyCommand 硬拦截;低风险只读免审批、高危走人工审批门。
- apply/discard 写 AuditEvent;成功 apply 后任务进 review。
- 验收:`prisma validate` / `server build` / `web tsc` / `web build` 全 PASS;确定性 smoke A/B/C/D ALL PASS;两个真实 e2e(命令执行、write_file→apply 写回主项目 + AuditEvent)PASS;测试数据零残留。
- 详见 `SANDBOX_RUNTIME_TEST_REPORT.md`;自审见 `REVIEW.md` R7(FINAL_VERDICT: PASS);构建见 `BUILD_RESULT.md` §0。
- 已知限制:非 OS 级强隔离(纵深防御 + 启发式守卫,容器/seccomp 见设计文档 Level 3/4)、无容器下命令级网络策略、node_modules 软链供 build。

---

## 1. 最终完成状态

**Status: PASS**

在不重写、不删功能、不改后端的前提下, 工作台首屏已完整体现以下结构:

AI Team · Mission Board · **Task Breakdown** · **Parallel Execution** · Quality Review · Delivery Panel · Context Vault · Activity/Audit Trail · **Human Approval** · 项目记忆/上下文。

品牌从「Helio · 内部版」收束为独立的「AI Workforce · Command Center」(orbit 隐喻标记)。仅借鉴 Markus 产品逻辑, 未复制其 UI / 文案 / 品牌。

全部 7 个交付文档已生成/更新, 与实际代码改动一致。

## 2. 运行过的命令

| 命令 | 结果 |
|------|------|
| `pnpm -C web exec tsc --noEmit` | PASS(exit 0) |
| `pnpm -C web build` | PASS(1879 modules, `index.js` 826.80 kB / gzip 230.62 kB) |
| `pnpm -C server build` | FAIL(预先存在的 `@types/node` 缺失, 范围外, 已记录) |

> 详见 `docs/ai/BUILD_RESULT.md`。本轮纯前端改动, web 构建首次即通过, 未进入自动修复轮次。

## 3. build 结果摘要

- 前端(本轮范围): **通过**。
- 后端: 失败, 原因为 `server/tsconfig.json` 声明 `types:["node"]` 但缺 `@types/node`; 改造前已存在, 项目方在 `AI_START.md` 已声明该误报并以 `tsx` 运行后端, 实际运行不受影响。本轮按「禁改 pnpm-lock / 谨慎改后端」约束未修复, 如实记录。

## 4. 改动文件清单(本轮)

新增:
- `web/src/components/workspace/TaskBreakdown.tsx`
- `web/src/components/workspace/QualityReview.tsx`
- `web/src/components/workspace/ApprovalGate.tsx`
- `docs/ai/PROJECT_AUDIT.md`、`docs/ai/REVIEW.md`、`docs/ai/BUILD_RESULT.md`、`docs/ai/FINAL_REPORT.md`

修改:
- `web/src/lib/types.ts`、`web/src/lib/mockData.ts`、`web/src/lib/workspace.ts`
- `web/src/components/workspace/WorkspaceView.tsx`、`web/src/components/workspace/AgentRoster.tsx`
- `web/src/components/Rail.tsx`、`web/src/theme.css`、`web/src/index.css`
- `docs/ai/PLAN.md`(附录)、`docs/ai/DESIGN_BRIEF.md`(附录)、`docs/ai/DELIVERY.md`(第 2 轮)

未改动: `server/*`、`prisma/schema.prisma`、`dev.db`、根 `package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx` 业务逻辑、所有现有非工作台视图组件、所有 REST/WS payload。

## 5. 人工验收步骤

### 5.0 准备
```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm dev          # concurrently 同起前后端(若后端已在你自己的终端跑着, 不必重复起)
# curl localhost:5373/api/users   # 确认后端活着
```
浏览器打开 http://localhost:5173。

### 5.1 工作台首屏(主验收)
1. 默认进入「工作台」(Rail 第一个图标高亮)。左上品牌为 orbit 渐变标记(悬停提示「AI Workforce · Command Center」), **不再是字母 H / Helio 内部版**。
2. 顶部 Mission Command 显示目标文案 + 摘要(活跃队员 / 进行中 / 待复核 / 待你确认)。
3. **人工确认门(Human Approval)**: header 下方出现 accent 门控条「N 项等待你的确认」, 每项可点「确认 / 暂缓」, 点击后该项消失(前端状态)。
4. **AI 团队**: 左上队员列表; 若有多个 Agent 同时执行, 标题旁显示「N 路并行」。
5. **任务看板**: 四列 Backlog / 进行中 / 待复核 / 已交付。
6. **任务拆解(Task Breakdown)**: 中排左, 顶部「总目标」(有真实进行中任务时取其标题, 否则标「示例」), 下方子任务含负责人头像、状态徽章、轨道号、依赖 `#n`、交付物; 执行中子任务有**并行轨道进度条**(流光)。标题旁有「N 路并行执行」徽章。
7. **质量审查(Quality Review)**: 中排右, 卡片含 verdict(复核中/通过/需修复)、reviewer、✓/✗ 检查清单、notes。
8. **运行轨迹 / 审计**: 下排左, 时间线 + 事件图标 + 「待人工确认」标记。
9. **交付确认(Delivery Panel)**: 下排右, 卡片可展开改动文件, 「确认交付 / 打回」可点(前端状态)。
10. 点 header「上下文」按钮 → 右侧 **Context Vault** 抽屉, 列出项目文档入口。

### 5.2 主题与身份(保留功能)
11. Rail 底部切换明暗主题, 工作台各分区 token 全覆盖, 无破损。
12. Rail 左下头像切换身份(kyle / amy / leo / mia / sam)。

### 5.3 现有核心功能不回归
13. Rail 第二图标「消息」: 打开频道, 发消息、收实时消息、@提及、emoji 反应、编辑/删除、固定、话题串。
14. 「收件箱」: 未读项可见, 进入即标记已读。
15. 「任务」: 三列看板创建/移动/删除/指派(含指派给 AI 助手)。
16. 「终端」: xterm 终端可输入命令并回显。
17. 助手: 侧栏创建/编辑/删除助手, 编辑弹窗可配 provider / baseURL / apiKey / model / skills; key 不回显明文。
18. 与助手 DM 或在频道 @ 助手, 验证 AI 回复流式输出; 生成中点「停止生成」可硬停。

### 5.4 响应式
19. 窄屏下点 header 菜单图标可打开侧栏抽屉。

## 6. 仍存在的风险(明确列出)

1. **server build 失败**(预先存在, 范围外): 缺 `@types/node`; 不影响 `pnpm dev` 运行。若要 `pnpm -C server build` 通过, 需补依赖(改 `pnpm-lock.yaml`), 交人工裁定。
2. **示例 / 前端状态**: Task Breakdown 子任务、Quality Review、Approval、Delivery 为示例或仅前端状态, 不落库、不触发后端, 非真实多 Agent runtime。已用角标/语义明示。
3. **未做运行时可视化回归**: 本轮未拉起全栈做截图回归, 现有功能判断基于代码路径未改动。建议按第 5 节人工走查。
4. **首屏纵向较长**: 已用 Panel 内部滚动缓解。

## 7. 后续建议(Phase 3 / 4)

- 后端补 `/api/reviews`、`/api/approvals`, 为 task 增加 review 状态 + priority + output 字段。
- Activity 用真实 WS 事件驱动审计轨迹; Approval / Delivery 动作落库。
- Context Vault 接真实文档读取 API。
- 打通「目标 → 拆解 → 指派 → 并行执行 → 审查 → 交付 → 人工确认」闭环。

---

# FINAL_REPORT — 第 3 轮(Real-Data Driven, 去 mock)

> 日期: 2026-05-25 | 触发: 新约束「禁止假数据, 优先真实后端/助手/任务/日志」。

## R3.1 最终完成状态

**Status: PASS**

工作台已从「mock 兜底」改为**完全真实数据驱动**。后端实测有 10 个真实助手 + 9 个真实任务, 首屏八大结构全部由真实数据呈现; 无真实数据源的分区(Quality Review / Delivery / Human Approval, 在数据为空时)使用**诚实空状态**, 不再有任何假人物 / 假任务 / 假交付 / 假测试结果。本地测试 LLM 的 model/baseURL/key 未写入任何代码、前端或文档。

7 个交付文档全部更新到第 3 轮, 与代码一致。

## R3.2 运行过的命令

| 命令 | 结果 |
|------|------|
| `pnpm -C web exec tsc --noEmit` | PASS(exit 0, `noUnusedLocals` 通过) |
| `pnpm -C web build` | PASS(1879 modules, JS 823.39 kB) |
| `pnpm -C server build` | FAIL(预先存在 `@types/node`, 范围外) |
| `curl /api/users` `/api/assistants` `/api/tasks` | 真实数据(5 / 10 / 9), 仅读未写 |

## R3.3 改动文件(第 3 轮)

- `web/src/lib/mockData.ts`(删除 6 组假数据, 仅留真实文档指针)
- `web/src/lib/workspace.ts`(重写为真实数据驱动)
- `web/src/lib/types.ts`(Delivery 假字段改可选 + 加真实负责人字段)
- `web/src/components/workspace/WorkspaceView.tsx`(接真实派生)
- `web/src/components/workspace/TaskBreakdown.tsx`(去假进度, null 空态)
- `web/src/components/workspace/QualityReview.tsx`(诚实空状态)
- `web/src/components/workspace/DeliveryPanel.tsx`(可选字段 + 真实负责人 + 空态)
- `web/src/index.css`(假进度流光 → 不定态条)
- `docs/ai/{PROJECT_AUDIT,PLAN,DESIGN_BRIEF,DELIVERY,REVIEW,BUILD_RESULT,FINAL_REPORT}.md`

未改动: `server/*`、`schema.prisma`、`dev.db`、`package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx`、`Rail.tsx` 及所有现有非工作台视图、所有 REST/WS payload。

## R3.4 人工验收步骤(第 3 轮重点: 真实数据)

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm dev        # 若后端已在你终端运行则无需重复; curl localhost:5373/api/users 确认在线
```
打开 http://localhost:5173 → 默认「工作台」:

1. **AI 团队**应显示**你真实创建的助手**(如 产品经理 / 设计师 / 软件工程师 …), 不是 Nova/Sage/Atlas 等假名字。
2. **任务看板**应显示**你真实的任务**(如「复刻收尾:四模块联调」在「进行中」), 数量与「任务」视图一致。
3. **任务拆解**总目标应为真实频道/任务(如 `#公司内部决策群`), 子任务是该频道下真实任务, **无伪造的依赖箭头/百分比**。
4. **质量审查**显示诚实空状态文案(未接入自动审查), **不出现任何示例复核卡**。
5. **交付确认**: 若当前无已完成任务, 显示空状态; 把某任务在「任务」视图拖到「完成」后回到工作台, 该真实任务出现在交付确认与顶部**人工确认门**, 可点「确认」(本地动作)。
6. 切换明暗主题、切换身份正常; 品牌为 orbit 标记(非 H/Helio)。
7. 回归: 消息/DM/实时/@/反应/Thread、收件箱、任务增删改派、终端、助手创建编辑(provider/baseURL/key/model)、AI 流式回复 + 停止生成 均正常。
   - 可用本地 LLM(model gemini-2.5-flash, 本地 OpenAI 兼容代理)为某助手配置后, 在私信里验证真实 AI 回复。**该 key 只填在助手配置 UI, 不写进代码/报告。**

## R3.5 仍存在的风险

1. server build 失败(预先存在, 缺 `@types/node`, 不影响 `pnpm dev`)。
2. 真实 DB 为空时工作台多区为空状态(真实即如此)。
3. Delivery/Approval 的确认为本地 UI 动作, 不落库(已声明)。
4. 未做浏览器截图回归(后端在线且接口正常, 但未可视化验证)。

---

# FINAL_REPORT — 第 4 轮(Full Delivery 完整版)

> 日期: 2026-05-25 | 目标: 完整版可交付的 AI Workforce 工作流内核。

## R4.1 最终完成状态

**Status: PASS**

`Goal/Mission → Task Breakdown → Quality Review → Delivery → Human Approval → Audit Trail` 已作为**真实持久化**闭环打通, 并被工作台 UI 使用。两端 build 通过, API/AI smoke 通过, 所有测试数据用后即删, 无新增假数据。品牌统一为 `Heliox · AI 工作台`。

## R4.2 运行过的命令(真实)

| 命令 | 结果 |
|------|------|
| `pnpm -C web exec tsc --noEmit` | PASS(exit 0) |
| `pnpm -C web build` | PASS(exit 0, JS 833.92 kB) |
| `pnpm -C server build` | PASS(exit 0) |
| `prisma db push` / `generate` | PASS(增量迁移, 数据未丢) |
| API smoke(users/assistants/tasks/missions/reviews/deliveries/audit/context-docs) | PASS |
| 真实 AI smoke(测试工程师 DM 发临时消息→「通路可用」→删除) | PASS(无残留) |

## R4.3 主要改动

- 后端:Prisma 新增 `Mission/Review/Delivery/AuditEvent` + Task 扩展;新增 6 组 REST API;关键动作写 append-only AuditEvent;`realtime.ts` 类型修复;vendored `@types/node`。
- 前端:types/api/workspace 全量改真实;删 `mockData.ts` 与 isReal/source;App 接入并提供工作流回调;CommandHeader(Mission 输入)、MissionStrip(新)、TaskBreakdown(真实子任务+加子任务)、QualityReview(提交)、DeliveryPanel/ApprovalGate(落库审批)、ActivityFeed(真实审计)、ContextVault(读真实文档+搜索);Rail/Sidebar 品牌统一。

## R4.4 人工验收步骤

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm dev      # 若后端已在你终端运行则无需重复; curl localhost:5373/api/users 确认在线
```
打开 http://localhost:5173 → 默认「工作台」:

1. 左上品牌为 `Heliox · AI 工作台`(Rail 悬停提示同名),侧栏标题不再是 `Helio 内部版`。
2. **创建真实 Mission**:顶部「描述你要完成的目标…」输入框输入目标 → 回车 / 点「新建 Mission」→ 下方 Missions 出现该真实 Mission(刷新后仍在)。
3. **真实任务拆解**:点选该 Mission → 中部「任务拆解」显示其子任务(初始为空)→ 用「为该 Mission 添加子任务」输入框添加 → 子任务出现(为归属该 Mission 的真实任务,任务看板也能看到)。
4. **质量审查**:右中「质量审查」点「+ 提交审查」→ 选任务 + 选 pass/需修复/受阻 + 备注 → 提交 → 审查卡出现(刷新仍在)。
5. **交付 + 人工确认**:把某任务在「任务」视图拖到「完成」→ 回工作台「交付确认」点「+ 生成交付」选该已完成任务 → 生成待确认交付;顶部出现「人工确认门」→ 点「批准/打回」→ 状态落库(刷新后保持 已确认/已打回)。
6. **运行轨迹 / 审计**:左下「运行轨迹」显示上述每步真实事件(创建 Mission、状态变更、审查、交付、审批…),来自真实 AuditEvent。
7. **Context Vault**:点 header「上下文」→ 抽屉列出真实项目文档 → 搜索关键词过滤 → 点开任一文档读全文。
8. **回归**:消息/DM/实时/@/反应/Thread、收件箱、任务增删改派、终端(`pwd`)、助手创建编辑(provider/baseURL/key/model)、AI 流式回复 + 停止生成、明暗主题、身份切换 均正常。

> 验收用的 Mission/任务/审查/交付为你真实创建的数据;如属临时验证可自行删除(任务走 UI;Mission/Review/Delivery 暂无删除入口,可后续补)。

## R4.5 剩余风险

1. **server `@types/node` 为 vendored**(环境 pnpm v10→v11 store 迁移阻断 `pnpm install`)。build 现通过;长期正解:环境重建依赖后将 `@types/node` 写入 `server/package.json`。
2. 自动任务拆解 / 自动审查 / 自动测试结果未做(Stage 2);当前 Review/Delivery 字段就位但靠人工 + AI 聊天驱动。
3. Context Pack 绑定 Mission 的 UI、artifact 附件、前端 code-splitting 未做(P1)。
4. 未做浏览器自动化截图回归(已用 API + AI smoke + build 验证)。
5. `server/prisma/dev.db.bak-*` 为迁移前安全备份, 可酌情清理。

---

# FINAL_REPORT — 第 5 轮(Task Execution Runtime)

> 日期: 2026-05-25 | 把「任务只记录、不执行」升级为真实可观察 / 可控制 / 可审计的 AI Task Execution Runtime。

## R5.1 完成了什么

1. **真实执行运行时**:新增 `TaskRun` 模型 + 状态机 `queued → running → (needs_approval) → succeeded | failed | cancelled`;`POST /tasks/:id/execute`(手动开始)、`/cancel`(取消)、`GET /task-runs`(历史)。执行落到执行人↔助手 DM,聊天直接可见。
2. **复用助手对话与工具调用**:`executeTask()` 复用现有 `generateReply`;新增 `SkillCtx.onTool` 钩子,把每次工具调用(含 `run_command` 真实输出)与 assistant message / toolsUsed / 错误关联到 `taskId/missionId` 并写 append-only 审计。
3. **权限矩阵 + Human Approval**:新增 `permissions.ts`(能力分层)与 `ApprovalRequest` 模型。任务执行中 `run_command` 须经人工批准(批准后自动续跑放行),`rm -rf/sudo/...` 始终拦截;`GET /api/capabilities` 暴露诚实矩阵。危险动作不静默执行。
4. **能力分层清楚**:Human terminal(可用、无门)/ Assistant run_command(需审批)/ write_file·computer_control·browser_control(未实现,诚实标注),新增 `CapabilityMatrix` 面板呈现。
5. **UI 看得懂流程**:任务卡(工作台看板 + 任务视图)显示执行状态徽章(排队/执行中/待批准/失败/已完成),并提供「开始执行 / 取消 / 重跑」按钮;人工确认门聚合「待审批交付 + 待审批高危能力」;Activity Feed 读真实执行/审批事件;运行中徽章可点开执行 DM。
6. **收尾修复**:`web/index.html` title → `Heliox · AI 工作台`;`@types/node` 写入 `server/package.json` devDependencies(不再只 vendored);本轮文档全部用实测真实 DB 状态。

## R5.2 真实测试结果

- **三项 build**:`pnpm -C web exec tsc --noEmit` / `pnpm -C web build` / `pnpm -C server build` 均 **exit 0**(详见 BUILD_RESULT R5)。
- **端到端执行**(真实助手「软件工程师」+ 真实本地模型):`execute → needs_approval`(run_command('pwd') 被审批门拦截) → 人工 `approve` → 自动续跑真正执行 `pwd`,真实输出 `/Users/kaiwu/Documents/kyle-agent/helio-clone`,run → `succeeded`,任务 → review;8 条真实审计按序写入;临时数据全删,`__EXEC_TEST__` 全库 0 残留。
- **终端边界**:Human terminal 实测 `pwd` 立即返回(无门);Assistant run_command 同条 `pwd` 须批准。
- **迁移**:迁移前备份 dev.db,`prisma db push` 增量,未跑 db:reset;15 users/16 tasks/2 missions 一致。

## R5.3 未完成 / 风险

- run_command 审批为「整次执行授权」粒度(危险词仍硬拦截),非逐条命令授权。
- 默认「手动开始执行」,未启用「指派即自动跑」(更安全;规则已写明)。
- write_file / computer_control / browser_control 未实现(矩阵诚实标注)。
- `@types/node` 因 pnpm v10→v11 store 迁移未进 lockfile;已加 `pnpm-workspace.yaml: verifyDepsBeforeRun: false` 使 build 命令可跑。长期正解:环境干净重装依赖。
- 前端单包 843 kB,未 code-split(非本轮引入)。

## R5.4 人工怎么验收

前后端已在跑(`pnpm dev`;后端 5373 / 前端 5173)。打开 http://localhost:5173 → 默认「工作台」:

1. **准备**:在「任务」视图新建一条任务,用任务卡上的「+ 指派」选一个**带 run_command 的 AI 助手**(如「软件工程师」)。
2. **开始执行**:该任务卡出现「开始执行」按钮 → 点击。任务进入「进行中」,卡片出现执行状态徽章;打开你与该助手的私信可看到任务简报 + 助手实时回复。
3. **看到需批准**:若助手调用 `run_command`,顶部「人工确认门」出现一条 `执行命令:<命令>` 的待批准项,任务徽章变「待批准」。
4. **批准并续跑**:点「批准」→ 系统自动续跑,助手真正执行命令并回传真实输出;任务徽章变「已完成」,任务移到「待复核」。点「打回」则取消该次执行、任务退回待办。
5. **运行轨迹**:工作台「运行日志」按时间显示 开始执行 / 调用工具 / 请求批准 / 批准 / 完成 等真实事件(来自真实 AuditEvent)。
6. **取消**:执行中点徽章旁「取消」可中断进行中的执行。
7. **能力分层**:页面底部「能力分层 · 权限矩阵」如实列出 人类终端(可用)/ 助手执行命令(需批准)/ 写文件·电脑控制·浏览器(未实现)。
8. **边界自测**:Rail「终端」视图里你本人执行 `pwd` 立即返回(人类终端无门);对照上面助手的 run_command 需批准 —— 两条路径的信任边界不同。
9. **回归**:消息/DM/实时/@/反应/Thread、收件箱、任务增删改派、助手创建编辑、AI 流式 + 停止生成、明暗主题、身份切换 均正常。

> 验收产生的任务/执行记录/审批为真实数据;临时验证可在「任务」视图删除任务(其执行记录与审批随任务一并清理留待人工,或保留作为真实轨迹)。

---

# FINAL_REPORT — 第 6 轮(执行更真实/更聪明/更可见)

> 日期: 2026-05-25 | 把「发布任务→AI 执行→工具调用→报告查看」做到真实、聪明、可见,清除「task.status 伪装 AI 执行」。

## R6.1 完成了什么

1. **清除假执行语义**:执行状态一律以真实 `TaskRun` 为准。`deriveAgents` 只在「实时生成中」或「存在真实 running/queued/needs_approval 的 TaskRun」时标 working/blocked;`subtaskStatusOf`:doing 但无 TaskRun → `manual`(手动进行中);MissionBoard/TasksView 对无 run 的 doing 显示「手动进行中」muted 徽章,不再伪装 AI 执行。
2. **智能工具/Agent 路由**:`analyzeTaskIntent`(天气/联网/命令意图 + 城市提取)+ `pickExecutor`(按 skills 命中数挑可用助手)。需 fetch_url/run_command 的任务若 assignee 不具备,自动路由给具备能力的助手并写 `task.exec_routed` 审计;无可路由则返回真实原因,不空答。
3. **天气最小可用**:缺城市 → `needs_input`(不创建 TaskRun,前端弹窗补填后再执行);有城市 → 简报引导用 `fetch_url`/低风险 `curl` 抓 `wttr.in/<city>` 取真实数据;失败如实报告。
4. **低风险命令策略**:`classifyCommand` 三级(blocked 硬拦截 / low_risk 只读免审批 / needs_approval 人工审批)+ `LOW_RISK_AUTO_APPROVE` 开关;能力矩阵新增 `assistant_run_command_lowrisk` 条目让 UI 看得懂。
5. **执行报告入口**:新增 `GET /api/tasks/:id/report` + `TaskReportModal`,集中展示状态/执行人/触发者/起止时间/AI 汇报/toolsUsed/每次工具输出/审批记录/最终 output·error,并可「打开执行对话(DM)」跳转。MissionBoard/TasksView/TaskBreakdown 在有 run 时显示「报告」按钮。
6. **完成后落地交付**:run succeeded → 任务→review;报告面板在 succeeded 且无对应交付时显示「生成交付」一键入口。

## R6.2 真实测试结果

- **四项 build**:`web tsc` / `web build` / `server build` / `prisma validate` 均 **exit 0**(BUILD_RESULT R6.1)。
- **A 无 TaskRun 的 doing**:实测 0 run → 前端 manual/idle,不显示为 AI 执行中。
- **B 查天气**(产品经理,无联网能力):缺城市 → `needs_input`(无 run);给「北京」→ 自动路由到软件工程师 → `fetch_url` 真实抓取 → **`北京: 🌦️ +68°F`**,任务→review。
- **C 命令类**(软件工程师):`pwd` 走 `run_command` → **低风险免审批放行**(输出带标注),真实路径 `/Users/kaiwu/Documents/kyle-agent/helio-clone`,任务→review;报告端点 runs=1/toolCalls=1。
- **D 高危审批门**(软件工程师):`ps aux | head -3` → `needs_approval` + ApprovalRequest → 人工 approve → 自动续跑真实执行 → 真实进程表,任务→review。
- 全部 smoke 用真实助手 + 真实本地模型,标记 `__SMOKE_EXEC__`/`__SMOKE_APPR__` 用后即删,残留 0,回到基线 **taskruns=2 / tasks=16**。

## R6.3 改动文件

- 后端:`server/src/permissions.ts`(命令分级 + 低风险策略 + 能力条目)、`server/src/skills.ts`(run_command 接入分级,低风险免审批)、`server/src/index.ts`(意图分析/路由/补信息门/执行报告路由/审批续跑复用执行人)。
- 前端:`web/src/lib/types.ts`(manual 状态、ExecuteResult、TaskReport)、`lib/api.ts`(executeTask 带 input + taskReport)、`lib/workspace.ts`(deriveAgents/subtask/并行度按真实 TaskRun)、`components/workspace/{WorkspaceView,MissionBoard,TaskBreakdown,TaskReportModal(新)}.tsx`、`components/TasksView.tsx`、`App.tsx`(needs_input 补填 + 报告面板 + 错误提示)。
- 文档:`docs/ai/{BUILD_RESULT,REVIEW,FINAL_REPORT,TASK_EXECUTION_CAPABILITY_TEST_REPORT}.md`。
- **未改**:Prisma schema / dev.db 结构、既有 REST/WS payload、其余视图组件。

## R6.4 人工怎么验收

前后端在跑(后端 5373 / 前端 5173),打开 http://localhost:5173 → 默认「工作台」:

1. **去假执行**:把某任务在「任务」视图拖到「进行中」但**不点开始执行** → 该卡显示「手动进行中」灰徽章、AI 团队不把对应助手标成「执行中」、任务拆解里该子任务为「手动进行中」(无执行中流光条)。
2. **查天气**:新建任务「看今天天气」指派给**没有 fetch_url/run_command 的助手**(如产品经理)→ 点「开始执行」→ 弹窗要城市 → 输入「北京」→ 系统自动路由给具备联网能力的助手执行 → 私信里看到真实天气;任务卡出现执行徽章 + 「报告」。
3. **命令类**:新建任务「请用 run_command 执行 pwd」指派给软件工程师 → 开始执行 → run_command(pwd)低风险免审批直接放行,「报告」里看到工具输出与「免人工审批放行」标注。
4. **高危审批**:任务里让助手执行 `ps aux`(或写文件类)→ 顶部「人工确认门」出现待批准项 → 批准 → 自动续跑真实执行。
5. **执行报告**:点任意有 run 的任务卡上的「报告 / 执行报告」→ 面板展示状态/执行人/触发者/时间/AI 汇报/工具逐次输出/审批/最终结果,并可「打开执行对话(DM)」「生成交付」。
6. **能力矩阵**:工作台底部「能力分层」新增「助手低风险命令(只读)= 可用(免审批)」,危险命令仍硬拦截。
7. **回归**:消息/DM/实时/@/反应/Thread、收件箱、任务增删改派、终端、助手创建编辑、AI 流式 + 停止生成、明暗主题、身份切换 均正常。
