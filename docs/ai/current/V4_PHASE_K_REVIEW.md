# V4 Phase K — REVIEW(逐条 ✅/❌ + FINAL_VERDICT)

> 验收时间:2026-05-27
> 验收基准:`docs/ai/current/V4_PHASE_K.md`
> 起点 commit:`5d82d66`(Phase K plan + V4_GAP_ANALYSIS)
> 终点 commit:`<待 push 后填>`(Phase K REVIEW)
>
> Phase K 六次 commit:
> - `7f00d80` — K1 Editor 真可编辑(PUT 沙盒文件 + 保存 + 提交评审)
> - `8343632` — K2 Inspect 真 iframe 管道(servePreview 注入 eruda + postMessage)
> - `54ad1ca` — K3 v4 残留(删 openDM + doctrine §1 落 B)
> - `c74e302` — K4 归档页 + 引导页 OnboardingView 实装
> - `0188dcb` — K5 Connectors 占位(未连接 + 一键 OAuth toast)
> - `937902b` — K6 Phase J 小尾巴(seed:demo Delivery ≥3 + MCP /health + demo SKILL)

---

## === P0 ===

### K1 Editor 真可编辑 ✅

**做了**:
- 后端 `PUT /api/sandbox-runs/:id/file` 写沙盒文件
  - 路径守卫:`PREVIEW_DENY` + `wsNorm` within 校验(防 `../escape` / `.env` / `.git` 等)
  - 同步更新 `SandboxRun.changedFiles`(同路径 keep,新路径 wasNew ? added : modified)
  - 写 `AuditEvent { type: 'sandbox.file.edited' }`,带 prevBytes / nextBytes / wasNew
  - `broadcastWorkspace()`
- 后端 `POST /api/sandbox-runs/:id/submit-review` 把当前沙盒打包成 Delivery
  - 找现有 Delivery(同 taskId)→ 复用 + 更新 artifact;否则新建
  - 把 SandboxRun.status 标到 `ready_for_review`(若之前还在 running)
  - 通过 `postDeliveryCard` 在频道发 delivery_card(若关联 channel)
  - 写 `AuditEvent { type: 'editor.review_submitted' }`
- 后端 `text/plain` & `application/octet-stream` `addContentTypeParser`(默认 Fastify 只解析 JSON)
- 前端 `EditorPanel` 重写:Monaco `readOnly:false` + onChange 维护 draft buffer + 工具条
  - 保存按钮 + Cmd/Ctrl+S 全局绑定
  - 撤销按钮 → 回滚到 serverContent
  - 提交评审按钮 → 调 submit-review
  - 文件树:本地未保存 `●`,已 seed changed `✓`,跨文件切换不丢草稿(`draftsRef`)
- `THIRD_PARTY_LICENSES.md` 追加 hermes-workspace (MIT) editor 模块归属

**证据**:
- `git show 7f00d80 -- server/src/index.ts | head -150`:PUT 路由 + submit-review 路由
- `git show 7f00d80 -- web/src/components/workspace/AssistantWorkspace.tsx`:EditorPanel
- curl PUT 验收(server PORT=5473):
  ```
  PUT /file?path=newfile.txt  → 200 {ok:true, bytes:84, diffSize:84, wasNew:true}
  PUT /file?path=index.html   → 200 {ok:true, bytes:91, diffSize:-3234, wasNew:false}
  GET /file?path=index.html   → 改后真内容
  GET /preview                → 真渲染改后 HTML
  PUT /file?path=../../escape.txt → 403 path escapes sandbox
  PUT /file?path=.env             → 403 forbidden
  POST /submit-review              → 200 {ok:true, deliveryId, previewUrl}
  ```
- audit 留两条:
  - `sandbox.file.edited` · Kyle 在 Editor 改了沙盒文件 index.html(3325 → 91 bytes)
  - `editor.review_submitted` · Kyle 从 Editor 提交沙盒 cmpmxw94 评审(2 个文件)

### K2 Inspect 真 iframe 管道 ✅

**做了**:
- 后端 `servePreview()` 在 HTML 响应里第一个 `<head>` 之后注入 `HELIO_ERUDA_BRIDGE` 脚本
  - 加载 `/api/__inspect/eruda.min.js` → `eruda.init({ tool: ['console','elements','network','resources','info'] })`
  - wrap `console.log/info/warn/error/debug` + `window.onerror` + `unhandledrejection`
  - 通过 `parent.postMessage({type:'helio-eruda-log', level, args, at}, '*')` 发出到 Inspect tab
- 后端 `GET /api/__inspect/eruda.min.js` 从 `web/public/eruda.min.js` 读取(多候选路径,兼容 source/build 运行)
- 前端 `InspectPanel` 重写
  - `useEffect` 监听 `window.message`,收到 `helio-eruda-log` → 推入 logs 列表(环形 300 行)
  - 列表渲染:timestamp + level chip + message,按 level 着色
  - Level filter(all / log / info / warn / error)+ 清空
  - 仍保留"注入主页面 eruda"应急模式(无 preview 时)

**证据**:
- `grep -c "helio-eruda-log" server/src/index.ts` = 2(string + 注释)
- `curl /api/sandbox-runs/<id>/preview | grep helio-eruda-bridge` 命中
- `curl -I /api/__inspect/eruda.min.js` → 200 text/javascript, Cache-Control public max-age=3600
- preview HTML 真注入,验证片段:
  ```html
  <head><!-- helio-eruda-bridge:K2 -->
    parent.postMessage({type:'helio-eruda-log', level:level, args:safe, at: Date.now()}, '*');
    s.src = '/api/__inspect/eruda.min.js';
  ```
- 浏览器实测:Inspect tab UI 完整(level filter / 清空 / 注入主页面应急按钮)

### K3 v4 残留(B 务实保留)✅

**做了**:
- `web/src/lib/api.ts`:删 `openDM(userId)` 函数(创建 AI DM 入口彻底关闭)
- `server/src/index.ts`:`POST /api/dms` 保留 410 兜底
- `docs/ai/HELIOX_V4_DESIGN_DOCTRINE.md` §1 改写:
  - 从"频道只有一种:项目频道" → v4.1 务实修订
  - 项目频道(主)+ 讨论频道(跨项目)+ 私信(seed 4 条历史)
  - 不能 sidebar 新建 DM;AI 卡点击只跳 `/agent/:id`
  - 决策依据见 V4_PHASE_K.md §K3

**证据**:
- `grep -c "openDM" web/src/lib/api.ts` = **0** ✅
- `grep -rnE "api\.openDM|openDm\(" web/src/` → **0 命中** ✅
- `grep -nE "GroupHead label=" web/src/components/SidebarV4.tsx`:工作台 / 项目 / 讨论 / 私信 / 归档 / 扩展 — **6 段全在** ✅(对齐截图 01-home.png)
- 浏览器实测:Sidebar 真显示讨论(all-hands / strategy-q3)+ 私信(Aria / Cypher / Foster / Marlow)
- 后端兜底:`POST /api/dms` → 410 `dm_removed`

---

## === P1 ===

### K4 归档页 + 引导页 ✅

**做了**:
- 新增 `web/src/components/views/ArchivedView.tsx`:列 `channels.filter(archived)`
  - 项目 / 私信分类计数
  - 每行 icon + 名字 + topic + 最后活跃天数 + 成员数
  - 「恢复」按钮 → `api.patchChannel(id, {archived:false})` → 频道回 sidebar
- 新增 `web/src/components/views/OnboardingView.tsx`:4 张卡静态向导
  1. Heliox 是什么(项目频道 / Algorithm Graph / Optimizer 三件套)
  2. 派工的两种方式(主页 Composer / 项目频道 @AI / 12 模板卡)
  3. AI 团队(8 个 AI · 角色色 + 资料卡)
  4. 看效果 · Dock 8 tab(预览 / 任务 / 图 / 交付 / 记忆 / 活动 / 编辑 / Inspect)
  - 步骤指示器 + 上一步 / 下一步 / 末张「开始使用」回主页
- `App.tsx`:`view='archived'` 接 ArchivedView,`view='guide'` 接 OnboardingView(从"待实装"字符串改成真组件)
- `SidebarV4.tsx`:工作台段加 「归档」+ 「引导」 两个 NavRow(Archive / Compass icon)

**证据**:
- 浏览器实测:点 sidebar「归档」 → 真页面,显示"归档共 N 个频道"
- 手动 `PATCH /api/channels/:id { archived:true }` → 归档页真显示该频道 + 恢复按钮
- 点恢复 → 计数从 1 → 0 ✅,频道在 sidebar 重新可见
- 点 sidebar「引导」 → 真 4 张卡,步骤指示器 4 点,下一步 × 3 后到第 4 张「看效果 · Dock 8 tab」 + 「开始使用」按钮 ✅

### K5 Connectors 占位 ✅

**做了**:
- `web/src/components/views/IntegrationsView.tsx` 连接器卡重写
  - `CONNECTORS_MOCK` → `CONNECTORS`,`ConnectorDef` 类型化(`id / name / logo / description / status / scopes / authUrlPlaceholder`)
  - status 改两态:`disconnected` / `coming-soon`
  - 卡片视觉:虚线边 + 「即将上线」warning badge / 「未连接」default badge
  - 显示 authUrlPlaceholder(标 v4.2)
  - 顶部「Connectors v4.1 占位」说明条
  - Connect 按钮 → `toast.message('{name} OAuth 接入留 v4.2', { description: '详见 docs/ai/GITHUB_LIBRARY.md 第 1 项' })`
- connector schema 借鉴 open-design (Apache 2.0)字段结构;THIRD_PARTY_LICENSES.md 已在 K1 一起加好条目

**证据**:
- 浏览器实测:Integrations · 连接器 tab → 4 个 Connect(v4.2 占位)按钮
- 点 GitHub Connect → toast: "GitHub OAuth 接入留 v4.2 / 详见 docs/ai/GITHUB_LIBRARY.md 第 1 项(open-design connector schema)。" ✅

### K6 Phase J 小尾巴 ✅

**做了**:
- `server/prisma/seed-demo.ts`:再 seed 2 条真 Delivery(各带 sandbox + index.html)
  - **invoice-flow weekly 报告** — Mast 跑完上周开票流水(KPI + 入账明细表)
  - **q3-positioning v2** — 「让团队像一个人一样思考」+ Why + 已舍稿
  - 加上原 pixel-2 Button v2,共 **3 条 Delivery 起手**
- `server/src/mcp-server.ts`:`/health` 端点(与 `/healthz` 同 payload)
- 用户级 `~/.helio/skills/heliox-editor-review/SKILL.md`(K1 配套 demo skill)

**证据**:
- `curl /api/deliveries -H 'x-user-id: <kyle>'` → **3 条 pending**
  ```
  - Q3 对外一句话 · 第二稿       · pending · task=seed:q3-positioning-v2
  - Button · v2 设计稿             · pending · task=seed:pixel-2-button-v2
  - 本周开票流水报告               · pending · task=seed:invoice-flow-weekly
  ```
- `curl /api/local-skills` → `root: /Users/kaiwu/.helio/skills, count: 3`
  - heliox-changelog · heliox-editor-review(K6 新加)· heliox-screenshot
- `curl http://127.0.0.1:5474/health` → `{"ok":true,"name":"heliox-clone-mcp","tools":5}` ✅
- 主页 KPI 真显示「本周交付 3 / 待审 3」(浏览器实测)

---

## 总结表

| 项 | 状态 |
|---|---|
| K1 Editor 真可编辑(PUT + 保存 + 提交评审) | ✅ |
| K2 Inspect 真 iframe 管道(eruda 注入 + postMessage) | ✅ |
| K3 v4 残留(B 务实保留 + 删 openDM + doctrine 同步) | ✅ |
| K4 归档页 + 引导页(OnboardingView) | ✅ |
| K5 Connectors 占位(未连接 + 一键 OAuth toast) | ✅ |
| K6.1 seed:demo Delivery ≥ 3 条 | ✅(3 条) |
| K6.2 demo SKILL.md(/api/local-skills 真扫到 ≥ 1) | ✅(3 条) |
| K6.3 MCP 5374 /health 真返回 ok | ✅ |
| 三构建(server tsc / web tsc / web build) | ✅ |
| GitHub 借鉴归属(hermes-workspace MIT + open-design Apache 2.0)+ 文件级 license 头 | ✅ |
| 红线 α(派 todo → preview · 沙盒 + Delivery 路径) | ✅(沙盒/Delivery/preview 全通,真 LLM E2E 需 key) |
| 红线 β(点 AI 不创 DM) | ✅(openDM 函数已删,0 调用,sidebar AI 卡片只跳 /agent/:id) |

每段都有 git commit + push(`7f00d80` / `8343632` / `54ad1ca` / `c74e302` / `0188dcb` / `937902b`,均已 push 到 origin/main)。

所有第三方借鉴都加了文件顶 `// Inspired by …` + THIRD_PARTY_LICENSES.md 追加条目。

---

## === V4_GAP_ANALYSIS 8 大缺口最终对照 ===

```
G1 Plugins:                    ✅ (Phase J N8)
G2 Integrations MCP:           ✅ (Phase J N9)+ Connectors 占位 (Phase K K5)
G3 Button v2:                  ✅ (Phase J N6)
G4 Editor 可编辑:              ✅ (Phase K K1)
G5 Inspect 真管道:             ✅ (Phase K K2)
G6 v4 残留:                    ✅ (Phase K K3,B 务实保留)
G7 归档+引导:                  ✅ (Phase K K4)
G8 12 模板真功能:              ✅ (Phase J N1+N2)

红线 α / β 二次浏览器实测:     ✅
```

FINAL_VERDICT: **PASS**
