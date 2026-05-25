# MARKUS_INSPIRED_IMPROVEMENT_PLAN

> 目标: 借鉴 Markus 的产品逻辑, 不复制 UI / 文案 / 品牌, 为 helio-clone 制定真实可执行的改进路线。  
> 当前判断: helio-clone 有强聊天与助手底座, 缺 AI Workforce 工作流内核。

## 1. Markus 可借鉴的产品逻辑

从 Markus README 可提炼出这些逻辑:

1. AI team 不是单个聊天机器人, 而是有角色、职责、工具和记忆的 worker 集合。
2. 用户输入目标后, 系统负责拆解任务和组队。
3. 多个 Agent 应能并行执行, 并且用户能看到每个 Agent 在做什么。
4. 交付前必须有质量审查。
5. 人类不应该盯全过程, 但要审最终成果和关键决策。
6. 持久记忆、审计轨迹和治理是用户信任 AI workforce 的基础。
7. 移动端/远程管理的价值来自“我能随时看进展和批准交付”。

这些可以借鉴。不能照抄 Markus 的 UI、口号、英文文案、dashboard 风格或品牌表达。

## 2. 当前 helio-clone 的独特优势

与其从零复制 Markus, helio-clone 应该保留自己的优势:

- 中文内部工作区体验更自然。
- 聊天和 AI 助手已经深度融合。
- 助手作为特殊 User 的设计很实用。
- 已有真实 WebSocket 流式消息。
- 已有本地终端。
- 已有任务看板。
- 已有 function calling 工具系统。
- 已有 L2 memory 和 remember 工具。
- 可本地运行, 适合个人开发者/创作者/小团队。

定位建议:

**一个中文友好的本地 AI 团队工作台, 从聊天协作自然升级到 Mission 交付闭环。**

## 3. 三阶段路线

### Stage 1 — 真实闭环骨架

目标: 让产品第一次真正完成 “Goal → Mission → Tasks → Review → Delivery → Approval → Audit”。

必须做:

- Mission 模型。
- Task 状态机升级。
- Review 模型。
- Delivery 模型。
- AuditEvent 模型。
- ContextDoc 读取 API。
- 首页 CTA 创建 Mission。
- 工作台所有区块读取真实数据。

不做:

- 不做真正多进程 Agent runtime。
- 不做 marketplace。
- 不做复杂权限。
- 不做外部平台桥接。

### Stage 2 — AI 编排

目标: AI 不只是聊天回复, 而是能帮助组织工作。

必须做:

- Planner Agent 根据 Mission 草拟任务拆解。
- 用户批准任务拆解后写入 DB。
- Manager/Tech Lead 可指派任务。
- Reviewer Agent 可生成 Review。
- Delivery 自动汇总任务结果。
- 所有 AI 行为写入 AuditEvent。

不做:

- 不让 AI 自动无限执行。
- 不绕过人类关键确认。

### Stage 3 — Workforce Runtime

目标: 接近真正 AI Workforce。

必须做:

- Agent heartbeat。
- 任务队列。
- Agent workspace isolation。
- Tool run artifact。
- Memory consolidation。
- Cost/token tracking。
- Remote/mobile friendly approval flow。

## 4. 数据模型建议

### Mission

```text
id
title
goal
status: draft | planning | ready | running | review | delivered | archived
createdById
contextDocIds
createdAt
updatedAt
```

### Task 扩展

```text
missionId
status: backlog | ready | in_progress | review | needs_fix | delivered | archived
priority
assigneeId
reviewerId
expectedOutput
acceptanceCriteria
dependsOn
```

### Review

```text
id
taskId
reviewerId
verdict: pass | needs_fix | blocked
checksJson
notes
createdAt
```

### Delivery

```text
id
missionId
taskId
summary
artifactJson
testResultJson
riskLevel
status: pending | approved | rejected
approvedById
approvedAt
createdAt
```

### AuditEvent

```text
id
missionId
taskId
actorId
type
summary
payloadJson
createdAt
```

## 5. UI 改进建议

### 首页

把首页第一屏从“状态展示”改为“操作驾驶舱”:

- 顶部: Mission 输入框。
- 左: AI Team 状态。
- 中: 当前 Mission + Task Breakdown。
- 右: 待我确认。
- 下: Activity / Audit Trail。

### Mission 页面

新增 Mission detail:

- Goal。
- Context Pack。
- Task Breakdown。
- Agent Assignment。
- Review & Delivery。
- Audit Trail。

### AI Team 页面/抽屉

每个 Agent 卡片应展示:

- 角色。
- 当前模型。
- key / endpoint 可用性。
- skills。
- trust level。
- 当前任务。
- 最近活动。
- 记忆摘要。

### Context Vault

从“路径列表”升级为:

- 可打开文档。
- 可搜索。
- 可勾选加入 Mission Context。
- 可显示被哪些 Mission 使用。

## 6. 工程改进建议

1. 修复 server build。
2. 清理 stale mock 类型和注释。
3. 建立最小测试:
   - web build
   - server build
   - API smoke
   - AI endpoint smoke
4. 前端 code splitting:
   - TerminalView 懒加载。
   - markdown 渲染懒加载。
5. 把 docs/ai 中的 Phase 旧内容整理归档, 避免新 Agent 被旧 mock 方案误导。

## 7. 推荐立即执行的 2 周计划

### 第 1-2 天

- 清理品牌残留和 mock 残留。
- 修 server build。
- 整理 docs/ai, 明确当前事实。

### 第 3-5 天

- 加 Mission / Review / Delivery / AuditEvent schema。
- 加 REST API。
- 工作台接真实数据。

### 第 6-8 天

- 首页 Mission 输入。
- Mission detail 页面。
- Task 状态机升级。

### 第 9-11 天

- Planner Agent 生成任务草案。
- Reviewer Agent 生成 review。
- Delivery 自动汇总。

### 第 12-14 天

- 端到端验收。
- 移动端优化。
- 文档和演示数据清理。

## 8. 验收标准

一轮改完后, 用户应该能完成:

1. 输入一个目标。
2. 系统生成 Mission。
3. AI 给出任务拆解草案。
4. 用户批准任务。
5. 指派给真实助手。
6. 任务进入执行。
7. 执行记录进入 Activity。
8. Reviewer 给出 pass/needs-fix。
9. 生成 Delivery。
10. 用户批准或打回。
11. 所有过程可在 Audit Trail 中追溯。

如果不能完成这条链路, 就还不能称为完整 AI Workforce Platform。

