# Task Execution Capability Test Report

日期: 2026-05-25
项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
测试目标: 验证“发布任务后 AI 是否会自动执行”,以及助手是否具备终端、写代码、电脑控制能力。

> **状态更新(第 5 轮交付后)**: 下文第 1–8 节为**改造前**的诊断(说明缺口);第 5 轮已实现真实
> Task Execution Runtime 并端到端实测通过,**改造后**的实现与实测结果见本文件末尾「第 9 节 · 改造后实测」。

## 1. 结论(改造前诊断)

当前系统已经有真实 Mission / Task / Review / Delivery / Audit 持久化,但还没有真正的 Task Execution Runtime。

也就是说:

- 发布 Mission 只会创建 Mission,不会自动拆解、不会自动派给 Agent 执行。
- 发布 Task 只会创建 Task,即使指派给 AI 助手,也不会自动触发聊天、工具调用、终端命令或代码修改。
- 任务状态目前主要由用户手动移动;状态变化会写 AuditEvent,但不是 Agent 自己推进。
- 人类用户可以打开内置终端并执行命令。
- 具备 `run_command` skill 的助手可以在聊天里被明确要求调用 shell 命令,但这个能力没有和 Task/Mission 自动执行绑定。
- 没有发现应用内“控制电脑桌面/截图/点击/浏览器自动化”的能力。

## 2. 用户反馈对应验证

用户反馈: “发布任务的时候,并没有人执行我的任务,或者我没看到。检查天气是我发的。”

当前数据库状态显示:

- Mission: `检查一下今天天气`
- Task: `看今天天气`
- Task 状态: `doing`
- 指派对象: `产品经理`(AI assistant)
- AuditEvent 只有:
  - `task.created`
  - `task.status_changed`
- 这两个 AuditEvent 的 actor 都是 Kyle,不是 AI 助手。

判断: 该任务不是 AI 自动执行到 `doing`,而是用户侧状态变更。没有看到该任务关联的助手消息、工具调用、终端命令或交付物。

## 3. 发布/指派任务测试

测试动作:

1. 创建临时任务,标题含 `__TASKFLOW_TEST__`。
2. 指派给真实助手 `软件工程师`。
3. 等待 15 秒。
4. 查询 Task、Message、AuditEvent、terminal.command。
5. 清理临时测试任务与审计记录。

测试结果:

- 任务仍为 `todo`。
- 只产生 `task.created` 审计。
- 没有新助手消息。
- 没有 `terminal.command`。
- 没有 `ai.tool_call`。
- 测试数据已清理,残留为 0。

结论: Task 指派给 AI 后不会自动执行。

## 4. 终端能力测试

测试动作:

- 连接 `/ws/terminal?userId=<Kyle>`。
- 执行 `echo __TERMINAL_TEST__ && pwd`。
- 检查输出与 `terminal.command` 审计。
- 删除测试审计。

测试结果:

- 终端输出包含项目路径 `/Users/kaiwu/Documents/kyle-agent/helio-clone`。
- 产生 `terminal.command` 审计。
- 测试审计已清理。

结论: 人类用户的内置终端能力真实可用。

## 5. 助手 run_command 能力测试

测试对象:

- 助手: `软件工程师`
- 模型: `gpt-5.3-codex`
- provider: `custom`
- skills 包含 `run_command`

测试动作:

1. 打开与 `软件工程师` 的 DM。
2. 发送临时消息: 要求必须调用 `run_command` 执行 `pwd`。
3. 等待助手回复。
4. 检查 reply 的 `toolsUsed` 和 `ai.tool_call` 审计。
5. 删除临时用户消息、助手消息和测试审计。

测试结果:

- 助手回复: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
- `toolsUsed`: `["run_command"]`
- `AuditEvent`: `软件工程师 调用工具:run_command`
- 测试消息和审计已清理。

结论: 助手可以在聊天路径中调用 shell 命令,但不会因为被指派 Task 自动调用。

## 6. 写代码/控制电脑能力判断

代码层能力:

- `run_command` 可执行 shell 命令,工作目录限定在项目根。
- 有简单危险命令拦截: `rm -rf`, `sudo`, `shutdown`, `reboot` 等。
- 没有专门的 `write_file` / `apply_patch` 工具。
- 但 shell 命令理论上可以通过重定向或脚本写文件,因此“写代码能力”是间接存在的,需要权限和审批治理。

电脑控制能力:

- 未发现 screenshot / mouse / keyboard / browser automation / desktop control 相关后端 API 或 assistant skill。
- 当前不能认为 AI 助手具备“控制电脑”的能力。

## 7. 已发布给 Claude 的真实 Mission / Tasks

Mission:

- id: `cmpky1qbh003cnvd0pss5blwe`
- title: `【交给 Claude】打通 AI 任务自动执行与权限闭环`

子任务:

1. `cmpky1qbp003fnvd0kd3kx33s`  
   `【P0】实现 Task/Mission 自动执行器: 指派给 AI 后进入 queued/running, 触发对应助手执行, 并把结果回写任务状态`

2. `cmpky1qc4003invd0b8hnwd49`  
   `【P0】把任务执行与聊天/工具调用打通: 记录 assistant message、toolsUsed、run_command 输出、执行日志, 并关联到 taskId/missionId`

3. `cmpky1qcf003lnvd0orfmokye`  
   `【P0】设计权限与人工确认: run_command/写文件/浏览器或电脑控制等高危能力必须有角色权限和 Human Approval`

4. `cmpky1qcj003onvd04nib3kjo`  
   `【P1】补足 UI 可观察性: 任务卡显示执行中/等待审批/失败/已交付, Activity Feed 展示真实执行轨迹`

5. `cmpky1qco003rnvd0hu439ss1`  
   `【P1】补自动化验收: 任务发布后触发执行、run_command 工具调用、审批持久化、临时数据清理`

6. `cmpky1qcs003unvd0169md36o`  
   `【P1】修交付稳定性收尾: web title Helio 残留、@types/node 依赖声明、报告数据状态与数据库一致`

发布后等待 10 秒复查: 这些任务仍为 `todo`,没有助手消息。这再次证明当前系统没有自动执行器。

## 8. Claude 下一轮应完成的最小目标

Claude 不应继续只做 UI 表达,而应实现真实运行闭环:

1. Task/Mission execution runtime。
2. Task assigned to AI 后可以进入 queued/running。
3. 执行时创建或复用 assistant DM/channel message。
4. 工具调用和输出必须关联 taskId / missionId。
5. Activity Feed 显示真实 execution events。
6. 高危工具能力必须有权限和 Human Approval。
7. 明确区分:
   - Human terminal
   - Assistant run_command
   - Future computer/browser control
8. build 与真实 smoke test 必须通过。


---

## 9. 改造后实测(第 5 轮 · Task Execution Runtime 已落地)

日期: 2026-05-25。本节为**改造后**真实实现 + 端到端实测,推翻第 1–8 节的「不会执行」结论。

### 9.1 实现了什么(真实持久化,不造假)

- **执行运行时**: 新增 `TaskRun` 模型 + 状态机 `queued → running → (needs_approval) → succeeded | failed | cancelled`。
- **手动开始执行**: `POST /api/tasks/:id/execute`(指派给 AI 的任务,任务卡出现「开始执行」按钮);`POST /api/tasks/:id/cancel` 取消;`GET /api/task-runs` 查执行历史。执行落到「执行人 ↔ 助手」的 DM,聊天里可直接看到对话。
- **复用既有能力**: `executeTask()` 直接调用现有 `generateReply`(对话 + 工具循环)。新增 `SkillCtx.onTool` 钩子,把每次工具调用(含 `run_command` 真实输出)写成带 `taskId/missionId` 的 `ai.tool_call` 审计;`TaskRun` 存 `messageId / toolsUsed / output / error`。
- **权限矩阵 + 人工审批**: 新增 `permissions.ts`(能力分层)与 `ApprovalRequest` 模型。任务执行中 `run_command` 属高危能力,未授权则创建审批请求并把执行挂起为 `needs_approval`;`rm -rf / sudo / shutdown …` 始终拦截。人工批准后后端**自动续跑**并放行该能力。`GET /api/capabilities` 暴露诚实矩阵。
- **Activity Feed**: 仍只读 `/api/audit-events`;新增 `task.exec_started / task.exec_succeeded / task.exec_failed / task.exec_cancelled / task.exec_needs_approval / approval.requested` 事件类型。

### 9.2 端到端实测(真实助手「软件工程师」+ 真实本地模型,用后即删)

1. 临时 Mission/Task(标题含 `__EXEC_TEST__`),指派给软件工程师(具 `run_command`)。
2. `execute` → `needs_approval`:助手调用 `run_command('pwd')` 被审批门拦截,生成 `ApprovalRequest(pending, cmd=pwd)`,助手消息诚实说明「被人工审批门拦截,尚未拿到真实输出」。
3. 审计按序写入: `task.exec_started → approval.requested → ai.tool_call → task.exec_needs_approval`。
4. 人工 `approve` → 后端自动续跑(trigger=approval):`run_command('pwd')` **真正执行**,`ai.tool_call` 审计记录真实输出 `$ pwd [退出码 0] /Users/kaiwu/Documents/kyle-agent/helio-clone`;助手最终消息回传真实路径;run → `succeeded`,任务 → `review`。
5. 清理: 临时 Mission/Task/TaskRun/ApprovalRequest/AuditEvent + 该次执行在 DM 产生的 4 条消息全部删除;全库 `__EXEC_TEST__` = 0。

结论: **任务指派给 AI 后,经「开始执行」会真实进入状态机并由对应助手执行;过程产生真实助手消息、真实工具调用与输出、真实审计;高危动作经人工审批后才放行。** 第 2 节用户反馈的「发布任务没人执行」已解决。

### 9.3 终端能力分层实测(Human terminal vs Assistant run_command)

- **Human terminal**(`/ws/terminal`): 实测发送 `echo __HUMAN_TERM_TEST__ $(pwd)` 立即返回项目根路径,**无审批门**(人类本人操作,完整 shell)。
- **Assistant run_command**(任务执行): 同一条 `pwd` **必须经人工批准**才执行(见 9.2)。
- 边界由 `ctx.exec` 区分:执行运行时走审批门;人类 pty 终端不拦截。两条路径互不混淆。

### 9.4 写代码 / 控制电脑(诚实声明,未实现)

`/api/capabilities` 矩阵如实标注:`write_file`(写文件/改代码)、`computer_control`(截图/鼠标/键盘)、`browser_control`(浏览器自动化)均为 `unavailable` —— 未实现,不假装具备。`run_command` 理论上可经已审批的 shell 间接写文件,但无专用受控通道。

### 9.5 真实最终 DB 状态

users 15 / assistants 10 / tasks 16 / missions 2 / reviews 0 / deliveries 0 / taskruns 1 / approvals 0 / audit 13 / messages 129。其中 `taskruns 1` 为会话期间对真实既有任务「看今天天气」(产品经理)的一次真实执行(经新增入口),属真实数据保留,非测试残留。

---

## 10. 第 6 轮实测(执行更聪明 + 去假执行语义 + 报告面板)

日期: 2026-05-25。针对 `EXECUTION_INTELLIGENCE_GAP_REPORT.md` 的 4 点缺口逐一修复并真实实测。

### 10.1 修复与实现(真实,不造假)

1. **去假执行语义**:执行状态只认真实 `TaskRun`。`task.status==='doing'` 但无 TaskRun 不再被当作「AI 执行中」——AI 团队不标 working、任务拆解显示「手动进行中」、任务卡显示「手动进行中」灰徽章。
2. **智能路由**:`analyzeTaskIntent` 识别天气/联网/命令意图并提取城市;`pickExecutor` 按助手 skills 命中数选可用执行人。需 fetch_url/run_command 的任务若 assignee 不具备,自动路由到具备能力的助手(写 `task.exec_routed` 审计);无可路由则返回真实原因。
3. **天气最小可用**:缺城市 → 返回 `needs_input`(不创建 TaskRun);有城市 → 用 `fetch_url`/低风险 `curl` 抓 `wttr.in/<city>` 取真实数据,失败如实报告。
4. **低风险命令策略**:`classifyCommand` 三级 + `LOW_RISK_AUTO_APPROVE`;只读命令(date/pwd/ls/cat/grep/find/sed/awk + curl·wget 仅 GET)免审批,写文件/命令替换/后台/非 GET 转审批,rm -rf/sudo/shutdown 硬拦截;能力矩阵 UI 透明展示。
5. **执行报告入口**:`GET /api/tasks/:id/report` + `TaskReportModal`,集中展示状态/执行人/触发者/时间/AI 汇报/toolsUsed/每次工具输出/审批/最终 output·error + DM 跳转 + 生成交付。
6. **落地交付**:run succeeded → 任务→review;报告面板一键生成 Delivery。

### 10.2 端到端实测(真实助手 + 真实本地模型,用后即删)

- **A 无 TaskRun 的 doing**:`status=doing` 且无 TaskRun 的任务,`taskRun 数 = 0` → 不显示为 AI 执行中。**通过**。
- **B 查天气**:assignee=产品经理(无 fetch_url/run_command)。
  - 缺城市:`execute` → `{status:needs_input, field:city}`,**未创建 TaskRun**。
  - 给「北京」:**自动路由 产品经理→软件工程师** → `fetch_url` 抓 `wttr.in/北京?format=3` → 真实结果 **`北京: 🌦️ +68°F`**,run→succeeded,任务→review。**通过**。
- **C 命令类**:assignee=软件工程师,`run_command('pwd')` → **低风险免审批放行**,真实输出 `/Users/kaiwu/Documents/kyle-agent/helio-clone`,run→succeeded,任务→review,`/report` 返回 runs=1/toolCalls=1。**通过**。
- **D 高危审批门**:`ps aux | head -3`(非只读白名单)→ `needs_approval` + ApprovalRequest(by 软件工程师)→ 人工 approve → 后端自动续跑(trigger=approval)→ 真实执行返回进程表,run→succeeded,任务→review。**通过**。

### 10.3 清理与残留校验

A/B/C(tasks=3 / runs=2 / audit=7 / DM 消息=4)+ D(tasks=1 / runs=2 / approvals=1 / audit=8 / DM 消息=4)全部删除;全库 `__SMOKE_EXEC__` / `__SMOKE_APPR__` = 0;清理后总量回到基线 **taskruns=2 / tasks=16**。临时 smoke 脚本(`server/_smoke.mjs`、`server/_smoke_appr.mjs`)已删除。

### 10.4 结论

第 1–2 节「发布任务没人执行」与 GAP 报告「假执行/笨路由/天气空答/无报告入口」均已解决:执行真实(以 TaskRun 为准)、更聪明(按意图+技能路由、缺信息先问)、更可见(任务级执行报告面板 + 能力矩阵透明)。危险命令硬拦截、低风险免审批、高危走人工审批门三条边界经真实 smoke 验证。
