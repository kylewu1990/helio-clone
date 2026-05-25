# FULL_DELIVERY_OPEN_ISSUES

> 用途: 给 Claude Code `/goal` 长任务读取的未解决问题清单。  
> 目标: 从当前半成品继续改到可交付的 AI Workspace / AI Team Command Center / AI Workforce Platform。  
> 原则: 真实可运行, 不做假人物/假任务/假交付/假测试, 不复制 Markus UI/文案。

## 1. 当前最大问题

当前项目已经有真实聊天、真实助手、真实任务、真实终端、真实 AI 回复和一个工作台首页。但它仍缺少真正的工作流内核:

`Goal/Mission → Task Breakdown → Assignment → Execution → Review → Delivery → Human Approval → Audit Trail`

现在多数关键闭环仍是 UI 表达或从任务更新时间推断, 不是持久化业务流程。

## 2. P0 必须解决

1. **产品身份残留**  
   UI 里仍有 `Helio 内部版`。需要统一为独立产品名, Helio 只作为历史来源保留在 README/文档。

2. **server build 失败**  
   `pnpm -C server build` 因缺 `@types/node` 失败。完整版交付必须让 server build 与 web build 都通过。

3. **mock 残留类型与注释**  
   仍有 `isReal`, `source: 'task' | 'mock'`, 旧注释“Activity / Delivery mock 驱动”“真实任务 + 示例混合”等。必须清理, 代码语义与真实数据驱动一致。

4. **缺 Mission / Goal 实体**  
   现在用 channel 或 task 代替 Mission, 不够真实。需要新增 Mission 模型/API/UI。

5. **首页 CTA 错位**  
   `新建任务` 应升级为 `新建 Mission / 输入目标`, 提交后创建真实 Mission 草案。

6. **缺 Review 状态机**  
   需要真实 Review 模型/API/UI, 支持 pass / needs_fix / blocked / reviewer notes / checks。

7. **缺 Delivery 模型**  
   done task 不等于交付物。需要 Delivery 模型/API/UI, 保存摘要、artifact、测试结果、风险、审批状态。

8. **Human Approval 不落库**  
   确认/打回不能只存在前端 state。必须持久化。

9. **Activity 不是审计轨迹**  
   现在从任务 updatedAt 派生。需要 append-only `AuditEvent` 表和真实事件写入。

10. **Context Vault 只能看路径**  
    需要真实读取项目文档、搜索、选择/绑定到 Mission。

## 3. P1 应解决

1. Task 状态从 `todo/doing/done` 升级为真实交付流: `backlog/ready/in_progress/review/needs_fix/delivered/archived`。
2. Task 增加 priority、reviewer、expectedOutput、acceptanceCriteria、dependencies、missionId。
3. Mission Detail 页面显示 goal、context、tasks、review、delivery、audit。
4. AI Team 卡片显示真实 role、trustLevel、model、key 可用性、skills、当前任务。
5. 角色与信任等级不能只靠正则/skills 数量推断; 需要真实字段或稳定映射。
6. Terminal 命令和 AI `run_command` 都写入 AuditEvent。
7. Delivery/Review 能关联 artifact 或文件/消息/终端输出。
8. Context Pack 可绑定到 Mission, 后续 AI 回复可显示引用来源。
9. 前端做 code splitting, 尤其 Terminal 和 Markdown, 降低初始 JS 体积。
10. docs/ai 中旧 Phase 文档需要归档或加“历史记录”标识, 避免误导后续 Agent。

## 4. 完整可交付的最低标准

1. 用户可以在首页输入一个目标并创建真实 Mission。
2. Mission 可以生成或手动维护真实子任务。
3. 任务可以指派给真实助手或真人。
4. 任务状态可以进入 review。
5. Review 可以 pass / needs_fix, 并持久化。
6. Delivered task 可以生成真实 Delivery。
7. Human Approval 可以 approve / reject, 并持久化。
8. Activity Feed 读取真实 AuditEvent。
9. Context Vault 可以打开和搜索真实文档。
10. 现有聊天、助手、任务、终端、主题、身份切换不回归。
11. 不新增假人物、假任务、假交付、假测试结果。
12. `pnpm -C web build` 通过。
13. `pnpm -C server build` 通过。
14. 如果改 Prisma schema, 用不丢数据方式迁移, 禁止 `pnpm db:reset`。

## 5. 推荐实现顺序

1. 修工程基线: `@types/node`, stale mock 类型/注释, 品牌残留。
2. Prisma schema 增加 Mission / Review / Delivery / AuditEvent, 扩展 Task。
3. 后端 API: missions, reviews, deliveries, audit-events, context-docs。
4. 所有关键动作写 AuditEvent。
5. 前端类型与 API 接入。
6. 首页 Mission 输入和 Mission Detail。
7. Mission Board / Task Breakdown 接真实 Mission/Task。
8. Quality Review / Delivery Panel / Human Approval 接真实 API。
9. Context Vault 真实阅读与搜索。
10. AI smoke + API smoke + web/server build + 用户验收文档。

