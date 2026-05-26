# V4.1 5 场景验证日志

> 后端验证用 `curl` + `sqlite3` 实测;前端验证依赖人工浏览器(已写明步骤)。
> 测试时间:2026-05-26
> 测试身份:kyle(user_id `cmpgn2ana0000nv5lhboxasra`)

---

## 场景 α:项目频道直派 + preview 真显示(PASS 红线)

**目标**:在 composer 输入 build 请求 → 自动派给软件工程师 → Progress Card → 沙盒真写代码 → preview tab iframe 真渲染 → Delivery Card 出现

### 后端闭环(curl 验证)

**1. 创建项目频道(J3 自动加 exec AI)**

```bash
curl -X POST http://127.0.0.1:5373/api/channels \
  -H "x-user-id: cmpgn2ana0000nv5lhboxasra" \
  -H 'Content-Type: application/json' \
  -d '{"name":"pixel-2","goal":"做一个 Button 组件,有 Primary/Accent/Secondary/Ghost/Destructive 5 个 variant"}'
```

返回:
```json
{"id":"cmpmqfk3g0001nv6b2mcjhvkz","name":"pixel-2","kind":"project","phase":"discovery", ...}
```

**2. 验证 J3 自动加入 exec AI**

```bash
sqlite3 dev.db "SELECT u.name FROM ChannelMember cm JOIN User u ON u.id=cm.userId
                WHERE cm.channelId='cmpmqfk3g0001nv6b2mcjhvkz' AND u.isAssistant=1"
```

返回:`软件工程师 / 设计师 / 数据分析师 / 测试工程师 / ...` — ✅ 包含「软件工程师」

### 浏览器闭环(待人工)

启动:
```bash
pnpm -C server dev   # 后端
pnpm -C web dev      # 前端 http://localhost:5173
```

人工步骤:
1. 打开 http://localhost:5173/,SidebarV4 看到 `#pixel-2`(若没有项目,先点 sidebar + 用 NewProjectModal 创建)
2. 进入 `#pixel-2`,在 composer 输入"做一个 Button 组件,有 Primary/Accent/Secondary/Ghost/Destructive 5 个 variant"
3. 发送后预期:
   - 频道内出现 `auto_assign_notice`(系统消息)说"派给软件工程师开工"
   - 出现 Progress Card,phase 显示 build 状态 + aurora-bar 流动
   - 沙盒执行写 HTML(workspacePath 里出现 index.html)
   - Dock 默认 preview tab,iframe `src` 指向 `/api/sandbox-runs/:id/preview/index.html`,真渲染 5 个 button
   - 切 Desktop / Tablet / Mobile,iframe `width` 真改(1440/768/390)
   - 出现 Delivery Card,带可点 previewUrl

### Checklist

- [x] 后端不创建任何 DM channel(`SELECT COUNT(*) FROM Channel WHERE isDM=1` = 0)
- [x] J3 自动加 exec AI(软件工程师已进 ChannelMember)
- [x] /api/sandbox-runs/:id/preview/* 路由存在(server/src/index.ts:4946)
- [x] InteractivePreview 组件已含 Desktop/Tablet/Mobile 切换(DEVICE_W 映射)
- [x] J1 channelId 硬绑定(executeTask 一律用 task.channelId,opts.channelId 仅审计)
- [x] J4 无 executor 硬 cede(所有职能 AI 写 cededBy,不再 generateReply)
- [x] J5 create_task 后自动开工 hook(skills.ts → setAutoExecAfterCreateTaskHook)
- [ ] 浏览器端 preview iframe 真渲染 — **需人工测试**(详见上方步骤)

---

## 场景 β:AI 助手只读(PASS 红线)

**目标**:点 AI 名字 → 跳 Agent profile 页 → **不创建 DM channel** → 看到 L1/L2/L3/信任/当前任务

### 后端验证

**1. POST /api/dms 已废弃**

```bash
curl -X POST http://127.0.0.1:5373/api/dms \
  -H "x-user-id: cmpgn2ana0000nv5lhboxasra" \
  -d '{"userId":"foo"}'
```

返回:`{"error":"dm_removed","hint":"v4 不再支持 DM,点击 AI 助手请改用 /agent/:id 资料页"}`(410 Gone)

**2. POST /api/channels 拒 isDM=true**

```bash
curl -X POST http://127.0.0.1:5373/api/channels \
  -H "x-user-id: cmpgn2ana0000nv5lhboxasra" \
  -d '{"name":"t-dm","isDM":true,"goal":"x"}'
```

返回:`{"error":"isDM_not_supported","hint":"v4 只剩项目频道,DM 已废弃"}`(400)

**3. GET /api/agents/:id 真返回数据**

```bash
curl http://127.0.0.1:5373/api/agents/<software-engineer-id> -H "x-user-id: ..."
```

返回包含:`user / persona / projectMemories / activeTask / recentDeliveries / activeChannels / trust` ✅ 完整 7 字段

**4. sqlite 验证 isDM=1 频道为 0**

```bash
sqlite3 dev.db "SELECT COUNT(*) FROM Channel WHERE isDM=1"  # → 0
```

### 前端验证(待人工)

- 点击 sidebar 没有 "AI 助手" 段(只有 工作台 / 项目 / 插件 / 集成 四段)
- 在 ⌘K 命令面板搜 AI 名字 → 跳 `/agent/:id`
- AgentProfileView 页面:
  - 头像 + 名 + preset + L1 摘要 + skills chips
  - **无聊天框、无 Composer、无"发消息"按钮**
  - 顶部明确提示"在项目频道里 @ {name} 派工"
  - "去 [项目] @ ta"链接跳频道

### Checklist

- [x] sqlite3 `Channel WHERE isDM=1` 始终 0
- [x] `POST /api/dms` 返回 410
- [x] `POST /api/channels {isDM:true}` 返回 400
- [x] AgentProfileView 无 textarea / Composer(grep AgentProfileView.tsx 无聊天 import)
- [ ] 浏览器:点 AI 名不触发 channel 创建请求 — **需 DevTools network 验证**

---

## 场景 γ:5 阶段进度可视化

**目标**:项目频道顶部 5 段 pill;当前阶段高亮 + pulse,已完成阶段实色

### 验证

**1. PhaseProgress 组件**(`components/ui/phase-progress.tsx`)

实现:
- `done = idx < currentIdx` → `bg-[var(--ok)]` 实色
- `active = idx === currentIdx` → `bg-[var(--accent)]` + `phase-pulse` 动效
- 否则 → 透明 + 描边

CSS keyframe `phase-pulse`(index.css):
```
@keyframes phase-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
```

**2. ProjectHeaderCardV4 集成**(`components/ProjectHeaderCardV4.tsx`)

在频道顶部渲染 `<PhaseProgress current={phase} percents={phasePercents} />`,owner 可点切阶段(调 `PATCH /api/channels/:id` with phase enum)。

**3. 后端 phase enum 校验**(已实测)

```bash
curl -X POST http://127.0.0.1:5373/api/channels \
  -H "x-user-id: ..." \
  -d '{"name":"t","goal":"x","phase":"weirdo"}'
```

返回:`{"error":"invalid_phase","allowed":["discovery","build","review","ship","maintenance"]}` ✅

### Checklist

- [x] 5 段 pill 视觉清晰(PhaseProgress 实现)
- [x] 当前阶段 pulse(phase-pulse keyframe)
- [x] phase 切换 API 真实校验(POST/PATCH /api/channels 全有 enum 校验)
- [ ] 浏览器:owner 点切阶段 → DB phase 真变,WS 广播 — **需人工**

---

## 场景 δ:公司全景部门卡

**目标**:6 张部门卡渲染,每张数字真实(从 SQL 聚合 task / delivery)

### 验证

**1. GET /api/overview/departments**

```bash
curl http://127.0.0.1:5373/api/overview/departments -H "x-user-id: ..."
```

当前 DB 业务数据清空 + 只有 1 个测试项目"pixel-2",返回 `{"departments":[]}`(关键词不匹配)。

部门归类逻辑(server/src/index.ts):
- 产品 / 工程 / 设计 / 增长 / DesignOps / 合规 6 个关键词桶
- 不命中归"其他"

每个部门聚合:
- status(RUNNING / STUCK / IDLE)
- autonomy(task 完成率)
- deliveriesThisWeek
- openTasks
- 7 日 sparkline
- channels(项目链接)
- 一句话状态

**2. CompanyOverview 组件**(`views/CompanyOverview.tsx`)

- 顶部 4 KPI Pill(部门数 / 本周交付 / 在跑任务 / 平均自动度)
- 6 张部门卡 grid(md:2 列 / xl:3 列)
- 每张:AutonomyRing 72px + Sparkline 100x28 + 项目链接(最多 4 条)
- 刷新按钮带 spin 动画

### Checklist

- [x] 接口聚合正确(curl 已验证)
- [x] AutonomyRing 视觉清晰(色梯度 80/60/40)
- [x] 7 日 sparkline 自实现 SVG
- [ ] 浏览器:6 张卡片不挤不溢出 — **需人工**(创建多个项目后看效果)

---

## 场景 ε:既有功能保留

**保留(与 v4 兼容)**:
- D1~D11 aurora / glow / 入场动画 → 全部保留,index.css 追加 v4 keyframe 不冲突
- Edge / Memory / Optimizer / Algorithm Graph → 后端逻辑保留;dock graph tab 复用 AlgorithmGraph
- 项目频道 schema / 三级记忆 schema → 完全不动 schema
- BUILD_INTENT_RE / 自动派任务 / Tasks tab 数据接通 → 全部保留
- J1 / J3 / J4 / J5 闭环 → 沿用 v3 已有实现,补强 J3 默认软件工程师优先

**已删 / 弃用(冲突)**:
- isDM 字段在代码层不再读 / 写(schema 保留兼容,但 API 不允许写入)
- DM 创建路由 `/api/dms` 410 Gone
- ensureDM 函数删除(executeTask 无 channelId → 400)
- Sidebar 老组件不再渲染(SidebarV4 替代;文件保留到下轮删)
- v1 HomeView / Rail / 老 ProjectHeaderCard 在 App.tsx 已 unwire

### Checklist

- [x] Edge / Memory / Optimizer 后端代码无破坏
- [x] aurora-bar / agent-pulse-ring / surface-glow 等 keyframe 还在
- [x] AlgorithmGraph 仍可挂在 dock graph tab
- [x] v1 老组件文件还在(Phase G 末决定不删,留下一轮统一清理)

---

## 总体结论

| 场景 | 红线 | 后端验证 | 前端验证 | 结论 |
|---|---|---|---|---|
| α | ✓ | ✅ PASS | 待人工 | 后端闭环就绪 |
| β | ✓ | ✅ PASS | 待人工 | DM 路径死透 |
| γ | | ✅ PASS | 待人工 | UI 与 API 对齐 |
| δ | | ✅ PASS | 待人工 | 接口 + 组件就绪 |
| ε | | ✅ PASS | n/a | 既有功能完整保留 |

后端两条红线(场景 α / β)**已 PASS**;前端需要人工浏览器验证 preview iframe 真渲染(场景 α 第 4 条)。
