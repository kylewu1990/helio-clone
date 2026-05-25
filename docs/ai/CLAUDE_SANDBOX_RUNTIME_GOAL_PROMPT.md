/goal

在 `/Users/kaiwu/Documents/kyle-agent/helio-clone` 继续改进 Task Execution Runtime:借鉴 Markus 的运行逻辑,但不要复制 Markus UI/文案/源码,不要把项目改成 Markus clone。先读 `docs/ai/MARKUS_RUNTIME_REFERENCE.md`、`docs/ai/SANDBOX_EXECUTION_DESIGN.md`、`docs/ai/CLAUDE_EXECUTION_INTELLIGENCE_FIX_PROMPT.md` 和当前代码。目标:让 AI 写代码/跑命令/交付前必须先在真实沙盒里执行、测试、产出报告,再由人类批准应用。

本机内部 smoke 可用 OpenAI-compatible: Base URL `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。可写入 docs/测试脚本/本地临时配置,不要写进业务代码、前端展示、构建产物或最终分发配置。

硬约束:
- 不重写项目,不删除现有聊天/助手/任务/终端/Mission/Review/Delivery/Audit/TaskRun/Approval 功能。
- 不造假执行日志、假任务、假人物、假测试结果。只有真实 TaskRun/SandboxRun/命令日志才能显示执行中或已验证。
- 禁止 `db:reset`、禁止清库、禁止执行远程 `curl|bash` 安装脚本。
- 不复制 Markus AGPL 源码;只借鉴状态机、审批、工具安全、报告、沙盒思想。

必须实现:
1. 新增 sandbox runtime:每次代码/命令类 TaskRun 创建隔离目录 `.helio/sandboxes/<runId>/workspace`。若项目是 git repo 可用 worktree;当前非 git repo 时必须支持 copy fallback。忽略 node_modules/dist/uploads/dev.db/.env/key 等。
2. 新增或扩展数据模型记录 SandboxRun/SandboxLog/SandboxArtifact,并生成 API 报告。所有命令、stdout/stderr、exitCode、耗时、diff/build/test/artifact 必须落库或可由报告读取。
3. 任务执行中的 `run_command` 默认在 sandbox cwd 执行;cwd 不能逃出 sandbox。低风险只读命令可免审批;写/安装/build/test 只允许在 sandbox 内;危险命令仍硬拦截;网络默认禁用或需策略/审批。
4. 新增受控 `write_file`/`apply_patch` 或等效写入能力时,只能写 sandbox,不能直接写主项目。若暂不做写入工具,必须在报告写清楚限制。
5. 执行结束自动生成 execution report:执行人、触发者、状态、工具调用、命令日志、changed files、diff、build/test 结果、最终 output/error、artifact manifest。
6. 前端任务报告面板显示 sandbox 状态、日志、diff/build/test/artifact,提供“批准应用到主项目”和“丢弃沙盒”。批准前不得修改主项目。
7. apply/discard API 必须写 AuditEvent。apply 前要 dry-run 校验,禁止应用 `.env*`、key、dev.db、uploads、node_modules、dist 等敏感/生成文件。
8. 成功 apply 后任务进入 review/delivery 流程;失败或丢弃要真实显示原因。
9. 更新 docs/ai: `MARKUS_RUNTIME_REFERENCE.md`、`SANDBOX_EXECUTION_DESIGN.md`、`BUILD_RESULT.md`、`REVIEW.md`、`FINAL_REPORT.md`、新增 `SANDBOX_RUNTIME_TEST_REPORT.md`。

验收:
- `pnpm -C web exec tsc --noEmit` PASS。
- `pnpm -C web build` PASS。
- `pnpm -C server build` PASS。
- `pnpm -C server exec prisma validate` PASS。
- smoke A:执行 `pwd` 的任务显示 cwd 在 `.helio/sandboxes/<runId>/workspace`。
- smoke B:尝试读 `~/.ssh/id_rsa` 或逃出 cwd 被拒绝并记录。
- smoke C:代码类任务在 sandbox 内运行 build/test,报告显示命令、退出码、日志。
- smoke D:丢弃 sandbox 后主项目未改变;批准 apply 只应用允许 diff。
- REVIEW 最后一行必须是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。如果 NEED_FIX,最多自动修复 3 轮并记录。

最终回复格式:
`SANDBOX_RUNTIME_READY` 或 `SANDBOX_RUNTIME_NEED_FIX`,附 build/test/smoke 摘要与人工验收步骤。
