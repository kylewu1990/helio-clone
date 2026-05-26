# V4.1 交付摘要

## 一句话结论

按 doctrine 全量重塑 UI + 形态校准 7 phase 顺序串完,后端两条红线(场景 α 闭环 / 场景 β AI 只读)curl 实测 PASS,前端三构建过;preview iframe 真渲染待人工浏览器实测。

## Phase 顺序 & commit 链

| Phase | 内容 | Commit | 状态 |
|---|---|---|---|
| A | 后端形态校准(DM 路径全砍 + phase enum + Agent profile API + J1/3/4/5 闭环) | `48a3ca2` | ✅ |
| B | v4 token + npm 24 个依赖 + shadcn 14 组件 + 3 个 v4 新组件 + ⌘K 命令面板 | `16b92a0` | ✅ |
| C | SidebarV4 四段 + PluginsView + IntegrationsView + App.tsx 路由扩展 | `be60c38` | ✅ |
| D | HomeViewV4 + CompanyOverview + 后端 home-kpis & overview/departments | `2b44010` | ✅ |
| E | ProjectHeaderCardV4 + 8 tab dock(preview/editor/inspect 三件套 + 过程五件套) | `3f42b38` | ✅ |
| F | AgentProfileView(只读)+ NewProjectModal(3 步) | `e434cec` | ✅ |
| G | 三构建 + 5 场景 curl 验证 + V4_* 五份文档 | 本次 | ✅ |

## 5 场景验证状态

| 场景 | 后端 | 前端构建 | 浏览器 |
|---|---|---|---|
| α 项目频道闭环 + preview 真渲染 ★ | ✅ | ✅ | 待人工 |
| β AI 助手只读 ★ | ✅ | ✅ | 待人工 |
| γ 5 阶段进度可视化 | ✅ | ✅ | 待人工 |
| δ 公司全景部门卡 | ✅ | ✅ | 待人工 |
| ε 既有功能保留 | n/a | ✅ | n/a |

详细日志见 `V4_LOGIC_VALIDATION.md`。

## 人工验收路径(必含两条)

启动:
```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm -C server dev
pnpm -C web dev
```

### 1. 点 AI 名字不创建 DM(场景 β)

- 打开 http://localhost:5173
- 按 ⌘K → 搜「软件工程师」→ 选中
- DevTools network 监视 → **不应该有任何 POST /api/dms 或 POST /api/channels**
- 看到 AgentProfileView:无聊天框,有 L1/L2/L3,有"去项目 @ ta"链接
- sqlite `SELECT COUNT(*) FROM Channel WHERE isDM=1` 全程 = 0

### 2. 项目频道发"构建 X"真开工(场景 α)

- 没项目?点 sidebar "+"用 NewProjectModal 创建(goal 必填,默认勾选「软件工程师」)
- 进入新建的 #pixel-2,composer 输入:
  > 做一个 Button 组件,有 Primary/Accent/Secondary/Ghost/Destructive 5 个 variant
- 发送
- 应该看到:
  - 频道里出现 system 提示"派给软件工程师开工"
  - Progress Card(顶部 aurora-bar 流动)
  - 等几秒 → 沙盒写完 HTML
  - Dock 默认 preview tab,iframe 真渲染 5 个 button(不是空白!)
  - 切 Desktop(1440)/ Tablet(768)/ Mobile(390),iframe width 真变
  - 出 Delivery Card,带可点 previewUrl

## 关键文件

### 新建(本轮)

- `web/src/components/SidebarV4.tsx`
- `web/src/components/ProjectHeaderCardV4.tsx`
- `web/src/components/NewProjectModal.tsx`
- `web/src/components/views/HomeViewV4.tsx`
- `web/src/components/views/CompanyOverview.tsx`
- `web/src/components/views/AgentProfileView.tsx`
- `web/src/components/views/PluginsView.tsx`
- `web/src/components/views/IntegrationsView.tsx`
- `web/src/components/ui/` × 14(shadcn 基底)
- `web/src/components/ui/autonomy-ring.tsx`
- `web/src/components/ui/phase-progress.tsx`
- `web/src/components/ui/sparkline.tsx`
- `web/src/components/ui/command-palette.tsx`
- `web/src/lib/cn.ts`

### 重写(本轮)

- `web/src/theme.css`(v4 OKLCH token 完整体系 + v3 alias 桥接层)
- `web/src/index.css`(+ 6 keyframe + 3 class)
- `web/src/main.tsx`(挂 Sonner Toaster + TooltipProvider)
- `web/src/App.tsx`(SidebarV4 替换 Rail+Sidebar / MainView 扩展 / 新 view 分支 / 删 isDM 读)
- `server/src/index.ts`(20+ 处 isDM 清理 + POST/api/channels 收紧 + 新增 GET /api/agents/:id + POST /api/dms 410 + 新增 home-kpis & overview/departments)
- `web/src/components/workspace/AssistantWorkspace.tsx`(TABS 重排为 v4 8 tab + 加 EditorPanel + InspectPanel)
- `web/src/components/ChannelView.tsx`(import ProjectHeaderCard → ProjectHeaderCardV4)
- `web/src/lib/api.ts`(+ homeKpis / overviewDepartments / agent 三个客户端)
- `THIRD_PARTY_LICENSES.md`(追加 v4.1 npm 依赖表 + shadcn 借鉴说明)

### 保留待清(下一轮)

- `web/src/components/Sidebar.tsx`(旧)
- `web/src/components/Rail.tsx`
- `web/src/components/ProjectHeaderCard.tsx`(旧)
- `web/src/components/workspace/HomeView.tsx`(旧)
- `web/src/components/InboxView.tsx`
- `web/src/components/TasksView.tsx`
- `web/src/components/TerminalView.tsx`
- `web/src/components/CreateAssistantModal.tsx`
- `web/src/components/workspace/MissionWorkspace.tsx`
- `web/src/components/workspace/MissionComposer.tsx`
- `web/src/components/workspace/PendingActionDrawer.tsx`
- `web/src/components/workspace/SafetyDrawer.tsx`
- `web/src/components/workspace/ExecutionCockpit.tsx`
- `web/src/components/workspace/PendingInputModal.tsx`
- `web/src/components/workspace/TemplatePreview.tsx`

App.tsx 已 unwire 这些,但还在 import(因为里面还在用 isolation / pendingInputs 等 state),物理删除需要先把对应 state 一并拆掉,留下一轮做。

## 已知遗留 / 下一轮

1. preview iframe 真渲染浏览器实测(本轮 curl 证明后端能跑闭环,需 UI 端到端走一次)
2. eruda 真注入沙盒 HTML(server/src/sandbox.ts 模板加 `<script src="/eruda.js">`)
3. editor tab 可写 + 提交评审(目前只读)
4. v1~v3 老组件文件物理删除 + App.tsx state 大瘦身
5. Composer 升级 tiptap 富文本 + @ 补全
6. 移动端 < 768px 抽屉化 Sidebar + Dock
7. manualChunks 拆 framer-motion / xyflow / recharts(主 JS 1.27MB)
8. 截图像素级对齐(本轮做了大格局视觉,精细度未做)

## FINAL_VERDICT: PASS(后端 + 前端构建 PASS,preview iframe 浏览器实测待人工)
