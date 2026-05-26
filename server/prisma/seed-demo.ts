// K1 seed:demo-projects — 让启动后有真数据看效果。
// 不清空 DB:幂等 upsert,频道按 name 找,已存在就跳过(避免覆盖用户改动)。
// 数据对齐 docs/ai/reference/v4-opendesign-screens/01-home.png + 03-project-pixel2-preview.png。
//
// 用法: pnpm -C server seed:demo
//
// 会 seed:
// - 4 个项目频道:pixel-2 / invoice-flow / q3-positioning / incident-2026-05-20
// - 3 个讨论频道:strategy-q3 / random / all-hands
// - 4 个 AI 助手 + 4 条私信(Aria 设计 / Cypher 工程 / Foster 产品 / Marlow 研究)
// - pixel-2 频道里若干截图原文消息 + 1 张进度卡 (progress_card)
// - 6 条 AuditEvent(主页右辅栏「今日动态」)

import { PrismaClient } from '@prisma/client'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve as pathResolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const prisma = new PrismaClient()

// Phase J/N6:种子里要写真沙盒文件,根目录 = server/(env HELIO_ROOT 覆盖)
const __filename = fileURLToPath(import.meta.url)
const SERVER_ROOT = process.env.HELIO_ROOT || pathResolve(dirname(__filename), '..')

// 时间锚:用「相对于今天」的时间,生成的消息看起来像今天发的
const TODAY = new Date()
function todayAt(h: number, m: number) {
  const d = new Date(TODAY)
  d.setHours(h, m, 0, 0)
  return d
}

// ---------- 真人 + AI ----------
const REAL_USERS = [
  { handle: 'kyle', name: 'Kyle', avatarColor: 5, status: '老板' },
]
const ASSISTANTS = [
  {
    handle: 'aria',
    name: 'Aria',
    avatarColor: 2, // 橙色
    role: '设计师 AI',
    systemPrompt: '你是 Aurora Labs 的 Design AI,擅长设计系统、token 治理、可交互组件。',
    skills: ['write_file', 'run_command', 'browser_open'],
  },
  {
    handle: 'cypher',
    name: 'Cypher',
    avatarColor: 6, // 青色
    role: '工程师 AI',
    systemPrompt: '你是高级软件工程师 Cypher,熟悉 React/TypeScript/构建系统。',
    skills: ['write_file', 'run_command', 'generate_pptx', 'run_sql'],
  },
  {
    handle: 'foster',
    name: 'Foster',
    avatarColor: 10, // 紫色
    role: '产品 AI',
    systemPrompt: '你是产品经理 Foster,擅长把模糊需求拆成可写的产品定义。',
    skills: [],
  },
  {
    handle: 'marlow',
    name: 'Marlow',
    avatarColor: 3, // 黄色
    role: '研究 AI',
    systemPrompt: '你是市场 / 用户研究专家 Marlow,擅长联网调研、对比分析。',
    skills: ['fetch_url', 'run_command'],
  },
  // 附加几个截图里 Optimizer / Lex / Mast / Atlas / IK,做 sidebar 段落数据
  {
    handle: 'lex',
    name: 'Lex',
    avatarColor: 4,
    role: '内容 AI',
    systemPrompt: '你是内容 / 文案 / 对外口径审查的内容专家 Lex。',
    skills: [],
  },
  {
    handle: 'mast',
    name: 'Mast',
    avatarColor: 11,
    role: '财务 AI',
    systemPrompt: '你是财务 / 报表 / 流水核对的 AI Mast。',
    skills: ['run_command'],
  },
  {
    handle: 'atlas',
    name: 'Atlas',
    avatarColor: 7,
    role: '运维 AI',
    systemPrompt: '你是 SRE / 运维 / 故障应急的 AI Atlas。',
    skills: ['run_command'],
  },
  {
    handle: 'ik',
    name: 'Ikon',
    avatarColor: 1,
    role: '视觉 AI',
    systemPrompt: '你是视觉 / 海报 / icon 设计 AI Ikon。',
    skills: ['write_file'],
  },
]

// ---------- 频道 ----------
type ProjectSeed = {
  name: string
  goal: string
  phase: 'discovery' | 'build' | 'review' | 'ship' | 'maintenance'
  ownerHandle: string // 实际只用作展示;系统 ownerId 必填字段
  members: string[] // user handles
}
const PROJECTS: ProjectSeed[] = [
  {
    name: 'pixel-2',
    goal:
      '把 Aurora 产品的组件库从 Figma 单源迁到 tokens.json + TypeScript 双源,目标本月内全量收口。',
    phase: 'build',
    ownerHandle: 'aria',
    members: ['kyle', 'aria', 'cypher', 'ik', 'lex'],
  },
  {
    name: 'invoice-flow',
    goal: '把开票链路从手工 Excel 迁到自动化:抓发票号 → 校验 → 入账。',
    phase: 'build',
    ownerHandle: 'mast',
    members: ['kyle', 'mast', 'cypher', 'foster'],
  },
  {
    name: 'q3-positioning',
    goal: '为 Q3 大客户做对外一句话定位,先 3 个方向给 Marketing。',
    phase: 'discovery',
    ownerHandle: 'foster',
    members: ['kyle', 'foster', 'lex', 'marlow'],
  },
  {
    name: 'incident-2026-05-20',
    goal: '事故复盘:2026-05-20 数据流断流 47min,给出修复方案 + 防再发 SOP。',
    phase: 'review',
    ownerHandle: 'atlas',
    members: ['kyle', 'atlas', 'cypher'],
  },
]

const DISCUSSIONS = [
  { name: 'strategy-q3', topic: 'Q3 战略讨论' },
  { name: 'random', topic: '摸鱼' },
  { name: 'all-hands', topic: '全员同步' },
]

async function upsertUser(u: {
  handle: string
  name: string
  avatarColor: number
  status?: string
  isAssistant?: boolean
  systemPrompt?: string
  skills?: string[]
}) {
  return prisma.user.upsert({
    where: { handle: u.handle },
    update: {},
    create: {
      handle: u.handle,
      name: u.name,
      avatarColor: u.avatarColor,
      status: u.status ?? '',
      isAssistant: !!u.isAssistant,
      systemPrompt: u.systemPrompt ?? null,
      skills: u.skills ? JSON.stringify(u.skills) : null,
      autoRespond: true,
    },
  })
}

async function ensureChannel(args: {
  name: string
  topic?: string
  kind?: 'project' | 'discussion'
  goal?: string
  phase?: string
  ownerId?: string
  isDM?: boolean
  memberIds: string[]
}) {
  const existing = await prisma.channel.findFirst({ where: { name: args.name } })
  if (existing) return existing
  return prisma.channel.create({
    data: {
      name: args.name,
      topic: args.topic ?? null,
      isDM: !!args.isDM,
      kind: args.kind ?? null,
      goal: args.goal ?? null,
      phase: args.phase ?? null,
      ownerId: args.ownerId ?? null,
      startedAt: args.kind === 'project' ? new Date() : null,
      members: { create: args.memberIds.map((id) => ({ userId: id })) },
    },
  })
}

async function ensureDM(uidA: string, uidB: string) {
  // DM 用「同时含这两人 + isDM=true + 仅 2 人」匹配
  const candidates = await prisma.channel.findMany({
    where: { isDM: true, members: { every: { userId: { in: [uidA, uidB] } } } },
    include: { members: true },
  })
  const found = candidates.find(
    (c) => c.members.length === 2 && c.members.every((m) => m.userId === uidA || m.userId === uidB),
  )
  if (found) return found
  return prisma.channel.create({
    data: {
      name: '',
      isDM: true,
      members: { create: [{ userId: uidA }, { userId: uidB }] },
    },
  })
}

async function postMessageOnce(channelId: string, authorId: string, body: string, opts: {
  createdAt?: Date
  type?: string
  cardJson?: string
} = {}) {
  // 幂等性:同频道 + 同 author + 同 body 已存在则跳过
  const exists = await prisma.message.findFirst({
    where: { channelId, authorId, body },
    select: { id: true },
  })
  if (exists) return exists
  return prisma.message.create({
    data: {
      channelId,
      authorId,
      body,
      type: opts.type ?? null,
      cardJson: opts.cardJson ?? null,
      createdAt: opts.createdAt ?? new Date(),
    },
  })
}

async function postAuditOnce(args: {
  type: string
  actorId?: string | null
  summary: string
  createdAt: Date
}) {
  const exists = await prisma.auditEvent.findFirst({
    where: { type: args.type, summary: args.summary },
    select: { id: true },
  })
  if (exists) return
  await prisma.auditEvent.create({
    data: {
      type: args.type,
      actorId: args.actorId ?? null,
      summary: args.summary,
      createdAt: args.createdAt,
    },
  })
}

async function main() {
  console.log('[seed:demo] starting…')

  // 1. 真人 + AI
  const kyle = await upsertUser({
    handle: 'kyle',
    name: 'Kyle',
    avatarColor: 5,
    status: '老板',
  })
  const aiByHandle: Record<string, { id: string; name: string }> = {}
  for (const a of ASSISTANTS) {
    const u = await upsertUser({
      handle: a.handle,
      name: a.name,
      avatarColor: a.avatarColor,
      status: a.role,
      isAssistant: true,
      systemPrompt: a.systemPrompt,
      skills: a.skills,
    })
    aiByHandle[a.handle] = { id: u.id, name: u.name }
  }
  console.log(`[seed:demo] users: kyle + ${Object.keys(aiByHandle).length} 个 AI 已就绪`)

  // 2. 项目频道
  const projectChannels: Record<string, string> = {}
  for (const p of PROJECTS) {
    const ownerId = aiByHandle[p.ownerHandle]?.id ?? kyle.id
    const memberIds = p.members
      .map((h) => (h === 'kyle' ? kyle.id : aiByHandle[h]?.id))
      .filter((x): x is string => !!x)
    const ch = await ensureChannel({
      name: p.name,
      kind: 'project',
      goal: p.goal,
      phase: p.phase,
      ownerId,
      memberIds,
    })
    projectChannels[p.name] = ch.id
  }

  // 3. 讨论频道(全员)
  const allUserIds = [kyle.id, ...Object.values(aiByHandle).map((a) => a.id)]
  for (const d of DISCUSSIONS) {
    await ensureChannel({
      name: d.name,
      topic: d.topic,
      kind: 'discussion',
      memberIds: allUserIds,
    })
  }

  // 4. 私信(kyle 跟 Aria/Cypher/Foster/Marlow 各 1 条)
  const dmPrompts: Array<[string, string]> = [
    ['aria', '收到。我把 pixel-2 的 button 子树拆成 4 个子任务,先动 button。'],
    ['cypher', '我看完 PR #847 了,destructive 色阶我帮你过一遍 contrast。'],
    ['foster', '对外一句话我想用「让团队像一个人一样思考」做第二稿。'],
    ['marlow', '上周开票流水跑完了,差异项 0 件。'],
  ]
  for (const [handle, body] of dmPrompts) {
    const ai = aiByHandle[handle]
    if (!ai) continue
    const dm = await ensureDM(kyle.id, ai.id)
    await postMessageOnce(dm.id, ai.id, body)
  }

  // 5. pixel-2 频道里 seed 截图原文消息 + 1 张进度卡(让 #pixel-2 打开就有内容)
  const pixel2Id = projectChannels['pixel-2']
  if (pixel2Id) {
    const aria = aiByHandle['aria']
    await postMessageOnce(
      pixel2Id,
      kyle.id,
      '把 button 的所有圆角统一到 8px,所有 size 变体都跟齐;同时把 destructive 的色阶往左挪一档,现在太"喊"了。@aria 接一下。',
      { createdAt: todayAt(9, 42) },
    )
    if (aria) {
      await postMessageOnce(
        pixel2Id,
        aria.id,
        '收到。我把这条拆成 4 个子任务,先动 button、再动 input、IconButton、SegmentedControl。预计 25 分钟一组。',
        { createdAt: todayAt(9, 43) },
      )
      // 进度卡 card
      const progressCard = {
        kind: 'progress_card',
        phase: 'build',
        assignedTo: 'cypher',
        leftLabel: '本阶段任务',
        leftValue: '14 / 22',
        leftPercent: 64,
        rightLabel: 'TOKEN 改动',
        rightValue: '+38 / -12',
        rightPercent: 72,
        leftDetail:
          '较 9:00 推进 3 个 · button 子树 11/14 已合,剩 IconButton hover、focus-visible、disabled。',
        rightDetail:
          'radius / color / spacing 三组生成完成。Marketing 口径已 ping @lex 等回。',
      }
      await postMessageOnce(
        pixel2Id,
        aria.id,
        '进度推进 · Build 阶段',
        {
          createdAt: todayAt(10, 8),
          type: 'progress_card',
          cardJson: JSON.stringify(progressCard),
        },
      )
    }
  }

  // Phase J/N6:pixel-2 频道补一条真 Delivery + SandboxRun + index.html,
  // preview tab 通过 /api/sandbox-runs/:id/preview 真 iframe 显示(替代写死 JSX)。
  // 注:pixel2Id 也供后续语句使用(避免 lint unused)。
  const pixel2ChannelId = projectChannels['pixel-2']
  if (pixel2ChannelId) {
    void pixel2ChannelId
    const ariaUser = aiByHandle['aria']
    // 幂等:如果已经 seed 过(taskId 标记)就跳过
    const existed = await prisma.delivery.findFirst({
      where: { title: 'Button · v2 设计稿', taskId: `seed:pixel-2-button-v2` },
    })
    if (!existed) {
      // 1) 写真 HTML 到沙盒 workspace
      const sandboxRel = '.helio/sandboxes/pixel-2-demo'
      const workspaceAbs = pathResolve(SERVER_ROOT, sandboxRel, 'workspace')
      await mkdir(workspaceAbs, { recursive: true })
      const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Button · v2 — pixel-2</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 28px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; background: #fafaf8; color: #18181b; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 700; }
  .sub { font-size: 11.5px; color: #8a8a8a; margin-bottom: 22px; }
  .label { font-size: 9.5px; font-weight: 500; letter-spacing: 0.2em; color: #999; text-transform: uppercase; margin: 18px 0 8px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  button.demo { font: inherit; font-weight: 500; border-radius: 8px; padding: 7px 12px; border: 1px solid transparent; cursor: pointer; transition: filter .15s; }
  button.demo:hover { filter: brightness(0.96); }
  button.demo.primary { background: #fafaf3; color: #1c1c1c; }
  button.demo.accent { background: #f5b942; color: #1c1c1c; }
  button.demo.secondary { background: #2a2a2a; color: #f5f5f5; }
  button.demo.ghost { background: transparent; color: #1c1c1c; border-color: #d9d9d4; }
  button.demo.destructive { background: transparent; color: #c4453a; border: 1px solid #e6a8a3; }
  button.demo.sm { padding: 4px 10px; font-size: 11.5px; }
  button.demo.md { padding: 7px 12px; font-size: 12.5px; }
  button.demo.lg { padding: 10px 16px; font-size: 14px; }
  button.demo[disabled] { opacity: 0.4; cursor: not-allowed; }
  button.icon { width: 36px; height: 36px; border-radius: 8px; border: 1px solid #d9d9d4; background: #f1f1ee; font-size: 14px; padding: 0; }
</style></head>
<body>
  <h1>Button · v2</h1>
  <div class="sub">由 Cypher 于 10:08 提交 PR #847 · 圆角统一 8px · destructive 色阶 ↓ 6%</div>

  <div class="label">VARIANTS</div>
  <div class="row">
    <button class="demo primary">Primary</button>
    <button class="demo accent">Accent</button>
    <button class="demo secondary">Secondary</button>
    <button class="demo ghost">Ghost</button>
    <button class="demo destructive">Destructive</button>
  </div>

  <div class="label">SIZES</div>
  <div class="row">
    <button class="demo primary sm">小</button>
    <button class="demo primary md">中</button>
    <button class="demo primary lg">大</button>
  </div>

  <div class="label">STATES</div>
  <div class="row">
    <button class="demo primary">默认</button>
    <button class="demo primary" disabled>禁用</button>
    <button class="demo primary">⟳ 加载中</button>
    <button class="demo primary" style="outline: 2px solid #f5b942; outline-offset: 2px;">Focus</button>
  </div>

  <div class="label">ICONBUTTON (SUBSET)</div>
  <div class="row">
    <button class="icon">☀</button>
    <button class="icon">📋</button>
    <button class="icon">🔍</button>
  </div>

  <script>
    document.querySelectorAll('button.demo, button.icon').forEach(btn => {
      btn.addEventListener('click', () => {
        const label = btn.textContent.trim()
        btn.style.transition = 'transform .12s'
        btn.style.transform = 'scale(0.96)'
        setTimeout(() => { btn.style.transform = '' }, 120)
        console.log('[Button v2 demo] click:', label)
      })
    })
  </script>
</body></html>
`
      const htmlAbs = pathResolve(workspaceAbs, 'index.html')
      await writeFile(htmlAbs, html, 'utf8')

      // 2) 建 SandboxRun(状态 ready_for_review,便于真 preview 路由解析)
      const sb = await prisma.sandboxRun.create({
        data: {
          taskRunId: `seed:pixel-2-button-v2:taskrun`,
          taskId: `seed:pixel-2-button-v2`,
          mode: 'copy',
          rootPath: pathResolve(SERVER_ROOT, sandboxRel),
          workspacePath: workspaceAbs,
          status: 'ready_for_review',
          networkPolicy: 'allow_public_get',
          changedFiles: JSON.stringify([{ path: 'index.html', status: 'added' }]),
          diffSummary: '1 file, +90 -0',
          buildResult: 'pass',
          createdById: ariaUser?.id ?? kyle.id,
        },
      })
      // 3) 建 SandboxArtifact (web_preview)
      await prisma.sandboxArtifact.create({
        data: {
          sandboxRunId: sb.id,
          kind: 'web_preview',
          path: 'index.html',
          summary: 'Button v2 demo 静态预览',
          metadataJson: JSON.stringify({
            kind: 'static_html',
            entry: 'index.html',
            previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
            files: ['index.html'],
          }),
        },
      })
      // 4) 建 Delivery 指向这个真沙盒
      const artifact = {
        kind: 'interactive',
        previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
        openUrl: `/api/sandbox-runs/${sb.id}/preview`,
        entry: 'index.html',
        sandboxRunId: sb.id,
        files: ['index.html'],
        screenshots: [],
        buildResult: 'pass',
      }
      await prisma.delivery.create({
        data: {
          title: 'Button · v2 设计稿',
          summary:
            '把 Button 组件 v2 的 5 个 variants + 3 个 sizes + 4 个 states + IconButton 子集做出来,圆角统一 8px,destructive 色阶 ↓ 6%。可点交互,console 无报错。',
          artifactJson: JSON.stringify(artifact),
          testResult: 'pass',
          riskLevel: 'low',
          status: 'pending',
          createdById: ariaUser?.id ?? kyle.id,
          taskId: `seed:pixel-2-button-v2`,
          createdAt: todayAt(10, 8),
        },
      })
      console.log(`[seed:demo] pixel-2 Button v2 demo Delivery + sandbox(${sb.id}) ready`)
    }
  }

  // Phase K6:再补 2 条真 Delivery,让 Delivery Center 一上来就 ≥3 条
  // (validate "seed:demo Delivery ≥ 3" 验收指标)。
  // 5b) invoice-flow:开票流水报告(纯静态 HTML,无 sandbox 也可走 Delivery)
  {
    const invoiceCh = projectChannels['invoice-flow']
    const mastUser = aiByHandle['mast']
    if (invoiceCh && mastUser) {
      const existed = await prisma.delivery.findFirst({
        where: { title: '本周开票流水报告', taskId: 'seed:invoice-flow-weekly' },
      })
      if (!existed) {
        const sandboxRel = '.helio/sandboxes/invoice-flow-demo'
        const workspaceAbs = pathResolve(SERVER_ROOT, sandboxRel, 'workspace')
        await mkdir(workspaceAbs, { recursive: true })
        const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>开票流水周报 — invoice-flow</title>
<style>
  body { margin:0; padding:28px 32px; font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif; color:#18181b; background:#fafaf8; }
  h1 { margin:0 0 4px; font-size:22px; }
  .sub { font-size:11.5px; color:#8a8a8a; margin-bottom:22px; }
  .kpi-row { display:flex; gap:16px; margin-bottom:24px; }
  .kpi { flex:1; padding:14px 16px; border:1px solid #e4e4e0; border-radius:8px; background:#fff; }
  .kpi .label { font-size:10px; color:#999; text-transform:uppercase; letter-spacing:0.16em; }
  .kpi .value { font-size:24px; font-weight:600; margin-top:4px; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e4e4e0; border-radius:8px; overflow:hidden; }
  th, td { padding:8px 12px; font-size:12px; text-align:left; border-bottom:1px solid #ececec; }
  th { background:#f5f5f0; font-weight:600; color:#666; }
  tr:last-child td { border-bottom:none; }
</style></head><body>
<h1>本周开票流水报告</h1>
<div class="sub">Mast 自动跑完 · 差异项 0 件 · 5-21 ~ 5-27</div>
<div class="kpi-row">
  <div class="kpi"><div class="label">流水总数</div><div class="value">1,284</div></div>
  <div class="kpi"><div class="label">总金额(万)</div><div class="value">¥386.5</div></div>
  <div class="kpi"><div class="label">差异项</div><div class="value">0</div></div>
</div>
<table>
  <thead><tr><th>客户</th><th>发票号</th><th>金额</th><th>状态</th></tr></thead>
  <tbody>
    <tr><td>Aurora Labs</td><td>INV-2026-0521</td><td>¥48,200</td><td>已入账</td></tr>
    <tr><td>Heliox Cloud</td><td>INV-2026-0522</td><td>¥126,800</td><td>已入账</td></tr>
    <tr><td>Pixel Co.</td><td>INV-2026-0524</td><td>¥38,500</td><td>已入账</td></tr>
    <tr><td>Veno Studio</td><td>INV-2026-0526</td><td>¥172,000</td><td>已入账</td></tr>
  </tbody>
</table>
</body></html>`
        const htmlAbs = pathResolve(workspaceAbs, 'index.html')
        await writeFile(htmlAbs, html, 'utf8')
        const sb = await prisma.sandboxRun.create({
          data: {
            taskRunId: 'seed:invoice-flow-weekly:taskrun',
            taskId: 'seed:invoice-flow-weekly',
            mode: 'copy',
            rootPath: pathResolve(SERVER_ROOT, sandboxRel),
            workspacePath: workspaceAbs,
            status: 'ready_for_review',
            networkPolicy: 'allow_public_get',
            changedFiles: JSON.stringify([{ path: 'index.html', status: 'added' }]),
            diffSummary: '1 file, +52 -0',
            buildResult: 'pass',
            createdById: mastUser.id,
          },
        })
        await prisma.sandboxArtifact.create({
          data: {
            sandboxRunId: sb.id,
            kind: 'web_preview',
            path: 'index.html',
            summary: '开票流水周报静态预览',
            metadataJson: JSON.stringify({
              kind: 'static_html',
              entry: 'index.html',
              previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
              files: ['index.html'],
            }),
          },
        })
        await prisma.delivery.create({
          data: {
            title: '本周开票流水报告',
            summary: 'Mast 自动跑完上周开票流水 · 流水 1,284 笔 / 总额 ¥386.5 万 / 差异项 0 件,已入账明细表见预览。',
            artifactJson: JSON.stringify({
              kind: 'interactive',
              previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
              openUrl: `/api/sandbox-runs/${sb.id}/preview`,
              entry: 'index.html',
              sandboxRunId: sb.id,
              files: ['index.html'],
              screenshots: [],
              buildResult: 'pass',
            }),
            testResult: 'pass',
            riskLevel: 'low',
            status: 'pending',
            createdById: mastUser.id,
            taskId: 'seed:invoice-flow-weekly',
            createdAt: todayAt(10, 2),
          },
        })
        console.log(`[seed:demo] invoice-flow weekly report Delivery + sandbox(${sb.id}) ready`)
      }
    }
  }

  // 5c) q3-positioning:对外一句话定位第二稿(纯文本 markdown 风渲染)
  {
    const q3Ch = projectChannels['q3-positioning']
    const fosterUser = aiByHandle['foster']
    const lexUser = aiByHandle['lex']
    if (q3Ch && fosterUser) {
      const existed = await prisma.delivery.findFirst({
        where: { title: 'Q3 对外一句话 · 第二稿', taskId: 'seed:q3-positioning-v2' },
      })
      if (!existed) {
        const sandboxRel = '.helio/sandboxes/q3-positioning-demo'
        const workspaceAbs = pathResolve(SERVER_ROOT, sandboxRel, 'workspace')
        await mkdir(workspaceAbs, { recursive: true })
        const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>Q3 对外一句话 — v2</title>
<style>
  body { margin:0; padding:48px 40px; font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif; color:#1c1c1c; background:#fafaf8; }
  .kicker { font-size:10.5px; text-transform:uppercase; letter-spacing:0.2em; color:#999; }
  h1 { font-size:28px; font-weight:600; line-height:1.4; margin:8px 0 6px; max-width:600px; }
  .stamp { display:inline-flex; gap:6px; align-items:center; margin-top:8px; padding:4px 10px; background:#fff7e0; border:1px solid #f5b942; border-radius:999px; font-size:11px; color:#8a5e00; }
  h2 { font-size:13px; margin:32px 0 8px; color:#666; }
  p { font-size:13px; line-height:1.7; color:#444; max-width:640px; }
  blockquote { margin:0; padding:14px 16px; background:#fff; border-left:3px solid #f5b942; border-radius:0 6px 6px 0; font-style:italic; color:#222; }
</style></head><body>
<div class="kicker">Q3 Positioning · External Brief</div>
<h1>让团队像一个人一样思考。</h1>
<div class="stamp">✓ Lex 已通过审核</div>
<h2>Why · 选这条理由</h2>
<p>Heliox 的核心命题不是「让 AI 干更多活」,而是「让团队对齐」。把多 Agent 协作的复杂性折叠成一句直觉:一个团队,一种思考。</p>
<h2>替代稿(已舍)</h2>
<blockquote>"把 12 个 AI 装进你的指挥中心。" — 太"工具",失感情温度。</blockquote>
<blockquote>"AI 团队,人类节奏。" — 节奏感对,但太抽象,不易传播。</blockquote>
</body></html>`
        const htmlAbs = pathResolve(workspaceAbs, 'index.html')
        await writeFile(htmlAbs, html, 'utf8')
        const sb = await prisma.sandboxRun.create({
          data: {
            taskRunId: 'seed:q3-positioning-v2:taskrun',
            taskId: 'seed:q3-positioning-v2',
            mode: 'copy',
            rootPath: pathResolve(SERVER_ROOT, sandboxRel),
            workspacePath: workspaceAbs,
            status: 'ready_for_review',
            networkPolicy: 'allow_public_get',
            changedFiles: JSON.stringify([{ path: 'index.html', status: 'added' }]),
            diffSummary: '1 file, +28 -0',
            buildResult: 'pass',
            createdById: fosterUser.id,
          },
        })
        await prisma.sandboxArtifact.create({
          data: {
            sandboxRunId: sb.id,
            kind: 'web_preview',
            path: 'index.html',
            summary: 'Q3 对外一句话 v2 预览',
            metadataJson: JSON.stringify({
              kind: 'static_html',
              entry: 'index.html',
              previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
              files: ['index.html'],
            }),
          },
        })
        await prisma.delivery.create({
          data: {
            title: 'Q3 对外一句话 · 第二稿',
            summary:
              'Foster 拿出第二稿:「让团队像一个人一样思考。」附 Why + 已舍的两条替代稿。' +
              (lexUser ? ' Lex 已审核通过。' : ''),
            artifactJson: JSON.stringify({
              kind: 'interactive',
              previewUrl: `/api/sandbox-runs/${sb.id}/preview`,
              openUrl: `/api/sandbox-runs/${sb.id}/preview`,
              entry: 'index.html',
              sandboxRunId: sb.id,
              files: ['index.html'],
              screenshots: [],
              buildResult: 'pass',
            }),
            testResult: 'pass',
            riskLevel: 'low',
            status: 'pending',
            createdById: fosterUser.id,
            taskId: 'seed:q3-positioning-v2',
            createdAt: todayAt(11, 30),
          },
        })
        console.log(`[seed:demo] q3-positioning v2 Delivery + sandbox(${sb.id}) ready`)
      }
    }
  }

  // 6. 今日动态(AuditEvent — 主页右辅栏数据源)
  const optimizerActor = aiByHandle['atlas']?.id ?? kyle.id
  const audits: Array<{ type: string; actor?: string; summary: string; at: Date }> = [
    {
      type: 'optimizer.suggested',
      actor: optimizerActor,
      summary:
        'Optimizer 提议:营销部本周 42h,瓶颈在文案审查 — 要不要交给 AI 审? #optimize',
      at: todayAt(14, 22),
    },
    {
      type: 'delivery.created',
      actor: aiByHandle['aria']?.id,
      summary: 'Aria 完成了 pixel-2 的 token 迁移 PR · 已浏览器验证',
      at: todayAt(13, 48),
    },
    {
      type: 'incident.waiting',
      actor: aiByHandle['atlas']?.id,
      summary: 'incident-2026-05-20 卡在等你拍板 — Atlas 给了两种修方案',
      at: todayAt(12, 10),
    },
    {
      type: 'review.passed',
      actor: aiByHandle['lex']?.id,
      summary: 'Lex 通过了 q3-positioning 的对外一句话第二稿',
      at: todayAt(11, 30),
    },
    {
      type: 'task.finished',
      actor: aiByHandle['mast']?.id,
      summary: 'Mast 跑完了上周开票流水,差异项 0 件',
      at: todayAt(10, 2),
    },
    {
      type: 'optimizer.archived',
      actor: optimizerActor,
      summary: 'Optimizer 自动归档了 7 条无人响应的私信',
      at: todayAt(9, 14),
    },
  ]
  for (const a of audits) {
    await postAuditOnce({
      type: a.type,
      actorId: a.actor ?? null,
      summary: a.summary,
      createdAt: a.at,
    })
  }

  console.log('[seed:demo] done.')
  console.log(`  · projects: ${Object.keys(projectChannels).join(' / ')}`)
  console.log(`  · discussions: ${DISCUSSIONS.map((d) => d.name).join(' / ')}`)
  console.log(`  · DMs (kyle↔AI): ${dmPrompts.length}`)
  console.log(`  · audit events: ${audits.length}`)
}

main()
  .catch((e) => {
    console.error('[seed:demo]', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
