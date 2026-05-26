# V4 Phase I — 修 NEED_FIX + 借鉴 Open Design 基础设施

## 上一轮(Phase H)成绩单

Phase H 跑完,硬指标全过(ChannelView 778→449 / App.tsx 1405→607 / 13 个 v3 残留真删 / 8 npm 必装齐 / 三构建过)。但 REVIEW 自标 5 个 NEED_FIX 转 Phase I:

1. **seed 数据** — 启动后是空的,新用户看不到 v4 全貌
2. **KPI 字号** — 44 偏小,截图是 ~52
3. **Composer @/slash 补全** — tiptap 装了但 @ / slash 命令菜单没接通
4. **模板 seed** — 主页"常用工作"模板网格是 mock,需要真的 seed
5. **Editor 文件树** — react-arborist 装了但文件树数据没接通沙盒 workspace

另外用户决策:**借鉴 Open Design 基础设施层**(基础设施借,产品语义不借)。本轮顺手做 2 个最低成本的:`seed:demo-projects` + `/api/health`。

---

## 本轮硬约束(沿用 Phase H 标准)

### 1. 每个改动必有截图证据
完成后 Safari 跑 → 截屏到 `docs/ai/screens/v4-actual-i/<视图名>.png` → 对比 `docs/ai/reference/v4-opendesign-screens/<同名>.png`,在 `V4_PHASE_I_REVIEW.md` **每张列 3+ 差异点**,不允许"已对齐"。

### 2. 关键 seed 数据真生效
- `pnpm seed:demo-projects` 命令真存在 + 可跑(脚本在 `server/prisma/seed-demo.ts`)
- 跑完后 DB 至少有:**3 个项目频道**(pixel-2 / invoice-flow / english-mvp)+ 每个频道 2-3 条历史消息 + 1 张已交付 Delivery Card + 各阶段分布
- 不允许 mock 数据,**真写进 DB**

### 3. 假 PASS 一律作废
跟 Phase H 一样,REVIEW 末行 `FINAL_VERDICT: PASS` 必须:截图 ≥6 张差异点齐 + 三构建过 + seed 命令真能跑 + Composer @ 真出补全菜单。假 PASS 发现作废,从 `36d9aa7` 推倒重做。

---

## I1. seed:demo-projects(NEED_FIX #1 + Open Design 借鉴)

**位置**:`server/prisma/seed-demo.ts`(新建)+ `server/package.json` `scripts` 加 `seed:demo`

**内容**:写一个脚本,seed 3 个完整项目频道,让用户启动后立刻看到 v4 全貌:

```ts
// 概要(完整实现自己写)
const projects = [
  {
    name: 'pixel-2',
    goal: 'Pixel 2.0 — 设计系统迁移',
    phase: 'build',
    ownerHandle: 'kyle',
    aiMembers: ['软件工程师', '设计师', '产品经理', '评审AI'],
    seedMessages: [
      { author: 'kyle', body: '把 button 圆角统一到 8px, destructive 色阶往左挪一档' },
      { author: '产品经理', body: '收到,先拆 4 个子任务...' },
      { author: '软件工程师', body: '我开始处理 button v2' },
    ],
    seedDeliveries: 1, // 生成 1 张已交付的 Delivery Card(模拟 Button v2 PR)
  },
  {
    name: 'invoice-flow',
    goal: '发票流自动化 v1',
    phase: 'review',
    ownerHandle: 'kyle',
    aiMembers: ['软件工程师', '会议秘书', '评审AI'],
    seedMessages: [...],
    seedDeliveries: 2,
  },
  {
    name: 'english-mvp',
    goal: '850 词成人零基础英语学习网站 MVP',
    phase: 'discovery',
    ownerHandle: 'kyle',
    aiMembers: ['软件工程师', '产品经理', '教研架构师 (Edu)'],
    seedMessages: [...],
    seedDeliveries: 0, // 还在 discovery,没交付
  },
]
```

**验收**:`pnpm -C server seed:demo` 跑完,`sqlite3 dev.db "SELECT COUNT(*) FROM Channel WHERE kind='project'"` 至少 3,`SELECT COUNT(*) FROM Message` ≥ 9,`SELECT COUNT(*) FROM Delivery` ≥ 3。

**借鉴归属**:加 `// Inspired by open-design seed:test-projects (Apache 2.0)` 注释,在 `/THIRD_PARTY_LICENSES.md` 追加一行。

---

## I2. /api/health 端点(Open Design 借鉴)

**位置**:`server/src/index.ts` 任意路由聚集处

**实现**(5 行):
```ts
app.get('/api/health', async () => ({
  ok: true,
  version: 'v4.1',
  uptime: process.uptime(),
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
}))
```

**验收**:`curl http://127.0.0.1:5373/api/health` 返回 `{ ok: true, version: "v4.1", uptime: <number>, startedAt: <iso> }`

**借鉴归属**:加 `// Inspired by open-design /api/health (Apache 2.0)` 注释。

---

## I3. KPI 字号微调(NEED_FIX #2)

**位置**:`web/src/components/views/HomeViewV4.tsx` + `web/src/components/views/CompanyOverview.tsx` 的 KPI 数字

**对照截图**:
- `01-home.png` 顶部 4 KPI 数字字号 ~52px(实际 44px,偏小)
- `02-dashboard.png` 同样

**改法**:全部 KPI 大数字 `text-[44px]` → `text-[52px]`(或对应 Tailwind `text-5xl` ≈ 48px,推荐用具体值)。`font-weight` 保持 bold。

**验收**:截图对照 01 / 02 两张,KPI 数字视觉大小**接近**截图(差异 ≤ 4px)。

---

## I4. Composer @/slash 补全真接通(NEED_FIX #3)

**位置**:Composer 组件(应该是 ChannelView 或 HomeViewV4 里嵌的 tiptap)

**现状**:`@tiptap/extension-mention` 装了但没配 suggestion provider

**改法**:
- `@` 触发:列出当前频道所有 member(`channel.members` 的 user 列表),包括 AI 助手
- `/` 触发:列 5-8 个 slash 命令(`/build` `/review` `/ship` `/note` `/task`),选中后插入对应模板文字或切换 phase

**示例代码骨架**:
```ts
const mentionExt = Mention.configure({
  HTMLAttributes: { class: 'mention' },
  suggestion: {
    items: ({ query }) =>
      members
        .filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5),
    render: () => ({ /* 弹出菜单实现,可借鉴 tiptap 官方 examples/CommandsMenu */ }),
  },
})
```

**验收**:浏览器在 composer 输入 `@` 出现 member 补全菜单(键盘 ↑↓ + Enter 选中),输入 `/` 出现 slash 命令菜单。**截图为证**存 `docs/ai/screens/v4-actual-i/composer-mention.png` + `composer-slash.png`。

**借鉴**:可读 `https://github.com/ueberdosis/tiptap/tree/main/demos/src/Examples/CommandsMenu` 抄结构,文件顶部加 `// Inspired by tiptap CommandsMenu example (MIT)`。

---

## I5. 模板 seed(NEED_FIX #4)

**位置**:`server/prisma/seed-demo.ts`(跟 I1 一起做)+ `web/src/components/views/HomeViewV4.tsx` 主页模板网格

**改法**:
- 后端:seed-demo.ts 里 seed 4-6 个 Template(假设有 Template 表或 templates.ts;若没有就直接在前端 mock,但**前端 mock 必须存到 `web/src/lib/templates.ts` 真文件**,不是组件内嵌)
- 模板内容举例:
  - "做一个网页:简洁 todo 列表(单文件 HTML)"
  - "做一份 PRD:含 MVP 范围 / 用户故事 / 验收"
  - "做一个 React 组件:含 props / variant / states"
  - "写一份周报:近 7 天 done + 阻塞 + 下周计划"
- 主页模板网格点击 → 预填 composer + 弹"选择项目"对话框

**验收**:主页看到 4-6 张真实模板卡(不是空 placeholder),点一张能预填 composer。

---

## I6. Editor 文件树真接通(NEED_FIX #5)

**位置**:`web/src/components/workspace/AssistantWorkspace.tsx`(editor tab)+ `server/src/index.ts` 加 `GET /api/sandbox-runs/:id/files` 端点

**改法**:
- 后端:`GET /api/sandbox-runs/:id/files` 返回当前频道最新 sandbox 的 workspace 目录树(JSON 嵌套),用 `fs.readdir` 递归读
- 前端 EditorPanel:`react-arborist` 接 API 返回的树结构,点节点 → 拉文件内容(已有 `/api/sandbox-runs/:id/preview/:path` 复用)→ Monaco 显示
- 没沙盒时显示空状态"派工后才有沙盒文件"

**验收**:派工跑出 sandbox 后,点 editor tab,左侧文件树真显示 sandbox 目录结构(不是空 placeholder)。

---

## I7. 红线场景 α/β 二次验证

修完后必须**亲眼**跑一次:

- **场景 α**:新建项目频道(或用 seed 的 pixel-2)→ composer 输入 "做一个 Button 组件,3 个 variant" → preview tab iframe 真渲染 → editor tab 真看到沙盒文件树 → Delivery Card 出现
- **场景 β**:点 sidebar 或公司全景里的 AI 名字 → 跳 Agent profile,不创建 DM

两条都 PASS 才算 Phase I 真完成。

---

## I8. 三构建 + commit + push

```bash
pnpm -C server build
pnpm -C web exec tsc --noEmit
pnpm -C web build
git add -A
git commit -m "Phase I: 修 5 个 NEED_FIX + 借鉴 OD(seed:demo + /api/health)"
git push origin main
```

---

## I9. 写 V4_PHASE_I_REVIEW.md

诚实评估:
- 5 个 NEED_FIX 状态(每条 PASS / 仍 NEED_FIX)
- 2 个 OD 借鉴状态(seed:demo / health)
- 3+ 张新截图对照差异点
- 红线 α/β 验收结果
- 末行 `FINAL_VERDICT: PASS` 或 `NEED_FIX(转 Phase J 的 N 个)`

---

## 不要做的(本轮范围外)

- **MCP 服务器接入** — v4.2 战略,本轮不动
- **SKILL.md 加载** — v4.2 战略,本轮不动
- **CLI 模块** — v4.2 战略,本轮不动
- **`heliox://` 协议头** — v5 远景,本轮不动
- **大改产品语义层**(项目频道 / A2A / Memory / Optimizer) — 都不动,只修视觉细节 + 数据 seed

---

## 立即开跑

```
按 docs/ai/current/V4_PHASE_I.md 严格执行 I1→I9。

5 个 NEED_FIX 全部要修:seed:demo-projects(I1)+ KPI 字号(I3)+ Composer @/slash(I4)+ 模板 seed(I5)+ Editor 文件树(I6)。
顺手加 2 个 OD 借鉴:seed:demo-projects(I1,跟 NEED_FIX 重合)+ /api/health(I2)。
每段完成 commit + push origin main。
完成后写 V4_PHASE_I_REVIEW.md,末行诚实 PASS 或 NEED_FIX。
假 PASS 作废从 36d9aa7 重做。
红线 α / β 必须再跑一次。
开始。
```
