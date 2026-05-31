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

| flag | job.status | SandboxRun | preview HTTP | sections | rolesJson |
|---|---|---|---|---|---|
| **mastra** | ready | ✅ | 11344 chars HTML | 5 | set |
| **legacy** | ready | ✅ | 11485 chars HTML | 5 | set |

> htmlLen 11344 vs 11485:LLM 文案差异(等价性允许);**结构完全一致**(同 status / 同 section 数 / 都有 rolesJson / 都产 SandboxRun + 真 preview HTML)。
> 等价性修正:发现并修掉一处非等价 —— 初版 mastra 用路由 UUID 作 `GenerationJob.id`,legacy 用 `cuid()`。已改为 mastra 也用默认 cuid(opts.jobId 在两路都是 vestigial),两路 id 生成方式一致。
> 失败路径小改进(§9 允许):mastra 在 workflow 失败时显式标 `GenerationJob.status='failed'`(legacy 会让 job 卡在 in-progress);成功路径结构不受影响。

**判定**:两路都 `job.status=ready` + 有 SandboxRun + `/api/sandbox-runs/:id/preview/index.html` 真返回完整 HTML(含 eruda 注入、5 sections)。结构等价(allow 文案差异);可逆:flag 一键切 legacy 完全走旧路径。

---

## 仍待人工/后续验证(M2-M4)

- 场景 2(多 AI 协同泳道分组,4 助理):M1 已具备 emitRunEvent 分泳道事件;前端 OrchestrationCard 按 generationJobId 分组在 Phase T 已落地。建议人工派一个挂频道的 deck 观察泳道。
- 场景 3(可中断,M2)、场景 4(CrewAI 子服务结构化返回 + 软降级,M3):未实施。
