# OPEN_REDESIGN_PLAN — Heliox AI Team Command Center 大改

> 日期: 2026-05-25
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 目标: 把"聊天 + 任务看板拼装"升级为真正的 AI Workforce / AI Team Command Center。
> 底线: 不造假执行、不造假测试、不复制 Genspark/Markus 的 UI/文案/源码/品牌。

## 0. 现状判断(读码 + 跑构建后)

可复用(后端基本完整,真实数据闭环已存在):

- 数据模型完整:`Mission / Task / TaskRun / SandboxRun / SandboxLog / SandboxArtifact / Review / Delivery / ApprovalRequest / AuditEvent`。
- API 完整:mission/review/delivery/audit/task-run/sandbox/approval/capabilities/report 全有。
- 真实能力:多助手真实 AI 回复(本地 OpenAI 兼容)、隔离沙盒执行 node/pnpm/python/git/build/test、本地浏览器截图、apply/discard/continue、人工审批落库。
- 基线构建全绿:`pnpm -C server build` / `web tsc` / `web build` 均通过(@types/node 已就位)。

真正的问题(用户不满意的根因)= 表达与流程,不是能力:

1. 主界面是"8 个面板堆叠的仪表盘",不像聚焦的指挥中心;light 纸感,不够高级、不深色优先。
2. 执行细节藏在一个窄的居中 modal(`TaskReportModal`),没有沉浸式 Execution Cockpit。
3. "需要你"(待审批 / 待补信息)不突出,补信息还在用 `window.prompt`。
4. 目标创建后没有 AI 拆解,Mission 是空壳;"目标→拆解→推荐执行人"闭环断裂。

## 1. 信息架构(新)

单一指挥中心 `WorkspaceView` 重排为三带:

- 顶部 **Mission Composer**:输入目标 → 创建 Mission →(新增)一键 AI 拆解为真实子任务。
- **Pending Deck**(待你处理):高危能力审批 + 待确认交付 + 待补信息,置顶高亮,空则收起。
- **三栏作战台**:
  - 左 **AI Constellation**:真实助手团队 + 实时状态 + 并行轨道 + 能力矩阵。
  - 中 **Operate**:Mission 选择条 + Mission Board + 任务拆解(指派 / 自动推荐 / 开始 / 继续 / 取消)。
  - 右 **Track**:Activity/Audit 真实轨迹 + Delivery 交付 + Review 质量 + 最近沙盒运行。
- **Execution Cockpit**(新核心):点任务/运行 → 右侧宽幅停靠面板,实时显示 TaskRun + SandboxRun:
  执行人/状态/计时/控制、步骤时间线、工具调用、命令终端输出、文件变更与 diff、build/test、
  浏览器截图、AI 汇报与下一步建议、以及就地的待办动作(批准命令 / 应用交付 / 继续 / 生成交付)。
  执行中自动轮询刷新。

## 2. 关键交互

- 创建目标 → AI 拆解(真实 LLM)→ 子任务落库 → 每行可指派/自动推荐 → 开始执行 →
  Cockpit 实时观察工具调用/命令/diff/build → 触上限或失败可继续 → 完成生成交付 →
  待审批进入 Pending Deck → 人工 approve/reject(落库)。
- 待补信息:用专门的 `PendingInputModal` 替代 `window.prompt`(诚实展示后端给的 prompt)。
- 沙盒诚实标注"本机信任沙盒(非强隔离)",但不阻碍内部测试。

## 3. 数据流

- 前端状态仍集中在 `App.tsx`,已有 `missions/reviews/deliveries/auditEvents/taskRuns/approvals/sandboxRuns` 全量真实数据 + WS 实时刷新(`workspace`/`tasks` 事件)。
- Cockpit 读 `GET /api/tasks/:id/report`(聚合 TaskRun + ai.tool_call 审计 + 审批 + 交付 + 沙盒),执行中本地轮询。
- 新增 `POST /api/missions/:id/breakdown`:借助手已配置的本地 LLM 凭据拆解目标 → 创建真实 Task(missionId/expectedOutput/priority)→ 写 AuditEvent → mission 状态 draft→planning。

## 4. 改动清单

后端:
- `ai.ts`:新增 `breakdownGoal()`(OpenAI 兼容,JSON 子任务)。
- `index.ts`:新增 `POST /api/missions/:id/breakdown`。

前端:
- `index.html`:默认深色。`theme.css`:深色调优 + 升起表面/辉光 token。`index.css`:cockpit 动效。
- `lib/api.ts`:`breakdownMission`。
- 新增 `ExecutionCockpit.tsx`、`PendingInputModal.tsx`。
- 重排 `WorkspaceView.tsx`(三栏 + Pending Deck + Cockpit 接入)。
- `App.tsx`:接 cockpit / breakdown / pending input。

## 5. 风险

- 全量重排可能破坏构建 → 分步改、每步保证三项构建通过。
- 本地 LLM 拆解返回非 JSON → 解析兜底(正则提取 + 失败回退提示)。
- 长执行阻塞 `/execute` → 沿用既有 WS 驱动,Cockpit 轮询不依赖该响应。

## 6. 验收路径

1. `pnpm -C server build` / `pnpm -C web exec tsc --noEmit` / `pnpm -C web build` 全过。
2. 真实跑通一个任务:创建 Mission → AI 拆解 → 指派 → 开始执行 → Cockpit 见工具调用/命令/diff/build → 生成交付/待审批。
3. 用无头浏览器截图主界面 + Cockpit,留证。
4. 测试数据跑完清理,回基线。
5. 产出 DELIVERY / REVIEW / BUILD_RESULT / FINAL_REPORT;REVIEW 末行 `FINAL_VERDICT:`。
