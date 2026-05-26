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

const prisma = new PrismaClient()

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
    skills: ['write_file', 'run_command'],
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
