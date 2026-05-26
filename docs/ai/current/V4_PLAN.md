# Heliox v4.1 实施计划 — UI 重塑 + 项目频道闭环

## Context

`docs/ai/CURRENT_GOAL_PROMPT.md` 和 `HELIOX_V4_DESIGN_DOCTRINE.md` 把本轮定义为 **v4.1**:基于 `reference/v4-opendesign-screens/`(18 桌面 + 4 移动截图)+ `reference/v4-source/index.html`(5701 行自有 vanilla 实现),**完整复刻 UI 并跑通项目频道闭环**。

v1~v3 的痛点(DM 上下文混乱、AI 私聊产物乱漂、preview tab 空白)在 v4 形态里直接被砍掉:**频道只有一种 = 项目频道**;AI 助手只剩**只读资料卡**;所有协作发生在频道里。

**最高硬约束(评审红线)**:**功能 > UI**。UI 漂亮但 preview tab iframe 是空白 = 直接 NEED_FIX。本轮必须能做到:**在项目频道 composer 派工 → 沙盒真写代码 → preview tab iframe 真渲染产物**。

---

## 现状摸底(开工前 baseline check)

- 后端 `server/src/index.ts` ~5981 行,`/api/sandbox-runs/:id/preview/*` 路由**已存在**(约 line 4942-4950),`detectWebPreview` 已识别 HTML 入口(`sandbox.ts:646`),沙盒派工流 `executeTask` 已能写文件 + 生成交付卡 — **场景 α 复用这条**
- `isDM` 字段在 `server/src/index.ts` 出现 ~20 处、`web/src/` ~15 处 — **核心删除目标**
- 前端 `web/src/components/` 还是 v3 结构:`AssistantWorkspace.tsx`(766 行,左聊右产物)、`MissionWorkspace.tsx`(710 行)、`HomeView.tsx`(528 行)、`Sidebar.tsx`(702 行,含「讨论 / DM / AI 助手」三段)、`InteractivePreview.tsx`(已有设备宽切换)
- 截图视觉与现状差异大:**8 tab dock**(现 9 tab 顺序乱)、5 段进度条、自动度 ring、6 部门卡、Plugins / Integrations 两段全局菜单
- prisma schema 完整(Channel / Task / Delivery / SandboxRun / Memory / Edge),**不动 schema**,只锁字段
- 前端依赖薄(react 19 + tailwind 4 + lucide + react-markdown + dagre + xterm),**8 dock tab 需要新轮子**
- v3 J 系列(J1/J3/J4/J5)代码里只有部分,需要逐条对齐 prompt 要求

---

## 整体形态

```mermaid
graph LR
  subgraph Sidebar[Sidebar 240px · 4 段]
    WS[工作台<br/>主页/公司全景/项目列表/归档/引导]
    PRJ[项目<br/>#pixel-2 ...]
    PLG[插件<br/>installed/sources]
    INT[集成<br/>MCP/connectors/anywhere]
  end

  subgraph Channel[项目频道页面]
    HD[ProjectHeader<br/>5 段进度 + 自动度 ring + 4 KPI]
    TL[中央时间线<br/>Progress / Delivery 卡]
    CO[Composer<br/>派工入口]
    DOCK[右辅 Dock 8 tab]
  end

  subgraph Dock[Dock · preview 默认]
    P[preview<br/>iframe + 设备切换]
    E[editor<br/>Monaco + 文件树]
    I[inspect<br/>eruda 注入]
    T[tasks]
    G[graph]
    DV[deliveries]
    M[memory]
    A[activity]
  end

  subgraph Backend[后端]
    EX[executeTask<br/>channelId 硬绑定]
    SB[Sandbox<br/>workspacePath]
    PV[/api/sandbox-runs/:id/preview/*]
  end

  WS --> Home[主页 composer]
  WS --> Co[公司全景 6 部门卡]
  PRJ --> Channel
  CO -- 派工 --> EX
  EX -- 真写文件 --> SB
  SB -- detectWebPreview --> PV
  P -- iframe src --> PV
  E -- 读/写 --> SB
  I -- eruda postMessage --> P
  DOCK --> P & E & I & T & G & DV & M & A

  classDef hot fill:#fef3c7,stroke:#f59e0b,color:#000;
  class P,E,I,EX,SB,PV hot
```

闭环关键:**Composer → executeTask → sandbox → detectWebPreview → preview iframe**。本计划重点保这条链。

---

## Phase A:后端形态校准(1.5h)

**目标**:删除 DM,锁 phase 枚举,补 agent profile API,修 J 系列。让前端可以放心按"只有项目频道"写。

| 改动 | 文件 | 做法 |
|---|---|---|
| 拒 DM 创建 | `server/src/index.ts` `POST /api/channels`(约 line 1493) | `isDM=true` 直接 400;`kind` 强制 `'project'`(其他值 400) |
| phase enum 校验 | `index.ts` 创建/更新频道路由 | 不属于 `discovery/build/review/ship/maintenance` 一律 400 |
| 删 openDM 路由 | `index.ts` 搜 `openDM`、`isDM: true` 写入处 | 整个路由删,前端 `api.openDM` 入口同步删 |
| Agent profile API | `index.ts` 新增 `GET /api/agents/:id` | 返回 `{ persona, l1, l2[], l3Recent[], trust, activeTask, recentDeliveries[5], activeChannels[] }`,数据来自现有 memory 模块 + Task / Delivery 表 |
| J1 channelId 硬绑定 | `index.ts` `executeTask(taskId, opts)` 顶部 | `const channelId = task.channelId`,忽略 `opts.channelId` 覆盖 |
| J3 自动加 exec AI | `index.ts` 项目频道创建处 | 创建后查 `ChannelMember` 里有无 exec-skills AI;没有就自动加"软件工程师" |
| J4 无 executor 硬 cede | `index.ts` `pickAutoExecutor` 分支(约 line 680-740) | 所有职能 AI 写入 `cededBy`,**禁止再 generateReply 文字** |
| J5 create_task 立即触发 | `server/src/skills.ts` `setAutoExecAfterCreateTaskHook` | 创建任务后立刻 `void executeTask(task.id, ...)` |

`migrations`:DB 业务数据已清空,SQLite `isDM` 字段保留但不再写入。**schema 不动**(向后兼容)。

**验收**:
- `curl -X POST /api/channels -d '{"isDM":true}'` → 400
- `sqlite3 dev.db "SELECT COUNT(*) FROM Channel WHERE isDM=1"` → 整个会话保持 0
- `curl /api/agents/<id>` 返回结构化数据
- 在 channelId=A 的频道里发 build intent → AuditEvent `a2a.auto_assigned` 的 `channelId=A`(J1 验证)

---

## Phase B:设计 token + 基础组件 + 闭环依赖(2h)

**目标**:把 `v4-source/index.html` 的 OKLCH token 抽进 `theme.css`,装齐闭环要用的 npm 轮子,抽出三个新组件。

### B1 theme.css / index.css 重写
- 把 `reference/v4-source/index.html` `:root` 和 `html[data-theme="dark"]` token 块**整段抽**到 `web/src/theme.css`,变量名以源 HTML 为准(`--canvas` `--glass` `--accent` `--ok` `--opt` `--r-sm/md/lg/xl` ...)
- 旧 v1~v3 token(`--surface-1/2/3`、`--text-primary/secondary/tertiary`、`--accent-soft`、`--app-bg` 等)冲突的**直接删**;在 theme.css 末尾添加**别名层**桥接(`--surface-1: var(--glass-2)`、`--text-primary: var(--ink)`)避免 5000 行旧代码大爆炸
- keyframe(`aurora-bar` / `agent-pulse-ring` / `surface-glow` / `activity-in` / `card-lift`)整段抽进 `web/src/index.css`

### B2 npm 依赖安装(一次性)
```
pnpm -C web add sonner cmdk framer-motion @monaco-editor/react react-arborist
pnpm -C web add @xyflow/react react-hook-form zod @hookform/resolvers
pnpm -C web add @radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-avatar @radix-ui/react-progress @radix-ui/react-accordion
pnpm -C web add clsx tailwind-merge class-variance-authority
pnpm -C web add @tiptap/react @tiptap/starter-kit @tiptap/extension-mention
pnpm -C web add recharts
```
每装一组**追加一行**到 `/THIRD_PARTY_LICENSES.md`(已有 Open Design 节,append 即可)。**不装** `next-themes`(项目无 next)、不装 `assistant-ui`(自己的卡片体系够用)。

### B3 shadcn/ui 风格基底
- 不引 `shadcn` CLI(需 next 配置),改为**手工 copy-paste**:`web/src/components/ui/{button,input,tabs,dialog,tooltip,avatar,card,progress,select,switch,accordion,sheet}.tsx`
- 来源直接抄 shadcn-ui 仓库 MIT 头文件,每个文件顶部加 `// Inspired by shadcn/ui (MIT), see /THIRD_PARTY_LICENSES.md`
- 这一层做完后**所有新页面用 ui/ 组件**,旧组件维持不动直到 Phase F 清理

### B4 三个新组件(必须可复用)
- `web/src/components/ui/AutonomyRing.tsx` — SVG `<circle>` + `stroke-dasharray`,props `{ value: 0-100, size: 64 }`,色梯度按 doctrine §6.3
- `web/src/components/ui/PhaseProgress.tsx` — 5 段 pill,props `{ current: ProjectPhase, percents?: number[] }`,当前段加 `agent-pulse-ring`
- `web/src/components/ui/Sparkline.tsx` — mini SVG path,props `{ data: number[], width?, height? }`,描边 `--accent`
- `web/src/components/ui/CommandPalette.tsx` — 包 `cmdk`,⌘K 触发,全局快速跳频道 / 跳 Agent profile

### B5 Sonner 挂载
- `web/src/main.tsx` 挂 `<Toaster richColors />`,后续所有 toast 用 `import { toast } from 'sonner'`

**验收**:`pnpm -C web build` 通过;新 token 在 DevTools `:root` 可见;三个新组件单独渲染正常。

---

## Phase C:导航重构 + 全局菜单两段(1.5h)

**目标**:Sidebar 砍 v3 三段,改 doctrine §2.1 四段;新增 Plugins / Integrations 两个独立 view。

### C1 Sidebar.tsx 重写
- 删:`assistants` 段、`isDM` 频道分支、`dmPicker` 状态、`onOpenDM` / `onCreateAssistant` / `onEditAssistant` 入口
- 留 4 段:**工作台**(主页 / 公司全景 / 项目列表 / 归档 / 引导)、**项目**(`channels.filter(c => c.kind === 'project')`)、**插件**(installed / sources)、**集成**(MCP / connectors / anywhere)
- 宽 240px。AI 助手不在 sidebar 出现,只在公司全景 / 频道成员里点名字进 Agent profile

### C2 App.tsx 的 MainView 扩展
`MainView` 加 `'overview' | 'plugins' | 'integrations' | 'agent'`,删 `'inbox' | 'tasks' | 'mission' | 'terminal'`(被频道取代)。

### C3 Plugins 页(新建 `web/src/components/views/PluginsView.tsx`)
- 路由 `/plugins`,两 tab(`@radix-ui/react-tabs`):**已装** + **订阅源**
- 已装:卡片列表 mock 数据(name / logo emoji / description / version / enabled switch / uninstall)
- 订阅源:URL 列表 + 状态 + 上次刷新 + 移除按钮
- 视觉对齐截图 `15-plugins-installed.png` / `16-plugins-sources.png`

### C4 Integrations 页(新建 `web/src/components/views/IntegrationsView.tsx`)
- 路由 `/integrations`,三 tab:**MCP** / **Connectors** / **Anywhere**
- MCP tab **接真数据**:复用现有 `publicProviders()` / `/api/providers`,展示已配置 provider + 状态 chip(截图 `17-integrations-mcp.png`)
- Connectors:GitHub / Notion / Linear placeholder(`18-integrations-connectors.png`)
- Anywhere:全局快捷键 / 桌面浮窗 placeholder(`19-integrations-anywhere.png`)

**验收**:Sidebar 视觉与 `01-home.png` 接近;Plugins / Integrations 可切 tab,不报错。

---

## Phase D:主页 + 公司全景(2h)

### D1 HomeView 重写(`web/src/components/views/HomeView.tsx` 整页重写)
按截图 `01-home.png`:
- 顶部 4 KPI 横条:`在岗 Agent / 本周交付 / 评审 / 待办`,新加 `/api/home-kpis` 聚合接口
- 大问候 28-36px:"想让 AI 团队做点什么?"
- 中部 composer 主输入框(tiptap 起步,@ 补全 + slash 命令),提交 → 弹"选择项目"对话框 → 跳过去自动派工
- "常用工作"模板 4-6 张(数据来源:现有 `templates`)
- 右辅栏(280px):**今日动态**(`/api/audit-events`)、**Optimizer 建议**(若 v3 Optimizer Agent 仍在,接其输出)、**快捷入口**

### D2 CompanyOverview 页(新建 `web/src/components/views/CompanyOverview.tsx`)
按截图 `02-dashboard.png`:
- 顶部 4 KPI 横条
- 6 张**部门大卡**:按 `channel.goal` 关键词分组(`产品 / 品牌 / DesignOps / 增长 / 合规 / 工程`),初版用关键词正则 mapping
- 每张:status chip + **自动度 ring 72px** + 7 日 Sparkline + KPI 数字 + 一句话状态
- 数据接口:`GET /api/overview/departments` 新建,后端按关键词分组聚合

**验收**:HomeView 与 `01-home.png` 信息块对齐;CompanyOverview 6 张部门卡可见,数字真实。

---

## Phase E:项目频道 + 8 tab dock(3.5h,闭环核心 ★)

**目标**:这是 PASS 红线。`ChannelView.tsx` 整页重写,顶部项目卡升级,dock 8 tab 全接真实数据,**preview 默认选中且 iframe 真显示沙盒产物**。

### E1 ChannelView.tsx 顶部 ProjectHeaderCard 升级
按截图 `03-project-pixel2-preview.png` 顶部:
- 左:`#pixel-2` 编号 + 项目标题 + `ALPHA` chip
- **5 段进度条**(`PhaseProgress` 组件):`DISCOVERY / BUILD / REVIEW / SHIP / MAINTENANCE`,当前段 pulse,已完成段实色
- 4 个百分比(build / review / ship / maintenance):基于 task 完成率分阶段统计,新加 `/api/channels/:id/phase-stats`(group by phase + status)
- 右:goal 一句话 + owner 头像 + **自动度 ring** 64px(频道级 autonomy = 该频道所有 task autonomy 平均)

### E2 Dock 8 tab 改造(顺序 + 内容)
重写 `AssistantWorkspace.tsx`(改名为 `ProjectDock.tsx`),tab 数组按 doctrine §2.3 顺序:

| Tab | 状态 | 改法 |
|---|---|---|
| **preview** ★ 默认选中 | 改造现有 | 复用 `InteractivePreview.tsx`,空状态加"在下方 composer 派工试试" hint;`previewUrl` 从 `deriveWebPreview(deliveries)` 拿最新交付卡;地址栏显示 `preview.aurora.heliox/...` 风格 fake host(只是 UI label,iframe 真实 src 不变) |
| **editor** ★ | **新建** | `@monaco-editor/react` + `react-arborist`。新接口 `GET /api/channels/:id/sandbox-tree` / `GET /api/sandbox-runs/:id/file?path=...` / `POST /api/sandbox-runs/:id/file`,"提交评审" → 落 Delivery |
| **inspect** ★ | **新建** | eruda 注入:`servePreview` HTML 响应里注入 `<script src="/eruda.min.js"></script><script>eruda.init()</script>`(本地 vendor 化,放 `web/public/eruda.min.js`,不引外网 CDN)。inspect tab 用 `iframe.contentWindow.postMessage` 接收 eruda 消息;拿不到则 fallback "打开原生 devtools"按钮 |
| tasks | 已有 | shadcn Card 重新排版,接 `/api/tasks?channelId` |
| graph | 已有 `AlgorithmGraph.tsx` | 底层换 `@xyflow/react`,节点 / 边数据保持 `Edge` 表不变 |
| deliveries | 已有 `DeliveryCenter.tsx` | PR-style 卡片风格,接 `/api/deliveries?channelId` |
| memory | 已有 `MemoryPanel.tsx` | `framer-motion` 入场动效;L2 + L3 时间线 |
| activity | 已有 `ActivityFeed.tsx` | `@tanstack/react-virtual` 虚拟滚动 |

### E3 Composer 升级
- 用 `@tiptap/react` + `Mention` extension,@ 补全频道成员;slash `/build` / `/review` / `/ship` 切阶段;附件用 `react-dropzone`
- 提交流走 `POST /api/channels/:id/messages`(已有);**不改后端**,`looksLikeBuildRequest` + 自动派工已能跑

### E4 闭环验证脚本
写 `server/scripts/v4-smoke.ts`:
1. 创建项目频道(自动加软件工程师 AI)
2. 发"做一个 Button 组件,有 Primary/Accent/Secondary/Ghost/Destructive 5 个 variant"
3. 轮询 30 秒等 sandbox 完成
4. `curl /api/sandbox-runs/:id/preview/index.html` → 期望 200 + HTML 含 5 个 `<button>`
5. 检查 `Channel.isDM=true` 计数仍为 0

**验收(场景 α 红线)**:
- [ ] composer 派工 → 项目频道里出现 Progress Card
- [ ] sandbox 真写 `index.html`(`ls workspacePath`)
- [ ] preview tab iframe **真渲染 5 个 button**(浏览器看)
- [ ] Desktop / Tablet / Mobile 切换真改 iframe width
- [ ] Delivery Card 出现,`previewUrl` 可点
- [ ] **不创建任何 DM channel**

---

## Phase F:Agent profile + 新建项目 modal + 清理 v1~v3 残留(1.5h)

### F1 Agent profile 页(新建 `web/src/components/views/AgentProfileView.tsx`)
按截图 `12-agent-aria.png`,**无聊天框,无"给 ta 发消息"按钮**:
- 头像 + 名 + preset + L1 systemPrompt 摘要
- L2 项目记忆(按项目分组,Accordion 折叠)
- L3 近期事件(`framer-motion` 滚动)
- 信任分级 3 段条
- 当前 active task(从 `/api/tasks?assigneeId` + `status in [todo, doing]`)
- 最近 5 个 Delivery(跨所有项目)
- "在 N 个项目里活跃" → 跳频道
- 数据接口:Phase A 的 `GET /api/agents/:id`

### F2 NewProjectModal(替换 Sidebar 内嵌创建)
按截图 `14-new-project-modal.png`,`react-hook-form` + `zod` 多步表单:
- **Step 1**:名称 / goal(必填,≤200 字)/ scope / 初始 phase(默认 `discovery`)
- **Step 2**:owner 选择(默认当前用户)
- **Step 3**:推荐 AI 队员(列出有 exec skills 的 AI,默认勾选"软件工程师")
- 提交 → `POST /api/channels` + 自动 `POST /api/channel-members`

### F3 删 v1~v3 残留(放心删)
- 删:`InboxView.tsx`、`TasksView.tsx`(全局版)、`TerminalView.tsx`、`MissionWorkspace.tsx`、`MissionComposer.tsx`、`PendingActionDrawer.tsx`、`SafetyDrawer.tsx`、`ExecutionCockpit.tsx`、`PendingInputModal.tsx`、`TemplatePreview.tsx`、`CreateAssistantModal.tsx`
- App.tsx 大瘦身:删上述对应 state / handler / WS 分支
- `api.ts` 删 `openDM` / `inbox` / `inboxRead` / `missions` 等

**视觉冲突清单**(留意 alias 层):新组件用源 HTML token(`--ink` `--glass`),老组件还用 `--text-primary` `--surface-1` — Phase B 的 alias 层负责兼容,**不强制大规模 rename**。

---

## Phase G:验证 + 构建 + 文档(1h)

### G1 三个 build
- `pnpm -C server build` 通过
- `pnpm -C web exec tsc --noEmit` 通过
- `pnpm -C web build` 通过

### G2 场景 α(项目频道闭环)
跑 Phase E.E4 smoke 脚本 + 浏览器手测,记录到 `docs/ai/current/V4_LOGIC_VALIDATION.md`。

### G3 场景 β(AI 助手只读)
- 点公司全景里 AI 名字 → 跳 Agent profile 页,`sqlite3 dev.db "SELECT COUNT(*) FROM Channel WHERE isDM=1"` 全程 = 0
- Agent profile 页**无聊天框**(grep 该文件无 `<textarea` / `<Composer`)

### G4 产物文档
- `docs/ai/current/V4_BUILD_RESULT.md` 构建日志
- `docs/ai/current/V4_REVIEW.md` 自评
- `docs/ai/current/V4_LOGIC_VALIDATION.md` 5 场景日志(每场景带 curl/sqlite/screenshot 证据)
- `docs/ai/current/V4_DELIVERY.md` 交付摘要 + **人工验收路径**(必含两条:点 AI 名字不创建 DM、项目频道发"构建 X" 真开工)

---

## 风险 / 已知降级方案(做不完就退化,不硬撑)

- **eruda postMessage 跨域读不到**:inspect tab 退化为"打开原生 devtools"按钮 + 跳新窗口,不空白
- **shadcn/ui copy-paste**:Vite 无 next.config,CLI 不工作,手工 copy 12 个核心组件,每文件加 attribution
- **token alias 层**:不强制全局 rename `--text-primary` → `--ink`,新组件用源 HTML token,老组件靠 alias 桥接
- **@xyflow/react 冲突**:若与现有 dagre 冲突,graph tab 暂留 v2 AlgorithmGraph
- **editor monaco 集成失败**:退化为只读 codemirror 或纯 textarea(本轮 NEED_FIX 标注,下轮修)
- **沙盒 preview 失败(场景 α 红线)**:**必须**先修通,不允许降级跳过
- **eruda + Monaco 体积涨 ~2MB**:可接受,本地优先 app 无 CDN 流量成本
- **CompanyOverview 部门归类**:初版关键词正则;不够好覆盖 fallback "其他" 部门
- **schema 不动**是硬约束;若发现确实缺字段只加不删
- **isDM 字段保留** schema 里(数据库列不动),代码不再读 / 写

---

## 时长(纯实施,串行)

| Phase | 内容 | 预估 |
|---|---|---|
| A | 后端校准 + J 系列 | 1.5h |
| B | token + npm + 三组件 + shadcn 基底 | 2h |
| C | Sidebar + Plugins + Integrations | 1.5h |
| D | HomeView + CompanyOverview | 2h |
| E | ChannelView + 8 tab dock + 闭环 ★ | **3.5h**(重头戏) |
| F | Agent profile + NewProject modal + 清理 | 1.5h |
| G | 三构建 + 5 场景验证 + 文档 | 1h |
| **合计** |  | **~13h** |

E 是闭环红线;editor + inspect 若任一无法两个都做完,**优先保 preview**(已现成),editor 退化为只读 Monaco,inspect 退化为"开新窗口看原生 devtools",不影响场景 α PASS。

---

## 立即可跑的第一步

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone

# 1. 装基础轮子(Phase B2)
pnpm -C web add sonner cmdk framer-motion @monaco-editor/react react-arborist \
  @xyflow/react react-hook-form zod @hookform/resolvers \
  @radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-avatar @radix-ui/react-progress @radix-ui/react-accordion \
  clsx tailwind-merge class-variance-authority \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-mention \
  recharts

# 2. 抽 token(Phase B1):打开 reference/v4-source/index.html 头部 <style>,整段抽到 web/src/theme.css

# 3. 删 isDM(Phase A1):server/src/index.ts ~20 处改完,pnpm -C server build 确认编译过

# 之后按 Phase A → G 顺序往下
```
