# U_DELIVERY — Phase U 交付摘要 + 人工验收路径

## 一句话

把 AskX 的手写 `runDeckJob` 状态机分层替换为三框架编排:**M0 三框架 spike 全跑通(真 Gemini)+ M1 Mastra 等价接管 deck 编排控制流(可逆 flag,双路真测通过)**。M2(pi-agent-core)/M3(CrewAI)/M4(收口)未实施,已就绪接口 + 诚实标注。

## 本轮做了什么

### M0 — 三框架 spike(commit 413c6aa)
- `server/orchestration/`(Mastra/pi spike,tsc 之外)+ `services/crew/`(CrewAI Python venv)。
- Mastra 1.37.1 / pi-agent-core 0.78.0 / pi-ai 0.78.0 / crewai 1.14.6 + litellm 1.86.2 —— 真实 API 实证锁定,版本 pin 进 THIRD_PARTY_LICENSES + lock。
- 三框架 hello-world 全过(真 Gemini),§1 路由表成立无需调整。详见 `U_SPIKE_REPORT.md`。

### M1 — Mastra 接管 deck 编排(commit c769560)
- `server/src/orchestration/deckWorkflow.ts`:Mastra workflow(init→parallel[content,data]→compose→persist)等价替换 runDeckJob 控制流;DI 断循环 import(R2 实证真断)。
- schema:`AppSetting.orchestrationEngine`(legacy|mastra,默认 legacy,R3 可逆)+ `GenerationJob.snapshotJson`(预留)。
- index.ts:`runDeckGeneration(opts)` 按 flag 分流;两入口(generate-pptx-ai + S3 修订)都走它。
- 双 flag E2E(真 HTTP 路由):mastra/legacy 两路都 ready + SandboxRun + preview 真 HTML(5 sections),结构等价。

## 框架版本与 API 核实(R7)

| 框架 | 版本 | 关键真实 API(实证,非臆造) |
|---|---|---|
| Mastra | @mastra/core 1.37.1 | `createWorkflow/createStep`,`.then/.parallel/.branch/.dowhile/.dountil/.foreach/.map/.commit`,`createRun()`(非 createRunAsync)/`run.start({inputData})`/`run.watch(cb)`/`run.resume`;step ctx 有 `abortSignal/suspend/getStepResult` |
| pi-agent-core | 0.78.0(+pi-ai 0.78.0) | `new Agent({initialState:{systemPrompt,model,tools},getApiKey})`,`agent.prompt/subscribe/abort/waitForIdle`;自建 `Model<'openai-completions'>{baseUrl}` 指本地代理;事件 `tool_execution_start/end` 等 |
| CrewAI | 1.14.6(+litellm 1.86.2) | `LLM(model="openai/<m>",base_url,api_key)`,`Crew/Agent/Task/Process`,`Task(output_pydantic=...)` → `kickoff().pydantic` 校验对象;FastAPI `/crew/run` |

## 三构建状态

- `pnpm -C server build`(tsc):green
- `pnpm -C web build`(tsc -b + vite):green
- `services/crew` `ruff check`:green

## 仍未做项(诚实)

- **M2** pi-agent-core 接 visual/engineer 执行(可中断,场景 3)。
- **M3** CrewAI 接 researcher/analyst/critic(crewStep HTTP + 软降级,场景 4);services/crew 已就绪。
- **M4** 泛化 + 删 legacy + 改 doctrine §1。

---

## 人工验收路径(照着跑)

前置:本地 Gemini 代理在线;在 worktree `compassionate-kirch-bf6be6`,分支 `claude/phase-u-triad`;assistants aria/cypher/foster/lex 已配 Gemini(脚本 `server/prisma/config-assistants-llm.ts`,重 seed 后重跑)。

### 0. 起服务
```bash
cd <worktree>/server
pnpm build && PORT=5473 PORT_MCP=5474 node dist/index.js   # 后端
# 取真人 userId:curl -s http://127.0.0.1:5473/api/users | grep -o '"id":"[^"]*","handle":"sam"' 或任意非助理
```

### 1. flag 切 mastra → 派 deck 真跑通(场景 1/2)
```bash
# 设 flag(任选其一)
cd <worktree>/server && node_modules/.bin/tsx -e "import('./src/db.js').then(async({prisma})=>{await prisma.appSetting.upsert({where:{id:'app'},update:{orchestrationEngine:'mastra'},create:{id:'app',orchestrationEngine:'mastra'}});process.exit(0)})"
# 派工(aria 的 id 从 /api/users 取;channelId 可省=null)
curl -s -X POST http://127.0.0.1:5473/api/templates/generate-pptx-ai \
  -H 'Content-Type: application/json' -H 'x-user-id: <真人id>' \
  -d '{"topic":"验收:Mastra 编排","assistantId":"<aria id>","pageCount":5,"themeId":"creative"}'
# 等 ~60-90s,查最新 job → 取 resultSandboxRunId → curl preview
curl -s http://127.0.0.1:5473/api/sandbox-runs/<sbId>/preview/index.html | head -c 200   # 应返回 <!doctype html>
```
预期:GenerationJob status=ready、rolesJson 有 content/visual、SandboxRun 产出、preview 真 HTML(5 sections)。
（脚本化一键版:`node_modules/.bin/tsx orchestration/m1-e2e.ts`,server 起在 5473 即可,自动跑两 flag 对比。)

### 2. flag 切 legacy → 真回退(场景 5)
把上面的 `orchestrationEngine` 改成 `'legacy'`,重派同一 deck。预期:完全走旧 runDeckJob,产物结构与 mastra 路一致,零报错。

### 3. CrewAI 停掉真软降级(场景 4,**M3 才有效**)
本轮 M3 未实施,services/crew 已就绪可手动起验证子服务本身:
```bash
cd <worktree>/services/crew && CREW_LLM_KEY=sk-local-... .venv/bin/python -m uvicorn app:app --port 8341
curl -s -X POST http://127.0.0.1:8341/crew/run -H 'Content-Type: application/json' -d '{"role":"critic","brief":"…"}'
```
软降级链路(Mastra crewStep 调不通时编排卡标注"分析 AI 未参与")待 M3 接入后验收。

## Git
- 分支:`claude/phase-u-triad`(已 push origin);commits:M0 `413c6aa`、M1 `c769560`。
- **直接 push origin/main 被 harness 拦**(默认分支需 PR 评审)。请用户走 PR 合并,或授予权限后再直推。
- PR:https://github.com/kylewu1990/helio-clone/pull/new/claude/phase-u-triad
