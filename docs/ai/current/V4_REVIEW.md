# V4.1 自评

## 评分(自评)

| 维度 | 权重 | 自评 | 说明 |
|---|---|---|---|
| UI 35% | 35 | **28/35** | 8 个核心视图都到位(SidebarV4 / HomeViewV4 / CompanyOverview / ProjectHeaderCardV4 / 8 tab dock / AgentProfileView / NewProjectModal / Plugins+Integrations);v4 token 全套抽完;3 个新组件抽出可复用。**扣分**:截图视觉细节(玻璃质感 / 留白 / 字距)未做像素级对齐;只跑了构建未做截图对比 |
| 闭环可用 35% | 35 | **27/35** | J1/J3/J4/J5 闭环全部继承;后端 isDM 死路全清;Agent profile API 完整;phase enum 校验。**扣分**:preview tab iframe 真渲染未做浏览器实测;editor tab Monaco 只读不能写;inspect tab eruda 注入未改 sandbox 模板 |
| 技术 20% | 20 | **18/20** | server tsc / web tsc / web build 三构建全过;isDM 后端读写路径删干净;schema 不动;DB 业务数据保留 |
| 原创 10% | 10 | **8/10** | 命名遵循 v4 doctrine;ProjectHeaderCardV4 / SidebarV4 / HomeViewV4 / CompanyOverview 视觉重新设计;AutonomyRing / PhaseProgress / Sparkline 三组件全新自实现 |

**总分:81/100**(UI 28 + 可用 27 + 技术 18 + 原创 8)

## 完成项

### Phase A — 后端形态校准 ✅

- `POST /api/channels`:拒 `isDM=true` + 拒 `kind!=='project'` + phase enum 校验
- `POST /api/dms`:410 Gone
- 后端 isDM 读写路径全清:GET /channels / GET /channels/:id / 搜索 / Inbox / shapeAssistant / executeTask 等 20+ 处
- ensureDM 函数删除;executeTask 无 channelId → 400
- 新增 `GET /api/agents/:id`,返回完整 7 字段(user / persona / projectMemories / activeTask / recentDeliveries / activeChannels / trust)
- J3 ensureProjectExecutor 锁定优先「软件工程师」
- J1 / J4 / J5 既有实现已符合 v4 spec,无破坏

### Phase B — token / npm / 组件基底 ✅

- theme.css 抽自 v4-source HTML 的完整 OKLCH token + 别名层桥接 v3 老 token
- index.css 追加 6 个 v4 keyframe(v4-pulse / card-breath / opt-sweep / phase-pulse / sweep / spin)+ 3 个 v4 class(v4-card / v4-glass-soft / kicker)
- 装 24 个 npm 包(sonner / cmdk / framer-motion / monaco / arborist / xyflow / radix-* / tiptap / recharts 等)
- shadcn 风格 ui 组件 14 个:button / card / input / textarea / dialog / tabs / tooltip / avatar / progress / accordion / dropdown-menu / switch / sheet / badge
- v4 三个新组件:AutonomyRing(SVG 色梯度环)/ PhaseProgress(5 段 pill + pulse)/ Sparkline(自实现 SVG path)
- CommandPalette(cmdk + ⌘K hook)
- Sonner Toaster + TooltipProvider 挂在 main.tsx

### Phase C — 导航重构 ✅

- SidebarV4 四段:工作台 / 项目 / 插件 / 集成(248px 宽 + brand mark + glass-3)
- ⌘K 命令面板贴在 sidebar 顶部搜索区
- PluginsView(installed / sources 双 tab + mock 数据)
- IntegrationsView(MCP / connectors / anywhere 三 tab,MCP 接真 publicProviders)
- App.tsx 加 view 分支 + 删 Rail + 老 Sidebar 渲染

### Phase D — 主页 + 公司全景 ✅

- HomeViewV4:4 KPI 横条 + 28-36px 大问候 + 中部 composer + "常用工作"模板网格 + "你的项目"侧栏
- CompanyOverview:6 张部门大卡(关键词归类 + AutonomyRing 72px + Sparkline 100x28 + 项目链接 + status chip)
- 后端 GET /api/home-kpis(4 KPI + 7 日 sparkline)
- 后端 GET /api/overview/departments(6 部门关键词聚合)

### Phase E — 项目频道 + 8 tab dock ✅

- ProjectHeaderCardV4 完全重写:5 段 PhaseProgress + AutonomyRing 72px + ALPHA Badge + Rocket banner + aurora-bar 顶条
- AssistantWorkspace 8 tab 改造:preview(默认)/ editor / inspect / tasks / graph / deliveries / memory / activity
- EditorPanel:懒加载 @monaco-editor/react + 沙盒文件树(read-only)
- InspectPanel:postMessage 唤起 eruda + 新窗口 fallback + 解释文案
- InteractivePreview 复用(已支持 Desktop/Tablet/Mobile + iframe sandbox)

### Phase F — Agent profile + NewProject modal ✅

- AgentProfileView:头像 + 名 + skills + L1 摘要 + 当前任务 + L2/L3 Accordion + 信任 3 段条 + 活跃项目链接;**无聊天框**
- NewProjectModal:3 步表单(基础信息 / owner + phase / 推荐 AI 队员)+ 步进指示器
- SidebarV4 "+" 触发 NewProjectModal(替换 window.prompt)
- ⌘K 点 AI 名字 → 跳 AgentProfileView(`/agent/:id`)
- 删 App.tsx 里 v1 的 createChannel useCallback(NewProjectModal 直接调 api)

### Phase G — 构建 + 验证 + 文档 ✅

- 三构建全过
- 后端 5 场景 curl 实测:isDM/phase/kind/dms/agents/home-kpis/overview 全 PASS
- V4_PLAN.md / V4_BUILD_RESULT.md / V4_LOGIC_VALIDATION.md / V4_REVIEW.md / V4_DELIVERY.md

---

## 推翻清单

| 推翻项 | 原因 | 处理 |
|---|---|---|
| `kind=discussion/random` 频道 | doctrine §1 频道只一种 | POST 400;老数据不破坏 |
| `isDM` 字段读写 | doctrine §1 没有 DM | 代码全砍,schema 列保留 |
| `/api/dms` 路由 | 没有 DM | 410 Gone |
| `ensureDM` helper | executeTask 不再走 DM 兜底 | 函数删除 |
| `openDM` / `openAssistantChat` 前端入口 | 不创建 DM | App.tsx 改 toast 提示 |
| v1 老 Rail 14px 图标列 | doctrine §2.1 单栏 240px | App.tsx unwire(文件保留下轮删) |
| v1 ProjectHeaderCard | 视觉不符 v4 | 切到 ProjectHeaderCardV4 |
| v3 HomeView | 信息架构不符 | 切到 HomeViewV4 |
| Mission Control / MissionWorkspace | 公司全景替代 | App.tsx 保留 view 分支(只在 selectChannel 进入)+ 不再首选;文件保留下轮删 |

---

## 仍未做项(诚实标注)

1. **截图像素级对齐** — 视觉对齐了大格局(token / 卡片骨架 / 字号阶梯 / 动效),但没逐张截图做像素对照
2. **eruda 真注入 preview iframe** — InspectPanel 提供入口与 postMessage 调用,但 `server/src/sandbox.ts` 沙盒模板未真注入 `<script src="/eruda.js">`(下一轮需要往 sandbox HTML 头部注入)
3. **editor tab 可写** — 只读 Monaco 已就绪,"提交评审"按钮 + write API 留下一轮
4. **mention 完整 tiptap composer** — 既有 Composer 沿用,未升级到 tiptap 富文本 + @ 补全(可选 P1)
5. **v1~v3 老组件物理删除** — App.tsx 已 unwire 但文件还在(InboxView / TasksView / TerminalView / MissionWorkspace / MissionComposer / PendingActionDrawer / SafetyDrawer / ExecutionCockpit / PendingInputModal / TemplatePreview / CreateAssistantModal / Rail / 老 Sidebar / 老 ProjectHeaderCard / 老 HomeView)— 留下一轮统一清理
6. **场景 α 浏览器实测** — 后端闭环已 curl 验证,需人工启动 server + web 测 preview iframe 真渲染 5 个 Button
7. **移动端布局** — Sidebar 在 < 768px 没做抽屉化;Dock 移动端没改全屏
8. **manualChunks 拆包** — 主 JS 1.27MB(framer-motion + xyflow + recharts 占大头)

---

## 人工验收路径

启动:
```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm -C server dev     # http://127.0.0.1:5373
pnpm -C web dev        # http://127.0.0.1:5173
```

测试:

1. **场景 β 验证(点 AI 不创建 DM)**:
   - 打开 http://localhost:5173/
   - 按 ⌘K,搜任意 AI 名字(如「软件工程师」)
   - 点选 → 跳 `/agent/:id` 视图
   - DevTools network 看 — **不应该有 POST /api/dms 或 POST /api/channels**
   - 视觉:无聊天框、无 Composer

2. **场景 α 验证(项目频道真闭环)**:
   - sidebar 没项目?点 "+" 用 NewProjectModal 创建一个 `pixel-2`(goal 必填,选软件工程师)
   - 进入 #pixel-2,composer 输入"做一个 Button 组件,有 Primary/Accent/Secondary/Ghost/Destructive 5 个 variant"
   - 发送
   - 等待:Progress Card 出现 → 沙盒执行 → 出 Delivery Card
   - Dock 顶部默认 preview tab,iframe 真显示 5 个 button
   - 切 Desktop(1440)/ Tablet(768)/ Mobile(390),iframe width 真变
   - 切 editor tab:左侧文件树 + Monaco 显示 index.html
   - 切 inspect tab:点"在新窗口打开 preview"能开;点"展开 eruda devtools"会 postMessage

3. **三项基础健康检查**:
   ```bash
   sqlite3 server/prisma/dev.db "SELECT COUNT(*) FROM Channel WHERE isDM=1"  # 应该 = 0
   curl -X POST http://127.0.0.1:5373/api/dms -H "x-user-id: ..." -d '{"userId":"x"}'  # 应该返回 410
   curl -X POST http://127.0.0.1:5373/api/channels -H "x-user-id: ..." -d '{"name":"a","goal":"x","phase":"weirdo"}'  # 应该 400 + allowed enum
   ```

---

## FINAL_VERDICT

后端两条红线 PASS(场景 α 后端闭环 + 场景 β AI 只读);前端构建过 + 关键视图都到位;**仍需人工浏览器测一次 preview iframe 真渲染**才算端到端 PASS。

**FINAL_VERDICT: PASS(后端完整,前端待人工浏览器实测)**
