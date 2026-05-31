# U_DESIGN — Phase U Mastra 工作流形状(M1 落地方案)

> §5.2 设想 judge panel 选最优形状。实际:M0 已用真实 spike 锁定 Mastra 控制流能力,
> M1 目标是**等价替换**(行为零变更),解空间收敛到"贴现状最小改动",故采用单一信息充分的工程决策,
> 不再跑 3 方案评委(那更适合解空间宽的新建,不适合"等价替换已存在状态机")。下面诚实记录决策与权衡。

## 1. 候选形状(M0 spike 已验证三者都可行)

| 形状 | 描述 | 取舍 |
|---|---|---|
| A 扁平 then 链 | init→fanout→compose→persist 全 `.then` | 改动最小、最贴 legacy 单函数控制流;事件/状态转移清晰 |
| B 按角色嵌套子 workflow | 每角色一个子 workflow,父 workflow 组合 | 角色解耦好,但 deck 只有 4 角色且强共享 state(seed/contributions/html),嵌套反而增加 schema 串接负担 |
| C branch/parallel/dowhile 全量贴合 | `.branch`(orchestrate)+`.parallel`(fanout)+`.dowhile`(critic) | 最"炫"但 critic 在 M1 不存在(legacy 无),dowhile 是空转;branch+共享 persist 需要把 persist 复制进两分支或抽子 workflow |

## 2. 最终形状(A + C 的扇出精华)

```
createWorkflow('deck-<jobId>')
  .then(initStep)                          // 建 GenerationJob + seed + (orchestrate? plan)
  .parallel([briefStep('content'), briefStep('data')])  // C 的扇出:content/data 真并行,各自软降级
  .then(composeStep)                        // visual 合成 HTML(硬依赖,失败 throw)
  .then(persistStep)                        // 落盘 + SandboxRun/Artifact/Delivery + 卡片 + audit + 收尾消息 + job ready
  .commit()
```

**为什么不是全量 C**:
- **orchestrate 开关**:没用 `.branch`,改为各 step 内 `if (!rs.orchestrate) skip`。原因:legacy 的单 AI 路径与多 AI 路径**共享 composeStep+persistStep**(visual=orchestrator 自己合成)。用 `.branch` 会逼 persist 逻辑复制进两分支或抽子 workflow,**反而比现状更脆**(§9 红线)。step 内 skip 让两路共用同一 persist,等价性最稳。
- **critic dowhile**:M1 不接(legacy 无 critic,加了破坏"行为零变更"等价性)。critic 按 §1 路由表归 CrewAI,**M3 落地**。
- **fanout 用 `.parallel` 而非 `.foreach`**:content/data 是固定两角色(plan 命中才跑,否则 step 内 skip),`.parallel([content,data])` 比动态 `.foreach` 的 schema 串接更简单,且每 step 独立软降级,与 legacy 的 `Promise.allSettled` 语义一一对应。

## 3. 状态如何流(关键工程决策)

**Mastra 管控制流 + 生命周期;业务数据走 step 闭包共享的 `RunState`(`rs`)。**

- 每次 `runDeckWorkflow` 调用构造一个新的 `rs`(per-run 隔离),4 个 step 闭包读写它。
- Mastra step 的 input/output schema 用 `z.any()` 占位(不强行把含密钥的 assistant / 函数塞进 zod schema 序列化)。
- **泳道事件**:M1 为保证与 legacy **逐项等价**,角色事件仍由 step body 内 `deps.emitRunEvent` 直发(与 legacy 同源同序、同 title、同 role/phase)。`run.watch` 仅作 M2 锚点(给 pi-runner 的 tool 事件映射更细 RunEvent),M1 不靠它产 RunEvent —— 否则会变成 `workflow-step-start:compose` 这类与 legacy 不同的事件,破坏等价。

## 4. 循环 import 怎么断(R2)

`deckWorkflow.ts` 住进 `server/src/orchestration/`(在 tsc `include:["src"]` 内,可被 index.ts import、可 build),但**不 import index.ts**:
- 只 import 叶子模块:`../ai.js`(generateReply/canGenerate)、`../deck/prompt.js`(compose*)、`../db.js`(prisma)、`../realtime.js`(sendToUsers)。
- index.ts 私有 infra(emitRunEvent / postDeliveryCard / writeAudit / broadcastWorkspace / memberIds / shapeMessage / fullMessageInclude / scanRepoPlugins / heliRoot)全部经 `DeckWorkflowDeps` **依赖注入**。
- index.ts 侧 `runDeckGeneration(opts)` 读 `AppSetting.orchestrationEngine`,`'mastra'` → 构造 deps 调 `runDeckWorkflow`,否则 → legacy `runDeckJob`。两路同入参、同抛错契约,两个入口(generate-pptx-ai + S3 修订)都走 `runDeckGeneration`。

> 注:M0 spike 放 `server/orchestration/`(tsc include 之外,纯 tsx 跑);M1 生产代码放 `server/src/orchestration/`(进 build)。命名一致,位置按"是否需进 build"区分。

## 5. 软降级语义(对齐 legacy,不改行为)

- content / data:`runDeckRoleBrief` 失败返回 null → 丢素材片段,visual 仍能合成(**软降级**)。
- visual(compose):HTML 非法 / LLM 失败 → `throw` → run.status='failed' → `runDeckWorkflow` 标 job failed 并抛错 → caller 的 catch 通报频道(**硬依赖**,与 legacy 一致)。
- critic:M1 无;M3 由 CrewAI 接,软降级(失败丢评分不挂整单)。

## 6. 可逆性(R3)

`AppSetting.orchestrationEngine`(`'legacy' | 'mastra'`,默认 `'legacy'`)。关 → 完全走旧 `runDeckJob`(零改动保留)。`deckOrchestration`(plan/fanout 开关)语义不变,与新 flag 正交叠加:`orchestrationEngine` 决定**用哪套控制流引擎**,`deckOrchestration` 决定**该引擎内是否多角色**。
