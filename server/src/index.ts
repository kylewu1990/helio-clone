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
import { buildProjectContext } from './context.js'
import { ensureL2, appendL2, appendEpisodic, loadMemories } from './memory.js'
import {
  canGenerate,
  generateReply,
  pickResponders,
  breakdownGoal,
  planWorkflow,
  publicProviders,
  toolRoundsFor,
  type ChatMsg,
} from './ai.js'
import { ASSISTANT_PRESETS } from './presets.js'
import { QUICK_TEMPLATES, getTemplate, type TemplateStep, type StepPrefer } from './templates.js'
import { skillCatalog, runTool, setAutoExecAfterCreateTaskHook } from './skills.js'
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

// ===== v2 Algorithm Graph =====
// Heliox 自有 verb 词表(10 个):
//   assigns / delegates / reviews / approves / supplies
//   feeds / depends_on / blocked_by / delivers_to / monitors
// 节点 kind 词表(8 个):task / agent / delivery / progress / a2a_response / tool / approval / optimizer
export type EdgeVerb =
  | 'assigns'
  | 'delegates'
  | 'reviews'
  | 'approves'
  | 'supplies'
  | 'feeds'
  | 'depends_on'
  | 'blocked_by'
  | 'delivers_to'
  | 'monitors'

export type NodeKind =
  | 'task'
  | 'agent'
  | 'delivery'
  | 'progress'
  | 'a2a_response'
  | 'tool'
  | 'approval'
  | 'optimizer'

/**
 * 写一条 Edge 并(若有 channel)广播 WS。
 * 失败不阻塞主流程(图谱是观测,不是事务必要项)。
 */
async function writeEdge(input: {
  channelId?: string | null
  fromKind: NodeKind
  fromId: string
  toKind: NodeKind
  toId: string
  verb: EdgeVerb
  weight?: number
  why?: unknown // 自由形态,会 JSON.stringify;前端 Why panel 展示
}): Promise<void> {
  try {
    const edge = await prisma.edge.create({
      data: {
        channelId: input.channelId ?? null,
        fromKind: input.fromKind,
        fromId: input.fromId,
        toKind: input.toKind,
        toId: input.toId,
        verb: input.verb,
        weight: input.weight ?? null,
        whyJson: input.why != null ? JSON.stringify(input.why) : null,
      },
    })
    if (input.channelId) {
      const members = await memberIds(input.channelId)
      sendToUsers(members, {
        type: 'edge-created',
        channelId: input.channelId,
        edge: {
          id: edge.id,
          channelId: edge.channelId,
          fromKind: edge.fromKind,
          fromId: edge.fromId,
          toKind: edge.toKind,
          toId: edge.toId,
          verb: edge.verb,
          weight: edge.weight,
          whyJson: edge.whyJson,
          createdAt: edge.createdAt,
        },
      })
    }
  } catch (e) {
    console.error('[edge-write]', e)
  }
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
// 解析卡片 JSON(进度卡 / 交付卡);损坏则返回 null,不影响消息渲染
function safeParseCard(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

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
    // Channel-First:进度卡 / 交付卡。type 标识卡片种类,card 是解析后的结构化数据。
    type: m.type ?? null,
    card: m.cardJson ? safeParseCard(m.cardJson) : null,
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

// ===== A2A Channel-First 协作:@AI 触发器 =====
// 频道里被 @ 的 AI = 触发它加入协作。两条路:
//  ① 「做东西」请求 + 有执行能力 → 真实任务执行(沙盒 + 进度卡 + 交付卡落本频道);
//  ② 评审 / 对话 / 质疑 → 读频道上下文(含他人进度卡 / 交付卡)生成回应。
const A2A_EXEC_SKILLS = [
  'write_file',
  'run_command',
  'browser_open',
  'browser_click',
  'browser_console',
  'browser_screenshot',
  'browser_type',
]
function assistantHasExecSkills(a: { skills?: string | null }): boolean {
  return parseSkills(a.skills).some((x) => A2A_EXEC_SKILLS.includes(x))
}
// H1(v3 Phase B):build intent 词表改为可维护的 verb 数组,启动时 join 成正则。
// 中文优先 + 1 个常见错字容错(见→建,仅与 BUILD_TARGET 同现时生效)。新加项在末尾加注释说明出处即可。
const BUILD_INTENT_VERBS = [
  // 经典动词
  '做', '搭', '搭建', '构建', '建',
  // "一/个"可省口语:建一个 / 来一个 / 弄一个 / 整一个 / 上一个 / 搞一个
  '建一?个', '来一?个', '搞一?个', '弄一?个', '整一?个', '上一?个',
  // 试试/写个/生成/开发/创建/实现 等
  '试试', '写一?个', '生成', '开发', '创建', '实现',
  // 求助式
  '给我做', '帮做', '帮我做', '帮.{0,3}做一?个',
  // 错字容错:见一?个(用户实测把 "建" 打成 "见":让我们来见一个英语学习网站)
  '见一?个',
  // 英文
  'build', 'create', 'make', 'implement', 'generate', 'develop', 'code', 'coding', 'set\\s+up',
]
const BUILD_INTENT_RE = new RegExp(`(${BUILD_INTENT_VERBS.join('|')})`, 'i')
const BUILD_TARGET_RE = /(网页|页面|网站|主页|web|html|页|组件|component|脚本|script|程序|app|应用|demo|小游戏|游戏|game|表格|图表|landing|计算器|calculator|todo|待办|动画|卡片|表单|form|站|工具|tool|小工具|系统|system|后台|面板|看板|dashboard|admin|chart|widget|site|page)/i
const REVIEW_INTENT_RE = /(review|评审|审查|检查|看一[下看]|看看|复审|过一遍|提意见|质疑|有什么问题|帮.*看)/i
// 是否「让 AI 真正做东西」的请求(评审类优先排除,避免把「review 这个页面」误判成重做)
function looksLikeBuildRequest(text: string): boolean {
  if (REVIEW_INTENT_RE.test(text)) return false
  return BUILD_INTENT_RE.test(text) && BUILD_TARGET_RE.test(text)
}
// 从交付卡 previewUrl 解析沙盒入口文件内容(供 A2A 评审 AI 真正读到代码,而不是只能看摘要)
async function readDeliveredEntry(card: DeliveryCardData): Promise<string | null> {
  const m = (card.previewUrl || '').match(/\/api\/sandbox-runs\/([^/]+)\/preview\/(.+)$/)
  if (!m) return null
  const [, sandboxRunId, rel] = m
  try {
    const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
    if (!run?.workspacePath) return null
    const abs = pathResolve(run.workspacePath, decodeURIComponent(rel))
    const wsNorm = run.workspacePath.replace(/\/$/, '') + '/'
    if (abs !== run.workspacePath && !abs.startsWith(wsNorm)) return null
    if (!existsSync(abs)) return null
    return readFileSync(abs, 'utf8').slice(0, 2600)
  } catch {
    return null
  }
}

// A2A 响应卡(D1 设计深钻):标记当前消息是「AI 对另一个 AI 的频道交付/进度的回应」,
// 让 MessageRow 可视化协作链(左侧 accent 标线 + ↩ header)。
// D7 设计深钻:intent 把「评审 / 继续开发 / 质疑 / 一般」分色,协作链一眼可读。
type A2AIntent = 'review' | 'build' | 'question' | 'general'
type A2AResponseCardData = {
  kind: 'a2a_response'
  respondTo: string // 被回应的 AI 名(用于 ↩ header「审查 X 的交付」)
  respondToKind: 'delivery' | 'progress' | null
  respondToMessageId: string | null
  intent?: A2AIntent
}

// D7 关键词识别 A2A 回应的意图,基于被 @ 的真人触发文本(评审 / 继续开发 / 质疑)。
// 顺序敏感:question 用更明确的疑问标记(避免「为什么不优化」误判);其余按关键词命中。
function detectA2AIntent(triggerBody: string): A2AIntent {
  const t = (triggerBody || '').toLowerCase()
  if (/[?\?]|\b(why|how|what|为什么|怎么|什么意思|不理解|质疑|存疑)\b/.test(t)) return 'question'
  if (/(评审|审查|review|审核|建议|改进|优化|有什么问题|挑挑|挑刺|挑毛病)/i.test(t)) return 'review'
  if (/(继续|build|开发|实现|加上|做一下|做个|写个|补充|完善|继续做|接着做)/i.test(t)) return 'build'
  return 'general'
}

// v3:旧 buildA2AContext 已被 buildProjectContext 取代(L1+L2+元+L3+历史+state),
//   A2A 响应目标识别移到 maybeTriggerAssistants 内联逻辑;A2AResponseCardData 类型仍在 schema.prisma 注释里。

// ===== H2(v3 Phase B):项目频道 auto-assign =====
// 「频道里没人 @、但说了做 X」时,系统替项目 owner 自动派一个 executor 起跑 executeTask。
// pickAutoExecutor:在频道内 assistants 子集里选,要求有 exec 技能 + 模型可用 + 非图像 + 不在主动冷却。
// 复用 rankAssistantsForStep(prefer=engineer + penalizeManager) 给经理类降权。
function pickAutoExecutor(
  channelAssistants: any[],
  channelId: string,
): any | null {
  const eligible = channelAssistants.filter(
    (a) =>
      assistantHasExecSkills(a) &&
      !isImageModel(a.model) &&
      !autoOnCooldown(channelId, a.id) &&
      canGenerate({
        provider: a.provider,
        baseUrl: a.baseUrl,
        apiKey: a.apiKey,
        model: a.model,
      }),
  )
  if (!eligible.length) return null
  // 复用 rankAssistantsForStep:requiredAny 用 A2A_EXEC_SKILLS,prefer engineer + 给经理降权
  const ranked = rankAssistantsForStep(
    { requiredAny: A2A_EXEC_SKILLS, prefer: 'engineer', penalizeManager: true },
    eligible as AssistantRow[],
    null,
  )
  return ranked[0]?.a ?? null
}

// 「没人能开工」提示的去抖窗口(同频道 5 分钟内只提醒一次,避免 owner 连发刷屏)
const NO_EXECUTOR_NOTICE_MS = 5 * 60 * 1000
const lastNoExecutorNoticeAt = new Map<string, number>()

// export 给 smoke 脚本(v3c-smoke 场景 Z 验证 H2 cede 路径)。
export async function maybeTriggerAssistants(
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

  // strict:false 下,channel.members 内联类型推断会丢失;显式取 user 数组并标 any[] 让后续访问保留。
  const assistants: any[] = channel.members
    .map((m: any) => m.user)
    .filter((u: any) => u.isAssistant)
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

  // ===== H2 auto-assign 分支(在主动响应/A2A 之前)=====
  // 项目频道 + 真人 + 顶层 + 无 @ + build intent → 系统替 owner 直接派一个 executor 起跑 executeTask。
  // 命中且选到 executor:建 Task / writeAudit / writeEdge / post auto_assign_notice / executeTask,然后早返回。
  // 命中但选不到 executor:post 一条结构化提示卡(5min 防刷),并继续走原路径(AI 还能讨论)。
  // 未命中(非 project / 有 @ / 不是 build 意图):什么都不做,继续原路径,保留 v1/v2/v3 Phase A 全部行为。
  if (
    (channel as any).kind === 'project' &&
    !trigger.parentId &&
    !trigger.authorIsAssistant &&
    trigger.authorId &&
    !mentions.directed &&
    looksLikeBuildRequest(trigger.body)
  ) {
    const executor = pickAutoExecutor(assistants, channelId)
    if (executor) {
      const authorName =
        channel.members.find((m) => m.userId === trigger.authorId)?.user.name ?? '某人'
      const title = trigger.body.slice(0, 200)
      const task = await prisma.task.create({
        data: {
          title,
          status: 'todo',
          channelId,
          assigneeId: executor.id,
          createdById: trigger.authorId,
        },
      })
      await writeAudit({
        type: 'a2a.auto_assigned',
        summary: `项目频道 #${channel.name}:无 @ + build intent,系统替 ${authorName} 派给 ${executor.name} 开工`,
        actorId: trigger.authorId,
        taskId: task.id,
        payload: {
          channelId,
          assistantId: executor.id,
          trigger: 'auto_assign_project_channel',
          snippet: trigger.body.slice(0, 200),
        },
      })
      // v2 Edge:用户 → task (assigns,自动派) + task → executor (delegates,auto)
      await writeEdge({
        channelId,
        fromKind: 'agent',
        fromId: trigger.authorId,
        toKind: 'task',
        toId: task.id,
        verb: 'assigns',
        why: {
          reason: 'auto_assigned_project_channel',
          executor: executor.name,
          executor_role: roleClassOf(executor),
          snippet: trigger.body.slice(0, 120),
        },
      })
      await writeEdge({
        channelId,
        fromKind: 'task',
        fromId: task.id,
        toKind: 'agent',
        toId: executor.id,
        verb: 'delegates',
        why: { reason: 'auto_assigned_project_channel', auto: true },
      })
      // 频道里 post 一张轻量"已自动派"提示卡(executor 作为 author,新 type='auto_assign_notice')
      try {
        const noticeData = {
          kind: 'auto_assign_notice' as const,
          taskId: task.id,
          executorId: executor.id,
          executorName: executor.name,
          triggerAuthorName: authorName,
          snippet: trigger.body.slice(0, 200),
        }
        const noticeMsg = await prisma.message.create({
          data: {
            channelId,
            authorId: executor.id,
            body: `收到 ${authorName} 的需求「${title}」,我开工。进度看下方进度卡,Tasks 标签也能看到。`,
            type: 'auto_assign_notice',
            cardJson: JSON.stringify(noticeData),
          },
          include: fullMessageInclude,
        })
        sendToUsers(memberIdList, {
          type: 'message',
          channelId,
          message: shapeMessage(noticeMsg),
        })
      } catch (e) {
        console.error('[auto-assign-notice]', e)
      }
      void executeTask(task.id, {
        triggeredById: trigger.authorId,
        trigger: 'auto', // H2 是系统自动派,与 'mention'(显式 @)区分,避免污染 TaskRun.trigger 与 audit payload
        channelId,
        mentionAuthorName: authorName,
      }).catch((e) => console.error('[auto-assign-exec]', e))
      return // 早返回:不再走 A2A / 主动响应路径
    }
    // J4 硬约束:命中 build intent 但频道里没合格 executor →
    //   1) 5min 去抖 post 一张 system_no_executor 提示卡
    //   2) 把触发消息所有职能 AI 加入 cededBy(已读未回,展示透明)
    //   3) 早 return,不再让职能 AI generateReply 文字混过去(用户痛点 #3:"AI 都在讨论但没人动手")
    const lastNotice = lastNoExecutorNoticeAt.get(channelId) ?? 0
    if (Date.now() - lastNotice > NO_EXECUTOR_NOTICE_MS) {
      lastNoExecutorNoticeAt.set(channelId, Date.now())
      const helperAssistant = assistants.find((a) => !isImageModel(a.model)) ?? assistants[0]
      if (helperAssistant) {
        try {
          const helpData = {
            kind: 'auto_assign_notice' as const,
            taskId: null,
            executorId: null,
            executorName: null,
            triggerAuthorName:
              channel.members.find((m) => m.userId === trigger.authorId)?.user.name ?? '某人',
            snippet: trigger.body.slice(0, 200),
            reason: 'no_executor',
          }
          const tip = await prisma.message.create({
            data: {
              channelId,
              authorId: helperAssistant.id,
              body:
                '项目缺执行成员,无法自动开工。请到频道设置加入「软件工程师」或类似具备 write_file / run_command 技能的 AI。',
              type: 'system_no_executor',
              cardJson: JSON.stringify(helpData),
            },
            include: fullMessageInclude,
          })
          sendToUsers(memberIdList, {
            type: 'message',
            channelId,
            message: shapeMessage(tip),
          })
        } catch (e) {
          console.error('[auto-assign-no-executor-tip]', e)
        }
      }
    }
    // 无论是否去抖跳过提示卡,都要把触发消息标记为「全频道 cede」并早 return,
    // 否则 5min 内的后续 build intent 仍会让职能 AI 文字混过去。
    if (trigger.messageId) {
      const cededNames = assistants.map((a) => a.name)
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
    await writeAudit({
      type: 'h2.no_executor_cede',
      summary: `项目频道 #${channel.name}:build intent 命中但无 executor,全频道 cede,不让职能 AI 混过去`,
      actorId: trigger.authorId ?? null,
      payload: { channelId, snippet: trigger.body.slice(0, 200), cededCount: assistants.length },
    })
    return // 早返回:不再走 A2A / 主动响应 / proactive 分支
  }

  // 主动响应:仅当「真人 + 顶层 + 整条消息没有任何 @」时才路由
  // (一旦 @ 了任何人——真人或 AI——即视为定向对话,未被点名的助手严格静默,不抢答)
  let routedIds = new Set<string>()
  if (
    !trigger.authorIsAssistant &&
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
  // - 真人发:被 @ 的助手(强信号,绕过开关/冷却/key) + 主动路由选中的(按此先后)
  // - 助手发:仅被 @ 的助手,且受链深限制(多助手协作防循环)
  let responderIds: string[]
  if (trigger.authorIsAssistant) {
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
      // A2A Channel-First:频道里被显式 @ 的、有执行能力的助手,收到「做东西」请求 →
      // 走真实任务执行(沙盒 + 进度卡 + 交付卡落本频道),而不是只回一句话。评审/对话仍走下方对话回复。
      if (
        !trigger.parentId &&
        targetIds.includes(rid) &&
        trigger.authorId &&
        looksLikeBuildRequest(trigger.body) &&
        assistantHasExecSkills(a)
      ) {
        sendStatus('') // executeTask 会自行广播执行状态
        const title = trigger.body.replace(/@[^\s@,，。、!！?？:：;；]+/g, '').trim().slice(0, 200) || trigger.body.slice(0, 200)
        const authorName = channel.members.find((m) => m.userId === trigger.authorId)?.user.name
        const task = await prisma.task.create({
          data: { title, status: 'todo', channelId, assigneeId: a.id, createdById: trigger.authorId },
        })
        await writeAudit({
          type: 'a2a.exec_triggered',
          summary: `${authorName ?? '某人'} 在频道 @${a.name} 触发执行:${title}`,
          actorId: trigger.authorId,
          taskId: task.id,
          payload: { channelId, assistantId: a.id },
        })
        // v2 Edge 触发点 #1:用户 → task (assigns) + task → agent (delegates)
        await writeEdge({
          channelId,
          fromKind: 'agent', // 触发者(若是真人也按 agent 节点画;前端按 user.isAssistant 区分视觉)
          fromId: trigger.authorId,
          toKind: 'task',
          toId: task.id,
          verb: 'assigns',
          why: { reason: 'a2a_build_mention', mention: a.name, snippet: trigger.body.slice(0, 120) },
        })
        await writeEdge({
          channelId,
          fromKind: 'task',
          fromId: task.id,
          toKind: 'agent',
          toId: a.id,
          verb: 'delegates',
          why: { reason: 'a2a_build_mention', assignee: a.name, looksLikeBuildRequest: true },
        })
        void executeTask(task.id, {
          triggeredById: trigger.authorId,
          trigger: 'mention',
          channelId,
          mentionAuthorName: authorName,
        }).catch((e) => console.error('[a2a-exec]', e))
        continue // 不再走对话生成,交付通过进度卡/交付卡在频道呈现
      }

      const skills = parseSkills(a.skills)
      // v3 G3:project 频道里 ensure L2 项目记忆;feeds edge 在 buildProjectContext 实际注入时再写。
      if ((channel as any).kind === 'project') {
        await ensureL2(a.id, channelId, {
          goal: (channel as any).goal,
          scope: (channel as any).scope,
          phase: (channel as any).phase,
          ownerName: null,
        }).catch((e) => console.error('[ensure-l2]', e))
      }
      // D7:触发文本识别 A2A intent(review/build/question/general),写入 message.cardJson 给前端着色;
      //   被 @ 进非 DM 频道时才视为 A2A 回应。
      const detectedIntent =
        targetIds.includes(rid) ? detectA2AIntent(trigger.body) : null
      const a2aTarget = await (async () => {
        if (detectedIntent === null) return null
        // 找最近一张他人的 delivery/progress 作为响应目标(原 buildA2AContext 的核心数据)
        const target: any = await prisma.message.findFirst({
          where: {
            channelId,
            type: { in: ['progress_card', 'delivery_card'] },
            authorId: { not: a.id },
          },
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { name: true } } },
        })
        if (!target) return null
        return {
          kind: 'a2a_response' as const,
          respondTo: target.author.name,
          respondToKind: target.type === 'delivery_card' ? 'delivery' : 'progress',
          respondToMessageId: target.id,
          intent: detectedIntent,
        }
      })()

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
      // D1:若是 A2A 回应(被@ 进非 DM 频道,且能定位响应目标),placeholder 起就打标,前端立即画链标线。
      // v2 whyJson:把 A2A intent 命中的关键词也写进 message.whyJson(可解释性)
      const a2aWhy = a2aTarget
        ? {
            reason: 'a2a_response',
            intent: a2aTarget.intent,
            respondTo: a2aTarget.respondTo,
            respondToKind: a2aTarget.respondToKind,
            triggerSnippet: trigger.body.slice(0, 120),
          }
        : null
      // v3 G4:统一上下文(L1 + L2 + 元 + L3 + 历史 + 当前状态 + trigger)。
      // 替换原"buildHistory + a2aHint 拼接"分散调用,所有信息走一个入口,whyJson 留可解释性数据。
      const ctx = await buildProjectContext({
        agentId: a.id,
        channelId,
        triggerMessageId: trigger.messageId ?? null,
      })
      const placeholder = await prisma.message.create({
        data: {
          channelId,
          authorId: a.id,
          body: '',
          parentId: trigger.parentId,
          // v3:project context whyJson 默认挂上;A2A 响应覆盖为更具体的 a2aWhy
          whyJson: a2aWhy ? JSON.stringify(a2aWhy) : ctx.whyJson,
          ...(a2aTarget
            ? {
                type: 'a2a_response' as const,
                cardJson: JSON.stringify(a2aTarget),
              }
            : null),
        },
        include: fullMessageInclude,
      })
      broadcastNew(shapeMessage(placeholder))

      // v2 Edge 触发点 #2:A2A 回应消息 → 边
      // intent=review → 'reviews';build → 'delegates'(也算继续派活);question → 'monitors';general → 'feeds'
      if (a2aTarget && a2aTarget.respondToMessageId) {
        const verb: EdgeVerb =
          a2aTarget.intent === 'review'
            ? 'reviews'
            : a2aTarget.intent === 'build'
              ? 'delegates'
              : a2aTarget.intent === 'question'
                ? 'monitors'
                : 'feeds'
        await writeEdge({
          channelId,
          fromKind: 'a2a_response',
          fromId: placeholder.id,
          toKind: a2aTarget.respondToKind === 'delivery' ? 'delivery' : 'progress',
          toId: a2aTarget.respondToMessageId,
          verb,
          why: a2aWhy,
        })
      }

      const genCtrl = registerGen(channelId)
      // v3 G4:从 buildProjectContext 输出里取 system + 非 system 消息;
      //   system 合并为单条 systemPrompt 给 generateReply(向后兼容签名)。
      const systemContent = ctx.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n---\n\n')
      const sysPrompt = systemContent || withMemory(a) || ''
      const dialogMessages = ctx.messages.filter((m) => m.role !== 'system')
      // v2 欠债 feeds:写一条 memory → agent 的 feeds 边(本次 LLM 调用真实消费了 L2/L3)
      if (ctx.stats.l2Chars + ctx.stats.l3Chars > 0) {
        await writeEdge({
          channelId,
          fromKind: 'optimizer', // 复用既有 NodeKind:把 memory 视为给 agent "喂入"的源(无专门 memory 节点,前端 graph 不会孤儿)
          fromId: `memory:${a.id}:${channelId}`,
          toKind: 'agent',
          toId: a.id,
          verb: 'feeds',
          weight: ctx.stats.l2Chars + ctx.stats.l3Chars,
          why: { reason: 'memory_injected', stats: ctx.stats },
        }).catch((e) => console.error('[feeds-edge]', e))
      }
      const { text, toolsUsed, eventId } = await generateReply({
        provider: a.provider,
        baseUrl: a.baseUrl,
        apiKey: a.apiKey,
        systemPrompt: sysPrompt,
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
        messages: dialogMessages,
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
      // v3 G3 L3:每次 AI 在频道发完消息后,追加一条情节摘要(prepend,最近在上)。
      //   project 频道总是写;非 project 频道也写(有助于跨场景持续),不强制 channel.kind。
      try {
        const ep = `${a.name} 回复 [${trigger.body.slice(0, 60).replace(/\s+/g, ' ')}]:${text.slice(0, 100).replace(/\s+/g, ' ')}`
        await appendEpisodic(a.id, channelId, ep, {
          reason: 'assistant_reply',
          messageId: finalMsg.id,
          triggerSnippet: trigger.body.slice(0, 80),
          tools: toolsUsed,
          a2aIntent: a2aTarget?.intent ?? null,
        })
        // L3 更新通知前端(memory tab 实时刷新)
        sendToUsers(memberIdList, { type: 'memory-updated', channelId, agentId: a.id, level: 3 })
      } catch (e) {
        console.error('[append-l3]', e)
      }
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

// ---- 健康检查(K2):无副作用,可用于探活、容器健康、负载均衡 ----
app.get('/api/health', async () => ({
  ok: true,
  service: 'helio-clone-server',
  uptimeSec: Math.round(process.uptime()),
  ts: new Date().toISOString(),
}))

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
    select: { channelId: true, channel: { select: { id: true } } },
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
    .filter((m: any) => m.channel) // v4:DM 已不存在,无需再过滤 isDM
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

  // 改频道:diff 频道成员(v4 无 DM)
  if (b.channelIds !== undefined) {
    const current = await prisma.channelMember.findMany({
      where: { userId: id },
      select: { channelId: true },
    })
    const cur = new Set(current.map((c: any) => c.channelId as string))
    const want = new Set(b.channelIds as string[])
    const toAdd = [...want].filter((c) => !cur.has(c))
    const toRemove = [...cur].filter((c: string) => !want.has(c))
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
  // v4:DM 已不存在,无需清理孤儿 DM 频道
  await prisma.user.delete({ where: { id } })
  return { ok: true }
})

// ---- v4:Agent profile(只读资料卡)----
// 不创建任何 channel,纯查询接口。供前端 /agent/:id 页消费。
app.get('/api/agents/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return reply.code(404).send({ error: 'agent not found' })
  if (!user.isAssistant) return reply.code(400).send({ error: 'user is not an assistant' })

  // 角色 / persona / L1 摘要(systemPrompt 前 240 字)
  const systemPromptSummary =
    (user.systemPrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 240) || null

  // L2 / L3 记忆(按频道分组)
  const memories: any[] = await prisma.memory.findMany({
    where: { agentId: id, level: { in: [2, 3] } },
    include: { channel: { select: { id: true, name: true, kind: true } } },
    orderBy: { updatedAt: 'desc' },
  })
  type AgentMemoryEntry = {
    channelId: string
    channelName: string
    l2?: { content: string; updatedAt: Date }
    l3?: { content: string; updatedAt: Date }
  }
  const byChannel = new Map<string, AgentMemoryEntry>()
  for (const m of memories) {
    if (!m.channel) continue
    const cur: AgentMemoryEntry =
      byChannel.get(m.channelId) ?? {
        channelId: m.channelId,
        channelName: m.channel.name,
      }
    if (m.level === 2) cur.l2 = { content: m.content, updatedAt: m.updatedAt }
    if (m.level === 3) cur.l3 = { content: m.content, updatedAt: m.updatedAt }
    byChannel.set(m.channelId, cur)
  }
  const projectMemories = Array.from(byChannel.values())

  // 当前 active task(across all projects):状态 in (todo / doing) 取最近一条
  const activeTask = await prisma.task.findFirst({
    where: { assigneeId: id, status: { in: ['todo', 'doing'] } },
    include: { channel: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  // 最近 5 个 Delivery(taskId 关联到该 assignee)
  const myTaskIds = (
    await prisma.task.findMany({ where: { assigneeId: id }, select: { id: true } })
  ).map((t: any) => t.id)
  const recentDeliveries = myTaskIds.length
    ? await prisma.delivery.findMany({
        where: { taskId: { in: myTaskIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
    : []

  // 在哪些项目里活跃:ChannelMember + 近 7 日有消息 / TaskRun
  const myChannels = await prisma.channelMember.findMany({
    where: { userId: id, channel: { kind: 'project', archivedAt: null } },
    include: { channel: { select: { id: true, name: true, phase: true, goal: true } } },
  })
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const activeChannels = await Promise.all(
    myChannels.map(async (m: any) => {
      const lastMsg = await prisma.message.findFirst({
        where: { channelId: m.channelId, authorId: id, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      return {
        id: m.channel.id,
        name: m.channel.name,
        phase: m.channel.phase,
        goal: m.channel.goal,
        lastActiveAt: lastMsg?.createdAt ?? null,
      }
    }),
  )

  // 信任分级(初版):autonomy = 该 assistant 任务平均自动度(若有 Task 表的 autonomy),
  // accuracy / fluency 暂用 placeholder。Phase E 可对接真实统计。
  const skills = parseSkills(user.skills)
  const trust = {
    autonomy: skills.includes('write_file') || skills.includes('run_command') ? 78 : 52,
    accuracy: 80,
    fluency: 85,
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      handle: user.handle,
      avatarColor: user.avatarColor,
      isAssistant: true,
      preset: (user as any).preset ?? null,
      provider: user.provider,
      model: user.model,
      skills,
    },
    persona: {
      systemPromptSummary,
      l1: (user.memory ?? '').slice(0, 400) || null,
    },
    projectMemories,
    activeTask: activeTask
      ? {
          id: activeTask.id,
          title: activeTask.title,
          status: activeTask.status,
          channel: activeTask.channel,
          updatedAt: activeTask.updatedAt,
        }
      : null,
    recentDeliveries,
    activeChannels,
    trust,
  }
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
      return {
        id: c.id,
        name: c.name,
        topic: c.topic,
        isDM: false, // v4:固定 false,保留字段兼容老前端
        isPrivate: c.isPrivate,
        archived: !!c.archivedAt,
        peer: null,
        // v3 项目字段
        kind: (c as any).kind ?? 'project',
        goal: (c as any).goal ?? null,
        scope: (c as any).scope ?? null,
        phase: (c as any).phase ?? null,
        ownerId: (c as any).ownerId ?? null,
        startedAt: (c as any).startedAt ?? null,
        deadline: (c as any).deadline ?? null,
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

// ---- 新建频道(v4:只剩项目频道一种)----
// v4 形态校准:频道只有 project 一种,没有 DM / discussion / random。
//   - isDM=true → 400
//   - kind 缺省即视为 'project';传 kind!='project' → 400(其他值不再支持)
//   - goal 必填;phase 必须是 5 阶段枚举之一(默认 discovery)
const PROJECT_PHASES = new Set([
  'discovery',
  'build',
  'review',
  'ship',
  'maintenance',
])
app.post('/api/channels', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const b = (req.body ?? {}) as {
    name?: string
    topic?: string
    kind?: string
    isDM?: boolean
    goal?: string
    scope?: string
    phase?: string
    ownerId?: string
    deadline?: string
  }
  if (b.isDM === true)
    return reply
      .code(400)
      .send({ error: 'isDM_not_supported', hint: 'v4 只剩项目频道,DM 已废弃' })
  if (!b.name?.trim()) return reply.code(400).send({ error: 'name required' })
  // kind:缺省 = 'project';显式给了别的 → 400
  const kind = (b.kind ?? 'project').trim()
  if (kind !== 'project')
    return reply
      .code(400)
      .send({ error: 'kind_must_be_project', hint: 'v4 频道只有项目一种' })
  if (!b.goal?.trim())
    return reply.code(400).send({ error: 'goal required for project' })
  const phase = (b.phase || 'discovery').trim()
  if (!PROJECT_PHASES.has(phase))
    return reply.code(400).send({
      error: 'invalid_phase',
      allowed: Array.from(PROJECT_PHASES),
    })
  const everyone = await prisma.user.findMany({ select: { id: true } })
  const channel: any = await prisma.channel.create({
    data: {
      name: b.name.trim().replace(/^#/, ''),
      topic: b.topic?.trim() || null,
      isDM: false,
      kind: 'project',
      goal: b.goal.trim().slice(0, 200),
      scope: b.scope ? b.scope.trim().slice(0, 500) : null,
      phase,
      ownerId: b.ownerId || me.id,
      startedAt: new Date(),
      deadline: b.deadline ? new Date(b.deadline) : null,
      members: { create: everyone.map((u: any) => ({ userId: u.id })) },
    },
  })
  // J3:创建 project 频道时确保 ≥1 个 exec-skills AI
  await ensureProjectExecutor(channel.id).catch((e) =>
    console.error('[J3 ensure exec on create]', e),
  )
  sendToUsers(everyone.map((u: any) => u.id), {
    type: 'channel-created',
    channelId: channel.id,
  })
  return channel
})

// v4:DM 路由已废弃,留 410 提示便于排查老前端
app.post('/api/dms', async (_req, reply) => {
  return reply.code(410).send({
    error: 'dm_removed',
    hint: 'v4 不再支持 DM,点击 AI 助手请改用 /agent/:id 资料页',
  })
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
    name: c.name,
    topic: c.topic,
    isDM: false, // v4:固定 false
    isPrivate: c.isPrivate,
    archived: !!c.archivedAt,
    peer: null,
    // v3 项目字段
    kind: (c as any).kind ?? 'project',
    goal: (c as any).goal ?? null,
    scope: (c as any).scope ?? null,
    phase: (c as any).phase ?? null,
    ownerId: (c as any).ownerId ?? null,
    startedAt: (c as any).startedAt ?? null,
    deadline: (c as any).deadline ?? null,
    members: c.members.map((m: any) => m.user),
    pinned: pinnedRows.map(shapeMessage),
  }
})

// ---- 频道:编辑(名称/主题/私有/归档 + v3 项目字段)----
app.patch('/api/channels/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as {
    name?: string
    topic?: string
    isPrivate?: boolean
    archived?: boolean
    // v3 G1 字段
    goal?: string
    scope?: string
    phase?: string
    ownerId?: string | null
    deadline?: string | null
  }
  const data: Record<string, unknown> = {}
  if (b.name?.trim()) data.name = b.name.trim().replace(/^#/, '')
  if (b.topic !== undefined) data.topic = b.topic.trim() || null
  if (b.isPrivate !== undefined) data.isPrivate = !!b.isPrivate
  if (b.archived !== undefined) data.archivedAt = b.archived ? new Date() : null
  if (b.goal !== undefined) data.goal = b.goal.trim().slice(0, 200) || null
  if (b.scope !== undefined) data.scope = b.scope.trim().slice(0, 500) || null
  if (b.ownerId !== undefined) data.ownerId = b.ownerId || null
  if (b.deadline !== undefined) data.deadline = b.deadline ? new Date(b.deadline) : null
  // v3 G1 + v2 欠债:phase 切换写 depends_on 边(build 依赖 discovery 完成)
  let oldPhase: string | null = null
  if (b.phase !== undefined) {
    const ALLOWED = new Set(['discovery', 'build', 'review', 'ship', 'maintenance'])
    if (b.phase && !ALLOWED.has(b.phase))
      return reply.code(400).send({ error: 'invalid phase' })
    data.phase = b.phase || null
    const cur: any = await prisma.channel.findUnique({ where: { id } })
    oldPhase = cur?.phase ?? null
  }
  await prisma.channel.update({ where: { id }, data })

  // v2 欠债:phase 切换 → depends_on 边(channel-as-task 抽象)
  if (b.phase !== undefined && b.phase && oldPhase && oldPhase !== b.phase) {
    await writeEdge({
      channelId: id,
      fromKind: 'task',
      fromId: `phase:${b.phase}:${id}`,
      toKind: 'task',
      toId: `phase:${oldPhase}:${id}`,
      verb: 'depends_on',
      why: { reason: 'project_phase_transition', from: oldPhase, to: b.phase },
    })
  }

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
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  return rows.map((m) => {
    return {
      id: m.id,
      channelId: m.channelId,
      channelName: m.channel.name,
      isDM: false,
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
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const items = mentions.map((mn) => {
    return {
      id: mn.id,
      messageId: mn.messageId,
      channelId: mn.channelId,
      channelName: mn.channel.name,
      isDM: false,
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

// ============================================================
// v4:工作台 KPI + 公司全景部门聚合
// ============================================================

// GET /api/home-kpis:主页顶部 4 数字横条 + 7 日 sparkline
app.get('/api/home-kpis', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [onlineAgents, deliveriesThisWeek, reviewing, todoMine] = await Promise.all([
    prisma.user.count({ where: { isAssistant: true } }),
    prisma.delivery.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.delivery.count({ where: { status: 'pending' } }),
    prisma.task.count({
      where: {
        OR: [{ assigneeId: me.id }, { reviewerId: me.id }],
        status: { in: ['todo', 'doing'] },
      },
    }),
  ])

  // 7 日 sparkline:按天聚合 delivery 数量
  const days: { day: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const count = await prisma.delivery.count({
      where: { createdAt: { gte: start, lt: end } },
    })
    days.push({ day: start.toISOString().slice(5, 10), count })
  }

  return {
    onlineAgents,
    deliveriesThisWeek,
    reviewing,
    todoMine,
    deliverySparkline: days,
  }
})

// GET /api/overview/departments:公司全景 6 张部门卡聚合
// 部门归类策略:按 channel.goal 关键词 mapping。无 goal 的归"未分类"。
app.get('/api/overview/departments', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })

  const KEYWORD_MAP: { key: string; label: string; keywords: RegExp }[] = [
    { key: 'product', label: '产品', keywords: /(产品|product|prd|需求|feature)/i },
    { key: 'engineering', label: '工程', keywords: /(工程|engineering|后端|前端|api|系统|架构|代码|build|开发)/i },
    { key: 'design', label: '设计', keywords: /(设计|design|品牌|brand|ui|ux|视觉)/i },
    { key: 'growth', label: '增长', keywords: /(增长|growth|获客|留存|营销|marketing|投放|渠道)/i },
    { key: 'design-ops', label: 'DesignOps', keywords: /(designops|运营|文档|knowledge|wiki)/i },
    { key: 'compliance', label: '合规', keywords: /(合规|compliance|legal|safety|审核|风控)/i },
  ]

  const channels = await prisma.channel.findMany({
    where: { kind: 'project', archivedAt: null },
    select: {
      id: true,
      name: true,
      goal: true,
      phase: true,
      ownerId: true,
    },
  })

  type Dept = {
    key: string
    label: string
    channels: typeof channels
    fallback: boolean
  }
  const buckets: Dept[] = KEYWORD_MAP.map((m) => ({
    key: m.key,
    label: m.label,
    channels: [] as typeof channels,
    fallback: false,
  }))
  const other: Dept = { key: 'other', label: '其他', channels: [] as typeof channels, fallback: true }

  for (const c of channels) {
    const text = `${c.name ?? ''} ${c.goal ?? ''}`
    const hit = KEYWORD_MAP.find((m) => m.keywords.test(text))
    if (hit) {
      buckets.find((b) => b.key === hit.key)!.channels.push(c)
    } else {
      other.channels.push(c)
    }
  }
  const departments: Dept[] = buckets.filter((b) => b.channels.length > 0)
  if (other.channels.length > 0) departments.push(other)

  // 每个部门:聚合 task / delivery / autonomy / 7 日 sparkline
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const result = await Promise.all(
    departments.map(async (d) => {
      const channelIds = d.channels.map((c) => c.id)
      if (channelIds.length === 0) {
        return {
          key: d.key,
          label: d.label,
          status: 'IDLE' as const,
          autonomy: 0,
          deliveriesThisWeek: 0,
          openTasks: 0,
          sparkline: Array(7).fill(0),
          channels: [],
          oneLiner: '暂无项目',
        }
      }
      const [openTasks, taskIds, deliveries7d] = await Promise.all([
        prisma.task.count({
          where: { channelId: { in: channelIds }, status: { in: ['todo', 'doing'] } },
        }),
        prisma.task.findMany({
          where: { channelId: { in: channelIds } },
          select: { id: true },
        }),
        prisma.delivery.count({
          where: {
            createdAt: { gte: sevenDaysAgo },
            taskId: { in: (await prisma.task.findMany({ where: { channelId: { in: channelIds } }, select: { id: true } })).map((t: any) => t.id) },
          },
        }),
      ])

      // 7 日 sparkline:每天的 delivery 数
      const sparkline: number[] = []
      for (let i = 6; i >= 0; i--) {
        const start = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
        const c = await prisma.delivery.count({
          where: {
            createdAt: { gte: start, lt: end },
            taskId: { in: taskIds.map((t) => t.id) },
          },
        })
        sparkline.push(c)
      }

      // autonomy:project 的 task 完成率(简化)
      const allTasks = await prisma.task.count({ where: { channelId: { in: channelIds } } })
      const doneTasks = await prisma.task.count({
        where: { channelId: { in: channelIds }, status: 'done' },
      })
      const autonomy = allTasks > 0 ? Math.round((doneTasks / allTasks) * 100) : 0

      const status =
        openTasks > 0 && deliveries7d === 0
          ? ('STUCK' as const)
          : openTasks > 0
            ? ('RUNNING' as const)
            : ('IDLE' as const)
      const oneLiner =
        status === 'RUNNING'
          ? `本周交付 ${deliveries7d} 件,在跑 ${openTasks} 个任务`
          : status === 'STUCK'
            ? `${openTasks} 个任务在跑但本周还没交付`
            : `${d.channels.length} 个项目,无活跃任务`

      return {
        key: d.key,
        label: d.label,
        status,
        autonomy,
        deliveriesThisWeek: deliveries7d,
        openTasks,
        sparkline,
        channels: d.channels.map((c) => ({ id: c.id, name: c.name, phase: c.phase })),
        oneLiner,
      }
    }),
  )

  return { departments: result }
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

// ===== Live Run 透明化:结构化运行事件(实时广播 + 落库)=====
// 与 AuditEvent 分工:RunEvent 面向「执行中过程展示」,毫秒级广播给频道成员,人话可读。
type RunEventScope = {
  runId: string
  taskId?: string | null
  missionId?: string | null
  channelId?: string | null
  members?: string[] // 频道成员(广播目标);缺省时按 channelId 现查
}
const runSeq = new Map<string, number>()
function nextRunSeq(runId: string): number {
  const n = (runSeq.get(runId) ?? 0) + 1
  runSeq.set(runId, n)
  return n
}

// 工具 → 人话动作(运行事件标题用;原始工具名作次级 tool 字段)
const RUN_TOOL_VERB: Record<string, { verb: string; phase: string }> = {
  list_dir: { verb: '查看项目结构', phase: 'context' },
  read_file: { verb: '阅读文件', phase: 'context' },
  grep: { verb: '检索代码', phase: 'context' },
  fetch_url: { verb: '联网读取资料', phase: 'context' },
  current_datetime: { verb: '获取当前时间', phase: 'context' },
  search_messages: { verb: '检索历史消息', phase: 'context' },
  read_calendar: { verb: '查看日历', phase: 'context' },
  write_file: { verb: '写入 / 修改文件', phase: 'write' },
  run_command: { verb: '运行命令', phase: 'verify' },
  generate_image: { verb: '生成图片', phase: 'write' },
  create_task: { verb: '拆分子任务', phase: 'understand' },
  create_event: { verb: '创建日历事件', phase: 'write' },
  browser_open: { verb: '打开网页', phase: 'verify' },
  browser_screenshot: { verb: '截图存证', phase: 'verify' },
  browser_console: { verb: '读取控制台', phase: 'verify' },
  browser_click: { verb: '操作网页', phase: 'verify' },
  browser_type: { verb: '输入网页', phase: 'verify' },
  remember: { verb: '写入长期记忆', phase: 'write' },
  calculator: { verb: '数值计算', phase: 'context' },
}

// 写一条 RunEvent + 广播 run-event。失败不阻塞执行。
async function emitRunEvent(
  scope: RunEventScope,
  ev: {
    kind: string
    phase?: string | null
    tool?: string | null
    callId?: string | null // 工具 start/result 配对 id;前端按此精确折叠(避免同名 tool 误配)
    title: string
    detail?: string | null
    status?: string | null
    durationMs?: number | null
    why?: Record<string, unknown> | null // v3 欠债清理:关键 phase/tool 选择必填(选 write_file 而非 spawn 等)
  },
) {
  const seq = nextRunSeq(scope.runId)
  let row
  // v3:关键事件自动补 why(若 caller 没显式传):阶段切换 / 工具开始 / 构建 / 交付
  const autoWhy = (() => {
    if (ev.why) return ev.why
    if (ev.kind === 'stage' && ev.phase)
      return { reason: 'phase_switch', phase: ev.phase, hint: 'Live Run 阶段切换' }
    if (ev.kind === 'tool_start' && ev.tool)
      return { reason: 'tool_selected', tool: ev.tool, detailSnippet: (ev.detail || '').slice(0, 80) }
    if (ev.kind === 'build')
      return { reason: 'build_event', status: ev.status, detail: (ev.detail || '').slice(0, 80) }
    if (ev.kind === 'delivery')
      return { reason: 'delivery_emit', phase: ev.phase, detail: (ev.detail || '').slice(0, 80) }
    return null
  })()
  try {
    row = await prisma.runEvent.create({
      data: {
        runId: scope.runId,
        taskId: scope.taskId ?? null,
        missionId: scope.missionId ?? null,
        channelId: scope.channelId ?? null,
        seq,
        callId: ev.callId ?? null,
        phase: ev.phase ?? null,
        kind: ev.kind,
        tool: ev.tool ?? null,
        title: ev.title.slice(0, 300),
        detail: ev.detail != null ? String(ev.detail).slice(0, 4000) : null,
        status: ev.status ?? null,
        durationMs: ev.durationMs ?? null,
        whyJson: autoWhy ? JSON.stringify(autoWhy) : null,
      },
    })
  } catch (e) {
    console.error('[run-event]', e)
    return
  }
  if (scope.channelId) {
    const members = scope.members ?? (await memberIds(scope.channelId))
    sendToUsers(members, { type: 'run-event', channelId: scope.channelId, runId: scope.runId, event: row })
  }
  // Channel-First:同一条 RunEvent 实时驱动频道里的 Progress Card(进度卡真实来自事件流)
  void maybeUpdateProgressCard(scope.runId, ev)
}

// ===== Channel-First 协作卡片:Progress Card / Delivery Card =====
// Heliox 自有产品语言:AI 作为频道成员,把「执行中过程」与「最终交付」直接发进频道时间线,
// 所有成员(含其他 AI)无需打开右侧面板即可看懂 AI 在做什么、做完了什么、怎么验收。
// 进度卡随同一条 RunEvent 实时刷新(不是假轮询);交付卡来自任务真实完成事件。

const PHASE_LABEL_SRV: Record<string, string> = {
  understand: '理解需求',
  context: '读取上下文',
  write: '写入文件',
  verify: '运行验证',
  deliver: '生成交付',
  await: '等待你',
}

type ProgressStatus = 'running' | 'done' | 'await' | 'error'
type ProgressStep = { phase: string | null; title: string; status: string | null }
type ProgressCardData = {
  kind: 'progress'
  taskId: string | null
  runId: string
  title: string
  phase: string | null
  phaseLabel: string
  status: ProgressStatus
  steps: ProgressStep[]
  note: string | null
  updatedAt: string
}

// runId → 进度卡(消息 id + 频道 + 累积状态),供 emitRunEvent 实时更新。
// writing:每张卡的写入串行链,避免并发更新乱序(旧状态盖掉终态)。
const progressCards = new Map<
  string,
  {
    messageId: string
    channelId: string
    members: string[]
    data: ProgressCardData
    writing?: Promise<void>
  }
>()

function progressBody(d: ProgressCardData): string {
  const head =
    d.status === 'done' ? '执行完成' : d.status === 'error' ? '执行出错' : d.status === 'await' ? '等待你' : '执行中'
  return `[${head}] ${d.title} · 当前阶段:${d.phaseLabel}${d.note ? ' · ' + d.note : ''}`
}

// 开始执行时在频道 post 一张进度卡。返回消息 id(失败返回 null,不阻塞执行)。
async function postProgressCard(
  scope: RunEventScope,
  opts: { authorId: string; title: string; phase?: string },
): Promise<string | null> {
  if (!scope.channelId) return null
  const phase = opts.phase ?? 'understand'
  const data: ProgressCardData = {
    kind: 'progress',
    taskId: scope.taskId ?? null,
    runId: scope.runId,
    title: opts.title.slice(0, 200),
    phase,
    phaseLabel: PHASE_LABEL_SRV[phase] ?? phase,
    status: 'running',
    steps: [],
    note: null,
    updatedAt: new Date().toISOString(),
  }
  try {
    const members = scope.members ?? (await memberIds(scope.channelId))
    const msg = await prisma.message.create({
      data: {
        channelId: scope.channelId,
        authorId: opts.authorId,
        body: progressBody(data),
        type: 'progress_card',
        cardJson: JSON.stringify(data),
      },
      include: fullMessageInclude,
    })
    progressCards.set(scope.runId, { messageId: msg.id, channelId: scope.channelId, members, data })
    sendToUsers(members, { type: 'message', channelId: scope.channelId, message: shapeMessage(msg) })
    return msg.id
  } catch (e) {
    console.error('[progress-card]', e)
    return null
  }
}

// 按 key RunEvent(阶段切换 / 构建 / 交付 / 状态 / 里程碑工具)增量刷新进度卡。
// 普通的高频工具事件不触发更新,避免刷屏。
function maybeUpdateProgressCard(
  runId: string,
  ev: { kind: string; phase?: string | null; title: string; status?: string | null },
) {
  const entry = progressCards.get(runId)
  if (!entry) return
  const d = entry.data
  const phaseChanged = !!ev.phase && ev.phase !== d.phase
  const isMilestone = ['stage', 'build', 'delivery', 'status'].includes(ev.kind)
  if (!phaseChanged && !isMilestone) return
  if (ev.phase) {
    d.phase = ev.phase
    d.phaseLabel = PHASE_LABEL_SRV[ev.phase] ?? ev.phase
  }
  if (['stage', 'build', 'delivery', 'status', 'command', 'file', 'browser'].includes(ev.kind)) {
    d.steps.push({ phase: ev.phase ?? d.phase, title: ev.title.slice(0, 120), status: ev.status ?? null })
    if (d.steps.length > 6) d.steps = d.steps.slice(-6)
  }
  d.updatedAt = new Date().toISOString()
  void persistProgressCard(runId)
}

// 串行写入:把每次持久化排到该卡的写入链尾,链内重读「当前」entry.data 写库,
// 保证 DB 落地顺序 = 调用顺序,终态(finalize)不会被并发的旧状态写覆盖。
function persistProgressCard(runId: string): Promise<void> {
  const entry = progressCards.get(runId)
  if (!entry) return Promise.resolve()
  const next = (entry.writing ?? Promise.resolve()).then(async () => {
    const e = progressCards.get(runId)
    if (!e) return // 已 finalize 删除 → 跳过(终态已写)
    try {
      const msg = await prisma.message.update({
        where: { id: e.messageId },
        data: { body: progressBody(e.data), cardJson: JSON.stringify(e.data) },
        include: fullMessageInclude,
      })
      sendToUsers(e.members, { type: 'message-updated', channelId: e.channelId, message: shapeMessage(msg) })
    } catch (err) {
      console.error('[progress-card-update]', err)
    }
  })
  entry.writing = next
  return next
}

// 收尾:置终态(done/await/error),持久化后从内存移除(消息已落库,前端照常渲染)。
async function finalizeProgressCard(
  runId: string,
  status: ProgressStatus,
  opts?: { phase?: string; note?: string },
) {
  const entry = progressCards.get(runId)
  if (!entry) return
  const d = entry.data
  d.status = status
  if (opts?.phase) {
    d.phase = opts.phase
    d.phaseLabel = PHASE_LABEL_SRV[opts.phase] ?? opts.phase
  }
  if (opts?.note) d.note = opts.note
  d.updatedAt = new Date().toISOString()
  await persistProgressCard(runId)
  progressCards.delete(runId)
}

type DeliveryCardData = {
  kind: 'delivery'
  taskId: string | null
  runId: string
  deliveryId: string
  title: string
  summary: string
  previewUrl: string | null
  entry: string | null
  changedFiles: { path: string; status: string }[]
  diffSummary: string | null
  buildResult: string | null
  testResult: string // pass | fail | skipped
  verifiedByBrowser: boolean
  nextSteps: string[]
  // D10 设计深钻:交付的 AI 身份,DeliveryCard 头部显示「[小头像] [AI名]」,识别度↑
  authorName?: string
  authorColor?: number
}

function deliveryBody(d: DeliveryCardData): string {
  const verify =
    d.testResult === 'pass'
      ? '构建/测试通过'
      : d.testResult === 'fail'
        ? '构建/测试失败'
        : '未跑构建/测试'
  const browser = d.verifiedByBrowser ? '已 browser 验证' : '未经 browser 验证'
  const lines = [
    `[交付] ${d.title}`,
    d.summary ? d.summary.slice(0, 240) : '',
    d.previewUrl ? `预览入口:${d.previewUrl}` : '无可交互预览,见代码 diff',
    d.diffSummary ? `改动:${d.diffSummary}` : d.changedFiles.length ? `改动:${d.changedFiles.length} 个文件` : '',
    `验证:${verify} · ${browser}`,
    d.nextSteps.length ? `下一步:${d.nextSteps.join(';')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// 任务成功收尾时在频道 post 一张交付卡(无截图;入口/diff/验证/下一步)。
// D10:同时从执行 AI 的 User 记录里取真实 name + avatarColor 写入 cardJson,前端 banner 渲染贡献者。
async function postDeliveryCard(
  scope: RunEventScope,
  opts: { authorId: string } & Omit<DeliveryCardData, 'kind' | 'authorName' | 'authorColor'>,
): Promise<void> {
  if (!scope.channelId) return
  let authorName: string | undefined
  let authorColor: number | undefined
  try {
    const u = await prisma.user.findUnique({
      where: { id: opts.authorId },
      select: { name: true, avatarColor: true, isAssistant: true },
    })
    if (u?.isAssistant) {
      authorName = u.name
      authorColor = u.avatarColor
    }
  } catch {
    // 取不到不致命,banner 自然降级为无贡献者
  }
  const data: DeliveryCardData = { kind: 'delivery', ...opts, authorName, authorColor }
  try {
    const members = scope.members ?? (await memberIds(scope.channelId))
    const msg = await prisma.message.create({
      data: {
        channelId: scope.channelId,
        authorId: opts.authorId,
        body: deliveryBody(data),
        type: 'delivery_card',
        cardJson: JSON.stringify(data),
      },
      include: fullMessageInclude,
    })
    sendToUsers(members, { type: 'message', channelId: scope.channelId, message: shapeMessage(msg) })
  } catch (e) {
    console.error('[delivery-card]', e)
  }
}

// 把一次工具调用的参数压成一行可读 detail(命令 / 路径 / URL / 选择器)
function toolDetail(name: string, args: unknown): string | undefined {
  const a = (args ?? {}) as Record<string, unknown>
  if (name === 'run_command') return typeof a.command === 'string' ? a.command : undefined
  if (name === 'write_file') return typeof a.path === 'string' ? a.path : undefined
  if (name === 'read_file' || name === 'list_dir') return typeof a.path === 'string' ? a.path : undefined
  if (name === 'fetch_url' || name === 'browser_open') return typeof a.url === 'string' ? a.url : undefined
  if (name === 'browser_click') return (a.selector as string) || (a.text ? `text=${a.text}` : undefined)
  if (name === 'browser_type') return typeof a.selector === 'string' ? a.selector : undefined
  if (name === 'grep' || name === 'search_messages') return typeof a.query === 'string' ? a.query : undefined
  return undefined
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
  // v4:DM 已不存在,无需 J2 校验
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
// smoke 模式跳过(脚本不需要 cron)
if (!process.env.HELIO_NO_LISTEN) setInterval(async () => {
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

// ===== v3 G3: Memory list API =====
// 返回当前频道每个 AI 助手的 L2 + L3(只读,Phase B 给手动编辑入口)。
app.get('/api/channels/:id/memories', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id: channelId } = req.params as { id: string }
  const member = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId: me.id } },
  })
  if (!member) return reply.code(403).send({ error: 'not a member' })

  // 频道内所有 AI 助手
  const channelAssistants = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, name: true, avatarColor: true, isAssistant: true } } },
  })
  const aiUsers = channelAssistants
    .map((m: any) => m.user)
    .filter((u: any) => u.isAssistant)
  const aiIds = aiUsers.map((u: any) => u.id)
  if (aiIds.length === 0) return { agents: [] }

  const memories = await prisma.memory.findMany({
    where: { channelId, agentId: { in: aiIds }, level: { in: [2, 3] } },
    orderBy: { updatedAt: 'desc' },
  })

  // 按 agent 分桶
  const out = aiUsers.map((u: any) => {
    const l2 = memories.find((m: any) => m.agentId === u.id && m.level === 2) ?? null
    const l3 = memories.find((m: any) => m.agentId === u.id && m.level === 3) ?? null
    return {
      agent: { id: u.id, name: u.name, avatarColor: u.avatarColor },
      l2: l2
        ? {
            id: l2.id,
            content: l2.content,
            itemCount: l2.itemCount,
            updatedAt: l2.updatedAt,
            whyJson: l2.whyJson,
          }
        : null,
      l3: l3
        ? {
            id: l3.id,
            content: l3.content,
            itemCount: l3.itemCount,
            updatedAt: l3.updatedAt,
            whyJson: l3.whyJson,
          }
        : null,
    }
  })
  return { agents: out }
})

// ===== v2 Algorithm Graph: 频道图谱 API =====
// 返回 {nodes[], edges[]} —— 节点是按 fromKind+fromId / toKind+toId 拼出的真实记录投影;
// 不在前端再次查 DB,后端一次性把所需 label/status/avatar 等都填好。
app.get('/api/channels/:id/graph', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id: channelId } = req.params as { id: string }
  // 权限:频道成员才能看
  const member = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId: me.id } },
  })
  if (!member) return reply.code(403).send({ error: 'not a member' })

  // 1) 拉本频道所有 Edge
  const edges = await prisma.edge.findMany({
    where: { channelId },
    orderBy: { createdAt: 'asc' },
  })

  // 2) 收集涉及到的节点 id,按 kind 分桶
  const need: Record<string, Set<string>> = {
    task: new Set(),
    agent: new Set(),
    delivery: new Set(),
    progress: new Set(), // message id (progress_card)
    a2a_response: new Set(), // message id
    tool: new Set(),
    approval: new Set(),
    optimizer: new Set(),
  }
  for (const e of edges) {
    if (need[e.fromKind]) need[e.fromKind].add(e.fromId)
    if (need[e.toKind]) need[e.toKind].add(e.toId)
  }
  // 把本频道有 channelId 的 task / delivery / pendingInput / approvalRequest / progress_card / delivery_card / optimizer_suggestion 一并补上(防止孤儿节点没出现在 edge 里)
  const tasks = await prisma.task.findMany({ where: { channelId } })
  tasks.forEach((t) => need.task.add(t.id))
  const taskIds = tasks.map((t) => t.id)
  const deliveries = taskIds.length
    ? await prisma.delivery.findMany({ where: { taskId: { in: taskIds } } })
    : []
  deliveries.forEach((d) => need.delivery.add(d.id))
  const pendingInputs = taskIds.length
    ? await prisma.pendingInput.findMany({ where: { taskId: { in: taskIds } } })
    : []
  pendingInputs.forEach((pi) => need.approval.add(pi.id))
  const approvals = taskIds.length
    ? await prisma.approvalRequest.findMany({ where: { taskId: { in: taskIds } } })
    : []
  approvals.forEach((ap) => need.approval.add(ap.id))
  const cardMsgs = await prisma.message.findMany({
    where: {
      channelId,
      type: { in: ['progress_card', 'delivery_card', 'a2a_response', 'optimizer_suggestion'] },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of cardMsgs) {
    if (m.type === 'progress_card') need.progress.add(m.id)
    if (m.type === 'a2a_response') need.a2a_response.add(m.id)
    if (m.type === 'optimizer_suggestion') need.optimizer.add(m.id)
  }
  const agents = need.agent.size
    ? await prisma.user.findMany({
        where: { id: { in: [...need.agent] } },
        select: { id: true, name: true, avatarColor: true, isAssistant: true },
      })
    : []
  // 频道内全成员一并出节点(graph 至少有一群"参与者")
  const allMembers = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, name: true, avatarColor: true, isAssistant: true } } },
  })
  allMembers.forEach((m) => need.agent.add(m.userId))

  // 3) 计算每个 task 的自动度(E5):autonomy = round(100 * (1 - blocked_by_count / max(1, related_steps)))
  //    人工因素 = 该 task 的 PendingInput 数 + ApprovalRequest 数;steps 用 RunEvent.kind in (tool_start,build,delivery,file,command,browser) 估算
  const blockedByCount = new Map<string, number>()
  for (const pi of pendingInputs) {
    if (pi.taskId) blockedByCount.set(pi.taskId, (blockedByCount.get(pi.taskId) ?? 0) + 1)
  }
  for (const ap of approvals) {
    if (ap.taskId) blockedByCount.set(ap.taskId, (blockedByCount.get(ap.taskId) ?? 0) + 1)
  }
  const stepsByTask = new Map<string, number>()
  if (taskIds.length) {
    const reSteps = await prisma.runEvent.groupBy({
      by: ['taskId'],
      where: { taskId: { in: taskIds }, kind: { in: ['tool_start', 'build', 'delivery', 'file', 'command', 'browser'] } },
      _count: { _all: true },
    })
    for (const r of reSteps) if (r.taskId) stepsByTask.set(r.taskId, r._count._all)
  }
  function autonomyFor(taskId: string): number {
    const human = blockedByCount.get(taskId) ?? 0
    const total = Math.max(1, (stepsByTask.get(taskId) ?? 0) + human)
    return Math.max(0, Math.min(100, Math.round(100 * (1 - human / total))))
  }

  // 4) Tool 节点:按 (assistantId, toolName) 聚合 RunEvent.kind=tool_start
  const toolUsage = await prisma.runEvent.groupBy({
    by: ['tool'],
    where: { channelId, kind: 'tool_start', tool: { not: null } },
    _count: { _all: true },
  })
  const toolNodes = toolUsage
    .filter((t) => t.tool)
    .map((t) => ({
      kind: 'tool' as const,
      id: `tool:${t.tool}`,
      label: t.tool!,
      status: null,
      weight: t._count._all,
      whyJson: null as string | null,
    }))
  // 给 tool 节点接 feeds 边到对应的 task(取该 tool 第一次出现的 taskId)
  const toolToTask = new Map<string, string | null>()
  if (toolNodes.length) {
    for (const tn of toolNodes) {
      const tname = tn.label
      const firstEv = await prisma.runEvent.findFirst({
        where: { channelId, kind: 'tool_start', tool: tname },
        orderBy: { createdAt: 'asc' },
        select: { taskId: true },
      })
      toolToTask.set(tname, firstEv?.taskId ?? null)
    }
  }

  // 5) 投影成前端节点
  const nodes: any[] = []
  for (const t of tasks) {
    nodes.push({
      kind: 'task',
      id: t.id,
      label: t.title,
      status: t.status,
      autonomy: autonomyFor(t.id),
      assigneeId: t.assigneeId,
      whyJson: t.whyJson,
      messageId: null,
    })
  }
  for (const u of [...agents, ...allMembers.map((m) => m.user)]) {
    if (!u) continue
    // 去重
    if (nodes.some((n) => n.kind === 'agent' && n.id === u.id)) continue
    nodes.push({
      kind: 'agent',
      id: u.id,
      label: u.name,
      avatarColor: u.avatarColor,
      isAssistant: u.isAssistant,
      whyJson: null,
    })
  }
  for (const d of deliveries) {
    nodes.push({
      kind: 'delivery',
      id: d.id,
      label: d.title,
      status: d.status, // pending | approved | rejected
      whyJson: d.whyJson,
      taskId: d.taskId,
    })
  }
  for (const m of cardMsgs) {
    if (m.type === 'progress_card') {
      nodes.push({
        kind: 'progress',
        id: m.id,
        label: '进度',
        status: null,
        whyJson: m.whyJson,
        messageId: m.id,
      })
    } else if (m.type === 'a2a_response') {
      nodes.push({
        kind: 'a2a_response',
        id: m.id,
        label: 'A2A 回应',
        status: null,
        whyJson: m.whyJson,
        messageId: m.id,
      })
    } else if (m.type === 'optimizer_suggestion') {
      nodes.push({
        kind: 'optimizer',
        id: m.id,
        label: 'Optimizer 建议',
        status: null,
        whyJson: m.whyJson,
        messageId: m.id,
      })
    }
  }
  for (const pi of pendingInputs) {
    nodes.push({
      kind: 'approval',
      id: pi.id,
      label: pi.question.slice(0, 60),
      status: pi.status, // pending | resolved | skipped
      whyJson: null,
      subKind: 'pending_input',
      taskId: pi.taskId,
    })
  }
  for (const ap of approvals) {
    nodes.push({
      kind: 'approval',
      id: ap.id,
      label: `审批 ${ap.capability}`,
      status: ap.status,
      whyJson: null,
      subKind: 'capability',
      taskId: ap.taskId,
    })
  }
  nodes.push(...toolNodes)

  // 6) 补 tool→task feeds 边(只在内存里,不写库:避免每次刷新都重写)
  const inMemEdges: any[] = edges.map((e) => ({
    id: e.id,
    channelId: e.channelId,
    fromKind: e.fromKind,
    fromId: e.fromId,
    toKind: e.toKind,
    toId: e.toId,
    verb: e.verb,
    weight: e.weight,
    whyJson: e.whyJson,
    createdAt: e.createdAt,
  }))
  for (const tn of toolNodes) {
    const taskId = toolToTask.get(tn.label)
    if (taskId) {
      inMemEdges.push({
        id: `synthetic:${tn.id}->${taskId}`,
        channelId,
        fromKind: 'tool',
        fromId: tn.id,
        toKind: 'task',
        toId: taskId,
        verb: 'feeds',
        weight: tn.weight,
        whyJson: JSON.stringify({ reason: 'tool_use_aggregated', count: tn.weight }),
        createdAt: new Date(),
      })
    }
  }
  return { nodes, edges: inMemEdges }
})

// ---- Mission:详情(含真实任务拆解 + review + delivery + audit) ----
app.get('/api/missions/:id', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })
  const [tasks, reviews, deliveries, audit, pendingInputs] = await Promise.all([
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
    prisma.pendingInput.findMany({
      where: { missionId: id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { mission, tasks, reviews, deliveries, audit, pendingInputs }
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
// ---- Mission 工作流预览:目标 → 结构化工作流(真实 LLM,不落库)----
// Mission Composer 用:展示目标/推荐团队/步骤/工具/确认点/交付物,用户确认后再落库。
app.post('/api/missions/plan-preview', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { goal } = (req.body ?? {}) as { goal?: string }
  const g = (goal ?? '').trim()
  if (!g) return reply.code(400).send({ error: 'goal required' })
  const assistants = await prisma.user.findMany({ where: { isAssistant: true } })
  const callers = assistants.map((a) => ({
    provider: a.provider,
    baseUrl: a.baseUrl,
    apiKey: a.apiKey,
    model: a.model,
  }))
  const team = assistants.map((a) => ({ name: a.name, role: a.systemPrompt?.slice(0, 60) || '' }))
  const { plan, error } = await planWorkflow({ goal: g, callers, team })
  if (!plan) return reply.code(502).send({ error: error ?? '工作流生成失败' })
  return { plan }
})

app.post('/api/missions/:id/breakdown', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })

  // 若调用方传入了已确认的工作流步骤(来自工作流预览),直接落库,预览即执行,不二次调模型。
  const body = (req.body ?? {}) as {
    subtasks?: { title?: string; expectedOutput?: string; role?: string; priority?: string }[]
  }
  const VALID_P = new Set(['urgent', 'high', 'medium', 'low'])
  let subtasks: { title: string; expectedOutput?: string; role?: string; priority?: 'urgent' | 'high' | 'medium' | 'low' }[] = []
  let error: string | undefined

  if (Array.isArray(body.subtasks) && body.subtasks.length) {
    subtasks = body.subtasks
      .map((s) => ({
        title: (s.title ?? '').trim().slice(0, 200),
        expectedOutput: s.expectedOutput?.trim().slice(0, 200) || undefined,
        role: s.role?.trim().slice(0, 40) || undefined,
        priority: (s.priority && VALID_P.has(s.priority.toLowerCase())
          ? s.priority.toLowerCase()
          : 'medium') as 'urgent' | 'high' | 'medium' | 'low',
      }))
      .filter((s) => s.title)
      .slice(0, 9)
  } else {
    // 候选端点:所有助手的供应商/自带配置(用于在服务器默认未配置时兜底调用)
    const assistants = await prisma.user.findMany({ where: { isAssistant: true } })
    const callers = assistants.map((a) => ({
      provider: a.provider,
      baseUrl: a.baseUrl,
      apiKey: a.apiKey,
      model: a.model,
    }))
    const team = assistants.map((a) => ({ name: a.name, role: a.systemPrompt?.slice(0, 60) || '' }))
    const r = await breakdownGoal({ goal: mission.goal, callers, team })
    subtasks = r.subtasks
    error = r.error
  }

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
    // v2 Edge 触发点 #4:user → delivery (approves)
    // 通过 task 反查 channelId(delivery 不直接挂 channelId)
    let chanId: string | null = null
    let assignAi: string | null = null
    if (delivery.taskId) {
      const t = await prisma.task.findUnique({ where: { id: delivery.taskId }, select: { channelId: true, assigneeId: true, title: true } })
      chanId = t?.channelId ?? null
      assignAi = t?.assigneeId ?? null
      // v3 G3:project 频道里 Delivery 被 approved → 追加 L2 关键决定(AI 持久记忆)
      if (chanId && assignAi && b.status === 'approved') {
        const ch: any = await prisma.channel.findUnique({ where: { id: chanId }, select: { kind: true } })
        if (ch?.kind === 'project') {
          await appendL2(
            assignAi,
            chanId,
            `交付被 approve:「${t!.title}」(${delivery.testResult ?? 'no-test'})`,
            { reason: 'delivery_approved', deliveryId: delivery.id, taskId: delivery.taskId },
          ).catch((e) => console.error('[append-l2-approved]', e))
          await appendEpisodic(
            assignAi,
            chanId,
            `Delivery「${t!.title}」被 approve`,
            { reason: 'delivery_approved', deliveryId: delivery.id },
          ).catch((e) => console.error('[append-l3-approved]', e))
          const mids = await memberIds(chanId)
          sendToUsers(mids, { type: 'memory-updated', channelId: chanId, agentId: assignAi, level: 2 })
        }
      }
    }
    await writeEdge({
      channelId: chanId,
      fromKind: 'agent',
      fromId: me.id,
      toKind: 'delivery',
      toId: delivery.id,
      verb: 'approves',
      why: { reason: b.status === 'approved' ? 'human_accept' : 'human_reject', status: b.status },
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

// v4:ensureDM 已删除。所有 task 必须在项目频道里,无 DM 兜底。
// 留 stub 让老调用方编译期立刻发现(若漏改),不再静默创建 DM。

// 进行中的执行:runId -> AbortController(供取消)
const RUNNING_CTRL = new Map<string, AbortController>()

// ---- 任务意图分析 + 智能工具/Agent 路由 ----
// 目标:发布/开始执行前,按任务意图与助手 skills 判断是否该换人/补信息。
// 例:「查天气/查资料/联网」不能交给无 fetch_url/run_command 的助手空答;
//    缺城市的查天气任务先向用户要城市,再用真实工具获取。全部基于真实 skills 判定,不造假。

// 城市提取:从天气类任务标题里抠出城市;给了 override(用户补填)则直接用;抠不到/不像城市返回 null。
// 收紧策略(修复:把"明确需求与目标城市"这类规划类标题误当城市去查):
//   - 先剥离查询填充词,再剥离规划/抽象词(明确/需求/目标/梳理/分析…);
//   - 残留若是多词、过长、或含连接/规划词 → 判定不是单一城市 → 返回 null(触发缺城市 Pending Input)。
function extractCity(title: string, override?: string | null): string | null {
  if (override && override.trim()) return override.trim().slice(0, 40)
  let s = ` ${title} `
  // 英文填充词(整词)
  s = s.replace(
    /\b(the|a|weather|forecast|temperature|temp|today|tomorrow|now|current|in|of|for|at|what|whats|is|s|like|please|check|tell|me|how|get|show)\b/gi,
    ' ',
  )
  // 中文查询填充词(直接子串)
  s = s
    .replace(
      /查询|查一下|查下|查看|查|看一下|看看|看|帮我|请|今天|明天|后天|现在|当前|实时|的|地|天气情况|天气预报|天气|气温|温度|怎么样|咋样|如何|多少|是多少|预报|未来|这几天|情况|状况|度数|下雨|会不会|是什么|什么|啥|是|吗|呢|啊|嘛/g,
      '',
    )
  // 规划/抽象词(子任务标题常见):出现即说明这不是"某城市"而是一个步骤 → 整体作废
  const PLANNING = /(明确|需求|目标|梳理|分析|设计|方案|计划|规划|流程|步骤|交付|输出|调研|研究|确定|整理|评估|对比|总结|实现|开发|验证|测试|文档|报告|页面|功能|用户|路径|交互|界面)/
  if (PLANNING.test(s)) return null
  // 连接词(与/和/及/或/、)说明是并列短语,不是单一城市
  if (/[与和及或、]/.test(s)) return null
  s = s.replace(/[，。、！？!?,.:：;；()（）\s]+/g, ' ').trim()
  if (!s) return null
  // 多词残留 → 模糊,宁可问用户
  if (s.split(/\s+/).length > 1) return null
  // 过长(>10 个 CJK/字符)不像城市名 → 问用户
  if (s.length > 10) return null
  return s.slice(0, 40)
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

// ====== App Settings(单例)+ 角色感知的执行人解析 ======

type AppSettingShape = {
  id: string
  defaultExecutorId: string | null
  autoRun: boolean
  assumeDefaults: boolean
}

// 读取(并按需创建)全局设置单例
async function getSettings(): Promise<AppSettingShape> {
  const s = await prisma.appSetting.upsert({
    where: { id: 'app' },
    update: {},
    create: { id: 'app' },
  })
  return {
    id: s.id,
    defaultExecutorId: s.defaultExecutorId,
    autoRun: s.autoRun,
    assumeDefaults: s.assumeDefaults,
  }
}

type AssistantRow = {
  id: string
  name: string
  systemPrompt: string | null
  skills: string | null
  provider: string | null
  baseUrl: string | null
  apiKey: string | null
  model: string | null
}

// 助手角色粗分类,用于步骤执行人偏好与「PM 不写代码」降权。
// 关键:优先看「名称」——很多人设里有跨界提示(如工程师人设写「产品方向以产品经理为准」),
// 用整段 hay 会把工程师误判成经理。所以先按名字判定,名字判不出再退回人设。
type RoleClass = 'manager' | 'engineer' | 'research' | 'writer' | 'designer' | 'qa' | 'other'
function classifyRole(s: string): RoleClass | null {
  if (/(测试工程师|测试|qa|质量保证|tester)/i.test(s)) return 'qa'
  if (/(软件工程师|全栈|后端工程|前端工程|工程师|开发者|engineer|developer|coder|程序员|devops|sre|架构师|数据库管理|dba)/i.test(s))
    return 'engineer'
  if (/(产品经理|项目经理|运营经理|营销经理|product\s*manager|project\s*manager|product\s*owner|\bpm\b|经理|总监|主管|负责人)/i.test(s))
    return 'manager'
  if (/(研究|调研|数据分析|分析师|教研|市场研究|analyst|research)/i.test(s)) return 'research'
  if (/(文案|写作|编辑|技术文档|writer|copywriter|内容)/i.test(s)) return 'writer'
  if (/(设计师|设计|ui|ux|视觉|designer)/i.test(s)) return 'designer'
  return null
}
function roleClassOf(a: { name: string; systemPrompt?: string | null }): RoleClass {
  return classifyRole(a.name) ?? classifyRole(a.systemPrompt ?? '') ?? 'other'
}

// 步骤偏好 → 加分的角色类别
const PREFER_ROLE: Record<StepPrefer, RoleClass[]> = {
  engineer: ['engineer'],
  browser: ['engineer', 'qa'],
  research: ['research', 'writer'],
  writer: ['writer', 'research'],
  pm: ['manager', 'writer'],
  any: [],
}

type StepLike = {
  requiredAny: string[]
  prefer: StepPrefer
  // 代码/测试类:产品/项目经理不应默认承担(给 manager 降权)
  penalizeManager?: boolean
}

// 为某步骤排序候选执行人(只取可用、非图像模型、具备所需技能之一者)。
// settings.defaultExecutorId 在「无特殊能力要求」或它本身满足要求时优先。
function rankAssistantsForStep(
  step: StepLike,
  all: AssistantRow[],
  defaultExecutorId?: string | null,
): { a: AssistantRow; score: number }[] {
  const need = step.requiredAny ?? []
  const preferRoles = PREFER_ROLE[step.prefer] ?? []
  const penalizeManager =
    step.penalizeManager ?? (step.prefer === 'engineer' || step.prefer === 'browser')
  return all
    .filter((a) => !isImageModel(a.model))
    .filter((a) => canGenerate({ provider: a.provider, baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model }))
    .map((a) => {
      const sk = parseSkills(a.skills)
      const hasNeed = !need.length || need.some((s) => sk.includes(s))
      const hits = need.filter((s) => sk.includes(s)).length
      const role = roleClassOf(a)
      let score = 0
      if (!hasNeed) score -= 1000 // 不满足必需能力 → 基本出局
      score += hits * 30
      if (preferRoles.includes(role)) score += 50
      if (penalizeManager && role === 'manager') score -= 40 // PM/经理不该默认写代码/跑测试
      if (defaultExecutorId && a.id === defaultExecutorId) score += 15 // 同分时默认执行助手优先
      score += Math.min(sk.length, 8) // 技能更全略加分
      return { a, score, hasNeed }
    })
    .filter((x) => x.hasNeed)
    .sort((x, y) => y.score - x.score || a_name(x.a).localeCompare(a_name(y.a)))
    .map(({ a, score }) => ({ a, score }))
}

// 解析某步骤的执行人(返回助手或带原因的 null)
function resolveExecutorForStep(
  step: StepLike,
  all: AssistantRow[],
  defaultExecutorId?: string | null,
): { assistant: AssistantRow | null; reason: string } {
  const ranked = rankAssistantsForStep(step, all, defaultExecutorId)
  if (ranked.length) return { assistant: ranked[0].a, reason: '' }
  const capNames = (step.requiredAny ?? [])
    .map((s) =>
      s === 'fetch_url'
        ? '联网读网页'
        : s === 'run_command'
          ? '执行命令'
          : s === 'write_file'
            ? '写文件'
            : s.startsWith('browser_')
              ? '浏览器自动化'
              : s,
    )
    .join(' 或 ')
  return {
    assistant: null,
    reason: capNames
      ? `没有具备「${capNames}」能力且已配置可用模型的助手。请去 Settings / 助手设置里给某个助手开启对应技能。`
      : '没有已配置可用模型的 AI 助手,请先在助手设置里填好端点/模型。',
  }
}

type ExecOpts = {
  triggeredById: string
  trigger?: 'manual' | 'auto' | 'approval' | 'continue' | 'mention'
  allowRunCommand?: boolean // 经人工批准续跑时放行 run_command
  input?: string | null // 用户补填的信息(如查天气的城市)
  forceAssistantId?: string // 强制用此助手为执行人(审批续跑时复用原执行人,跳过路由/补信息门)
  reuseSandboxRunId?: string // 「继续执行」:复用上次的沙盒工作区(不重新快照),让先前改动与上下文保留
  assumeDefaults?: boolean // 一键跑完:遇信息缺口用 MVP 默认假设继续,不停下反问
  extraBrief?: string // 续跑时附加的指引(如用户补充的信息 / 默认假设)
  channelId?: string // Channel-First:在指定频道内执行(A2A @触发);缺省回退到执行人与触发者的 DM
  mentionAuthorName?: string // A2A:@ 触发本次执行的频道成员名(用于简报上下文)
}

// 浏览器控制相关技能(用于本地交付验证)
const BROWSER_SKILLS = ['browser_open', 'browser_screenshot', 'browser_console', 'browser_click', 'browser_type']

// AI 回复表示「缺信息 / 做不了 / 无法产出」的信号。命中且无真实交付 → 状态不得为 succeeded。
const NEEDS_INPUT_RE =
  /(缺少必要信息|缺少信息|信息不足|无法(完成|继续|产出|提供|确定|获取|进行)|没有(足够的?|提供).{0,6}(信息|数据|资料)|需要你(先)?(提供|补充|确认|明确|告诉)|请(先)?(提供|补充|告诉我|明确|指定)|无法在(没有|缺少)|不清楚.{0,8}(需求|要求|目标)|cannot (proceed|complete|determine|continue)|unable to (proceed|complete)|need(s)? (more|additional) (info|information|details|clarification)|missing (information|required|details))/i

function detectNeedsInput(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  return NEEDS_INPUT_RE.test(t)
}

type PendingOption = { label: string; value: string; hint?: string }
type ExecResult =
  | { runId: string; status: string; executorId?: string; routedFrom?: string }
  | { error: string; code: number }
  | {
      needsInput: true
      field: string
      prompt: string
      reason?: string
      options?: PendingOption[]
      recommended?: number
      defaultValue?: string
      allowCustom?: boolean
    }

// export 给 smoke 脚本(v3c-smoke 场景 Y 需要直接调用以验证 channelId 不变式);
// 运行期没有其他模块 import 它。
export async function executeTask(
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
    // 补信息门:查天气缺城市 → 先要城市,不创建 TaskRun(不伪装执行)。结构化:为什么问 + 推荐默认 + 自定义。
    if (intent.weather && !intent.city) {
      return {
        needsInput: true,
        field: 'city',
        prompt: `「${task.title}」是查天气任务,但没识别到城市。选一个城市,或填你要查的城市,我再用真实数据源获取天气。`,
        reason: '天气必须用真实数据源按城市查询,没有城市无法获取准确结果。',
        options: [
          { label: '北京', value: '北京', hint: '默认推荐' },
          { label: '上海', value: '上海' },
          { label: '深圳', value: '深圳' },
          { label: 'Tokyo', value: 'Tokyo' },
        ],
        recommended: 0,
        defaultValue: '北京',
        allowCustom: true,
      }
    }
    // 智能路由(角色感知):assignee 缺所需能力 → 换给具备该能力、且角色合适的助手。
    // 代码/命令/浏览器类任务对「产品/项目经理」降权,体现「PM 不默认写代码/跑测试」。
    if (intent.requiredAny.length && !assistantHasAny(parseSkills(assignee.skills), intent.requiredAny)) {
      const prefer: StepPrefer = intent.needsBrowser
        ? 'browser'
        : intent.needsCommand
          ? 'engineer'
          : intent.needsNetwork
            ? 'research'
            : 'any'
      const all = await prisma.user.findMany({ where: { isAssistant: true } })
      const ranked = rankAssistantsForStep(
        { requiredAny: intent.requiredAny, prefer },
        all as AssistantRow[],
        (await getSettings()).defaultExecutorId,
      ).filter((x) => x.a.id !== assignee.id)
      const better = ranked[0]?.a ?? (await pickExecutor(intent.requiredAny, assignee.id))
      if (better) {
        executor = better as typeof assignee
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
  // J1 硬约束(v4 收紧):task.channelId 必须存在,否则直接报错。
  // v4 没有 DM,所有 task 必须在项目频道里产生,fallback 路径全部砍掉。
  let channelId: string
  if (task.channelId) {
    if (opts.channelId && opts.channelId !== task.channelId) {
      await writeAudit({
        type: 'executeTask.channel_mismatch',
        summary: `executeTask 被传入 channelId=${opts.channelId},但 task.channelId=${task.channelId};以 task 为准`,
        actorId: opts.triggeredById,
        taskId: task.id,
        missionId: task.missionId ?? null,
        payload: { expected: task.channelId, got: opts.channelId, trigger: opts.trigger ?? null },
      })
    }
    channelId = task.channelId
  } else if (opts.channelId) {
    // 极少数无频道 task,外部显式给了 channelId(老数据迁移用)
    channelId = opts.channelId
  } else {
    await writeAudit({
      type: 'executeTask.no_channel',
      summary: `Task ${task.id} 无 channelId,v4 拒绝执行(DM 已废弃)`,
      actorId: opts.triggeredById,
      taskId: task.id,
      missionId: task.missionId ?? null,
      payload: { trigger: opts.trigger ?? null },
    })
    return {
      error: 'task 没有归属频道;v4 已删除 DM 兜底,请在项目频道里建任务',
      code: 400,
    }
  }
  const isMember = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId: assistant.id } },
  })
  if (!isMember)
    await prisma.channelMember
      .create({ data: { channelId, userId: assistant.id } })
      .catch(() => {})

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

  // Live Run:本次执行的运行事件作用域(实时广播给频道成员)
  const runScope: RunEventScope = {
    runId: run.id,
    taskId: task.id,
    missionId: task.missionId ?? null,
    channelId,
    members: memberList,
  }
  const resuming = !!opts.reuseSandboxRunId || opts.trigger === 'continue'
  // Channel-First:在频道时间线 post 一张进度卡(随后续 RunEvent 实时刷新阶段)。
  // 这让频道成员(含其他 AI)无需打开右侧 Cockpit 就能看到 AI 正在执行什么。
  await postProgressCard(runScope, { authorId: assistant.id, title: task.title, phase: 'understand' })
  await emitRunEvent(runScope, {
    kind: 'stage',
    phase: 'understand',
    title: resuming ? `${assistant.name} 继续执行任务` : `${assistant.name} 开始执行任务`,
    detail: task.title,
    status: 'ok',
  })
  if (routedFrom)
    await emitRunEvent(runScope, {
      kind: 'stage',
      phase: 'understand',
      title: `按能力路由给 ${assistant.name}`,
      detail: `需要 ${intent.requiredAny.join('/')} 能力`,
      status: 'ok',
    })
  if (sandbox)
    await emitRunEvent(runScope, {
      kind: 'stage',
      phase: 'context',
      title: opts.reuseSandboxRunId ? '复用隔离沙盒工作区' : '准备隔离沙盒工作区',
      detail: detectIsolation().label,
      status: 'ok',
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
        '本机信任沙盒里放宽了开发命令:可直接跑 node / pnpm / npm / npx / yarn / tsx / python / vite / next / tsc 等开发命令,也包括 **pnpm install / npm install / npx <pkg>(联网装依赖)** 和 pnpm build / pnpm test / pnpm dev / git status / git diff 等(危险命令仍被拦截)。' +
        '**主项目的 node_modules 已软链注入到沙盒 workspace**,大多数 React / Vue / Vite / Node 任务无需再装(直接 import 即可);需要额外依赖时再 pnpm add。' +
        '**网络**:GET 请求(fetch_url / curl GET / npm registry)直接可用;POST / 上传 / 非 GET 走审批。' +
        '不要因为"沙盒限制"放弃技术栈选型;React / Vue / 完整 SPA 都能跑。需要改代码时调用 write_file 写入沙盒(只写沙盒,不会直接改主项目);所有改动会生成 diff,执行结束后跑 build/test,最终由人类在报告里批准应用。',
    )
    if (execSkills.some((s) => BROWSER_SKILLS.includes(s)))
      guide.push(
        '验证交付时可用浏览器:browser_open 打开 http://localhost:<port> 本地页面,browser_screenshot 截图存证,browser_console 看报错,browser_click/browser_type 做交互(外站需人工批准)。',
      )
  }
  if (opts.assumeDefaults)
    guide.push(
      '【一键跑完模式】若遇到信息缺口或需要澄清,请采用最合理的 MVP 默认假设直接把任务做完,并在汇报里明确标注你做了哪些假设;不要停下来反问、也不要因为"信息不足"而拒绝产出。',
    )
  if (opts.extraBrief) guide.push(opts.extraBrief)
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
    // v3 G4:executeTask 也走 buildProjectContext(L1+L2+元+L3+历史+当前 task);
    //   project 频道 ensure L2 项目记忆(若未初始化)
    const ch: any = await prisma.channel.findUnique({ where: { id: channelId } })
    if (ch?.kind === 'project') {
      await ensureL2(assistant.id, channelId, {
        goal: ch.goal,
        scope: ch.scope,
        phase: ch.phase,
        ownerName: null,
      }).catch((e) => console.error('[exec-ensure-l2]', e))
    }
    const execCtx = await buildProjectContext({ agentId: assistant.id, channelId })
    const sysContent = execCtx.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n---\n\n')
    const execSysPrompt = sysContent || withMemory(assistant) || ''
    const history = execCtx.messages.filter((m) => m.role !== 'system')
    // 工具轮数预算:有沙盒(代码/命令/浏览器)用 code(默认 40),其余任务用 task(默认 25)。
    const maxToolRounds = toolRoundsFor(sandbox ? 'code' : 'task')
    const { text, toolsUsed, hitToolLimit } = await generateReply({
      provider: assistant.provider,
      baseUrl: assistant.baseUrl,
      apiKey: assistant.apiKey,
      systemPrompt: execSysPrompt,
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
            // v2 Edge 触发点 #6:task → approval (blocked_by) — 高危能力审批
            await writeEdge({
              channelId: run.channelId,
              fromKind: 'task',
              fromId: task.id,
              toKind: 'approval',
              toId: ap.id,
              verb: 'blocked_by',
              why: { reason: 'capability_approval', capability, commandSnippet: command.slice(0, 120) },
            })
            await emitRunEvent(runScope, {
              kind: 'status',
              phase: 'await',
              title: '需要你批准高危操作',
              detail: command.slice(0, 200),
              status: 'error',
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
      // Live Run:工具开始 → 立即广播过程卡(命令文本 / 文件路径 / URL 等)。callId 配对 start/result。
      onToolStart: ({ name, args, callId }) => {
        const meta = RUN_TOOL_VERB[name] ?? { verb: name.replace(/_/g, ' '), phase: 'context' }
        const kind = name === 'run_command' ? 'command' : name === 'write_file' ? 'file' : name.startsWith('browser_') ? 'browser' : 'tool_start'
        sendStatus(`正在${meta.verb}…`)
        void emitRunEvent(runScope, {
          kind,
          phase: meta.phase,
          tool: name,
          callId,
          title: `正在${meta.verb}`,
          detail: toolDetail(name, args),
          status: 'running',
        })
      },
      // Live Run:工具结果 → 广播结果卡(stdout 尾 / 截图路径 / 成功失败)
      onToolResult: ({ name, args, result, ms, ok, callId }) => {
        const meta = RUN_TOOL_VERB[name] ?? { verb: name.replace(/_/g, ' '), phase: 'context' }
        const kind = name === 'run_command' ? 'command' : name === 'write_file' ? 'file' : name.startsWith('browser_') ? 'browser' : 'tool_result'
        const shot = name === 'browser_screenshot' ? (result.match(/\/uploads\/[^\s)]+\.png/)?.[0] ?? null) : null
        void emitRunEvent(runScope, {
          kind,
          phase: meta.phase,
          tool: name,
          callId,
          title: ok ? `${meta.verb}完成` : `${meta.verb}失败`,
          detail: shot ?? (toolDetail(name, args) ? `${toolDetail(name, args)}\n${result.slice(0, 600)}` : result.slice(0, 600)),
          status: ok ? 'ok' : 'error',
          durationMs: ms,
        })
      },
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
      await finalizeProgressCard(run.id, 'error', { phase: 'await', note: '执行已取消' })
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
    let webPreviewArtifact: { path: string | null; metadataJson: string | null } | null = null
    if (sandbox) {
      try {
        await emitRunEvent(runScope, {
          kind: 'stage',
          phase: 'verify',
          title: '收集变更并运行构建 / 测试',
          status: 'running',
        })
        const sr = await finalizeSandbox(sandbox.sandboxRunId, { runBuild: true })
        webPreviewArtifact = await prisma.sandboxArtifact.findFirst({
          where: { sandboxRunId: sandbox.sandboxRunId, kind: 'web_preview' },
          orderBy: { createdAt: 'desc' },
          select: { path: true, metadataJson: true },
        })
        await emitRunEvent(runScope, {
          kind: 'build',
          phase: 'verify',
          title: sr?.buildResult === 'pass' ? '构建 / 测试通过' : sr?.buildResult === 'fail' ? '构建 / 测试失败' : '沙盒执行完成',
          detail: `${sr?.diffSummary ?? '无改动'}${sr?.buildResult ? ` · build/test=${sr.buildResult}` : ''}${webPreviewArtifact ? ` · 可交互入口 ${webPreviewArtifact.path}` : ''}`,
          status: sr?.buildResult === 'fail' ? 'error' : 'ok',
        })
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
            webPreview: !!webPreviewArtifact,
          },
        })
      } catch (e) {
        await failSandbox(sandbox.sandboxRunId, '收尾失败:' + (e as Error).message)
      }
    }

    // 真实产出判定:有沙盒变更 / 有写文件 / 有截图,即视为有交付(不应被判 needs_input)
    let sandboxHadChanges = false
    if (sandbox) {
      const sr = await prisma.sandboxRun.findUnique({ where: { id: sandbox.sandboxRunId } }).catch(() => null)
      try {
        const cf = sr?.changedFiles ? JSON.parse(sr.changedFiles) : []
        sandboxHadChanges = Array.isArray(cf) && cf.length > 0
      } catch {
        sandboxHadChanges = false
      }
    }
    const producedSomething =
      sandboxHadChanges ||
      toolsUsed.some((t) => ['write_file', 'browser_screenshot', 'generate_image', 'create_task', 'create_event'].includes(t))
    // #5:模型说「缺信息/做不了」且没有真实交付 → needs_input,绝不标 succeeded
    const needsInput = !approvalRequested && !hitToolLimit && !producedSomething && detectNeedsInput(text)

    // 状态:需审批 > 触工具上限(部分完成可继续) > 缺信息(等你补充)> 成功
    const status = approvalRequested
      ? 'needs_approval'
      : hitToolLimit
        ? 'needs_review'
        : needsInput
          ? 'needs_input'
          : 'succeeded'
    await prisma.taskRun.update({
      where: { id: run.id },
      data: {
        status,
        messageId: finalMsg.id,
        toolsUsed: JSON.stringify(toolsUsed),
        output: text.slice(0, 4000),
        error: needsInput ? '缺少信息,等待你补充后才能产出' : null,
        endedAt: new Date(),
      },
    })
    // 需审批/触上限 → 任务停在进行中;缺信息 → blocked(等你补充);成功 → 进入待复核
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: approvalRequested || hitToolLimit ? 'doing' : needsInput ? 'blocked' : 'review',
      },
    })
    // 缺信息:创建结构化 Pending Input(为什么问 + 按默认假设继续 + 自定义)
    if (needsInput) {
      const pi = await prisma.pendingInput.create({
        data: {
          runId: run.id,
          taskId: task.id,
          missionId: task.missionId ?? null,
          assistantId: assistant.id,
          field: 'info',
          question: `「${task.title}」需要你补充信息后才能继续`,
          reason: text.slice(0, 300),
          optionsJson: JSON.stringify([
            { label: '按 MVP 默认假设继续', value: '__assume__', hint: 'AI 用最合理的默认假设把任务做完,不再追问' },
          ]),
          recommended: 0,
          defaultValue: '__assume__',
          allowCustom: true,
        },
      })
      // v2 Edge 触发点 #5:task → approval (blocked_by) — 用 PendingInput 作为"审批/澄清"节点
      await writeEdge({
        channelId: run.channelId,
        fromKind: 'task',
        fromId: task.id,
        toKind: 'approval',
        toId: pi.id,
        verb: 'blocked_by',
        why: { reason: 'needs_input', question: pi.question.slice(0, 120) },
      })
    }
    await writeAudit({
      type: approvalRequested
        ? 'task.exec_needs_approval'
        : hitToolLimit
          ? 'task.exec_partial'
          : needsInput
            ? 'task.exec_needs_input'
            : 'task.exec_succeeded',
      summary: approvalRequested
        ? `任务「${task.title}」需人工批准高危操作后才能继续`
        : hitToolLimit
          ? `任务「${task.title}」达工具调用上限,已生成部分报告(可继续执行)`
          : needsInput
            ? `任务「${task.title}」缺少信息,等待你补充(可按默认假设继续)`
            : `${assistant.name} 完成任务「${task.title}」执行`,
      actorId: assistant.id,
      taskId: task.id,
      missionId: task.missionId ?? null,
      payload: { runId: run.id, tools: toolsUsed },
    })

    // Channel-First 交付:任务成功且有真实产出 → 在频道 post 一张 Delivery Card(无截图)。
    // 可交互 Web 预览的,另沉淀一条 DB Delivery(Delivery Center 保留)。
    // 验证门(P1.2):未跑任一 browser 工具 → 不得标「已验证」,testResult 强制 skipped。
    if (status === 'succeeded' && producedSomething) {
      const verifiedByBrowser = toolsUsed.some((t) =>
        ['browser_open', 'browser_screenshot', 'browser_console'].includes(t),
      )
      const sr = sandbox
        ? await prisma.sandboxRun.findUnique({ where: { id: sandbox.sandboxRunId } }).catch(() => null)
        : null
      const buildResult = sr?.buildResult ?? null
      const testResult = !verifiedByBrowser
        ? 'skipped' // 没跑 browser 验证就不给「已验证」错误预期
        : buildResult === 'pass'
          ? 'pass'
          : buildResult === 'fail'
            ? 'fail'
            : 'skipped'

      let wp: { entry?: string; previewUrl?: string; files?: string[] } = {}
      if (webPreviewArtifact?.metadataJson) {
        try {
          wp = JSON.parse(webPreviewArtifact.metadataJson)
        } catch {
          wp = {}
        }
      }
      let changedFiles: { path: string; status: string }[] = []
      try {
        changedFiles = sr?.changedFiles ? JSON.parse(sr.changedFiles) : []
      } catch {
        changedFiles = []
      }

      // DB Delivery:仅可交互 Web 预览时创建(尊重既有人工生成)。去截图:screenshots 置空。
      let deliveryId = ''
      if (webPreviewArtifact?.metadataJson) {
        const existing = await prisma.delivery.findFirst({ where: { taskId: task.id } }).catch(() => null)
        if (existing) {
          deliveryId = existing.id
        } else {
          const artifact = {
            kind: 'interactive' as const,
            previewUrl: wp.previewUrl ?? null,
            openUrl: wp.previewUrl ?? null,
            entry: wp.entry ?? null,
            sandboxRunId: sandbox!.sandboxRunId,
            files: wp.files ?? [],
            screenshots: [], // 去截图:截图只写 RunEvent(Cockpit Debug 里查),不进交付
            buildResult,
            verifiedByBrowser,
          }
          const delivery = await prisma.delivery.create({
            data: {
              missionId: task.missionId ?? null,
              taskId: task.id,
              title: `可交互交付:${task.title}`,
              summary: text.slice(0, 1000),
              artifactJson: JSON.stringify(artifact),
              testResult,
              riskLevel: 'low',
              status: 'pending',
              createdById: assistant.id,
              whyJson: JSON.stringify({
                reason: 'task_succeeded',
                verifiedByBrowser,
                buildResult,
                fileCount: changedFiles.length,
                entry: wp.entry ?? null,
              }),
            },
          })
          deliveryId = delivery.id
          await writeAudit({
            type: 'delivery.created',
            summary: `${assistant.name} 为任务「${task.title}」生成可交互交付(频道 Delivery Card + Delivery Center)`,
            actorId: assistant.id,
            taskId: task.id,
            missionId: task.missionId ?? null,
            payload: { deliveryId: delivery.id, runId: run.id, previewUrl: artifact.previewUrl, verifiedByBrowser },
          })
          // v2 Edge 触发点 #3:agent → delivery (delivers_to) + delivery → task (supplies)
          await writeEdge({
            channelId: run.channelId,
            fromKind: 'agent',
            fromId: assistant.id,
            toKind: 'delivery',
            toId: delivery.id,
            verb: 'delivers_to',
            why: { reason: 'task_succeeded', taskId: task.id, verifiedByBrowser, buildResult },
          })
          await writeEdge({
            channelId: run.channelId,
            fromKind: 'delivery',
            fromId: delivery.id,
            toKind: 'task',
            toId: task.id,
            verb: 'supplies',
            why: { reason: 'completes_task' },
          })
        }
      }

      const nextSteps: string[] = []
      nextSteps.push(wp.previewUrl ? '打开频道里的预览,点击交互验收' : '查看下方代码 diff 验收')
      if (!verifiedByBrowser) nextSteps.push('如需「已验证」,让 AI 用 browser 工具自检')
      nextSteps.push('可 @另一个 AI 助手复审')

      // 频道 Delivery Card(无截图;入口 / diff / 验证 / 下一步)
      await postDeliveryCard(runScope, {
        authorId: assistant.id,
        taskId: task.id,
        runId: run.id,
        deliveryId,
        title: task.title,
        summary: text.slice(0, 600),
        previewUrl: wp.previewUrl ?? null,
        entry: wp.entry ?? null,
        changedFiles: changedFiles.slice(0, 20),
        diffSummary: sr?.diffSummary ?? null,
        buildResult,
        testResult,
        verifiedByBrowser,
        nextSteps,
      })

      await emitRunEvent(runScope, {
        kind: 'delivery',
        phase: 'deliver',
        title: '生成交付卡',
        detail: wp.previewUrl
          ? `入口 ${wp.entry ?? ''} · 频道内可打开预览${verifiedByBrowser ? ' · 已 browser 验证' : ' · 未经 browser 验证'}`
          : `已汇总改动 diff${verifiedByBrowser ? ' · 已 browser 验证' : ' · 未经 browser 验证'}`,
        status: 'ok',
      })
    }

    // 收尾 stage:让 Live Run 时间线收口到「下一步」。
    await emitRunEvent(runScope, {
      kind: 'status',
      phase: approvalRequested || hitToolLimit || needsInput ? 'await' : 'deliver',
      title: approvalRequested
        ? '等待你批准高危操作'
        : hitToolLimit
          ? '达工具上限,可点继续执行'
          : needsInput
            ? '缺少信息,等待你补充'
            : '执行完成,等待你验收',
      detail: approvalRequested || hitToolLimit || needsInput ? undefined : '频道里有 Delivery Card,可直接打开预览 / 看 diff 验收',
      status: approvalRequested || needsInput ? 'error' : 'ok',
    })

    // Channel-First:进度卡收口到终态
    await finalizeProgressCard(
      run.id,
      approvalRequested || hitToolLimit || needsInput ? 'await' : 'done',
      {
        phase: approvalRequested || hitToolLimit || needsInput ? 'await' : 'deliver',
        note: approvalRequested
          ? '需批准高危操作'
          : hitToolLimit
            ? '达工具上限,可继续执行'
            : needsInput
              ? '缺信息,等待补充'
              : '已交付,等待验收',
      },
    )

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
    await emitRunEvent(runScope, {
      kind: 'status',
      phase: 'await',
      title: '执行出错',
      detail: errMsg.slice(0, 300),
      status: 'error',
    })
    await finalizeProgressCard(run.id, 'error', { phase: 'await', note: errMsg.slice(0, 80) })
    broadcastWorkspace()
    broadcastTasks()
    return { runId: run.id, status: 'failed' }
  } finally {
    RUNNING_CTRL.delete(run.id)
    progressCards.delete(run.id) // 安全网:确保内存映射清理(finalize 已删除则无副作用)
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
    return reply.send({
      status: 'needs_input',
      field: r.field,
      prompt: r.prompt,
      reason: r.reason,
      options: r.options,
      recommended: r.recommended,
      defaultValue: r.defaultValue,
      allowCustom: r.allowCustom,
    })
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
  // Live Run 时间线:最新一次执行的结构化运行事件(实时过程展示;失败/卡住可读)
  const runEvents = latestRun
    ? await prisma.runEvent.findMany({ where: { runId: latestRun.id }, orderBy: { seq: 'asc' }, take: 400 })
    : []
  return { task, runs, approvals, audit, deliveries, toolCalls, sandbox, runEvents }
})

// ---- Live Run:按 TaskRun 取结构化运行事件(实时时间线 / 重连补齐)----
app.get('/api/task-runs/:runId/events', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { runId } = req.params as { runId: string }
  return prisma.runEvent.findMany({ where: { runId }, orderBy: { seq: 'asc' }, take: 400 })
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

// ---- Interactive Delivery:内嵌网页预览静态服务(从沙盒 workspace 只读取文件)----
// 路径守卫:必须落在该沙盒 workspace 内;拒 .env/key/db/node_modules 等敏感/生成文件。
// 供 iframe 内嵌交互预览;前端 iframe 用 sandbox 属性隔离,无 allow-same-origin。
const PREVIEW_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}
const PREVIEW_DENY = /(^|\/)(\.env|\.git|node_modules|\.helio)(\/|$)|\.(db|key|pem|p12|pfx)$/i

async function servePreview(reply: any, sandboxRunId: string, rel: string | undefined) {
  const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
  if (!run || !run.workspacePath) return reply.code(404).send('sandbox not found')
  const ws = run.workspacePath
  let target = (rel ?? '').trim()
  if (!target || target === '/') {
    // 取 web_preview 入口,缺省回退 index.html
    const art = await prisma.sandboxArtifact.findFirst({
      where: { sandboxRunId, kind: 'web_preview' },
      orderBy: { createdAt: 'desc' },
    })
    target = art?.path ?? 'index.html'
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(target)
  } catch {
    decoded = target
  }
  if (PREVIEW_DENY.test(decoded)) return reply.code(403).send('forbidden')
  const abs = pathResolve(ws, decoded)
  const wsNorm = ws.replace(/\/$/, '') + '/'
  if (abs !== ws && !abs.startsWith(wsNorm)) return reply.code(403).send('path escapes sandbox')
  if (!existsSync(abs)) return reply.code(404).send('file not found in sandbox')
  let st
  try {
    st = statSync(abs)
  } catch {
    return reply.code(404).send('not found')
  }
  if (st.isDirectory()) {
    const idx = pathResolve(abs, 'index.html')
    if (!existsSync(idx)) return reply.code(404).send('directory has no index.html')
    return sendPreviewFile(reply, idx)
  }
  return sendPreviewFile(reply, abs)
}
function sendPreviewFile(reply: any, abs: string) {
  const ext = extname(abs).toLowerCase()
  const mime = PREVIEW_MIME[ext] ?? 'application/octet-stream'
  const buf = readFileSync(abs)
  reply.header('Content-Type', mime)
  reply.header('Cache-Control', 'no-store')
  reply.header('X-Content-Type-Options', 'nosniff')
  return reply.send(buf)
}

// ---- L4:沙盒文件树(react-arborist 用)----
// 路径守卫沿用 PREVIEW_DENY;只读;返回 [{ id, name, path, isDir, children }] 树。
// 与 /preview 共用 workspace,但本接口不读文件内容,仅列出树结构(供文件树渲染)。
app.get('/api/sandbox-runs/:id/files', async (req, reply) => {
  const { id } = req.params as { id: string }
  const run = await prisma.sandboxRun.findUnique({ where: { id } })
  if (!run?.workspacePath) return reply.code(404).send({ error: 'sandbox not found' })
  const ws = run.workspacePath
  if (!existsSync(ws)) return reply.code(404).send({ error: 'workspace gone' })
  const { readdirSync } = await import('node:fs')
  type Node = { id: string; name: string; path: string; isDir: boolean; children?: Node[] }
  const MAX_ENTRIES = 2000
  let count = 0
  function walk(dirAbs: string, rel: string, depth: number): Node[] {
    if (count >= MAX_ENTRIES || depth > 8) return []
    let entries: import('node:fs').Dirent[]
    try { entries = readdirSync(dirAbs, { withFileTypes: true }) } catch { return [] }
    const out: Node[] = []
    for (const e of entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))) {
      if (count >= MAX_ENTRIES) break
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (PREVIEW_DENY.test(childRel)) continue
      count++
      const node: Node = { id: childRel, name: e.name, path: childRel, isDir: e.isDirectory() }
      if (e.isDirectory()) {
        const sub = walk(pathResolve(dirAbs, e.name), childRel, depth + 1)
        if (sub.length) node.children = sub
      }
      out.push(node)
    }
    return out
  }
  const tree = walk(ws, '', 0)
  return { runId: id, root: ws, count, truncated: count >= MAX_ENTRIES, tree }
})

// ---- L4:沙盒单文件内容读取(供文件树点击 → Monaco 渲染)----
app.get('/api/sandbox-runs/:id/file', async (req, reply) => {
  const { id } = req.params as { id: string }
  const { path: relPath } = (req.query as { path?: string }) ?? {}
  if (!relPath) return reply.code(400).send({ error: 'path required' })
  const run = await prisma.sandboxRun.findUnique({ where: { id } })
  if (!run?.workspacePath) return reply.code(404).send({ error: 'sandbox not found' })
  if (PREVIEW_DENY.test(relPath)) return reply.code(403).send({ error: 'forbidden' })
  const abs = pathResolve(run.workspacePath, relPath)
  const wsNorm = run.workspacePath.replace(/\/$/, '') + '/'
  if (abs !== run.workspacePath && !abs.startsWith(wsNorm))
    return reply.code(403).send({ error: 'path escapes sandbox' })
  if (!existsSync(abs)) return reply.code(404).send({ error: 'not found' })
  const st = statSync(abs)
  if (st.isDirectory()) return reply.code(400).send({ error: 'is directory' })
  if (st.size > 512 * 1024)
    return reply.send({ path: relPath, size: st.size, truncated: true, content: '(file too large > 512KB)' })
  const content = readFileSync(abs, 'utf8')
  return { path: relPath, size: st.size, truncated: false, content }
})

app.get('/api/sandbox-runs/:id/preview', async (req, reply) => {
  const { id } = req.params as { id: string }
  return servePreview(reply, id, undefined)
})
app.get('/api/sandbox-runs/:id/preview/*', async (req, reply) => {
  const { id } = req.params as { id: string }
  const rest = (req.params as Record<string, string>)['*']
  return servePreview(reply, id, rest)
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
  if ('needsInput' in r)
    return reply.send({
      status: 'needs_input',
      field: r.field,
      prompt: r.prompt,
      reason: r.reason,
      options: r.options,
      recommended: r.recommended,
      defaultValue: r.defaultValue,
      allowCustom: r.allowCustom,
    })
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
    runs: runs.map((r: any) => ({ ...r, taskTitle: r.taskId ? titleOf.get(r.taskId) ?? null : null })),
  }
})

// ---- 频道工作区:把"与某助手的频道/私信"作用域的真实执行数据聚合返回 ----
//   Genspark 式 Chat 工作区右侧面板的数据源。全部真实 join,不造假:
//   - runs: taskRun.channelId === 该频道(执行任务时 channelId=ensureDM(user, assistant))
//   - tasks: task.channelId === 该频道 或 被这些 run 引用
//   - sandboxRuns / deliveries / audit: 由上面的 runId / taskId 关联
app.get('/api/channels/:id/workspace', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const runs = await prisma.taskRun.findMany({
    where: { channelId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const runTaskIds = [...new Set(runs.map((r: any) => r.taskId).filter(Boolean) as string[])]
  const channelTasks = await prisma.task.findMany({
    where: { OR: [{ channelId: id }, { id: { in: runTaskIds } }] },
    include: taskInclude,
    orderBy: { createdAt: 'desc' },
  })
  const taskIds = [...new Set([...channelTasks.map((t: any) => t.id), ...runTaskIds])]
  const runIds = runs.map((r: any) => r.id)
  const [sandboxRunsRaw, deliveries, audit] = await Promise.all([
    prisma.sandboxRun.findMany({
      where: { OR: [{ taskRunId: { in: runIds } }, { taskId: { in: taskIds } }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.delivery.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditEvent.findMany({
      where: { taskId: { in: taskIds } },
      orderBy: { createdAt: 'desc' },
      take: 150,
    }),
  ])
  const titleOf = new Map(channelTasks.map((t: any) => [t.id, t.title]))
  const sandboxRuns = sandboxRunsRaw.map((r: any) => ({
    ...r,
    taskTitle: r.taskId ? titleOf.get(r.taskId) ?? null : null,
  }))
  const pendingInputs = await prisma.pendingInput.findMany({
    where: { status: 'pending', OR: [{ taskId: { in: taskIds } }, { runId: { in: runIds } }] },
    orderBy: { createdAt: 'desc' },
  })
  return {
    tasks: channelTasks,
    runs,
    sandboxRuns,
    deliveries,
    audit,
    pendingInputs,
    isolation: detectIsolation(),
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
      .filter((a: any) => !isImageModel(a.model))
      .filter((a: any) =>
        canGenerate({ provider: a.provider, baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model }),
      )
      .sort((x: any, y: any) => parseSkills(y.skills).length - parseSkills(x.skills).length)
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

// ====== Settings / Templates / Pending Input / Mission Run(本轮新增) ======

// 技能 id → 简短能力标签(执行人/模板卡展示用)
const SKILL_LABEL: Record<string, string> = {
  run_command: '执行命令',
  write_file: '写文件',
  fetch_url: '联网',
  browser_open: '浏览器',
  browser_screenshot: '截图',
  browser_console: '看报错',
  browser_click: '点击',
  browser_type: '输入',
  generate_image: '生成图片',
  create_task: '建任务',
  create_event: '建日程',
  read_calendar: '看日程',
  search_messages: '检索消息',
  list_channels: '看频道',
  calculator: '计算',
  current_datetime: '看时间',
  remember: '记忆',
  list_dir: '看目录',
  read_file: '读文件',
}
function toolLabels(skills: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of skills) {
    const l = SKILL_LABEL[s] ?? s
    if (!seen.has(l)) {
      seen.add(l)
      out.push(l)
    }
  }
  return out
}
function baseUrlHost(a: { baseUrl?: string | null; provider?: string | null }): string {
  if (a.baseUrl) {
    try {
      return new URL(a.baseUrl).host
    } catch {
      return a.baseUrl.replace(/^https?:\/\//, '').split('/')[0]
    }
  }
  return a.provider ? `服务器供应商(${a.provider})` : '服务器供应商'
}
// 执行人公开信息(绝不含 apiKey)
function executorPublic(a: AssistantRow & { avatarColor?: number }) {
  const skills = parseSkills(a.skills)
  return {
    id: a.id,
    name: a.name,
    avatarColor: (a as { avatarColor?: number }).avatarColor ?? 5,
    model: a.model ?? '(未设模型)',
    baseUrlHost: baseUrlHost(a),
    hasApiKey: !!a.apiKey || /127\.0\.0\.1|localhost/.test(a.baseUrl ?? ''),
    tools: toolLabels(skills),
    skills,
    available: !isImageModel(a.model) && canGenerate({ provider: a.provider, baseUrl: a.baseUrl, apiKey: a.apiKey, model: a.model }),
  }
}

// ---- Settings:读取 ----
app.get('/api/settings', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const s = await getSettings()
  let executor: ReturnType<typeof executorPublic> | null = null
  if (s.defaultExecutorId) {
    const a = await prisma.user.findUnique({ where: { id: s.defaultExecutorId } })
    if (a?.isAssistant) executor = executorPublic(a as AssistantRow & { avatarColor?: number })
  }
  return { settings: s, executor }
})

// ---- Settings:更新(默认执行助手 / 一键执行 / 缺信息默认假设)----
app.patch('/api/settings', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const b = (req.body ?? {}) as { defaultExecutorId?: string | null; autoRun?: boolean; assumeDefaults?: boolean }
  const data: Record<string, unknown> = {}
  if (b.defaultExecutorId !== undefined) data.defaultExecutorId = b.defaultExecutorId || null
  if (typeof b.autoRun === 'boolean') data.autoRun = b.autoRun
  if (typeof b.assumeDefaults === 'boolean') data.assumeDefaults = b.assumeDefaults
  await prisma.appSetting.upsert({
    where: { id: 'app' },
    update: data,
    create: { id: 'app', ...data },
  })
  broadcastWorkspace()
  const s = await getSettings()
  let executor: ReturnType<typeof executorPublic> | null = null
  if (s.defaultExecutorId) {
    const a = await prisma.user.findUnique({ where: { id: s.defaultExecutorId } })
    if (a?.isAssistant) executor = executorPublic(a as AssistantRow & { avatarColor?: number })
  }
  return { settings: s, executor }
})

// ---- 快速模板:列出(每个按当前 Settings + 助手实时解析执行人/模型/工具/可行性)----
app.get('/api/templates', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const settings = await getSettings()
  const all = (await prisma.user.findMany({ where: { isAssistant: true } })) as (AssistantRow & {
    avatarColor: number
  })[]
  const resolved = QUICK_TEMPLATES.map((t) => resolveTemplatePlan(t, all, settings.defaultExecutorId))
  return { templates: resolved, settings }
})

// 把模板按当前助手解析成「执行计划预览」(每步执行人/模型/工具/风险/可行性)
function resolveTemplatePlan(
  t: (typeof QUICK_TEMPLATES)[number],
  all: (AssistantRow & { avatarColor: number })[],
  defaultExecutorId?: string | null,
) {
  const steps = t.steps.map((s) => {
    const { assistant, reason } = resolveExecutorForStep(s, all, defaultExecutorId)
    return {
      title: s.title,
      detail: s.detail,
      tool: s.tool,
      requiredAny: s.requiredAny,
      writesFiles: !!s.writesFiles,
      runsCommands: !!s.runsCommands,
      opensBrowser: !!s.opensBrowser,
      needsApproval: !!s.needsApproval,
      deliverable: s.deliverable,
      priority: s.priority ?? 'medium',
      executor: assistant ? executorPublic(assistant) : null,
      executorReason: assistant ? '' : reason,
    }
  })
  // 主执行人:取「能力要求最高」那一步的执行人,否则第一步
  const headlineIdx =
    steps.findIndex((s) => s.requiredAny.length) >= 0
      ? steps.reduce((best, s, i, arr) => (s.requiredAny.length > arr[best].requiredAny.length ? i : best), 0)
      : 0
  const primary = steps[headlineIdx]?.executor ?? steps[0]?.executor ?? null
  const blocked = steps.filter((s) => !s.executor)
  return {
    id: t.id,
    title: t.title,
    subtitle: t.subtitle,
    icon: t.icon,
    category: t.category,
    goalTemplate: t.goalTemplate,
    defaultMode: t.defaultMode,
    failureHandling: t.failureHandling,
    deliveryLocation: t.deliveryLocation,
    missingInfo: t.missingInfo ?? null,
    steps,
    primaryExecutor: primary,
    available: blocked.length === 0 && !!primary,
    blockedReason: blocked.length ? blocked[0].executorReason : '',
  }
}

// ---- Pending Input:列表(待处理的结构化补充)----
app.get('/api/pending-inputs', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { status } = req.query as { status?: string }
  return prisma.pendingInput.findMany({
    where: { status: status || 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
})

// ---- Pending Input:解决(补充自定义值 / 按默认假设继续 / 选项)→ 续跑任务 ----
app.post('/api/pending-inputs/:id/resolve', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as { value?: string; useDefault?: boolean }
  const pi = await prisma.pendingInput.findUnique({ where: { id } })
  if (!pi) return reply.code(404).send({ error: 'not found' })
  if (pi.status !== 'pending') return reply.code(400).send({ error: 'already resolved' })

  const useDefault = b.useDefault || b.value === '__assume__'
  const answer = useDefault ? pi.defaultValue ?? '__assume__' : (b.value ?? '').trim()
  if (!useDefault && !answer) return reply.code(400).send({ error: '请填写补充信息或选择按默认继续' })

  await prisma.pendingInput.update({
    where: { id },
    data: {
      status: useDefault ? 'skipped' : 'resolved',
      answer,
      resolvedById: me.id,
      resolvedAt: new Date(),
    },
  })
  await writeAudit({
    type: 'pending_input.resolved',
    summary: useDefault
      ? `按 MVP 默认假设继续:「${pi.question.slice(0, 60)}」`
      : `补充信息后继续:${answer.slice(0, 60)}`,
    actorId: me.id,
    taskId: pi.taskId,
    missionId: pi.missionId,
    payload: { pendingInputId: id, useDefault },
  })

  // 续跑任务:把补充信息 / 默认假设注入
  if (!pi.taskId) {
    broadcastWorkspace()
    return { ok: true }
  }
  const sr = pi.runId
    ? await prisma.sandboxRun.findFirst({ where: { taskRunId: pi.runId }, orderBy: { createdAt: 'desc' } })
    : null
  const reuse = sr && sr.status !== 'applied' && sr.status !== 'discarded' && existsSync(sr.workspacePath) ? sr.id : undefined
  const extraBrief = useDefault
    ? '用户选择「按 MVP 默认假设继续」:请用最合理的默认假设把任务做完,在汇报里标注你的假设,不要再追问。'
    : `用户补充了信息:${answer}。请据此继续把任务做完并汇报。`
  const r = await executeTask(pi.taskId, {
    triggeredById: me.id,
    trigger: 'continue',
    forceAssistantId: pi.assistantId ?? undefined,
    reuseSandboxRunId: reuse,
    assumeDefaults: useDefault,
    extraBrief,
    input: useDefault ? null : answer,
  })
  broadcastWorkspace()
  broadcastTasks()
  if ('error' in r) return reply.code(r.code).send({ error: r.error })
  if ('needsInput' in r)
    return reply.send({
      status: 'needs_input',
      field: r.field,
      prompt: r.prompt,
      reason: r.reason,
      options: r.options,
      recommended: r.recommended,
      defaultValue: r.defaultValue,
      allowCustom: r.allowCustom,
    })
  return r
})

// ---- Mission 运行编排:三模式(auto 一键跑完 / confirm 逐步确认 / plan 只计划)----
app.post('/api/missions/:id/run', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const b = (req.body ?? {}) as { mode?: 'auto' | 'confirm' | 'plan' }
  const mode = b.mode ?? 'confirm'
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })
  await prisma.mission.update({
    where: { id },
    data: { runMode: mode, status: mode === 'plan' ? 'planning' : 'running' },
  })
  await writeAudit({
    type: 'mission.run_mode',
    summary: `Mission「${mission.title}」运行模式:${mode === 'auto' ? '一键跑完' : mode === 'confirm' ? '逐步确认' : '只生成计划'}`,
    actorId: me.id,
    missionId: id,
    payload: { mode },
  })
  broadcastWorkspace()
  if (mode === 'plan') return { ok: true, mode, started: false }
  // confirm / auto:启动推进(不阻塞请求,后台串行执行,前端轮询/WS 观察)
  void advanceMission(id, me.id, mode).catch((e) => console.error('[mission-run]', e))
  return { ok: true, mode, started: true }
})

// 推进 Mission:挑下一个未完成任务 → 角色感知指派执行人 → 执行。
// auto:成功即递归跑下一步;遇 needs_input/needs_approval/needs_review/failed 停下暴露。
// confirm:只跑一步(下一步由用户在 Mission 点「执行下一步」)。
async function advanceMission(missionId: string, triggeredById: string, mode: 'auto' | 'confirm') {
  const settings = await getSettings()
  const all = (await prisma.user.findMany({ where: { isAssistant: true } })) as (AssistantRow & {
    avatarColor: number
  })[]
  const tasks = await prisma.task.findMany({
    where: { missionId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  // 已有进行中的执行 → 不重复推进
  const activeRun = await prisma.taskRun.findFirst({
    where: { missionId, status: { in: ['queued', 'running'] } },
  })
  if (activeRun) return
  const next = tasks.find((t: any) => t.status === 'todo')
  if (!next) {
    await prisma.mission.update({ where: { id: missionId }, data: { status: 'review' } }).catch(() => {})
    broadcastWorkspace()
    return
  }
  // 角色感知指派执行人(若任务尚未指派或指派者不胜任)
  const intent = analyzeTaskIntent(next)
  const prefer: StepPrefer = intent.needsBrowser
    ? 'browser'
    : intent.needsCommand
      ? 'engineer'
      : intent.needsNetwork
        ? 'research'
        : 'any'
  const cur = next.assigneeId ? all.find((a) => a.id === next.assigneeId) : undefined
  const curOk = cur && (!intent.requiredAny.length || assistantHasAny(parseSkills(cur.skills), intent.requiredAny))
  if (!curOk) {
    const { assistant } = resolveExecutorForStep(
      { requiredAny: intent.requiredAny, prefer },
      all,
      settings.defaultExecutorId,
    )
    const chosen = assistant ?? (settings.defaultExecutorId ? all.find((a) => a.id === settings.defaultExecutorId) : undefined)
    if (chosen) await prisma.task.update({ where: { id: next.id }, data: { assigneeId: chosen.id } })
    else {
      // 无合适执行人:停下,如实记录(让用户去 Settings 配置)
      await writeAudit({
        type: 'mission.blocked',
        summary: `Mission 推进受阻:任务「${next.title}」没有合适的执行助手,请去 Settings 配置具备所需能力的助手`,
        actorId: triggeredById,
        taskId: next.id,
        missionId,
      })
      broadcastWorkspace()
      return
    }
  }
  const r = await executeTask(next.id, {
    triggeredById,
    trigger: mode === 'auto' ? 'auto' : 'manual',
    assumeDefaults: mode === 'auto' ? settings.assumeDefaults : false,
  })
  // auto:成功/待复核(已交付内容)→ 继续下一步;其余状态(needs_input/needs_approval/failed)停下
  if (mode === 'auto' && !('error' in r) && !('needsInput' in r) && (r.status === 'succeeded' || r.status === 'review')) {
    // 标记完成,推进下一个
    await prisma.task.update({ where: { id: next.id }, data: { status: 'done' } }).catch(() => {})
    broadcastTasks()
    await advanceMission(missionId, triggeredById, 'auto')
  } else if (mode === 'auto' && 'needsInput' in r) {
    // 执行前缺信息(如天气缺城市):assumeDefaults 时用模板默认值续跑,否则建结构化 PendingInput 停下
    await prisma.pendingInput.create({
      data: {
        taskId: next.id,
        missionId,
        field: r.field,
        question: r.prompt,
        reason: '执行前需要这条关键信息',
        optionsJson: JSON.stringify([{ label: '按 MVP 默认假设继续', value: '__assume__' }]),
        recommended: 0,
        defaultValue: '__assume__',
        allowCustom: true,
      },
    })
    broadcastWorkspace()
  }
}

// ---- Mission:执行下一步(confirm 模式,用户逐步确认)----
app.post('/api/missions/:id/advance', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const { id } = req.params as { id: string }
  const mission = await prisma.mission.findUnique({ where: { id } })
  if (!mission) return reply.code(404).send({ error: 'not found' })
  void advanceMission(id, me.id, 'confirm').catch((e) => console.error('[mission-advance]', e))
  return { ok: true }
})

// ===== v2 E4 Optimizer Agent(持续分析器,Markus Heartbeat 启发) =====
// 不调 LLM,纯 SQL+规则扫描:
//   1) PendingInput 卡 > OPT_STALE_PI_MS 未解决 → 建议"采用默认值跳过"
//   2) pending Delivery 已 > OPT_STALE_DELIVERY_MS 未审批 → 建议"现在去看看"
// 每条建议作为 Message(type='optimizer_suggestion')post 到对应频道。
// dedup:同一 target+kind 只发一次(in-memory Set;server 重启清空 → 可重发)。
const OPT_INTERVAL_MS = 60_000 // 每 1 分钟扫一次(smoke 友好;production 可拉到 5 min)
const OPT_STALE_PI_MS = 60_000 // 测试用 60s;production 用 60 * 60_000
const OPT_STALE_DELIVERY_MS = 90_000 // 测试用 90s;production 用 24 * 60 * 60_000
const optimizerSuggested = new Set<string>() // `${kind}:${targetId}` 去重

type OptimizerActionType = 'skip_pending_input' | 'approve_delivery' | 'dismiss'
type OptimizerSuggestionCardData = {
  kind: 'optimizer_suggestion'
  suggestionKind: 'pending_input_stale' | 'delivery_stale'
  title: string
  body: string
  ageMinutes: number
  target: { kind: NodeKind; id: string; label: string }
  action: { type: OptimizerActionType; label: string; payload: Record<string, unknown> }
  why: { reason: string; dataPoints: string[] }
}

async function getOrEnsureOptimizerUser(): Promise<{ id: string; name: string } | null> {
  // 取一个有 isAssistant=true 的用户作为 Optimizer 发言身份(避免新增一个特殊 user 表条目);
  // 没有助手则跳过(graph 视图也不会有 Optimizer 建议)。
  const a = await prisma.user.findFirst({ where: { isAssistant: true }, orderBy: { createdAt: 'asc' } })
  return a ? { id: a.id, name: a.name } : null
}

export async function optimizerScan(): Promise<void> {
  const optimizer = await getOrEnsureOptimizerUser()
  if (!optimizer) return
  const now = Date.now()

  // ---- 1) PendingInput stale ----
  const stalePIs = await prisma.pendingInput.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(now - OPT_STALE_PI_MS) } },
    orderBy: { createdAt: 'asc' },
  })
  for (const pi of stalePIs) {
    const dedupKey = `pi:${pi.id}`
    if (optimizerSuggested.has(dedupKey)) continue
    if (!pi.taskId) continue
    const t = await prisma.task.findUnique({ where: { id: pi.taskId }, select: { channelId: true, title: true } })
    if (!t?.channelId) continue
    const ageMin = Math.max(1, Math.round((now - pi.createdAt.getTime()) / 60_000))
    const card: OptimizerSuggestionCardData = {
      kind: 'optimizer_suggestion',
      suggestionKind: 'pending_input_stale',
      title: `任务「${t.title}」已阻塞 ${ageMin} 分钟`,
      body: `等待用户补充:${pi.question.slice(0, 100)}`,
      ageMinutes: ageMin,
      target: { kind: 'approval', id: pi.id, label: pi.question.slice(0, 60) },
      action: {
        type: 'skip_pending_input',
        label: pi.defaultValue ? '采用默认值跳过' : '按 MVP 假设继续',
        payload: { pendingInputId: pi.id, value: pi.defaultValue ?? '__assume__' },
      },
      why: {
        reason: 'pending_input_stale',
        dataPoints: [
          `PendingInput 创建于 ${pi.createdAt.toISOString()}`,
          `阻塞时长 ${ageMin} 分钟 (≥ 阈值 ${Math.round(OPT_STALE_PI_MS / 60_000)} 分钟)`,
          `defaultValue=${pi.defaultValue ?? '(无,使用 __assume__)'}`,
        ],
      },
    }
    const members = await memberIds(t.channelId)
    try {
      const msg = await prisma.message.create({
        data: {
          channelId: t.channelId,
          authorId: optimizer.id,
          body: `[Optimizer] ${card.title}:${card.body}\n建议:${card.action.label}`,
          type: 'optimizer_suggestion',
          cardJson: JSON.stringify(card),
          whyJson: JSON.stringify(card.why),
        },
        include: fullMessageInclude,
      })
      sendToUsers(members, { type: 'message', channelId: t.channelId, message: shapeMessage(msg) })
      // 写一条 monitors 边:optimizer → approval/task
      await writeEdge({
        channelId: t.channelId,
        fromKind: 'optimizer',
        fromId: msg.id,
        toKind: 'approval',
        toId: pi.id,
        verb: 'monitors',
        why: card.why,
      })
      await writeEdge({
        channelId: t.channelId,
        fromKind: 'optimizer',
        fromId: msg.id,
        toKind: 'task',
        toId: pi.taskId,
        verb: 'monitors',
        why: { reason: 'task_blocked_by_pi' },
      })
      optimizerSuggested.add(dedupKey)
    } catch (e) {
      console.error('[optimizer-pi]', e)
    }
  }

  // ---- 2) Delivery stale ----
  const staleDels = await prisma.delivery.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(now - OPT_STALE_DELIVERY_MS) } },
    orderBy: { createdAt: 'asc' },
  })
  for (const d of staleDels) {
    const dedupKey = `delivery:${d.id}`
    if (optimizerSuggested.has(dedupKey)) continue
    if (!d.taskId) continue
    const t = await prisma.task.findUnique({ where: { id: d.taskId }, select: { channelId: true, title: true } })
    if (!t?.channelId) continue
    const ageMin = Math.max(1, Math.round((now - d.createdAt.getTime()) / 60_000))
    const card: OptimizerSuggestionCardData = {
      kind: 'optimizer_suggestion',
      suggestionKind: 'delivery_stale',
      title: `交付「${d.title}」已 ${ageMin} 分钟未审批`,
      body: `任务「${t.title}」的交付物等待验收,可点开预览或一键 approve`,
      ageMinutes: ageMin,
      target: { kind: 'delivery', id: d.id, label: d.title },
      action: {
        type: 'approve_delivery',
        label: '一键 approve',
        payload: { deliveryId: d.id },
      },
      why: {
        reason: 'delivery_stale',
        dataPoints: [
          `Delivery 创建于 ${d.createdAt.toISOString()}`,
          `等待时长 ${ageMin} 分钟 (≥ 阈值 ${Math.round(OPT_STALE_DELIVERY_MS / 60_000)} 分钟)`,
          `testResult=${d.testResult ?? '(未跑)'}`,
        ],
      },
    }
    const members = await memberIds(t.channelId)
    try {
      const msg = await prisma.message.create({
        data: {
          channelId: t.channelId,
          authorId: optimizer.id,
          body: `[Optimizer] ${card.title}。${card.body}\n建议:${card.action.label}`,
          type: 'optimizer_suggestion',
          cardJson: JSON.stringify(card),
          whyJson: JSON.stringify(card.why),
        },
        include: fullMessageInclude,
      })
      sendToUsers(members, { type: 'message', channelId: t.channelId, message: shapeMessage(msg) })
      await writeEdge({
        channelId: t.channelId,
        fromKind: 'optimizer',
        fromId: msg.id,
        toKind: 'delivery',
        toId: d.id,
        verb: 'monitors',
        why: card.why,
      })
      optimizerSuggested.add(dedupKey)
    } catch (e) {
      console.error('[optimizer-del]', e)
    }
  }
}

if (!process.env.HELIO_NO_LISTEN) {
  setInterval(() => {
    optimizerScan().catch((e) => console.error('[optimizer-scan]', e))
  }, OPT_INTERVAL_MS)
  // 启动后 5 秒先跑一次(开发体验,不用等 1 分钟)
  setTimeout(() => {
    optimizerScan().catch((e) => console.error('[optimizer-scan]', e))
  }, 5000)
}

// ---- Optimizer 建议:接受/dismiss ----
app.post('/api/optimizer/apply', async (req, reply) => {
  const me = await currentUser(req)
  if (!me) return reply.code(401).send({ error: 'no identity' })
  const b = (req.body ?? {}) as { messageId?: string; type?: OptimizerActionType; payload?: Record<string, unknown> }
  if (!b.messageId || !b.type) return reply.code(400).send({ error: 'invalid body' })
  const msg = await prisma.message.findUnique({ where: { id: b.messageId } })
  if (!msg || msg.type !== 'optimizer_suggestion') return reply.code(404).send({ error: 'not optimizer suggestion' })
  const payload = b.payload ?? {}
  try {
    if (b.type === 'skip_pending_input') {
      const pid = payload.pendingInputId as string | undefined
      if (!pid) return reply.code(400).send({ error: 'missing pendingInputId' })
      await prisma.pendingInput.update({
        where: { id: pid },
        data: { status: 'skipped', answer: String(payload.value ?? '__assume__'), resolvedById: me.id, resolvedAt: new Date() },
      })
      broadcastWorkspace()
    } else if (b.type === 'approve_delivery') {
      const did = payload.deliveryId as string | undefined
      if (!did) return reply.code(400).send({ error: 'missing deliveryId' })
      await prisma.delivery.update({
        where: { id: did },
        data: { status: 'approved', approvedById: me.id, approvedAt: new Date() },
      })
      // 复用 approves 边
      const d = await prisma.delivery.findUnique({ where: { id: did }, select: { taskId: true } })
      let chanId: string | null = null
      if (d?.taskId) {
        const t = await prisma.task.findUnique({ where: { id: d.taskId }, select: { channelId: true } })
        chanId = t?.channelId ?? null
      }
      await writeEdge({
        channelId: chanId,
        fromKind: 'agent',
        fromId: me.id,
        toKind: 'delivery',
        toId: did,
        verb: 'approves',
        why: { reason: 'optimizer_suggested', acceptedFrom: msg.id },
      })
      broadcastWorkspace()
    }
    // 标记建议为「已采纳」:把卡片 body 加上后缀,前端按 whyJson 决定显示
    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: {
        whyJson: JSON.stringify({
          ...(msg.whyJson ? safeParseJson(msg.whyJson) : {}),
          accepted: true,
          acceptedById: me.id,
          acceptedAt: new Date().toISOString(),
        }),
      },
      include: fullMessageInclude,
    })
    const members = await memberIds(msg.channelId)
    sendToUsers(members, { type: 'message-updated', channelId: msg.channelId, message: shapeMessage(updated) })
    return { ok: true }
  } catch (e) {
    console.error('[optimizer-apply]', e)
    return reply.code(500).send({ error: 'apply failed' })
  }
})

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// J3:project 频道强制 ≥1 个具备 exec skills(write_file / run_command / browser_*)的 AI 成员。
// 否则 H2 命中后会被 J4 cede,用户体感是"AI 都在讨论但没人动手"。
async function ensureProjectExecutor(channelId: string): Promise<{ added?: string }> {
  const ch = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { include: { user: true } } },
  })
  if (!ch || ch.kind !== 'project') return {}
  const assistantsInChannel: any[] = ch.members
    .map((m: any) => m.user)
    .filter((u: any) => u.isAssistant)
  const hasExec = assistantsInChannel.some((a) => assistantHasExecSkills(a) && !isImageModel(a.model))
  if (hasExec) return {}
  // 选候选:全局 AI 池中具备 exec skills 且非图像模型的;按 exec 技能数量降序,name='软件工程师' 优先
  const allAssistants: any[] = await prisma.user.findMany({ where: { isAssistant: true } })
  const candidates = allAssistants
    .filter((a) => assistantHasExecSkills(a) && !isImageModel(a.model))
    .map((a) => ({
      a,
      execCount: parseSkills(a.skills).filter((s) => A2A_EXEC_SKILLS.includes(s)).length,
      isEngineer: a.name === '软件工程师',
    }))
    .sort((x, y) => {
      if (x.isEngineer !== y.isEngineer) return x.isEngineer ? -1 : 1
      return y.execCount - x.execCount
    })
  const pick = candidates[0]?.a
  if (!pick) return {}
  // 已是成员 → 不重复添加(理论上前面 hasExec 已经过滤;防御)
  const exists = ch.members.some((m: any) => m.userId === pick.id)
  if (exists) return {}
  await prisma.channelMember.create({ data: { channelId, userId: pick.id } }).catch(() => {})
  await writeAudit({
    type: 'project_channel.exec_added',
    summary: `项目频道 #${ch.name} 缺执行 AI,自动加入「${pick.name}」`,
    payload: { channelId, assistantId: pick.id, assistantName: pick.name },
  })
  return { added: pick.name }
}

// J3 启动迁移:扫所有 kind='project' 频道,补加 exec AI(只补一次,有则跳过)。
// 异步执行,不阻塞 listen。
async function migrateEnsureProjectExecutors() {
  try {
    const projects = await prisma.channel.findMany({
      where: { kind: 'project', archivedAt: null },
      select: { id: true, name: true },
    })
    let migrated = 0
    for (const p of projects) {
      const r = await ensureProjectExecutor(p.id)
      if (r.added) migrated++
    }
    if (migrated > 0)
      console.log(`[J3 migrate] 补加 exec AI 到 ${migrated} 个项目频道`)
  } catch (e) {
    console.error('[J3 migrate]', e)
  }
}
if (!process.env.HELIO_NO_LISTEN) {
  void migrateEnsureProjectExecutors()
}

// J5:create_task 后自动开工 hook 注册
// skills.ts 的 create_task.run 创完 task 后调本 hook;在此选 executor + fire-and-forget 调 executeTask。
// 只对 project 频道生效;DM 已被 J2 拦在 create 之前;discussion 频道不自动开工(避免噪声)。
setAutoExecAfterCreateTaskHook(async ({ taskId, channelId, triggeredById, title }) => {
  if (!triggeredById) return
  const ch = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { include: { user: true } } },
  })
  if (!ch || ch.kind !== 'project') return // v4:只在项目频道自动开工
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return
  const assistants: any[] = ch.members.map((m: any) => m.user).filter((u: any) => u.isAssistant)
  if (assistants.length === 0) return
  // 选 executor:优先看 task.assigneeId 是否本频道内具备 exec skills 的 AI;否则 pickAutoExecutor。
  let executor: any | null = null
  if (task.assigneeId) {
    const cand = assistants.find((a) => a.id === task.assigneeId)
    if (cand && assistantHasExecSkills(cand) && !isImageModel(cand.model)) executor = cand
  }
  if (!executor) executor = pickAutoExecutor(assistants, channelId)
  if (!executor) return // 项目频道没合格 executor;J3 启动迁移会补,J4 会另行提示
  // 若 task 还没指派,补成本次 executor
  if (!task.assigneeId) {
    await prisma.task
      .update({ where: { id: task.id }, data: { assigneeId: executor.id } })
      .catch(() => {})
  }
  await writeAudit({
    type: 'auto_exec_after_create_task',
    summary: `项目频道 #${ch.name}:产品经理 create_task「${title}」后自动派给 ${executor.name} 开工`,
    actorId: triggeredById,
    taskId: task.id,
    missionId: task.missionId ?? null,
    payload: { channelId, executorId: executor.id, executorName: executor.name },
  })
  // fire-and-forget;executeTask 内部自己用 task.channelId(J1 已保证)
  void executeTask(task.id, {
    triggeredById,
    trigger: 'auto',
    channelId,
  }).catch((e) => console.error('[auto_exec_after_create_task]', e))
})

// v2 smoke 脚本会 import 本模块复用 helpers,不需要起 server / cron。
// 通过 HELIO_NO_LISTEN=1 短路启动。
const port = Number(process.env.PORT ?? 5373)
if (!process.env.HELIO_NO_LISTEN) {
  app
    .listen({ port, host: '127.0.0.1' })
    .then(() => console.log(`[helio-clone] server on http://127.0.0.1:${port}`))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
