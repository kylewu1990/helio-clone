# DESIGN_BRIEF — AI Workforce Command Center

> 设计方案 v1.0 | 2026-05-25
> 负责人：3号 UI/UX 产品设计 Agent
> 交付对象：2号实现者 Agent

---

## 1. 产品气质定位

本产品不是聊天工具外壳，也不是后台管理系统。它是一个**AI 创造力实验室的驾驶舱**。

视觉关键词：**calm command center / AI constellation / mission control / digital laboratory**

设计感参照系：
- Apple：克制、精确、留白
- Linear：秩序感、信息密度适中、typeface 主导
- Notion：内容即界面，结构清晰
- Cursor/Warp：开发者工具的质感，略带 terminal 美学

**我们不要做的**：炫技的 3D、过重的卡片阴影、廉价渐变大横幅、Slack 风格的繁杂 Sidebar。

---

## 2. 信息架构（IA）

### 2.1 导航层级

```
Root
├── Command Center（工作台首页，新增）★
├── Chat / Channels（现有，保留）
├── Inbox（现有，保留）
├── Mission Board（任务看板，升级现有 Tasks）
├── Activity Log（新增）
├── Terminal（现有，保留）
└── Context Vault（上下文管理，新增，可作侧边栏面板）
```

### 2.2 Rail 导航图标映射

| 图标 | 视图 key | 说明 |
|------|----------|------|
| LayoutGrid（或 Orbit 自定义） | `workspace` | Command Center 首页 ★ 新增 |
| MessagesSquare | `channel` | 聊天频道（现有） |
| Inbox | `inbox` | 收件箱（现有） |
| Kanban（或 Layers） | `missions` | Mission Board（升级现有 tasks） |
| Activity（或 Zap） | `activity` | 运行日志（新增） |
| SquareTerminal | `terminal` | 终端（现有） |

新增类型：`MainView = 'workspace' | 'channel' | 'inbox' | 'missions' | 'activity' | 'terminal'`

### 2.3 首页（Command Center）内部分区

```
┌────────────────────────────────────────────────────────────┐
│  COMMAND HEADER                                            │
│  项目目标 + 当前 sprint 进度 + 操作入口                      │
├──────────────────┬─────────────────────────────────────────┤
│  AI TEAM ROSTER  │  MISSION BOARD（简化版，3-4列）           │
│  Agent 卡片网格   │  Backlog / In Progress / Review / Done  │
│                  │                                         │
├──────────────────┴────────────────────┬────────────────────┤
│  LIVE ACTIVITY FEED                   │  DELIVERY PANEL    │
│  实时运行日志（最近 N 条）              │  本轮交付摘要       │
└───────────────────────────────────────┴────────────────────┘
```

Context Vault 不占主区域，以右侧抽屉（Drawer）或 Sidebar 面板方式呈现，按需展开。

---

## 3. 首页布局规范

### 3.1 Command Header

位置：顶部全宽横条，高度 72px（desktop），56px（mobile）

内容：
- 左：项目图标（小圆点 + 项目名）+ 目标文本（单行，截断）
- 中：进度胶囊（例：`3 / 7 missions · 2 in review`）
- 右：`+ New Mission` 按钮（主 CTA）+ `Team` 快捷按钮 + 头像组

文案示例（英文，可配中文切换）：
- 主标题：`NEXUS WORKSPACE` 或 `AI WORKFORCE`
- 副标题可显示当前 sprint 目标，格式：`"Build v2 release · Sprint 3"`

样式：`border-bottom: 1px solid var(--border)`，背景 `var(--chrome-frame)`，无额外阴影。

### 3.2 AI Team Roster

位置：左上区域，约 1/3 宽度，独立滚动

布局：纵向列表（非网格），每个 Agent 一行卡片

Agent 卡片信息层级（上到下/左到右）：
1. 头像圆圈（identity color，带状态光环）
2. Agent 名称（粗体，14px）
3. 角色标签（细体，12px，`text-tertiary`）
4. 状态徽章：`Idle / Working / Reviewing / Blocked / Done`
5. 当前任务摘要（单行截断，仅 Working 状态显示，12px）
6. 权限/信任等级（可折叠，不默认展示）

卡片尺寸：宽度填充父容器，高度约 64px（Working 状态展开为 80px）

### 3.3 Mission Board（首页嵌入版）

位置：右上主区域，约 2/3 宽度

布局：4 列横向 Kanban，列宽 `minmax(160px, 1fr)`，overflow-x scroll

列定义：
- `Backlog`（灰色标签）
- `In Progress`（蓝色标签）
- `Review`（琥珀色标签）
- `Delivered`（绿色标签）

Mission Card 信息：
- 标题（14px，粗体）
- 指派 Agent 头像（16px）
- 优先级色点（左侧 3px 竖条）
- 状态徽章
- 预计输出物标签（可选，12px pill）

### 3.4 Live Activity Feed

位置：下方左侧，约 60% 宽度

布局：时间线，新事件从顶部 prepend，最多显示 50 条，virtualized

每条 ActivityItem：
- 左：Agent 头像（20px）+ 连接竖线
- 中：事件描述（14px）+ 时间戳（12px，`text-tertiary`）
- 右（可选）：操作快捷按钮（Review / Approve）

事件类型图标：
- `agent-start` → Zap（蓝）
- `agent-complete` → CheckCircle（绿）
- `file-change` → FilePen（橙）
- `review-request` → Eye（琥珀）
- `human-confirm` → UserCheck（紫）
- `blocked` → AlertCircle（红）

### 3.5 Delivery Panel

位置：下方右侧，约 40% 宽度

布局：单列卡片列表，最新在上，带 `Confirm` / `Request Fix` 操作按钮

每个 DeliveryCard：
- 任务标题 + 完成时间
- 修改文件列表（折叠）
- 测试结果徽章（pass/fail）
- 风险等级标注
- 操作按钮：`Approve & Deliver` / `Request Fix`

按钮视觉：
- Approve：`var(--success)` 背景，白字
- Request Fix：`var(--paper-mid)` 背景，橙字边框

---

## 4. 组件清单

### 4.1 新建组件（文件路径供参考）

```
web/src/components/
├── workspace/
│   ├── WorkspaceView.tsx          ← Command Center 主视图
│   ├── CommandHeader.tsx          ← 顶部项目目标条
│   ├── AgentRoster.tsx            ← AI Team 列表区
│   ├── AgentCard.tsx              ← 单个 Agent 卡片
│   ├── AgentStatusBadge.tsx       ← Idle/Working/... 徽章
│   ├── AgentPulse.tsx             ← 状态光环动画组件
│   ├── MissionBoardEmbed.tsx      ← 首页嵌入版看板（简化）
│   ├── MissionCard.tsx            ← 任务卡片（升级版）
│   ├── ActivityFeed.tsx           ← 实时运行日志
│   ├── ActivityItem.tsx           ← 单条日志项
│   ├── DeliveryPanel.tsx          ← 交付确认区
│   └── DeliveryCard.tsx           ← 单条交付项
├── ContextVaultDrawer.tsx         ← 右侧抽屉：上下文文档
└── MissionsView.tsx               ← 全屏 Mission Board（升级 TasksView）
```

### 4.2 改造现有组件

| 文件 | 改造内容 |
|------|----------|
| `Rail.tsx` | 增加 `workspace` / `missions` / `activity` 导航项；更新 `MainView` 类型 |
| `App.tsx` | 增加 `view === 'workspace'` / `'missions'` / `'activity'` 分支；加载 mock agent/activity/delivery 数据 |
| `TasksView.tsx` | 重命名为 `MissionsView.tsx`；列扩展为 4 列；卡片升级为 `MissionCard` |
| `theme.css` | 新增 agent state token + glassmorphism surface token |

### 4.3 新增 lib 文件

```
web/src/lib/
├── mockData.ts    ← Agent / Activity / Delivery mock 数据
└── types.ts       ← 新增 Agent / Activity / Delivery 类型（追加到现有文件）
```

---

## 5. 视觉规范

### 5.1 色彩系统

**保留现有 token，在 `theme.css` 追加以下内容：**

```css
:root {
  /* Agent 状态色 */
  --agent-idle:      var(--ink-30);
  --agent-working:   var(--success);
  --agent-reviewing: var(--warning);
  --agent-blocked:   var(--destructive);
  --agent-done:      var(--info);

  /* Glassmorphism 表面（light 模式下几乎透明） */
  --glass-surface:   color-mix(in oklch, var(--canvas) 85%, transparent);
  --glass-border:    color-mix(in oklch, var(--ink) 10%, transparent);

  /* Mission 优先级 */
  --priority-urgent: var(--destructive);
  --priority-high:   var(--warning);
  --priority-medium: var(--info);
  --priority-low:    var(--ink-30);
}

:root[data-theme='dark'] {
  /* 深色模式玻璃表面：半透明 + 微弱边框光 */
  --glass-surface:   color-mix(in oklch, var(--canvas) 70%, transparent);
  --glass-border:    color-mix(in oklch, white 12%, transparent);

  /* 深色模式下 working 状态用更亮的绿 */
  --agent-working:   oklch(72% 0.12 152);
}
```

**深色模式扩展背景色策略：**

现有 dark canvas 为 `oklch(18% 0.008 60)`（暖棕调）。
保留此暖调，避免改成冷蓝（已有风格，差异化竞争点）。
深色层次：
- app-bg（最深）：`oklch(13% 0.006 60)` — 已有
- chrome-frame（侧边/Rail）：`oklch(15.5% 0.005 60)` — 已有
- canvas（卡片表面）：`oklch(18% 0.008 60)` — 已有
- glass overlay（弹出/悬浮卡）：`oklch(22% 0.01 60)`

### 5.2 字体层级

| 用途 | 大小 | 字重 | 颜色 token |
|------|------|------|-----------|
| 模块标题（Command Header） | 11px | 600 | `text-tertiary`（全大写 + letter-spacing 0.08em） |
| Agent 名称 | 14px | 600 | `text-primary` |
| Agent 角色 | 12px | 400 | `text-tertiary` |
| Mission 标题 | 14px | 500 | `text-primary` |
| Activity 事件 | 13px | 400 | `text-secondary` |
| 时间戳 / 标签 | 11px | 400 | `text-tertiary` |
| CTA 按钮 | 13px | 500 | 白色 on accent |
| 代码/终端内容 | 12px | 400 | `font-mono` |

字体全部使用已有 Geist / Geist Mono，不引入新字体。

### 5.3 间距

使用 Tailwind 4 默认间距单位（0.25rem/4px 步进），关键间距定义：

| 元素 | 间距 |
|------|------|
| 页面主内边距 | `p-4`（16px） |
| 卡片内边距 | `p-3`（12px） |
| 卡片之间 | `gap-2`（8px） |
| 区块之间 | `gap-4`（16px） |
| Agent 头像与文字 | `gap-2.5`（10px） |
| Section 标题下间距 | `mb-2`（8px） |
| 行高 | 1.5 倍（已有默认） |

### 5.4 卡片风格

**Standard Card（普通信息卡）：**
```css
border: 1px solid var(--border);
background: var(--canvas);
border-radius: var(--radius-lg);  /* 8px */
padding: 12px;
```
无阴影（保持 Linear 风格的极简）。Hover 状态：`background: var(--hover)`，transition 150ms。

**Glass Card（活动中/高亮态）：**
```css
border: 1px solid var(--glass-border);
background: var(--glass-surface);
border-radius: var(--radius-lg);
backdrop-filter: blur(8px);
```
用于 Working 状态 Agent、最新 Delivery 卡、活动 ActivityFeed 最新项。

**Mission Card 优先级竖条：**
```css
border-left: 3px solid var(--priority-{level});
border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
```
左边框颜色编码，无色块背景，干净。

**Agent Working 状态光环（CSS）：**
```css
box-shadow: 0 0 0 2px var(--canvas), 0 0 0 4px var(--agent-working);
animation: agent-pulse 2s ease-in-out infinite;

@keyframes agent-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
```

### 5.5 动效建议

**原则：动效服务于信息，不用于装饰。所有动效应可被 `prefers-reduced-motion` 关闭。**

| 场景 | 动效方式 | 时长 |
|------|----------|------|
| Agent 状态切换 | `background / box-shadow` CSS transition | 300ms ease |
| Activity 新事件插入 | `translateY(-8px) → 0 + opacity 0→1` | 200ms ease-out |
| Mission Card 移列 | `opacity 0→1 + scale 0.96→1` | 150ms ease-out |
| Delivery Panel 展开 | `max-height` + `opacity` 过渡 | 250ms ease-out |
| Rail 活跃指示器 | `background` + `width` transition | 150ms ease |
| Agent Pulse 光环 | keyframe opacity 振荡 | 2s ease-in-out infinite |
| Hover 卡片微浮 | `translateY(-1px)` | 120ms ease |
| Modal/Drawer 进入 | slide-in-from-right (Drawer) / fade+scale (Modal) | 200ms ease-out |

**禁止**：页面加载骨架屏旋转动效超过 1s；滚动联动视差；未经确认的自动轮播。

### 5.6 深色模式设计

项目已有 `data-theme="dark"` 切换机制，深色模式已部分实现。需要补充：

1. **Agent 状态色在深色模式更亮**（见 5.1 deep dark token）
2. **Glass Surface 在深色下边框更可见**（12% white border vs 10% ink）
3. **Activity Feed 背景**：深色下使用 `var(--chrome-frame)` 而非 `var(--canvas)`，增加层次感
4. **Mission Board 列标题颜色**：深色下列颜色标签需适当提亮，避免对比度不足
5. **Command Header**：深色下 `chrome-frame` 背景，无需额外处理

颜色对比度要求：
- 正文（`text-primary` on 背景）：≥ 7:1
- 次级文本（`text-secondary`）：≥ 4.5:1
- 状态徽章文字 on 徽章背景：≥ 3:1

---

## 6. 数据结构定义（供实现者参考）

以下追加到 `web/src/lib/types.ts`：

```typescript
// Agent 角色枚举
export type AgentRole =
  | 'Product Strategist'
  | 'Developer'
  | 'Reviewer'
  | 'Researcher'
  | 'Writer'
  | 'Ops'
  | 'Designer'

// Agent 运行状态
export type AgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked' | 'done'

// AI 团队成员
export interface Agent {
  id: string
  name: string
  role: AgentRole
  status: AgentStatus
  currentTaskId?: string      // 当前任务 ID
  currentTaskTitle?: string   // 当前任务摘要（冗余，用于快速显示）
  avatarColor: number
  trustLevel: 1 | 2 | 3      // 1=观察,2=执行,3=自主
}

// Mission（升级版 Task）
export type MissionStatus = 'backlog' | 'in_progress' | 'review' | 'delivered'
export type MissionPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface Mission {
  id: string
  title: string
  description?: string
  status: MissionStatus
  priority: MissionPriority
  assigneeId?: string
  estimatedOutput?: string    // 预计交付物描述
  createdAt: string
  updatedAt: string
}

// Activity 事件
export type ActivityEventType =
  | 'agent-start'
  | 'agent-complete'
  | 'file-change'
  | 'review-request'
  | 'human-confirm'
  | 'blocked'
  | 'delivery-ready'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  agentId: string
  agentName: string
  description: string
  missionId?: string
  timestamp: string
  requiresHuman?: boolean
}

// 交付物
export interface Delivery {
  id: string
  missionId: string
  missionTitle: string
  summary: string
  changedFiles: string[]
  testResult: 'pass' | 'fail' | 'skipped'
  riskLevel: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'fix-requested'
  createdAt: string
}
```

---

## 7. Mock Data 指引

在 `web/src/lib/mockData.ts` 创建以下 mock 数据，用于驱动首屏（不需要后端即可展示完整 UI）：

```typescript
export const MOCK_AGENTS: Agent[] = [
  { id: 'a1', name: 'Nova', role: 'Developer', status: 'working',
    currentTaskTitle: 'Refactoring auth module', avatarColor: 1, trustLevel: 3 },
  { id: 'a2', name: 'Sage', role: 'Reviewer', status: 'reviewing',
    currentTaskTitle: 'Checking PR #42', avatarColor: 4, trustLevel: 2 },
  { id: 'a3', name: 'Atlas', role: 'Product Strategist', status: 'idle',
    avatarColor: 6, trustLevel: 2 },
  { id: 'a4', name: 'Vera', role: 'Researcher', status: 'done',
    avatarColor: 9, trustLevel: 1 },
]

// Missions, ActivityEvents, Deliveries 同理，各 4-6 条
```

Agent 名字用英文（科技感短名），避免直接用 "Agent 1/2/3" 这种无性格命名。

---

## 8. 给 2号实现者的具体改造建议

### 步骤一：扩展 types + mock data（不改任何 UI）

1. 在 `types.ts` 末尾追加 `Agent / Mission / ActivityEvent / Delivery` 类型定义。
2. 新建 `lib/mockData.ts`，写入示例数据。
3. 验证 TypeScript 无报错：`npm run build`。

### 步骤二：扩展 Rail 导航

1. 在 `Rail.tsx` 中将 `MainView` 类型从 4 项扩展为 6 项。
2. 在图标列表中插入 `LayoutGrid`（workspace）和 `Zap`（activity）两个 NavButton。
3. 调整 Rail 间距：在现有 channel/inbox/tasks 前面插入 workspace 图标，保持 Rail 宽度不变（14 = 56px，够用）。
4. workspace 设为新的**默认 view**（替换现有 `'channel'`）。

### 步骤三：创建 WorkspaceView 骨架

1. 新建 `components/workspace/WorkspaceView.tsx`。
2. 先实现静态布局：3 个区域（AgentRoster / MissionBoard / ActivityFeed + DeliveryPanel）。
3. 使用 mock data 填充，不接任何后端。
4. 在 `App.tsx` 的视图分支中加入 `view === 'workspace'`。

### 步骤四：逐个实现子组件

按以下顺序（降低风险，每步可独立验证）：

```
CommandHeader → AgentCard → AgentRoster →
MissionCard → MissionBoardEmbed →
ActivityItem → ActivityFeed →
DeliveryCard → DeliveryPanel
```

每个组件保持纯展示（props-in），不引入内部状态。

### 步骤五：升级 TasksView → MissionsView

1. 复制 `TasksView.tsx` 为 `MissionsView.tsx`。
2. 扩展列定义（4 列：backlog / in_progress / review / delivered）。
3. 在卡片上增加：优先级色条、assignee Agent 头像、estimated output 标签。
4. 更新 `App.tsx` 中 `view === 'missions'`（可以同时保留 `tasks` 为旧入口，不破坏后端 API）。

### 步骤六：新增 CSS token + 动效

1. 在 `theme.css` 的 `:root` 和 `:root[data-theme='dark']` 块末尾追加 agent state token + glass surface token。
2. 在 `index.css` 末尾添加：
   - `@keyframes agent-pulse`
   - `.agent-pulse-ring` 类
   - `@media (prefers-reduced-motion: reduce)` 动效禁用规则。

### 步骤七：验收 build

```bash
cd web && npm run build
```

确保无 TypeScript 报错、无 Vite 构建错误。

---

## 9. 禁止事项（实现层面）

- 禁止删除现有 `ChannelView` / `InboxView` / `TerminalView` / `TasksView`，只新增不删。
- 禁止改动 `api.ts` 中已有接口（可追加）。
- 禁止引入 CSS-in-JS 库（styled-components、emotion），保持 Tailwind + CSS token。
- 禁止引入 charting/animation 大型库（echarts、framer-motion），动效用原生 CSS。
- 禁止把 mock data 硬写进组件内部，统一从 `lib/mockData.ts` 导入。
- 禁止用行内 style 写死颜色字符串，全部用 `var(--token)` 引用。

---

## 10. 验收标准（视觉层）

1. 打开首页（workspace 视图）：一眼看出这是 AI Team Workspace，不是聊天工具。
2. AI Team Roster：能看到 4+ 个 Agent，状态各不同，Working 状态有视觉区分。
3. Mission Board：4 列可见，有卡片分布，优先级色条清晰。
4. Activity Feed：有时间线流，图标类型各异。
5. Delivery Panel：有待确认交付物，Approve 按钮可见。
6. 深色/浅色模式：切换无破损，token 全覆盖。
7. 现有 Channel / Tasks / Terminal 视图：功能完整无回归。
8. Build 通过，无 TypeScript 错误。

---

# 附录 · 本轮设计约束(Command Center Consolidation)

> 更新日期: 2026-05-25

## A1. 独立审美声明(强约束)

- **不复制 Markus UI**: 不照搬其页面布局、栅格、组件外形。
- **不复制 Markus 文案**: 标题、按钮、空状态文字均自拟中文优先文案。
- **不复制 Markus 品牌**: 不使用其名称、配色、logo、视觉符号。
- **不做 Markus clone**: 仅借鉴产品逻辑(AI Team / 任务拆解 / 并行执行 / 审查交付 / 长期记忆 / 审计轨迹 / 人工确认)。
- **保留本项目已有半成品成果**: 延续既有暖色「纸/墨」OKLCH token、glass 表面、constellation 背景, 不改成冷蓝、不推翻现有组件。

## A2. 气质(延续 v1.0, 进一步收束)

Apple 干净 · Linear 秩序 · Notion 清晰 · Genspark 科技感; 深色优先、克制高级、有呼吸感; 少量 glassmorphism; 轻微 orbit / AI constellation / 神经网络隐喻; 中文友好; 信息层级清晰; 不做普通后台模板。

## A3. 本轮新增结构的视觉规范

### 任务拆解 Task Breakdown(`TaskBreakdown.tsx`)
- 顶部一行「总目标」(取当前进行中真实任务标题, 无则示例), 下方子任务列表。
- 每个子任务: 左侧 Agent 头像(并行轨道色)+ 标题 + 状态徽章(待办/执行中/复核/完成)+ 依赖标记(`依赖 #n`)+ 右侧交付物 pill。
- **并行执行**用「轨道(lane)」语言: 同时处于「执行中」的子任务用并行进度条 + 呼吸光点表达多 Agent 同时推进, 而非单线串行。
- 进度条为纯 CSS, `prefers-reduced-motion` 下静止。

### 质量审查 Quality Review(`QualityReview.tsx`)
- 卡片列表, 每张: 被审对象标题 + reviewer 头像 + verdict 徽章(复核中=琥珀 / 通过=绿 / 需修复=红) + 检查清单(✓/✗ 小项) + 简短 notes。
- 「待复核 / 需修复」用 glass 表面 + 微弱边框光突出, 与「通过」区分。

### 人工确认门 Human Approval(`ApprovalGate.tsx`)
- 紧贴 CommandHeader 下方的横向门控条, 仅当有待确认事项时出现。
- 文案: 「N 项等待你的确认」+ 列出前若干项(交付/审查), 每项内联「确认 / 暂缓」。
- 视觉: accent-soft 底 + 左侧 accent 竖条, 表达「人类是最终关卡」。仅前端状态, 不触发后端。

### 品牌标识(`Rail.tsx`)
- 用 orbit / constellation 隐喻的小标记替换字母 `H`: accent 渐变圆 + 轨道环(lucide `Orbit` 或自绘细环)。
- tooltip 改为独立产品定位(如「AI Workforce · Command Center」), 去掉「Helio 同款 / 内部版」直白表述。
- 不改 Rail 宽度、不改导航项与 `MainView`。

## A4. 色彩 token 追加(只增不替换)

```css
:root {
  /* 并行执行轨道色(借用 identity 调, 克制) */
  --lane-1: var(--info);
  --lane-2: var(--accent);
  --lane-3: var(--agent-reviewing);
  --lane-track: var(--ink-8);

  /* 审查 verdict */
  --verdict-pass:     var(--success);
  --verdict-reviewing:var(--warning);
  --verdict-fix:      var(--destructive);
}
```

深色模式沿用既有 glass/agent token, 无需新增冷色。

## A5. 仍然禁止(实现层面)

延续 v1.0 第 9 节: 不删现有视图; 不改 `api.ts` 既有接口; 不引入 CSS-in-JS / 大型动画或图表库; mock 只放 `lib/mockData.ts`; 不用行内写死颜色字符串, 一律 `var(--token)`。新增: 不改任何 WS/REST payload 形状; 不修改后端源码(除非 build 修复确需且最小化)。

---

# 附录 · 第 3 轮设计约束(真实优先, 诚实空状态)

> 更新日期: 2026-05-25

## B1. 真实优先原则(强约束)

- 工作台所有分区**优先用真实数据**(真实助手 / 真实任务 / 真实任务状态 / 真实仓库文档)。
- **禁止任何 fabricated 数据**: 不造假 Agent / 假 mission / 假 delivery / 假 review / 假测试结果 / 假 demo。
- 无真实数据源的分区, 用**诚实空状态**, 而非假卡片填充。空状态文案要解释「真实数据出现时在此显示」, 不暗示已有不存在的结论。

## B2. 空状态设计规范(本轮重点)

- 视觉: 虚线边框 + 居中说明文字, 与既有 `EmptyHint` 一致, 克制、不喧宾夺主。
- 文案: 中文优先, 说明该区接什么真实数据。例:
  - Quality Review 空: 「暂无待复核项。任务完成后在此等待质量复核;当前未接入自动审查, 不展示任何示例结论。」
  - Delivery 空: 「暂无待确认交付。任务标记完成后, 真实交付物在此等待你确认。」
- 不得用「示例/占位卡」假装有内容。

## B3. 真实数据的视觉表达(不伪造)

- **Task Breakdown**: 总目标取真实频道名 / 真实进行中任务; 子任务为真实任务(真实标题、真实负责人头像、真实状态)。后端无「依赖」「进度百分比」→ **不显示**这两项; `doing` 子任务用**不定态**进度条(只表达「进行中」, 不报具体数值)。
- **Parallel Execution**: 「N 路并行」按真实同时进行(`doing`)的不同负责人数计算; 仅 1 路时不显示徽章(诚实)。
- **Delivery Panel**: 真实 `done` 任务显示真实标题 / 负责人 / 完成时间 / 所属频道; **不显示**伪造的测试结果与风险等级徽章。
- **Human Approval**: 仅当有真实待确认事项(真实 done 任务)时出现门控条; 确认/暂缓为本地 UI 动作, 文案明示不触发后端。

## B4. 不变

延续 A1–A5: 独立审美、不复制 Markus、深色优先、克制科技感、orbit 品牌; mock 集中、组件纯展示、`var(--token)`。
