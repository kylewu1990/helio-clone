/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续修复 Task Execution Runtime。先读 `docs/ai/TASK_EXECUTION_CAPABILITY_TEST_REPORT.md`、`docs/ai/REVIEW.md`、`docs/ai/FINAL_REPORT.md`,再读代码。目标:让“发布任务→AI 执行→工具调用→报告查看”变得真实、聪明、可见,不要再让普通 task.status 伪装成 AI 正在执行。

本机内部测试可直接用本地 OpenAI-compatible 配置: Base URL `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。内部测试阶段可写入 `.env`、providers、助手配置、测试脚本、docs;最终分发前提供 grep/清理步骤。

硬约束:
- 不重写项目,不删除已有聊天/助手/任务/终端/Mission/Review/Delivery/Audit/TaskRun/Approval 功能。
- 不造假执行日志/假报告/假工具调用。只有存在真实 TaskRun 才能显示“执行中/待批准/已完成”。
- 禁止 db:reset,禁止清库。临时测试数据必须用唯一标记并清理。

必须修复:
1. **清除假执行语义**: UI 上 `task.status === doing` 不能等同 AI 正在执行。任务卡/TaskBreakdown 只有存在最新 TaskRun 且状态 running/needs_approval/succeeded/failed/cancelled 时,才显示执行状态。无 TaskRun 的 doing 只能显示“手动进行中”或不显示执行徽章。
2. **真实触发入口**: 对已指派 AI 的任务,在 MissionBoard、TaskBreakdown、TasksView 都提供明确“开始执行”按钮。点击后创建 TaskRun;未指派 AI 时提示先指派。
3. **更聪明的工具/Agent 路由**: 发布任务或开始执行前,根据任务意图和助手 skills 判断是否应换人/协作。例如“查天气/查资料/联网”不能交给无 fetch_url/run_command 的产品经理直接空答;应自动建议或路由给具备 fetch_url/run_command 的助手,或提示缺 city 后再执行。
4. **天气案例最小可用**: 对“查天气”任务,如果缺城市,先向用户要城市;如果有城市,优先用 fetch_url 或低风险 run_command(curl wttr.in 或同类公开源)获取真实信息。不要只调用 current_datetime 就结束。若网络失败,报告失败原因。
5. **低风险命令策略**: 保留高危审批,但允许把只读低风险命令(date/pwd/ls/curl 公开 GET 等)设计为可配置免审批或轻审批;危险词仍硬拦截。实现前要写清楚策略并在 UI 能看懂。
6. **执行报告入口**: 每个有 TaskRun 的任务卡必须能打开“执行详情/报告”面板,集中展示:状态、执行人、触发者、开始/结束时间、AI 消息、toolsUsed、每次工具调用输出、审批记录、最终 output/error、相关 DM 跳转。
7. **完成后落地交付**: TaskRun succeeded 后任务进入 review,并可一键生成 Delivery 或在报告中显示“生成交付”入口。
8. **文档更新**: 更新 BUILD_RESULT、REVIEW、FINAL_REPORT、TASK_EXECUTION_CAPABILITY_TEST_REPORT,如实记录真实测试。

验收:
- web tsc、web build、server build、prisma validate 均 PASS。
- 用真实助手跑 3 个 smoke:
  A. 无 TaskRun 的 doing 不显示为 AI 执行中。
  B. “查天气”任务缺城市时请求城市;给定城市后调用真实工具获取结果或明确失败原因。
  C. 指派给软件工程师的命令类任务点击开始执行后,TaskRun/工具调用/审批或低风险放行/报告面板都真实可见。
- REVIEW 最后一行写 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。
