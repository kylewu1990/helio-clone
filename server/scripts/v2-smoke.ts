// v2 Algorithm Graph — smoke 验证脚本(纯 Prisma,不依赖 LLM)
// 3 个场景:
//   A) 单任务交付 → 人接受
//   B) A2A 评审链(AI_A 交付 → AI_B review)
//   C) Optimizer 主动建议(造一个 backdate PendingInput → 调 optimizerScan 真实生成建议消息)
// 完成后查 DB 校验 Edge / Why / autonomy / optimizer_suggestion 真实存在。
//
// 运行:HELIO_NO_LISTEN=1 pnpm -C server exec tsx scripts/v2-smoke.ts
import { prisma } from '../src/db.js'
import { optimizerScan } from '../src/index.js'

const log = (...args: unknown[]) => console.log('[smoke]', ...args)
const ok = (m: string) => log('  ✓', m)
const fail = (m: string) => {
  log('  ✗', m)
  process.exitCode = 1
}

async function ensureUser(opts: { handle: string; name: string; isAssistant: boolean; color?: number }) {
  const existing = await prisma.user.findUnique({ where: { handle: opts.handle } })
  if (existing) return existing
  return prisma.user.create({
    data: {
      handle: opts.handle,
      name: opts.name,
      avatarColor: opts.color ?? 1,
      isAssistant: opts.isAssistant,
    },
  })
}

async function ensureChannel(name: string, memberIds: string[]) {
  const existing = await prisma.channel.findFirst({ where: { name } })
  if (existing) return existing
  const ch = await prisma.channel.create({ data: { name, topic: 'v2 smoke 测试频道' } })
  for (const userId of memberIds) {
    await prisma.channelMember.create({ data: { channelId: ch.id, userId } })
  }
  return ch
}

// 直接复刻 server/index.ts 里的 writeEdge 逻辑(避免 import 触发 listen)
async function writeEdge(input: {
  channelId: string | null
  fromKind: string
  fromId: string
  toKind: string
  toId: string
  verb: string
  weight?: number | null
  why?: unknown
}) {
  return prisma.edge.create({
    data: {
      channelId: input.channelId,
      fromKind: input.fromKind,
      fromId: input.fromId,
      toKind: input.toKind,
      toId: input.toId,
      verb: input.verb,
      weight: input.weight ?? null,
      whyJson: input.why != null ? JSON.stringify(input.why) : null,
    },
  })
}

async function scenarioA(channelId: string, human: { id: string }, aiA: { id: string; name: string }) {
  log('— 场景 A: 单任务交付 ——————')
  const task = await prisma.task.create({
    data: {
      title: '做一个 todo 网页',
      status: 'todo',
      channelId,
      assigneeId: aiA.id,
      createdById: human.id,
      whyJson: JSON.stringify({ reason: 'user_goal', signals: ['关键词:网页', '单页面任务'] }),
    },
  })
  await writeEdge({
    channelId,
    fromKind: 'agent',
    fromId: human.id,
    toKind: 'task',
    toId: task.id,
    verb: 'assigns',
    why: { reason: 'scenarioA', mention: aiA.name },
  })
  await writeEdge({
    channelId,
    fromKind: 'task',
    fromId: task.id,
    toKind: 'agent',
    toId: aiA.id,
    verb: 'delegates',
    why: { reason: 'has_exec_skills' },
  })

  // 模拟 AI 完成 → Delivery
  const delivery = await prisma.delivery.create({
    data: {
      taskId: task.id,
      title: '可交互交付:做一个 todo 网页',
      summary: '生成静态 HTML + JS 实现 todo 增删',
      artifactJson: JSON.stringify({ kind: 'interactive', previewUrl: 'http://localhost:5373/preview/todo.html' }),
      testResult: 'pass',
      status: 'pending',
      createdById: aiA.id,
      whyJson: JSON.stringify({
        reason: 'task_succeeded',
        verifiedByBrowser: true,
        buildResult: 'pass',
        fileCount: 1,
        entry: 'todo.html',
      }),
    },
  })
  await writeEdge({
    channelId,
    fromKind: 'agent',
    fromId: aiA.id,
    toKind: 'delivery',
    toId: delivery.id,
    verb: 'delivers_to',
    why: { reason: 'task_succeeded' },
  })
  await writeEdge({
    channelId,
    fromKind: 'delivery',
    fromId: delivery.id,
    toKind: 'task',
    toId: task.id,
    verb: 'supplies',
    why: { reason: 'completes_task' },
  })
  // 模拟人接受
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: { status: 'approved', approvedById: human.id, approvedAt: new Date() },
  })
  await writeEdge({
    channelId,
    fromKind: 'agent',
    fromId: human.id,
    toKind: 'delivery',
    toId: delivery.id,
    verb: 'approves',
    why: { reason: 'human_accept' },
  })

  // 验证
  const edges = await prisma.edge.findMany({ where: { channelId } })
  const verbs = new Set(edges.map((e) => e.verb))
  ;['assigns', 'delegates', 'delivers_to', 'supplies', 'approves'].forEach((v) => {
    if (verbs.has(v)) ok(`Edge verb 存在:${v}`)
    else fail(`缺少 Edge verb:${v}`)
  })
  const taskRow = await prisma.task.findUnique({ where: { id: task.id } })
  if (taskRow?.whyJson) ok('Task.whyJson 真实写入')
  else fail('Task.whyJson 缺失')
  return { task, delivery }
}

async function scenarioB(
  channelId: string,
  ctx: { aiA: { id: string; name: string }; aiB: { id: string; name: string } },
  prev: { task: { id: string }; delivery: { id: string } },
) {
  log('— 场景 B: A2A 评审链 ——————')
  // 先写一条 delivery_card message 占位(server 端是这样;smoke 简化:直接造一条 message)
  const deliveryCardMsg = await prisma.message.create({
    data: {
      channelId,
      authorId: ctx.aiA.id,
      body: '[交付] 做一个 todo 网页',
      type: 'delivery_card',
      cardJson: JSON.stringify({
        kind: 'delivery',
        deliveryId: prev.delivery.id,
        title: '做一个 todo 网页',
        authorName: ctx.aiA.name,
      }),
    },
  })

  // AI_B 收到 @ → 写一条 a2a_response,intent=review
  const a2aResp = await prisma.message.create({
    data: {
      channelId,
      authorId: ctx.aiB.id,
      body: '我看了一下,有 2 个建议:1) 添加 localStorage 持久化;2) 按钮缺少 hover 状态',
      type: 'a2a_response',
      cardJson: JSON.stringify({
        kind: 'a2a_response',
        respondTo: ctx.aiA.name,
        respondToKind: 'delivery',
        respondToMessageId: deliveryCardMsg.id,
        intent: 'review',
      }),
      whyJson: JSON.stringify({
        reason: 'a2a_response',
        intent: 'review',
        triggerSnippet: '@ai-b 帮我 review 一下',
        keywords: ['review', '建议'],
      }),
    },
  })

  await writeEdge({
    channelId,
    fromKind: 'a2a_response',
    fromId: a2aResp.id,
    toKind: 'delivery',
    toId: deliveryCardMsg.id,
    verb: 'reviews',
    why: { reason: 'a2a_response', intent: 'review', keywords: ['review'] },
  })

  // 验证
  const edges = await prisma.edge.findMany({ where: { channelId, verb: 'reviews' } })
  if (edges.length > 0) ok('reviews 边写入')
  else fail('reviews 边缺失')
  const respMsg = await prisma.message.findUnique({ where: { id: a2aResp.id } })
  if (respMsg?.whyJson) {
    const why = JSON.parse(respMsg.whyJson) as { intent?: string }
    if (why.intent === 'review') ok('A2A whyJson.intent=review')
    else fail(`whyJson.intent 不对:${why.intent}`)
  } else {
    fail('A2A message.whyJson 缺失')
  }
}

async function scenarioC(channelId: string, ctx: { aiA: { id: string }; human: { id: string } }, prevTask: { id: string }) {
  log('— 场景 C: Optimizer 主动建议 ——————')
  // 造一个 backdate 的 PendingInput(60s 前)
  const backdate = new Date(Date.now() - 90_000)
  const pi = await prisma.pendingInput.create({
    data: {
      taskId: prevTask.id,
      assistantId: ctx.aiA.id,
      field: 'info',
      question: '需要确认 todo 的最大数量限制(50 / 100 / unlimited)',
      reason: 'AI 拆任务时缺关键约束',
      optionsJson: JSON.stringify([
        { label: '50', value: '50' },
        { label: '100', value: '100' },
        { label: 'unlimited', value: 'unlimited' },
      ]),
      recommended: 1,
      defaultValue: '100',
      allowCustom: true,
      createdAt: backdate,
    },
  })
  ok(`PendingInput 已 backdate 至 ${backdate.toISOString()}`)

  // 写 blocked_by 边
  await writeEdge({
    channelId,
    fromKind: 'task',
    fromId: prevTask.id,
    toKind: 'approval',
    toId: pi.id,
    verb: 'blocked_by',
    why: { reason: 'needs_input', question: pi.question.slice(0, 80) },
  })

  // 触发 optimizerScan
  await optimizerScan()

  const suggestion = await prisma.message.findFirst({
    where: { channelId, type: 'optimizer_suggestion' },
    orderBy: { createdAt: 'desc' },
  })
  if (suggestion) {
    ok('Optimizer 真实 post 了 optimizer_suggestion 消息')
    const card = suggestion.cardJson ? JSON.parse(suggestion.cardJson) : null
    if (card?.suggestionKind === 'pending_input_stale') ok(`suggestion.kind=${card.suggestionKind}`)
    if (card?.action?.type === 'skip_pending_input') ok(`action.type=${card.action.type}`)
    if (card?.why?.dataPoints?.length > 0) ok(`why.dataPoints 含 ${card.why.dataPoints.length} 条`)
    if (suggestion.whyJson) ok('message.whyJson 真实写入')
  } else {
    fail('Optimizer 未生成 optimizer_suggestion 消息')
  }
  // 验证 monitors 边
  const monitorEdges = await prisma.edge.findMany({ where: { channelId, verb: 'monitors' } })
  if (monitorEdges.length > 0) ok(`monitors 边 ${monitorEdges.length} 条`)
  else fail('monitors 边缺失')
}

async function summarizeGraph(channelId: string) {
  log('— Graph 汇总 ——————')
  const edges = await prisma.edge.findMany({ where: { channelId }, orderBy: { createdAt: 'asc' } })
  log(`  Edge 总数 ${edges.length}:`)
  const grouped = new Map<string, number>()
  for (const e of edges) grouped.set(e.verb, (grouped.get(e.verb) ?? 0) + 1)
  for (const [v, n] of grouped) log(`    ${v} × ${n}`)
}

async function main() {
  const startedAt = Date.now()
  // 清理上轮可能残留(同 handle 复用 user / 同 name 复用 channel)
  const human = await ensureUser({ handle: 'smoke-kyle', name: 'Kyle (smoke)', isAssistant: false, color: 5 })
  const aiA = await ensureUser({ handle: 'smoke-ai-a', name: 'Aria (smoke)', isAssistant: true, color: 2 })
  const aiB = await ensureUser({ handle: 'smoke-ai-b', name: 'Brio (smoke)', isAssistant: true, color: 3 })
  // 每次新建 channel(避免上轮数据干扰)
  const channelName = `v2-smoke-${Date.now()}`
  const channel = await ensureChannel(channelName, [human.id, aiA.id, aiB.id])
  log(`场景频道:#${channel.name} (${channel.id})`)

  const aRes = await scenarioA(channel.id, human, aiA)
  await scenarioB(channel.id, { aiA, aiB }, aRes)
  await scenarioC(channel.id, { aiA, human }, aRes.task)
  await summarizeGraph(channel.id)

  log(`完成,耗时 ${Date.now() - startedAt}ms。exitCode=${process.exitCode ?? 0}`)
  await prisma.$disconnect()
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => {
  console.error('[smoke-error]', e)
  process.exit(1)
})
