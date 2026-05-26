/goal

项目:`/Users/kaiwu/Documents/kyle-agent/helio-clone`。

## 最高硬约束:功能 > UI

**UI 漂亮但功能跑不通 = 直接 NEED_FIX**,这是 v1~v3 反复栽过的坑。本轮第一优先是:

**项目频道页面**(`reference/v4-opendesign-screens/04~10` + 用户最新截图)**必须真能跑闭环**:
- 在 composer 输入"做一个 Button 组件,8px 圆角,有 destructive 变体" → 真的触发 executeTask → 在该项目频道生成 Progress Card → 沙盒里真写代码 → **preview tab 真显示渲染好的 Button**(不是空 iframe)→ 最终 Delivery Card 真有可点链接
- 编辑器 tab 真能打开沙盒文件改代码
- inspect tab 真能看 iframe console / DOM

如果某个功能你**自主代码写不出来,允许去 GitHub 找开源项目当依赖或参考**(详见下方"工程实施推荐"段),不要硬撑写半成品。**用别人轮子完成 80% 比自己手搓 30% 强**。

---

## 当前阶段:v4.1(UI 重塑 + 形态校准 + 功能闭环)

**项目已整体瘦身**:
- 历史 v1~v3 所有 plan / report / review 已清空
- DB 业务数据全清(Channel / Message / Task / Mission / Delivery / Memory / Edge / RunEvent / AuditEvent / Sandbox* / Event 全空)
- 保留:User(12 AI 助手 + 5 真人含 Kyle)+ AppSetting
- 物理沙盒 / 上传截图 / 旧 DB 备份全部删除
- **v1~v3 既有代码不是教条**:跟截图 / doctrine 冲突的删了重写;有用且不冲突的自然继承。**没用的代码留着就是累赘**

**v4 核心校准**(用户决策,不可商量):
1. **频道只有一种:项目频道**。没有讨论、没有 DM、没有 AI 私聊
2. **所有协作只在项目频道发生**。AI 间互动通过在频道 @ 完成
3. **AI 助手是只读资料卡入口**,不能单独跟它发消息
4. 这把 v3 「任务跑到 DM 上下文混乱」等 bug 从源头消除

---

## 必读

1. **本文件** — 任务清单
2. **`docs/ai/HELIOX_V4_DESIGN_DOCTRINE.md`** — v4 唯一设计指导文件(读完再动手)
3. **`docs/ai/reference/v4-opendesign-screens/`** — 10 张桌面 + 4 张移动截图 + 用户直觉笔记 `_notes.md`

---

## v4 参考资料(直接对齐,不要"骨架级抠")

两份参考都是**用户用 AI 工具为 helio-clone v4 量身生成的草稿**,属于本项目自有产物:

1. **`reference/v4-opendesign-screens/`** — 10 桌面 + 4 移动截图 + 用户直觉笔记 `_notes.md`
2. **`reference/v4-source/index.html`** — 完整 vanilla 实现(3872 行 / 159K / 自包含 / 无外部 CDN)

**做法**:
- 截图看**信息架构 / 留白节奏 / 整体观感**
- 源 HTML 看**精确实现**:OKLCH token / 卡片样式 / aurora / glow / glass 层 / 动效 keyframe / 圆角阶梯 / 字号阶梯,**整段抽进 `web/src/theme.css` 和 `web/src/index.css`**
- 直接对齐:色值 / 字号 / 留白 / 卡片骨架 / 动效 / 图标 / 文案口吻 / 状态视觉 / 自动度 ring / 5 阶段进度条 / sparkline,**目标是视觉上尽量贴近截图**
- React 组件结构按 Heliox 既有 web/src/components 路径继续,只是视觉层升级
- token 冲突一律以源 HTML 为准,既有 v1~v3 的旧 token 该删就删

唯一禁止:代码 / 注释里不出现 "Open Design" / "od-" 等生成工具名(避免下个 Claude 误以为外部依赖)。其他命名以截图为准。

**若顺手从 `https://github.com/nexu-io/open-design`(Apache 2.0)仓库借鉴具体模块代码**(比如沙盒预览机制、skill manifest 写法),记得:
- 在 `/THIRD_PARTY_LICENSES.md` 追加条目(已有 Open Design 节,直接加文件位置 + 借鉴深度)
- 文件级大段借鉴的代码顶部加注释:`// Inspired by open-design (Apache 2.0), see /THIRD_PARTY_LICENSES.md`
- 单点借鉴(一个 hook / 一段 CSS / 一个工具函数)不强制加注释,但保险起见可写一行

---

## 评分(UI 35% / 闭环可用 35% / 技术 20% / 原创 10%)

### UI 35%(主维度)
- 按 doctrine 实现 8 个核心视图(主页 / 公司全景 / 项目频道 / 5 个 dock tab / Agent profile / 新建 modal)
- 字号阶梯按 doctrine §5(KPI 大字 / 卡片标题中字 / 二级提示小字)
- 自动度 ring + 5 阶段进度条 + sparkline 三个新组件抽出可复用
- 移动端三个关键 view 不挡 composer

### 闭环可用 35%(并列主维度)
- 项目频道发"构建 X" → 自动派 exec AI → Progress Card → Delivery Card 全部在该频道(v3 J 系列必须真修)
- AI 助手卡点击进入 Agent profile 页,不会触发新建 DM
- 新建项目 modal 多步流程通过
- 公司全景 6 张部门卡数据真实(SQL 聚合,非 mock)
- dock 5 tab 都真实接入数据

### 技术 20%
- isDM 路径删干净(server / web 都不再读这个字段)
- phase enum 在 server 校验
- 3 构建过(server build / web tsc / web build)
- 既有 v1~v3 后端**有用的部分**(Edge / Memory / Optimizer / Algorithm Graph 等)如果能服务于新设计,可以继续用;**没用的就删**

### 原创 10%
- 命名以**截图为准**;现有命名(Project Channel / Progress Card / Delivery Card 等)不冲突时可以继续用,冲突时按截图换
- 视觉与截图贴合度高也算原创(截图本来就是为 helio-clone 量身生成的)

---

## 本机测试

Base URL `http://127.0.0.1:8317/v1`,model `gemini-2.5-flash`,key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。

凭据只写 docs / 测试脚本 / 本地命令,**不进业务代码 / 构建产物 / 分发配置**。

---

## P0(本轮必做)

### A. 后端形态校准

**A1. 删除 DM 路径**
- `POST /api/channels`:拒绝 `isDM=true`(返回 400)
- 删除"打开 AI 助手 → 创建 DM" 的前端 + 后端路径
- 既有 `User.isAssistant=true` 时不再自动创建对应 DM channel
- 既有 `Channel.isDM=true` 的数据(如果重新出现)迁移到 archived

**A2. phase enum 校验**
- 项目频道创建 / 更新时,phase 必须是 `discovery | build | review | ship | maintenance` 之一
- API 不在枚举内则 400

**A3. AI 助手 Agent profile API**
- `GET /api/agents/:id` 返回:
  - 角色身份(name / preset / systemPrompt 摘要)
  - L1 角色摘要 / L2 各项目记忆列表 / L3 各项目最近记忆
  - 信任分级
  - 当前 active task(across all projects)
  - 最近 N 个 Delivery
  - "在哪些项目里活跃"(基于 ChannelMember + 近 7 日活动)
- 前端 Agent profile 页消费这个 API

**A4. v3 J 系列闭环修复**
- J1 executeTask `channelId = task.channelId` 硬约束(忽略 opts.channelId)
- J3 项目频道创建时自动加入 ≥1 个 exec-skills AI(没指定时自动加"软件工程师")
- J4 无 executor 时硬 cede(所有职能型 AI 写入 cededBy,不再 generateReply 文字)
- J5 create_task 后立即触发 executeTask
- J2 不需要了(没 DM 了)

### B. 前端 UI 重塑

**B1. Sidebar 重构(二段)**
- `Sidebar.tsx`:删除"讨论"段、"私信"段、"AI 助手"段
- 新结构:
  ```
  [工作台]
    · 主页 / 公司全景 / 项目列表 / 归档 / 引导 / roadmap
  [项目]
    · #project1 / #project2 / ...
  ```
- 宽度 240px

**B2. 主页(HomeView)重写**
- 大问候句(28-36px font-bold):"想让 AI 团队做点什么?" + 中间 composer 主输入框
- 顶部 4 KPI 数字横条(在岗 Agent / 本周交付 / 评审 / 待办)
- 中部"常用工作"模板网格(4-6 张,可点击带 prompt 跳转)
- 右辅栏:今日动态(事件流)+ Optimizer 建议 + 快捷入口

**B3. 公司全景页(CompanyOverview)**
- 6 张部门大卡(部门 = 项目按业务归类,初版可以用 Channel.goal 关键词自动归类,或者 owner 简单分组)
- 每张:status chip / 自动度 ring 大号 / 7 日 sparkline / KPI 数字 / 一句话状态
- 顶部 4 KPI 横条
- 卡片可点击进入对应部门子图(可选,初版直接列项目即可)

**B4. 项目频道(ChannelView)重写顶部项目卡**
- 现有 ProjectHeaderCard 升级:
  - 编号 + 项目标题 + 阶段 chip(ALPHA/BETA 等可选)
  - **5 段进度条**(discovery/build/review/ship/maintenance,当前高亮)
  - 4 个百分比(基于 task 完成率分阶段统计)
  - 目标一句话
  - owner 头像
  - 自动度 ring(项目级 = 该频道所有 task autonomy 平均)

**B5. Dock 8 tab 真实接入(v4.1 扩展)**

「成品三件套」(看 / 改 / 调试)— **核心功能,必须真接通,不允许空 iframe**:

- **preview**(默认选中):
  - iframe `src` 指向 helio-clone 已有 `/api/sandbox-runs/:runId/preview/index.html` 路由(v2 已实现,确认 v4 继续用)
  - 顶部地址栏显示 `preview.aurora.heliox/...` 风格虚拟 URL(实际是后端 mount 的沙盒静态服务)
  - 右上三个 chip:`Desktop / Tablet / Mobile`,切换时改 iframe `width`(1440 / 768 / 390)
  - 刷新按钮 + 新窗口打开按钮
  - 沙盒还没产物时显示空状态"还没生成预览,在下面 composer 派工试试"
- **editor**:
  - 左侧文件树(读沙盒 workspace 目录),右侧 Monaco 编辑器
  - 改完点"提交评审" → 走既有 Delivery 路径(v1 留存)
  - **如果自主实现 Monaco 集成困难**,用 `@monaco-editor/react`(MIT,见下方推荐)
- **inspect**:
  - 对 preview iframe 的 console messages / network requests / DOM 节点查看
  - **如果自主实现复杂**,把 `eruda`(MIT,移动 web 调试库)注入到 preview iframe 内即可拿到 console + network + elements,作为 inspect tab 的内容源

「过程五件套」(规划 / 关系 / 产出 / 记忆 / 事件流):
- tasks:从 Task 表读本频道,title / 自动度 ring / assignee / status chip
- graph:DAG 渲染(若 v2 既有 AlgorithmGraph 视觉与截图一致就用,不一致按截图重画)
- deliveries:从 Delivery 表读本频道,PR-style 列表 + 验证徽章 + accept/reject
- memory:从 Memory 表读本频道 L2 + L3 timeline
- activity:从 RunEvent / AuditEvent 读细粒度事件

dock 顶部 tab 按上述顺序排列,**preview 默认选中**(打开项目第一眼看到产物,不是任务列表)。移动端 dock = 全屏抽屉 + 底部 tab bar。

**B6. Agent Profile 页(新建)**
- 路由 `/agent/:id`
- 内容:
  - 头像 + 名 + 角色描述(preset)+ systemPrompt 摘要(L1)
  - L2 项目记忆列表(按项目分组)
  - L3 近期事件(滚动)
  - 信任分级 3 段条
  - 当前 active task
  - 最近 5 个 Delivery(跨所有项目)
  - "在 N 个项目里活跃"链接(跳到对应频道)
- **没有聊天框**,**没有"给 ta 发消息"按钮**
- 唯一互动:"去 [项目] @ ta" 链接

**B7. 新建项目 modal**
- 多步:
  - Step 1:基础信息(名称 / goal / scope / 初始 phase)
  - Step 2:owner 选择
  - Step 3:推荐 AI 队员(默认勾选有 exec skills 的至少 1 个)
- 提交 → 创建 Channel + 自动加入 ChannelMember(owner + 选中的 AI)

**B8. 三个新组件抽出**
- `<AutonomyRing value={0..100} size={64} />`(SVG circle stroke-dasharray + 颜色梯度)
- `<PhaseProgress current="build" />`(5 段 pill,自动高亮 + 已完成阶段实色)
- `<Sparkline data={[1,3,2,5,8,7,9]} />`(mini SVG path,描边 accent)

**B9. Plugins 页(全局菜单,v4.1 新增)**
- 路由 `/plugins`,两 tab:`installed`(已装)/ `sources`(订阅源)
- installed:卡片列表,每张:logo / 名称 / 描述 / version / 启用开关 / 卸载按钮
- sources:订阅源列表(URL / 状态 / 上次刷新 / 移除)
- 参考截图 `15-plugins-installed.png` `16-plugins-sources.png`
- 数据先用 mock(plugin 系统设计留 v5),布局先到位

**B10. Integrations 页(全局菜单,v4.1 新增)**
- 路由 `/integrations`,三 tab:`MCP` / `connectors` / `anywhere`
- MCP:已配置的 MCP server 列表(name / endpoint / 状态 / 测试连接)
- connectors:第三方平台连接器(GitHub / Notion / Linear 等 placeholder)
- anywhere:Anywhere mode(Heliox 桌面端浮窗 / 全局快捷键 placeholder)
- 参考截图 `17-integrations-mcp.png` `18-integrations-connectors.png` `19-integrations-anywhere.png`
- 数据先用 mock + 现有 `provider config` 真实接入(MCP tab 可读 helio-clone 既有 provider 配置)

---

## 工程实施推荐:按截图功能 ↔ 开源对照表

**核心精神**:**用开源轮子完整复刻 + 跑通截图功能**是本轮使命。所有列出的项目都是宽松协议(MIT / Apache 2.0 / BSD),可以直接 `npm install`,也可以读源码学实现。不要为"原创"硬写。

### 全局
| 功能 | 推荐 | License | URL |
|---|---|---|---|
| ⌘K 命令面板 | `cmdk` | MIT | github.com/pacocoursey/cmdk |
| Toast 通知 | `sonner` | MIT | github.com/emilkowalski/sonner |
| 主题切换 | `next-themes` | MIT | github.com/pacocoursey/next-themes |
| 头像 / Tooltip / Dialog / Tabs | `@radix-ui/react-*` | MIT | github.com/radix-ui/primitives |
| **完整 UI 体系** | `shadcn/ui` | MIT-style | github.com/shadcn-ui/ui — copy-paste 模式,Radix + Tailwind,与 helio-clone 技术栈一致,**强烈推荐当组件基底** |

### 项目卡(顶部 5 阶段进度 + 4 KPI)
| 功能 | 推荐 | License |
|---|---|---|
| 自动度环 | 自写 SVG circle stroke-dasharray | — |
| Sparkline | `recharts` 或 `visx` | MIT |
| 5 阶段进度条 | 自写 5 pill | — |

### 中央时间线
| 功能 | 推荐 | License | URL |
|---|---|---|---|
| Markdown 渲染 | `react-markdown`(已在用) | MIT | — |
| 代码高亮 | `react-syntax-highlighter` | MIT | — |
| 入场动效 | `framer-motion` | MIT | github.com/framer/motion |
| **整套 AI chat UI** | `assistant-ui` | MIT | github.com/assistant-ui/assistant-ui |

### 底部 Composer
| 功能 | 推荐 | License | URL |
|---|---|---|---|
| 富文本 + @ 自动补全 + slash | `tiptap` 或 `lexical` | MIT | github.com/ueberdosis/tiptap |
| 文件附件 | `react-dropzone` | MIT | github.com/react-dropzone/react-dropzone |
| 麦克风 | `react-speech-recognition` | MIT | — |

### Dock 8 Tab

**preview**:浏览器原生 `<iframe sandbox>` + 复用 v2 `/api/sandbox-runs/:id/preview/*` 路由。自写设备宽度切换,30 行。

**editor**:
- 主推 `@monaco-editor/react`(MIT,github.com/suren-atoyan/monaco-react)
- 轻量替代 `@uiw/react-codemirror`(MIT)
- 文件树 `react-arborist`(MIT)

**inspect**:
- 快路径:`eruda`(MIT,github.com/liriliri/eruda)注入 preview iframe
- 移动端替代:`vConsole`(MIT,github.com/Tencent/vConsole)
- 自实现:iframe contentWindow 监听 console + network,~200 行

**tasks**:`dnd-kit`(MIT)拖拽 + 自写卡片

**graph**:
- `@xyflow/react`(MIT,github.com/xyflow/xyflow)节点编辑器
- `@dagrejs/dagre`(MIT,已在用)布局
- 替代:`d3-graphviz`(BSD)

**deliveries**:`react-diff-viewer-continued`(MIT)+ 自写卡片

**memory**:`framer-motion` 时间线 + `@radix-ui/react-accordion`(MIT)折叠

**activity**:`@xterm/xterm`(MIT,已在用)+ `@tanstack/react-virtual`(MIT)长列表虚拟滚动

### 公司全景
| 功能 | 推荐 |
|---|---|
| 网格布局 | Tailwind grid |
| Sparkline / Ring | `recharts` / `visx`(MIT) |

### 新建项目 modal
| 功能 | 推荐 | License |
|---|---|---|
| 表单状态 | `react-hook-form` + `zod` | MIT |
| 多步向导 | 自写 step state | — |

### 类似产品的开源参考(读源码 / 借鉴架构)
| 项目 | License | URL | 价值 |
|---|---|---|---|
| `vercel/ai-chatbot` | Apache 2.0 | github.com/vercel/ai-chatbot | chat + tool calls + artifact preview |
| `langgenius/dify` | Apache 2.0 | github.com/langgenius/dify | AI agent workspace + project 概念 |
| `lobehub/lobe-chat` | Apache 2.0 | github.com/lobehub/lobe-chat | 完整 AI 工作台,UI 精致,可借鉴布局 |
| `assistant-ui/assistant-ui` | MIT | github.com/assistant-ui/assistant-ui | 专门的 React AI chat UI 库 |

### 用法规范

1. **npm install**(首选)→ 写进 `package.json` → 在 `/THIRD_PARTY_LICENSES.md` 追加一行
2. **shadcn 风格 copy-paste**(整段抄进 web/src/components/ui/)→ 文件顶部加 `// Inspired by <project> (<license>), see /THIRD_PARTY_LICENSES.md`
3. **读 README 学思路 / 自己重写**→ 免归属
4. **遇到表里没有的功能**:`gh search repos "<feature> react"`,挑 MIT / Apache 2.0 / BSD 的,加进 THIRD_PARTY_LICENSES

不要犹豫,不要硬写 Monaco / cmdk / sonner / radix 这种成熟轮子。时间留给业务闭环。

---

## 反复验证逻辑(本轮 5 场景)

### 场景 α:项目频道直派 + preview 真显示(v3 痛点 + v4.1 核心)
新建项目频道(自动加软件工程师 AI)→ 在 composer 输入 "做一个 Button 组件,有 Primary / Accent / Secondary / Ghost / Destructive 5 个 variant"→ 系统自动派给软件工程师 → Progress Card 在该项目频道 → 沙盒真写出 HTML+CSS → **preview tab 的 iframe 真显示 5 个 button 渲染**(不是空白)→ 切 Tablet/Mobile 真换宽度 → Delivery Card 出现,带可点链接

checklist:
- [ ] 没创建任何 DM channel
- [ ] briefMsg.channelId === project channel id
- [ ] Progress 和 Delivery 都在 project channel
- [ ] AuditEvent 含 `a2a.auto_assigned`
- [ ] **preview tab iframe 真显示沙盒产物**(用 curl 验证 `/api/sandbox-runs/:id/preview/index.html` 返回 HTML)
- [ ] **Desktop/Tablet/Mobile 切换真改 iframe width**(DevTools 看 dom)

### 场景 β:AI 助手只读
点击 sidebar / 公司全景里的某个 AI 名字 → 跳 Agent profile 页 → **不创建 DM channel** → 看到 L1 / L2 / L3 / 信任 / 当前任务

checklist:
- [ ] sqlite count Channel where isDM=true 始终 = 0
- [ ] Agent profile 页无聊天框
- [ ] "去 [项目] @ ta"链接跳转正确

### 场景 γ:5 阶段进度可视化
项目频道顶部:
- 当 phase=discovery → 第 1 段高亮 pulse
- 切到 phase=build → 第 1 段实色完成,第 2 段高亮 pulse
- 一直到 phase=maintenance → 前 4 段全实色,第 5 段高亮 pulse

checklist:
- [ ] 5 段 pill 视觉清晰
- [ ] 当前阶段有 pulse(agent-pulse-ring 复用)
- [ ] phase 切换 API 真实更新 DB + WS 广播

### 场景 δ:公司全景部门卡
打开公司全景 → 6 张部门卡渲染 → 每张数字真实(从 SQL 聚合 task / delivery / memory)
- [ ] 不挤不溢出
- [ ] 自动度 ring 视觉清晰
- [ ] 7 日 sparkline 真实数据

### 场景 ε:既有功能能保留则保留(不强制)
- 如果 Optimizer / Memory / Algorithm Graph / aurora / glow 等既有能力与新设计**兼容**,继续工作即可
- 不兼容的删了重写,**不是回归测试**
- 这一项不是 PASS 红线,只是参考

---

## 允许推翻

- 既有 ChannelView / Sidebar / HomeView 等组件,**整页删了重写**没问题
- `isDM` 字段及所有读写路径删除,数据迁移不丢
- Mission Control 删除(被公司全景替代)
- ApprovalGate / DeliveryPanel / MissionBoard 等 v1 残留组件删除
- 改动写进 REVIEW

---

## 阈值

- 总分 ≥90,UI ≥88,可用 ≥88,技术 ≥85
- **场景 α 必须 PASS**(v3 痛点修复 + v4.1 preview 真接通)— **闭环不通即 NEED_FIX,UI 多漂亮都没用**
- **场景 β 必须 PASS**(v4 形态成立的标志:点 AI 名字不创建 DM)
- 末行 `FINAL_VERDICT: PASS` 或 `NEED_FIX`

---

## 底线(只有一条)

- 真实模型 / 工具 / sandbox / DB,不造假

其他都不是"必须保留"。v1~v3 的代码 / token / 命名,跟截图和 doctrine 冲突的**直接删,不要犹豫**。过去做过的东西不是新方向的束缚。

---

## 产物文件命名

`V4_*` 前缀:
- `current/V4_PLAN.md` — 实施计划
- `current/V4_BUILD_RESULT.md` — 构建结果
- `current/V4_REVIEW.md` — 自评
- `current/V4_LOGIC_VALIDATION.md` — 5 场景日志
- `current/V4_DELIVERY.md` — 交付摘要

---

## 最终回复格式

一句话结论 → P0 A 系列完成情况 → P0 B 系列完成情况 → 5 场景验证日志 → 构建结果 → 推翻清单 → 仍未做项 → **人工验收路径**(必含:点 AI 名字不创建 DM、项目频道发"构建 X" 真开工)。
