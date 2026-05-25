# Sandbox Execution Design

> 日期: 2026-05-25  
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`  
> 目标: 让 AI 写代码/跑命令/交付结果时,先在强隔离沙盒里验证,再由人类决定是否应用到主项目。

## 1. 为什么必须做沙盒

当前 `run_command` 已经可以真实执行,也有审批门和低风险命令策略。但它的 cwd 默认仍是项目根,这意味着 AI 一旦获得命令能力,就可能直接影响主工作区。即使有命令分类,也不能作为真正安全边界。

用户体验上的问题是:

- 发布任务后,用户不知道 AI 是否真的在跑。
- AI 说“完成了”,但不知道代码是否能 build。
- 没有可复核的 diff/test/artifact。
- 如果 AI 写坏主项目,回滚成本高。

所以后续应把“AI 执行”改成:

```text
主项目只读快照 -> 独立 sandbox/worktree -> AI 写/跑/测 -> 生成报告 -> 人工批准 -> 应用到主项目
```

## 2. 推荐安全等级

### Level 0: 当前状态

- 命令在项目根执行。
- 有危险命令拦截和审批。
- 不够安全,只能用于内部短期 smoke。

### Level 1: 路径隔离

- 每个 TaskRun 建一个目录: `.helio/sandboxes/<runId>/workspace`。
- 文件工具和 shell cwd 限制在 sandbox 内。
- 禁止 `cwd` 越界。
- 主项目不直接被 AI 改。

这是最小必须做的版本。

### Level 2: Git worktree 隔离

- 如果当前项目是 git repo,为每个 run 创建 worktree/branch。
- 如果不是 git repo,复制工作区到 sandbox。
- 用 `git diff --no-ext-diff` 生成 patch。
- 人工批准后用 `git apply --check` + `git apply` 或文件复制应用。

当前 helio-clone 不是 git repo,所以要支持 fallback copy 模式。

### Level 3: Container 强隔离

如果本机有 Docker/Colima:

- `docker run --rm`
- bind mount sandbox workspace。
- 默认 `--network=none`。
- 设置 CPU/memory/pids 限制。
- 只注入必要 env,默认不传宿主机 `.env`。
- 非联网任务禁网;联网任务需显式策略/审批。

这是代码执行最推荐的强沙盒。

### Level 4: macOS sandbox fallback

如果没有 Docker,可检测 `/usr/bin/sandbox-exec`:

- 只允许读写 sandbox。
- 只读挂载必要系统路径。
- 禁止访问 home、ssh、keychain、Downloads、Desktop 等。

注意: `sandbox-exec` 在 macOS 上属于老机制,可作为本地 fallback,但长期更推荐容器。

## 3. 数据模型建议

可新增模型,也可先扩展 `TaskRun`。推荐独立模型,便于展示和审计。

### SandboxRun

```text
id
taskRunId
taskId
missionId
mode: copy | git_worktree | docker | macos_sandbox
rootPath
workspacePath
baseRef
branchName
status: preparing | running | testing | ready_for_review | applied | discarded | failed
networkPolicy: none | allow_public_get | full_with_approval
createdAt
endedAt
```

### SandboxLog

```text
id
sandboxRunId
seq
type: prepare | command | stdout | stderr | tool | test | diff | system | error
command
cwd
exitCode
durationMs
content
createdAt
```

### SandboxArtifact

```text
id
sandboxRunId
kind: diff | file | directory | screenshot | build_result | report
path
summary
sizeBytes
metadataJson
createdAt
```

## 4. 后端 API 建议

### 启动沙盒执行

```http
POST /api/tasks/:id/execute
```

扩展 body:

```json
{
  "mode": "sandbox",
  "networkPolicy": "none",
  "runBuild": true
}
```

行为:

- 创建 TaskRun。
- 创建 SandboxRun。
- 准备 sandbox workspace。
- AI 工具上下文里的 `run_command`、`read_file`、未来 `write_file/apply_patch` 全部指向 sandbox。

### 查看沙盒报告

```http
GET /api/task-runs/:runId/sandbox-report
```

返回:

- TaskRun 基础信息。
- SandboxRun 状态。
- 命令日志。
- tool calls。
- changed files。
- diff。
- build/test 结果。
- artifacts。
- approval 状态。

### 应用或丢弃

```http
POST /api/task-runs/:runId/apply
POST /api/task-runs/:runId/discard
```

`apply` 必须:

- 要求人类身份。
- 先 `git apply --check` 或等效 dry-run。
- 不覆盖 `.env`、key、database、uploads、node_modules、dist。
- 写 AuditEvent。
- 成功后任务进入 review/delivery 流程。

## 5. 工具策略

### run_command

默认规则:

- 任务执行里所有命令在 sandbox cwd。
- `cwd` 只能是 sandbox 子目录。
- 低风险只读命令可免审批。
- 写文件/安装依赖/build/test 允许在 sandbox 内执行,但要记录日志。
- `rm -rf /`、`sudo`、`shutdown`、`git push`、`curl | bash` 继续硬拦截。
- 需要网络的命令默认拒绝,除非任务声明联网并通过策略。

### read_file/list_dir

- 任务执行时优先读 sandbox。
- 可读主项目只读快照,但不能读敏感文件。
- 禁止读 `~/.ssh`、keychain、`.env*`、tokens、系统敏感路径。

### write_file/apply_patch

新增时必须只写 sandbox:

- 路径必须在 sandbox workspace 内。
- 单文件大小限制。
- 二进制默认禁止。
- 写入前后记录 hash/size。
- 所有变更进入 diff/artifact,等待人类批准。

## 6. UI 设计

### 任务卡

有 TaskRun 时显示真实状态:

- 准备沙盒
- 执行中
- 等待审批
- 测试中
- 待人工验收
- 已应用
- 已丢弃
- 失败

无 TaskRun 时不显示 AI 执行中。

### 报告面板

必须展示:

- 执行人、触发人、开始/结束时间。
- 沙盒路径和模式。
- 命令列表、退出码、耗时。
- stdout/stderr 截断预览和完整日志入口。
- toolsUsed 与每次工具输出。
- build/test 结果。
- changed files/diff。
- artifacts。
- “批准应用到主项目” / “丢弃沙盒”。

## 7. 实施顺序

1. 新增 sandbox service,只负责创建/清理目录与路径校验。
2. 把 task execution 的 `run_command` cwd 改为 sandbox。
3. 增加 SandboxRun/SandboxLog/SandboxArtifact 落库。
4. 执行完成后自动收集 diff/changed files。
5. 自动运行 build/test:先识别根 `package.json` 和 workspace scripts。
6. 前端报告面板读取 sandbox report。
7. 增加 apply/discard API。
8. 增加 smoke tests。
9. 最后再做 write_file/apply_patch。

## 8. Smoke Test 必须真实跑

不要编造测试结果。内部测试可使用本地 OpenAI-compatible 配置:

```text
Base URL: http://127.0.0.1:8317/v1
model: gemini-2.5-flash
key: sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd
```

可写入 docs、测试命令、本地临时配置。不要写入业务代码、前端展示、构建产物或最终分发配置。

测试清单:

- `pwd` 在 sandbox 内,不是主项目根。
- `touch /tmp/helio_escape_test` 是否按策略处理并记录。
- `cat ~/.ssh/id_rsa` 必须拒绝。
- `cd .. && pwd` 不能逃出 sandbox。
- `pnpm -C web build` 在 sandbox 内运行并记录结果。
- 修改一个临时文件后能生成 diff。
- 丢弃 sandbox 后主项目未变化。
- 批准 apply 后主项目只应用允许的 diff。
- 所有临时测试数据用唯一标记,最后清理。

## 9. 风险点

- helio-clone 当前不是 git repo,不能只依赖 git worktree。
- 复制 node_modules 成本高,可优先复用 pnpm store 或只复制源码后执行 `pnpm install --offline`/`pnpm install`。
- Docker 不一定存在,必须 fallback。
- 网络禁用会导致依赖安装失败,需要区分“代码验证”与“依赖安装”阶段。
- SQLite dev.db、uploads、providers/key 不应进入 sandbox diff。
- 不能把本地测试 key 放进前端 bundle 或未来分发配置。

## 10. 实现状态(2026-05-25 已落地)

按本设计的 Level 1(路径隔离)+ 部分 Level 2 思路落地为 `server/src/sandbox.ts`,数据模型与 API 与第 3/4 节一致。

已实现:

- **模式**:`copy` fallback(项目非 git repo)。逐顶层条目复制源码到 `base/` 与 `workspace/`(Node `cp` 不允许拷进自身子目录,故逐条目),忽略 `node_modules/dist/.helio/uploads/*.db/.env*/key/pem/...`;`node_modules` 软链注入 `workspace`,使 build/test 可跑且不进 diff。`base/` 作为 diff 基线。
- **数据模型**:`SandboxRun / SandboxLog / SandboxArtifact`(标量外键,db push 增量)。
- **run_command**:任务执行(`ctx.exec.sandbox`)时 cwd 默认 `workspace`;`guardSandboxCommand` 拒绝沙盒外绝对路径 / `~` / 越界 `..` / cwd 越界;命中 `classifyCommand=blocked` 硬拦截;低风险只读免审批;其余转人工审批门。每条命令落 `SandboxLog(type=command)`(command/cwd/exitCode/durationMs/stdout)。env 经 `sandboxEnv()` 脱敏(剥离 KEY/SECRET/TOKEN/OPENAI 等)。
- **write_file**:仅沙盒运行时可用;路径限 `workspace` 内;拒 `.env/key/db`;落 `SandboxLog(type=tool)`。聊天路径不提供。
- **收尾 finalize**:`collectDiffFs`(哈希比对 + 系统 `diff -ruN` 忽略生成目录)→ 写 `SandboxLog(type=diff)` + `SandboxArtifact(kind=diff/file)`;有代码改动则按变更包跑 `pnpm -C <pkg> build`(及 test 若有),落 `SandboxLog(type=test)` + `SandboxArtifact(kind=build_result)`;状态置 `ready_for_review`,记 `diffSummary/buildResult`。
- **apply/discard**:`POST /api/task-runs/:runId/apply`(dry-run 校验,拒 `.env*/key/db/uploads/node_modules/dist/providers.json/.git`,只写 added/modified,deleted 仅报告)与 `discard`(删隔离目录),均写 `AuditEvent`;成功 apply 后任务进 `review`。
- **报告**:`GET /api/task-runs/:runId/sandbox-report` 与 `GET /api/tasks/:id/report` 的 `sandbox` 字段;前端 `TaskReportModal` 沙盒面板展示状态/路径/diff/build·test/变更文件/命令日志 + 批准应用/丢弃。
- **网络策略**:`networkPolicy=allow_public_get`(无容器无法真正禁网;curl/wget 仅 GET 由 classifyCommand 限制,非 GET 转审批)。

未实现(后续):

- Level 3 容器(Docker/Colima `--network=none` + 资源限制)与 Level 4 `sandbox-exec`,做 OS 级强隔离与真正禁网。
- git worktree 模式(待项目变为 git repo 后启用,字段已预留 `mode`)。
- `apply_patch`/删除文件的受控应用(当前 apply 只处理 added/modified)。

测试:`docs/ai/sandbox_smoke.ts`(确定性 A/B/C/D)+ `sandbox_e2e*.mjs`(API + 本地 LLM),详见 `SANDBOX_RUNTIME_TEST_REPORT.md`。
