# V4 Phase K — 修剩余 4 大缺口

## 上下文

Phase H/I/J 跑完,验证 4/8 大缺口修完(G1 Plugins / G2 Integrations MCP / G3 Button v2 / G8 模板真功能)。**剩 4 个进 Phase K**:

| Gap | 内容 |
|---|---|
| **G4** | Editor 只读 → 真可编辑 + 保存 + 提交评审 |
| **G5** | Inspect 不是真 iframe 管道 → eruda 注入 preview HTML + postMessage |
| **G6** | v4 残留(讨论/私信/openDM)→ 决策 + 执行 |
| **G7** | 归档 + 引导页 → 实装 |

详情见 `docs/ai/current/V4_GAP_ANALYSIS.md`。

---

## 验收硬约束(沿用 Phase H/I/J)

1. 每个 K 项必有**真证据**(curl / sqlite / screenshot / grep)
2. GitHub 借鉴必加 license 头 + `/THIRD_PARTY_LICENSES.md` 追加
3. P0 任一 ❌ = NEED_FIX
4. 假 PASS 一律作废,从 `3c367fc` 重做
5. 不允许"显示真,数据 mock"的糊弄(Phase H/I/J 的教训)

---

## K1. Editor 真可编辑(G4,P0)

**现状**:`AssistantWorkspace.tsx:987` Monaco `readOnly: true`,只能看不能改。

**目标**:Editor tab 可改沙盒文件 → 保存 → 看 diff → 提交评审 → 走 Delivery 路径。

### 后端(server/src/index.ts)
- `PUT /api/sandbox-runs/:id/file?path=...` — body 是文件新内容,**路径必须用 `guardSandboxCommand` 同款 within 校验**(防 path traversal)
- 写完返回 `{ ok, path, bytes, diffSize }`
- 同时同步更新 `SandboxRun.changedFiles`(已存 JSON)

### 前端(`AssistantWorkspace.tsx`)
- Monaco `readOnly: false`,加 `onChange` debounced 同步本地 state
- 顶部加按钮组:**保存(Ctrl/Cmd+S)** / **撤销** / **提交评审**
- 保存按钮 → 调 PUT 接口
- "提交评审"→ 走现有 Delivery 路径(后端已有 `POST /api/sandbox-runs/:id/commit-delivery` 或类似)
- 文件被改时左侧文件树文件名加 `●` 未保存标记

### 验收
- `curl -X PUT 'http://127.0.0.1:5373/api/sandbox-runs/<id>/file?path=index.html' -H 'Content-Type: text/plain' --data-binary 'NEW' ` 返回 200
- Safari 打开 Editor tab 改一行 → Cmd+S → 看 preview tab iframe 真重新渲染

### 借鉴
- `hermes-workspace` (MIT) editor 模块 — 抄 onChange debounce + 保存 + diff 计算
- 抄入文件顶部加 `// Inspired by outsourc-e/hermes-workspace (MIT), see /THIRD_PARTY_LICENSES.md`

---

## K2. Inspect 真 iframe 管道(G5,P0)

**现状**:`AssistantWorkspace.tsx:1022` 注入主页面 eruda(不是 preview iframe),只能看主页面的 console。

**目标**:Inspect tab 真显示 **preview iframe 内的** console / network / DOM。

### 实现路径(快路径)
- **后端**:修改 `servePreview`(`server/src/index.ts:4942`),HTML 响应里**注入 eruda + postMessage bridge**:
  ```html
  <head>
    <script src="/eruda.min.js"></script>
    <script>
      eruda.init({ tool: ['console', 'network', 'elements'] });
      // postMessage bridge to parent inspect tab
      const orig = console.log; console.log = (...a) => { orig(...a); parent.postMessage({type:'helio-eruda-log', args:a}, '*'); };
      // 同样 wrap warn/error/info
    </script>
  </head>
  ```
  `web/public/eruda.min.js` 已经在(488KB),复用即可
- **前端**:`InspectPanel`(在 `AssistantWorkspace.tsx`)`useEffect` 监听 `window.message`,收到 `helio-eruda-log` 类型的就 append 到 local state 列表,渲染成 console 视图
- **fallback**:当 preview iframe 非同源(罕见)或 postMessage 失败时,显示按钮"点击 preview 右下角 ☰ 唤起 eruda"

### 验收
- Safari 派工跑出 preview → 切到 Inspect tab → 看到 preview iframe 内的 `console.log` 输出真显示在 inspect tab 列表里
- `grep "helio-eruda-log" server/src/index.ts` 命中(后端真注入了)

### 借鉴
- 自己写即可,eruda 文档清晰

---

## K3. v4 形态残留(G6,用户决策后执行,P0+)

**现状**:doctrine 说"频道只有项目频道",但实际:
- `SidebarV4.tsx:152` 讨论段
- `SidebarV4.tsx:157` 私信段
- `lib/api.ts:173` `openDM` 函数

### 默认决策(B 务实保留 + 删 openDM)

按 V4_GAP_ANALYSIS G6 建议走 **B 务实保留**:
- **保留**:讨论段(strategy-q3 / random / all-hands)+ 私信段(Aria · 设计 / Cypher · 工程 等 seed:demo 真造的频道)— 因为截图 01-home.png 里就有,而且 seed:demo 已经造了
- **删**:`openDM` 函数 + 所有调用方(创建 DM 路径走不通,但既有 DM 频道可见可发消息)
- doctrine 同步小修(§1 不再说"频道只有一种",改成"频道分为:项目频道(主)+ 讨论频道(跨项目协作)+ 私信(老板跟单 AI 的单聊),AI 助手仍是只读资料卡,不能在 sidebar 主动创建 DM")

### 后端
- 删 `openDM` 路由(server/src/index.ts)
- 既有 `Channel.isDM=true` 的数据保留(seed:demo 造的 4 个 DM)
- 创建 channel API 仍拒 `isDM=true`(Phase A 已做)

### 前端
- 删 `api.openDM` 函数
- 删调用方(grep 应该几乎没了)
- AI 助手卡片点击仍走 Agent profile,不弹 DM 创建

### 验收
- `grep -c "openDM" web/src/lib/api.ts` = 0
- `grep -rn "api.openDM\|openDm" web/src/` 全无命中
- Safari Sidebar 仍有讨论 + 私信段(显示 seed:demo 的频道)
- 但点 AI 名字仍跳 Agent profile 不创新 DM

---

## K4. 归档页 + 引导页(G7,P1)

### 归档页(`App.tsx:565` 待实装)
- 列 `Channel WHERE archivedAt IS NOT NULL ORDER BY archivedAt DESC`
- 每条:频道名 + 归档时间 + owner + 最后活跃时间 + "恢复"按钮(`PATCH /api/channels/:id { archivedAt: null }`)
- 顶部统计:`归档共 N 个频道,可恢复 / 永久删除`

### 引导页(`App.tsx:570` 待实装)
- 静态 onboarding 4 张卡(`web/src/components/views/OnboardingView.tsx`):
  1. **Heliox 是什么** — 一句话 + 核心三件套图(项目频道 / Algorithm Graph / Optimizer)
  2. **派工的两种方式** — 主页 composer 直接说 + 项目频道 @AI
  3. **AI 团队** — 12 个 AI 各司其职,@ 任何 AI 跳资料页
  4. **看效果** — Dock 8 tab 简介(preview / editor / inspect / tasks / graph / deliveries / memory / activity)
- 每张卡有"下一步"按钮 + 末张"开始使用"跳主页

### 验收
- Sidebar 工作台段点"归档" → 真页面(不是空白)
- 点"引导" → 真 4 张卡

---

## K5. Connectors 补"未连接"占位(G2 剩余,P1)

**现状**:`IntegrationsView.tsx:10` GitHub/Notion/Linear/Slack 是 mock。

**目标**:不接真 OAuth(留 v4.2),但视觉要从"假数据已连接"改成"未连接 + 一键 OAuth 跳转占位"。

### 实现
- 每个 connector 卡显示状态:`disconnected` / `coming-soon`
- "Connect" 按钮点 → 弹 toast `"GitHub OAuth 接入留 v4.2,详见 docs/ai/GITHUB_LIBRARY.md 第 1 项"`
- 视觉跟"已装插件"卡区分(灰色描边 + outlined "Connect" 按钮)

### 验收
- Safari 进 Integrations · Connectors tab → 看到 4 个 connector 卡,状态都是"未连接",点击弹 toast 不报错

### 借鉴
- `open-design` connector schema(Apache 2.0)— 抄 connector type 定义(name / logo / status / authUrl placeholder)

---

## K6. Phase J 没修干净的小尾巴(顺手清)

REVIEW 里 Phase J 标 PASS 但有几个细节:
- [ ] `seed:demo` 真生成的 Delivery 数量(目前 1 条,plan 写 ≥3 条)
- [ ] N8 SKILL.md 扫描是否真有示例 skill 包?在 `~/.helio/skills/` 放一个 demo SKILL.md 让 Plugins · 已装 tab 真显示一条
- [ ] N9 MCP server 健康检查 `curl http://127.0.0.1:5374/health` 返回 ok(确认启动)

---

## 三构建 + commit + push

```bash
pnpm -C server build
pnpm -C web exec tsc --noEmit
pnpm -C web build
# 每段完成 git add -A + git commit + git push origin main
```

---

## REVIEW 末尾必填

在 `docs/ai/current/V4_PHASE_K_REVIEW.md` 末尾:

```
=== V4_GAP_ANALYSIS 8 大缺口最终对照 ===
G1 Plugins:    ✅ (Phase J N8)
G2 Integrations MCP:  ✅ (Phase J N9)+ Connectors 占位 (Phase K K5)
G3 Button v2:  ✅ (Phase J N6)
G4 Editor 可编辑:    ✅ / ❌ (Phase K K1)
G5 Inspect 真管道:   ✅ / ❌ (Phase K K2)
G6 v4 残留:    ✅ / ❌ (Phase K K3,默认 B)
G7 归档+引导:  ✅ / ❌ (Phase K K4)
G8 12 模板真功能:  ✅ (Phase J N1+N2)

红线 α / β 二次浏览器实测:✅ / ❌

FINAL_VERDICT: PASS / NEED_FIX
```

---

## 立即开跑

```
按 docs/ai/current/V4_PHASE_K.md 严格执行。

P0(必做):
- K1 Editor 真可编辑(Monaco readOnly:false + PUT 接口 + 保存 + 提交评审)
- K2 Inspect 真 iframe 管道(eruda 注入 preview HTML + postMessage 桥)
- K3 v4 残留(默认走 B 务实保留:删 openDM 但保留讨论/私信段)

P1(顺手):
- K4 归档页 + 引导页 OnboardingView
- K5 Connectors 占位"未连接 + 一键 OAuth 跳转 toast"
- K6 Phase J 小尾巴(seed:demo Delivery ≥3 / demo SKILL.md / MCP health check)

GitHub 借鉴:
- K1: 抄 hermes-workspace (MIT) editor 模块 → 加 license 头
- K5: 抄 open-design (Apache 2.0) connector schema → 加 license 头
- 都在 /THIRD_PARTY_LICENSES.md 追加条目

每段完成 git commit + git push origin main。
完成后写 docs/ai/current/V4_PHASE_K_REVIEW.md,逐条 ✅/❌,末行 FINAL_VERDICT,且必须包含 V4_GAP_ANALYSIS 8 大缺口最终对照表。
假 PASS 一律作废,从 3c367fc 重做。

不允许 hardcode / 写死 JSX / mock 数据糊弄。每个 K 项必须有真证据(curl / sqlite / screenshot)。

开始。
```
