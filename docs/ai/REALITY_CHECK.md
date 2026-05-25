# REALITY_CHECK — 真实可用性核对

> 日期: 2026-05-25  
> 角色: 普通用户视角 + 产品评测视角  
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`  
> 参考: Markus README, 只借鉴产品逻辑, 不复制 UI / 文案 / 品牌。

## 1. 本次实际运行环境

- 后端已在 `http://127.0.0.1:5373` 运行。
- 前端 `5173` 端口被占用但无法正常响应, 本次额外启动 Vite 后实际使用 `http://localhost:5174`。
- 本地 OpenAI-compatible AI endpoint 可用, 使用 `gemini-2.5-flash` 做了一次直接模型调用, 返回正常。
- Web UI 可打开并进入工作台。
- 内嵌 Terminal 可执行 `pwd`, 返回 `/Users/kaiwu/Documents/kyle-agent/helio-clone`。

## 2. 本次验证过的真实能力

| 能力 | 结果 | 证据/说明 |
|---|---|---|
| 后端 API | 通过 | `/api/users`, `/api/assistants`, `/api/tasks`, `/api/channels`, `/api/inbox` 均可读 |
| 前端工作台 | 通过 | 默认进入 AI Workforce Command Center |
| 真实助手列表 | 通过 | 后端返回 10 个真实助手 |
| 真实任务列表 | 通过 | 后端返回 9 个真实任务 |
| 工作台数据驱动 | 基本通过 | AI Team / Mission Board / Activity 使用真实 assistants/tasks 派生 |
| AI 通路 | 通过 | 在现有设计师私信中发临时测试消息, AI 回复「工作台 AI 通路可用。」后已删除测试消息和回复 |
| Terminal | 通过 | UI 内执行 `pwd` 正常 |
| 前端 build | 通过 | `pnpm -C web build` 成功 |
| 后端 build | 失败 | `TS2688: Cannot find type definition file for 'node'`, 原因是缺 `@types/node` |
| git 状态 | 不可用 | 当前目录不是 git 仓库 |

## 3. 真实数据盘点

### 3.1 真实助手

当前后端有 10 个助手:

- 数据分析师
- 技术负责人
- 产品经理
- 设计师
- 设计师gpt-image-2
- 市场研究
- 教研架构师 (Edu)
- 会议秘书
- 测试工程师
- 软件工程师

多数助手已配置本地 baseURL 和 key, 具备真实 AI 回复能力。数据分析师仍指向 OpenAI 默认且无 key, 在产品上会显得像一个不可用成员。

### 3.2 真实任务

当前后端有 9 个任务:

- 7 个待办
- 2 个进行中
- 0 个完成
- 0 个复核

这意味着 Delivery Panel / Human Approval 在真实状态下为空是合理的, 但用户会觉得“交付闭环不存在”。这不是展示问题, 是产品状态机缺失。

### 3.3 真实频道与消息

频道、DM 和历史消息都存在, `#ai` 频道里已有多助手围绕项目改进的讨论。这是很好的原始资产, 但工作台没有把这些讨论自动沉淀成目标、任务、审查、交付。

## 4. 哪些是真实能力, 哪些还是界面表达

### 真实能力

- 多助手配置和真实 AI 回复。
- 频道 / DM / @ 提及 / 实时消息。
- 任务创建、移动、指派。
- 工作台读取真实助手与真实任务。
- 终端真实可用。
- 工具调用体系在后端存在。
- 助手记忆字段和 remember 工具存在。

### 仍偏 UI 表达

- 自动任务拆解。
- 并行执行调度。
- Reviewer 自动审查。
- 质量门禁。
- Delivery 交付物。
- Human Approval 落库。
- Activity / Audit Trail 的完整真实审计。
- Context Vault 真实文档读取和上下文注入。
- Agent trust level 的真实权限治理。

结论: 当前项目已经不是普通聊天 demo, 但还不是完整 AI Workforce Platform。它处在“真实聊天/助手/任务底座 + 工作台壳 + 部分真实数据派生”的阶段。

## 5. 关键可信度问题

1. `web/src/lib/types.ts` 仍有旧注释写着 Activity / Delivery 由 mock 驱动, 与当前“去 mock”目标冲突。
2. `MissionBoard.tsx` 注释仍写“真实任务 + 示例混合”, 并保留 `mission.source === 'mock'` 的 UI 分支。
3. `Agent.isReal` 和 `Mission.source: 'task' | 'mock'` 仍暴露“示例数据时代”的类型设计。
4. UI 里仍有 `Helio 内部版` 文案, 与独立 AI Command Center 定位冲突。
5. 现有文档中多处混杂 Phase 1/2 mock 方案和 Phase 3 去 mock 方案, 用户或下一位 Agent 容易误判当前事实。

这些问题不一定影响运行, 但会严重影响产品可信度和后续自动化任务的判断。

## 6. Build 真实性

```bash
pnpm -C web build
```

结果: 通过。产物 JS 约 `823.39 kB`, gzip 约 `229.54 kB`, 仍有 chunk > 500 kB 警告。

```bash
pnpm -C server build
```

结果: 失败。原因是缺 `@types/node`。这是工程基线问题, 不应长期作为“已知可忽略”存在。

## 7. 本次测试留下的数据

本次为了验证真实 AI 通路, 在已有“设计师”私信里创建了一条带临时标记的测试消息, 等 AI 回复后立即通过 API 删除了测试消息和对应 AI 回复。

未创建测试人物, 未创建测试任务, 未保留假交付物。

