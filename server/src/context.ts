// v3 G4 — buildProjectContext:所有 AI 行动入口的统一上下文构建。
// 替代旧 buildA2AContext;按 L1(systemPrompt)→ L2(project memory)→ 项目元 → L3(episodic)
// → 近期消息 → 当前 task/delivery → trigger message 顺序装配,总 token 受 maxTokens 约束。
// 同时返回 whyJson:本次决策用了多少 L2/L3、近期消息几条,作为可解释性数据(v2 whyJson 链条延续)。
import { prisma } from './db.js'
import type { ChatMsg } from './ai.js'
import { loadMemories } from './memory.js'

// 一个保守的字符→token 比例(中文 1.6 chars/token,英文 4 chars/token,取中位 ~2.5)。
// 不引入 tokenizer 依赖;粗略足够避免远超 LLM context window。
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 2.5)
}

function clampToTokens(s: string, maxTokens: number): { text: string; truncated: boolean } {
  const tk = estimateTokens(s)
  if (tk <= maxTokens) return { text: s, truncated: false }
  // 按比例从尾部截断(L2 老内容更靠尾;L3 prepend 新内容在头)
  const ratio = maxTokens / tk
  const cutLen = Math.max(0, Math.floor(s.length * ratio) - 60)
  return { text: s.slice(0, cutLen) + '\n…(超出 token 预算被截断)', truncated: true }
}

export type ProjectContextInput = {
  agentId: string
  channelId: string
  triggerMessageId?: string | null
  maxTokens?: number
  recentMessages?: number // 历史窗口(默认 20)
}

export type ProjectContextOutput = {
  messages: ChatMsg[]
  whyJson: string
  stats: {
    l1Chars: number
    l2Chars: number
    l3Chars: number
    metaChars: number
    recentMessageCount: number
    triggerChars: number
    totalEstimatedTokens: number
    truncated: string[] // 哪些段被截断了
  }
}

const DEFAULT_MAX_TOKENS = 6000
const DEFAULT_RECENT = 20

export async function buildProjectContext(input: ProjectContextInput): Promise<ProjectContextOutput> {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS
  const recentN = input.recentMessages ?? DEFAULT_RECENT

  // 1) L1 角色:User.systemPrompt(若是 AI 助手)
  const agent: any = await prisma.user.findUnique({ where: { id: input.agentId } })
  const l1 = (agent?.systemPrompt as string | null) ?? ''

  // 2) L2 + L3 记忆
  const { l2, l3 } = await loadMemories(input.agentId, input.channelId)

  // 3) 项目元(Channel.goal / phase / scope / owner.name / deadline)
  const channel: any = await prisma.channel.findUnique({
    where: { id: input.channelId },
    include: { owner: { select: { name: true } } },
  })
  const meta = (() => {
    if (!channel) return ''
    const parts: string[] = []
    if (channel.kind) parts.push(`类型:${channel.kind}`)
    if (channel.goal) parts.push(`目标:${channel.goal}`)
    if (channel.phase) parts.push(`当前阶段:${channel.phase}`)
    if (channel.scope) parts.push(`范围:${channel.scope}`)
    if (channel.owner?.name) parts.push(`负责人:${channel.owner.name}`)
    if (channel.deadline) parts.push(`截止:${new Date(channel.deadline).toISOString().slice(0, 10)}`)
    if (parts.length === 0) return ''
    return `# 项目元信息(频道 #${channel.name})\n${parts.join(' · ')}`
  })()

  // 4) 当前 task/delivery 状态(取该频道最近一个 active task + 最近一个 pending delivery)
  const activeTask: any = await prisma.task.findFirst({
    where: { channelId: input.channelId, status: { in: ['todo', 'doing', 'review'] } },
    orderBy: { updatedAt: 'desc' },
  })
  const pendingDelivery: any = activeTask
    ? await prisma.delivery.findFirst({
        where: { taskId: activeTask.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      })
    : null
  const stateLine = (() => {
    const parts: string[] = []
    if (activeTask) parts.push(`当前任务:「${activeTask.title}」(${activeTask.status})`)
    if (pendingDelivery)
      parts.push(`待审批交付:「${pendingDelivery.title}」(${pendingDelivery.testResult ?? '未跑测试'})`)
    return parts.length ? `# 当前状态\n${parts.join('\n')}` : ''
  })()

  // 5) 近期消息(去掉 trigger 自己 + 软删 + 排除 L3 已经覆盖的非常老消息)
  const triggerMsg: any = input.triggerMessageId
    ? await prisma.message.findUnique({
        where: { id: input.triggerMessageId },
        include: { author: { select: { name: true, isAssistant: true } } },
      })
    : null
  const history: any[] = await prisma.message.findMany({
    where: {
      channelId: input.channelId,
      deletedAt: null,
      id: { not: input.triggerMessageId ?? undefined },
    },
    orderBy: { createdAt: 'desc' },
    take: recentN,
    include: { author: { select: { name: true, isAssistant: true } } },
  })
  history.reverse() // 时间正序进 LLM

  // 6) 装配
  const truncated: string[] = []
  const msgs: ChatMsg[] = []

  // 6a) L1 + L2 + 项目元 合并成 system prompt(避免多 system 消息)
  const systemParts: string[] = []
  if (l1) {
    const clamped = clampToTokens(l1, Math.floor(maxTokens * 0.25))
    if (clamped.truncated) truncated.push('L1')
    systemParts.push(`# L1 角色\n${clamped.text}`)
  }
  if (l2?.content) {
    const clamped = clampToTokens(l2.content, Math.floor(maxTokens * 0.35))
    if (clamped.truncated) truncated.push('L2')
    systemParts.push(clamped.text) // L2 已自带 markdown 标题
  }
  if (meta) systemParts.push(meta)
  if (l3?.content) {
    const clamped = clampToTokens(l3.content, Math.floor(maxTokens * 0.2))
    if (clamped.truncated) truncated.push('L3')
    systemParts.push(clamped.text)
  }
  if (stateLine) systemParts.push(stateLine)
  if (systemParts.length) msgs.push({ role: 'system', content: systemParts.join('\n\n---\n\n') })

  // 6b) 历史消息(role=user/assistant)
  for (const m of history) {
    msgs.push({
      role: m.author?.isAssistant ? 'assistant' : 'user',
      content: m.author?.name ? `[${m.author.name}] ${m.body}` : m.body,
    })
  }

  // 6c) trigger 消息(若指定)
  if (triggerMsg) {
    msgs.push({
      role: triggerMsg.author?.isAssistant ? 'assistant' : 'user',
      content: triggerMsg.author?.name ? `[${triggerMsg.author.name}] ${triggerMsg.body}` : triggerMsg.body,
    })
  }

  const stats = {
    l1Chars: l1.length,
    l2Chars: l2?.content.length ?? 0,
    l3Chars: l3?.content.length ?? 0,
    metaChars: meta.length,
    recentMessageCount: history.length,
    triggerChars: triggerMsg?.body?.length ?? 0,
    totalEstimatedTokens: estimateTokens(msgs.map((m) => m.content).join('\n')),
    truncated,
  }

  const whyJson = JSON.stringify({
    reason: 'project_context_build',
    agentId: input.agentId,
    channelId: input.channelId,
    triggerMessageId: input.triggerMessageId ?? null,
    used: {
      l1: !!l1,
      l2: !!l2,
      l3: !!l3,
      projectMeta: !!meta,
      activeTask: !!activeTask,
      pendingDelivery: !!pendingDelivery,
    },
    stats,
  })

  return { messages: msgs, whyJson, stats }
}
