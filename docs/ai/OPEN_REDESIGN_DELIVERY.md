# OPEN_REDESIGN_DELIVERY — Heliox AI Team Command Center 改造交付

> 日期: 2026-05-25
> 范围: 把"聊天 + 任务看板拼装"升级为真正的 AI Team Command Center;深色优先、原创产品语言、真实执行驾驶舱、清晰发布闭环。
> 底线遵守: 无伪造执行 / 无伪造测试 / 未复制 Genspark·Markus 的 UI·文案·源码·品牌。

## 1. 一句话

Heliox 从"深色拼装仪表盘"升级为一个有自己产品语言的 AI Team Command Center:输入目标 → AI 真实拆解 → 推荐/指派执行人 → 一键执行 → 沉浸式 Execution Cockpit 实时观察工具调用/命令/沙盒/diff/build → 待办在置顶 Pending Deck 集中处理 → 审查/交付闭环,人类只做关键决策。

## 2. 主要改动

### 设计基座(深色优先 + 升起表面)
- `web/index.html`:主题改为**深色优先**(未显式选 light 即 dark)。
- `web/src/theme.css`:重做深色调色板(近黑石墨底 + 微暖中性 + 分层升起表面 surface-1/2/3 + 辉光 / 终端 / ring token),accent 暗底微调。
- `web/src/index.css`:新增 Cockpit 动效与工具类(停靠滑入 `cockpit-in`、遮罩淡入、顶部极光 `aurora-bar`、运行态外环 `live-dot`、`surface-card`/`surface-glow`/`terminal-pane`),并补 `prefers-reduced-motion` 降级。

### 主界面重排(Mission Control 三带)
- `web/src/components/workspace/WorkspaceView.tsx`:从 8 面板堆叠重排为
  - 顶部 **Mission Composer**(CommandHeader)
  - 置顶 **Pending Deck**(高危能力审批 + 待确认交付,空则隐藏)
  - Mission 选择条 + **选中 Mission 焦点条**(目标/状态/子任务数/AI 拆解按钮)
  - **三栏作战台**:左 Team(AI 团队 + 能力矩阵)· 中 Operate(Mission Board + 任务拆解)· 右 Track(运行轨迹 + 交付 + 质量)
  - 底部 全宽 沙盒运行区
- `web/src/components/workspace/CommandHeader.tsx`:原创 Heliox 标记(轨道环抱核心,非任何参考品牌);Composer 提供「建草案」与「创建 + AI 拆解」两个动作。

### Execution Cockpit(核心新增)
- `web/src/components/workspace/ExecutionCockpit.tsx`(新):右侧宽幅停靠驾驶舱,**执行中自动轮询刷新 + 计时**。展示:执行人 + 状态 pill(运行态有 live 外环)+ 计时/触发/次数 + 控制(执行对话/取消/继续/生成交付);左侧**执行步骤时间线**;主区**需要你处理**(就地批准/拒绝高危命令、应用/丢弃沙盒、生成交付)+ AI 汇报 + 沙盒执行(复用 SandboxPanel:终端/diff/build·test/截图/apply·discard)+ 工具调用 + 审批记录。
- 取代原来的小号居中 `TaskReportModal`(已删除);任务卡「执行报告」、开始执行后均进入 Cockpit。

### Pending User Action(替代 window.prompt)
- `web/src/components/workspace/PendingInputModal.tsx`(新):缺信息(如查天气缺城市)时弹出明确的补信息窗口,诚实展示后端提示文案,提交后继续执行。

### 真实 AI 拆解(后端 + 前端打通)
- `server/src/ai.ts`:新增 `breakdownGoal()` —— 借助手已配置的供应商/本地端点,真实 LLM 把目标拆成 JSON 子任务(title/expectedOutput/role/priority),解析有兜底。
- `server/src/index.ts`:新增 `POST /api/missions/:id/breakdown` —— 真实落库为挂在 Mission 下的 Task,写 `mission.broken_down` 审计,mission draft→planning。
- `web/src/lib/api.ts`:`breakdownMission(id)`;`web/src/App.tsx`:`composeMission(goal, breakdown)` / `breakdownMission()`,执行成功自动打开 Cockpit,缺信息走 PendingInputModal,Cockpit 接 `onCancel` / `onDecideApproval`。

## 3. 数据真实性

- AI 团队 = 真实 Assistant;Mission/Task/TaskRun/SandboxRun/Review/Delivery/Approval/AuditEvent 全为真实持久化。
- Activity Feed 读真实 `AuditEvent`;Delivery 读真实 `Delivery`;Cockpit 读 `GET /api/tasks/:id/report` 聚合的真实运行时;Context Vault 读真实 docs/ai 文件。
- AI 拆解、执行、工具调用、命令、build/test、截图均为真实(见 OPEN_REDESIGN_BUILD_RESULT.md 的端到端记录)。

## 4. 截图证据

- `docs/ai/screens/command_center.png`
- `docs/ai/screens/execution_cockpit.png`

## 5. 已保留的真实示例

测试中真实跑通的 Mission「5 分钟上手引导」及其 5 个子任务、T1 的成功执行(沙盒新增 `docs/ONBOARDING_5MIN_PRD.md`、tsc 通过)、`ready_for_review` 沙盒与 `pending` 交付被**保留为真实示例**,便于用户直接打开 Cockpit 看到一个完整、真实、待人工 apply/审批 的执行案例(主项目未被改动)。
