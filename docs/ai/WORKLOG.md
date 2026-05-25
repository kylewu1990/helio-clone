# WORKLOG — 本次会话工作记录

> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 日期: 2026-05-25
> 性质: 在现有半成品基础上小步增强, 不推翻重写, 不删现有功能, 不改后端。
> 目标: 把项目收束为有独立审美的 AI Team Workspace / Command Center, 仅借鉴 Markus 产品逻辑, 不复制其 UI/文案/品牌。

本会话分两轮执行(同一目标的两次迭代)。

---

## 第一轮 · Command Center 结构补齐

### 背景
工作台首屏(`WorkspaceView` + `workspace/*`)已有 Phase 1+2 成果: AI 团队、任务看板、运行日志、交付确认、上下文抽屉。对照目标缺少 4 个结构, 且品牌仍是「Helio · 内部版」。

### 做了什么
- 新增 3 个工作台组件:
  - `TaskBreakdown.tsx` — 任务拆解 + 并行执行(总目标 → 子任务 → 负责人 → 状态 → 依赖 → 交付物)。
  - `QualityReview.tsx` — 质量审查(verdict / 检查清单 / notes)。
  - `ApprovalGate.tsx` — 人工确认门(聚合待确认事项, 内联确认/暂缓)。
- `AgentRoster.tsx` 增加「N 路并行」并行执行指示。
- `Rail.tsx` 品牌从字母 `H` + 「Helio · 内部版」收束为 orbit 渐变标记 +「AI Workforce · Command Center」(独立审美, 不复制 Markus)。
- 数据层: `types.ts` 追加 Subtask/MissionPlan/ReviewItem/ApprovalItem 等类型; `mockData.ts` 集中追加示例; `workspace.ts` 追加派生函数。
- `theme.css` / `index.css` 小步追加并行轨道色、verdict 色与动效。

### 结果
`pnpm -C web build` 通过; 首屏完整呈现八大结构 + 人工确认门。但为「首屏不空」引入了较多 mock 假数据(为第二轮埋下问题)。

---

## 第二轮 · 真实数据驱动(去 mock)

### 背景(新约束)
目标新增硬约束: **禁止假数据** —— 不要假 Agent / 假 mission / 假 delivery / 假测试结果 / 假 demo; 已有 mock 只能减少/替换/隔离, 不得扩大; 优先真实后端、真实助手、真实任务、真实运行日志。

实测后端在线, 有真实数据: 5 用户 + **10 个真实助手** + **9 个真实任务**(8 待办 + 1 进行中)。足以真实驱动整个工作台。

### 做了什么
- **删除全部假产品数据**(`mockData.ts`): 移除 `MOCK_AGENTS / MOCK_MISSIONS / MOCK_ACTIVITIES / MOCK_DELIVERIES / MOCK_SUBTASKS / MOCK_REVIEWS`; 仅保留指向**真实仓库文档**的 `CONTEXT_VAULT_ITEMS`。
- **派生层改真实**(`workspace.ts`):
  - AI 团队 ← 真实助手(角色由真实 skills/名称推断, 忙闲由任务+实时状态派生)。
  - 任务看板 ← 真实任务(todo/doing/done → 列; Review 列后端无状态 → 留空, 诚实)。
  - 任务拆解 ← 真实任务按 `channel` 分组(频道=总目标, 任务=子任务); 不伪造依赖/进度。
  - 并行执行 ← 真实 `doing` 任务的不同负责人数(仅 1 路则不虚标「N 路并行」)。
  - 运行轨迹 ← 真实任务更新事件。
  - 交付确认 ← 真实 `done` 任务(不伪造测试/风险徽章)。
  - 人工确认门 ← 真实待确认交付聚合。
- **组件适配真实/空状态**:
  - `TaskBreakdown` 去掉伪造百分比, `doing` 改不定态轨道条; 无任务时空状态。
  - `QualityReview` 改诚实空状态(后端无自动审查, 不展示任何示例结论)。
  - `DeliveryPanel` 适配可选 test/risk + 显示真实负责人 + 空状态。
- `types.ts`: `Delivery.testResult/riskLevel` 改可选, 加真实负责人字段。
- `index.css`: 假进度流光 `.lane-fill` → 不定态 `.lane-indeterminate`。

### 结果
- `pnpm -C web exec tsc --noEmit` 通过(`noUnusedLocals` 通过)。
- `pnpm -C web build` 通过(1879 modules; JS 823.39 kB, 删假数据后略减)。
- 工作台完全真实数据驱动, 无任何假人物/假任务/假交付/假测试结果; 无真实源处用诚实空状态。
- 本地测试 LLM 的 model/baseURL/key **未写入任何代码、前端或交付文档**(已校验)。

---

## 保留的现有功能(两轮均未破坏)

频道 / 私信 / 实时 WebSocket 消息 / Thread / Inbox / Tasks / Terminal; 助手创建·编辑·删除; 助手 provider/baseURL/apiKey/model 配置; AI skills 与 tool calling; 停止生成; 主题切换; 身份切换; 现有所有 workspace 组件与非工作台视图; 所有 REST / WS payload 契约。

## 未改动 / 未做

- 未改 `server/*`、`schema.prisma`、`dev.db`、`package.json`、`pnpm-lock.yaml`、`api.ts`、`ws.ts`、`App.tsx` 业务逻辑。
- 未运行 `pnpm db:reset`, 未动数据库数据。
- `pnpm -C server build` 仍失败(预先存在的 `@types/node` 缺失, 范围外, 项目方已知并以 tsx 运行后端)。
- 真实多 Agent runtime / 自动拆解 / 自动审查 / 审批落库 —— 未实现(属 Phase 3/4)。
- 未做浏览器截图回归(后端在线且接口正常, 但未可视化验证)。

## 改动文件总览(本会话)

新增组件: `web/src/components/workspace/{TaskBreakdown,QualityReview,ApprovalGate}.tsx`
修改前端: `web/src/components/workspace/{WorkspaceView,AgentRoster,DeliveryPanel}.tsx`、`web/src/components/Rail.tsx`、`web/src/lib/{types,mockData,workspace}.ts`、`web/src/theme.css`、`web/src/index.css`
文档: `docs/ai/{PROJECT_AUDIT,PLAN,DESIGN_BRIEF,DELIVERY,REVIEW,BUILD_RESULT,FINAL_REPORT}.md`(+ 本文件 `WORKLOG.md`)

## 第四轮 · Full Delivery 完整版(真实工作流内核)

把「真实数据驱动展示」升级为「真实持久化工作流」,打通 `Goal/Mission → 任务拆解 → 质量审查 → 交付 → 人工确认 → 审计轨迹`。

- 后端:Prisma 新增 `Mission/Review/Delivery/AuditEvent` + 扩展 `Task`(`db push` 增量迁移,不丢数据);新增 missions/reviews/deliveries/audit-events/context-docs 共 6 组真实 API;关键动作写 append-only AuditEvent(含 task 状态变更、终端命令、AI 工具调用)。
- 前端:删除 `mockData.ts` 与 `isReal/source/ContextVaultItem` 等 stale mock;types/api/workspace 全量改真实;App 接入工作流回调;首页 CTA 改为「输入目标创建 Mission」;新增 MissionStrip;TaskBreakdown 显示选中 Mission 的真实子任务并可加子任务;QualityReview 提交真实审查;DeliveryPanel/ApprovalGate 审批落库;ActivityFeed 读真实审计;ContextVault 读真实文档+搜索。
- 品牌:`Helio 内部版` → `Heliox · AI 工作台`(Rail + Sidebar)。
- 工程:修复 `pnpm -C server build`(vendored `@types/node` + `ws` 类型/隐式 any 修复),web 与 server build 均通过。
- 验证:API smoke + 端到端工作流 smoke(6 类审计按序写入、审批持久化)+ 真实 AI smoke(测试工程师回「通路可用」);所有测试数据用后即删,最终 missions 0 / tasks 9 / audit 0,无假数据。

## 相关文档

- 审计: `docs/ai/PROJECT_AUDIT.md`
- 计划: `docs/ai/PLAN.md`
- 设计: `docs/ai/DESIGN_BRIEF.md`
- 交付: `docs/ai/DELIVERY.md`
- 自审: `docs/ai/REVIEW.md`(末行 `FINAL_VERDICT: PASS`)
- 构建: `docs/ai/BUILD_RESULT.md`
- 终报: `docs/ai/FINAL_REPORT.md`(含人工验收步骤)
