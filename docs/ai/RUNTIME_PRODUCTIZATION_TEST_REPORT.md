# RUNTIME_PRODUCTIZATION_TEST_REPORT — Task/Sandbox Runtime 产品化真实测试报告

> 日期: 2026-05-25
> 项目: `/Users/kaiwu/Documents/kyle-agent/helio-clone`
> 范围: 把"能跑但不好用"的 Task/Sandbox Runtime 升级为「自然指派 AI → 看见沙盒执行 → 验收交付」的可用闭环;限制比上一轮更实用(放开沙盒内开发命令),并新增本地浏览器控制 MVP。
> 原则: 不造假。所有"通过/可用"以真实 TaskRun / SandboxRun / 命令日志 / 截图文件为依据;测试数据跑完清理并校验零残留。

## 0. 隔离强度(诚实声明)

本机**未检测到 Docker/Colima**(`docker info` 失败;仅有 `/usr/bin/sandbox-exec`,本轮未用其做强隔离)。因此当前沙盒是 **本机信任沙盒(非强隔离)**:

> 隔离工作区 + 命令路径守卫 + 危险词硬拦截 + env 脱敏 + 依赖软链 的纵深防御,**不是** OS 级容器/seccomp 强隔离;shell 仍图灵完备,守卫为启发式。**主项目写入仍只能由人类手动 apply。**

`GET /api/sandbox/isolation` 真实返回:
```json
{"strong":false,"mode":"trusted_local","label":"本机信任沙盒(非强隔离)","note":"未检测到 Docker/容器:…主项目写入仍只能由人类手动 apply。"}
```
UI(沙盒面板 / 工作台「沙盒运行」区)与本报告据此标注,**不写「强隔离已完成」**。有 Docker 时 `detectIsolation()` 会切换为「强隔离沙盒(Docker)」。

## 1. 本轮交付(对照目标必须项)

### 1.1 工作台指派体验
- `GET /api/tasks/:id/suggest-assignee`:按意图+技能推荐执行人(命中所需能力优先,否则取已配置可用模型、技能最全者)。
- 前端 `AssignMenu`(原生下拉,稳健):**MissionBoard 未指派卡片**直接给「指派 AI」下拉 + 「⚡ 自动选择执行人」;**TaskBreakdown 子任务行**同样可指派。无需跳转完整任务页。
- 指派走既有 `PATCH /api/tasks/:id { assigneeId }`。

### 1.2 一键执行流 + 指派后自动执行
- 卡片在「指派给 AI」后出现「开始执行」;执行中「取消」;触上限/失败出现「继续执行」。
- 工作台「指派后自动执行」开关(本地 `localStorage`,默认关):开启后指派即执行。
- 未指派不再只报错:直接给指派下拉/自动选择入口。

### 1.3 沙盒可见化
- 任务卡显示 sandbox 状态徽章(准备/执行/测试/待验收/已应用/已丢弃)。
- 工作台新增 **「沙盒运行」区域**(`SandboxRunsPanel`):本机信任/强隔离标记 + 最近 run 的 workspace 路径、模式、diff 摘要、build/test;展开任意一条拉取完整报告(命令/日志/diff/截图/build·test)并提供 apply/discard/继续执行。
- 报告面板(`TaskReportModal` + 复用的 `SandboxPanel`)保留完整详情,新增浏览器动作日志与截图展示、诚实隔离标记、继续执行。

### 1.4 放宽代码沙盒模式
- `permissions.classifyCommandForSandbox`:沙盒内放行 `node/npm/npx/pnpm/yarn/tsx/tsc/vite/jest/vitest/eslint/python/pip/pytest/go/cargo/make/git/...`、`pnpm build`、`pnpm test`、`git status`/`git diff` 等开发命令(免人工审批);仅「非 GET 网络 / 未识别命令」转人工审批;危险词(`rm -rf`/`sudo`/`shutdown`/`git push`/`npm publish`/`curl|bash`)始终硬拦截。
- 不再一刀切禁 `node/pnpm`。沙盒命令超时由 30s 提到 **180s**(`SANDBOX_CMD_TIMEOUT_MS` 可配),让 build/test 跑得完。主项目写入仍只能人工 apply。

### 1.5 修「工具调用过多停止」
- `ai.ts`:`MAX_TOOL_ROUNDS` 改为按场景配置 **chat 5 / task 25 / code(沙盒)40**,env 可覆盖(`MAX_TOOL_ROUNDS_CHAT/_TASK/_CODE`)。
- 达 80% 预算注入「收敛提醒」;到上限不再只回一句「停止」:再请求模型一次(不带工具)产出**部分报告**,run 置 `needs_review`,任务留 `doing`,前端出现「**继续执行**」(`POST /api/task-runs/:runId/continue`,**复用同一沙盒工作区**保留先前改动与上下文)。

### 1.6 浏览器控制 MVP(本地验证)
- `browser.ts`:用 **Node 内置 WebSocket + 系统 headless Chrome 经 CDP**(零新依赖)实现 `browser_open / browser_screenshot / browser_console / browser_click / browser_type`。
- 默认只允许 `localhost/127.0.0.1/file://`;**外站需人工批准**;所有动作写 `SandboxLog`(type=browser)+ `ai.tool_call` 审计,截图存 `SandboxArtifact(kind=screenshot)` 并落 `server/uploads/`。
- 能力矩阵:`browser_control` 由 `unavailable` 改为 **本地受控可用**;`computer_control`(全局鼠标键盘)仍 `unavailable`,仅实验模式文案,**不假装已实现**。

### 1.7 附带修复(测试中发现的真实缺口)
- **越权工具拦截**:`generateReply` 现只执行**真正提供给该助手**的工具;模型臆造未授技能(如只给浏览器技能却调 `run_command`)会被拒并如实告知。
- **意图路由**:`analyzeTaskIntent` 识别"浏览器/截图/打开本地页面/localhost"为 `needsBrowser`,要求**浏览器技能**而非把它当联网任务路由给无浏览器能力的助手。

## 2. 验收构建(全部 PASS,真实退出码)

| 命令 | 结果 |
|---|---|
| `pnpm -C server exec prisma validate` | PASS(schema valid) |
| `pnpm -C server build`(tsc) | PASS(exit 0) |
| `pnpm -C web exec tsc --noEmit` | PASS(exit 0) |
| `pnpm -C web build`(tsc -b + vite) | PASS(exit 0;单包 878 kB 的 chunk 警告为既有,非本轮引入) |

> 本轮无 Prisma schema 变更(continue 复用现有 SandboxRun;截图用 `SandboxArtifact(kind=screenshot)`;`needs_review` 为字符串状态)。未 db push、未 db:reset、未删 dev.db;迁移前已备份 `dev.db.bak-runtime-prod-*`。

## 3. Smoke A–E(真实端到端:API + 本地 LLM gemini-2.5-flash + 真实 headless Chrome)

脚本:`docs/ai/runtime_prod_smoke.mjs`(`pnpm -C server exec tsx ../docs/ai/runtime_prod_smoke.mjs`)。
**结果:30 PASS / 0 FAIL**,测试数据零残留。基线 `tasks=19 / assistants=10 / sandboxRun=log=artifact=0`。

### Smoke A — 工作台指派 + 执行闭环
创建**未指派**任务 → `suggest-assignee` 真实推荐(本次「软件工程师」)→ `PATCH assigneeId` 指派 → `POST execute` → 轮询到 **succeeded**。证明工作台首页可不跳页完成「发布→指派→执行」。

### Smoke B — 代码任务沙盒内 write_file + pnpm build,不因 5 轮停
助手(write_file+run_command,本地 LLM)在沙盒里:`write_file server/src/__rtsmoke__.ts` → `pnpm -C server build` **exit 0(~1.2s)**。
- diff 含新增 `__rtsmoke__.ts`(`1 文件(+1 ~0 -0)`)。
- 真实跑了 `pnpm build`(沙盒内,免审批放行)。
- 工具调用 3 次、状态 succeeded;**输出不是旧的「工具调用轮数过多,已停止」**。

### Smoke C — 报告可见 + apply 写回主项目
报告含:沙盒 workspace 路径、命令日志、diff 日志、diff 摘要、`buildResult=pass`。
`POST /api/task-runs/:runId/apply` → `applied=["server/src/__rtsmoke__.ts"]`,主项目真实出现该文件 → 测试随即删除(不污染仓库)。

### Smoke D — 浏览器控制打开 localhost 截图存 artifact
助手(browser_open/screenshot/console)对 **http://localhost:5173** 执行:
- `SandboxArtifact(kind=screenshot)` 生成:`/uploads/bshot-….png`,**磁盘真实文件 317787 字节(PNG)**。
- 3 条浏览器动作日志:`browser_open http://localhost:5173` / `browser_screenshot` / `browser_console`。
- run 终态 succeeded(本地地址免审批)。

### Smoke E — 清理为 0 / 真实用户沙盒不被自动清理
脚本只清理**自己创建**的测试任务/助手/run/SandboxRun/Log/Artifact + `.helio/sandboxes` 目录 + uploads 截图,并校验:
- 无 MARK 任务/助手残留;测试 SandboxRun/Log/Artifact 关联=0;`.helio/sandboxes` 无新增残留目录;uploads 无测试截图;tasks/assistants/沙盒表回到基线。
- 真实用户运行产生的沙盒**不被自动清理**(保留到 apply/discard);仅测试脚本清理自己的数据。

最终复核 DB:`{"assistants":10,"tasks":19,"taskRuns":3,"sandboxRun":0,"sandboxLog":0,"sandboxArtifact":0,"markTasks":0,"markAsst":0}`,`.helio/sandboxes` 0 目录。

## 4. 已知限制(诚实)

1. **非 OS 级强隔离**:无 Docker 时为本机信任沙盒(见 §0)。
2. **`/api/tasks/:id/execute` 为长阻塞请求**:长任务下偶发客户端连接超时(undici `UND_ERR_HEADERS_TIMEOUT`)。前端以 WebSocket 实时更新 + 完成后刷新驱动 UI,执行状态不依赖该响应;后续可改为「立即返回 runId + 轮询/WS」更稳。
3. **浏览器控制是单页 headless 会话**:进程内单例 Chrome;`browser_click/type` 经 `Runtime.evaluate` 操作本地页面;外站登录/提交/上传/输入密钥/系统设置必须人工。
4. **电脑全局鼠标键盘未实现**:仅实验模式文案。
5. **意图识别为启发式**:覆盖常见说法,生僻表达可能漏判(退化为用原 assignee 直接执行,不造假)。
6. 前端单包 878 kB 未 code-split(既有)。

## 5. 人工验收步骤

1. `pnpm dev`(server 5373 + web 5173)。
2. 工作台首页「任务看板」:在某未指派卡片用「指派 AI」下拉选一个助手,或点「⚡ 自动选择执行人」;(可选)勾「指派后自动执行」。
3. 指派后点「开始执行」;观察任务卡 sandbox 徽章 + 工作台「沙盒运行」区出现该 run(本机信任沙盒标记、workspace 路径、live 命令/diff/build·test)。
4. 代码任务:让助手(开 write_file+run_command,连本地端点)在沙盒里 `write_file` + `pnpm build`;到「待人工验收」后在报告里「批准应用到主项目」或「丢弃」。
5. 浏览器验收:让助手(开 browser_* 技能)`browser_open http://localhost:5173` 并截图;报告/沙盒面板查看截图与浏览器日志。
6. 复跑 smoke:`pnpm -C server exec tsx ../docs/ai/runtime_prod_smoke.mjs`(应 30 PASS / 0 FAIL,零残留)。
