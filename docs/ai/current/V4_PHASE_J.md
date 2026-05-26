# V4 Phase J — 补真功能(壳子变实)

## 上下文

Phase H + I 把视觉做出来,但**很多功能只是贴图**:模板点了不工作,KPI delta 写死,Optimizer 建议主页是 hardcode,Button v2 preview 是写死 JSX 不是真沙盒产物。Phase J 把所有"贴图样子"变成真功能,**大量借鉴 GitHub 开源 + Open Design 源码**。

---

## 验收硬约束(沿用 Phase H/I 标准)

1. **每个 N 项必有真证据**(curl / sqlite / browser screenshot),REVIEW 里逐条列
2. **GitHub 借鉴必加 license 头** + `THIRD_PARTY_LICENSES.md` 追加
3. **P0 任何一条没真做 = NEED_FIX**(写死 JSX / mock 数据 / hardcode 都算)
4. **假 PASS 一律作废**,从 `318d8e3` 重做

---

## P0(必做,产品骨架的"假变真")

### N1. 主页 12 模板真接通点击 → 派工

**问题**:`HOME_TEMPLATES` 卡片点了无反应。

**改法**:
- `web/src/lib/templates.ts` 每条加 `prefilledPrompt: string`(派工时填到 composer)+ `defaultExecutor: string`(默认 AI,如"软件工程师" / "产品经理" / "设计师" 等)
- `HomeViewV4` 卡片加 `onClick` → 触发"选项目频道"小弹窗(`ChannelPicker`,显示当前 sidebar 列出的所有项目频道)→ 选完 → 真调 `api.sendMessage(channelId, prefilledPrompt)`(沿用现有 channel-first 派工链路)
- 12 模板对应:
  - PPT → "做一份 5-8 页 PPT 简报,主题:XXX,带 outline + 关键数据 + 配图建议"
  - 周报 → "写本周工作汇报,基于过去 7 天的 Delivery + AuditEvent 自动起草"
  - 数据分析 → "把这个数据问题转成 SQL,跑 DuckDB,出图表 + 论证段"
  - 文档/SOP → "把频道里近 N 条决定整理成对外文档"
  - 设计稿 → "给我 3 个方向的设计草图概念"
  - 客户邮件 → "把这段客户原话改成品牌口径回复"
  - 还有 6 张:加人(项目角色规划)/ 列表 → 任务清单(把目标拆 5-8 个 task)/ 文档 → README / 搜索 → 跨频道找记忆

**借鉴**:不需要 GitHub,这是 helio-clone 自有派工链路。

### N2. 模板背后的真生成能力(借 GitHub)

**问题**:模板内容只是 prompt,没具体生成工具。

**改法**:给软件工程师 AI 装上一些**专项工具**,模板派工时按 prompt 关键词自动启用:

| 模板 | 工具 | GitHub License |
|---|---|---|
| PPT | `pptxgenjs` 库 npm 装,AI 可用 `generate_pptx` skill 生成真 `.pptx` 文件 | MIT |
| 数据分析 | `@duckdb/duckdb-wasm` 装到 web 端 / `duckdb` node binding 装 server,AI 可用 `run_sql` skill | MIT |
| 周报 | 已有能力(read DB + write markdown),只需 prompt 模板 | — |
| 文档 / SOP | 已有能力 | — |
| 设计稿 | 已有 `generate_image` skill | — |
| 客户邮件 | 已有能力 | — |

实现:
- `pnpm -C server add pptxgenjs duckdb` 
- `server/src/skills.ts` 加 `generate_pptx` + `run_sql` 两个新 skill
- 软件工程师 AI 的 skills 列表加这两个 ID
- `THIRD_PARTY_LICENSES.md` 追加两行(pptxgenjs MIT / duckdb MIT)

**借鉴**:`pptxgenjs` 文档里有 examples,抄"基本用法 + 标题页 + 内容页" 模式;`duckdb-wasm` 同理。

### N3. 主页 KPI delta + blocked 真聚合

**问题**:`blocked = 2` 是 hardcode,`+2 / +18% / -2 / 同上周` 都是字符串。

**改法**:
- `server/src/index.ts` `/api/home-kpis` 加:
  - `blocked`:真 SQL `SELECT COUNT(*) FROM PendingInput WHERE status='waiting' AND resolvedAt IS NULL`
  - `prevWeek` 字段:返回上周同期的 onlineAgents / deliveries / reviewing / blocked,前端算 delta
- 前端 `HomeViewV4` 收到 `prevWeek` 后实时算 delta(`+2`、`+18%`、`-2`、`同上周` 等),颜色按正负

### N4. Optimizer 建议卡主页接通真后端

**问题**:主页右辅 E3 写死"营销部本周 42h"。

**改法**:
- 后端已有 Optimizer Agent + `optimizer_suggestion` Message type → 加 `/api/optimizer/suggestions?limit=1` 拉最新一条
- 前端 `HomeViewV4` E3 改成 fetch 这条数据;无 suggestion 时**整个 E3 段不显示**(不要硬撑写死)

### N5. ProjectHeaderCardV4 5 阶段百分比真接 SQL

**问题**:64% / 12% / 0% / 0% 不知道哪来的。

**改法**:
- 后端新 `/api/channels/:id/phase-stats` 返回 `{discovery: 100, build: 64, review: 12, ship: 0, maintenance: 0}`,基于该频道 Task 表的状态分布算
- 前端 `ProjectHeaderCardV4` props 接此 stats,渲染进度条

### N6. 拆 Button v2 写死 JSX,改真沙盒产物

**问题**:`AssistantWorkspace.tsx` line 577 `if channelName === 'pixel-2' showButtonV2Demo` → JSX 写死。

**改法**:
- 删 `ButtonV2Demo` 函数 + `showButtonV2Demo` 判断
- **seed:demo 补一条真 Delivery**:在 pixel-2 频道预生成一份 sandbox `index.html`(就是截图里那个 Button v2 demo 的 HTML)→ 写到 `.helio/sandboxes/pixel-2-demo/workspace/index.html` → 真创建 Delivery 记录 + previewUrl 指向这个沙盒
- preview tab 拿到 previewUrl iframe 显示 → 跟真派工产物走同一路径

---

## P1(顺手,做不完 NEED_FIX 转 Phase K)

### N7. Composer @ / slash 真菜单(tiptap)

Phase I 装了 tiptap 但没具体看 menu。要:
- `@` 触发 → 列频道成员(member 列表)
- `/` 触发 → 列 5-8 个 slash 命令(`/build`, `/review`, `/ship`, `/note`, `/task`, `/screenshot`)

**借鉴**:抄 `https://github.com/ueberdosis/tiptap/tree/main/demos/src/Examples/CommandsMenu`(MIT)

### N8. K3 Skills 包加载

`~/.helio/skills/*/SKILL.md` 真扫 + 加载,前端 Plugins · 已装 tab 真显示。SKILL.md 规范跟 Claude Code 完全兼容。

**借鉴**:抄 Open Design 仓库 `core/skills.ts`(Apache 2.0)

### N9. K4 MCP 服务器

暴露 5374 端口,接 `@modelcontextprotocol/sdk`(MIT),exports 5 个 tool:
- `create_project_channel(name, goal)` 
- `dispatch_task(channelId, prompt)`
- `get_delivery(deliveryId)`
- `list_channels()`
- `read_memory(agentId, channelId, level)`

**借鉴**:抄 Open Design 仓库 `mcp-server.ts`(Apache 2.0)

---

## P2(留档,本轮不做)

- Plugins / Integrations 数据系统的真接通(订阅源管理 / connector OAuth 等)— v4.2
- PPT / 数据分析模板的"流式预览"(生成中边写边预览)— v4.2
- daemon 架构重构 + CLI 入口 — v4.2

---

## GitHub 借鉴清单(都是 MIT/Apache 2.0,可直接 npm 或抄源码)

| 用途 | 包 | License | 用途 |
|---|---|---|---|
| PPT 生成 | `pptxgenjs` | MIT | N2 |
| SQL / 数据分析 | `@duckdb/duckdb-wasm` / `duckdb` | MIT | N2 |
| MCP 服务器 | `@modelcontextprotocol/sdk` | MIT | N9 |
| Composer 命令菜单 | `tiptap` CommandsMenu example | MIT | N7 |
| Skills 加载 | Open Design `core/skills.ts` | Apache 2.0 | N8 |
| MCP 服务器骨架 | Open Design `mcp-server.ts` | Apache 2.0 | N9 |

**规则**:每装一个 npm 或抄一段源,在 `/THIRD_PARTY_LICENSES.md` 追加一行;大段源码抄入时文件顶部加 `// Inspired by <repo> (<license>), see /THIRD_PARTY_LICENSES.md`。

---

## 验收清单

跑完后 REVIEW 必须逐条列:

```
=== P0 ===
N1 12 模板点击真派工: ✅/❌ (浏览器实测截图为证)
N2 PPT/SQL 真生成: ✅/❌ (curl 派 PPT 任务 → 沙盒真产出 .pptx 文件)
N3 KPI delta 真聚合: ✅/❌ (curl /api/home-kpis 返回 prevWeek 字段)
N4 Optimizer 主页接通: ✅/❌ (grep -L "营销部本周 42h" HomeViewV4.tsx,应该找不到 hardcode)
N5 5 阶段百分比真 SQL: ✅/❌ (curl /api/channels/:id/phase-stats 返回 5 段数字)
N6 Button v2 不再写死: ✅/❌ (grep -L "ButtonV2Demo" AssistantWorkspace.tsx,应该找不到)
红线 α: ✅/❌ (在 invoice-flow 频道派 "做一个 todo 网页" → preview 真显示)
红线 β: ✅/❌ (点 AI 名字不创 DM)
三构建: server build / web tsc / web build 全过

=== P1 ===
N7 Composer @/slash 真菜单: ✅/❌
N8 Skills 加载: ✅/❌
N9 MCP 服务器: ✅/❌

末行 FINAL_VERDICT
```

P0 任一 ❌ = NEED_FIX。

---

## 立即开跑

```
按 docs/ai/current/V4_PHASE_J.md 严格执行。

P0(必做):N1 模板真派工 + N2 PPT/SQL 真生成 + N3 KPI 真聚合 + N4 Optimizer 真接通 + N5 阶段百分比 + N6 拆 Button v2 写死。
P1(顺手):N7 Composer 菜单 + N8 Skills 加载 + N9 MCP 服务器。
P2(不做):v4.2 战略,只在 doctrine 留位。

每段完成 git commit + git push origin main。
任何 npm 装 / 源码抄必须:文件顶部加 // Inspired by <repo> (<license>) 注释 + /THIRD_PARTY_LICENSES.md 追加条目。
完成后写 docs/ai/current/V4_PHASE_J_REVIEW.md,逐条 ✅/❌,末行 FINAL_VERDICT。
假 PASS 一律作废,从 318d8e3 重做。

不允许 hardcode / 写死 JSX / mock 数据糊弄。每个 N 项必须有真证据(curl / sqlite / screenshot)。

开始。
```
