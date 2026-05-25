import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { mkdirSync, createWriteStream, statSync, readFileSync, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { resolve as pathResolve, extname, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn as ptySpawn } from 'node-pty'
import { prisma } from './db.js'
import {
  addClient,
  removeClient,
  sendToUsers,
  onlineUserIds,
} from './realtime.js'
import {
  canGenerate,
  generateReply,
  pickResponders,
  breakdownGoal,
  publicProviders,
  toolRoundsFor,
  type ChatMsg,
} from './ai.js'
import { ASSISTANT_PRESETS } from './presets.js'
import { skillCatalog, runTool } from './skills.js'
import { CAPABILITIES } from './permissions.js'
import {
  createSandboxRun,
  finalizeSandbox,
  failSandbox,
  applySandbox,
  discardSandbox,
  getSandboxByTaskRun,
  detectIsolation,
} from './sandbox.js'

// 显式加载 .env(Node 原生),确保 OPENAI_* 等变量在运行时可用
try {
  process.loadEnvFile()
} catch {
  /* .env 可选,缺失则用占位回复 */
}

const app = Fastify({ logger: false })
await app.register(cors, { origin: true, credentials: true })
await app.register(websocket)

// 文件上传:存到 server/uploads,经 /uploads 静态访问
const UPLOAD_DIR = pathResolve(process.cwd(), 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } })
await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/' })

// 内部自用:身份来自 x-user-id 头,无密码无登录
async function currentUser(req: FastifyRequest) {
  const id = req.headers['x-user-id']
  if (!id || typeof id !== 'string') return null
  return prisma.user.findUnique({ where: { id } })
}

async function memberIds(channelId: string) {
  const rows = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

async function unreadCount(channelId: string, userId: string) {
  const cursor = await prisma.readCursor.findUnique({
    where: { channelId_userId: { channelId, userId } },
  })
  let after: Date | null = null
  if (cursor?.lastReadMessageId) {
    const msg = await prisma.message.findUnique({
      where: { id: cursor.lastReadMessageId },
      select: { createdAt: true },
    })
    after = msg?.createdAt ?? null
  }
  return prisma.message.count({
    where: {
      channelId,
      authorId: { not: userId },
      ...(after ? { createdAt: { gt: after } } : {}),
    },
  })
}

const userPublic = {
  id: true,
  handle: true,
  name: true,
  avatarColor: true,
  status: true,
  isAssistant: true,
} as const

type RawReaction = { emoji: string; userId: string }
function groupReactions(rs: RawReaction[]) {
  const map = new Map<string, { emoji: string; count: number; userIds: string[] }>()
  for (const r of rs) {
    const e = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] }
    e.count++
    e.userIds.push(r.userId)
    map.set(r.emoji, e)
  }
  return [...map.values()]
}

// 把 prisma 消息(可带 reactions / replies)整形成前端用的形状
function shapeMessage(m: any) {
  const replies = (m.replies ?? []) as { author: any; createdAt: Date }[]
  const seen = new Set<string>()
  const participants: any[] = []
  for (const r of replies) {
    if (!seen.has(r.author.id)) {
      seen.add(r.author.id)
      participants.push(r.author)
    }
  }
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    parentId: m.parentId ?? null,
    body: m.deletedAt ? '' : m.body,
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    pinnedAt: m.pinnedAt ?? null,
    toolsUsed: parseSkills(m.toolsUsed),
    cededBy: parseSkills(m.cededBy),
    event: m.event
      ? {
          id: m.event.id,
          title: m.event.title,
          startsAt: m.event.startsAt,
          endsAt: m.event.endsAt,
          location: m.event.location,
          description: m.event.description,
        }
      : null,
    createdAt: m.createdAt,
    author: m.author,
    reactions: groupReactions((m.reactions ?? []) as RawReaction[]),
    replyCount: replies.length,
    lastReplyAt: replies.length ? replies[replies.length - 1].createdAt : null,
    replyParticipants: participants.slice(0, 3),
  }
}

async function channelIdOfMessage(messageId: string) {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  })
  return m?.channelId ?? null
}

async function reactionsOf(messageId: string) {
  const rs = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  })
  return groupReactions(rs)
}

// 从消息正文里解析 @ 提及,返回被提及的频道成员 id(排除作者)
async function extractMentions(
  channelId: string,
  body: string,
  authorId: string,
): Promise<string[]> {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, name: true, handle: true } } },
  })
  const low = body.toLowerCase()
  const ids = new Set<string>()
  for (const m of members) {
    const u = m.user
    if (u.id === authorId) continue
    if (
      low.includes('@' + u.handle.toLowerCase()) ||
      low.includes('@' + u.name.toLowerCase())
    )
      ids.add(u.id)
  }
  return [...ids]
}

function slugify(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'assistant'
}

const ASSISTANT_HISTORY = 40 // 助手上下文取最近条数
const MAX_ASSISTANT_DEPTH = 3 // 多助手互相 @ 的最大链深(防循环)

// 停止生成(硬刹车):按频道登记进行中的 LLM 请求,停止时全部中断 + 短期阻断后续触发
const genControllers = new Map<string, Set<AbortController>>()
const stopUntil = new Map<string, number>()
const STOP_BLOCK_MS = 6000 // 停止后阻断「后续助手 / 链式触发」的窗口
function registerGen(channelId: string): AbortController {
  const ctrl = new AbortController()
  const set = genControllers.get(channelId) ?? new Set<AbortController>()
  set.add(ctrl)
  genControllers.set(channelId, set)
  return ctrl
}
function unregisterGen(channelId: string, ctrl: AbortController) {
  genControllers.get(channelId)?.delete(ctrl)
}
function isStopped(channelId: string): boolean {
  return (stopUntil.get(channelId) ?? 0) > Date.now()
}
function stopChannelGen(channelId: string) {
  stopUntil.set(channelId, Date.now() + STOP_BLOCK_MS)
  const set = genControllers.get(channelId)
  if (set) {
    for (const c of set) c.abort()
    set.clear()
  }
}
const MAX_AUTO_RESPONDERS = 2 // 单条消息最多几个助手「主动」回(被 @ 的不计入此限)
const AUTO_COOLDOWN_MS = 8000 // 同一助手在同一频道两次「主动」回的最小间隔

// 主动响应的冷却记录(内存即可,重启清空无碍)
const lastAutoReplyAt = new Map<string, number>()
function autoOnCooldown(channelId: string, assistantId: string) {
  const t = lastAutoReplyAt.get(`${channelId}:${assistantId}`)
  return t != null && Date.now() - t < AUTO_COOLDOWN_MS
}

// 助手职责摘要(供路由判断):取 system prompt / status 首行
function personaOf(a: { systemPrompt?: string | null; status?: string | null }) {
  const src = (a.systemPrompt || a.status || '').trim()
  return src.split('\n')[0].slice(0, 120)
}

// 把助手的长期记忆拼进 system prompt(L2 记忆注入)
// 用 Claude 友好的 XML 标签 + 强制指令,防止模型「手握工具就不看设定去检索」
function withMemory(a: { systemPrompt?: string | null; memory?: string | null }) {
  const sp = a.systemPrompt || ''
  const mem = (a.memory || '').trim()
  if (!mem) return sp || null
  const block = [
    '<long_term_memory>',
    mem,
    '</long_term_memory>',
    '',
    '<critical_instruction>',
    '1. 回答任何问题前,必须先读取上面 <long_term_memory> 里的内容。',
    '2. 如果 <long_term_memory> 已经包含明确事实(如数据库选型、技术栈、团队约定、用户偏好),绝对禁止再调用 search_messages、fetch_url、list_channels 等任何工具去二次验证或检索 —— 直接基于记忆回答。',
    '3. 只有当记忆里确实没有相关信息时,才允许使用工具。',
    '</critical_instruction>',
  ].join('\n')
  return (sp ? sp + '\n\n' : '') + block
}

// 严格解析 @ 提及:必须带 @ 前缀,匹配 handle/name(中文 @ 后紧跟文字用 startsWith 兜底);
// 识别 @all/@所有人;返回被 @ 的成员 id(按 @ 出现顺序)、是否 @all、是否「定向」(消息含任何 @)。
// 收紧点:不再用裸名字匹配,避免「消息里提到某助手名字」就误触发它。
function parseMentions(
  rawBody: string,
  members: { id: string; handle: string; name: string }[],
): { orderedIds: string[]; all: boolean; directed: boolean } {
  const all = /@(all|everyone|所有人|大家)/i.test(rawBody)
  const tokens = (rawBody.match(/@([^\s@,，。、!！?？:：;；()（）]+)/g) || []).map((t) =>
    t.slice(1).toLowerCase(),
  )
  const directed = all || tokens.length > 0
  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (const tok of tokens) {
    for (const m of members) {
      if (seen.has(m.id)) continue
      const h = m.handle.toLowerCase()
      const n = m.name.toLowerCase()
      if (tok === h || tok === n || tok.startsWith(h) || tok.startsWith(n)) {
        orderedIds.push(m.id)
        seen.add(m.id)
      }
    }
  }
  return { orderedIds, all, directed }
}

// 收集上下文:话题串内取「父 + 回复」,否则取频道近 N 条顶层消息
async function buildHistory(
  channelId: string,
  parentId: string | null,
  assistantId: string,
): Promise<ChatMsg[]> {
  const msgs = await prisma.message.findMany({
    where: parentId
      ? { OR: [{ id: parentId }, { parentId }] }
      : { channelId, parentId: null },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: ASSISTANT_HISTORY,
  })
  msgs.reverse()
  return msgs.map((m) => ({
    role: m.authorId === assistantId ? 'assistant' : 'user',
    content: m.authorId === assistantId ? m.body : `${m.author.name}: ${m.body}`,
  }))
}

// 发消息后:让频道里的助手按需回复(私信必回,群频道被 @ 才回)
// 图像模型(如 gpt-image-2/dall-e):这类助手不对话,直接把消息当 prompt 画图
const isImageModel = (m?: string | null) => /image|dall-e/i.test(m || '')

async function maybeTriggerAssistants(
  channelId: string,
  trigger: {
    body: string
    parentId: string | null
    authorIsAssistant: boolean
    authorId?: string
    messageId?: string // 触发本次的消息(用于记录 cede「已读未回」)
  },
  depth = 0,
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { include: { user: true } } },
  })
  if (!channel) return

  const assistants = channel.members
    .map((m) => m.user)
    .filter((u) => u.isAssistant)
  if (assistants.length === 0) return

  const memberIdList = channel.members.map((m) => m.userId)
  const mentions = parseMentions(
    trigger.body,
    channel.members.map((m) => ({
      id: m.userId,
      handle: m.user.handle,
      name: m.user.name,
    })),
  )
  const assistantById = new Map(assistants.map((a) => [a.id, a]))

  // 被显式 @ 的助手(按 @ 出现顺序;@all/@所有人 = 频道内所有助手)
  const targetIds = mentions.all
    ? assistants.map((a) => a.id)
    : mentions.orderedIds.filter((id) => assistantById.has(id))

  // 主动响应:仅当「真人 + 群 + 顶层 + 整条消息没有任何 @」时才路由
  // (一旦 @ 了任何人——真人或 AI——即视为定向对话,未被点名的助手严格静默,不抢答)
  let routedIds = new Set<string>()
  if (
    !trigger.authorIsAssistant &&
    !channel.isDM &&
    !trigger.parentId &&
    !mentions.directed
  ) {
    const candidates = assistants.filter(
      (a) =>
        a.id !== trigger.authorId &&
        a.autoRespond &&
        !autoOnCooldown(channelId, a.id) &&
        // 没配 key/无可用端点的助手不主动跳出来(否则会主动刷降级提示);被 @ 时仍会提示配 key
        canGenerate({
          provider: a.provider,
          baseUrl: a.baseUrl,
          apiKey: a.apiKey,
          model: a.model,
        }),
    )
    if (candidates.length) {
      const authorName =
        channel.members.find((m) => m.userId === trigger.authorId)?.user.name ??
        '某人'
      const picked = await pickResponders({
        text: trigger.body,
        authorName,
        max: MAX_AUTO_RESPONDERS,
        candidates: candidates.map((a) => ({
          name: a.name,
          persona: personaOf(a),
          provider: a.provider,
          baseUrl: a.baseUrl,
          apiKey: a.apiKey,
          model: a.model,
        })),
      })
      routedIds = new Set(picked.map((i) => candidates[i].id))

      // cede 透明:被评估但没被选中的助手 = 已读但选择不回,记到触发消息上
      const cededNames = candidates
        .filter((c) => !routedIds.has(c.id))
        .map((c) => c.name)
      if (cededNames.length && trigger.messageId) {
        const updated = await prisma.message
          .update({
            where: { id: trigger.messageId },
            data: { cededBy: JSON.stringify(cededNames) },
            include: fullMessageInclude,
          })
          .catch(() => null)
        if (updated)
          sendToUsers(memberIdList, {
            type: 'message-updated',
            channelId,
            message: shapeMessage(updated),
          })
      }
    }
  }

  // 最终回复名单(有序、去重、排除作者本人):
  // - DM:对方助手必回
  // - 群·真人发:被 @ 的助手(强信号,绕过开关/冷却/key) + 主动路由选中的(按此先后)
  // - 群·助手发:仅被 @ 的助手,且受链深限制(多助手协作防循环)
  let responderIds: string[]
  if (channel.isDM) {
    responderIds = assistants.map((a) => a.id)
  } else if (trigger.authorIsAssistant) {
    responderIds = depth < MAX_ASSISTANT_DEPTH ? targetIds : []
  } else {
    responderIds = [...targetIds, ...routedIds]
  }
  const dedup = new Set<string>()
  responderIds = responderIds.filter(
    (id) =>
      id !== trigger.authorId &&
      assistantById.has(id) &&
      !dedup.has(id) &&
      (dedup.add(id), true),
  )

  // 按名单依次(串行)生成,保证发言顺序、互不覆盖
  for (const rid of responderIds) {
    if (isStopped(channelId)) break // 硬刹车:已停止则不再生成后续助手
    const a = assistantById.get(rid)!
    // 助手工作状态(替代单调的「正在输入」):开始→思考、工具→调用、结束→清空
    const sendStatus = (status: string) =>
      sendToUsers(memberIdList, {
        type: 'assistant-status',
        channelId,
        userId: a.id,
        status,
      })
    sendStatus('正在思考…')

    // 用 try/finally 保证无论成功失败都清空工作状态,避免前端卡在「正在思考」
    try {
      const skills = parseSkills(a.skills)
      const history = await buildHistory(channelId, trigger.parentId, a.id)

      const broadcastNew = (message: any) => {
        if (trigger.parentId) {
          sendToUsers(memberIdList, {
            type: 'thread-reply',
            channelId,
            parentId: trigger.parentId,
            message,
          })
        } else {
          sendToUsers(memberIdList, { type: 'message', channelId, message })
        }
      }

      // 助手回复若 @ 了别的助手,继续触发(多助手协作,受链深限制)
      const chainTrigger = (text: string) => {
        if (isStopped(channelId)) return // 已停止则不再链式触发后续助手
        void maybeTriggerAssistants(
          channelId,
          {
            body: text,
            parentId: trigger.parentId,
            authorIsAssistant: true,
            authorId: a.id,
          },
          depth + 1,
        ).catch((e) => console.error('[assistant-chain]', e))
      }

      // 成功生成回复后再记冷却(失败/降级不应占用冷却窗口)
      const markCooldown = () => {
        if (routedIds.has(a.id))
          lastAutoReplyAt.set(`${channelId}:${a.id}`, Date.now())
      }

      // 画图机:model 是图像模型(如 gpt-image-2)的助手不走对话,直接拿触发消息当 prompt 用该模型画图
      if (isImageModel(a.model)) {
        const dctrl = registerGen(channelId)
        const body = await runTool(
          'generate_image',
          { prompt: trigger.body },
          { baseUrl: a.baseUrl, apiKey: a.apiKey, imageModel: a.model },
        )
        unregisterGen(channelId, dctrl)
        const created = await prisma.message.create({
          data: {
            channelId,
            authorId: a.id,
            body,
            parentId: trigger.parentId,
            toolsUsed: JSON.stringify(['generate_image']),
          },
          include: fullMessageInclude,
        })
        broadcastNew(shapeMessage(created))
        markCooldown()
        continue
      }

      // 统一:占位消息 → 流式逐块填充 → 定稿(记录 toolsUsed/eventId)。无工具直接流式,有工具最终回答也流式。
      const placeholder = await prisma.message.create({
        data: { channelId, authorId: a.id, body: '', parentId: trigger.parentId },
        include: fullMessageInclude,
      })
      broadcastNew(shapeMessage(placeholder))

      const genCtrl = registerGen(channelId)
      const { text, toolsUsed, eventId } = await generateReply({
        provider: a.provider,
        baseUrl: a.baseUrl,
        apiKey: a.apiKey,
        systemPrompt: withMemory(a),
        model: a.model,
        skills,
        signal: genCtrl.signal,
        ctx: {
          channelId,
          userId: a.id,
          baseUrl: a.baseUrl,
          apiKey: a.apiKey,
          model: a.model,
        },
        messages: history,
        onDelta: (chunk) =>
          sendToUsers(memberIdList, {
            type: 'message-chunk',
            channelId,
            messageId: placeholder.id,
            chunk,
          }),
        onStatus: (s) => sendStatus(s),
      })
      unregisterGen(channelId, genCtrl)

      const finalMsg = await prisma.message.update({
        where: { id: placeholder.id },
        data: {
          body: text,
          toolsUsed: JSON.stringify(toolsUsed),
          eventId: eventId ?? null, // 助手用 create_event 时,这条回复即该事件的日历卡片
        },
        include: fullMessageInclude,
      })
      sendToUsers(memberIdList, {
        type: 'message-updated',
        channelId,
        message: shapeMessage(finalMsg),
      })
      if (Array.isArray(toolsUsed) && toolsUsed.length > 0) {
        await writeAudit({
          type: 'ai.tool_call',
          summary: `${a.name} 调用工具:${toolsUsed.join('、')}`,
          actorId: a.id,
          payload: { tools: toolsUsed },
        })
        broadcastWorkspace()
      }
      markCooldown()
      chainTrigger(text)
    } catch (e) {
      console.error('[assistant-reply]', e)
    } finally {
      sendStatus('')
    }
  }
}

// ---- 当前用户 ----
app.get('/api/me', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  // 投影:即使当前身份是助手,也不泄露 apiKey/systemPrompt/memory 等敏感字段
  return {
    id: me.id,
    handle: me.handle,
    name: me.name,
    avatarColor: me.avatarColor,
    status: me.status,
    isAssistant: me.isAssistant,
  }
})

// ---- 全部用户(供身份切换 / 发起私信)----
app.get('/api/users', async () => {
  return prisma.user.findMany({ select: userPublic, orderBy: { name: 'asc' } })
})

// ---- 上传文件/图片 ----
app.post('/api/upload', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const file = await req.file()
  if (!file) return reply.code(400).send({ error: 'no file' })
  const ext = extname(file.filename || '').toLowerCase()
  const stored = randomUUID() + ext
  await pipeline(file.file, createWriteStream(pathResolve(UPLOAD_DIR, stored)))
  const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(ext)
  return { url: `/uploads/${stored}`, name: file.filename || 'file', isImage }
})

const assistantSelect = {
  ...userPublic,
  autoRespond: true,
  systemPrompt: true,
  memory: true,
  provider: true,
  baseUrl: true,
  apiKey: true,
  model: true,
  skills: true,
  createdById: true,
  memberships: {
    select: { channelId: true, channel: { select: { isDM: true } } },
  },
} as const

function parseSkills(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

// 绝不把 apiKey 明文返回前端;skills 转数组;附带所在频道
function shapeAssistant(a: any) {
  const { apiKey, skills, memberships, ...rest } = a
  const channelIds = (memberships ?? [])
    .filter((m: any) => m.channel && !m.channel.isDM)
    .map((m: any) => m.channelId)
  return {
    ...rest,
    hasApiKey: !!apiKey,
    skills: parseSkills(skills),
    channelIds,
  }
}

// ---- AI 助手:预设职业目录 ----
app.get('/api/assistant-presets', async () => ASSISTANT_PRESETS)

// ---- AI 助手:技能目录 ----
app.get('/api/skills', async () => skillCatalog())

// ---- AI 助手:可用供应商(不含密钥)----
app.get('/api/providers', async () => publicProviders())

// ---- AI 助手:列表 ----
app.get('/api/assistants', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const list = await prisma.user.findMany({
    where: { isAssistant: true },
    select: assistantSelect,
    orderBy: { createdAt: 'asc' },
  })
  return list.map(shapeAssistant)
})

// ---- AI 助手:创建(自动加入所有群频道,便于 @ 调用)----
app.post('/api/assistants', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const {
    name,
    handle,
    systemPrompt,
    provider,
    baseUrl,
    apiKey,
    model,
    skills,
    channelIds,
    avatarColor,
    autoRespond,
    memory,
  } = (req.body ?? {}) as {
    name?: string
    handle?: string
    systemPrompt?: string
    provider?: string
    baseUrl?: string
    apiKey?: string
    model?: string
    skills?: string[]
    channelIds?: string[]
    avatarColor?: number
    autoRespond?: boolean
    memory?: string
  }
  if (!name?.trim()) return reply.code(400).send({ error: 'name required' })

  // 生成唯一 handle:全中文名时直接用名字本身,避免变成 assistant
  const slug = slugify(name)
  const wanted = (
    handle?.trim() || (slug === 'assistant' ? name.trim() : slug)
  ).replace(/^@/, '')
  let unique = wanted
  let i = 1
  while (await prisma.user.findUnique({ where: { handle: unique } })) {
    unique = `${wanted}-${i++}`
  }

  const assistant = await prisma.user.create({
    data: {
      handle: unique,
      name: name.trim(),
      avatarColor: avatarColor ?? 9,
      isAssistant: true,
      autoRespond: autoRespond ?? true,
      systemPrompt: systemPrompt?.trim() || null,
      memory: memory?.trim() || null,
      provider: provider?.trim() || null,
      baseUrl: baseUrl?.trim() || null,
      apiKey: apiKey?.trim() || null,
      model: model?.trim() || null,
      skills: JSON.stringify(Array.isArray(skills) ? skills : []),
      status: 'AI 助手',
      createdById: me.id,
    },
    select: assistantSelect,
  })

  const allChannels = await prisma.channel.findMany({
    where: { isDM: false },
    select: { id: true },
  })
  const allIds = allChannels.map((c) => c.id)
  const joinIds = Array.isArray(channelIds)
    ? allIds.filter((id) => channelIds.includes(id))
    : allIds
  if (joinIds.length) {
    await prisma.channelMember.createMany({
      data: joinIds.map((cid) => ({ channelId: cid, userId: assistant.id })),
    })
  }
  return shapeAssistant(assistant)
})

// ---- AI 助手:编辑(留空的 apiKey 表示不改)----
app.patch('/api/assistants/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing?.isAssistant)
    return reply.code(404).send({ error: 'not an assistant' })

  const b = (req.body ?? {}) as {
    name?: string
    systemPrompt?: string
    provider?: string
    baseUrl?: string
    apiKey?: string
    model?: string
    skills?: string[]
    channelIds?: string[]
    avatarColor?: number
    autoRespond?: boolean
    memory?: string
  }
  const data: Record<string, unknown> = {}
  if (b.name?.trim()) data.name = b.name.trim()
  if (b.avatarColor != null) data.avatarColor = b.avatarColor
  if (b.autoRespond !== undefined) data.autoRespond = !!b.autoRespond
  if (b.memory !== undefined) data.memory = b.memory.trim() || null
  if (b.systemPrompt !== undefined) data.systemPrompt = b.systemPrompt.trim() || null
  if (b.provider !== undefined) data.provider = b.provider.trim() || null
  if (b.baseUrl !== undefined) data.baseUrl = b.baseUrl.trim() || null
  if (b.model !== undefined) data.model = b.model.trim() || null
  if (b.skills !== undefined)
    data.skills = JSON.stringify(Array.isArray(b.skills) ? b.skills : [])
  // apiKey:未提供或空字符串 => 保持不变;非空 => 更新
  if (b.apiKey != null && b.apiKey.trim()) data.apiKey = b.apiKey.trim()

  await prisma.user.update({ where: { id }, data })

  // 改频道:diff 非私信频道成员
  if (b.channelIds !== undefined) {
    const current = await prisma.channelMember.findMany({
      where: { userId: id, channel: { isDM: false } },
      select: { channelId: true },
    })
    const cur = new Set(current.map((c) => c.channelId))
    const want = new Set(b.channelIds)
    const toAdd = [...want].filter((c) => !cur.has(c))
    const toRemove = [...cur].filter((c) => !want.has(c))
    for (const cid of toAdd) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: cid, userId: id } },
        create: { channelId: cid, userId: id },
        update: {},
      })
    }
    if (toRemove.length) {
      await prisma.channelMember.deleteMany({
        where: { userId: id, channelId: { in: toRemove } },
      })
    }
  }

  const fresh = await prisma.user.findUnique({
    where: { id },
    select: assistantSelect,
  })
  return shapeAssistant(fresh)
})

// ---- AI 助手:删除 ----
app.delete('/api/assistants/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const a = await prisma.user.findUnique({ where: { id } })
  if (!a?.isAssistant) return reply.code(404).send({ error: 'not an assistant' })
  // 先删掉该助手参与的私信频道,避免留下孤儿 DM
  const dmMems = await prisma.channelMember.findMany({
    where: { userId: id, channel: { isDM: true } },
    select: { channelId: true },
  })
  if (dmMems.length) {
    await prisma.channel.deleteMany({
      where: { id: { in: dmMems.map((m) => m.channelId) } },
    })
  }
  await prisma.user.delete({ where: { id } })
  return { ok: true }
})

// ---- 我的频道 + 私信列表 ----
app.get('/api/channels', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })

  const memberships = await prisma.channelMember.findMany({
    where: { userId: me.id },
    include: {
      channel: {
        include: {
          members: { include: { user: { select: userPublic } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })

  const list = await Promise.all(
    memberships.map(async (m) => {
      const c = m.channel
      const peer = c.isDM
        ? c.members.find((mem) => mem.userId !== me.id)?.user ?? null
        : null
      return {
        id: c.id,
        name: c.isDM ? peer?.name ?? '私信' : c.name,
        topic: c.topic,
        isDM: c.isDM,
        isPrivate: c.isPrivate,
        archived: !!c.archivedAt,
        peer,
        memberCount: c.members.length,
        unread: await unreadCount(c.id, me.id),
        lastMessageAt: c.messages[0]?.createdAt ?? c.createdAt,
      }
    }),
  )

  list.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  )
  return list
})

// ---- 新建频道(默认拉入所有人,内部团队场景)----
app.post('/api/channels', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { name, topic } = (req.body ?? {}) as { name?: string; topic?: string }
  if (!name?.trim()) return reply.code(400).send({ error: 'name required' })

  const everyone = await prisma.user.findMany({ select: { id: true } })
  const channel = await prisma.channel.create({
    data: {
      name: name.trim().replace(/^#/, ''),
      topic: topic?.trim() || null,
      isDM: false,
      members: { create: everyone.map((u) => ({ userId: u.id })) },
    },
  })
  sendToUsers(everyone.map((u) => u.id), {
    type: 'channel-created',
    channelId: channel.id,
  })
  return channel
})

// ---- 打开 / 创建私信 ----
app.post('/api/dms', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { userId } = (req.body ?? {}) as { userId?: string }
  if (!userId) return reply.code(400).send({ error: 'userId required' })

  const mine = await prisma.channelMember.findMany({
    where: { userId: me.id, channel: { isDM: true } },
    select: { channelId: true },
  })
  const existing = await prisma.channelMember.findFirst({
    where: { userId, channelId: { in: mine.map((c) => c.channelId) } },
    select: { channelId: true },
  })
  if (existing) return { id: existing.channelId }

  const members =
    userId === me.id ? [me.id] : [me.id, userId] // 自己跟自己的笔记本
  const channel = await prisma.channel.create({
    data: {
      name: '',
      isDM: true,
      members: { create: members.map((id) => ({ userId: id })) },
    },
  })
  return { id: channel.id }
})

// ---- 频道详情 ----
app.get('/api/channels/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const c = await prisma.channel.findUnique({
    where: { id },
    include: { members: { include: { user: { select: userPublic } } } },
  })
  if (!c) return reply.code(404).send({ error: 'not found' })
  const peer = c.isDM
    ? c.members.find((m) => m.userId !== me.id)?.user ?? null
    : null
  const pinnedRows = await prisma.message.findMany({
    where: { channelId: id, pinnedAt: { not: null }, deletedAt: null },
    include: {
      author: { select: userPublic },
      reactions: { select: { emoji: true, userId: true } },
    },
    orderBy: { pinnedAt: 'desc' },
    take: 20,
  })
  return {
    id: c.id,
    name: c.isDM ? peer?.name ?? '私信' : c.name,
    topic: c.topic,
    isDM: c.isDM,
    isPrivate: c.isPrivate,
    archived: !!c.archivedAt,
    peer,
    members: c.members.map((m) => m.user),
    pinned: pinnedRows.map(shapeMessage),
  }
})

// ---- 频道:编辑(名称/主题/私有/归档)----
app.patch('/api/channels/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as {
    name?: string
    topic?: string
    isPrivate?: boolean
    archived?: boolean
  }
  const data: Record<string, unknown> = {}
  if (b.name?.trim()) data.name = b.name.trim().replace(/^#/, '')
  if (b.topic !== undefined) data.topic = b.topic.trim() || null
  if (b.isPrivate !== undefined) data.isPrivate = !!b.isPrivate
  if (b.archived !== undefined) data.archivedAt = b.archived ? new Date() : null
  await prisma.channel.update({ where: { id }, data })
  const members = await memberIds(id)
  sendToUsers(members, { type: 'channel-updated', channelId: id })
  return { ok: true }
})

// ---- 频道:加成员 ----
app.post('/api/channels/:id/members', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { userId } = (req.body ?? {}) as { userId?: string }
  if (!userId) return reply.code(400).send({ error: 'userId required' })
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId: id, userId } },
    create: { channelId: id, userId },
    update: {},
  })
  sendToUsers(await memberIds(id), { type: 'channel-updated', channelId: id })
  return { ok: true }
})

// ---- 频道:移除成员 ----
app.delete('/api/channels/:id/members/:userId', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id, userId } = req.params as { id: string; userId: string }
  const members = await memberIds(id) // 移除前的成员(含被移除者,便于通知)
  await prisma.channelMember
    .delete({ where: { channelId_userId: { channelId: id, userId } } })
    .catch(() => {})
  sendToUsers(members, { type: 'channel-updated', channelId: id })
  return { ok: true }
})

// ---- 频道:删除(硬删,级联删消息/成员/事件;任务 channelId 置空)----
app.delete('/api/channels/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const members = await memberIds(id)
  await prisma.channel.delete({ where: { id } }).catch(() => {})
  sendToUsers(members, { type: 'channel-deleted', id })
  return { ok: true }
})

// ---- 事件:删除(硬删事件 + 连带其日历卡片消息)----
app.delete('/api/events/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const ev = await prisma.event.findUnique({
    where: { id },
    include: { cards: { select: { id: true } } },
  })
  if (!ev) return reply.code(404).send({ error: 'not found' })
  const members = await memberIds(ev.channelId)
  const cardIds = ev.cards.map((c) => c.id)
  if (cardIds.length)
    await prisma.message.deleteMany({ where: { id: { in: cardIds } } })
  await prisma.event.delete({ where: { id } }).catch(() => {})
  sendToUsers(members, {
    type: 'event-deleted',
    channelId: ev.channelId,
    id,
    cardIds,
  })
  sendToUsers(members, { type: 'channel-updated', channelId: ev.channelId })
  return { ok: true }
})

// ---- 停止生成(频道级硬刹车:中断进行中的 AI 生成 + 短期阻断后续)----
app.post('/api/channels/:id/stop', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  stopChannelGen(id)
  // 清空该频道所有助手工作状态,前端立即停止显示「正在思考」
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: { members: { include: { user: true } } },
  })
  if (channel) {
    const members = channel.members.map((m) => m.userId)
    for (const m of channel.members)
      if (m.user.isAssistant)
        sendToUsers(members, {
          type: 'assistant-status',
          channelId: id,
          userId: m.userId,
          status: '',
        })
  }
  return { ok: true }
})

// ---- 消息:固定/取消固定 ----
app.post('/api/messages/:id/pin', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const m = await prisma.message.findUnique({ where: { id } })
  if (!m) return reply.code(404).send({ error: 'not found' })
  const updated = await prisma.message.update({
    where: { id },
    data: { pinnedAt: m.pinnedAt ? null : new Date() },
    include: fullMessageInclude,
  })
  const members = await memberIds(m.channelId)
  sendToUsers(members, {
    type: 'message-updated',
    channelId: m.channelId,
    message: shapeMessage(updated),
  })
  sendToUsers(members, { type: 'channel-updated', channelId: m.channelId })
  return { ok: true }
})

// ---- 历史消息(仅顶层,含反应与话题串摘要)----
app.get('/api/channels/:id/messages', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const messages = await prisma.message.findMany({
    where: { channelId: id, parentId: null },
    include: {
      author: { select: userPublic },
      reactions: { select: { emoji: true, userId: true } },
      event: true,
      replies: {
        select: { createdAt: true, author: { select: userPublic } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return messages.map(shapeMessage)
})

// ---- 话题串:父消息 + 全部回复 ----
app.get('/api/messages/:id/thread', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const parent = await prisma.message.findUnique({
    where: { id },
    include: {
      author: { select: userPublic },
      reactions: { select: { emoji: true, userId: true } },
      event: true,
    },
  })
  if (!parent) return reply.code(404).send({ error: 'not found' })
  const replies = await prisma.message.findMany({
    where: { parentId: id },
    include: {
      author: { select: userPublic },
      reactions: { select: { emoji: true, userId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return { parent: shapeMessage(parent), replies: replies.map(shapeMessage) }
})

// ---- 发消息(parentId 存在即为话题串回复)----
app.post('/api/channels/:id/messages', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { body, parentId } = (req.body ?? {}) as {
    body?: string
    parentId?: string
  }
  if (!body?.trim()) return reply.code(400).send({ error: 'empty' })

  const created = await prisma.message.create({
    data: {
      channelId: id,
      authorId: me.id,
      body: body.trim(),
      parentId: parentId ?? null,
    },
    include: {
      author: { select: userPublic },
      reactions: { select: { emoji: true, userId: true } },
    },
  })
  const message = shapeMessage(created)
  const members = await memberIds(id)
  if (parentId) {
    sendToUsers(members, {
      type: 'thread-reply',
      channelId: id,
      parentId,
      message,
    })
  } else {
    sendToUsers(members, { type: 'message', channelId: id, message })
  }

  // @ 提及落库 + 通知被提及者(收件箱)
  const mentionedIds = await extractMentions(id, body.trim(), me.id)
  if (mentionedIds.length) {
    await prisma.mention.createMany({
      data: mentionedIds.map((uid) => ({
        messageId: created.id,
        userId: uid,
        channelId: id,
      })),
    })
    sendToUsers(mentionedIds, { type: 'inbox', userId: me.id })
  }

  // 异步:让频道里的助手按需回复(不阻塞本次响应)
  void maybeTriggerAssistants(id, {
    body: body.trim(),
    parentId: parentId ?? null,
    authorIsAssistant: me.isAssistant,
    authorId: me.id,
    messageId: created.id,
  }).catch((e) => console.error('[assistant]', e))

  return message
})

// ---- 反应:切换(同 emoji 再点取消)----
app.post('/api/messages/:id/reactions', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { emoji } = (req.body ?? {}) as { emoji?: string }
  if (!emoji) return reply.code(400).send({ error: 'emoji required' })

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId: id, userId: me.id, emoji } },
  })
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } })
  } else {
    await prisma.reaction.create({
      data: { messageId: id, userId: me.id, emoji },
    })
  }

  const channelId = await channelIdOfMessage(id)
  const reactions = await reactionsOf(id)
  if (channelId) {
    const members = await memberIds(channelId)
    sendToUsers(members, {
      type: 'reaction',
      channelId,
      messageId: id,
      reactions,
    })
  }
  return { reactions }
})

const fullMessageInclude = {
  author: { select: userPublic },
  reactions: { select: { emoji: true, userId: true } },
  event: true,
  replies: {
    select: { createdAt: true, author: { select: userPublic } },
    orderBy: { createdAt: 'asc' as const },
  },
}

// ---- 编辑消息(仅作者)----
app.patch('/api/messages/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { body } = (req.body ?? {}) as { body?: string }
  if (!body?.trim()) return reply.code(400).send({ error: 'empty' })
  const m = await prisma.message.findUnique({ where: { id } })
  if (!m) return reply.code(404).send({ error: 'not found' })
  if (m.authorId !== me.id) return reply.code(403).send({ error: 'not author' })
  if (m.deletedAt) return reply.code(400).send({ error: 'deleted' })

  const updated = await prisma.message.update({
    where: { id },
    data: { body: body.trim(), editedAt: new Date() },
    include: fullMessageInclude,
  })
  const message = shapeMessage(updated)
  sendToUsers(await memberIds(m.channelId), {
    type: 'message-updated',
    channelId: m.channelId,
    message,
  })
  return message
})

// ---- 删除消息(硬删,内部自用不限作者;级联删话题串回复)----
app.delete('/api/messages/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const m = await prisma.message.findUnique({ where: { id } })
  if (!m) return reply.code(404).send({ error: 'not found' })
  const members = await memberIds(m.channelId)
  await prisma.message.delete({ where: { id } }) // 级联删 replies
  sendToUsers(members, {
    type: 'message-deleted',
    channelId: m.channelId,
    id,
    parentId: m.parentId ?? null,
  })
  sendToUsers(members, { type: 'channel-updated', channelId: m.channelId })
  return { ok: true }
})

// ---- 批量删除消息(硬删)----
app.post('/api/messages/bulk-delete', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { ids } = (req.body ?? {}) as { ids?: string[] }
  if (!Array.isArray(ids) || !ids.length)
    return reply.code(400).send({ error: 'ids required' })
  const msgs = await prisma.message.findMany({
    where: { id: { in: ids } },
    select: { id: true, channelId: true },
  })
  await prisma.message.deleteMany({ where: { id: { in: ids } } })
  const byChannel = new Map<string, string[]>()
  for (const m of msgs)
    byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m.id])
  for (const [channelId, delIds] of byChannel) {
    const members = await memberIds(channelId)
    sendToUsers(members, { type: 'messages-deleted', channelId, ids: delIds })
    sendToUsers(members, { type: 'channel-updated', channelId })
  }
  return { ok: true, count: msgs.length }
})

// ---- 搜索:我所在频道的消息 ----
app.get('/api/search', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const q = ((req.query as { q?: string })?.q ?? '').trim()
  if (!q) return []
  const mine = await prisma.channelMember.findMany({
    where: { userId: me.id },
    select: { channelId: true },
  })
  const rows = await prisma.message.findMany({
    where: {
      channelId: { in: mine.map((c) => c.channelId) },
      deletedAt: null,
      body: { contains: q },
    },
    include: {
      author: { select: userPublic },
      channel: {
        select: {
          id: true,
          name: true,
          isDM: true,
          members: { include: { user: { select: userPublic } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  return rows.map((m) => {
    let channelName = m.channel.name
    if (m.channel.isDM) {
      const peer = m.channel.members
        .map((mm) => mm.user)
        .find((u) => u.id !== me.id)
      channelName = peer?.name ?? '私信'
    }
    return {
      id: m.id,
      channelId: m.channelId,
      channelName,
      isDM: m.channel.isDM,
      author: m.author,
      body: m.body,
      createdAt: m.createdAt,
    }
  })
})

// ---- 收件箱:我被 @ 的消息 ----
app.get('/api/inbox', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const mentions = await prisma.mention.findMany({
    where: { userId: me.id, message: { deletedAt: null } },
    include: {
      message: { include: { author: { select: userPublic } } },
      channel: {
        select: {
          id: true,
          name: true,
          isDM: true,
          members: { include: { user: { select: userPublic } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const items = mentions.map((mn) => {
    let channelName = mn.channel.name
    if (mn.channel.isDM) {
      const peer = mn.channel.members
        .map((m) => m.user)
        .find((u) => u.id !== me.id)
      channelName = peer?.name ?? '私信'
    }
    return {
      id: mn.id,
      messageId: mn.messageId,
      channelId: mn.channelId,
      channelName,
      isDM: mn.channel.isDM,
      author: mn.message.author,
      body: mn.message.body,
      createdAt: mn.createdAt,
      read: !!mn.readAt,
    }
  })
  return { items, unread: items.filter((i) => !i.read).length }
})

// ---- 收件箱:全部标记已读 ----
app.post('/api/inbox/read', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  await prisma.mention.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  })
  return { ok: true }
})

const taskInclude = {
  assignee: { select: userPublic },
  creator: { select: userPublic },
  channel: { select: { id: true, name: true } },
}

function broadcastTasks() {
  sendToUsers(onlineUserIds(), { type: 'tasks' })
}

// 工作台数据(mission/review/delivery/audit)变更广播,前端据此刷新
function broadcastWorkspace() {
  sendToUsers(onlineUserIds(), { type: 'workspace' })
}

// append-only 审计写入。失败不阻塞主流程。
async function writeAudit(input: {
  type: string
  summary: string
  actorId?: string | null
  missionId?: string | null
  taskId?: string | null
  payload?: unknown
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        type: input.type,
        summary: input.summary,
        actorId: input.actorId ?? null,
        missionId: input.missionId ?? null,
        taskId: input.taskId ?? null,
        payloadJson: input.payload != null ? JSON.stringify(input.payload) : null,
      },
    })
  } catch (e) {
    console.error('[audit]', e)
  }
}

// ---- 任务:列表 ----
app.get('/api/tasks', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  return prisma.task.findMany({
    include: taskInclude,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
})

// ---- 任务:创建 ----
app.post('/api/tasks', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { title, status, assigneeId, channelId, missionId, priority, expectedOutput, reviewerId } =
    (req.body ?? {}) as {
      title?: string
      status?: string
      assigneeId?: string
      channelId?: string
      missionId?: string
      priority?: string
      expectedOutput?: string
      reviewerId?: string
    }
  if (!title?.trim()) return reply.code(400).send({ error: 'title required' })
  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      status: status ?? 'todo',
      assigneeId: assigneeId || null,
      channelId: channelId || null,
      missionId: missionId || null,
      priority: priority || null,
      expectedOutput: expectedOutput || null,
      reviewerId: reviewerId || null,
      createdById: me.id,
    },
    include: taskInclude,
  })
  await writeAudit({
    type: 'task.created',
    summary: `创建任务「${task.title}」`,
    actorId: me.id,
    taskId: task.id,
    missionId: task.missionId,
  })
  broadcastTasks()
  broadcastWorkspace()
  return task
})

// ---- 任务:更新(标题/状态/指派)----
app.patch('/api/tasks/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as {
    title?: string
    status?: string
    assigneeId?: string | null
    missionId?: string | null
    priority?: string | null
    expectedOutput?: string | null
    reviewerId?: string | null
  }
  const prev = await prisma.task.findUnique({ where: { id }, select: { status: true } })
  const data: Record<string, unknown> = {}
  if (b.title?.trim()) data.title = b.title.trim()
  if (b.status) data.status = b.status
  if (b.assigneeId !== undefined) data.assigneeId = b.assigneeId || null
  if (b.missionId !== undefined) data.missionId = b.missionId || null
  if (b.priority !== undefined) data.priority = b.priority || null
  if (b.expectedOutput !== undefined) data.expectedOutput = b.expectedOutput || null
  if (b.reviewerId !== undefined) data.reviewerId = b.reviewerId || null
  const task = await prisma.task.update({
    where: { id },
    data,
    include: taskInclude,
  })
  if (b.status && prev && b.status !== prev.status) {
    await writeAudit({
      type: 'task.status_changed',
      summary: `任务「${task.title}」状态 ${prev.status} → ${b.status}`,
      actorId: me.id,
      taskId: task.id,
      missionId: task.missionId,
      payload: { from: prev.status, to: b.status },
    })
    broadcastWorkspace()
  }
  broadcastTasks()
  return task
})

// ---- 任务:删除 ----
app.delete('/api/tasks/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  await prisma.task.delete({ where: { id } })
  broadcastTasks()
  return { ok: true }
})

// ---- 标记已读 ----
app.post('/api/channels/:id/read', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { messageId } = (req.body ?? {}) as { messageId?: string }
  await prisma.readCursor.upsert({
    where: { channelId_userId: { channelId: id, userId: me.id } },
    create: { channelId: id, userId: me.id, lastReadMessageId: messageId ?? null },
    update: { lastReadMessageId: messageId ?? null },
  })
  return { ok: true }
})

// ---- 实时:WebSocket ----
app.get('/ws', { websocket: true }, (socket, req) => {
  const userId = (req.query as { userId?: string })?.userId
  if (!userId) {
    socket.close()
    return
  }
  const client = addClient(userId, socket)
  socket.send(JSON.stringify({ type: 'presence', online: onlineUserIds() }))

  socket.on('message', async (raw: Buffer) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    // 客户端发来「正在输入」,转发给同频道其他成员
    if (msg?.type === 'typing' && msg.channelId) {
      const members = await memberIds(msg.channelId)
      sendToUsers(
        members.filter((m) => m !== userId),
        { type: 'typing', channelId: msg.channelId, userId },
      )
    }
  })

  socket.on('close', () => removeClient(client))
})

// 终端工作目录 = 项目根(server/src 上跳两级)。可用 HELIO_ROOT 覆盖。
const PROJECT_ROOT =
  process.env.HELIO_ROOT ||
  pathResolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// 交互式终端(独立通道):每连接 spawn 一个 pty,刷新即重建,不进业务广播集合。
app.get('/ws/terminal', { websocket: true }, (socket, req) => {
  const userId = (req.query as { userId?: string })?.userId
  if (!userId) {
    socket.close()
    return
  }
  const shell = process.env.SHELL || 'zsh'
  const pty = ptySpawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: PROJECT_ROOT,
    env: process.env as Record<string, string>,
  })

  const onData = pty.onData((data) => {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'data', data }))
  })
  const onExit = pty.onExit(({ exitCode }) => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'exit', exitCode }))
      socket.close()
    }
  })

  let cmdBuf = '' // 累积按键,遇回车记一条 terminal.command 审计(best-effort)
  socket.on('message', (raw: Buffer) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg?.type === 'input' && typeof msg.data === 'string') {
      pty.write(msg.data)
      cmdBuf += msg.data
      if (cmdBuf.includes('\r')) {
        const lines = cmdBuf.split('\r')
        cmdBuf = lines.pop() ?? ''
        for (const line of lines) {
          // 应用退格 + 去 ANSI 控制序列,得到近似命令文本
          let s = ''
          for (const ch of line) {
            if (ch === '\x7f' || ch === '\b') s = s.slice(0, -1)
            else s += ch
          }
          const clean = s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim()
          if (clean)
            void writeAudit({
              type: 'terminal.command',
              summary: `终端执行:${clean.slice(0, 200)}`,
              actorId: userId,
            })
        }
      }
    } else if (msg?.type === 'resize') {
      const cols = Math.max(1, Math.floor(Number(msg.cols) || 80))
      const rows = Math.max(1, Math.floor(Number(msg.rows) || 24))
      try {
        pty.resize(cols, rows)
      } catch {
        /* 容器尺寸异常时忽略 */
      }
    }
  })

  const cleanup = () => {
    onData.dispose()
    onExit.dispose()
    try {
      pty.kill()
    } catch {
      /* 已退出 */
    }
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
})

// 频道第一个真人成员(给系统提醒消息当作者)
async function firstHumanMember(channelId: string): Promise<string | null> {
  const m = await prisma.channelMember.findFirst({
    where: { channelId, user: { isAssistant: false } },
    select: { userId: true },
  })
  return m?.userId ?? null
}

// Cron:事件开始前 1 小时提醒(每分钟扫;remindedAt 防重复)。
// 在事件线程发提醒,并 @ 频道里有日历技能的助手(日程管家/项目经理)备简报。
setInterval(async () => {
  try {
    const now = new Date()
    const REMIND_AHEAD_MS = 60 * 60_000 // 事件开始前 1 小时发提醒
    const soon = new Date(now.getTime() + REMIND_AHEAD_MS)
    const due = await prisma.event.findMany({
      where: { remindedAt: null, startsAt: { gte: now, lte: soon } },
      include: { cards: { select: { id: true }, take: 1 } },
    })
    for (const ev of due) {
      // 抢占式标记:仅当 remindedAt 仍为 null 才更新,count===0 说明已被并发回调处理 → 跳过,防 Cron 重入重复提醒
      const claimed = await prisma.event.updateMany({
        where: { id: ev.id, remindedAt: null },
        data: { remindedAt: new Date() },
      })
      if (claimed.count === 0) continue
      // 提醒作者优先用真人:避免「建事件的助手 @ 自己」被「不触发自己」过滤掉
      const author = (await firstHumanMember(ev.channelId)) ?? ev.createdById
      if (!author) continue
      const rootId = ev.cards[0]?.id ?? null
      // 动态找频道里有日历技能的助手来 @(不写死名字)
      const chAssistants = await prisma.user.findMany({
        where: {
          isAssistant: true,
          memberships: { some: { channelId: ev.channelId } },
        },
        select: { handle: true, skills: true },
      })
      const keeper = chAssistants.find((u) => {
        const sk = parseSkills(u.skills)
        return sk.includes('read_calendar') || sk.includes('create_event')
      })
      const when = ev.startsAt.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'short',
        timeStyle: 'short',
      })
      const body = `⏰ 距离「${ev.title}」开始不到 1 小时(${when}${ev.location ? ' @ ' + ev.location : ''})。${keeper ? '@' + keeper.handle + ' ' : ''}帮忙准备一下简报和清单。`
      const msg = await prisma.message.create({
        data: { channelId: ev.channelId, authorId: author, body, parentId: rootId },
        include: fullMessageInclude,
      })
      const members = await memberIds(ev.channelId)
      sendToUsers(
        members,
        rootId
          ? {
              type: 'thread-reply',
              channelId: ev.channelId,
              parentId: rootId,
              message: shapeMessage(msg),
            }
          : {
              type: 'message',
              channelId: ev.channelId,
              message: shapeMessage(msg),
            },
      )
      // 把提醒当作真人系统消息,触发被 @ 的日历助手回简报
      void maybeTriggerAssistants(ev.channelId, {
        body,
        parentId: rootId,
        authorIsAssistant: false,
        authorId: author,
        messageId: msg.id,
      }).catch((e) => console.error('[cron-remind]', e))
    }
  } catch (e) {
    console.error('[cron]', e)
  }
}, 60_000)

// ============================================================
// AI Workforce 工作流 API:Mission / Review / Delivery / AuditEvent / Context Docs
// 真实持久化。展示用的用户名由前端用已加载的 users 列表解析(后端只回 id)。
// ============================================================

// ---- Mission:列表 ----
app.get('/api/missions', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  return prisma.mission.findMany({ orderBy: { updatedAt: 'desc' } })
})

// ---- Mission:详情(含真实任务拆解 + review + delivery + audit) ----
app.get('/api/missions/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })
  const [tasks, reviews, deliveries, audit] = await Promise.all([
    prisma.task.findMany({
      where: { missionId: id },
      include: taskInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.review.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.delivery.findMany({ where: { missionId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.auditEvent.findMany({
      where: { missionId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])
  return { mission, tasks, reviews, deliveries, audit }
})

// ---- Mission:创建(用户输入目标) ----
app.post('/api/missions', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { title, goal, contextDocIds } = (req.body ?? {}) as {
    title?: string
    goal?: string
    contextDocIds?: string[]
  }
  const g = (goal ?? title ?? '').trim()
  if (!g) return reply.code(400).send({ error: 'goal required' })
  const t = (title?.trim() || g).slice(0, 120)
  const mission = await prisma.mission.create({
    data: {
      title: t,
      goal: g,
      status: 'draft',
      createdById: me.id,
      contextDocIds: contextDocIds?.length ? JSON.stringify(contextDocIds) : null,
    },
  })
  await writeAudit({
    type: 'mission.created',
    summary: `创建 Mission「${t}」`,
    actorId: me.id,
    missionId: mission.id,
  })
  broadcastWorkspace()
  return mission
})

// ---- Mission:更新(状态/标题/目标/上下文) ----
app.patch('/api/missions/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as {
    title?: string
    goal?: string
    status?: string
    contextDocIds?: string[]
  }
  const prev = await prisma.mission.findUnique({ where: { id } })
  if (!prev) return reply.code(404).send({ error: 'not found' })
  const data: Record<string, unknown> = {}
  if (b.title?.trim()) data.title = b.title.trim()
  if (b.goal?.trim()) data.goal = b.goal.trim()
  if (b.status) data.status = b.status
  if (b.contextDocIds !== undefined)
    data.contextDocIds = b.contextDocIds.length ? JSON.stringify(b.contextDocIds) : null
  const mission = await prisma.mission.update({ where: { id }, data })
  if (b.status && b.status !== prev.status) {
    await writeAudit({
      type: 'mission.status_changed',
      summary: `Mission「${mission.title}」状态 ${prev.status} → ${b.status}`,
      actorId: me.id,
      missionId: id,
      payload: { from: prev.status, to: b.status },
    })
  }
  broadcastWorkspace()
  return mission
})

// ---- Mission:AI 拆解(真实 LLM)----
// 借助手已配置的供应商/本地端点把目标拆成真实子任务并落库,mission 进入 planning。
app.post('/api/missions/:id/breakdown', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })

  // 候选端点:所有助手的供应商/自带配置(用于在服务器默认未配置时兜底调用)
  const assistants = await prisma.user.findMany({ where: { isAssistant: true } })
  const callers = assistants.map((a) => ({
    provider: a.provider,
    baseUrl: a.baseUrl,
    apiKey: a.apiKey,
    model: a.model,
  }))
  const team = assistants.map((a) => ({ name: a.name, role: a.systemPrompt?.slice(0, 60) || '' }))

  const { subtasks, error } = await breakdownGoal({ goal: mission.goal, callers, team })
  if (error && !subtasks.length) return reply.code(502).send({ error })
  if (!subtasks.length)
    return reply.code(502).send({ error: '模型未能拆解出子任务,请重试或手动添加任务' })

  // 落库为真实 Task(挂到 mission),按返回顺序排序(sortOrder 须落在 32 位 Int 内)
  const agg = await prisma.task.aggregate({ _max: { sortOrder: true } })
  const baseOrder = (agg._max.sortOrder ?? 0) + 1
  const created = []
  for (let i = 0; i < subtasks.length; i++) {
    const s = subtasks[i]
    const t = await prisma.task.create({
      data: {
        title: s.title,
        status: 'todo',
        missionId: id,
        priority: s.priority ?? 'medium',
        expectedOutput: s.expectedOutput ?? null,
        createdById: me.id,
        sortOrder: baseOrder + i,
      },
      include: taskInclude,
    })
    created.push(t)
  }

  await prisma.mission.update({
    where: { id },
    data: { status: mission.status === 'draft' ? 'planning' : mission.status },
  })
  await writeAudit({
    type: 'mission.broken_down',
    summary: `AI 拆解 Mission「${mission.title}」为 ${created.length} 个子任务`,
    actorId: me.id,
    missionId: id,
    payload: { count: created.length, titles: created.map((t) => t.title) },
  })
  broadcastWorkspace()
  broadcastTasks()
  return { tasks: created }
})

// ---- Review:列表 ----
app.get('/api/reviews', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { taskId, missionId } = req.query as { taskId?: string; missionId?: string }
  const where: Record<string, unknown> = {}
  if (taskId) where.taskId = taskId
  if (missionId) where.missionId = missionId
  return prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
})

// ---- Review:创建(pass / needs_fix / blocked + checks + notes) ----
app.post('/api/reviews', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const b = (req.body ?? {}) as {
    taskId?: string
    missionId?: string
    reviewerId?: string
    verdict?: string
    checks?: { label: string; ok: boolean }[]
    notes?: string
  }
  if (!b.verdict || !['pass', 'needs_fix', 'blocked'].includes(b.verdict))
    return reply.code(400).send({ error: 'invalid verdict' })
  const review = await prisma.review.create({
    data: {
      taskId: b.taskId || null,
      missionId: b.missionId || null,
      reviewerId: b.reviewerId || me.id,
      verdict: b.verdict,
      checksJson: b.checks?.length ? JSON.stringify(b.checks) : null,
      notes: b.notes?.trim() || null,
    },
  })
  await writeAudit({
    type: 'review.submitted',
    summary: `提交审查结论:${b.verdict}`,
    actorId: me.id,
    taskId: b.taskId || null,
    missionId: b.missionId || null,
    payload: { verdict: b.verdict },
  })
  broadcastWorkspace()
  return review
})

// ---- Delivery:列表 ----
app.get('/api/deliveries', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { missionId, status } = req.query as { missionId?: string; status?: string }
  const where: Record<string, unknown> = {}
  if (missionId) where.missionId = missionId
  if (status) where.status = status
  return prisma.delivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
})

// ---- Delivery:创建(交付物 + 测试结果 + 风险) ----
app.post('/api/deliveries', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const b = (req.body ?? {}) as {
    missionId?: string
    taskId?: string
    title?: string
    summary?: string
    testResult?: string
    riskLevel?: string
    artifact?: unknown
  }
  const title = b.title?.trim()
  if (!title) return reply.code(400).send({ error: 'title required' })
  const delivery = await prisma.delivery.create({
    data: {
      missionId: b.missionId || null,
      taskId: b.taskId || null,
      title,
      summary: b.summary?.trim() || null,
      testResult: b.testResult || null,
      riskLevel: b.riskLevel || null,
      artifactJson: b.artifact != null ? JSON.stringify(b.artifact) : null,
      status: 'pending',
      createdById: me.id,
    },
  })
  await writeAudit({
    type: 'delivery.created',
    summary: `创建交付物「${title}」`,
    actorId: me.id,
    missionId: b.missionId || null,
    taskId: b.taskId || null,
  })
  broadcastWorkspace()
  return delivery
})

// ---- Delivery:人工审批(approve / reject 落库) ----
app.patch('/api/deliveries/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as { status?: string }
  if (!b.status || !['approved', 'rejected', 'pending'].includes(b.status))
    return reply.code(400).send({ error: 'invalid status' })
  const isDecision = b.status !== 'pending'
  const delivery = await prisma.delivery.update({
    where: { id },
    data: {
      status: b.status,
      approvedById: isDecision ? me.id : null,
      approvedAt: isDecision ? new Date() : null,
    },
  })
  if (isDecision) {
    await writeAudit({
      type: 'approval.decided',
      summary: `${b.status === 'approved' ? '批准' : '打回'}交付物「${delivery.title}」`,
      actorId: me.id,
      missionId: delivery.missionId,
      taskId: delivery.taskId,
      payload: { status: b.status },
    })
  }
  broadcastWorkspace()
  return delivery
})

// ---- AuditEvent:列表(append-only,Activity Feed 数据源) ----
app.get('/api/audit-events', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { missionId, limit } = req.query as { missionId?: string; limit?: string }
  const take = Math.min(200, Math.max(1, Number(limit) || 50))
  const where: Record<string, unknown> = {}
  if (missionId) where.missionId = missionId
  return prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take })
})

// ---- Context Docs:只读项目文档白名单(可读取 + 搜索 + 绑定 Mission) ----
const CONTEXT_DOC_FILES: { id: string; title: string; path: string; kind: string }[] = [
  { id: 'project-context', title: 'Project Context', path: 'PROJECT_CONTEXT.md', kind: 'context' },
  { id: 'readme', title: 'README', path: 'README.md', kind: 'context' },
  { id: 'decisions', title: 'Product Decisions', path: 'DECISIONS.md', kind: 'decisions' },
  { id: 'tasks', title: 'Tasks', path: 'TASKS.md', kind: 'task' },
  { id: 'ai-start', title: 'AI Start', path: 'AI_START.md', kind: 'context' },
  { id: 'project-audit', title: 'Project Audit', path: 'docs/ai/PROJECT_AUDIT.md', kind: 'review' },
  { id: 'plan', title: 'Plan', path: 'docs/ai/PLAN.md', kind: 'task' },
  { id: 'design-brief', title: 'Design Brief', path: 'docs/ai/DESIGN_BRIEF.md', kind: 'principles' },
  { id: 'delivery', title: 'Delivery Log', path: 'docs/ai/DELIVERY.md', kind: 'delivery' },
]

app.get('/api/context-docs', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { q } = req.query as { q?: string }
  const out: {
    id: string
    title: string
    path: string
    kind: string
    size: number
    snippet?: string
  }[] = []
  for (const d of CONTEXT_DOC_FILES) {
    const abs = pathResolve(PROJECT_ROOT, d.path)
    if (!abs.startsWith(PROJECT_ROOT)) continue
    try {
      const st = statSync(abs)
      if (!st.isFile()) continue
      let snippet: string | undefined
      if (q?.trim()) {
        const content = readFileSync(abs, 'utf8')
        const idx = content.toLowerCase().indexOf(q.trim().toLowerCase())
        if (idx < 0) continue // 搜索时跳过不匹配文档
        snippet = content.slice(Math.max(0, idx - 50), idx + 100).replace(/\s+/g, ' ').trim()
      }
      out.push({ id: d.id, title: d.title, path: d.path, kind: d.kind, size: st.size, snippet })
    } catch {
      /* 文件缺失则跳过 */
    }
  }
  return out
})

app.get('/api/context-docs/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const doc = CONTEXT_DOC_FILES.find((d) => d.id === id)
  if (!doc) return reply.code(404).send({ error: 'not found' })
  const abs = pathResolve(PROJECT_ROOT, doc.path)
  if (!abs.startsWith(PROJECT_ROOT)) return reply.code(403).send({ error: 'forbidden' })
  try {
    const content = readFileSync(abs, 'utf8')
    return { id: doc.id, title: doc.title, path: doc.path, kind: doc.kind, content }
  } catch {
    return reply.code(404).send({ error: 'file not found' })
  }
})

// ============================================================
// AI Task Execution Runtime —— 把「指派给 AI 的任务」真正跑起来。
// 复用 generateReply(对话 + 工具循环)与 run_command;执行过程落到执行人↔助手的
// DM 里(可在聊天直接看到),状态/工具调用/输出/错误全部关联 taskId/missionId 并写审计。
// 高危能力(run_command)在执行中走人工审批门,危险动作不静默执行。
// ============================================================

// 找/建两人之间的 DM,返回 channelId(复用 /api/dms 同款逻辑)
async function ensureDM(aId: string, bId: string): Promise<string> {
  const aDMs = await prisma.channelMember.findMany({
    where: { userId: aId, channel: { isDM: true } },
    select: { channelId: true },
  })
  const existing = await prisma.channelMember.findFirst({
    where: { userId: bId, channelId: { in: aDMs.map((c) => c.channelId) } },
    select: { channelId: true },
  })
  if (existing) return existing.channelId
  const members = aId === bId ? [{ userId: aId }] : [{ userId: aId }, { userId: bId }]
  const ch = await prisma.channel.create({
    data: { name: '', isDM: true, members: { create: members } },
  })
  return ch.id
}

// 进行中的执行:runId -> AbortController(供取消)
const RUNNING_CTRL = new Map<string, AbortController>()

// ---- 任务意图分析 + 智能工具/Agent 路由 ----
// 目标:发布/开始执行前,按任务意图与助手 skills 判断是否该换人/补信息。
// 例:「查天气/查资料/联网」不能交给无 fetch_url/run_command 的助手空答;
//    缺城市的查天气任务先向用户要城市,再用真实工具获取。全部基于真实 skills 判定,不造假。

// 城市提取:从天气类任务标题里抠出城市;给了 override(用户补填)则直接用;抠不到返回 null。
function extractCity(title: string, override?: string | null): string | null {
  if (override && override.trim()) return override.trim().slice(0, 40)
  let s = ` ${title} `
  // 英文填充词(整词)
  s = s.replace(
    /\b(the|a|weather|forecast|temperature|temp|today|tomorrow|now|current|in|of|for|at|what|whats|is|s|like|please|check|tell|me|how|get|show)\b/gi,
    ' ',
  )
  // 中文填充词(直接子串)
  s = s
    .replace(
      /查询|查一下|查下|查看|查|看一下|看看|看|帮我|请|今天|明天|后天|现在|当前|实时|的|地|天气情况|天气预报|天气|气温|温度|怎么样|咋样|如何|多少|是多少|预报|未来|这几天|情况|状况|度数|下雨|会不会|吗|呢|啊|嘛/g,
      '',
    )
  s = s.replace(/[，。、！？!?,.:：;；()（）\s]+/g, ' ').trim()
  return s ? s.slice(0, 40) : null
}

type TaskIntent = {
  weather: boolean
  city: string | null
  needsNetwork: boolean // 需联网/查资料
  needsCommand: boolean // 需运行命令/终端/代码
  needsBrowser: boolean // 需浏览器控制(打开本地页面/截图/验收 UI)
  requiredAny: string[] // 满足任一 skill 即可胜任(空=无特殊能力要求)
}

function analyzeTaskIntent(
  task: { title: string; expectedOutput?: string | null },
  input?: string | null,
): TaskIntent {
  const hay = `${task.title} ${task.expectedOutput ?? ''}`
  const weather = /(天气|weather|气温|温度|下雨|降雨|预报|forecast)/i.test(hay)
  // 浏览器控制意图:打开本地页面/截图/点击/验收 UI/console。优先于「联网」,避免被路由去无浏览器能力的助手。
  const needsBrowser =
    /(浏览器|\bbrowser\b|截图|screenshot|打开.{0,8}(页面|网页|网址|链接|站点|本地|工作台|应用)|验收.{0,4}(页面|ui|界面)|\bUI\s*验证|点击.{0,4}(按钮|页面|元素)|console\s*(报错|错误|日志)|browser_open|localhost(:|\b)|127\.0\.0\.1|file:\/\/)/i.test(
      hay,
    )
  const needsNetwork =
    weather ||
    /(查资料|查询|搜索|检索|最新|新闻|联网|在线|上网|网页|链接|网址|http|股价|汇率|价格|行情|百科|wiki|search\s+the\s+web|google)/i.test(
      hay,
    )
  const needsCommand =
    /(运行命令|执行命令|跑命令|运行\s|执行\s|命令行|终端|shell|脚本|构建|编译|\bbuild\b|跑测试|跑一下测试|测试用例|\bgit\b|\bpnpm\b|\bnpm\b|\bnode\b|\bcurl\b|run_command|\bpwd\b|\bls\b|部署|deploy|查看文件|列目录)/i.test(
      hay,
    )
  const requiredAny: string[] = []
  if (needsBrowser) {
    // 浏览器任务:需任一浏览器技能;不把它当成 fetch_url/run_command 任务(避免路由到无浏览器能力的助手)
    requiredAny.push(...BROWSER_SKILLS)
  } else {
    if (needsNetwork) requiredAny.push('fetch_url', 'run_command')
    if (needsCommand) requiredAny.push('run_command')
  }
  return {
    weather: needsBrowser ? false : weather, // 浏览器任务不走「缺城市」补信息门
    city: !needsBrowser && weather ? extractCity(task.title, input) : null,
    needsNetwork,
    needsCommand,
    needsBrowser,
    requiredAny: [...new Set(requiredAny)],
  }
}

// 助手是否具备所需能力之一
function assistantHasAny(skills: string[], requiredAny: string[]): boolean {
  if (!requiredAny.length) return true
  return requiredAny.some((s) => skills.includes(s))
}

// 选一个具备所需能力之一、且有可用模型/key、非图像模型的助手作为执行人(命中越多越优先)
async function pickExecutor(requiredAny: string[], excludeId?: string) {
  if (!requiredAny.length) return null
  const all = await prisma.user.findMany({ where: { isAssistant: true } })
  const ranked = all
    .filter((a) => a.id !== excludeId)
    .filter((a) => !isImageModel(a.model))
    .filter((a) =>
      canGenerate({
        provider: a.provider,
        baseUrl: a.baseUrl,
        apiKey: a.apiKey,
        model: a.model,
      }),
    )
    .map((a) => ({
      a,
      hits: parseSkills(a.skills).filter((s) => requiredAny.includes(s)).length,
    }))
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits || a_name(x.a).localeCompare(a_name(y.a)))
  return ranked[0]?.a ?? null
}
function a_name(a: { name: string }) {
  return a.name
}

type ExecOpts = {
  triggeredById: string
  trigger?: 'manual' | 'auto' | 'approval' | 'continue'
  allowRunCommand?: boolean // 经人工批准续跑时放行 run_command
  input?: string | null // 用户补填的信息(如查天气的城市)
  forceAssistantId?: string // 强制用此助手为执行人(审批续跑时复用原执行人,跳过路由/补信息门)
  reuseSandboxRunId?: string // 「继续执行」:复用上次的沙盒工作区(不重新快照),让先前改动与上下文保留
}

// 浏览器控制相关技能(用于本地交付验证)
const BROWSER_SKILLS = ['browser_open', 'browser_screenshot', 'browser_console', 'browser_click', 'browser_type']

type ExecResult =
  | { runId: string; status: string; executorId?: string; routedFrom?: string }
  | { error: string; code: number }
  | { needsInput: true; field: string; prompt: string }

async function executeTask(
  taskId: string,
  opts: ExecOpts,
): Promise<ExecResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true },
  })
  if (!task) return { error: 'task not found', code: 404 }
  const assignee = task.assignee
  if (!assignee || !assignee.isAssistant)
    return { error: '该任务未指派给 AI 助手,无法自动执行;请先把任务指派给一个 AI 助手', code: 400 }

  // 同一任务不并发执行
  const active = await prisma.taskRun.findFirst({
    where: { taskId, status: { in: ['queued', 'running'] } },
  })
  if (active) return { error: '该任务已有执行在进行中', code: 409 }

  // ---- 意图分析 + 补信息门 + 智能路由(审批续跑时跳过,复用原执行人) ----
  const intent = analyzeTaskIntent(task, opts.input)
  let executor = assignee
  let routedFrom: string | null = null

  if (opts.forceAssistantId) {
    // 审批续跑:复用发起审批的执行人(可能与 assignee 不同)
    const forced = await prisma.user.findUnique({ where: { id: opts.forceAssistantId } })
    if (forced?.isAssistant) executor = forced
  } else {
    // 补信息门:查天气缺城市 → 先要城市,不创建 TaskRun(不伪装执行)
    if (intent.weather && !intent.city) {
      return {
        needsInput: true,
        field: 'city',
        prompt: `「${task.title}」是查天气任务,但没识别到城市。请告诉我要查哪个城市(如:北京 / Tokyo),我再用真实数据源获取天气。`,
      }
    }
    // 智能路由:assignee 缺所需能力 → 换给具备 fetch_url/run_command 的可用助手
    if (intent.requiredAny.length && !assistantHasAny(parseSkills(assignee.skills), intent.requiredAny)) {
      const better = await pickExecutor(intent.requiredAny, assignee.id)
      if (better) {
        executor = better
        routedFrom = assignee.name
      } else {
        const capNames = intent.requiredAny
          .map((s) => (s === 'fetch_url' ? '联网读网页(fetch_url)' : s === 'run_command' ? '执行命令(run_command)' : s))
          .join(' 或 ')
        return {
          error: `该任务需要「${capNames}」能力,但当前指派的「${assignee.name}」不具备,也没有其他具备该能力且已配置可用模型的助手可路由。请给某个助手开启对应技能,或改指派后重试。`,
          code: 400,
        }
      }
    }
  }

  const assistant = executor // 实际执行人(可能经路由替换 assignee)
  const channelId = await ensureDM(opts.triggeredById, assistant.id)

  const run = await prisma.taskRun.create({
    data: {
      taskId: task.id,
      missionId: task.missionId ?? null,
      assistantId: assistant.id,
      channelId,
      triggeredById: opts.triggeredById,
      trigger: opts.trigger ?? 'manual',
      status: 'running',
      startedAt: new Date(),
    },
  })
  await prisma.task.update({ where: { id: task.id }, data: { status: 'doing' } })

  // —— 沙盒运行时:代码/命令/浏览器类执行创建(或复用)隔离工作区 ——
  // run_command / write_file / browser_* 全部限制在沙盒内,主项目不被 AI 直接改。
  const execSkills = parseSkills(assistant.skills)
  const needsSandbox =
    intent.needsCommand ||
    intent.needsBrowser ||
    execSkills.includes('run_command') ||
    execSkills.includes('write_file') ||
    execSkills.some((s) => BROWSER_SKILLS.includes(s))
  let sandbox: { sandboxRunId: string; workspacePath: string } | null = null
  // 「继续执行」:复用上次沙盒工作区(保留先前文件改动与上下文),不重新快照。
  if (opts.reuseSandboxRunId) {
    const prior = await prisma.sandboxRun.findUnique({ where: { id: opts.reuseSandboxRunId } })
    if (prior && prior.workspacePath && existsSync(prior.workspacePath) && prior.status !== 'applied' && prior.status !== 'discarded') {
      await prisma.sandboxRun.update({
        where: { id: prior.id },
        data: { taskRunId: run.id, status: 'running', endedAt: null, error: null },
      })
      sandbox = { sandboxRunId: prior.id, workspacePath: prior.workspacePath }
      await writeAudit({
        type: 'sandbox.resumed',
        summary: `任务「${task.title}」在原沙盒继续执行(复用工作区)`,
        actorId: assistant.id,
        taskId: task.id,
        missionId: task.missionId ?? null,
        payload: { runId: run.id, sandboxRunId: prior.id, workspacePath: prior.workspacePath },
      })
    }
  }
  if (needsSandbox && !sandbox) {
    try {
      const iso = detectIsolation()
      const sr = await createSandboxRun({
        taskRunId: run.id,
        taskId: task.id,
        missionId: task.missionId ?? null,
        createdById: opts.triggeredById,
      })
      sandbox = { sandboxRunId: sr.id, workspacePath: sr.workspacePath }
      await writeAudit({
        type: 'sandbox.prepared',
        summary: `为任务「${task.title}」准备隔离沙盒(${iso.label})`,
        actorId: assistant.id,
        taskId: task.id,
        missionId: task.missionId ?? null,
        payload: { runId: run.id, sandboxRunId: sr.id, workspacePath: sr.workspacePath, isolation: iso.mode },
      })
    } catch (e) {
      // 沙盒准备失败:不在主项目里裸跑命令,直接判失败(诚实记录)
      await prisma.taskRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: '沙盒准备失败:' + (e as Error).message.slice(0, 200), endedAt: new Date() },
      })
      await prisma.task.update({ where: { id: task.id }, data: { status: 'todo' } }).catch(() => {})
      await writeAudit({
        type: 'task.exec_failed',
        summary: `任务「${task.title}」沙盒准备失败,已中止执行`,
        actorId: assistant.id,
        taskId: task.id,
        missionId: task.missionId ?? null,
        payload: { runId: run.id, error: (e as Error).message.slice(0, 200) },
      })
      broadcastWorkspace()
      broadcastTasks()
      return { runId: run.id, status: 'failed' }
    }
  }

  if (routedFrom) {
    await writeAudit({
      type: 'task.exec_routed',
      summary: `任务「${task.title}」按能力路由:${routedFrom} → ${assistant.name}(需 ${intent.requiredAny.join('/')})`,
      actorId: opts.triggeredById,
      taskId: task.id,
      missionId: task.missionId ?? null,
      payload: { from: routedFrom, to: assistant.name, requiredAny: intent.requiredAny, runId: run.id },
    })
  }
  await writeAudit({
    type: 'task.exec_started',
    summary: `${assistant.name} 开始执行任务「${task.title}」`,
    actorId: assistant.id,
    taskId: task.id,
    missionId: task.missionId ?? null,
    payload: { runId: run.id, trigger: opts.trigger ?? 'manual' },
  })
  broadcastWorkspace()
  broadcastTasks()

  const memberList = await memberIds(channelId)
  const sendStatus = (status: string) =>
    sendToUsers(memberList, {
      type: 'assistant-status',
      channelId,
      userId: assistant.id,
      status,
    })

  // 任务简报(作为触发者的消息,执行对话可见)。按意图给出更聪明的指引。
  const guide: string[] = []
  if (routedFrom)
    guide.push(`(系统按能力把本任务从「${routedFrom}」路由给你,因为需要 ${intent.requiredAny.join('/')} 能力。)`)
  if (intent.weather && intent.city) {
    guide.push(
      `这是查天气任务,城市:${intent.city}。请务必用真实数据源获取:` +
        `优先调用 fetch_url 抓取 https://wttr.in/${encodeURIComponent(intent.city)}?format=3 ` +
        `(失败可改 https://wttr.in/${encodeURIComponent(intent.city)}?format=j1 解析 JSON);` +
        `若你有 run_command,也可执行 curl -s "https://wttr.in/${encodeURIComponent(intent.city)}?format=3"(属低风险只读,免审批)。` +
        '不要只调用 current_datetime 就结束。若网络失败,如实报告失败原因,不要编造天气。',
    )
  } else if (intent.needsNetwork) {
    guide.push(
      '这是需要联网/查资料的任务:请用 fetch_url 抓取相关公开网页(或用 run_command 跑 curl 公开 GET)获取真实信息后再回答,不要凭空作答;失败则如实报告原因。',
    )
  }
  if (intent.needsCommand) {
    guide.push(
      '可调用 run_command 执行所需命令:只读低风险命令(ls/pwd/cat/grep/curl GET 等)将免人工审批直接执行,写文件/危险命令会走人工审批门或被拦截。',
    )
  }
  if (sandbox) {
    const iso = detectIsolation()
    guide.push(
      `【沙盒·${iso.label}】本次在隔离工作区执行:run_command 的 cwd 默认是沙盒 workspace(主项目源码的副本),引用沙盒外的绝对/家目录路径会被拒绝。` +
        '本机信任沙盒里放宽了开发命令:可直接跑 node/pnpm/npm/tsx/python、pnpm build、pnpm test、git status/git diff 等(危险命令仍被拦截)。' +
        '需要改代码时调用 write_file 写入沙盒(只写沙盒,不会直接改主项目);所有改动会生成 diff,执行结束后跑 build/test,最终由人类在报告里批准应用。',
    )
    if (execSkills.some((s) => BROWSER_SKILLS.includes(s)))
      guide.push(
        '验证交付时可用浏览器:browser_open 打开 http://localhost:<port> 本地页面,browser_screenshot 截图存证,browser_console 看报错,browser_click/browser_type 做交互(外站需人工批准)。',
      )
  }
  if (!guide.length)
    guide.push('如需运行 shell 命令,请调用 run_command(低风险只读免审批,高危走人工审批);完成后用 1-3 句话总结你做了什么、结果如何。')
  else guide.push('完成后用 1-3 句话总结你做了什么、结果如何。')

  const isContinue = !!opts.reuseSandboxRunId || opts.trigger === 'continue'
  const brief = [
    isContinue
      ? '【继续执行】上次因工具调用轮数到上限而暂停,现在在同一沙盒继续。请先回顾上文已完成的部分,接着把任务做完并汇报。'
      : '【任务执行】请完成以下任务并简要汇报结果。',
    `任务:${task.title}`,
    task.expectedOutput ? `预期交付物:${task.expectedOutput}` : '',
    ...guide,
  ]
    .filter(Boolean)
    .join('\n')
  const briefMsg = await prisma.message.create({
    data: { channelId, authorId: opts.triggeredById, body: brief },
    include: fullMessageInclude,
  })
  sendToUsers(memberList, { type: 'message', channelId, message: shapeMessage(briefMsg) })

  const placeholder = await prisma.message.create({
    data: { channelId, authorId: assistant.id, body: '' },
    include: fullMessageInclude,
  })
  sendToUsers(memberList, { type: 'message', channelId, message: shapeMessage(placeholder) })
  sendStatus('正在执行任务…')

  const ctrl = new AbortController()
  RUNNING_CTRL.set(run.id, ctrl)
  let approvalRequested = false
  const requestedCmds = new Set<string>() // 去重:同一命令只提交一次审批

  try {
    const skills = parseSkills(assistant.skills)
    const history = await buildHistory(channelId, null, assistant.id)
    // 工具轮数预算:有沙盒(代码/命令/浏览器)用 code(默认 40),其余任务用 task(默认 25)。
    const maxToolRounds = toolRoundsFor(sandbox ? 'code' : 'task')
    const { text, toolsUsed, hitToolLimit } = await generateReply({
      provider: assistant.provider,
      baseUrl: assistant.baseUrl,
      apiKey: assistant.apiKey,
      systemPrompt: withMemory(assistant),
      model: assistant.model,
      skills,
      maxToolRounds,
      signal: ctrl.signal,
      ctx: {
        channelId,
        userId: assistant.id,
        baseUrl: assistant.baseUrl,
        apiKey: assistant.apiKey,
        model: assistant.model,
        // 每次工具调用 → 关联 taskId 写审计(run_command 输出也在此被记录)
        onTool: ({ name, result }) => {
          void writeAudit({
            type: 'ai.tool_call',
            summary: `${assistant.name} 在任务「${task.title}」中调用工具:${name}`,
            actorId: assistant.id,
            taskId: task.id,
            missionId: task.missionId ?? null,
            payload: { tool: name, output: String(result).slice(0, 1000), runId: run.id },
          })
          broadcastWorkspace()
        },
        exec: {
          taskId: task.id,
          runId: run.id,
          allowRunCommand: opts.allowRunCommand,
          sandbox: sandbox ?? undefined,
          requestApproval: async (capability, command) => {
            approvalRequested = true
            const key = capability + '::' + command
            if (requestedCmds.has(key)) return
            requestedCmds.add(key)
            const ap = await prisma.approvalRequest.create({
              data: {
                runId: run.id,
                taskId: task.id,
                missionId: task.missionId ?? null,
                requestedById: assistant.id,
                capability,
                command,
              },
            })
            await writeAudit({
              type: 'approval.requested',
              summary: `${assistant.name} 请求人工批准高危操作:${command.slice(0, 120)}`,
              actorId: assistant.id,
              taskId: task.id,
              missionId: task.missionId ?? null,
              payload: { approvalId: ap.id, capability },
            })
            broadcastWorkspace()
          },
        },
      },
      messages: history,
      onDelta: (chunk) =>
        sendToUsers(memberList, {
          type: 'message-chunk',
          channelId,
          messageId: placeholder.id,
          chunk,
        }),
      onStatus: (s) => sendStatus(s),
    })

    // 取消:generateReply 在 abort 时不会抛错而是返回部分文本,需显式判断 signal
    if (ctrl.signal.aborted) {
      const m = await prisma.message.update({
        where: { id: placeholder.id },
        data: { body: text || '(执行已取消)' },
        include: fullMessageInclude,
      })
      sendToUsers(memberList, { type: 'message-updated', channelId, message: shapeMessage(m) })
      await prisma.taskRun.update({
        where: { id: run.id },
        data: { status: 'cancelled', error: '已取消', endedAt: new Date() },
      })
      if (sandbox) await failSandbox(sandbox.sandboxRunId, '执行已取消', 'cancelled')
      await prisma.task.update({ where: { id: task.id }, data: { status: 'todo' } })
      await writeAudit({
        type: 'task.exec_cancelled',
        summary: `任务「${task.title}」执行被取消`,
        actorId: opts.triggeredById,
        taskId: task.id,
        missionId: task.missionId ?? null,
        payload: { runId: run.id },
      })
      broadcastWorkspace()
      broadcastTasks()
      return { runId: run.id, status: 'cancelled' }
    }

    const finalMsg = await prisma.message.update({
      where: { id: placeholder.id },
      data: { body: text, toolsUsed: JSON.stringify(toolsUsed) },
      include: fullMessageInclude,
    })
    sendToUsers(memberList, { type: 'message-updated', channelId, message: shapeMessage(finalMsg) })

    // 沙盒收尾:收集 diff、(有代码改动则)跑 build/test,置 ready_for_review,落产物清单。
    if (sandbox) {
      try {
        const sr = await finalizeSandbox(sandbox.sandboxRunId, { runBuild: true })
        await writeAudit({
          type: 'sandbox.finalized',
          summary: `任务「${task.title}」沙盒执行完成:${sr?.diffSummary ?? '无改动'}${
            sr?.buildResult ? `,build/test=${sr.buildResult}` : ''
          }`,
          actorId: assistant.id,
          taskId: task.id,
          missionId: task.missionId ?? null,
          payload: {
            runId: run.id,
            sandboxRunId: sandbox.sandboxRunId,
            diffSummary: sr?.diffSummary,
            buildResult: sr?.buildResult,
          },
        })
      } catch (e) {
        await failSandbox(sandbox.sandboxRunId, '收尾失败:' + (e as Error).message)
      }
    }

    // 状态:需审批 > 触工具上限(部分完成可继续) > 成功
    const status = approvalRequested
      ? 'needs_approval'
      : hitToolLimit
        ? 'needs_review'
        : 'succeeded'
    await prisma.taskRun.update({
      where: { id: run.id },
      data: {
        status,
        messageId: finalMsg.id,
        toolsUsed: JSON.stringify(toolsUsed),
        output: text.slice(0, 4000),
        endedAt: new Date(),
      },
    })
    // 需审批/触上限 → 任务停在进行中,等人工;成功 → 进入待复核交人类审查
    await prisma.task.update({
      where: { id: task.id },
      data: { status: approvalRequested || hitToolLimit ? 'doing' : 'review' },
    })
    await writeAudit({
      type: approvalRequested
        ? 'task.exec_needs_approval'
        : hitToolLimit
          ? 'task.exec_partial'
          : 'task.exec_succeeded',
      summary: approvalRequested
        ? `任务「${task.title}」需人工批准高危操作后才能继续`
        : hitToolLimit
          ? `任务「${task.title}」达工具调用上限,已生成部分报告(可继续执行)`
          : `${assistant.name} 完成任务「${task.title}」执行`,
      actorId: assistant.id,
      taskId: task.id,
      missionId: task.missionId ?? null,
      payload: { runId: run.id, tools: toolsUsed },
    })
    broadcastWorkspace()
    broadcastTasks()
    return { runId: run.id, status }
  } catch (e) {
    const errMsg = (e as Error).message || String(e)
    await prisma.taskRun
      .update({
        where: { id: run.id },
        data: { status: 'failed', error: errMsg.slice(0, 1000), endedAt: new Date() },
      })
      .catch(() => {})
    if (sandbox) await failSandbox(sandbox.sandboxRunId, errMsg.slice(0, 200))
    await prisma.message
      .update({
        where: { id: placeholder.id },
        data: { body: `(执行出错:${errMsg.slice(0, 300)})` },
        include: fullMessageInclude,
      })
      .then((m) =>
        sendToUsers(memberList, { type: 'message-updated', channelId, message: shapeMessage(m) }),
      )
      .catch(() => {})
    await prisma.task.update({ where: { id: task.id }, data: { status: 'todo' } }).catch(() => {})
    await writeAudit({
      type: 'task.exec_failed',
      summary: `任务「${task.title}」执行失败:${errMsg.slice(0, 120)}`,
      actorId: assistant.id,
      taskId: task.id,
      missionId: task.missionId ?? null,
      payload: { runId: run.id },
    })
    broadcastWorkspace()
    broadcastTasks()
    return { runId: run.id, status: 'failed' }
  } finally {
    RUNNING_CTRL.delete(run.id)
    sendStatus('')
  }
}

// ---- 任务:手动开始执行(指派给 AI 后,用户点击触发) ----
app.post('/api/tasks/:id/execute', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const { input } = (req.body ?? {}) as { input?: string }
  const r = await executeTask(id, {
    triggeredById: me.id,
    trigger: 'manual',
    input: input ?? null,
  })
  if ('error' in r) return reply.code(r.code).send({ error: r.error })
  // 缺信息(如查天气缺城市):返回 needs_input,前端补填后再次 execute(不创建 TaskRun)
  if ('needsInput' in r)
    return reply.send({ status: 'needs_input', field: r.field, prompt: r.prompt })
  return r
})

// ---- 任务:取消进行中的执行 ----
app.post('/api/tasks/:id/cancel', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const run = await prisma.taskRun.findFirst({
    where: { taskId: id, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!run) return reply.code(404).send({ error: 'no active run' })
  const ctrl = RUNNING_CTRL.get(run.id)
  if (ctrl) ctrl.abort()
  else {
    // controller 丢失(如重启)→ 兜底直接标记取消
    await prisma.taskRun.update({
      where: { id: run.id },
      data: { status: 'cancelled', error: '已取消', endedAt: new Date() },
    })
    await prisma.task.update({ where: { id }, data: { status: 'todo' } }).catch(() => {})
    broadcastWorkspace()
    broadcastTasks()
  }
  return { ok: true }
})

// ---- 任务执行记录:列表(可观察的执行历史) ----
app.get('/api/task-runs', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { taskId } = req.query as { taskId?: string }
  const where: Record<string, unknown> = {}
  if (taskId) where.taskId = taskId
  return prisma.taskRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: taskId ? 50 : 100,
  })
})

// ---- 任务执行详情/报告:集中聚合真实数据(状态/执行人/触发者/时间/AI 消息/
//      工具调用逐次输出/审批记录/最终 output·error/相关 DM/交付),供前端报告面板。 ----
app.get('/api/tasks/:id/report', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude })
  if (!task) return reply.code(404).send({ error: 'not found' })
  const [runs, approvals, audit, deliveries] = await Promise.all([
    prisma.taskRun.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.approvalRequest.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.auditEvent.findMany({ where: { taskId: id }, orderBy: { createdAt: 'asc' }, take: 200 }),
    prisma.delivery.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' } }),
  ])
  // 工具调用逐次输出:从 ai.tool_call 审计的 payload 还原(真实记录,非伪造)
  const toolCalls = audit
    .filter((e) => e.type === 'ai.tool_call')
    .map((e) => {
      let p: { tool?: string; output?: string; runId?: string } = {}
      try {
        p = e.payloadJson ? JSON.parse(e.payloadJson) : {}
      } catch {
        /* ignore */
      }
      return {
        id: e.id,
        tool: p.tool ?? '',
        output: p.output ?? '',
        runId: p.runId ?? null,
        actorId: e.actorId,
        createdAt: e.createdAt,
      }
    })
  // 最新一次执行的沙盒报告(状态/日志/diff/build·test/产物),供报告面板与 apply/discard
  const latestRun = runs[0]
  const sandbox = latestRun ? await getSandboxByTaskRun(latestRun.id) : null
  return { task, runs, approvals, audit, deliveries, toolCalls, sandbox }
})

// ---- 沙盒报告:按 TaskRun 取隔离执行详情(状态/命令日志/diff/build·test/产物) ----
app.get('/api/task-runs/:runId/sandbox-report', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { runId } = req.params as { runId: string }
  const report = await getSandboxByTaskRun(runId)
  if (!report) return reply.code(404).send({ error: 'no sandbox for this run' })
  return report
})

// ---- 沙盒:人工批准应用到主项目(dry-run 校验 + 拒敏感/生成文件 + 写 AuditEvent)----
app.post('/api/task-runs/:runId/apply', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { runId } = req.params as { runId: string }
  const sr = await prisma.sandboxRun.findFirst({
    where: { taskRunId: runId },
    orderBy: { createdAt: 'desc' },
  })
  if (!sr) return reply.code(404).send({ error: 'no sandbox for this run' })
  if (sr.status !== 'ready_for_review')
    return reply.code(400).send({ error: `沙盒状态为 ${sr.status},仅 ready_for_review 可应用` })
  const out = await applySandbox(sr.id, me.id)
  if ('error' in out) return reply.code(out.code ?? 400).send({ error: out.error })
  await writeAudit({
    type: 'sandbox.applied',
    summary: `${me.name} 批准应用沙盒变更到主项目:写回 ${out.result.applied.length} 文件${
      out.result.blocked.length ? `,拦截 ${out.result.blocked.length}` : ''
    }`,
    actorId: me.id,
    taskId: sr.taskId,
    missionId: sr.missionId,
    payload: {
      runId,
      sandboxRunId: sr.id,
      applied: out.result.applied,
      blocked: out.result.blocked,
      skippedDeletions: out.result.skippedDeletions,
    },
  })
  // 成功应用 → 任务进入 review(待人类审查 / 生成交付)
  if (sr.taskId)
    await prisma.task.update({ where: { id: sr.taskId }, data: { status: 'review' } }).catch(() => {})
  broadcastWorkspace()
  broadcastTasks()
  return { ok: true, applied: out.result.applied, blocked: out.result.blocked, skippedDeletions: out.result.skippedDeletions }
})

// ---- 沙盒:丢弃(删除隔离工作区,主项目不变,写 AuditEvent)----
app.post('/api/task-runs/:runId/discard', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { runId } = req.params as { runId: string }
  const sr = await prisma.sandboxRun.findFirst({
    where: { taskRunId: runId },
    orderBy: { createdAt: 'desc' },
  })
  if (!sr) return reply.code(404).send({ error: 'no sandbox for this run' })
  const out = await discardSandbox(sr.id, me.id)
  if ('error' in out) return reply.code(out.code ?? 400).send({ error: out.error })
  await writeAudit({
    type: 'sandbox.discarded',
    summary: `${me.name} 丢弃任务沙盒,主项目未改变`,
    actorId: me.id,
    taskId: sr.taskId,
    missionId: sr.missionId,
    payload: { runId, sandboxRunId: sr.id },
  })
  broadcastWorkspace()
  return { ok: true }
})

// ---- 任务执行:继续执行(触工具上限/失败后,在同一沙盒接着做)----
app.post('/api/task-runs/:runId/continue', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { runId } = req.params as { runId: string }
  const run = await prisma.taskRun.findUnique({ where: { id: runId } })
  if (!run) return reply.code(404).send({ error: 'run not found' })
  // 复用上次沙盒(若仍在,未 apply/discard)
  const sr = await prisma.sandboxRun.findFirst({
    where: { taskRunId: runId },
    orderBy: { createdAt: 'desc' },
  })
  const reuse =
    sr && sr.status !== 'applied' && sr.status !== 'discarded' && existsSync(sr.workspacePath)
      ? sr.id
      : undefined
  const r = await executeTask(run.taskId, {
    triggeredById: me.id,
    trigger: 'continue',
    forceAssistantId: run.assistantId ?? undefined,
    reuseSandboxRunId: reuse,
  })
  if ('error' in r) return reply.code(r.code).send({ error: r.error })
  if ('needsInput' in r) return reply.send({ status: 'needs_input', field: r.field, prompt: r.prompt })
  return r
})

// ---- 沙盒运行:最近列表(工作台「沙盒运行」区域用,带任务标题)----
app.get('/api/sandbox-runs', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { limit } = req.query as { limit?: string }
  const take = Math.min(Math.max(Number(limit) || 12, 1), 50)
  const runs = await prisma.sandboxRun.findMany({ orderBy: { createdAt: 'desc' }, take })
  const taskIds = [...new Set(runs.map((r) => r.taskId).filter(Boolean) as string[])]
  const tasks = taskIds.length
    ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } })
    : []
  const titleOf = new Map(tasks.map((t) => [t.id, t.title]))
  const iso = detectIsolation()
  return {
    isolation: iso,
    runs: runs.map((r) => ({ ...r, taskTitle: r.taskId ? titleOf.get(r.taskId) ?? null : null })),
  }
})

// ---- 沙盒隔离强度(诚实标注:有 Docker 才强隔离,否则本机信任沙盒)----
app.get('/api/sandbox/isolation', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  return detectIsolation()
})

// ---- 任务:推荐执行人(按意图+技能自动选择合适 AI)----
app.get('/api/tasks/:id/suggest-assignee', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) return reply.code(404).send({ error: 'not found' })
  const intent = analyzeTaskIntent(task)
  let pick: { id: string; name: string } | null = null
  let reason = ''
  if (intent.requiredAny.length) {
    const p = await pickExecutor(intent.requiredAny)
    if (p) {
      pick = { id: p.id, name: p.name }
      const caps = intent.requiredAny
        .map((s) => (s === 'fetch_url' ? '联网' : s === 'run_command' ? '执行命令' : s))
        .join('/')
      reason = `任务需要 ${caps} 能力,推荐具备该能力且已配置可用模型的助手`
    }
  }
  if (!pick) {
    // 通用:可用、非图像模型、技能最全的助手
    const all = await prisma.user.findMany({ where: { isAssistant: true } })
    const ranked = all
      .filter((a) => !isImageModel(a.model))
      .filter((a) =>
        canGenerate({ provider: a.provider, baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model }),
      )
      .sort((x, y) => parseSkills(y.skills).length - parseSkills(x.skills).length)
    const p = ranked[0]
    if (p) {
      pick = { id: p.id, name: p.name }
      reason = '已配置可用模型、技能较全的助手'
    }
  }
  if (!pick) return { assistantId: null, reason: '当前没有已配置可用模型的 AI 助手,请先给助手填好端点/模型' }
  return { assistantId: pick.id, name: pick.name, reason }
})

// ---- 人工审批:待审批列表(高危能力) ----
app.get('/api/approvals', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { status } = req.query as { status?: string }
  return prisma.approvalRequest.findMany({
    where: { status: status || 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
})

// ---- 人工审批:批准 / 拒绝(批准后自动续跑并放行该能力) ----
app.patch('/api/approvals/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as { status?: string }
  if (!b.status || !['approved', 'rejected'].includes(b.status))
    return reply.code(400).send({ error: 'invalid status' })
  const ap = await prisma.approvalRequest.findUnique({ where: { id } })
  if (!ap) return reply.code(404).send({ error: 'not found' })
  if (ap.status !== 'pending') return reply.code(400).send({ error: 'already decided' })
  const updated = await prisma.approvalRequest.update({
    where: { id },
    data: { status: b.status, decidedById: me.id, decidedAt: new Date() },
  })
  await writeAudit({
    type: 'approval.decided',
    summary: `${b.status === 'approved' ? '批准' : '拒绝'}高危能力 ${ap.capability}${
      ap.command ? ':' + ap.command.slice(0, 100) : ''
    }`,
    actorId: me.id,
    taskId: ap.taskId,
    missionId: ap.missionId,
    payload: { capability: ap.capability, status: b.status, approvalId: ap.id },
  })
  broadcastWorkspace()
  if (b.status === 'approved' && ap.taskId) {
    // 自动续跑:放行 run_command,新建一次 trigger=approval 的执行。
    // forceAssistantId 复用发起审批的执行人(可能是经路由替换 assignee 的助手),并跳过补信息/再路由。
    void executeTask(ap.taskId, {
      triggeredById: me.id,
      trigger: 'approval',
      allowRunCommand: true,
      forceAssistantId: ap.requestedById ?? undefined,
    }).catch((e) => console.error('[approval-continue]', e))
  } else if (b.status === 'rejected' && ap.taskId) {
    // 拒绝:把仍 needs_approval 的执行标记取消,任务退回待办
    await prisma.taskRun.updateMany({
      where: { taskId: ap.taskId, status: 'needs_approval' },
      data: { status: 'cancelled', error: '人工拒绝高危操作', endedAt: new Date() },
    })
    await prisma.task.update({ where: { id: ap.taskId }, data: { status: 'todo' } }).catch(() => {})
    broadcastWorkspace()
    broadcastTasks()
  }
  return updated
})

// ---- 能力分层 / 权限矩阵(诚实声明可用/需审批/未实现) ----
app.get('/api/capabilities', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  return CAPABILITIES
})

const port = Number(process.env.PORT ?? 5373)
app
  .listen({ port, host: '127.0.0.1' })
  .then(() => console.log(`[helio-clone] server on http://127.0.0.1:${port}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
