# U_SPIKE_REPORT — Phase U / M0 三框架 spike(真实 API + 版本 + 风险)

> 目标:零业务侵入验证 Mastra / pi-agent-core / CrewAI 的**当前真实 API**(R7),
> 全部用真实本地 Gemini 代理跑通 hello-world,再决定是否调整 §1 路由表。
> **结论:三框架全部跑通,§1 路由表无需调整。M0 PASS。**

工作分支:`claude/phase-u-triad`(worktree `compassionate-kirch-bf6be6`)。
spike 文件:`server/orchestration/{mastra-spike,mastra-flow-spike,pi-spike}.ts` + `services/crew/{app.py}`。
本地 LLM(R5):`http://127.0.0.1:8317/v1`,模型 `gemini-2.5-flash`(实测仅 Gemini 有上游 auth)。

---

## 1. Mastra(主控编排层)— ✅ 全部跑通

- **包/版本**:`@mastra/core@1.37.1`(装进 `server/`,M1 直接复用)。
- **导入**:`import { createWorkflow, createStep } from '@mastra/core/workflows'`。
- **真实 API(实测,非臆造)**:
  - `createStep({ id, inputSchema, outputSchema, execute })`(schema 用 zod)。
  - `createWorkflow({ id, inputSchema, outputSchema }).then(s).parallel([a,b]).branch([[cond,x],[cond,y]]).dowhile(s,cond).dountil(s,cond).foreach(s,{concurrency}).map(fn).commit()` — 链式方法**全部存在**(从 `workflow.d.ts` 实证:`then/sleep/waitForEvent/map/parallel/branch/dowhile/dountil/foreach/commit`)。
  - 运行:`const run = await wf.createRun()`(本版本是 `createRun()`,**不是** docs 里旧的 `createRunAsync()`);`run.start({ inputData })`;`run.watch(cb)`(返回 unsubscribe 函数);`run.resume({ resumeData, step })`;`run.stream(...)`。
  - **step.execute 上下文真实 keys**(实测打印):`inputData, getInitData, getStepResult, state, setState, suspend, bail, abort, abortSignal, resume, restart, mastra, requestContext, writer, runId, ...`。
- **watch 事件形状(M1 桥接 emitRunEvent 的锚点)**:`workflow-step-start` / `workflow-step-result` / `workflow-step-finish`,step id 在 `ev.payload.id`。
- **实测证据**:
  - 2-step `.then` 链 + step 内调真实 Gemini → `status=success`,result 正确;watch 收到 6 个 step 事件。LLM 返回「AI编排三框架:智能调度新范式」。
  - `.parallel([content,data])` → 两 step 并行,输出按 `{content:{...}, data:{...}}` 聚合(**M1 FAN-OUT 形状**)。
  - `.branch([[orchestrate,orchStep],[!orchestrate,soloStep]])` → 只跑命中分支(**M1 orchestrate 开关形状**)。
- **M1 关键收获**:
  - `parallel`/`branch` 输出按 stepId 聚合,串进下一 step 要用 `.map()` reshape。
  - ctx 里有 `abortSignal` + `abort()` → **M2 可中断直接对接**。
  - ctx 里有 `suspend`/`bail` → suspend/resume 锚点天然存在。
- **storage(suspend/resume 需要)**:Mastra 构造器接 `storage`,官方示例用 `new LibSQLStore({ url: ':memory:' })`(`@mastra/libsql`,独立包)。AskX 本就用 SQLite,**LibSQL 适配器是自然选择**。M1 基础 run 不强制 storage(已实测 `createRun()` 裸跑成功);要落 `snapshotJson` / suspend-resume 时再装 `@mastra/libsql`。
- **风险**:低。唯一坑是 docs 与安装版本 API 漂移(`createRunAsync` vs `createRun`)——已用实证锁定为 `createRun()`。

## 2. pi-agent-core(visual/engineer 执行 runner)— ✅ 全部跑通

- **包/版本**:`@earendil-works/pi-agent-core@0.78.0` + `@earendil-works/pi-ai@0.78.0`(canonical「Pi Coding Agent」,装进 `server/`)。
- **真实 API(实测)**:
  - `registerBuiltInApiProviders()`(来自 pi-ai,**必须先调**,注册各 api 的 streamFn)。
  - 自建 Model 指向本地 OpenAI 兼容端点:`Model<'openai-completions'> = { id, name, api:'openai-completions', provider, baseUrl, reasoning, input:['text'], cost, contextWindow, maxTokens }`。**custom baseUrl 直接放 Model.baseUrl 字段**。
  - `new Agent({ initialState: { systemPrompt, model, thinkingLevel, tools }, getApiKey: (provider)=>key })` — **apiKey 通过 `getApiKey` 回调注入**(不在 Model 上)。
  - 工具:`{ name, description, parameters: Type.Object({...}), execute: async (toolCallId, params, signal, onUpdate) => ({ content:[{type:'text',text}] }) }`(`Type` 来自 pi-ai 再导出的 typebox)。
  - `agent.subscribe((event, signal) => {...})`;`agent.prompt(text)`;`await agent.waitForIdle()`;`agent.abort()`。
- **事件流(实测,M2 映射 RunEvent 的锚点)**:`agent_start → turn_start → message_start/update/end → tool_execution_start → tool_execution_end → ... → agent_end`。
- **实测证据**:给 prompt「用 write_file 工具写 index.html」→ 真实 Gemini **真的调了工具**,`index.html` 真落盘(`<!doctype html>...<h1>Hello Pi</h1>`),最终文本「已写入 index.html(58 字符)。」。`toolEvents=true wroteFile=true gotText=true` → `PI_SPIKE_OK`。
- **M2 关键收获**:`tool_execution_start/end`(含 toolName)+ `message_update`(流式文本)→ 直接映射 `emitRunEvent` 的 `tool_start/tool_result/file`;`agent.abort()` + execute 收到的 `signal` → 对齐 Mastra step 的 `abortSignal`,可中断链路打通。Gemini 经代理**支持 function calling**。
- **风险**:低。包真实可用,API 与 §1 设想一致。注意 pi 自带一套 harness/compaction(可选,M2 只用 Agent 核心)。

## 3. CrewAI(researcher/analyst/critic 子服务)— ✅ 全部跑通

- **包/版本**:`crewai==1.14.6` + `litellm==1.86.2`(CrewAI 1.x 把 litellm 做成可选 fallback,**自定义 OpenAI 兼容端点必须装 litellm**)+ `fastapi==0.136.3` + `uvicorn==0.48.0` + `pydantic==2.12.5`。Python 3.11.7,`uv` 管 venv。
- **真实 API(实测)**:
  - `from crewai import LLM, Agent, Crew, Task, Process`。
  - LLM 指本地 Gemini:`LLM(model="openai/gemini-2.5-flash", base_url="http://127.0.0.1:8317/v1", api_key=...)`(litellm `openai/` 前缀路由到 OpenAI 兼容端点)。
  - `Task(..., output_pydantic=CriticScore)` → `crew.kickoff().pydantic` 是**已校验的 Pydantic 对象**。
- **实测证据**:
  - 直接 kickoff(critic):返回校验过的 5 维 JSON `{clarity:9, design:0, narrative:3, data_support:0, persuasion:5, needs_revision:true, notes:"..."}`(对齐 `composeCriticPrompt` schema)。
  - FastAPI/uvicorn 起服务:`GET /health` → `{ok:true, model, base, has_key:true}`;`POST /crew/run {role:researcher, brief}` → `{ok:true, role:"researcher", result:{summary, points:[...]}}`(真实 Gemini)。
- **M3 关键收获**:`/crew/run` 的 `{role, brief}` 协议 + `output_pydantic` 结构化返回已验证;critic 5 维 schema 已落地。CrewAI **完全不感知** AskX 频道/WS/DB(§1 铁律 2 满足)。
- **风险**:中。
  1. CrewAI 1.x 默认不带 litellm,自定义端点必装 fallback(已装,写进 lock)。
  2. 首跑会触发 tracing 偏好交互(已禁用,可用 `CREWAI_TRACING_ENABLED=false`);独立进程部署时设 env 静默。
  3. crew 单次 kickoff 较慢(20-40s/角色)→ M3 的 `crewStep` 必须带 timeout + 软降级(已在 §1 设计内)。

---

## 4. §1 路由表是否需要调整 — **不需要**

| 角色 | 执行器 | M0 验证结论 |
|---|---|---|
| `plan` | Mastra Agent / step | ✅ step 内调 LLM 出 JSON,已跑通 |
| `content` / `data` | Mastra Agent(轻量文本) | ✅ parallel step 形状已跑通 |
| `visual` / `engineer` | **pi-agent-core** | ✅ 本地文件工具 + 工具流式 + 可中断,已跑通 |
| `researcher` / `analyst` / `critic` | **CrewAI** | ✅ Crew + output_pydantic 结构化,已跑通 |

三框架职责边界(§1)经实测全部成立,**无强行接入导致更脆的情况**,M0 不触发降级方案。

## 5. 三构建状态(M0)

- `pnpm -C server build`(tsc):**green**(加了 @mastra/core + pi-agent-core + pi-ai 依赖,src 未引用,零影响;spike 在 `server/orchestration/`,在 tsc `include:["src"]` 之外,不进 build)。
- `services/crew` `ruff check app.py`:**All checks passed**。
- web 构建:M0 未触碰前端,不涉及。

## 6. 版本 pin(写进 THIRD_PARTY_LICENSES.md + lock)

| 框架 | 版本 | lock |
|---|---|---|
| @mastra/core | 1.37.1 | `server/package.json` + `pnpm-lock.yaml` |
| @earendil-works/pi-agent-core | 0.78.0 | 同上 |
| @earendil-works/pi-ai | 0.78.0 | 同上 |
| crewai | 1.14.6 | `services/crew/requirements-lock.txt` |
| litellm | 1.86.2 | 同上 |
| fastapi / uvicorn / pydantic | 0.136.3 / 0.48.0 / 2.12.5 | 同上 |

---

## 7. M0 VERDICT

**PASS** — 三框架真实 API 全部用真实 Gemini 实证跑通,版本锁定,§1 路由表成立,零业务侵入,baseline build green。可进 M1(Mastra 接管 deck 编排,等价替换)。
