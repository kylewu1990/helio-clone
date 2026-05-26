# V4 Phase I — 两张截图 1:1 复刻(主页 + 项目频道)

## 最高优先级:这两张截图是黄金真值

用户校准:**先对齐这两张,每一个 UI 元素必须做出来**,不是大致像就行。

**截图 1(主页)**:`docs/ai/reference/v4-opendesign-screens/01-home.png`
**截图 2(项目频道 preview)**:`docs/ai/reference/v4-opendesign-screens/03-project-pixel2-preview.png`

下面是**逐元素 checklist**,每一条都必须打 ✅ 才算完成 Phase I。不达标的列在 `V4_PHASE_I_REVIEW.md` 里标 NEED_FIX 转 Phase J。

---

## 截图 1 主页逐元素清单

### A. Sidebar(左 240px)

- [ ] **A1** 顶部 logo:`heliox` 文字 + 圆球小标
- [ ] **A2** "工作台"段标(灰小字):
  - [ ] 主页(房子图标,右对齐 `⌘1`)
  - [ ] 公司全景(网格图标,右对齐 `⌘2`)
- [ ] **A3** "项目"段标 + 右侧 `+` 按钮:
  - [ ] `# pixel-2`(绿点 active 状态指示)
  - [ ] `# invoice-flow`(绿点)
  - [ ] `# q3-positioning`(右侧角标 `1`)
  - [ ] `# incident-2026-05-20`(右侧灰横线 `—`)
- [ ] **A4** "讨论"段标:
  - [ ] `# strategy-q3`(右侧角标 `12`)
  - [ ] `# random`(灰横线 `—`)
  - [ ] `# all-hands`(角标 `3`)
- [ ] **A5** "私信"段标:每条是「彩色身份头像点 + 名字 · 角色 + 状态」
  - [ ] Aria · 设计(橙色 + 绿在线点)
  - [ ] Cypher · 工程(青色 + 角标 `2`)
  - [ ] Foster · 产品(紫色 + 横线 `—`)
  - [ ] Marlow · 研究(黄色 + 横线 `—`)
- [ ] **A6** "归档"段标(小圆点 `·` 列表样式):
  - [ ] onboarding-v1(右侧 `closed` 灰 chip)
  - [ ] q2-roadmap(`closed`)
- [ ] **A7** "扩展"段标:
  - [ ] 插件(右侧角标 `7`)
  - [ ] 集成(右侧角标 `5`)
- [ ] **A8** 底部"设置"(月亮图标 + 设置二字)

### B. 顶部条(全宽)

- [ ] **B1** 中部 chip:`▾ Aurora Labs / 主页`(项目空间切换器)
- [ ] **B2** 右上:`🔍 搜索 ⌘K`(灰底圆角)+ `+ 新建项目`(橙底白字按钮)+ 主题切换图标 + 头像 `K`(深色圆 + 字母)

### C. 主区大问候卡

- [ ] **C1** 左上:小绿点状态 + `下午好 · KYLE · AURORA LABS`(灰小字)
- [ ] **C2** 大标题 28-36px font-bold:`想让 AI 团队做点什么?`
- [ ] **C3** 副文 13-14px 灰:`5 月 26 日 · 13 个 Agent 在岗,6 件交付待你审,2 处被卡。直接打字,或挑下面的常用工作。`
- [ ] **C4** Composer(占主卡 70% 宽,大圆角 + 深灰背景 + 大留白):
  - [ ] placeholder:`例如:把 pixel-2 的进度做一份本周 PPT,讲给投资人听 — 30 分钟内要`
  - [ ] **必装并接通 @tiptap/react + Mention + slash**:`@` 弹 member 菜单、`/` 弹命令菜单
- [ ] **C5** Composer 底部行:
  - [ ] 左:小圆点 + `派给 Aurora Labs` 灰 pill
  - [ ] 右:`⇄ 派工` 灰提示 + `· ⏎ 换行` 灰 + **`派工 →`** 橙色按钮(右箭头图标)
- [ ] **C6** 4 KPI(主卡内底部,横向 4 列,字号要大 ≥ 48px tabular-nums):
  - [ ] **在岗 AGENT** · `13` + 绿色 `+2`
  - [ ] **本周交付** · `27` + 绿色 `+18%`
  - [ ] **待审** · `6` + 红色 `-2`(注意:红字)
  - [ ] **被卡** · `2` + 灰色 `同上周`

### D. 常用工作模板网格(主区中部)

- [ ] **D1** 标题行:`常用工作` 大字 + `12 项` 灰 + 右侧 `公司全景 →` 链接
- [ ] **D2** 卡片网格(4 列,每张高度一致,12-16px 间距):
  - [ ] **制作 PPT / 演示稿**:显示器图标 + 副文 `把要点和素材丢进来,出一份带可点动效的 keynote。` + 底部「头像叠 AR FO + 协作 + 约 35 分钟」
  - [ ] **写工作汇报 / 周报**:文档图标 + `从最近交付 + 指标自动起草,口径按上次汇报。` + `FO MA + 协作 + 约 8 分钟`
  - [ ] **数据分析报告**:柱状图标 + `指标问句 → SQL / DuckDB → 图表 + 论证。` + `MA AT + 协作 + 约 20 分钟`
  - [ ] **文档 / SOP**:文件图标 + `把分散在频道里的决定整理成可对外的一份文档。` + `FO LE + 协作 + 约 12 分钟`
  - [ ] **设计稿 / 海报**:图像图标 + `给 Aria 一个 brief,出 3 个方向的视觉草图。` + `AR IK + 协作 + 约 18 分钟`
  - [ ] **客户邮件 / 回复**:邮件图标 + `把客户原话粘进来,按品牌口径出回复草稿。` + `LE MS + 协作 + 约 5 分钟`
  - [ ] 底部第二行 2 张占位(从截图看图标:加人 / 列表 / 文档 / 搜索),内容自行补 4 张达到「12 项」
- [ ] **D3** 数据来源:`web/src/lib/templates.ts` 真存,不是组件 inline mock

### E. 右辅栏(280px,固定右侧)

- [ ] **E1** "今日动态 · 实时"标题(灰小字)
- [ ] **E2** 6 条事件流(图标 + 一句话 + 时间右对齐),从 DB 拉真实 AuditEvent:
  - [ ] 紫色 Optimizer 图标 ✨:`Optimizer 提议:营销部本周 42h,瓶颈在文案审查 — 要不要交给 AI 审? #optimize · 14:22`
  - [ ] 绿色 ✓:`Aria 完成了 pixel-2 的 token 迁移 PR · 已浏览器验证 · 13:48`
  - [ ] 橙色 !:`incident-2026-05-20 卡在等你拍板 — Atlas 给了两种修方案 · 12:10`
  - [ ] 绿色 ✓:`Lex 通过了 q3-positioning 的对外一句话第二稿 · 11:30`
  - [ ] 绿色 ✓:`Mast 跑完了上周开票流水,差异项 0 件 · 10:02`
  - [ ] 紫色 Optimizer:`Optimizer 自动归档了 7 条无人响应的私信 · 09:14`
- [ ] **E3** "Optimizer 建议"卡(紫色 accent 区,跟其他不同):
  - [ ] 标题"Optimizer 建议"+ 右上`紫色频道`紫色小链接
  - [ ] 紫色虚线/淡紫底容器:
    - [ ] 紫色 chip `优化机会`
    - [ ] 主标:`营销部本周 42h,瓶颈在文案审查 — 要不要把审查交给 AI?`
    - [ ] 灰副文:`最近 6 周文案审查均由你亲自处理,平均每条 18 分钟;Lex 在 q3-positioning 上的审查通过率 97%。`
    - [ ] 按钮组:`查看证据`(紫色 filled 小按钮)+ `下次再看`(灰 ghost)
- [ ] **E4** "快捷入口"小标题
  - [ ] `网格图标` 公司全景 · `6 个部门 / 13 个 Agent` →
  - [ ] `+` 新建项目 · 起一个新频道 `⌘N`
  - [ ] `齿轮图标` 设置 · `provider / 模型 / 沙盒` →

---

## 截图 2 项目频道 #pixel-2 逐元素清单

### F. 顶部 Header
- [ ] **F1** 顶部 chip:`▾ Aurora Labs / #pixel-2`(替换 `/ 主页`)
- [ ] **F2** 右上工具栏同主页(搜索 ⌘K / 新建项目 / 主题 / 头像)

### G. 项目卡(占主区上方,超大)

- [ ] **G1** 左上行:`#pixel-2` 灰小编号 + `Pixel 2.0 — 设计系统迁移` 大白字标题 + `ARIA 主理` 橙色 outlined chip
- [ ] **G2** 5 段进度卡(横排 5 段 pill,等宽):
  - [ ] `● DISCOVERY 100%`(实色,绿点,完整进度条)
  - [ ] `● BUILD 64%`(橙色 active + 脉冲 + 部分进度条)← **当前阶段**
  - [ ] `● REVIEW 12%`(部分,微进度条)
  - [ ] `● SHIP 0%`(虚线灰边)
  - [ ] `● MAINTENANCE 0%`(虚线灰边)
- [ ] **G3** 右上:**4 个头像叠** `AR / CY / IK / LE`(团队成员)
- [ ] **G4** 右上大 ring:绿色环 + 中间 `完成 14/22`
- [ ] **G5** 项目卡底部一句话:`把 Aurora 产品的组件库从 Figma 单源迁到 tokens.json + TypeScript 双源,目标本月内全量收口。`

### H. 中央时间线

- [ ] **H1** 日期分割:居中 `今天 · 5 月 26 日`(两侧细线)
- [ ] **H2** Kyle 消息行:
  - [ ] 头像左 `K` + 名字 `Kyle` + 角色 chip `老板` + 时间 `09:42`
  - [ ] 消息正文(`@aria` 高亮显示):`把 button 的所有圆角统一到 8px,所有 size 变体都跟齐;同时把 destructive 的色阶往左挪一档,现在太"喊"了。@aria 接一下。`
- [ ] **H3** Aria 消息行:
  - [ ] 橙头像 `AR` + `Aria` + `设计师 AI` chip + 时间 `09:43`
  - [ ] 消息:`收到。我把这条拆成 4 个子任务,先动 button、再动 input、IconButton、SegmentedControl。预计 25 分钟一组。`
- [ ] **H4** **Progress Card(关键,内嵌在 Aria 消息下方)**:
  - [ ] 顶部:🕐 `进度推进 · Build 阶段`(灰圆角 chip)+ 右侧 `已派 @cypher`
  - [ ] 两列布局:
    - 左列:`本阶段任务` 灰 + `14 / 22` 大数字 + 进度条 64%
    - 右列:`TOKEN 改动` 灰 + `+38 / -12` 数字 + 进度条
  - [ ] 左侧文字段:`较 9:00 推进 3 个 · button 子树 11/14 已合,剩 IconButton hover、focus-visible、disabled。`
  - [ ] 右侧文字段:`radius / color / spacing 三组生成完成。Marketing 口径已 ping @lex 等回。`

### I. 底部 Composer

- [ ] **I1** 大圆角输入框(深背景 + **橙色光晕/glow**,聚焦感)
- [ ] **I2** placeholder:`执行中...可输入下一条指令,会按顺序排队执行`(注意:执行中状态)
- [ ] **I3** 底部图标行:
  - [ ] 左:`@` `📎 附件` `🎤 麦克风` 三个图标
  - [ ] 右:`⌘ ⏎ 派工` 灰小字 + `⏸ 停止`(灰底,有 ⏸ 图标,表示当前可停)

### J. 右辅 Dock(同时显示 8 tab + 设备切换)

- [ ] **J1** Tab 行(顶部):`预览(active 橙下划线)/ 任务 22 / 图 / 交付 5 / 记忆 14 / 活动 / 编辑 / Inspect`
- [ ] **J2** 右上设备切换:`🖥 Desktop(active 边框)/ ◻ Tablet / 📱 Mobile`
- [ ] **J3** Preview 主体(**模拟 macOS 窗口**):
  - [ ] 顶部 traffic light:三色小圆点(红黄绿)
  - [ ] 假地址栏(灰底):`preview.aurora.heliox/ui/button?ref=PR%23847`
  - [ ] 右上 `↻ 刷新` + `↗ 新窗口` 两个图标
  - [ ] iframe 渲染区:
    - [ ] 标题大字:`Button · v2`
    - [ ] 副文小灰:`由 Cypher 于 10:08 提交 PR #847 · 圆角统一 8px · destructive 色阶 ↓ 6%`
    - [ ] **VARIANTS** 区:小标题灰 + 横排 5 个 button:
      - Primary(白底深字)
      - **Accent(橙底白字,active)**
      - Secondary(深底)
      - Ghost(透明边框)
      - Destructive(红字)
    - [ ] **SIZES** 区:`小 / 中 / 大` 三个白底按钮
    - [ ] **STATES** 区:`默认 / 禁用(灰)/ ⟳ 加载中 / Focus(双层边框 active)`
    - [ ] **ICONBUTTON (SUBSET)** 区:3 个图标按钮 `☀ 太阳 / 复制 / 🔍 搜索`

---

## 顺手做的(NEED_FIX 跟截图清单已经重合)

### K. 借鉴 Open Design 基础设施(完整 7 项,分优先级)

**协议**:Open Design 是 Apache 2.0,允许借鉴/抄源码。**文件级大段抄必须加** `// Inspired by open-design (Apache 2.0)` **注释 + 在 `/THIRD_PARTY_LICENSES.md` 追加一行**。

#### K0 已对齐(无需动)
- [ ] **沙盒预览引擎** — `/api/sandbox-runs/:id/preview/*` 已现成,核对一遍是否完全等价(给一句话写到 REVIEW 即可)

#### K-P0 本轮必做(已在 NEED_FIX 范围)
- [ ] **K1 seed:demo-projects** — `pnpm -C server seed:demo` 命令真存在(`seed-demo.ts`):seed 3 项目频道(pixel-2 / invoice-flow / q3-positioning / incident-2026-05-20 + 讨论频道 strategy-q3 / random / all-hands + 4 私信)真写进 DB
- [ ] **K2 /api/health 端点** — 5 行实现

#### K-P1 本轮顺手做(做不完降级,REVIEW 标 NEED_FIX 转 Phase J)
- [ ] **K3 Skills 包加载(Plugins 菜单真接通)** — `~/.helio/skills/*/SKILL.md` 真扫描 + 加载,前端 Plugins · 已装 tab **真显示扫到的 SKILL 包**(不再是 mock)。SKILL.md 规范跟 Claude Code 完全兼容,**用户能放 Claude Code 现有 skill 进去就能用**。预估 1.5h
- [ ] **K4 MCP 服务器** — 暴露 MCP server,让外部 AI(Claude Code / Cursor)能通过 MCP 调:`create_project_channel` / `dispatch_task` / `get_delivery` / `list_channels` / `read_memory`。设置页 / Integrations · MCP tab 显示"已暴露,接入指南"按钮(借鉴 OD 的"一键交接")。预估 2h
  - 实现可用 `@modelcontextprotocol/sdk` npm 包(MIT)
  - 端口建议 5374(避开 server 5373 / web 5173)

#### K-P2 本轮只列档案,不做(v4.2 战略)
- **daemon 架构重构** — 现 server 跟 web 强耦合,重构成 `helio daemon` 独立进程。跨度大,需要 server 入口重写、生命周期管理、IPC 等。**只在 doctrine 留位**
- **CLI 入口** — `helio <command>` 无头 CLI。需要 `commander` / `yargs` + 把 server API 包成命令。可借鉴 OD 的 `od <command>` 设计。**只在 doctrine 留位**

#### K-P3 顺手补:LICENSE 归属
- [ ] **K5** K3 / K4 实现完后,在 `THIRD_PARTY_LICENSES.md` 对应位置追加(K1/K2 已要求)。文件顶部加 `// Inspired by open-design (Apache 2.0), see /THIRD_PARTY_LICENSES.md` 注释。统一处理一次性写好。

### L. NEED_FIX 已被截图清单覆盖的

- [ ] **L1** KPI 字号 ≥ 48px(C6 已要求)
- [ ] **L2** Composer @/slash 真接通(C4 / I1 已要求)
- [ ] **L3** 主页模板 12 项(D2 已要求,seed 到 `templates.ts`)
- [ ] **L4** Editor 文件树(剩余 NEED_FIX,跟 H 截图不冲突,顺手做):`GET /api/sandbox-runs/:id/files` + react-arborist 接通

---

## 验收硬指标

### 1. 截图对照证据
每张截图(01-home + 03-project-pixel2-preview)跑 Safari → 截屏到 `docs/ai/screens/v4-actual-i/` → 跟 reference 同名图**逐字段对比**:

```
=== 01-home.png 对照 ===
A1 logo: ✅ / ❌
A2 工作台段标 ⌘1 ⌘2: ✅ / ❌
A3 项目段 4 个频道含状态指示: ✅ / ❌
... (A1-E4 每条都打钩)

=== 03-project-pixel2-preview.png 对照 ===
F1 顶部 chip: ✅ / ❌
G1 项目卡标题 + ARIA 主理 chip: ✅ / ❌
... (F1-J3 每条都打钩)
```

**写在 `docs/ai/current/V4_PHASE_I_REVIEW.md` 里**。

### 2. 红线 α/β 浏览器实测
- 场景 α:seed 完后打开 #pixel-2 → preview tab 显示截图里的 Button · v2(seed 一份预生成的产物即可)
- 场景 β:点 sidebar 任意 AI · 角色名 → 跳 Agent profile,不创 DM

### 3. 三构建过
- `pnpm -C server build` / `pnpm -C web exec tsc --noEmit` / `pnpm -C web build`

### 4. 不允许敷衍 PASS
- 每条 checklist 必须**真打钩**(对应代码或视觉)
- ≥ 5 条 ❌ → `FINAL_VERDICT: NEED_FIX`,列具体哪些转 Phase J
- 假 PASS 一律作废,从 `068fe53` 重做

---

## 不要做(本轮范围外)

- MCP 服务器接入 / SKILL.md 加载 / CLI 模块 / `heliox://` 协议头 — 全部 v4.2+
- 大改产品语义层(A2A / Memory / Edge / Optimizer 后端)— 都不动
- 截图 02 公司全景 / 12 agent-aria / 14 new-project-modal — 这些是 Phase J 范围,本轮只做 01 + 03

---

## 立即开跑

```
按 docs/ai/current/V4_PHASE_I.md 严格执行。

最高优先级(P0,必做):
1. 两张截图 1:1 复刻 — reference/v4-opendesign-screens/01-home.png + 03-project-pixel2-preview.png。逐元素 checklist A1→E4 + F1→J3 每条打钩。
2. K1 seed:demo-projects(让启动后有真数据看效果)
3. K2 /api/health(5 行)
4. L4 Editor 文件树接通沙盒

顺手做(P1,做不完降级):
5. K3 Skills 包加载(Plugins 菜单接 ~/.helio/skills/*/SKILL.md,跟 Claude Code 兼容)
6. K4 MCP 服务器(暴露 5374 端口,让 Claude Code/Cursor 能通过 MCP 调 Heliox)

不要做(P2,v4.2 战略):
- daemon 架构重构 / CLI 入口 — 只在 doctrine 留位,不动

执行规则:
- 每段完成 git commit + git push origin main
- K3/K4 任何文件级抄 OD 源码必须加 // Inspired by open-design (Apache 2.0) 头 + 在 /THIRD_PARTY_LICENSES.md 追加条目
- 完成后写 docs/ai/current/V4_PHASE_I_REVIEW.md,逐条标 ✅ 或 ❌,末行 FINAL_VERDICT
- P1 做不完不算失败,REVIEW 标 "K3 / K4 NEED_FIX 转 Phase J" 即可
- 但 P0 任何一条没做完 = FINAL_VERDICT: NEED_FIX
- 假 PASS 一律作废,从 068fe53 重做

红线 α/β 再跑一次,截图为证。

开始。
```
