# V4 Phase H — 视觉硬对齐(狠版,必达截图水准)

## 上一轮成绩单(诚实)

7 个 Phase 跑完,后端 PASS,**视觉不达标**。根因:
- **ChannelView.tsx 778 行没真重写**,Claude 只在 line 446 挂了 ProjectHeaderCardV4,主体 770 行还是 v3 时代结构 → 项目频道一打开就是 v3 样
- **App.tsx 1405 行,仍 import + render 旧组件**(InboxView / MissionWorkspace / ExecutionCockpit 等 12 个)→ 混搭感
- **Phase F.F3「删 v1~v3 残留」 没真做**,commit message 写"留 Phase G 一起清",Phase G 也没清
- 三构建过、curl smoke 过 ≠ 视觉对齐截图

**结论:做了 ≠ 像。本轮要做到「像」。**

---

## 本轮硬约束(违反任何一条 = NEED_FIX 重做)

### 1. 每个改动必有截图证据
完成每一块改动后,**Safari 启动 → 截屏到 `docs/ai/screens/v4-actual/<视图名>.png`**,然后**逐张对照 `docs/ai/reference/v4-opendesign-screens/<同名>.png`**,在 `V4_PHASE_H_REVIEW.md` 写:
```
01-home: 实际 vs 参考 → 差异点:[列 3+ 条具体差异,如「KPI 字号偏小 32px→48px」「右辅栏位置错」等]
   决策:已修 / NEED_FIX(下一轮修)
```
**不允许只写"已对齐"四个字**。必须列出至少 3 个具体差异点(就算最终决定接受现状,也得列出)。

### 2. 必抄的开源轮子(下列任一未装 = NEED_FIX)
| 用途 | 必装 | 不达标判定 |
|---|---|---|
| ⌘K 命令面板 | `cmdk` | 截图右上"搜索 ⌘K"区域空 / 不响应 = 不达标 |
| Toast | `sonner` | 没 Toaster = 不达标 |
| Composer 富文本 | `@tiptap/react` + `@tiptap/extension-mention` | composer 还是 `<textarea>` 裸控件 = 不达标 |
| Editor tab | `@monaco-editor/react` | editor 是空白 / placeholder = 不达标 |
| Inspect tab | `eruda`(本地 vendor 化到 `web/public/eruda.min.js`)| inspect 显示"开新窗口看 devtools" = 不达标 |
| Graph tab | `@xyflow/react` | graph 是空 SVG / 用旧 AlgorithmGraph = 不达标 |
| Sparkline / 部门卡 | `recharts` | 没 sparkline = 不达标 |
| 动效 | `framer-motion` | 入场无动效 / 静态 = 不达标 |
| shadcn 组件库 | `web/src/components/ui/*` 真用 | 新页面还在写裸 `<div>` = 不达标 |

### 3. 不允许「敷衍重构」
- **ChannelView.tsx 必须 ≤450 行**(当前 778)。超过 = NEED_FIX
- **App.tsx 必须 ≤850 行**(当前 1405)。超过 = NEED_FIX
- **v3 组件文件必须真删**(不是 unwire)。`ls web/src/components/InboxView.tsx 2>/dev/null` 必须无输出
- 上述 3 条任一失败 = 整个 Phase H NEED_FIX,**重做**

### 4. 不允许「假 PASS」
- `V4_PHASE_H_REVIEW.md` 末行写 `FINAL_VERDICT: PASS` 必须满足:截图对照 ≥6 张 + 每张至少 3 个差异点已列 + 3 构建过 + 红线场景 α/β 浏览器实测 PASS
- 假 PASS 一旦发现 = 整个会话作废,从 baseline `6c3e834` 推倒重做

---

## 必抄对照清单(截图 → 组件 → 关键视觉细节)

下面 8 张截图是**视觉真值**。每张读完抄到 v4-source/index.html 找对应实现,**布局结构 / 间距 / 字号 / 颜色一律抄**(token 已对齐,这步是结构对齐)。

### 01-home.png(主页)
- **左 sidebar 4 段**:工作台(主页/公司全景/项目列表/归档/引导)/ 项目(频道列表)/ 插件(installed/sources)/ 集成(MCP/connectors/anywhere)
- **顶部 4 KPI 横条**:在岗 Agent / 本周交付 / 评审 / 待办 — **大数字 36-48px,标签 11-12px**
- **大问候句**:28-36px font-bold,"想让 AI 团队做点什么?"
- **中部 composer**:tiptap 富文本,@ 补全,slash 命令
- **常用工作模板网格**:4-6 张卡片
- **右辅栏 280px**:今日动态(事件流)+ Optimizer 建议(紫色 accent)+ 快捷入口

### 02-dashboard.png(公司全景)
- **6 张部门大卡**:产品/品牌/DesignOps/增长/合规/工程
- 每张:**自动度 ring 72-96px** + 7 日 sparkline(recharts)+ status chip + KPI 数字 + 一句话状态
- 卡片间距 24-32px,留白大,**不是密集仪表盘**

### 03-project-pixel2-preview.png(项目频道,核心)
- **顶部项目卡**:`#pixel-2` 编号 + 项目名 + ALPHA chip + **5 段进度条**(discovery/build/review/ship/maintenance,当前段 pulse,已完成段实色)+ 4 个百分比 + 完成 ring + ARIA 头像 + owner
- **中央时间线**:消息 + Progress Card(aurora-bar 流动)+ Delivery Card(surface-glow)+ A2A 评审链
- **右侧 dock**:8 tab,**preview 默认选中,iframe 真显示 Button v2** 的 5 个 variant
- **底部 composer**:tiptap,"执行中... 可输入下一条指令" hint

### 04-09 project-pixel2-*.png(其他 dock tab)
- **tasks**:今日 / 进行中 / 队列 三段
- **graph**:DAG 节点(@xyflow/react)
- **deliveries**:PR-style 卡片 + accept/reject
- **memory**:L2 / L3 时间线,framer-motion 入场
- **activity**:细粒度事件流 + 虚拟滚动
- **editor**:左文件树(react-arborist)+ 右 Monaco
- **inspect**:eruda 注入 preview iframe,显示 console/network/DOM

### 12-agent-aria.png(Agent 资料页,场景 β)
- **无聊天框,无"发消息"按钮**
- 头像 + 名 + L1 摘要 + L2 项目记忆列表(Accordion 折叠)+ L3 timeline + 信任 3 段条 + 当前 task + 最近 5 Delivery

### 15-16 plugins-*.png
- 两 tab,卡片列表(logo / 描述 / version / switch / uninstall)

### 17-19 integrations-*.png
- 三 tab,MCP 真接现有 providers,其余 placeholder

---

## 必看 GitHub repo(对照实现细节,Apache 2.0 / MIT)

**直接 git clone 读源码,抄实现,加 license 头注释**。不允许"重新发明轮子":

| 截图区域 | 必读源码 | 用法 |
|---|---|---|
| sidebar 多段折叠 + ⌘K | `vercel/ai-chatbot` `components/sidebar.tsx` | 抄结构,改 className |
| 部门卡(02-dashboard) | `lobehub/lobe-chat` `features/Settings/Common.tsx` 卡片节奏 | 借鉴留白 + ring 布局 |
| 时间线消息流 + Progress Card | `assistant-ui/assistant-ui` `Thread` 组件 | 抄消息分组 + 头像逻辑 |
| editor + 文件树 | `lobehub/lobe-chat` editor 或 `microsoft/monaco-editor` examples | Monaco 配置参考 |
| graph DAG | `xyflow/xyflow` examples/Overview | 节点 + 边类型抄过来 |
| composer(@ + slash) | `tiptap/tiptap` `demos/src/Examples/CommandsMenu` | 命令菜单实现 |
| Toast | `emilkowalski/sonner` README 直接抄 | 调样式即可 |
| ⌘K | `pacocoursey/cmdk` examples | 抄结构 |

每个文件级抄过来必须加:`// Inspired by <repo> (<license>), see /THIRD_PARTY_LICENSES.md`

---

## 执行顺序(严格按这个跑,不允许跳)

### H1. 推倒 v3 残留(30 分钟)
```bash
rm web/src/components/InboxView.tsx
rm web/src/components/TasksView.tsx
rm web/src/components/TerminalView.tsx
rm web/src/components/Rail.tsx
rm web/src/components/Sidebar.tsx  # 旧版,不是 SidebarV4
rm web/src/components/CreateAssistantModal.tsx
rm web/src/components/workspace/MissionWorkspace.tsx
rm web/src/components/workspace/MissionComposer.tsx
rm web/src/components/workspace/PendingActionDrawer.tsx
rm web/src/components/workspace/SafetyDrawer.tsx
rm web/src/components/workspace/ExecutionCockpit.tsx
rm web/src/components/workspace/PendingInputModal.tsx
rm web/src/components/workspace/TemplatePreview.tsx
```
然后 App.tsx 删对应 import + render + state + handler + WS 分支,确认 tsc 过。

### H2. ChannelView 整页重写(2 小时)
从 778 行精简到 ≤450 行,布局严格对照 `reference/v4-opendesign-screens/03-project-pixel2-preview.png`:
- 顶部 ProjectHeaderCardV4(已有)
- 中央时间线(MessageRow 复用,但容器布局对齐截图)
- 右辅 AssistantWorkspace v4 dock(已有)
- composer 升级用 tiptap(必装)
- cockpit-in 入场动画

### H3. 8 tab dock 真接通(2 小时)
对照截图 04-10:
- preview 跑过红线 α 验证
- editor 真 monaco + 文件树
- inspect 真 eruda 注入
- graph 切 @xyflow/react
- tasks / deliveries / memory / activity 真接 SQL

### H4. HomeViewV4 视觉打磨(1 小时)
对照 01-home.png,字号 / 间距 / 模板网格逐项贴近。Composer 切 tiptap。

### H5. CompanyOverview 视觉打磨(1 小时)
对照 02-dashboard.png,部门卡真 recharts sparkline + AutonomyRing 大号。

### H6. AgentProfileView 视觉打磨(30 分钟)
对照 12-agent-aria.png,Accordion 折叠 + 信任 3 段条。

### H7. 截图对照验收(30 分钟)
启 dev → Safari 逐张截屏存 `docs/ai/screens/v4-actual/`,写 `V4_PHASE_H_REVIEW.md`,**每张列 3+ 差异点**。

### H8. 红线场景实测(30 分钟)
- 场景 α:派工 → preview tab iframe 真渲染 5 个 button(浏览器截图为证)
- 场景 β:点 AI 名字不创建 DM(sqlite + DevTools network 双证)

### H9. 三构建 + push(15 分钟)
```bash
pnpm -C server build
pnpm -C web exec tsc --noEmit
pnpm -C web build
git add -A && git commit -m "Phase H: 视觉硬对齐 + v3 真清理 + 8 tab 真接通" && git push origin main
```

---

## 验收阈值(放宽,但每条都要诚实)

- 截图对照差异条目数 ≥ **总数 × 3**(8 张 × 3 = 24 条具体差异列出)
- **ChannelView.tsx ≤ 450 行**(代码瘦身硬指标)
- **App.tsx ≤ 850 行**(代码瘦身硬指标)
- 12 个 v3 残留文件**真删**(`ls` 验证)
- 8 个必装 npm 全装(`grep package.json` 验证)
- 红线 α / β 浏览器实测 PASS(截图为证)
- 3 构建过

**若某条没达标,REVIEW 末行写 `FINAL_VERDICT: NEED_FIX`,列具体哪条 + 下一轮(Phase I)怎么修**。

诚实标 NEED_FIX 不丢人,**假 PASS 直接作废从 baseline 重做**。

---

## 多轮迭代条款

- Phase H 跑完若仍有 ≥3 张截图差异 >50%(目测大半不像),**自动进 Phase I**:仅对那 3 张视图重做,不动其他
- Phase I 跑完仍不达标,**Phase J**,以此类推
- 直到所有截图差异收敛到 <20%(目测七八成像),才算 v4.1 完成

---

## 立即开跑

```
按 docs/ai/current/V4_PHASE_H.md 严格执行 H1→H9。每完成一段 commit + push origin main。每张截图必须列 3+ 差异点,不允许"已对齐"敷衍。代码瘦身硬指标:ChannelView ≤450 行 / App.tsx ≤850 行 / 12 个 v3 残留文件真删。完成后写 V4_PHASE_H_REVIEW.md,末行诚实 PASS 或 NEED_FIX,假 PASS 作废重做。开始。
```
