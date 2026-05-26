# V4.1 实施计划(Phase A / B / C)

> 本计划基于:`docs/ai/CURRENT_GOAL_PROMPT.md` + `docs/ai/HELIOX_V4_DESIGN_DOCTRINE.md` + `reference/v4-opendesign-screens/` + `reference/v4-source/index.html`。
> 优先级最高的红线:**场景 α(项目频道闭环 + preview 真渲染)** 和 **场景 β(AI 助手只读)**。
> 既有 v1~v3 代码:跟新设计冲突的**直接删**,不为保留而保留。

---

## 现状摸底(写计划前先扫的)

- web/ 与 server/ 都已存在,且仍带大量 v1~v3 残留(`InboxView` / `MissionWorkspace` / `MissionComposer` / `MissionBoard` / `ApprovalGate` / `DeliveryPanel` / DM 路径等)
- `isDM` 在 server/src/index.ts 出现 ~20 处,在 web/src 出现 ~15 处 — **核心删除目标**
- prisma schema 已有完整 Channel / Task / Delivery / SandboxRun / Memory / Edge 模型;**不动 schema**,只锁字段
- 沙盒 preview 路由 v2 留存可用:`GET /api/sandbox-runs/:id/preview/*`(server/src/index.ts:4942)— **场景 α 复用这条**
- web 依赖较薄:react 19 + tailwind 4 + lucide + react-markdown + dagre + xterm。**8 dock tab 必须装新轮子**
- `reference/v4-source/index.html`(5701 行)+ `DESIGN-MANIFEST.json` + `tools/` 是地基,token / 动效整段抽

---

## Phase A — 后端形态校准 + 视觉地基(预计 4-6 小时)

**目标**:打开服务后,DM 路径彻底死掉;视觉 token / 动效 keyframe 整段对齐源 HTML;基础轮子装好,后续 phase 直接用。

### A1. 删除 DM 路径(后端)

**文件**:
- `server/src/index.ts` — 删 / 改 ~20 处 `isDM` 引用
  - L582 / L748 / L811 / L846 / L907:`!channel.isDM && ...` → 直接走 project 分支(条件去掉)
  - L1191-L1209:assistant active channels 列表去 `isDM` 过滤
  - L1305 / L1361 / L1398:list channels 去 `where isDM=false/true` 过滤,全量都是 project
  - L1430-L1435 / L1493 / L1526 / L1540 / L1557-L1573 / L1999:删 DM 创建 / DM peer 命名分支
- `POST /api/channels` 路由:收到 `isDM: true` 直接返回 400(`{ error: 'isDM_not_supported' }`)
- `POST /api/users/:assistantId/dm`(若存在) → 删除整个路由
- `server/src/ai.ts` / `server/src/context.ts`:buildProjectContext 里若有 DM 分支,合并到 project 单一分支

**验收**:`sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM Channel WHERE isDM=1"` 返回 0;curl `POST /api/channels {"isDM":true}` 返回 400。

### A2. phase enum 校验(后端)

**文件**:`server/src/index.ts` — POST/PATCH `/api/channels` 处理函数顶部加:

```ts
const PHASE_ENUM = ['discovery', 'build', 'review', 'ship', 'maintenance'] as const
if (body.phase && !PHASE_ENUM.includes(body.phase)) {
  return reply.status(400).send({ error: 'invalid_phase', allowed: PHASE_ENUM })
}
```

**验收**:curl `PATCH /api/channels/:id {"phase":"foo"}` 返回 400。

### A3. v3 J 系列闭环(后端)

**文件**:`server/src/ai.ts` + `server/src/index.ts`(executeTask / create_task / mention dispatch)
- **J1**:executeTask 函数顶部 `const channelId = task.channelId`,**忽略** `opts.channelId`
- **J3**:`POST /api/channels` 创建成功后,若 members 里没有任何 `User.skills` 含 `exec-skills` 的 AI,自动 ChannelMember.create({ userId: <软件工程师 id> })
- **J4**:无 executor 时,所有职能型 AI(designer/pm 等)写入 `cededBy`,不再 generateReply 文字
- **J5**:`create_task` tool 成功后,立即 `executeTask({ taskId: created.id })`(非阻塞,catch 后写 AuditEvent)

**验收**:新建项目频道 → 无显式 assign → DB 里出现一条 ChannelMember 是软件工程师 AI。

### A4. AI 助手 Agent profile API(后端)

**文件**:`server/src/index.ts` 新增 `GET /api/agents/:id`:

```ts
return {
  user: { id, name, isAssistant, preset, systemPrompt(摘要 200 字) },
  l1: roleSummary,
  l2: [{ channelId, channelName, summary }],
  l3: [{ channelId, recentNotes: [...] }],
  trust: { autonomy, accuracy, fluency },
  activeTask: Task | null,
  recentDeliveries: Delivery[5],
  activeChannels: [{ id, name, lastActiveAt }],
}
```

数据来源:User + Memory(L1 trait, L2 per-channel, L3 recent)+ Task where assigneeId=id AND status='running' + Delivery limit 5 + ChannelMember join 近 7 日 RunEvent。

**验收**:curl `GET /api/agents/<software-engineer-id>` 返回完整结构。

### A5. theme.css / index.css 整段抽源 HTML

**文件**:
- `web/src/theme.css` — 整段替换为源 HTML `<style>` 的 `:root` + `[data-theme="dark"]` block(OKLCH 全色板 + agent state + identity 12 色 + glass + lane)
- `web/src/index.css` — 抽源 HTML 的 keyframe:`aurora-bar` / `surface-glow` / `agent-pulse-ring` / `card-lift` / `activity-in` / `cockpit-in`,以及基础 typography stack(font-family / tabular-nums / 字号阶梯)
- 既有冲突 token 一律删

**验收**:`npm -C web run build` 不报 CSS 变量缺失;打开 web 看主页背景 / 卡片立刻有 v4 截图质感。

### A6. 装基础 npm 依赖

**文件**:`web/package.json`,在 web/ 目录跑:

```
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-accordion @radix-ui/react-avatar @radix-ui/react-dropdown-menu
pnpm add cmdk sonner framer-motion next-themes
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @monaco-editor/react react-arborist
pnpm add @xyflow/react
pnpm add recharts
pnpm add react-hook-form zod @hookform/resolvers
pnpm add react-dropzone
pnpm add @tanstack/react-virtual
```

每装一组在 `THIRD_PARTY_LICENSES.md` 追加一行(包名 / 协议 / 用途)。

**验收**:`pnpm -C web install` 通过,`pnpm -C web run build` 通过。

---

## Phase B — 核心闭环:项目频道 + 8 dock tab(预计 10-14 小时,场景 α 红线)

**目标**:打开 web → 点项目频道 → composer 派工 → Progress Card → 沙盒真写 → **preview tab iframe 真渲染** → Delivery Card 出现。

### B1. Sidebar 二段重构

**文件**:`web/src/components/Sidebar.tsx`(完全重写,~250 行)
- 删:讨论段 / 私信段 / AI 助手段
- 新结构:`[工作台]` 主页 / 公司全景 / 项目列表 / 归档 / 引导 / Plugins / Integrations + `[项目]` 本人 ChannelMember 的频道
- 宽度 240px,字号 13px,按源 HTML 的 sidebar block 直接复刻样式
- 顶部加 ⌘K 触发 cmdk 命令面板(B11 实装)

**验收**:点击 AI 名字仅跳 `/agent/:id`,不发起任何 channel 创建请求。

### B2. App.tsx 路由重构

**文件**:`web/src/App.tsx` — 抽 view 切换逻辑,新增路由(用最轻量的 hash 路由或现有 view state 扩展):
- `/` → HomeView(Phase C 写)
- `/dashboard` → CompanyOverview(Phase C 写)
- `/c/:channelId` → ChannelView(B3-B10)
- `/agent/:id` → AgentProfile(Phase C 写)
- `/plugins` / `/integrations` / `/settings` → 对应 view
- 删 `MissionWorkspace` / `MissionComposer` / `PendingActionDrawer` / `SafetyDrawer` / `ExecutionCockpit` / `PendingInputModal` / `TemplatePreview` 等 v1~v3 残留 import 与渲染(组件文件下一轮再删,先 unwire)

### B3. ProjectHeaderCard 5 阶段进度

**文件**:`web/src/components/ProjectHeaderCard.tsx`(重写,~180 行)
- 左:编号 + 标题 + ALPHA/BETA chip
- 中:`<PhaseProgress current="build" />`(5 段 pill) + 4 个百分比(build/review/ship/maintenance,从 task 表 SQL count 完成率)
- 右:goal 一句话 + owner Avatar + `<AutonomyRing value={...} size={64} />`
- 数据来源:`GET /api/channels/:id` 已返回 phase / goal / ownerId;补一个 `GET /api/channels/:id/phase-stats` 返回各阶段完成率

**新建组件**:
- `web/src/components/v4/AutonomyRing.tsx`(~60 行 SVG)
- `web/src/components/v4/PhaseProgress.tsx`(~80 行)
- `web/src/components/v4/Sparkline.tsx`(~40 行)

### B4. ChannelView 主壳重写

**文件**:`web/src/components/ChannelView.tsx`(从 778 行精简到 ~400 行)
- 三段布局:顶部 ProjectHeaderCard / 中央时间线(MessageRow 复用)/ 右辅 Dock(B5)
- 删 isDM 全部分支 + peer 资料卡分支
- composer 用现有 `Composer.tsx`(可保留,升级一下视觉)
- 入场动画:整体 `cockpit-in` keyframe

### B5. Dock 容器 + 8 tab 框架

**文件**:`web/src/components/dock/Dock.tsx`(新建,~150 行)
- 用 `@radix-ui/react-tabs` 做 tab 切换
- tab 顺序:**preview**(默认) / editor / inspect / tasks / graph / deliveries / memory / activity
- 桌面右栏 360px;移动端 = `<Dialog>` 全屏抽屉 + 底部 tab bar
- 状态 hook:`useDockTab(channelId)` 记忆当前 tab

### B6. preview tab(场景 α 红线 - 必须真跑)

**文件**:`web/src/components/dock/tabs/PreviewTab.tsx`(新建,~180 行)
- 顶部地址栏 fake URL:`preview.aurora.heliox/<sandbox-id>`
- 右上三个 chip:Desktop(1440)/ Tablet(768)/ Mobile(390),切换改 iframe `width` style
- 刷新按钮(iframe.src = src + `?t=${Date.now()}`)/ 新窗口打开按钮
- 数据来源:`GET /api/sandbox-runs?channelId=:id&latest=1` 拿最新 sandboxRun,iframe `src = /api/sandbox-runs/${id}/preview/index.html`
- 空状态:`未生成预览,在 composer 派工试试`
- **iframe sandbox attr**:`allow-scripts allow-same-origin`(同源能让 inspect tab 注入 eruda)

**后端补一件事**:确认 `/api/sandbox-runs/:id/preview/*` 路由(server/src/index.ts:4946)对 `index.html` 缺省正确处理;沙盒写 HTML 后 `runStatus = 'preview-ready'`,前端 WS 拿到 `sandbox.preview_ready` 事件刷新 iframe。

**验收**:跑场景 α 全流程(见底部),iframe 里**真**渲染 5 个 Button。

### B7. editor tab(沙盒文件改代码)

**文件**:`web/src/components/dock/tabs/EditorTab.tsx`(新建,~200 行)
- 左:`react-arborist` 文件树,数据来自新接口 `GET /api/sandbox-runs/:id/files`(返回 workspace 目录树)
- 右:`@monaco-editor/react`,语言按扩展名推断
- 顶部:`提交评审` 按钮 → `POST /api/sandbox-runs/:id/commit-delivery`(走既有 Delivery 路径)
- 后端补:`GET /api/sandbox-runs/:id/files` + `GET /api/sandbox-runs/:id/file?path=...` + `PUT /api/sandbox-runs/:id/file`

### B8. inspect tab(快路径:eruda 注入)

**文件**:
- `web/src/components/dock/tabs/InspectTab.tsx`(新建,~120 行)
- 沙盒模板(`server/src/sandbox.ts` 写 HTML 的地方)在 `<head>` 注入:`<script src="https://cdn.jsdelivr.net/npm/eruda"></script><script>eruda.init()</script>`(若离线,改用 npm 装 eruda 再静态服务)
- inspect tab 用 `iframe.contentWindow.postMessage` 唤起 eruda console / network panel,或直接在 inspect tab 渲染一个独立 console panel 监听 preview iframe 的 `console` proxy
- **简化方案**(本轮够用):inspect tab 渲染一个按钮"在 preview 里展开调试器",点击后给 preview iframe 发 message 让 eruda 显示

### B9. tasks / deliveries / memory / activity 四 tab

接真实数据,**优先级**:tasks > deliveries > memory > activity。

- `tabs/TasksTab.tsx`:`GET /api/tasks?channelId=:id`,按 status 分三段(today/running/queue),每条带 AutonomyRing
- `tabs/DeliveriesTab.tsx`:`GET /api/deliveries?channelId=:id`,PR 卡片样式,带 accept/reject 按钮(POST `/api/deliveries/:id/accept|reject`)
- `tabs/MemoryTab.tsx`:`GET /api/memory?channelId=:id&levels=L2,L3`,timeline 渲染
- `tabs/ActivityTab.tsx`:`GET /api/run-events?channelId=:id`,用 `@tanstack/react-virtual` 虚拟滚动

### B10. graph tab

**文件**:`web/src/components/dock/tabs/GraphTab.tsx`(新建,~150 行)
- 用 `@xyflow/react`,节点类型:task / agent / delivery / tool / review
- 边:沿用 v2 Edge 表 + 10 verb(若兼容)
- 后端:`GET /api/channels/:id/graph` 返回 nodes + edges

### B11. ⌘K 命令面板 + Toast

**文件**:
- `web/src/components/CommandPalette.tsx`(`cmdk`,~120 行,跳频道 / 跳 Agent / 新建项目)
- `web/src/App.tsx` 顶层挂 `<Toaster />` 来自 sonner

**Phase B 验收(场景 α)**:
1. `pnpm dev` 起 web + server
2. 浏览器开 `/`,Sidebar 看到一个项目(若没有,新建 "pixel-2")
3. 进入项目频道,composer 输入"做一个 Button 组件,有 Primary / Accent / Secondary / Ghost / Destructive 5 个 variant"
4. 系统自动派给软件工程师(因为 J3 自动加入)
5. Progress Card 出现在该频道,phase 进度 pulse
6. 等沙盒写完(WS `sandbox.preview_ready`)
7. preview tab iframe **真**渲染 5 个 Button
8. 切 Tablet → iframe width 变 768
9. Delivery Card 出现,带可点链接
10. DB:`SELECT COUNT(*) FROM Channel WHERE isDM=1` = 0;`SELECT channelId FROM Message WHERE ...` 全在 project channel

---

## Phase C — 周边页 + 收尾(预计 6-8 小时)

**目标**:把截图剩下的视图全部对齐;场景 β / γ / δ PASS;3 构建过。

### C1. HomeView 重写

**文件**:`web/src/components/workspace/HomeView.tsx`(完全重写)
- 顶部 4 KPI 横条(在岗 Agent / 本周交付 / 评审 / 待办)— `GET /api/dashboard/kpi`
- 大问候 28-36px:"想让 AI 团队做点什么?"
- 中部 composer(主输入,提交后跳到对应项目频道或弹"选择项目"对话框)
- "常用工作"模板 4-6 张(数据来源:`GET /api/templates` 已有 templates.ts)
- 右辅栏:今日动态(`/api/audit-events?limit=20`) + Optimizer 建议(若 v3 Optimizer agent 仍在,接 `/api/optimizer/suggestions`)

### C2. CompanyOverview(新建)

**文件**:`web/src/components/CompanyOverview.tsx`(~250 行)
- 6 张部门大卡(按 Channel.goal 关键词或 owner 归类,初版用静态规则)
- 每张:status chip / AutonomyRing 72-96px / Sparkline 7 日 / KPI / 一句话状态
- 后端新增 `GET /api/dashboard/departments` 返回 6 个聚合 entry

### C3. AgentProfile(场景 β 红线)

**文件**:`web/src/components/AgentProfile.tsx`(~280 行)
- 路由 `/agent/:id`,消费 A4 的 API
- 头像 + 名 + preset + L1 摘要
- L2 项目记忆列表(按项目分组,可折叠 `@radix-ui/react-accordion`)
- L3 近期事件 timeline
- 信任分级 3 段条(autonomy / accuracy / fluency)
- 当前 active task / 最近 5 Delivery
- "在 N 个项目里活跃"链接
- **无聊天框**,**无发消息按钮**,只有"去 [项目] @ ta"

**验收**:点 Sidebar 不存在 AI 段;但在公司全景 / 项目频道成员里点 AI 名字,跳 `/agent/:id`,**不发起任何 channel 创建请求**(DevTools network 验证)。

### C4. NewProjectModal 多步

**文件**:`web/src/components/NewProjectModal.tsx`(~250 行)
- `@radix-ui/react-dialog` + `react-hook-form` + `zod`
- Step 1:基础信息(名称 / goal / scope / phase 下拉:5 阶段)
- Step 2:owner 选择(真人列表)
- Step 3:推荐 AI 队员(`GET /api/users?role=assistant`,默认勾选所有 exec-skills 的 ≥1 个)
- 提交 → POST `/api/channels`(创建 + auto add members)

### C5. Plugins + Integrations 页

**文件**:
- `web/src/components/PluginsView.tsx`(~200 行,两 tab,数据先 mock,布局对齐截图 15-16)
- `web/src/components/IntegrationsView.tsx`(~250 行,三 tab MCP / connectors / anywhere,MCP tab 接现有 provider 配置,其余 mock,对齐截图 17-19)

### C6. 删 v1~v3 残留组件

**文件**(本轮直接删,App.tsx 已 unwire):
- `web/src/components/InboxView.tsx`
- `web/src/components/TasksView.tsx`(老版)
- `web/src/components/workspace/MissionWorkspace.tsx`
- `web/src/components/workspace/MissionComposer.tsx`
- `web/src/components/workspace/PendingActionDrawer.tsx`
- `web/src/components/workspace/SafetyDrawer.tsx`
- `web/src/components/workspace/ExecutionCockpit.tsx`
- `web/src/components/workspace/PendingInputModal.tsx`
- `web/src/components/workspace/TemplatePreview.tsx`
- `web/src/components/CreateAssistantModal.tsx`(AI 现在不在 sidebar 创建)
- `web/src/components/Rail.tsx`(被新 Sidebar 替代)

### C7. 移动端适配

**文件**:Sidebar / ChannelView / Dock 的 mobile breakpoint(< 768px)
- Sidebar → 顶部 channel 切换抽屉
- Dock → 全屏抽屉 + 底部 tab bar
- composer 始终 fixed bottom,**不被 dock 挡**(底线)

### C8. 三构建过

```bash
pnpm -C server run build  # tsc
pnpm -C web run build     # tsc -b && vite build
pnpm -C web exec tsc --noEmit
```

任何一项报错直接修。

### C9. 写报告

- `docs/ai/current/V4_BUILD_RESULT.md`
- `docs/ai/current/V4_REVIEW.md`
- `docs/ai/current/V4_LOGIC_VALIDATION.md`(α / β / γ / δ / ε 5 场景日志)
- `docs/ai/current/V4_DELIVERY.md`

---

## 风险与回退

1. **eruda 注入** 若被沙盒 CSP 拦,inspect tab 降级为只读 console 监听(iframe `console.log` proxy)— ~150 行自实现
2. **@xyflow/react** 与既有 dagre 布局冲突 → graph tab 用 ReactFlow + dagre 仅做 layout 计算
3. **沙盒 preview 接通失败** → Phase B 必须先单独跑通 `curl /api/sandbox-runs/:id/preview/index.html` 返回 HTML,**返回不对就先修 server/src/sandbox.ts 再继续 Phase B6**
4. **schema 不动** 是硬约束,但若发现确实缺字段(如 `Channel.phase` 类型),只加不删
5. **isDM 字段保留** 在 schema 里(数据库列不动),只是代码不再读 / 写

---

## 时长合计

- Phase A:4-6h
- Phase B:10-14h
- Phase C:6-8h
- **总计:20-28h**(单 Claude 串行)

---

## 立即可跑的第一步

```bash
# 1. 装基础轮子(A6)
cd /Users/kaiwu/Documents/kyle-agent/helio-clone/web
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip \
  @radix-ui/react-accordion @radix-ui/react-avatar @radix-ui/react-dropdown-menu \
  cmdk sonner framer-motion next-themes \
  class-variance-authority clsx tailwind-merge \
  @monaco-editor/react react-arborist \
  @xyflow/react recharts \
  react-hook-form zod @hookform/resolvers \
  react-dropzone @tanstack/react-virtual

# 2. 抽 token(A5):打开 reference/v4-source/index.html 头部 <style>,整段复制到 web/src/theme.css

# 3. 删 isDM(A1):先在 server/src/index.ts 把 ~20 处改完,跑 pnpm -C server run build 确认没编译错
```
