# Markus Runtime Reference for Heliox

> 日期: 2026-05-25  
> 目的: 只读分析 Markus 的公开安装脚本、README、docs 与源码结构,提炼可借鉴的产品/运行逻辑。  
> 边界: 不运行 `curl | bash`,不复制 Markus UI/文案/源码,不把 helio-clone 改成 Markus clone。

## 1. 安全检查结论

用户给的安装命令:

```bash
curl -fsSL https://markus.global/install.sh | bash
```

本轮没有执行该命令,只把脚本作为文本检查。原因是安装脚本会执行以下本机变更:

- 若 Node.js 22+ 存在,走 `npm install -g @markus-global/cli`。
- 若 Node.js 不满足,从 GitHub Release 下载 standalone binary 到 `~/.markus/app`。
- 修改 shell PATH 配置。
- 创建桌面快捷方式。
- 可配置开机自启,macOS 上写入 LaunchAgent。
- 运行初始化向导。

这类脚本适合用户明确安装 Markus 时运行,不适合为了“借鉴逻辑”直接执行在当前开发机上。

参考来源:

- Install script: `https://www.markus.global/install.sh`
- GitHub README: `https://github.com/markus-global/markus`
- 本轮只读源码副本: `/tmp/markus-src`

## 2. Markus 可以借鉴的核心逻辑

### 2.1 AI workforce 不是聊天窗口集合

Markus 的 README 明确把平台定位成“完整 AI team runtime”:用户描述目标后,系统拆解任务、分派角色、并行执行、质量审查、交付。它的重点不是单个助手回复,而是组织级工作流。

对 helio-clone 的启发:

- 保留现有聊天/助手底座,但把 Mission 作为工作入口。
- TaskRun 必须成为“AI 是否真的在执行”的唯一证据。
- Delivery 不能只是 UI 卡片,要来自真实执行产物、构建测试、审核记录。

### 2.2 任务状态机驱动执行

Markus 的任务状态逻辑里,`pending -> in_progress` 会自动启动执行;离开 `in_progress` 会取消运行;执行完成后进入 `review`,不能由 worker 自己直接 `completed`。

对 helio-clone 的启发:

- 明确区分普通任务状态和运行时状态。
- `TaskRun.running` 才表示 AI 正在跑,不能用 `Task.status = doing` 冒充。
- 成功执行后进入 `review`,由 reviewer/human 审查后再生成或批准 Delivery。
- 失败/需要审批/取消要落库并在报告里可见。

### 2.3 Mailbox/Attention 模型

Markus 把 agent 设计成单线程认知体,所有外部刺激进 mailbox 队列,再由 attention controller 按优先级处理。任务执行通过 `task_status_update` 的 execution mode 触发,而不是外部代码直接调用内部方法。

对 helio-clone 的启发:

- 当前可先不做完整 mailbox,但要建立“任务执行队列”的概念。
- 同一 assistant 同时只能聚焦有限任务,避免多个 TaskRun 污染同一对话上下文。
- 用户评论/审批应该能打断或续跑任务,而不是只写一条消息没人处理。

### 2.4 工具安全层

Markus 的 shell/file 工具有安全守卫:

- shell 命令先经过危险模式拦截。
- 某些 git 操作需要人工审批。
- 命令有 timeout、输出截断、日志记录。
- 文件工具有 workspace/path policy,防止写入其他 agent 工作区。
- 工具执行结果进入 execution log。

对 helio-clone 的启发:

- 现有 `classifyCommand()` 是好的起点,但当前命令仍在主项目根执行,风险偏高。
- 下一阶段应把 `run_command` 默认改为“沙盒内执行”。
- 高危命令继续走 Human Approval,但审批通过后也只能在沙盒内执行。

### 2.5 必须提交 Review

Markus 的 task execution prompt 强制 agent 在完成时调用 `task_submit_review`;如果忘记提交,系统会提醒/重试,最终失败。

对 helio-clone 的启发:

- 任务执行结束不能只靠 assistant 文本说“完成了”。
- TaskRun succeeded 后必须生成结构化 Execution Report。
- 代码类任务必须包含:改动摘要、diff、build/test 命令、退出码、已知风险。
- 没有报告或没有验证证据,不能进入可交付状态。

### 2.6 交付物发布到共享空间

Markus 会把 deliverable manifest 和文件复制到 shared workspace,让 reviewer 不需要进入 worker 私有目录也能审查。

对 helio-clone 的启发:

- 沙盒运行结束后生成 `artifact manifest`。
- 报告面板展示产物、diff、日志、测试结果。
- 人工批准后才把沙盒变更应用到主项目。

## 3. 不应该照搬的内容

- 不复制 Markus UI、品牌、视觉结构、英文文案。
- 不复制 AGPL 源码实现。Markus 是 AGPL-3.0/商业双许可,helio-clone 如果要保持独立产品,只能借鉴架构思想。
- 不照搬完整 mailbox/attention/heartbeat 大系统。helio-clone 当前体量更适合分阶段实现。
- 不为了“像 Markus”推翻现有聊天、助手、任务、Mission、Review、Delivery、Audit、TaskRun、Approval 代码。

## 4. helio-clone 当前差距

当前项目已经有:

- AI 助手、频道/DM、流式消息。
- Function calling 工具。
- `run_command` 及低风险命令策略。
- TaskRun 与 ApprovalRequest。
- 执行报告面板雏形。
- Mission / Review / Delivery / AuditEvent。

仍缺:

- 真正强隔离的代码执行沙盒。
- 文件写入/patch 工具的受控实现。
- 每个 TaskRun 的独立工作目录、diff、artifact manifest。
- build/test 在沙盒内自动运行。
- 人工批准后再 merge/apply 到主项目。
- 恶意命令/越界读写的系统化 smoke test。

> 更新(2026-05-25,Sandbox Runtime 轮):上面除"OS 级强隔离容器"外均已落地。
> 已实现:每个代码/命令类 TaskRun 的独立 `.helio/sandboxes/<runId>/workspace`(copy fallback,忽略 node_modules/dist/.env/key/db)、
> 受控 `write_file`(只写沙盒)、run_command 默认沙盒 cwd + 路径守卫(越界读/逃逸被拒并记录)、collectDiff + artifact manifest、
> build/test 在沙盒内自动运行并落 SandboxLog、人工 `apply`(dry-run 拒敏感/生成文件)/`discard` 写 AuditEvent、
> 以及确定性 + 真实 LLM 的 A/B/C/D smoke。详见 `SANDBOX_EXECUTION_DESIGN.md` 第 10 节与 `SANDBOX_RUNTIME_TEST_REPORT.md`。
> 仍缺(P3+):容器/`sandbox-exec` 级 OS 隔离与真正网络命名空间禁网(当前为命令级 GET 策略)。

## 5. 建议优先级

P0: 先做强沙盒与真实报告。

- 每个代码类 TaskRun 创建独立 sandbox/worktree。
- `run_command` 默认在 sandbox cwd 执行。
- 收集 stdout/stderr/exit code/timeout。
- 运行 build/test。
- 生成 diff 与 artifact manifest。
- 报告面板可看、可审批、可丢弃。

P1: 再做受控写文件/patch。

- `write_file` / `apply_patch` 只允许写 sandbox。
- 主项目只允许人工批准后应用 diff。
- 敏感文件、`.env`、key、ssh、home 目录全部默认不可读写。

P2: 再做 Agent 队列/注意力。

- 同一助手限制并发数。
- 用户评论注入正在运行的 TaskRun。
- 审批通过后续跑同一上下文。

P3: 再做自动 reviewer 与 heartbeat。

- reviewer 读取 report/diff/build result。
- 定时扫描卡住任务、过期审批、失败重试。

## 6. 对 Claude 的实现提醒

下一轮 Claude 不应该继续只做 UI 状态。它要实现一个可验证的 Runtime 安全闭环:

```text
Task -> TaskRun -> Sandbox -> AI tool loop -> command/build/test -> report/diff/artifacts -> human review -> apply/discard
```

完成条件必须绑定真实 evidence:

- 有真实 sandbox 目录。
- 有真实命令日志。
- 有真实 build/test 结果。
- 有真实 diff 或明确“无代码改动”。
- 有越界访问被拒绝的测试。
- 无假人物、假任务、假报告遗留。
