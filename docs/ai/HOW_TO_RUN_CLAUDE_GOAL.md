# HOW_TO_RUN_CLAUDE_GOAL

这份说明用于在 `helio-clone` 项目里运行 Claude Code 的 `/goal` 长任务。

## 1. 进入项目目录

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
```

确认位置:

```bash
pwd
```

应该输出:

```text
/Users/kaiwu/Documents/kyle-agent/helio-clone
```

## 2. 打开 Claude Code

```bash
claude
```

如果你想继续最近会话:

```bash
claude -c
```

如果你担心旧上下文干扰, 建议直接开启新会话:

```bash
claude
```

## 3. 复制 `CLAUDE_GOAL_PROMPT.md` 内容

在另一个终端或编辑器中打开:

```bash
cat docs/ai/CLAUDE_GOAL_PROMPT.md
```

复制整个文件内容。第一行必须是:

```text
/goal
```

不要漏掉后面的完成条件、禁止事项、build 处理和最终回复格式。

## 4. 运行 `/goal`

回到 Claude Code 终端, 粘贴 `docs/ai/CLAUDE_GOAL_PROMPT.md` 的完整内容, 然后回车。

Claude Code 会进入长任务执行模式。它应该按提示词顺序:

1. 先读取项目。
2. 生成审计和计划文档。
3. 小步修改现有代码。
4. 生成交付、审查、build、最终报告文档。
5. 运行 build。
6. 如果 build 失败, 最多自动修复 3 轮。
7. 输出最终完成状态。

## 5. 查看执行结果

重点查看这些文件:

```bash
ls docs/ai
```

必须看到:

```text
PROJECT_AUDIT.md
PLAN.md
DESIGN_BRIEF.md
DELIVERY.md
REVIEW.md
BUILD_RESULT.md
FINAL_REPORT.md
```

查看最终报告:

```bash
sed -n '1,240p' docs/ai/FINAL_REPORT.md
```

查看交付记录:

```bash
sed -n '1,260p' docs/ai/DELIVERY.md
```

查看自审 verdict:

```bash
tail -n 5 docs/ai/REVIEW.md
```

`REVIEW.md` 最后一行应该是:

```text
FINAL_VERDICT: PASS
```

或:

```text
FINAL_VERDICT: NEED_FIX
```

## 6. 查看 build 结果

```bash
sed -n '1,260p' docs/ai/BUILD_RESULT.md
```

你也可以手动复跑:

```bash
pnpm -C web build
```

如果目标中包含后端 build, 再跑:

```bash
pnpm -C server build
```

注意: 现有历史记录显示 server build 可能因为缺少 `@types/node` 失败。以 Claude Code 新生成的 `BUILD_RESULT.md` 为准, 不要凭印象判断。

## 7. 查看 git diff

当前项目路径审计时显示不是 git 仓库。如果后续你把它放回 git 仓库, 可以在真实仓库根目录运行:

```bash
git status --short
git diff --stat
git diff
```

如果仍然提示:

```text
fatal: not a git repository
```

说明当前位置没有 `.git`, 需要先确认仓库根目录。

## 8. 如果 Claude 跑偏了, 如何停止或重新开始

如果 Claude Code 开始全量重写、删除功能、复制 Markus、清数据库、或长时间重复修同一个错误:

1. 在 Claude Code 终端按 `Esc` 或 `Ctrl+C` 中断。
2. 明确告诉它:

```text
停止当前方向。不要重写项目。回到 docs/ai/CLAUDE_GOAL_PROMPT.md 的完成条件, 只做最小必要修改, 保留现有功能。
```

3. 如果已经改坏, 先查看改动:

```bash
git status --short
git diff --stat
```

如果不是 git 仓库, 就人工检查最近修改文件。不要让 Claude 运行破坏性 reset。

重新开始时, 建议重新打开 Claude Code:

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
claude
```

然后重新粘贴 `CLAUDE_GOAL_PROMPT.md`。

## 9. 如果 build 失败, 应该让 Claude 怎么继续

如果 Claude 最终输出 `Build: FAIL` 或 `FINAL_VERDICT: NEED_FIX`, 先读:

```bash
sed -n '1,260p' docs/ai/BUILD_RESULT.md
sed -n '1,260p' docs/ai/REVIEW.md
```

然后在 Claude Code 里继续说:

```text
继续从 docs/ai/BUILD_RESULT.md 和 docs/ai/REVIEW.md 里的失败点处理。只修 build 失败的最小原因, 不要重写项目, 不要删除现有功能。修完重新运行失败的 build 命令, 并更新 BUILD_RESULT.md、REVIEW.md、FINAL_REPORT.md。
```

如果它已经自动修复 3 轮仍失败, 先人工判断是否需要:

- 补依赖。
- 调整 TypeScript 类型。
- 接受某个历史 server build 问题暂不纳入本轮验收。
- 缩小本轮目标到 `pnpm -C web build`。

## 10. 人工验收清单

产品验收:

- 首页或默认主界面是 AI Team Workspace / Command Center, 不是普通聊天空白页。
- 首屏能看出 AI Team、Mission Board、Activity、Delivery、Context。
- 能看到 Task Breakdown / Parallel Execution / Quality Review / Human Approval 的界面表达。
- 中文文案自然, 信息层级清楚。
- 审美克制、高级、深色模式友好, 不像普通后台模板。
- 没有复制 Markus UI 或文案。

功能验收:

- 频道消息还能打开。
- 私信还能打开。
- 消息发送不受影响。
- Thread 还能打开。
- Inbox 还能打开。
- 任务视图还能打开并操作。
- Terminal 还能打开。
- 助手创建/编辑/删除入口还在。
- provider/baseURL/apiKey/model 配置路径还在。
- 主题切换和身份切换还在。

文档验收:

- `docs/ai/PROJECT_AUDIT.md` 内容和当前项目一致。
- `docs/ai/PLAN.md` 没有要求推翻重写。
- `docs/ai/DESIGN_BRIEF.md` 明确不复制 Markus。
- `docs/ai/DELIVERY.md` 记录真实改动。
- `docs/ai/REVIEW.md` 最后一行包含 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。
- `docs/ai/BUILD_RESULT.md` 记录真实 build 命令和结果。
- `docs/ai/FINAL_REPORT.md` 有人工验收步骤。

安全验收:

- 没有运行 `pnpm db:reset`。
- 没有删除 `server/prisma/dev.db`。
- 没有把 API key 写进文档或前端。
- 没有移除工具调用安全边界。
- 没有破坏 WebSocket event contract。
