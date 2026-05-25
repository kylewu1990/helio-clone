# Helio Clone → AI Workforce Workspace 完整版优化任务

## 0. 项目定位

基于当前 helio-clone 项目，优化整合为一款具有独立审美的 AI Workspace / AI Team 操作系统。

它不是普通聊天机器人，也不是简单 Claude/Codex 外壳，而是一个面向个人开发者、创作者、教育团队的“AI 团队工作台”。

目标参考 Markus：
- AI workforce platform
- 多角色 Agent
- 任务拆解
- 并行执行
- 审查与交付
- 运行日志
- 记忆与上下文
- 人类最终确认

但不能照抄 Markus 的界面和文案，要形成自己的产品气质。

## 1. 产品愿景

用户打开产品后，应立刻知道三件事：

1. 我现在有哪些 AI 队员？
2. 他们正在做什么？
3. 我下一步应该确认、分配或接收什么成果？

产品体验要像一个“AI 创造力实验室 / AI 软件公司驾驶舱”。

## 2. 核心参考：Markus 功能方向

参考 Markus README 中的功能方向，但只借鉴产品逻辑，不复制 UI：

### 2.1 AI Team
支持不同 Agent 角色，例如：
- Product Strategist
- Developer
- Reviewer
- Researcher
- Writer
- Ops
- Designer

### 2.2 Task Breakdown
用户输入一个目标后，系统可以展示：
- 总目标
- 子任务
- 负责人 Agent
- 当前状态
- 依赖关系
- 预计交付物

### 2.3 Parallel Execution
界面上要能体现多个 Agent 并行工作，而不是一个聊天框独占全部体验。

### 2.4 Quality Review
任务完成后不能直接算完成，要有：
- review 状态
- pass / need fix
- reviewer notes
- final delivery

### 2.5 Memory / Context
需要有项目上下文区域，例如：
- Project Context
- Product Decisions
- Design Principles
- User Preferences
- Recent Changes

### 2.6 Activity / Audit Trail
需要有清晰的运行记录：
- 谁做了什么
- 什么时候开始
- 什么时候完成
- 输出了什么
- 是否需要人工确认

## 3. 自己的独立审美方向

不要做成传统后台管理系统。
不要做成普通 ChatGPT 页面。
不要做成 Markus 复刻版。

视觉方向：
- Apple 式干净
- Linear 式秩序
- Notion 式清晰
- Genspark 式科技感
- 轻微 glassmorphism
- 深色模式优先
- 保留高级、克制、专业的动效
- 可加入星球 / 轨道 / 神经网络 / agent constellation 的视觉隐喻

关键词：
- calm command center
- AI constellation
- mission control
- digital laboratory
- elegant productivity
- high-end Chinese AI workspace

## 4. 首页信息架构

首页不要堆功能，要一屏看懂。

建议包含：

### 4.1 Hero / Mission Command
显示当前项目目标，例如：
“Build your AI team. Turn ideas into shipped work.”

中文版本：
“组建你的 AI 团队，把想法推进到交付。”

### 4.2 AI Team Status
展示多个 Agent 卡片：
- 名称
- 角色
- 状态：Idle / Working / Reviewing / Blocked / Done
- 当前任务
- 信任等级 / 权限等级

### 4.3 Mission Board
任务看板：
- Backlog
- In Progress
- Review
- Delivered

每个任务显示：
- 标题
- 负责人
- 状态
- 优先级
- 输出物

### 4.4 Live Activity
运行日志：
- Agent started task
- Developer modified files
- Reviewer requested fixes
- Delivery approved

### 4.5 Delivery Panel
最终交付区：
- 本轮交付摘要
- 修改文件
- 测试结果
- 风险
- 人类确认按钮

### 4.6 Context Vault
项目上下文区：
- PROJECT_CONTEXT
- TASK
- REVIEW
- DELIVERY
- DESIGN_PRINCIPLES

## 5. 功能优先级

### Phase 1：UI 和信息架构重整
目标：先把产品看起来像完整 AI Workspace，而不是散乱 demo。

必须完成：
- 重构首页布局
- 增加 AI Team 区域
- 增加 Mission Board
- 增加 Activity Timeline
- 增加 Delivery Panel
- 增加 Context Vault 入口
- 保持现有聊天/执行能力不被破坏

### Phase 2：前端状态模型
目标：让界面结构真实可扩展。

必须完成：
- 定义 Agent 数据结构
- 定义 Task 数据结构
- 定义 Activity 数据结构
- 定义 Delivery 数据结构
- 使用 mock data 或现有后端数据驱动 UI
- 不要把所有内容写死在 HTML 里

### Phase 3：后端整合
目标：逐步把真实任务、聊天、工具调用、日志接入工作台。

必须完成：
- 梳理当前 server 结构
- 明确已有 API
- 为任务 / agent / activity / delivery 预留接口
- 保持现有聊天 API 可用

### Phase 4：交付闭环
目标：支持“目标 → 拆解 → 执行 → 审查 → 交付”的完整体验。

必须完成：
- 用户输入目标
- 系统生成任务计划
- 指派 Agent
- 展示执行状态
- 展示 review 结果
- 生成 final delivery

## 6. 本轮交付范围

本轮先做 Phase 1 + Phase 2。

不要一次性重写整个项目。
不要引入复杂数据库。
不要做真实多 Agent runtime。
先把产品壳、信息架构、视觉系统和前端状态模型做扎实。

## 7. 技术要求

1. 先阅读项目现有结构。
2. 保持现有运行方式。
3. 不破坏现有 API。
4. 不随意更换技术栈。
5. 不随意引入大型依赖。
6. 如需新增组件，保持结构清晰。
7. 所有修改必须可运行。
8. 完成后运行项目已有 build / test / lint 命令。
9. 如果没有测试，至少运行 build。

## 8. 验收标准

本轮完成后，产品应该达到：

1. 打开首页，一眼看出这是一个 AI Team Workspace。
2. 功能方向明显向 Markus 的 AI workforce 靠拢。
3. 视觉上有自己的高级审美，不是复制 Markus。
4. 页面结构清楚，不乱。
5. 现有聊天或核心功能不被破坏。
6. 代码结构支持后续继续扩展。
7. build 通过。
8. docs/ai/DELIVERY.md 有完整交付说明。

## 9. 禁止事项

- 禁止直接抄 Markus 的 UI 文案和布局。
- 禁止大规模删除现有功能。
- 禁止把页面做成普通后台模板。
- 禁止为了好看牺牲可用性。
- 禁止编造测试结果。
- 禁止一次性承诺完成真实多 Agent runtime。
- 禁止修改无关配置导致项目跑不起来。
