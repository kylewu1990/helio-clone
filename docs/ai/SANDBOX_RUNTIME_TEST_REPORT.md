# SANDBOX_RUNTIME_TEST_REPORT — 沙盒执行运行时真实测试报告

> 日期: 2026-05-25
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 范围: 新增 Sandbox Runtime —— AI 写代码/跑命令/交付前先在真实隔离沙盒里执行、测试、产报告,人工批准后才应用到主项目。
> 原则: 不造假执行日志/假任务/假人物/假测试结果;只有真实 TaskRun/SandboxRun/命令日志才算"已验证"。本报告所有数字与输出均为真实运行抓取。

## 1. 交付内容(本轮)

后端:

- `server/src/sandbox.ts`(新增):沙盒运行时内核。
  - `prepareSandboxFs` 每个代码/命令类 TaskRun 建 `.helio/sandboxes/<runId>/{base,workspace}`;非 git repo → copy fallback;忽略 `node_modules/dist/.helio/uploads/*.db/.env*/key/pem` 等;`node_modules` 以软链注入 workspace 让 build/test 可跑且不进 diff。
  - `guardSandboxCommand` 命令路径守卫:cwd 不能逃出 workspace;命令引用沙盒外绝对路径 / `~` 家目录 / 越界 `..` 一律拒绝并记录。
  - `runInSandbox` 在沙盒 cwd 执行、捕获 stdout/stderr/exitCode/耗时、超时与截断、env 脱敏(剥离 KEY/SECRET/TOKEN/OPENAI 等)。
  - `collectDiffFs` 用 base↔workspace 哈希比对得变更清单 + 系统 `diff -ruN`(忽略生成目录)得统一 diff。
  - `applySandboxFs` dry-run 校验后只写回 added/modified;拒敏感/生成文件;deleted 不自动删。`discardSandboxFs` 删隔离目录。
  - DB 封装:`createSandboxRun / finalizeSandbox(diff+build/test) / applySandbox / discardSandbox / getSandboxReport`,落 `SandboxRun/SandboxLog/SandboxArtifact`。
- `server/prisma/schema.prisma`:新增 `SandboxRun / SandboxLog / SandboxArtifact`(标量外键,db push 增量,无数据丢失)。
- `server/src/skills.ts`:`run_command` 在沙盒模式下默认 cwd=workspace + 守卫 + 落 SandboxLog;新增受控 `write_file`(只写沙盒,聊天路径不可用)。
- `server/src/permissions.ts`:`write_file` 能力从 `unavailable` 改为 `available`(沙盒受控,经人工 apply 才落主项目),诚实描述。
- `server/src/index.ts`:`executeTask` 接入沙盒(代码/命令类自动建沙盒、传入工具上下文、收尾 finalize、失败/取消时标记);新增 `GET /api/task-runs/:runId/sandbox-report`、`POST /api/task-runs/:runId/apply`、`POST /api/task-runs/:runId/discard`(apply/discard 均写 AuditEvent);`GET /api/tasks/:id/report` 增加最新 run 的 `sandbox` 字段。

前端:

- `web/src/lib/types.ts`:`SandboxRunRow/SandboxLogRow/SandboxArtifactRow/SandboxReport`;`TaskReport.sandbox`。
- `web/src/lib/api.ts`:`sandboxReport / applyRun / discardRun`。
- `web/src/lib/workspace.ts`:`SANDBOX_STATUS_META`。
- `web/src/components/workspace/TaskReportModal.tsx`:新增"沙盒执行"面板(状态/模式/路径/diff 摘要/build·test/变更文件/命令日志/测试日志/完整 diff/产物 + 「批准应用到主项目」「丢弃沙盒」),仅 `ready_for_review` 可操作,批准前不改主项目。

测试脚本(docs,不进业务代码/前端/构建产物):

- `docs/ai/sandbox_smoke.ts` 确定性 smoke(直接驱动 FS 核心,真实执行,不依赖 LLM、不写 DB、不污染)。
- `docs/ai/sandbox_e2e.mjs` / `sandbox_e2e_apply.mjs` 真实端到端(API + 本地 LLM gemini-2.5-flash)。

## 2. 验收构建(全部 PASS)

| 命令 | 结果 |
|---|---|
| `pnpm -C server exec prisma validate` | PASS(schema valid) |
| `pnpm -C server build`(tsc) | PASS(exit 0) |
| `pnpm -C web exec tsc --noEmit` | PASS(exit 0) |
| `pnpm -C web build`(tsc -b + vite) | PASS(built) |

## 3. Smoke A/B/C/D —— 确定性真实测试

命令:`pnpm -C server exec tsx ../docs/ai/sandbox_smoke.ts` → 结果 **ALL PASS**,测试数据零残留。

### Smoke A:pwd 的 cwd 在沙盒 workspace

- `pwd` 真实执行(exit 0),输出:
  `/Users/kaiwu/Documents/kyle-agent/helio-clone/.helio/sandboxes/smoke-A-<id>/workspace`
- 沙盒含主项目副本(`package.json` 存在);`server/node_modules` 软链注入成功。
- PASS ×3。

### Smoke B:越界读 / 逃逸被拒绝并记录

- `cat ~/.ssh/id_rsa` → 拒绝(命令引用家目录路径被沙盒拒绝)。
- `cat /etc/passwd` → 拒绝(沙盒外绝对路径)。
- `cat ../../../../etc/passwd` → 拒绝(越界相对路径)。
- `ls ..`(relCwd=`..`)→ 拒绝(cwd 越界 workspace)。
- 反例 `cat package.json`(沙盒内)→ 放行。
- PASS ×5。

### Smoke C:沙盒内写文件 + 跑 build,报告命令/退出码/日志

- 在沙盒内写 `server/src/__smoke_sandbox__.ts`(路径校验在沙盒内)。
- `collectDiffFs` 识别新增文件:`1 文件(+1 ~0 -0)`,diff 文本含该文件名。
- 沙盒内真实执行 `pnpm -C server build` → **退出码 0,耗时 ~1.08s**,日志尾 `$ tsc -p tsconfig.json`。
- build 产物 `server/dist` 不进 diff(被忽略)。
- PASS ×5。

### Smoke D:丢弃后主项目未变;apply 只应用允许 diff

- discard:沙盒里写 `docs/ai/__smoke_discard_only_in_sandbox__.md` → `discardSandboxFs` 后沙盒目录已删、主项目从未出现该文件。
- apply:沙盒里写 `docs/ai/__smoke_apply__.md`(允许)+ `providers.json`(含 key)+ `server/.env.smoke`(敏感)。
  - diff 文件:`['docs/ai/__smoke_apply__.md','providers.json']`(`.env.smoke` 在 diff 阶段即被忽略,第一层防御)。
  - apply 结果:`applied=['docs/ai/__smoke_apply__.md']`、`blocked=['providers.json']`(dry-run 拒敏感文件,第二层防御)。
  - 写回内容校验正确;`providers.json`、`.env.smoke` 均未落主项目。
- PASS ×4。结束清理删除 apply 写入的临时文件。

## 4. 真实端到端(API + 本地 LLM gemini-2.5-flash)

本机内部 OpenAI 兼容端点 `http://127.0.0.1:8317/v1`,模型 `gemini-2.5-flash`。两个 e2e 均用真实助手、真实 TaskRun、真实 SandboxRun,跑完后清理测试数据(任务/助手/DB 行/沙盒目录)。

### E2E-1:命令类任务 → 沙盒执行

- 创建本地 LLM 助手(skills=`run_command`)+ 命令类任务(pwd & ls)→ `execute` 返回 `{status: succeeded}`。
- 自动建 `SandboxRun`(status=`ready_for_review`,mode=`copy`)。
- 真实命令日志 1 条:`$ pwd && ls -la` `[exit 0, 28ms]`,输出含
  `.../.helio/sandboxes/<runId>/workspace` → **PASS:run_command cwd 在沙盒**。
- AI 汇报正确指向沙盒 workspace;无代码改动 → diff 空、build `skipped`(诚实)。

### E2E-2:write_file → 报告 → 人工 apply → 写回主项目

- 助手(skills=`write_file,run_command`)调用 `write_file` 在沙盒写 `docs/ai/__e2e_apply_demo__.md`。
- 报告 `changedFiles=[{path:"docs/ai/__e2e_apply_demo__.md",status:"added"}]`;**apply 前主项目无此文件(批准前不改主项目)** → PASS。
- `POST /api/task-runs/<runId>/apply` → `{ok:true, applied:["docs/ai/__e2e_apply_demo__.md"], blocked:[], skippedDeletions:[]}`;主项目出现该文件,内容 `# E2E apply demo` → PASS。
- 写入 `AuditEvent(type=sandbox.applied)` → PASS;任务状态 → `review` → PASS。
- 清理:删除主项目演示文件 + 测试数据。

### 清理核对

- e2e 任务/消息/助手:0 残留。
- `SandboxRun / SandboxLog / SandboxArtifact`:全表 0 行(功能全新,无真实运行时应为空)。
- `.helio/sandboxes/`:空目录。

## 5. 已知限制(诚实声明)

- **非 OS 级强隔离**:当前是 copy 工作区 + 命令路径守卫 + classifyCommand 硬拦截 + env 脱敏 + 依赖软链 的纵深防御,不是容器/seccomp 级沙箱;shell 图灵完备,守卫为启发式(覆盖绝对路径/家目录/`..` 逃逸)。要 OS 级隔离需 Docker/`sandbox-exec`(设计文档 Level 3/4,本轮范围外)。
- **网络**:无法在无容器下真正禁网,故 `networkPolicy=allow_public_get`;curl/wget 仅 GET(由 classifyCommand 限制),非 GET 转人工审批。这是命令级策略,非网络命名空间隔离。
- **node_modules 软链**:为让 build/test 在沙盒内可跑,workspace 的 `node_modules` 软链到主项目;diff/apply 忽略 node_modules,正常 build 不写 node_modules,但理论上恶意命令可经软链写依赖目录(已被 classifyCommand + 守卫 + 脱敏共同约束,且不进 diff/apply)。
- **删除文件**:apply 默认只应用 added/modified,deleted 仅在报告中提示,需人工处理(避免误删主项目)。
- **审批续跑**:经人工批准的高危命令在一次"续跑"中以全新沙盒执行(更强隔离),原沙盒不复用。

## 6. 人工验收步骤

1. 启动:`pnpm -C server dev` 与 `pnpm -C web dev`(或 `pnpm dev`)。
2. 新建/选一个 AI 助手,连接本地端点(baseURL `http://127.0.0.1:8317/v1`、model `gemini-2.5-flash`、key `sk-local-…`),技能勾选 `执行命令` 与 `写文件(沙盒)`。
3. 新建任务并指派给该助手,标题含命令/代码意图(如"在项目里跑 pwd 和 ls,并 write_file 新建 notes.md")。
4. 任务卡打开"执行详情/报告" → 点"开始执行"。观察:
   - 出现真实 TaskRun 与"沙盒执行"面板(状态/模式/路径/diff/命令日志)。
   - `pwd` 输出在 `.helio/sandboxes/<runId>/workspace`。
5. 待状态 `待人工验收(ready_for_review)`:查看变更文件与完整 diff → 点「批准应用到主项目」或「丢弃沙盒」。
   - 批准:仅允许文件写回主项目(敏感/生成文件被拦截),任务进 review,审计可见 `sandbox.applied`。
   - 丢弃:主项目不变,审计可见 `sandbox.discarded`。
6. 复核确定性 smoke:`pnpm -C server exec tsx ../docs/ai/sandbox_smoke.ts`(应 ALL PASS,零残留)。
