# Phase T 交接文档(编排式多 AI deck 重构)— 新对话从这里接上

> 上一个对话 context 满了。这份是给**下一个 Claude** 的精准交接。读完即可继续 M2/M3,不需要回看历史。

---

## 一句话现状

把 PPT 的三条并存生成路径收敛成**一条 `runDeckJob` 主干 + 轻量编排器**(plan→fan-out→compose→critic),让用户在频道里看到"多个 AI 并行协同出 deck"。
- **M1 已完成并 push**(commit `8c9b435`):清债收口,零行为变更。
- **M2 待做**:主干收敛(runPptAiJob → runDeckJob 单 AI 等价 + 删旧路径)。
- **M3 待做**:编排上线(plan→fan-out→critic + feature flag + 进度卡泳道 + 前端泳道组件)。这是用户最终要看到的"多 AI 协同"。

工作目录(worktree,不是主仓库):
`/Users/kaiwu/Documents/kyle-agent/helio-clone/.claude/worktrees/compassionate-kirch-bf6be6`
分支:`claude/compassionate-kirch-bf6be6` → push 到 `origin/main`。每个里程碑完成后 `git push origin HEAD:main`,然后 `cd /Users/kaiwu/Documents/kyle-agent/helio-clone && git pull origin main`(用户主项目同步)。

---

## 本地 LLM(B 路线,已配好)

用户给的本地 OpenAI-compatible 代理:
- Base URL: `http://127.0.0.1:8317/v1`
- Key: `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`

**实测结论(重要)**:这个代理 `/v1/models` 列 26 个模型,但只有 **Gemini 两个真有上游 auth**:
- ✅ `gemini-3-pro-preview`、`gemini-2.5-flash` → 真能 chat completion
- ❌ `claude-*` → `auth_unavailable / Invalid authentication credentials`
- ❌ `gpt-*` → `TLS handshake` 失败(走 chatgpt.com backend)

已用 `server/prisma/config-assistants-llm.ts` 给 4 个助理配好:
- aria → gemini-3-pro-preview(设计师,visual 主笔)
- cypher → gemini-2.5-flash(工程师)
- foster → gemini-2.5-flash(产品,content)
- lex → gemini-3-pro-preview(内容)

测多 AI 协同**就用这 4 个**(它们的 model 真能跑)。重新 seed DB 后要重跑这个脚本。

启动测试环境(worktree 用非默认端口避免和主项目冲突):
```
PORT=5473 PORT_MCP=5474 pnpm -C server start   # 后端
# 前端:.claude/launch.json 已配 web → API_TARGET=http://127.0.0.1:5473, WEB_PORT=5573
# 用 preview_start({name:'web'}) 起前端,浏览器 5573
```
kyle 的 userId(seed 后固定):跑 `curl -s http://127.0.0.1:5473/api/users | grep kyle` 拿。

---

## M1 已做了什么(已 push,别重做)

新增 `server/src/deck/`:
- `themes.ts` — 合并旧 `PPT_THEMES`+`DECK_DIRECTIONS` → 唯一 `DECK_THEMES`(导出 `DECK_THEMES`、`deckTheme(themeId)`)。**修了 bug**:creative.accent 从 `#3a7e3a` 统一为 `#ff6b00`。
- `prompt.ts` — 搬出全部 deck prompt 常量 + `composeDeckSystemPrompt(opts)`。**已预置 M3 要用的**(目前未被调用):`composeDeckPlanPrompt`、`composeRolePrompt`、`composeCriticPrompt`,且 `composeDeckSystemPrompt` 的 opts 已支持 `contributions?: Array<{role,assistantName,content}>`(多角色素材注入)。

schema(已 db push,零数据丢失):
- 新表 `GenerationJob`(id/kind/status/channelId/taskId/ownerId/requesterId/title/specJson/rolesJson/prevJobId/resultSandboxRunId/error/...)
- `Task.kind`(String? — 'deck' | null,替代魔法前缀)
- `SandboxRun.generationJobId`(String?)
- `RunEvent.generationJobId` + `RunEvent.role`(String? — content/visual/data/critic,分泳道用)
- `AppSetting.deckOrchestration`(Boolean @default(true) — 编排开关,关=回退单 AI)
- 回填脚本 `backfill-deck-kind.ts` 已跑(把 '做 PPT:%' 任务标 kind='deck')

前端 F1:7 处硬编码 `localStorage.getItem('helio.userId')` → `getUserId()`(PptStudioModal + AssistantWorkspace)。

---

## 关键代码坐标(M2/M3 要动的)

`server/src/index.ts`(~8000 行单体,**串行改,不能并行**):
- `runPptAiJob`(约 L6760-7040)— 当前 deck 生成主函数(M-R 路径,LLM 直出 HTML)。M2 要演进成 `runDeckJob`。
- `/api/templates/generate-pptx-ai` 路由(约 L6620)— AI 路径入口,内部建 Task(kind 待写 'deck')+ GenerationJob(待建)+ 调 runPptAiJob。
- `/api/templates/generate-pptx` 路由(L 路径,模板渲染 .pptx)+ `renderPptDeckHtml`(约 L6107)+ `generate_pptx` skill 调用 — **M2 要删**(旧路径)。
- `maybeTriggerAssistants`(L543-1306,764 行,**三路径共用:聊天 / H2 自动派工 / S3 PPT 修订**)。S3 PPT 修订分支约 L614-720,现判定 `activeTask.title.startsWith('做 PPT:')`,**M2 改判 `task.kind==='deck'`**。
  - 红队 H3 警告:这段内嵌在 P1 active-task 分支、缩进 4 层,跟 `p1Routed`/`mentions.directed`/`return` 副作用强耦合。切的时候必须 **7a 先抽函数保留 return/p1Routed 语义(行为零变更)→ 7b 才切判定到 kind**。回填脚本是 7b 硬前置(已跑)。
- infra 函数(目前都私有,**未 export**):`memberIds`(L79)、`writeEdge`(L118)、`shapeMessage`(L218)、`fullMessageInclude`(L2230 const)、`scanRepoPlugins`(L2508)、`broadcastWorkspace`(L2891)、`RunEventScope`(type L2897)、`emitRunEvent`(L2935)、`postProgressCard`(L3044)、`maybeUpdateProgressCard`(L3085)、`finalizeProgressCard`(L3131)、`postDeliveryCard`(L3191)、`writeAudit`(L3243)。
  - **循环 import 警告**:index.ts 有顶层 `app.listen`,deck/* 模块 **不能 import index.ts**(会执行整个 server)。所以 M2 提取 orchestrator 到 `deck/orchestrator.ts` 时,**用依赖注入**:`runDeckJob(args, deps)`,index.ts 构造 deps 对象(把上面这些函数传进去)。或保守起见 runDeckJob 留在 index.ts 内重构。

`server/src/ai.ts`:
- `generateReply({provider, baseUrl, apiKey, model, systemPrompt, messages, skills, ctx, maxToolRounds})` (L112) — 所有 LLM 调用走它,已支持助手自带 baseUrl+apiKey 优先。**无内置 timeout**(红队 M-2:fan-out 各角色要自己包 Promise.race timeout)。
- `breakdownGoal`(L450)、`resolveCaller`(L387)— 可复用的拆解/端点解析,无状态。

前端:
- `web/src/components/PptStudioModal.tsx`(~1180 行)— PPT Studio。L429 还有"人手填表"调 `/generate-pptx`(红队 H2:删后端路由前**必须先删这条前端调用**,否则 404)。M2 删 manual 路径。
- `web/src/components/ChannelView.tsx` L167-172 — `channelRun` 把所有 RunEvent 塌缩成 `lastRunId`,**多 AI 并行会互相覆盖**(红队 M-3)。M3 改成按 `generationJobId` 分组。
- `web/src/lib/api.ts` — 统一 `req<T>` 注入 x-user-id;`repoPlugins()` 拉 `/api/plugins/all`。
- `web/src/lib/identity.ts` — `getUserId()`。

---

## M2 有序步骤(主干收敛,等价改造,串行)

1. **infra 导出 / DI 准备**:决定 runDeckJob 放哪。推荐:新建 `deck/orchestrator.ts`,`runDeckJob(args, deps)` 依赖注入(deps = {postDeliveryCard, emitRunEvent, postProgressCard, maybeUpdateProgressCard, finalizeProgressCard, postChannelMessage, broadcastWorkspace, scanRepoPlugins})。index.ts 构造 deps。避免循环 import。
2. **runDeckJob 单 AI 等价**:把 runPptAiJob 逻辑搬进去,先**不加 fan-out**,行为与现在逐字节近似。建 GenerationJob 行(specJson 存首次参数)、SandboxRun 写 `generationJobId`(不再伪造 taskRunId='ppt-ai:')、postDeliveryCard 的 runId 改用 sb.id。
3. **切入口**:`/generate-pptx-ai` + S3 revision 都调 runDeckJob。建 Task 时写 `kind='deck'`。
4. **S3 拆 7a/7b**(红队 H3):7a 抽 `handleDeckRevision()` 保留 return/p1Routed 语义零变更;7b 判定切 `task.kind==='deck'`。
5. **删前端人手填表**(红队 H2,**在删后端路由之前**):PptStudioModal 删 `/generate-pptx` manual 路径(约 L418-460 + 对应 UI),Modal 只留 AI 单路径。
6. **删旧后端**:删 `/generate-pptx` 路由 + `renderPptDeckHtml` + `PptSlideIn` 渲染链 + `runPptAiJob`(已被 runDeckJob 取代)。
7. 三构建 + 用 Gemini 真测一次 deck 生成(单 AI 路径)端到端 = 改前等价。commit M2。

## M3 有序步骤(编排上线,看到多 AI)

8. **plan→fan-out→compose→critic**(在 runDeckJob 内):
   - PLAN:`composeDeckPlanPrompt` → generateReply 出角色集 JSON({roles:[{role,focus,assigneeHandle}]});解析失败回退固定 plan。
   - FAN-OUT:`Promise.allSettled` 并行,content/data 角色用 `composeRolePrompt` 出文本素材;**每个角色调用包 timeout**(红队 M-2,generateReply 无内置超时)。角色用 plan 命中的 assistant 的 baseUrl/apiKey/model(多模型)。
   - COMPOSE:visual 角色用 `composeDeckSystemPrompt({...contributions})` 直出 HTML(单一事实源)。
   - CRITIC:可选 0-1 轮,`composeCriticPrompt` 出 5 维评分,needs_revision 回灌 visual 重出一次。
   - **feature flag**:`AppSetting.deckOrchestration` 关 → 回退单 AI(就是 M2 的 runDeckJob 单 AI 路径)。content/visual 硬依赖失败=整单失败;data/critic 软降级(失败只丢片段,编排卡 note 标注"评审 AI 未参与")。
9. **进度卡泳道**:各阶段发 `emitRunEvent({kind:'stage', generationJobId, role, title:'内容 AI 正在写文案'})`;rolesJson 记角色+模型。
10. **指令分诊**(revision 路径):一次便宜 generateReply 或关键词,判断重跑哪些角色(纯视觉→只 visual;内容→content+visual;数据→data+visual)。
11. **前端**:
    - 修 ChannelView channelRun 塌缩(按 generationJobId 分组)。
    - 新 `OrchestrationCard` 组件:读 GenerationJob.rolesJson + RunEvent(按 job+role),渲染 4 泳道(内容/视觉/数据/评审),每泳道 = 角色名 + 负责 AI 头像 + model 标签 + 状态。复用 ChannelCards 动效。
    - 文案修真:PptStudioModal + index.ts ackBody 现说"出 outline 调 generate_pptx"是假的(R 之后 LLM 直出 HTML),改成诚实描述"多角色协同直出 HTML deck"。
12. 三构建 + 用 4 个 Gemini 助理真测:派一个 deck → 频道里看到 plan→多角色并行→合成→Delivery,改一句话只重跑该角色。commit M3。

---

## 完整方案 + 红队报告(决策依据,在这两个 workflow 输出里)

- 设计 workflow 输出(3 方案+合成+红队):`/private/tmp/claude-501/.../tasks/w2ja3qf4e.output`(可能已清,合成方案要点已在本文件 M2/M3 步骤里)
- 审计 workflow 输出(6 维健康):`.../tasks/wjz2qoxso.output`
- 决策:不重起,清债重构;终态=任务→沙盒→迭代 + 编排式多 AI(非频道抢答)。
- doctrine §1 待改写(M3 收尾):见合成方案的【doctrine 改写】段(频道形态 + 编排≠抢答 + 多模型红利 + GenerationJob 一等公民 + 可逆 feature flag)。

---

## 新对话开场建议 prompt

```
继续 helio-clone 的 Phase T 编排式多 AI 重构。先读
docs/ai/current/V4_PHASE_T_HANDOFF.md,M1 已 push(commit 8c9b435),
现在从 M2 主干收敛开始,一路做到 M3(看到多 AI 协同)。
本地 LLM 已配好(Gemini 可用),4 个助理 aria/cypher/foster/lex 已配模型。
工作目录是 worktree:.claude/worktrees/compassionate-kirch-bf6be6。
严格按 handoff 的 M2/M3 有序步骤 + 红队修正(H2/H3/M-2/M-3)执行,
后端单体串行改、每步 build 验证、每里程碑 commit+push。
```
