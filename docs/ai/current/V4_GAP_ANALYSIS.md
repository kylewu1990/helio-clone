# V4.1 缺口分析(Phase H/I/J 跑完后的现状盘点)

> 用户深度调研后整理的缺口清单(2026-05-27)。本文档是 Phase K 立项依据,**Phase J 跑完后回头打钩**,没修干净的进 Phase K。

---

## 8 大缺口(按严重度排序)

### G1. 插件系统还是 mock(严重)

- **位置**: `web/src/components/views/PluginsView.tsx:9` 注释明确写"v5 再做"
- **现状**: `INSTALLED_MOCK` + `SOURCES_MOCK` 都是假数据
- **缺**:
  - 后端扫描 `~/.helio/skills/*/SKILL.md`(对应 Phase J N8,**已立项**)
  - 订阅源 CRUD(`/api/plugins/sources` POST/DELETE/list)
  - 启停 / 卸载逻辑
- **借鉴**: `open-design` 的 Skills protocol(`docs/ai/GITHUB_LIBRARY.md` 第 1 项)

### G2. Integrations 没真接 MCP / Connectors(严重)

- **位置**: `IntegrationsView.tsx:93` MCP tab 实际读的是 provider 配置而不是 MCP server
- **现状**: GitHub / Notion / Linear / Slack 在 `IntegrationsView.tsx:10` 是 mock
- **缺**:
  - MCP tab 接 K4 的 MCP server(Phase J N9 已立项)
  - Connectors:GitHub/Notion/Linear/Slack 真 OAuth 流(本轮可只先有"未连接"按钮)
- **借鉴**: `open-design` 的 MCP server + connector schema

### G3. Preview 有硬编码演示(已在 Phase J N6 立项)

- **位置**: `AssistantWorkspace.tsx:576` 对 #pixel-2 强制显示 `ButtonV2Demo`(写死 JSX)
- **副作用**: 掩盖了"沙盒是否真产出可预览文件"的问题
- **缺**: seed:demo 补一条真 Delivery,iframe 走 `/api/sandbox-runs/:id/preview/index.html` 真路径
- **状态**: Phase J N6 已立项

### G4. Editor 只能看,不能改(中)

- **位置**: `AssistantWorkspace.tsx:987` Monaco `readOnly: true`
- **缺**:
  - 后端 `PUT /api/sandbox-runs/:id/file?path=...`(写文件)
  - `PATCH` 接口或同上(更稳是 PUT)
  - 保存按钮 + diff 计算 + "提交评审"接 Delivery 路径
- **借鉴**: `hermes-workspace` 的 editor 模块

### G5. Inspect 不是真 iframe 管道(中)

- **位置**: `AssistantWorkspace.tsx:1022` 注入的是**主页面** eruda,不是 preview iframe 内的 console/network/DOM 管道
- **缺**:
  - eruda 注入到 **preview iframe 内**(改 servePreview 在 HTML 头注入 `<script src="/eruda.min.js">`)
  - inspect tab 用 `iframe.contentWindow.postMessage` 拿到 eruda 数据
  - 或 fallback "在 preview iframe 内点击右下角 eruda 浮窗"按钮
- **借鉴**: 自己实现即可(eruda 文档清晰)

### G6. v4 形态仍有残留(轻但视觉污染)

- **位置**:
  - `SidebarV4.tsx:152` 还有讨论频道段
  - `SidebarV4.tsx:157` 还有私信段
  - `web/src/lib/api.ts:173` 还有 `openDM` 函数
- **跟 v4 doctrine 矛盾**: doctrine 说"频道只有项目频道"
- **决策点**: 
  - **A 严格 v4**:删讨论 / 私信段,删 openDM
  - **B 务实保留**:讨论 = 跨项目协作渠道(strategy-q3 / random / all-hands 截图里有),私信 = 老板跟某个 AI 单聊小事
- **建议**: **B**,但删 openDM 函数(创建 DM 走不通)。讨论 / 私信段保留为"轻协作"(只能看 + 在已有的发消息,不能新建)

### G7. 归档 / 引导页没做(轻)

- **位置**: `App.tsx:565` 归档 / `App.tsx:570` 引导,都是"待实装"
- **建议**: Phase K 顺手
  - 归档页:列 `Channel WHERE archivedAt IS NOT NULL`,可点恢复
  - 引导页:静态 onboarding(4-5 张卡介绍主要概念)

### G8. 模板功能落地(已在 Phase J N1+N2 立项)

- 12 模板点击 → 派工(N1)
- PPT / SQL 真生成能力(N2)
- **状态**: Phase J 已立项

---

## 跟 Phase J 已立项的对照

| Gap | Phase J 编号 | 状态 |
|---|---|---|
| G3 Button v2 hardcode | N6 | ✅ 已立项 |
| G4 Editor 只读 | — | ❌ **Phase J 漏了,Phase K 补** |
| G5 Inspect | — | ❌ **Phase J 漏了,Phase K 补** |
| G1 Plugins mock | N8 | ✅ 已立项(K3 Skills 加载) |
| G2 Integrations | N9 | ✅ 部分(只做 MCP 暴露,connectors 留 v4.2) |
| G6 v4 残留 | — | ❌ **Phase J 漏了,Phase K 决策 + 补** |
| G7 归档 / 引导 | — | ❌ **Phase J 漏了,Phase K 补** |
| G8 模板真功能 | N1 + N2 | ✅ 已立项 |

**Phase K 候选清单(Phase J 跑完后立项)**:G4 Editor 可编辑 / G5 Inspect 真管道 / G6 v4 残留决策 / G7 归档+引导 / Phase J 没跑完的 N 项

---

## Phase K 排期建议(待 Phase J 跑完再定)

按用户给的实施顺序(GITHUB_LIBRARY.md 末尾):

1. **先**:G1 Plugins 真扫描(Phase J N8 完成情况看,没完成则 Phase K 接)— 借 `open-design` Skills protocol
2. **再**:G4 Editor 可编辑 + G5 Inspect 真管道 — 借 `hermes-workspace`
3. **再**:G2 Integrations MCP 暴露(Phase J N9 完成情况看)— 借 `open-design` MCP server
4. **再**:G6 v4 残留决策(用户拍板 A/B)
5. **顺手**:G7 归档 / 引导
6. **远景**(本轮不做):G3 完整 connectors / 强隔离沙盒(agent-infra/sandbox)/ chatclaw 多 Agent 组件 / openui 结构化 UI 生成

不要一次全抄。每 Phase 挑 1-2 个项目源码作为参考。

---

## 验收 Phase J 跑完时回头打钩

Phase J 跑完后回到这份文档,逐项核对:

```
G1 插件系统:[ ] mock 已清除(grep -L "INSTALLED_MOCK\|SOURCES_MOCK")
G2 Integrations MCP:[ ] 真接 K4 server(curl http://127.0.0.1:5374/health 返回 ok)
G3 Button v2 hardcode:[ ] 清除(grep -L "ButtonV2Demo\|showButtonV2Demo")
G4 Editor 可编辑:[ ] PUT /api/sandbox-runs/:id/file 存在 + Monaco readOnly:false + 保存按钮
G5 Inspect 真管道:[ ] eruda 注入 preview iframe(grep servePreview)
G6 v4 残留:[ ] 决策 A/B 后执行(grep -L "openDM"<br>web/src/lib/api.ts 第 173 行)
G7 归档 / 引导:[ ] 不再"待实装"
G8 12 模板真派工:[ ] 浏览器点击 → 真触发 executeTask(audit event 为证)
```

打钩多少进 `V4_PHASE_J_REVIEW.md` 末尾的 "Gap 修复" 段。

---

## 跟 GITHUB_LIBRARY.md 配套

- `docs/ai/GITHUB_LIBRARY.md` — 长期 GitHub 借鉴清单(跨 Phase)
- `docs/ai/current/V4_GAP_ANALYSIS.md` — 本文档,Phase K 立项依据
- 两份配套用:遇到缺口 → 查 GITHUB_LIBRARY.md 找合适项目 → 抄入 + 归属
