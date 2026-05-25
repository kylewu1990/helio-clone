# USER_TEST_REPORT — Helio Clone 真实用户体验报告

> 日期: 2026-05-25  
> 测试者视角: 第一次认真使用该产品的中文用户  
> 项目路径: `/Users/kaiwu/Documents/kyle-agent/helio-clone`  
> 参考对象: Markus 的产品逻辑, 不是 UI / 文案 / 品牌复刻。  

## 1. 一句话结论

这个项目已经有很强的底座: 真实聊天、真实多助手、真实任务、真实终端、真实 AI 回复都能跑起来。但从用户体验上看, 它现在仍像“带 AI 助手的团队聊天工具 + 一个工作台首页”, 还没有真正形成“用户给目标 → AI 团队拆解 → 并行执行 → 审查 → 交付 → 人类批准”的闭环。

当前最值得做的不是继续堆视觉卡片, 而是把真实任务状态机、审查/交付/审批、活动审计、上下文记忆打通。否则产品看起来像 AI Workforce, 但关键时刻仍靠用户自己在聊天里组织工作。

## 2. 测试范围

我实际体验了:

- 打开前后端。
- 进入工作台首页。
- 查看 AI Team。
- 查看 Mission Board。
- 查看 Task Breakdown / Quality Review / Delivery / Context Vault。
- 打开完整任务看板。
- 打开频道消息。
- 查看 Inbox。
- 打开 Terminal 并执行 `pwd`。
- 用本地模型通路做一次真实 AI 回复测试, 并清理测试消息。
- 运行前端 build 和后端 build。

没有做:

- 没有创建测试人物。
- 没有留下测试任务。
- 没有改业务代码。
- 没有清数据库。
- 没有复制 Markus UI。

## 3. 体验评分

| 维度 | 分数 | 说明 |
|---|---:|---|
| 可运行性 | 7/10 | 后端、前端、AI、终端都可跑; server build 失败扣分 |
| 首屏产品感 | 7/10 | 已像 Command Center, 但仍有 Helio 残留和空闭环 |
| AI Team 感 | 7/10 | 有真实助手和状态, 但角色/权限/工作边界还偏推断 |
| Mission Board | 6/10 | 真实任务可见, 但 Review/Delivered 状态缺失 |
| Task Breakdown | 5/10 | 能从频道任务派生, 但不是真正目标拆解 |
| Parallel Execution | 5/10 | 只是由 doing 任务和负责人推断, 没有调度/runtime |
| Quality Review | 3/10 | UI 有区块, 真实能力为空 |
| Delivery Panel | 3/10 | 需要 done 任务才出现, 无交付物/测试/风险 |
| Context Vault | 5/10 | 有文档入口, 但不可读、不可注入、不可搜索 |
| Activity/Audit Trail | 5/10 | 由任务更新时间派生, 还不是动作级审计 |
| 中文用户友好 | 7/10 | 大体中文友好, 但中英混杂和旧品牌残留 |
| Markus 逻辑接近度 | 4/10 | 看得出方向, 但缺真正 workflow engine |

总体: **6/10**。作为本地 AI 工作区 PoC 很扎实; 作为 AI Workforce Platform 还需要一轮产品闭环建设。

## 4. 用户路径体验

### 4.1 首次进入

优点:

- 默认进入工作台, 比直接进聊天更像一个产品。
- 顶部目标文案清楚: “组建你的 AI 团队, 把想法推进到交付。”
- 左侧 rail 简洁, 工作台 / 消息 / 收件箱 / 任务 / 终端路径清楚。
- 真实助手和真实任务能直接展示, 没有空白尴尬。

问题:

- 侧边栏标题仍是 `Helio 内部版`, 产品定位割裂。
- 首屏在窄宽度下信息密度过高, AI Team 列表占据大部分视野, Mission / Delivery / Activity 需要继续向下滚。
- 作为新用户, 我仍不知道“我现在应该输入一个目标”还是“去频道里聊天”。
- “新建任务”只是跳到任务看板, 不是 AI Workforce 意义上的“新建 Mission / Goal”。

建议:

- 把第一操作从“新建任务”升级为“新建 Mission”。
- 首页顶部增加一个真实输入框: “描述你要完成的目标…”, 提交后创建 Mission 草案。
- 将 `Helio 内部版` 全部替换为独立产品名, 保留 Helio 来源只写在 README/文档。

### 4.2 AI Team

优点:

- 真实助手数量充足, 职能覆盖产品、技术、设计、测试、市场、教研、会议、软件工程。
- 每个助手有状态、角色、信任等级, 方向是对的。
- AI 回复通路真实可用。

问题:

- 角色推断不够准: 技术负责人、产品经理都显示为 Reviewer, 教研架构师显示 Designer, 容易让用户不信任系统。
- 信任等级是由 skills 数量推断, 不是治理意义上的权限等级。
- 用户不能从工作台直接看到每个助手“能做什么 / 不能做什么 / 当前是否有 key / 当前模型是否可用”。
- 有一个“数据分析师”无 key, 但工作台没有明确标出“不可工作”。

建议:

- User/Assistant 增加真实字段: `role`, `trustLevel`, `capabilities`, `availability`, `lastHeartbeatAt`。
- 工作台对无 key / 模型不可用 / 工具不可用的助手显示明确状态。
- 允许用户在 AI Team 卡片上直接发起 DM、指派任务、查看能力和记忆。

### 4.3 Mission Board

优点:

- 真实任务映射到 Backlog / 进行中 / 已交付, 基础可用。
- “打开完整看板”能进入旧任务视图, 没有破坏原功能。

问题:

- 完整任务视图仍是三列: 待办 / 进行中 / 完成; 工作台是四列: Backlog / 进行中 / 待复核 / 已交付。两个模型不一致。
- `review` 列永远空, 因为后端没有 review 状态。
- 任务没有 priority、output、acceptance criteria、reviewer、delivery 等字段, Mission Board 只能做视觉映射。

建议:

- 将 Task 状态机升级为: `backlog -> ready -> in_progress -> review -> needs_fix -> delivered -> archived`。
- 保留旧 TasksView 但同步到新状态模型, 或把 TasksView 升级为 MissionView。
- 每个任务增加: priority、owner、reviewer、expectedOutput、acceptanceCriteria、dependencies。

### 4.4 Task Breakdown

优点:

- 从真实频道任务分组推导“总目标 → 子任务”, 这是正确方向。
- 不再伪造依赖和进度, 可信度比假 demo 好。

问题:

- 当前的“总目标”其实只是频道名或当前任务标题, 不是用户提交的 Goal。
- 子任务只是现有任务列表, 没有层级、依赖、验收标准。
- 用户无法从一个 Mission 展开看到谁在做、为什么这样拆、下一步是什么。

建议:

- 新增 `Mission` 实体, 不要只用 Channel 代替 Mission。
- 新增 `MissionTask` 或扩展 Task, 支持 parent/missionId/dependencies。
- 新建 Mission 时, 由 Planner Agent 生成可编辑任务拆解, 用户批准后才进入执行。

### 4.5 Parallel Execution

优点:

- 目前由多个 doing 任务和负责人推断并行, 视觉上能表达“多路”。

问题:

- 并没有真正调度多个 Agent 并行执行。
- 没有 agent workspace、执行日志、任务锁、失败重试、依赖阻塞。
- “并行”更多是看板状态, 不是 runtime 状态。

建议:

- 先不用做复杂 runtime, 但要建立执行事件模型:
  - `task.assigned`
  - `agent.started`
  - `tool.called`
  - `artifact.created`
  - `review.requested`
  - `task.blocked`
  - `task.completed`
- Activity Feed 从这些真实事件读取, 不再从 updatedAt 猜。
- 后续再做真正 agent runner / heartbeat / isolated workspace。

### 4.6 Quality Review

优点:

- 现在诚实空状态是对的, 没有假 review。

问题:

- 作为 AI Workforce, “没有 review”是最大产品缺口之一。
- 没有 pass / need fix / reviewer notes / checklist。
- 也没有把测试结果、构建结果、用户验收绑定到任务。

建议:

- 新增 Review 模型:
  - targetType: task / delivery / file / message
  - reviewerId
  - verdict: pass / needs_fix / blocked
  - checks[]
  - notes
  - createdAt
- 支持从任务进入“请求审查”。
- 让 Reviewer 助手基于真实上下文输出 review, 但必须要求人类最终确认。

### 4.7 Delivery Panel / Human Approval

优点:

- 设计方向对: 最终交付必须由人类确认。
- 当前没有 done 任务时显示空状态, 诚实。

问题:

- done 任务没有真实交付物, 只是任务完成。
- 确认/打回是前端本地状态, 刷新会丢。
- 没有 artifact, 没有变更摘要, 没有风险等级, 没有测试结果。

建议:

- 新增 Delivery 模型:
  - missionId / taskId
  - summary
  - artifacts[]
  - changedFiles[]
  - testResults[]
  - riskLevel
  - status: pending_review / approved / rejected
  - approvedBy / approvedAt
- Human Approval 必须落库, 不只是本地 UI。
- Delivery Panel 应成为用户每天最重要的入口: “这些成果等你验收”。

### 4.8 Context Vault / 项目记忆

优点:

- 抽屉位置合理。
- 指向真实文档, 不是假内容。

问题:

- 只能看到路径, 不能打开阅读。
- 不能搜索。
- 不能选择某些上下文注入给 AI。
- 助手 memory、项目 docs、频道历史、任务上下文是割裂的。

建议:

- 后端新增只读文档 API:
  - `GET /api/context-docs`
  - `GET /api/context-docs/:id`
- Context Vault 支持打开文档、搜索、固定为 Mission 上下文。
- Mission 创建时可选择 Context Pack。
- 助手回复时展示“引用了哪些上下文”。

### 4.9 Activity / Audit Trail

优点:

- 任务更新时间生成 timeline, 作为临时方式可接受。

问题:

- 这不是审计轨迹。它无法回答“谁调用了什么工具、改了什么、为什么失败、谁批准了”。
- 无法作为 Markus 式 workforce 的信任基础。

建议:

- 建立 append-only AuditEvent 表。
- 所有关键动作都写入:
  - message sent
  - assistant selected
  - tool call start/end
  - task status changed
  - review submitted
  - delivery approved
  - terminal command executed
- Activity Feed 只读 AuditEvent, 不再猜。

### 4.10 Terminal

优点:

- 真实可用, `pwd` 成功。
- 对开发者工具产品来说加分很大。

问题:

- 终端是黑盒, 工作台无法引用终端执行记录。
- AI run_command 和人类 terminal 是两个世界。

建议:

- 将终端命令也写入 AuditEvent。
- 允许把终端输出保存为 artifact 或附加到任务。
- AI 执行命令和人类执行命令在审计上统一展示。

## 5. 对照 Markus 的差距

Markus 的核心不是好看的 dashboard, 而是组织层:

- 用户描述目标。
- 系统组建团队。
- Secretary/manager 拆任务。
- 多 Agent 并行执行。
- 每个 Agent 有工具、记忆和 workspace。
- 产出经过 review 和 delivery。
- 人类只审最终成果和关键决策。
- 全过程有 audit trail。

当前 helio-clone 已具备:

- 多 Agent。
- 聊天协作。
- 工具调用。
- 任务看板。
- 终端。
- 工作台视觉。

缺少:

- Goal/Mission 入口。
- Planner/Manager 编排。
- 真正任务拆解。
- 真正并行执行状态。
- 审查状态机。
- 交付物模型。
- 治理/信任等级。
- 持久审计轨迹。
- 上下文包和记忆体系。

所以它离 Markus 的产品逻辑还差一个“工作流内核”。

## 6. 最优先改进清单

### P0 — 必须先做

1. **统一产品身份**  
   去掉 UI 中 `Helio 内部版` 残留, 确立独立产品名。

2. **修 server build 基线**  
   补 `@types/node`, 让 `pnpm -C server build` 通过。否则长期自动化会一直误判。

3. **清理 mock 残留类型和注释**  
   清理 `source: 'mock'`, `isReal`, 旧注释、MissionBoard 示例分支。保持代码和“真实数据驱动”一致。

4. **新建 Mission / Goal 实体**  
   不要继续用 Channel 或 Task 假装 Mission。

5. **让“新建任务”升级为“新建 Mission”**  
   首页第一 CTA 应是输入目标, 而不是跳到任务看板。

6. **建立真实 Review 状态**  
   至少支持 task 进入 review、pass、needs_fix。

7. **建立 Delivery 模型并落库**  
   done task 不等于 delivery。Delivery 必须有摘要、artifact、验收状态。

8. **Human Approval 落库**  
   确认/打回不能只是前端 useState。

9. **建立 AuditEvent 表**  
   Activity Feed 必须来自真实事件, 而不是更新时间。

10. **Context Vault 可阅读**  
   至少支持在抽屉中打开 PROJECT_CONTEXT / docs/ai 文档。

### P1 — 下一轮做

11. Mission 下的 Task Breakdown 支持依赖关系。
12. 任务支持 reviewer、acceptanceCriteria、expectedOutput。
13. AI Team 卡片显示 key/model 可用性。
14. 助手角色改为真实字段, 不靠正则推断。
15. 工作台 Activity 按 Mission 过滤。
16. Delivery 支持 artifact 附件或链接。
17. Terminal 输出可附加到任务。
18. Context Pack 可绑定到 Mission。
19. 移动端工作台减少首屏高度, 优先显示 “待我处理”。
20. 前端做 code splitting, 降低 823k JS 初始包。

### P2 — 长线做

21. Heartbeat / background agent patrol。
22. Agent workspace isolation。
23. Agent-to-Agent structured messages。
24. Skills / agent templates marketplace。
25. 多用户角色和权限。
26. 外部通信桥接。
27. 任务执行成本和 token 监控。
28. Agent 记忆 consolidation。
29. Mission report 自动生成。
30. 云端/移动端远程访问。

## 7. 不建议做的方向

- 不要继续添加假卡片、假 Agent、假交付。
- 不要做更炫的 3D / 大面积渐变 / 复杂动画。
- 不要把聊天功能砍掉; 它是已有最强资产。
- 不要复制 Markus 的 UI 和文案。
- 不要现在就做复杂多租户权限; 先把单人本地闭环做实。
- 不要为了看起来完整而伪造测试结果、风险等级、review 结论。
- 不要在没有 Mission 模型前继续堆更多工作台派生逻辑。

## 8. 推荐下一轮目标

下一轮最合适的目标:

**真实 Mission/Review/Delivery/Audit 最小闭环**

范围:

1. 新增 Prisma 模型: Mission, Review, Delivery, AuditEvent。
2. 扩展 Task: missionId, reviewerId, expectedOutput, acceptanceCriteria, status 新枚举。
3. 首页 CTA 创建 Mission。
4. Mission 页面显示真实任务拆解。
5. 任务可请求 Review。
6. Review 可 pass / needs fix。
7. Done task 生成 Delivery。
8. Human Approval 落库。
9. Activity Feed 读取 AuditEvent。
10. Context Vault 支持读取真实文档。

这轮做完后, 产品才会从“看起来像 AI Workforce”变成“真的有 AI Workforce 的工作流骨架”。

