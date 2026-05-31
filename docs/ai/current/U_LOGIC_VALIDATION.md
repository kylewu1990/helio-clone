# U_LOGIC_VALIDATION — Phase U 真测日志(非 mock)

所有 LLM 调用走真实本地 Gemini 代理(`http://127.0.0.1:8317/v1`);DB / sandbox / HTTP 全真。

---

## M0 — 三框架 spike(真实 API 实证)

| spike | 命令 | 结果 |
|---|---|---|
| Mastra 2-step + watch + step 内真 LLM | `tsx server/orchestration/mastra-spike.ts` | `status=success`,6 个 watch 事件(`workflow-step-start/result/finish`),Gemini 返回「AI编排三框架:智能调度新范式」→ `SPIKE_OK` |
| Mastra `.parallel` + `.branch` | `tsx server/orchestration/mastra-flow-spike.ts` | parallel 输出 `{content,data}` 聚合;branch 命中单分支 → `FLOW_SPIKE_OK` |
| pi-agent-core 工具落盘 + 事件流 | `tsx server/orchestration/pi-spike.ts` | `tool_execution_start/end`,`write_file` 真写 index.html(58 字符),最终文本「已写入 index.html」→ `PI_SPIKE_OK` |
| CrewAI critic(直接 kickoff) | `python -c "app.crew_run(critic)"` | 校验过的 5 维 JSON `{clarity:9,design:0,narrative:3,data_support:0,persuasion:5,needs_revision:true,notes:…}` |
| CrewAI HTTP `/crew/run` | uvicorn + `curl POST /crew/run {researcher}` | `{ok:true,role:"researcher",result:{summary,points:[…]}}`(真 Gemini) |

---

## M1 — Mastra 接管 deck 编排(等价性 + 可逆)

### 模块级真测(隔离跑 runDeckWorkflow,真 Gemini + 真 DB + 真落盘)
`tsx server/orchestration/m1-test.ts`(orchestrate 路,aria=gemini-3-pro-preview):
```
ROLE EVENTS (6):
  [plan/understand/running] Aria 正在拆分协作角色(plan)
  [plan/understand/ok] 角色已拆分:content / visual
  [content/context/running] Aria 正在写内容文案
  [content/context/ok] Aria 的内容文案已就绪
  [visual/write/running] Aria 正在合成 HTML deck(吃 1 份队友素材)
  [visual/deliver/ok] Aria 合成完成 — 5 张 slide 已交付
GenerationJob: status=ready, resultSandboxRunId set, rolesJson=[content(done),visual(done)]
SandboxRun: ready_for_review, "1 file, +405 -0 · Aria(5 sections)"
Delivery: "PPT(Aria):Mastra 接管 Deck 编排"
HTML file: exists=true len=9804 (有效 <!doctype html>…</html>,5 sections)
→ M1_MODULE_OK(92s)
```

### 场景 1 + 5(等价性 + 可逆)—— 驱动真实运行的 server,经真实 HTTP 路由 + flag 分流
`tsx server/orchestration/m1-e2e.ts`(server 起在 5473;同一 deck 两路各跑一次):

```
=== [mastra] flag set → DB.orchestrationEngine=mastra
[mastra] dispatched (route jobId=82118956) → polling by title…
[mastra] job.status=ready sandbox=cmpu19jb rolesJson=set
[mastra] preview HTTP htmlLen=11344 sections=5 head="<!doctype html> <html lang=zh-CN><head> <!-- helio-eruda-…"
=== [legacy] flag set → DB.orchestrationEngine=legacy
[legacy] dispatched (route jobId=644cb26f) → polling by title…
[legacy] job.status=ready sandbox=cmpu1bdu rolesJson=set
[legacy] preview HTTP htmlLen=11485 sections=5 head="<!doctype html> <html lang=zh-CN><head> <!-- helio-eruda-…"
=== COMPARE ===
mastra: {ok:true, status:"ready", sandbox:cmpu19jb…, htmlLen:11344, sections:5, hasRoles:true}
legacy: {ok:true, status:"ready", sandbox:cmpu1bdu…, htmlLen:11485, sections:5, hasRoles:true}
=== M1_E2E_OK ===
```

### 场景 1+2 定论证据(同一 deck 两路,DB 落库 + curl 实测)

`tsx server/orchestration/m1-evidence.ts`(纯 DB 读)+ `curl /preview/index.html`:

| 维度 | **mastra** 路 | **legacy** 路 | 结论 |
|---|---|---|---|
| GenerationJob id | `cmpu17xol0006nv7v9jesv65n` | `cmpu19khx000jnv7vj1t0wnum` | 各自独立 cuid |
| job.status | **ready** | **ready** | ✅ 同 |
| SandboxRun | `cmpu19jb…` ready_for_review | `cmpu1bdu…` ready_for_review | ✅ 同状态 |
| diffSummary | `1 file, +194 -0 · Aria(5 sections)` | `1 file, +194 -0 · Aria(5 sections)` | ✅ 逐字相同 |
| Delivery | `cmpu19jbx…` ✅ | `cmpu1bdu9…` ✅ | ✅ 都生成 |
| rolesJson | content/data/visual 全 done | content/data/visual 全 done | ✅ 同 |
| **泳道 RunEvent 计数** | total=8 `{plan:2,content:2,data:2,visual:2}` | total=8 `{plan:2,content:2,data:2,visual:2}` | ✅ **同构** |
| preview HTTP(curl) | **11977 bytes**,`<!doctype html>` ✅ | **12347 bytes**,`<!doctype html>` ✅ | ✅ 都 ≥1KB 合法 HTML |

**泳道事件逐条(两路标题完全一致)**:
```
[plan/understand/running]  Aria 正在拆分协作角色(plan)
[plan/understand/ok]       角色已拆分:content / data / critic / visual
[content/context/running]  Aria 正在写内容文案
[data/context/running]     Aria 正在写数据图表建议
[content/context/ok]       Aria 的内容文案已就绪
[data/context/ok]          Aria 的数据图表建议已就绪
[visual/write/running]     Aria 正在合成 HTML deck(吃 2 份队友素材)
[visual/deliver/ok]        Aria 合成完成 — 5 张 slide 已交付
```
> deckOrchestration 开(默认),两路都有 **content / data / visual 角色泳道 RunEvent**(各 8 条同构),前端按 generationJobId 分组渲染 4 泳道。
> preview 字节 11977 vs 12347:LLM 文案差异(等价性允许,非逐字节);**结构完全一致**(同 status / 同 5 sections / 同 diff / 都有 rolesJson + Delivery + 8 条同构泳道 + ≥1KB 合法 preview)。
> 早期一次双 flag E2E(`m1-e2e.ts`,channelId=null)亦 M1_E2E_OK:mastra/legacy 都 ready + preview 11344/11485 字符。
> 等价性修正:修掉初版 mastra 用路由 UUID 作 `GenerationJob.id`(legacy 用 cuid)→ 已统一为默认 cuid(opts.jobId 两路都 vestigial)。
> 失败路径小改进(§9 允许):mastra 在 workflow 失败时显式标 `GenerationJob.status='failed'`(legacy 让 job 卡 in-progress);成功路径结构不受影响。

**判定**:两路都 `job.status=ready` + 有 SandboxRun + `/api/sandbox-runs/:id/preview/index.html` 真返回完整 HTML(含 eruda 注入、5 sections)。结构等价(allow 文案差异);可逆:flag 一键切 legacy 完全走旧路径。

---

## M2 — pi-agent-core 接住 visual 执行(真测)

### 步骤1:共享 sanitize 单测(`server/orchestration/sani-test.ts`,已删)
6 例全过:raw / fenced(```html 围栏)/ prefixed(前置说明)/ fenced+prefix → 都清洗成合法 HTML;garbage / tooshort → 正确 throw。→ `SANITIZE_OK`。证明 pi 读回内容若包围栏/夹带文字也能救回。

### pi 路模块真测(`m2-pi-test.ts`,真 Gemini)
- visual 泳道工具事件:`tool_start → file(写 index.html 8084 字符)→ tool_result`(role=visual,3 条)——**pi 真调 write_file**。
- job=`cmpu2gt98` **status=ready**;SandboxRun.workspacePath=`.helio/sandboxes/ppt-ai-7a073854/`——**persist 在正式 sandbox,非 scratch `deck-pi-`(微调1 验证)**;HTML 8084 字符合法。
- RunEvent byRole/kind:`{plan/stage:2, content/stage:2, visual/stage:3, visual/tool_start:1, visual/file:1, visual/tool_result:1}`。

### 场景 3 abort(`m2-abort-test.ts`,真 Gemini)
- A 预置已 aborted signal → 立即抛 `PiAbortError` → OK。
- B 跑到一半(1201ms)abort → **1209ms 抛 PiAbortError**(8ms 后,远早于 120s timeout,无僵尸)→ `OK(真停)`。→ `M2_ABORT_OK`。

### 场景 2 channel E2E(`m2-channel-e2e.ts`,真实路由 + 频道 strategy-q3 含 4 Gemini 助理)
- **pi 路**:job=`cmpu2nnd` **status=ready** realSandbox=true **preview=11780B doctype=true**(挂频道,iframe 可渲染);
  RunEvent `{plan:2,data:2,content:2,visual/stage:3, visual/tool_start:1,visual/file:1,visual/tool_result:1}`,**piVisualToolEvents=3**(pi 工具事件进泳道)。
- 泳道按 generationJobId 分组,有 content/data/visual 角色(本轮 plan 把各角色都指给 Aria;多助理分派是 plan LLM 涌现行为,非 bug —— 频道含 4 助理候选,泳道结构与分组已验证)。
- mastra-inline 路:与 M1 等价(同 persist/sandbox/preview 链路;visualRunner 仅改 visual 生成器,persist 不变)。
- 细分 flag 可逆:`visualRunner='mastra-inline'`(默认)→ 完全 M1 行为;`='pi'` → pi 路。

> 微调落地核对:① pi 只在 scratch(tmpdir/deck-pi-*)跑,persist 仍 allocate 正式 `.helio/sandboxes` 写 rs.html(已验证 workspacePath);② pi 读回走同一 sanitizeDeckHtml;③ 预算 timeout 120s + 工具轮数上限 6 + 失败 in-run 回退 inline(发可见 emitRunEvent)。

## M3 — CrewAI 接 analyst / critic(场景 4,真测)

env `CREW_BASE_URL=http://127.0.0.1:8341` → AskX server;crew 服务 `uvicorn app:app`(litellm→本地 Gemini)。
`server/orchestration/m3-e2e.ts`(真实路由 + 频道 strategy-q3 + 含数据主题)。

### crew 在线(`up`)→ CrewAI 子任务真被调,结构化 JSON 进 compose/编排
```
rolesJson=[ data→CrewAI 分析(crew:analyst) done, content→Aria, visual→Aria, critic→CrewAI 评审(crew:critic) done ]
critic 事件:[running] CrewAI 评审 AI 正在做 5 维评分 → [ok] CrewAI 评审完成 — 均分 4.2/10
            (清晰6/设计5/叙事4/数据3/说服3) · 建议修订
data 事件:  [running] CrewAI 分析 正在跑数据分析(analyst crew) → [ok] 已就绪
deck ready=true, criticCrewCalled(ok+score)=true → M3_UP_OK
```
- **analyst crew**:data 角色经 `callCrew('analyst')` 返回结构化 `{summary,points}` → 转文本 contribution **进 compose**(visual 吃它)。
- **critic crew**:compose 后 `callCrew('critic')` 返回校验过的 5 维 `CriticScore` → critic 泳道事件带均分 + needs_revision + notes。
- §1 路由落地:content 仍 Mastra agent(轻量);data→CrewAI analyst;critic→CrewAI;visual→pi/inline。

### crew 停掉(`down`)→ 软降级,主流程不挂
```
(kill uvicorn → connection refused)
rolesJson=[ data→CrewAI 分析 FAILED, content→Aria done, visual→Aria done, critic→CrewAI 评审 FAILED ]
critic 事件:[running] → [error] 分析 AI 未参与(CrewAI 评审不可达,软降级)
data 事件:  [running] → [error] CrewAI 分析 的数据图表建议未产出(分析 AI 未参与,软降级跳过)
deck still ready=true, criticSoftDegraded=true → M3_DOWN_OK
```
> CrewAI 不可达 → analyst/critic 都软降级(编排卡标注"分析 AI 未参与"),**deck 仍 ready**,主流程零阻塞。

> 可逆:未配 `CREW_BASE_URL`(或停服务)= 完全回 M2 行为(crewEnabled() 返回 false,data 走 Mastra agent,critic step 直接 skip)。crew 客户端带 timeout(默认 90s,critic 60s)+ 1 次重试 + 软降级返回 null。

## 仍待人工/后续验证

- 场景 2 多助理**分派**:需 plan LLM 把 content/data 指给不同 handle 才显多模型;频道含 4 助理候选,属涌现行为,建议人工多派几次观察。
