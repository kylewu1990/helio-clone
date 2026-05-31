// Phase U / M1:Mastra workflow 接管 deck 编排(等价替换 runDeckJob 的手写状态机)。
//
// 铁律:
//  - R1 控制流由 Mastra 表达(initStep → parallel[content,data] → composeStep → persistStep)。
//  - R2 本模块**不能 import index.ts**(顶层有 app.listen)。只 import 叶子模块
//    (ai / db / deck/prompt / realtime),index.ts 私有 infra 全部走 DI(deps)。
//  - 等价性:step body 仍调现有 generateReply / compose* / sandbox 落盘逻辑,产出与 legacy
//    runDeckJob **逐字节近似**(GenerationJob / SandboxRun / Artifact / Delivery / 泳道事件 / 频道消息一致)。
//
// 软降级语义(对齐 legacy):content/data 失败 → 丢素材片段不挂整单;visual(compose)硬失败 → throw。
// critic 在 M1 不接(legacy 无 critic,加了会破坏等价性);M3 由 CrewAI 接 critic。
//
// run.watch 事件可桥接更细的 RunEvent(M2 给 pi-runner 用);M1 为保证与 legacy 逐项等价,
// 角色泳道事件仍由 step body 内的 emitRunEvent 直发(与 legacy 同源同序)。

import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { resolve as pathResolve } from 'node:path'
import { tmpdir } from 'node:os'
import { generateReply, canGenerate } from '../ai.js'
import {
  composeDeckSystemPrompt,
  composeDeckPlanPrompt,
  composeRolePrompt,
} from '../deck/prompt.js'
import { prisma } from '../db.js'
import { sendToUsers } from '../realtime.js'
import { sanitizeDeckHtml } from '../deck/sanitizeHtml.js'
import { runPiVisual, PiAbortError } from './piVisualRunner.js'
import { callCrew, crewEnabled, type CrewMaterial, type CrewCritic } from './crewClient.js'

// ===== 类型(与 index.ts 同形)=====
export type DeckRoleSpec = { role: string; focus?: string; assigneeHandle?: string }
export type DeckContribution = { role: string; assistantName: string; content: string }
export type DeckAssistant = {
  id: string
  name: string
  handle: string
  status: string | null
  systemPrompt: string | null
  memory: string | null
  provider: string | null
  baseUrl: string | null
  apiKey: string | null
  model: string | null
}
type DeckRoleMeta = { role: string; assistantId: string; assistantName: string; model: string | null; status: string }

// index.ts 私有 infra 的注入面(R2)。形状对齐 index.ts 现有实现。
export type RunEventScopeLike = {
  runId: string
  taskId?: string | null
  missionId?: string | null
  channelId?: string | null
  generationJobId?: string | null
  members?: string[]
}
export type RepoPluginLike = { id: string; zhName: string; stackable: boolean; exampleHtml: string | null }

export interface DeckWorkflowDeps {
  emitRunEvent: (scope: RunEventScopeLike, ev: Record<string, unknown>) => void | Promise<void>
  postDeliveryCard: (scope: RunEventScopeLike, opts: Record<string, unknown>) => Promise<void>
  writeAudit: (input: Record<string, unknown>) => Promise<void>
  broadcastWorkspace: () => void
  memberIds: (channelId: string) => Promise<string[]>
  shapeMessage: (m: unknown) => unknown
  fullMessageInclude: unknown
  scanRepoPlugins: (force?: boolean) => Promise<RepoPluginLike[]>
  heliRoot: string // = process.env.HELIO_ROOT || <repo root>(index.ts 计算后注入,保证沙盒路径与 legacy 一致)
}

export interface DeckWorkflowInput {
  jobId: string
  me: { id: string; name: string }
  assistant: {
    id: string
    name: string
    avatarColor: number
    status: string | null
    systemPrompt: string | null
    memory: string | null
    provider: string | null
    baseUrl: string | null
    apiKey: string | null
    model: string | null
    handle: string
  }
  topic: string
  audience: string
  deckType: string
  pageCount: number
  themeId: string
  channelId: string | null
  attachments: Array<{ url: string; name: string }>
  taskId: string | null
  pluginPrompts: Array<{ id: string; zhName: string; prompt: string }>
}

// 红队 M-2:generateReply 无内置超时(替代 withDeckTimeout)。
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 超时(${ms}ms)`)), ms)),
  ])
}

async function deckOrchestrationEnabled(): Promise<boolean> {
  try {
    const s = await prisma.appSetting.upsert({ where: { id: 'app' }, update: {}, create: { id: 'app' } })
    return (s as { deckOrchestration?: boolean }).deckOrchestration !== false
  } catch {
    return true
  }
}

// Phase U / M2:visual 执行器细分 flag。'pi' → pi-agent-core runner;否则 mastra-inline(默认,可回退)。
async function readVisualRunner(): Promise<'mastra-inline' | 'pi'> {
  try {
    const s = await prisma.appSetting.upsert({ where: { id: 'app' }, update: {}, create: { id: 'app' } })
    return (s as { visualRunner?: string }).visualRunner === 'pi' ? 'pi' : 'mastra-inline'
  } catch {
    return 'mastra-inline'
  }
}

async function getChannelDeckAssistants(channelId: string | null, excludeId: string): Promise<DeckAssistant[]> {
  if (!channelId) return []
  try {
    const members = await prisma.channelMember.findMany({ where: { channelId }, include: { user: true } })
    return members
      .map((m: any) => m.user)
      .filter(
        (u: any) =>
          u.isAssistant &&
          u.id !== excludeId &&
          canGenerate({ provider: u.provider, baseUrl: u.baseUrl, apiKey: u.apiKey, model: u.model }),
      )
      .map((u: any) => ({
        id: u.id, name: u.name, handle: u.handle, status: u.status,
        systemPrompt: u.systemPrompt, memory: u.memory,
        provider: u.provider, baseUrl: u.baseUrl, apiKey: u.apiKey, model: u.model,
      }))
  } catch {
    return []
  }
}

async function planDeckRoles(opts: {
  orchestrator: DeckAssistant
  topic: string; audience: string; deckType: string; pageCount: number
  channelAssistants: DeckAssistant[]; isRevision: boolean; userId: string
}): Promise<DeckRoleSpec[]> {
  const fallback: DeckRoleSpec[] = [
    { role: 'content', focus: '大纲、文案、叙事节奏' },
    { role: 'visual', focus: '拿素材 + seed 直出完整 HTML' },
  ]
  try {
    const prompt = composeDeckPlanPrompt({
      topic: opts.topic, audience: opts.audience, deckType: opts.deckType, pageCount: opts.pageCount,
      channelAssistants: opts.channelAssistants.map((a) => ({ handle: a.handle, name: a.name, role: a.status ?? 'AI' })),
      isRevision: opts.isRevision,
    })
    const res = await withTimeout(
      generateReply({
        provider: opts.orchestrator.provider || null, baseUrl: opts.orchestrator.baseUrl || null,
        apiKey: opts.orchestrator.apiKey || null, model: opts.orchestrator.model || null,
        systemPrompt: prompt,
        messages: [{ role: 'user', content: '直接给出 JSON(无围栏、无前后文字)。' }],
        skills: [], ctx: { userId: opts.userId }, maxToolRounds: 0,
      }),
      45000, 'plan',
    )
    const text = res.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return fallback
    const parsed = JSON.parse(m[0]) as { roles?: DeckRoleSpec[] }
    const allow = new Set(['content', 'visual', 'data', 'critic'])
    const norm = (Array.isArray(parsed.roles) ? parsed.roles : []).filter(
      (r) => r && typeof r.role === 'string' && allow.has(r.role),
    )
    if (!norm.some((r) => r.role === 'content')) norm.unshift({ role: 'content', focus: '大纲、文案、叙事节奏' })
    if (!norm.some((r) => r.role === 'visual')) norm.push({ role: 'visual', focus: '拿素材 + seed 直出完整 HTML' })
    return norm
  } catch {
    return fallback
  }
}

async function runDeckRoleBrief(opts: {
  role: 'content' | 'data'
  assistant: DeckAssistant
  topic: string; audience: string; deckType: string; pageCount: number; focus: string; userId: string
}): Promise<string | null> {
  try {
    const prompt = composeRolePrompt({
      role: opts.role, topic: opts.topic, audience: opts.audience, deckType: opts.deckType,
      pageCount: opts.pageCount, focus: opts.focus, assistantName: opts.assistant.name,
    })
    const res = await withTimeout(
      generateReply({
        provider: opts.assistant.provider || null, baseUrl: opts.assistant.baseUrl || null,
        apiKey: opts.assistant.apiKey || null, model: opts.assistant.model || null,
        systemPrompt: prompt,
        messages: [{ role: 'user', content: '直接给素材文本,简洁可执行。' }],
        skills: [], ctx: { userId: opts.userId }, maxToolRounds: 0,
      }),
      60000, `role:${opts.role}`,
    )
    const t = (res.text || '').trim()
    return t.length > 0 ? t : null
  } catch {
    return null
  }
}

// ===== 每次运行的可变状态(steps 闭包共享;Mastra 只管控制流 + 生命周期)=====
type RunState = {
  input: DeckWorkflowInput
  deps: DeckWorkflowDeps
  scope: RunEventScopeLike
  job: { id: string }
  orchestrate: boolean
  plan: DeckRoleSpec[]
  byHandle: Map<string, DeckAssistant>
  contributions: DeckContribution[]
  visualAssignee: DeckAssistant
  rolesMeta: DeckRoleMeta[]
  seedHtml: string | null
  seedFromPluginName: string | null
  mainPlugin: RepoPluginLike | null
  html: string
  titleOut: string
  sectionCount: number
  resultSandboxRunId: string | null
  visualRunner: 'mastra-inline' | 'pi'
  criticScore: CrewCritic | null
}

function resolveAssignee(rs: RunState, spec: DeckRoleSpec, orchestrator: DeckAssistant): DeckAssistant {
  return (spec.assigneeHandle && rs.byHandle.get(spec.assigneeHandle)) || orchestrator
}

// ===== runDeckWorkflow:DI + Mastra 控制流。失败 throw(对齐 legacy runDeckJob 的抛错契约)=====
export async function runDeckWorkflow(input: DeckWorkflowInput, deps: DeckWorkflowDeps): Promise<void> {
  const orchestrator: DeckAssistant = { ...input.assistant }
  const visualRunner = await readVisualRunner()
  const rs: RunState = {
    input, deps,
    scope: { runId: input.jobId, generationJobId: input.jobId, taskId: input.taskId, channelId: input.channelId },
    job: { id: input.jobId },
    orchestrate: false,
    plan: [],
    byHandle: new Map(),
    contributions: [],
    visualAssignee: orchestrator,
    rolesMeta: [],
    seedHtml: null,
    seedFromPluginName: null,
    mainPlugin: null,
    html: '',
    titleOut: input.topic,
    sectionCount: 0,
    resultSandboxRunId: null,
    visualRunner,
    criticScore: null,
  }

  // ---- STEP 1:init —— 建 GenerationJob + seed + (orchestrate ? plan) ----
  const initStep = createStep({
    id: 'plan',
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      const { topic, audience, deckType, pageCount, themeId, channelId, attachments, taskId, pluginPrompts } = input
      const job = await prisma.generationJob.create({
        data: {
          // 等价性:与 legacy runDeckJob 一致用默认 cuid(opts.jobId 是路由 vestigial UUID,legacy 不用它作 job.id)。
          kind: 'deck',
          status: 'drafting',
          channelId,
          taskId,
          ownerId: input.assistant.id,
          requesterId: input.me.id,
          title: `做 PPT:${topic.slice(0, 180)}`,
          specJson: JSON.stringify({
            topic, audience, deckType, pageCount, themeId,
            skillIds: pluginPrompts.map((p) => p.id), attachments,
          }),
        },
      })
      rs.job = { id: job.id }
      rs.scope = { runId: job.id, generationJobId: job.id, taskId, channelId }

      // seed:从启用 plugins 里找第一个非 stackable(主风格)的 exampleHtml
      const allPlugins = await deps.scanRepoPlugins()
      const mainPlugin = pluginPrompts
        .map((pp) => allPlugins.find((rp) => rp.id === pp.id))
        .find((p): p is RepoPluginLike => !!p && !p.stackable && !!p.exampleHtml) ?? null
      rs.mainPlugin = mainPlugin
      rs.seedHtml = mainPlugin?.exampleHtml ?? null
      rs.seedFromPluginName = mainPlugin?.zhName ?? null

      rs.orchestrate = await deckOrchestrationEnabled()
      if (rs.orchestrate) {
        await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'planning' } }).catch(() => {})
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'plan', phase: 'understand', title: `${orchestrator.name} 正在拆分协作角色(plan)`, status: 'running' })
        const channelAssistants = await getChannelDeckAssistants(channelId, orchestrator.id)
        rs.plan = await planDeckRoles({ orchestrator, topic, audience, deckType, pageCount, channelAssistants, isRevision: false, userId: input.me.id })
        rs.byHandle = new Map(channelAssistants.map((a) => [a.handle, a]))
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'plan', phase: 'understand', title: `角色已拆分:${rs.plan.map((r) => r.role).join(' / ')}`, status: 'ok' })
        await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'drafting' } }).catch(() => {})
      }
      return { ok: true }
    },
  })

  // ---- 单角色 brief(content / data):闭包工厂,parallel 用 ----
  const briefStep = (role: 'content' | 'data') =>
    createStep({
      id: role,
      inputSchema: z.any(),
      outputSchema: z.any(),
      execute: async () => {
        if (!rs.orchestrate) return { ok: true, skipped: true }
        const spec = rs.plan.find((r) => r.role === role)
        if (!spec) return { ok: true, skipped: true }
        const who = resolveAssignee(rs, spec, orchestrator)
        const label = role === 'content' ? '内容文案' : '数据图表建议'
        // M3 §1 路由:data(analyst)走 CrewAI Python 子服务(配了 CREW_BASE_URL 才启用,否则 M2 行为)。
        // content 保持 Mastra agent(轻量文本)。两者都软降级(失败丢片段,visual 仍能合成)。
        const useCrew = role === 'data' && crewEnabled()
        const contributorName = useCrew ? 'CrewAI 分析' : who.name
        const metaId = useCrew ? 'crew' : who.id
        const metaModel = useCrew ? 'crew:analyst' : who.model
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role, phase: 'context', title: `${contributorName} 正在${useCrew ? '跑数据分析(analyst crew)' : `写${label}`}`, status: 'running' })

        let content: string | null = null
        if (useCrew) {
          const brief = `主题:${input.topic};受众:${input.audience};deck 类型:${input.deckType};目标 ${input.pageCount} 页。聚焦:${spec.focus || '数据支撑 / 趋势 / 对比 / 关键数字'}。给可直接进 deck 的分析要点。`
          const r = (await callCrew('analyst', brief)) as CrewMaterial | null
          content = r && r.summary ? `${r.summary}${r.points?.length ? '\n- ' + r.points.join('\n- ') : ''}` : null
        } else {
          content = await runDeckRoleBrief({
            role, assistant: who, topic: input.topic, audience: input.audience,
            deckType: input.deckType, pageCount: input.pageCount, focus: spec.focus || '', userId: input.me.id,
          })
        }
        rs.rolesMeta.push({ role, assistantId: metaId, assistantName: contributorName, model: metaModel, status: content ? 'done' : 'failed' })
        await deps.emitRunEvent(rs.scope, {
          kind: 'stage', role, phase: 'context',
          title: content
            ? `${contributorName} 的${label}已就绪`
            : `${contributorName} 的${label}未产出(${useCrew ? '分析 AI 未参与,' : ''}软降级跳过)`,
          status: content ? 'ok' : 'error',
        })
        if (content) rs.contributions.push({ role, assistantName: contributorName, content })
        return { ok: true, produced: !!content }
      },
    })

  // ---- STEP 2:fan-out(content / data 并行,各自软降级)----
  // ---- STEP 3:compose —— visual prep + 直出 HTML(硬依赖)----
  const composeStep = createStep({
    id: 'visual',
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async (ctx: any) => {
      // visual prep(对齐 legacy:fan-out 之后、compose 之前)
      if (rs.orchestrate) {
        const visualSpec = rs.plan.find((r) => r.role === 'visual')
        rs.visualAssignee = visualSpec ? resolveAssignee(rs, visualSpec, orchestrator) : orchestrator
        rs.rolesMeta.push({ role: 'visual', assistantId: rs.visualAssignee.id, assistantName: rs.visualAssignee.name, model: rs.visualAssignee.model, status: 'running' })
        await prisma.generationJob
          .update({ where: { id: rs.job.id }, data: { status: 'composing', rolesJson: JSON.stringify(rs.rolesMeta) } })
          .catch(() => {})
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'visual', phase: 'write', title: `${rs.visualAssignee.name} 正在合成 HTML deck(吃 ${rs.contributions.length} 份队友素材)`, status: 'running' })
      } else {
        rs.visualAssignee = orchestrator
      }

      const visualAssignee = rs.visualAssignee
      const systemPrompt = composeDeckSystemPrompt({
        topic: input.topic, audience: input.audience, deckType: input.deckType, themeId: input.themeId,
        pageCount: input.pageCount, presenter: input.me.name,
        assistantPersona: visualAssignee.systemPrompt ?? null, assistantMemory: visualAssignee.memory ?? null,
        assistantName: visualAssignee.name, attachments: input.attachments, pluginPrompts: input.pluginPrompts,
        seedHtml: rs.seedHtml, seedFromPluginName: rs.seedFromPluginName,
        contributions: rs.contributions.length ? rs.contributions : null,
      })

      const setHtml = (raw: string) => {
        const { html, titleOut, sectionCount } = sanitizeDeckHtml(raw, input.topic) // 与 legacy 同源清洗(非法 throw)
        rs.html = html
        rs.titleOut = titleOut
        rs.sectionCount = sectionCount
      }

      // inline 合成(M1 行为):generateReply 直出 HTML 文本
      const composeInline = async (): Promise<string> => {
        let llmText = ''
        try {
          const res = await withTimeout(
            generateReply({
              provider: visualAssignee.provider || null, baseUrl: visualAssignee.baseUrl || null,
              apiKey: visualAssignee.apiKey || null, model: visualAssignee.model || null,
              systemPrompt,
              messages: [{
                role: 'user',
                content: `请按上方 SEED_TEMPLATE 改一份「${input.topic}」主题的 deck(目标 ${input.pageCount} 页)。\n直接输出**完整 HTML**(以 <!doctype html> 开头,以 </html> 结尾)。\n不要任何前后文字、不要 \`\`\`html 围栏、不要 JSON。`,
              }],
              skills: [], ctx: { userId: input.me.id }, maxToolRounds: 0,
            }),
            120000, 'compose',
          )
          llmText = res.text || ''
        } catch (e) {
          throw new Error(`LLM 调用失败:${(e as Error).message}`)
        }
        if (!llmText || llmText.includes('未配置密钥') || llmText.includes('not configured')) {
          throw new Error(`${input.assistant.name} 的 LLM 配置缺失或未命中`)
        }
        return llmText
      }

      // ===== M2:visualRunner='pi' → pi-agent-core 在 scratch 目录生成 → 读回 → sanitize =====
      // 微调1:pi 只在 scratch 跑,**不碰正式 sandbox workspace**(persist 仍是落盘唯一真相源)。
      // 微调2:读回内容走同一 sanitizeDeckHtml(围栏/夹带文字可救回)。
      // 微调3:timeout+轮数预算;失败(非中断)同一次运行内回退 inline 并发可见事件。
      if (rs.visualRunner === 'pi') {
        const scratchDir = pathResolve(tmpdir(), `deck-pi-${randomUUID().slice(0, 8)}`)
        try {
          const r = await runPiVisual({
            systemPrompt,
            userMessage: `请按上方 SEED_TEMPLATE 做一份「${input.topic}」主题的 deck(目标 ${input.pageCount} 页)。\n用 write_file 工具把**完整 HTML**(以 <!doctype html> 开头、以 </html> 结尾)一次性写到 index.html。\n只写文件,不要在回复里粘 HTML、不要 \`\`\`html 围栏。`,
            llm: { baseUrl: visualAssignee.baseUrl, apiKey: visualAssignee.apiKey, model: visualAssignee.model },
            scratchDir,
            outFile: 'index.html',
            abortSignal: ctx?.abortSignal,
            timeoutMs: 120000,
            maxToolRounds: 6,
            onEvent: (ev) => {
              void deps.emitRunEvent(rs.scope, { kind: ev.kind, tool: ev.tool, callId: ev.callId, role: 'visual', phase: 'write', title: ev.title, status: ev.status, detail: ev.detail })
            },
          })
          setHtml(r.rawText) // sanitize 失败会 throw → 落到下面 catch 降级
          await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'visual', phase: 'write', title: `${visualAssignee.name} 用 pi runner 合成完成(工具 ${r.toolRounds} 轮,${rs.sectionCount} sections)`, status: 'ok' })
          return { ok: true }
        } catch (e) {
          // 真中断(用户"停"):不降级,透传 → workflow failed → job cancelled/failed
          if (e instanceof PiAbortError || ctx?.abortSignal?.aborted) throw e
          // in-run 降级:pi 产出未通过 → 同一次运行回退 inline,并发一条可见事件
          await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'visual', phase: 'write', title: `pi 合成未通过,本次回退 inline 合成(${(e as Error).message.slice(0, 50)})`, status: 'error' })
        } finally {
          void import('node:fs/promises').then((fsp) => fsp.rm(scratchDir, { recursive: true, force: true }).catch(() => {}))
        }
      }

      // 默认 mastra-inline,或 pi 降级落到这里
      setHtml(await composeInline())
      return { ok: true }
    },
  })

  // ---- STEP 3.5:critic —— CrewAI 5 维评审(§1 路由,advisory + 软降级)----
  // 配了 CREW_BASE_URL 才跑;不可达 → 软降级(编排卡标注"分析 AI 未参与"),不挂主流程、不阻塞交付。
  const criticStep = createStep({
    id: 'critic',
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      if (!rs.orchestrate || !crewEnabled()) return { ok: true, skipped: true }
      await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'critic', phase: 'verify', title: 'CrewAI 评审 AI 正在做 5 维评分(critic crew)', status: 'running' })
      const brief = `请评审这份已生成的 deck。主题:${input.topic};受众:${input.audience};deck 类型:${input.deckType};共 ${rs.sectionCount} 页;标题:「${rs.titleOut}」。从 clarity/design/narrative/data_support/persuasion 五维各打 0-10 分,给 needs_revision 与简短 notes。`
      const score = (await callCrew('critic', brief)) as CrewCritic | null
      if (!score) {
        rs.rolesMeta.push({ role: 'critic', assistantId: 'crew', assistantName: 'CrewAI 评审', model: 'crew:critic', status: 'failed' })
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'critic', phase: 'verify', title: '分析 AI 未参与(CrewAI 评审不可达,软降级)', status: 'error' })
        return { ok: true, degraded: true }
      }
      rs.criticScore = score
      rs.rolesMeta.push({ role: 'critic', assistantId: 'crew', assistantName: 'CrewAI 评审', model: 'crew:critic', status: 'done' })
      const avg = ((score.clarity + score.design + score.narrative + score.data_support + score.persuasion) / 5).toFixed(1)
      await deps.emitRunEvent(rs.scope, {
        kind: 'stage', role: 'critic', phase: 'verify',
        title: `CrewAI 评审完成 — 均分 ${avg}/10(清晰${score.clarity}/设计${score.design}/叙事${score.narrative}/数据${score.data_support}/说服${score.persuasion})${score.needs_revision ? ' · 建议修订' : ''}`,
        status: 'ok',
        detail: score.notes?.slice(0, 200) ?? null,
      })
      return { ok: true }
    },
  })

  // ---- STEP 4:persist —— 落盘 + SandboxRun/Artifact/Delivery + 卡片 + audit + 收尾消息 + job ready ----
  const persistStep = createStep({
    id: 'deliver',
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async () => {
      const { assistant, me, topic, audience, deckType, themeId, channelId, attachments, taskId } = input
      const html = rs.html
      const titleOut = rs.titleOut
      const sectionCount = rs.sectionCount
      const mainPlugin = rs.mainPlugin

      const sandboxRel = `.helio/sandboxes/ppt-ai-${randomUUID().slice(0, 8)}`
      const sandboxRoot = pathResolve(deps.heliRoot, sandboxRel)
      const workspaceAbs = pathResolve(sandboxRoot, 'workspace')
      const fsp = await import('node:fs/promises')
      await fsp.mkdir(workspaceAbs, { recursive: true })
      await fsp.writeFile(pathResolve(workspaceAbs, 'index.html'), html, 'utf8')

      const sb = await prisma.sandboxRun.create({
        data: {
          taskRunId: rs.job.id,
          generationJobId: rs.job.id,
          taskId,
          missionId: null,
          mode: 'copy',
          rootPath: sandboxRoot,
          workspacePath: workspaceAbs,
          status: 'ready_for_review',
          networkPolicy: 'allow_public_get',
          changedFiles: JSON.stringify([{ path: 'index.html', status: 'added' }]),
          diffSummary: `1 file, +${html.split('\n').length} -0 · ${assistant.name}(${sectionCount} sections)`,
          buildResult: 'pass',
          createdById: assistant.id,
        },
      })
      rs.resultSandboxRunId = sb.id
      const previewUrl = `/api/sandbox-runs/${sb.id}/preview`
      await prisma.sandboxArtifact.create({
        data: {
          sandboxRunId: sb.id,
          kind: 'web_preview',
          path: 'index.html',
          summary: `${titleOut}(${sectionCount} sections,${assistant.name} 用 ${mainPlugin?.zhName ?? 'default'} seed 出)`,
          metadataJson: JSON.stringify({
            kind: 'static_html', entry: 'index.html', previewUrl, files: ['index.html'], themeId, ai: true,
            assistantId: assistant.id, assistantName: assistant.name, modelUsed: assistant.model || 'server-default',
            seedPluginId: mainPlugin?.id || null, sectionCount,
          }),
        },
      })
      const delivery = await prisma.delivery.create({
        data: {
          missionId: null, taskId,
          title: `PPT(${assistant.name}):${titleOut}`,
          summary: `${assistant.name}(${assistant.status ?? 'AI'})接到 ${me.name} 的派工「${topic}」,直出 ${sectionCount} 页 HTML deck(plugin: ${mainPlugin?.zhName ?? 'default'};model: ${assistant.model || 'server-default'})。`,
          artifactJson: JSON.stringify({
            kind: 'interactive', previewUrl, openUrl: previewUrl, entry: 'index.html', sandboxRunId: sb.id,
            files: ['index.html'], screenshots: [], buildResult: 'pass', themeId, aiGenerated: true,
            assistantId: assistant.id, assistantName: assistant.name, modelUsed: assistant.model || 'server-default',
            seedPluginId: mainPlugin?.id || null, sectionCount,
            pptxExportUrl: `/api/sandbox-runs/${sb.id}/export-pptx`,
          }),
          testResult: 'pass', riskLevel: 'low', status: 'pending', createdById: assistant.id,
          whyJson: JSON.stringify({
            reason: 'ppt_ai_generated_html', topic, audience, deckType, themeId, sectionCount,
            assistantId: assistant.id, assistantName: assistant.name, modelUsed: assistant.model || 'server-default',
            seedPluginId: mainPlugin?.id || null, triggeredBy: me.id,
          }),
        },
      })

      if (channelId) {
        await deps.postDeliveryCard(
          { channelId, runId: sb.id, taskId: null, missionId: null },
          {
            authorId: assistant.id, taskId: '', runId: sb.id, deliveryId: delivery.id,
            title: delivery.title, summary: delivery.summary ?? '', previewUrl, entry: 'index.html',
            changedFiles: [{ path: 'index.html', status: 'added' }], diffSummary: sb.diffSummary ?? null,
            buildResult: 'pass', testResult: 'pass', verifiedByBrowser: false,
            nextSteps: [
              `打开预览看 ${sectionCount} 张 slide(← / → 翻页)`,
              `不满意?直接在频道里说,让 ${assistant.name} 改`,
              '需要 .pptx 文件?Delivery 卡里有"导出 .pptx"按钮',
            ],
          },
        ).catch((e: unknown) => console.error('[ppt-ai delivery card]', e))
      }

      await deps.writeAudit({
        type: 'template.ppt_ai_generated',
        summary: `${assistant.name}(${assistant.model || 'server-default'})用 ${mainPlugin?.zhName ?? 'default'} seed 出 ${sectionCount} 张 HTML deck「${titleOut}」`,
        actorId: assistant.id,
        payload: {
          sandboxRunId: sb.id, deliveryId: delivery.id, sectionCount, themeId, channelId, topic, audience, deckType,
          assistantId: assistant.id, assistantName: assistant.name, modelUsed: assistant.model || 'server-default',
          seedPluginId: mainPlugin?.id || null, triggeredBy: me.id, triggeredByName: me.name,
        },
      })

      if (taskId) {
        await prisma.task.update({ where: { id: taskId }, data: { status: 'review' } }).catch(() => {})
      }
      deps.broadcastWorkspace()
      if (channelId) {
        try {
          const memberIdList = await deps.memberIds(channelId)
          const doneMsg = await prisma.message.create({
            data: {
              channelId, authorId: assistant.id,
              body: `做完了。${sectionCount} 张 slide「${titleOut}」,用 ${mainPlugin?.zhName ?? 'default'} 风格 seed 出的真 HTML deck(不是模板渲染)。上方 Delivery Center 打开预览,← / → 键翻页。${attachments.length ? `附图 ${attachments.length} 张我嵌进了相关页。` : ''}\n\n_不满意?直接说"再做一版/换风格/不够精美",我会接住继续改(不用 @ 我)。_`,
            },
            include: deps.fullMessageInclude as any,
          })
          sendToUsers(memberIdList, { type: 'message', channelId, message: deps.shapeMessage(doneMsg) })
        } catch (e) {
          console.error('[ppt-ai done message]', e)
        }
      }

      const vmeta = rs.rolesMeta.find((r) => r.role === 'visual')
      if (vmeta) vmeta.status = 'done'
      if (rs.orchestrate) {
        await deps.emitRunEvent(rs.scope, { kind: 'stage', role: 'visual', phase: 'deliver', title: `${rs.visualAssignee.name} 合成完成 — ${sectionCount} 张 slide 已交付`, status: 'ok' })
      }
      await prisma.generationJob
        .update({
          where: { id: rs.job.id },
          data: { status: 'ready', resultSandboxRunId: sb.id, rolesJson: rs.rolesMeta.length ? JSON.stringify(rs.rolesMeta) : null },
        })
        .catch(() => {})
      return { ok: true }
    },
  })

  // ===== 组装 Mastra workflow:init → parallel[content,data] → compose → persist =====
  const wf = createWorkflow({ id: `deck-${input.jobId.slice(0, 8)}`, inputSchema: z.any(), outputSchema: z.any() })
    .then(initStep)
    .parallel([briefStep('content'), briefStep('data')])
    .then(composeStep)
    .then(criticStep)
    .then(persistStep)
    .commit()

  const run = await (wf as any).createRun()
  // run.watch:M1 仅作生命周期/快照锚点(角色泳道事件由 step body 直发,保证与 legacy 等价)。
  let unwatch: undefined | (() => void)
  try {
    unwatch = run.watch?.((_ev: unknown) => {
      /* M2:把 workflow-step-* 与 pi-runner tool 事件映射成更细 RunEvent */
    })
  } catch { /* watch 非必需 */ }

  let res: any
  try {
    res = await run.start({ inputData: { jobId: input.jobId } })
  } finally {
    if (typeof unwatch === 'function') unwatch()
  }

  if (res?.status !== 'success') {
    // 标记 job 失败 + 抛错(对齐 legacy runDeckJob:由 caller 的 catch 通报频道)
    const err =
      res?.error?.message ||
      res?.error ||
      (res?.steps && Object.values(res.steps).map((s: any) => s?.error?.message || s?.error).filter(Boolean).join('; ')) ||
      `deck workflow ${res?.status ?? 'unknown'}`
    await prisma.generationJob.update({ where: { id: rs.job.id }, data: { status: 'failed', error: String(err).slice(0, 500) } }).catch(() => {})
    throw new Error(String(err))
  }
}
