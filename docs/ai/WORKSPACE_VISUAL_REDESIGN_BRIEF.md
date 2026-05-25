# WORKSPACE_VISUAL_REDESIGN_BRIEF

> 日期: 2026-05-25
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 目标: 进入「产品体验大改」阶段。安全强隔离暂后置,优先把任务发布、AI 执行、工具调用、沙盒运行、交付验收做成用户能看懂、能介入、能复盘的 AI Workspace。

## 1. 当前判断

当前后端已经能真实执行任务、写沙盒、跑命令、截图、生成报告,但 UI 仍像把执行结果塞回聊天气泡和普通卡片。用户看不到一个完整的「AI 正在做什么」窗口,也不容易理解任务从发布到交付的流程。

必须修的核心体验:

- 发布任务后立刻出现一个可视化执行窗口,而不是只在聊天里回复一段文字。
- 用户能看到执行阶段:理解目标、选择执行人、拆步骤、调用工具、跑命令、产物生成、质量检查、待批准、已交付。
- 每次工具调用都要有可读时间线:工具名、输入摘要、输出摘要、状态、耗时、截图/文件/diff 链接。
- 任务卡只是入口,真正的执行体验应该在 drawer/modal/workspace panel 里完成。
- Chat 仍保留,但不能再承担全部执行可视化责任。

## 2. 参考逻辑,不复制

### Genspark 可借鉴

公开页面与帮助中心强调:all-in-one AI Workspace、Workflows、Teams、Drive;Workflow 支持从自然语言描述创建自动化,然后 Test Run 验证,确认后 Turn On;运行历史在中间面板,点击 run 后在右侧看完整结果;等待用户输入时能在 run record 里直接处理。

可借鉴成 helio-clone 的逻辑:

- 左侧/顶部是 workspace 导航,核心不是聊天,而是 Mission / Workflow / Runs / Deliverables。
- 创建任务后进入 Run Detail,显示每一步实时状态。
- Test Run / 正式执行 的区别要清晰。
- 结果不是一句回答,而是可打开的交付包。

### Markus 可借鉴

README 的产品逻辑是 AI team:角色、任务拆解、delegation、parallel execution、quality gates、deliverables、audit trail、skills/runtime、memory、heartbeat/proactive work。install 脚本体现零门槛启动、init wizard、desktop shortcut、autostart、health/open browser 的产品化思路。

可借鉴成 helio-clone 的逻辑:

- Mission 内有 Team Assembly、Task Breakdown、Parallel Lanes、Quality Review、Delivery Panel、Audit Trail。
- Agent 有 skills 和 trust level,任务按技能自动推荐执行人。
- 后台执行要有 Run History 和 Execution Timeline。
- 启动/配置体验可以走「本地运行向导」,但本轮不必做安装器。

禁止:

- 不复制 Markus UI、文案、logo、品牌。
- 不把 helio-clone 改成 Markus clone。
- 不用假人物、假任务、假执行日志来撑界面。

## 3. 本轮产品方向

把主界面改成「AI Team Command Center」:

- 第一屏:Mission Command Surface。左上是目标输入与执行模式,中间是任务/运行状态,右侧是 Live Execution Inspector。
- 每个任务都有 Run Window:状态机、执行人、工具调用、沙盒路径、命令日志、浏览器截图、diff、build/test、审批按钮。
- Activity Feed 变成真实 audit timeline,可以按 Mission / Task / Tool / Human Approval 筛选。
- Delivery Panel 变成交付包列表,每个交付包有 artifacts、summary、risk、review notes、apply/discard/approve。
- Context Vault 变成项目记忆区,显示本次 Mission 使用了哪些上下文文档,允许用户在发任务时附加上下文。

## 4. 更开放的工程授权

给 Claude 的限制应放宽:

- 可以大幅重构前端组件结构、样式、布局、状态组织。
- 可以新增必要 API 或调整既有 API 返回字段,但要兼容现有核心功能。
- 可以新增轻量依赖,但要记录原因,不能为了装饰引入大而无用的库。
- 可以继续改 server/task runtime,让执行状态更适合 UI 实时展示。
- 可以改 smoke 脚本,覆盖真实 UI 与真实任务流。

仍必须保留:

- 真实聊天、助手、任务、Mission、Review、Delivery、Audit、TaskRun、SandboxRun、Approval、Context docs。
- 本地 LLM 测试能力。
- 真实 build/smoke 结果,不编造。

## 5. 评分标准

每轮 Claude 自评必须按 100 分:

- 设计品质 30:干净、有层次、现代、适合深色 AI workspace,不普通后台模板。
- 原创性 30:有独立视觉语言和交互结构,只借鉴逻辑不照抄 Genspark/Markus。
- 技术执行 20:真实数据、真实 API、状态机清楚、无假执行、构建通过。
- 可用性 20:用户知道任务在哪、AI 在做什么、哪里要介入、结果在哪验收。

低于 85 必须继续修;低于 75 说明方向没到位,允许大改布局。

## 6. 本轮必须解决的问题

1. 任务执行结果不能只在聊天气泡里。必须有 Execution Window / Run Drawer。
2. 任务发布后必须让用户看到 AI 是否被指派、是否开始、卡在哪一步。
3. 工具调用必须可视化,包括 run_command、write_file、browser_*。
4. 沙盒运行必须可见但不要占据主体验;它应该服务于交付验收。
5. 成功任务必须进入 Review / Delivery,用户能从界面找到交付报告。
6. 当前 `/api/tasks/:id/execute` 长阻塞是体验风险,建议改成异步立即返回 runId,由 WS/轮询刷新。
7. 强隔离安全暂后置,但 UI 文案继续诚实标注「本机信任沙盒」。

## 7. 推荐交付物

- `docs/ai/WORKSPACE_REDESIGN_PLAN.md`
- `docs/ai/WORKSPACE_REDESIGN_DELIVERY.md`
- `docs/ai/WORKSPACE_REDESIGN_REVIEW.md`
- `docs/ai/WORKSPACE_REDESIGN_BUILD_RESULT.md`
- `docs/ai/WORKSPACE_REDESIGN_FINAL_REPORT.md`
- 更新或新增真实 smoke:覆盖发布任务、指派 AI、打开 Run Window、看到工具调用、生成交付、审批。

## 8. 参考来源

- Genspark 首页: https://www.genspark.ai/
- Genspark Workflows Help: https://www.genspark.ai/helpcenter/workflows
- Genspark Teams Help: https://www.genspark.ai/helpcenter/teams
- Markus README: https://github.com/markus-global/markus/blob/main/README.md
- Markus installer: https://www.markus.global/install.sh
