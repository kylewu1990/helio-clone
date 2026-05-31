# U_REVIEW — Phase U 自评 + 红队复核(M0 + M1)

> 按 §5.4 find→对抗式 verify。维度:循环 import / flag 可逆性 / 软降级正确性 / 泳道分组 / abort 传播 / 构建 / 等价性。

## 已交付(本轮)

| 里程碑 | 状态 | flag 两路可跑 | 三构建 | 真测证据 |
|---|---|---|---|---|
| M0 三框架 spike | ✅ 完成 + push | n/a(零业务) | server tsc + crew ruff green | 三框架 hello-world 全过(真 Gemini) |
| M1 Mastra 接管编排 | ✅ 完成 + push | ✅ mastra/legacy 两路 E2E 都 ready | server tsc + web build green | 模块测 + 双 flag E2E(真路由,M1_E2E_OK) |

## 红队维度复核

| 维度 | 结论 | 证据(对抗式 verify) |
|---|---|---|
| **R2 循环 import 真断** | ✅ 真断 | leaf 模块(ai/db/realtime/deck-prompt)均不 import index.ts;`tsx import('deckWorkflow')` 独立加载 → `LOADED exports: runDeckWorkflow` + 干净退出,**无 server 启动/无端口绑定/无 hang**。这是最强证据(若有循环 import,加载会执行 app.listen 卡住)。 |
| **R3 flag 可逆** | ✅ 可逆 | E2E 实测 flag=mastra→ready、flag=legacy→ready,收尾自动回 legacy;`getOrchestrationEngine()` 读失败 fallback 'legacy'(安全默认)。 |
| **等价性** | ✅ 结构等价 | 双 flag E2E:同 status=ready / 同 5 sections / 都有 rolesJson / 都产 SandboxRun + 真 preview HTML。修掉一处非等价(GenerationJob.id:UUID→cuid 对齐 legacy)。 |
| **软降级** | ⚠️ 部分验证 | content/data 失败返回 null→丢片段(代码与 legacy 同源)。模块测里 data 未被 plan 命中→step 正确 skip。**未单独构造一次真实 content/data 失败**触发软降级(M2/M3 补)。 |
| **泳道分组** | ✅ 沿用 | emitRunEvent 带 role+generationJobId(与 legacy 同源同序);前端 OrchestrationCard 按 generationJobId 分组(Phase T 已落地,本轮未动)。 |
| **abort 传播** | ⏳ M2 | M0 已验证 Mastra step ctx 有 abortSignal + pi-agent-core agent.abort();M1 未接 abort(M2 才需要)。 |
| **三构建** | ✅ green | server `tsc` green;web `tsc -b && vite build` green;crew `ruff` green。 |

## 诚实暴露的小瑕疵 / 决策

1. **失败路径非严格等价**(§9 允许的小改进):mastra 在 workflow 失败时显式标 `GenerationJob.status='failed'`,legacy 会让 job 卡 in-progress。成功路径结构不受影响。判定:保留 mastra 行为(更正确),已在 U_LOGIC_VALIDATION 标注。
2. **run.watch 未驱动 RunEvent**:M1 为保证与 legacy 逐项等价,泳道事件由 step body 内 emitRunEvent 直发,watch 仅留作 M2 锚点。判定:等价优先,合理。
3. **critic 未接**:legacy 无 critic,M1 不加(等价性);M3 由 CrewAI 接(对齐 §1 路由表)。
4. **snapshotJson 预留未用**:真 suspend/resume 需装 `@mastra/libsql` storage;M1 用 per-run 闭包构造 workflow,未走 Mastra storage。判定:M1 不需要,字段先建好。

## 待办(M2-M4,未实施)

- **M2** pi-agent-core 接 visual/engineer:compose step 用 pi runner(本地文件工具 + 工具流式 + 可中断),tool 事件→emitRunEvent,abort 透传。场景 3 真测。
- **M3** CrewAI 接 researcher/analyst/critic:Mastra crewStep HTTP 调 `/crew/run`(timeout+重试+软降级);场景 4 真测。services/crew 已就绪(M0)。
- **M4** 泛化 GenerationJob.kind + 删 legacy 死路径(确认全量切 mastra 稳定后)+ 改写 doctrine §1。

## VERDICT(本轮范围)

M0 + M1:**PASS**。三框架 API 真实锁定;Mastra 等价接管 deck 编排,可逆 flag 两路真测通过,循环 import 真断,三构建 green。M2-M4 为后续里程碑,本轮未触及,已诚实标注。
