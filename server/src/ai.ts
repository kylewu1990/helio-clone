// 助手回复生成 —— 支持多家「OpenAI 兼容」供应商(OpenAI / DeepSeek / Kimi /
// 智谱 / 通义 / 本地 Ollama 等,它们都暴露 /chat/completions)。
//
// 供应商来源(优先级):
//   1) server/providers.json —— 多供应商,密钥放文件里(不进数据库)
//   2) 否则用 .env 的单一默认供应商(LLM_* 或 OPENAI_* 兜底)
// 文件每次调用时热读,改配置无需重启。

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toolsFor, runTool, GLOBAL_SKILL_IDS, type SkillCtx } from './skills.js'

// 单次回复内「工具调用 → 再请求模型」的最大往返轮数(防工具死循环)。
// 按场景分级:聊天够用即可,任务/代码需要更高预算(读文件→写文件→build→修报错很容易超 5 轮)。
// 支持 env 覆盖:MAX_TOOL_ROUNDS_CHAT / _TASK / _CODE。
export type ToolScenario = 'chat' | 'task' | 'code'
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}
const TOOL_ROUNDS: Record<ToolScenario, number> = {
  chat: envInt('MAX_TOOL_ROUNDS_CHAT', 5),
  task: envInt('MAX_TOOL_ROUNDS_TASK', 25),
  code: envInt('MAX_TOOL_ROUNDS_CODE', 40),
}
export function toolRoundsFor(scenario: ToolScenario): number {
  return TOOL_ROUNDS[scenario]
}
// 聊天默认轮数(对话路径不传 maxToolRounds 时沿用)
const MAX_TOOL_ROUNDS = TOOL_ROUNDS.chat

export type ChatMsg = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type Provider = {
  id: string
  label: string
  baseURL: string
  apiKey: string
  models: string[]
}

type ProviderConfig = { default: string; providers: Provider[] }

const PROVIDERS_PATH = resolve(process.cwd(), 'providers.json')

function envDefaultProvider(): Provider {
  return {
    id: 'default',
    label: '默认(.env)',
    baseURL: (
      process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1'
    ).replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    models: [process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'],
  }
}

function loadConfig(): ProviderConfig {
  try {
    const raw = readFileSync(PROVIDERS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>
    const providers = (parsed.providers ?? []).filter((p) => p && p.id)
    if (providers.length) {
      for (const p of providers) p.baseURL = (p.baseURL || '').replace(/\/$/, '')
      return { default: parsed.default || providers[0].id, providers }
    }
  } catch {
    /* 无 providers.json 或解析失败 → 用 .env */
  }
  const d = envDefaultProvider()
  return { default: d.id, providers: [d] }
}

function resolveProvider(id?: string | null): Provider {
  const cfg = loadConfig()
  return (
    cfg.providers.find((p) => p.id === id) ??
    cfg.providers.find((p) => p.id === cfg.default) ??
    cfg.providers[0]
  )
}

function usable(p: Provider): boolean {
  // 本地端点(ollama / lmstudio)通常不需要 key
  if (/localhost|127\.0\.0\.1/.test(p.baseURL)) return true
  return !!p.apiKey
}

// 给前端的供应商清单(不含密钥)
export function publicProviders() {
  const cfg = loadConfig()
  return {
    default: cfg.default,
    providers: cfg.providers.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      models: p.models ?? [],
      configured: usable(p),
    })),
  }
}

function isLocal(url: string) {
  return /localhost|127\.0\.0\.1/.test(url)
}

export async function generateReply(opts: {
  provider?: string | null
  baseUrl?: string | null // 助手自带,优先于 provider 配置
  apiKey?: string | null // 助手自带
  systemPrompt?: string | null
  model?: string | null
  skills?: string[] | null // 启用的技能(工具)id
  ctx?: SkillCtx // 工具执行上下文
  messages: ChatMsg[]
  maxToolRounds?: number // 工具往返轮数预算(默认聊天 5;任务/代码场景由调用方传更高值)
  onDelta?: (chunk: string) => void // 提供则尝试流式(无工具时)
  onStatus?: (status: string) => void // 工作状态回调(如「正在调用工具…」)
  // Live Run 透明化:每次工具调用「开始 / 结果」回调(带计时),供任务执行运行时广播结构化 run event。
  // callId 配对 start 与 result(用模型给的 tool_call_id),前端据此精确折叠,不再按 tool 名误配。
  onToolStart?: (e: { name: string; args: unknown; callId: string }) => void
  onToolResult?: (e: { name: string; args: unknown; result: string; ms: number; ok: boolean; callId: string }) => void
  signal?: AbortSignal // 提供则可中断(停止生成硬刹车)
}): Promise<{ text: string; toolsUsed: string[]; eventId?: string; hitToolLimit?: boolean }> {
  // 助手自带 baseUrl(+key,本地端点可免 key)优先;否则走服务器供应商配置
  const direct = !!opts.baseUrl && (!!opts.apiKey || isLocal(opts.baseUrl))

  let baseURL: string
  let apiKey: string
  let model: string

  const usedTools = new Set<string>()
  // generate_image 生成的图(短 markdown)。模型常不把工具返回内容原样贴出 → done 时后端兜底补到回复末尾
  const pendingImages: string[] = []
  const done = (text: string, hitToolLimit = false) => {
    let body = text
    for (const md of pendingImages) {
      const u = md.match(/\]\(([^)]+)\)/)?.[1]
      if (u && !body.includes(u)) body += (body ? '\n\n' : '') + md
    }
    return {
      text: body,
      toolsUsed: [...usedTools],
      eventId: opts.ctx?.createdEventId, // create_event 建了事件 → 让回复消息挂成日历卡片
      hitToolLimit,
    }
  }

  if (direct) {
    baseURL = opts.baseUrl!.replace(/\/$/, '')
    apiKey = opts.apiKey || ''
    model = opts.model || 'gpt-4o-mini'
  } else {
    const p = resolveProvider(opts.provider)
    if (!usable(p)) {
      return done(
        `(供应商「${p.label}」未配置密钥 —— 在助手设置里填 API Key,或在 server/providers.json / .env 配置后即可真正回复。)`,
      )
    }
    baseURL = p.baseURL
    apiKey = p.apiKey
    model = opts.model || p.models[0] || 'gpt-4o-mini'
  }

  // 只读文件工具(list_dir/read_file)对所有助手默认开放,叠加助手自选技能并去重
  const tools = toolsFor([...new Set([...GLOBAL_SKILL_IDS, ...(opts.skills ?? [])])])
  let sys = opts.systemPrompt || ''
  // 通用输出规范:回复详略自适应(简单问题简短答、复杂或被明确要求时才展开),统一注入所有对话助手
  sys +=
    (sys ? '\n\n' : '') +
    '【回复风格·默认简短】像同事在 IM 里对话,默认用最少的话说清楚,别写成文档:简单、事实、确认或闲聊类问题用 1-3 句话口语直答,不用 Markdown 标题、不堆分点列表、不写前言和总结;只有当用户明确要"详细/展开/步骤/方案",或问题确实复杂需要拆解时,才写长回复、才用列表;宁可先给短结论让用户追问,也别默认长篇大论。'
  // 带画图技能的助手:强引导模型真正调用工具,而不是只用文字描述图片(否则不出图)
  if (opts.skills?.includes('generate_image')) {
    sys +=
      (sys ? '\n\n' : '') +
      '【画图规则】当用户要求生成图片/画图/出图/做示意图/换风格时,你必须调用 generate_image 工具实际生成,绝不能只用文字描述图片来代替。'
  }
  const convo: any[] = sys
    ? [{ role: 'system', content: sys }, ...opts.messages]
    : [...opts.messages]
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }

  // 统一走流式:无工具→直接流式;有工具→流式累积 tool_calls,执行后继续,最终回答同样逐字流式
  const onDelta = opts.onDelta ?? (() => {})

  const budget = Math.max(1, opts.maxToolRounds ?? MAX_TOOL_ROUNDS)
  const remindAt = Math.max(1, Math.floor(budget * 0.8)) // 达到 80% 预算时注入收敛提醒
  let reminded = false
  // 只执行真正提供给本助手的工具:模型有时会臆造未开放的工具名(如未授技能的 run_command),
  // 必须按提供清单拦截,避免越权执行(如只给浏览器技能的助手却跑 shell)。
  const allowedFns = new Set((tools ?? []).map((t) => t.function?.name).filter(Boolean) as string[])
  try {
    for (let round = 0; round < budget; round++) {
      // 接近预算上限:提醒模型收敛(总结已完成、停止探索、尽快产出结果),只注入一次。
      if (!reminded && round >= remindAt) {
        reminded = true
        convo.push({
          role: 'system',
          content:
            `【收敛提醒】你已使用约 ${round}/${budget} 轮工具调用,接近本次预算上限。` +
            '请停止进一步探索:总结已完成的工作,只做收尾必需的工具调用,并尽快给出最终结论/报告。' +
            '若任务尚未完全做完,请明确写出已完成部分、当前状态与下一步建议(系统会保留沙盒并允许「继续执行」)。',
        })
      }
      const { content, toolCalls, error } = await streamChat(
        baseURL,
        headers,
        model,
        convo,
        onDelta,
        opts.signal,
        tools,
      )
      if (error) return done(error)

      if (tools && toolCalls.length) {
        opts.onStatus?.('正在调用工具…')
        convo.push({ role: 'assistant', content: content || '', tool_calls: toolCalls })
        for (const tc of toolCalls) {
          let args: any = {}
          try {
            args = JSON.parse(tc.function?.arguments || '{}')
          } catch {
            /* 解析失败按空参数处理 */
          }
          const fnName = tc.function?.name
          // 拦截未开放的工具:不执行,如实告知模型只能用已提供的工具
          if (fnName && !allowedFns.has(fnName)) {
            convo.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: `工具 ${fnName} 未对本助手开放。请只使用已提供给你的工具:${[...allowedFns].join(', ') || '(无)'}。`,
            })
            continue
          }
          if (fnName) usedTools.add(fnName)
          // 配对 id:优先用模型返回的 tool_call_id,缺失则按轮次/序号兜底生成
          const callId = tc.id || `call_${round}_${usedTools.size}_${Date.now()}`
          opts.onToolStart?.({ name: fnName ?? 'tool', args, callId })
          const toolStart = Date.now()
          let result: string
          try {
            result = await runTool(fnName, args, opts.ctx ?? {})
            opts.onToolResult?.({
              name: fnName ?? 'tool',
              args,
              result,
              ms: Date.now() - toolStart,
              ok: !/^(拒绝|执行出错|失败|错误)/.test(result.trim()),
              callId,
            })
          } catch (toolErr) {
            result = `工具执行出错:${(toolErr as Error).message}`
            opts.onToolResult?.({ name: fnName ?? 'tool', args, result, ms: Date.now() - toolStart, ok: false, callId })
          }
          if (tc.function?.name === 'generate_image' && result.startsWith('!['))
            pendingImages.push(result)
          convo.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }

      return done(content?.trim() || '(模型没有返回内容)')
    }
    // 触顶:最后再请求模型一次(此时不再给工具),让它基于已有工具结果产出收尾报告,而不是只回一句「停止」。
    let wrapUp = ''
    try {
      convo.push({
        role: 'system',
        content:
          '【已达工具调用上限】不要再调用任何工具。请基于已经获得的结果,直接用文字给出本次的最终报告:' +
          '做了什么、当前结果/状态、还差什么、建议的下一步。',
      })
      const final = await streamChat(baseURL, headers, model, convo, onDelta, opts.signal)
      wrapUp = final.content?.trim() || ''
    } catch {
      /* 收尾请求失败则给出兜底说明 */
    }
    return done(
      wrapUp ||
        '(已达本次工具调用轮数上限,已暂停。已完成的步骤见上方工具调用与沙盒记录;可点「继续执行」在同一沙盒接着做。)',
      true,
    )
  } catch (e) {
    if ((e as Error).name === 'AbortError') return done('(已停止生成)')
    return done(`(请求模型出错:${(e as Error).message})`)
  }
}

// 流式读取 SSE,逐块回调 content,同时累积 tool_calls(支持 stream+tools)。返回最终 content 与 tool_calls。
async function streamChat(
  baseURL: string,
  headers: Record<string, string>,
  model: string,
  convo: any[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  tools?: any[],
): Promise<{ content: string; toolCalls: any[]; error?: string }> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: convo,
      temperature: 0.7,
      stream: true,
      ...(tools ? { tools } : {}),
    }),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    return {
      content: '',
      toolCalls: [],
      error: `(模型调用失败 ${res.status}:${detail.slice(0, 300)})`,
    }
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  const toolAcc: any[] = [] // 按 index 累积流式 tool_calls 分片
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const j = JSON.parse(payload)
          const delta = j.choices?.[0]?.delta
          if (delta?.content) {
            full += delta.content
            onDelta(delta.content)
          }
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0
              if (!toolAcc[i])
                toolAcc[i] = { id: '', type: 'function', function: { name: '', arguments: '' } }
              if (tc.id) toolAcc[i].id = tc.id
              if (tc.function?.name) toolAcc[i].function.name = tc.function.name
              if (tc.function?.arguments) toolAcc[i].function.arguments += tc.function.arguments
            }
          }
        } catch {
          /* 跳过非 JSON 行 */
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError')
      return { content: (full + ' …(已停止)').trim(), toolCalls: [] }
    throw e
  }
  return { content: full, toolCalls: toolAcc.filter(Boolean) }
}

// ---- 频道主动响应:路由 ----
// 给一条群聊新消息 + 频道内候选助手的职责,让模型挑出「该主动回应」的助手。
// 返回选中的候选下标(0-based)。无可用供应商 / 调用失败 / 模型判断都不相关 → 返回空(降级为不主动回)。

type CallerHint = {
  provider?: string | null
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
}

// 把一份「供应商线索」解析成可直接调用的端点;不可用返回 null
function resolveCaller(
  hint: CallerHint,
): { baseURL: string; apiKey: string; model: string } | null {
  const direct = !!hint.baseUrl && (!!hint.apiKey || isLocal(hint.baseUrl))
  if (direct) {
    return {
      baseURL: hint.baseUrl!.replace(/\/$/, ''),
      apiKey: hint.apiKey || '',
      model: hint.model || 'gpt-4o-mini',
    }
  }
  const p = resolveProvider(hint.provider)
  if (!usable(p)) return null
  return {
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    model: hint.model || p.models[0] || 'gpt-4o-mini',
  }
}

// 从模型回复里抠出 {"pick":[...]},映射成 0-based 下标(去重、越界丢弃、截断 max)
function parsePicks(content: string, n: number, max: number): number[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (!m) return []
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  const arr = (parsed as { pick?: unknown })?.pick
  if (!Array.isArray(arr)) return []
  const out: number[] = []
  for (const x of arr) {
    const idx = Number(x) - 1 // 模型用 1-based 序号
    if (Number.isInteger(idx) && idx >= 0 && idx < n && !out.includes(idx))
      out.push(idx)
    if (out.length >= max) break
  }
  return out
}

// 这份「供应商线索」能否真正发起调用(有可用 key 或本地端点);用于主动路由前过滤
export function canGenerate(hint: CallerHint): boolean {
  return resolveCaller(hint) !== null
}

// ---- Mission 拆解:把目标拆成可执行子任务(真实 LLM)----
// 借一个可用端点(服务器默认供应商,否则候选助手自带 key/本地端点),
// 让模型输出 JSON 子任务清单。解析失败 → 返回空数组(调用方据此提示用户)。
export type BreakdownSubtask = {
  title: string
  expectedOutput?: string
  role?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
}

const VALID_PRIORITY = new Set(['urgent', 'high', 'medium', 'low'])

export async function breakdownGoal(opts: {
  goal: string
  team?: { name: string; role: string }[] // 可选:已有团队角色,辅助模型贴合现有人选
  callers?: CallerHint[] // 候选端点(通常传入助手们的供应商配置作为兜底)
  max?: number
}): Promise<{ subtasks: BreakdownSubtask[]; error?: string }> {
  const max = Math.min(Math.max(opts.max ?? 6, 2), 8)
  // 选一个可用端点:优先服务器默认,否则借候选助手的 key/本地端点
  let caller = resolveCaller({})
  if (!caller && opts.callers) {
    for (const c of opts.callers) {
      caller = resolveCaller(c)
      if (caller) break
    }
  }
  if (!caller)
    return { subtasks: [], error: '没有可用的 AI 端点(请给至少一个助手配置可用的 API Key 或本地端点)' }

  const teamLine = opts.team?.length
    ? '可用团队角色(供参考,role 字段请尽量贴合):\n' +
      opts.team.map((t) => `- ${t.name}(${t.role})`).join('\n')
    : ''
  const sys =
    '你是 AI 团队的项目协调官,负责把一个目标拆成可并行执行的子任务。只输出 JSON,不要任何多余文字、不要 markdown 代码块。'
  const user = [
    `目标:"""${opts.goal.slice(0, 2000)}"""`,
    '',
    `把它拆成 ${Math.min(max, 5)}–${max} 个具体、可执行、相互尽量独立的子任务。`,
    '每个子任务包含:',
    '- title:一句话任务标题(动宾结构,具体可交付)',
    '- expectedOutput:预计交付物(如「一份对比报告」「可运行的组件」)',
    '- role:适合的角色(如 研究/设计/开发/测试/文案/运营/产品)',
    '- priority:urgent | high | medium | low',
    teamLine,
    '',
    '只输出 JSON,格式:{"subtasks":[{"title":"...","expectedOutput":"...","role":"...","priority":"high"}, ...]}',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const res = await fetch(`${caller.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller.apiKey ? { Authorization: `Bearer ${caller.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: caller.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.3,
        max_tokens: 900,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { subtasks: [], error: `模型调用失败 ${res.status}:${detail.slice(0, 200)}` }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    return { subtasks: parseSubtasks(content, max) }
  } catch (e) {
    return { subtasks: [], error: `拆解请求出错:${(e as Error).message}` }
  }
}

function parseSubtasks(content: string, max: number): BreakdownSubtask[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (!m) return []
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  const arr = (parsed as { subtasks?: unknown })?.subtasks
  if (!Array.isArray(arr)) return []
  const out: BreakdownSubtask[] = []
  for (const x of arr) {
    const o = x as Record<string, unknown>
    const title = typeof o?.title === 'string' ? o.title.trim() : ''
    if (!title) continue
    const priority =
      typeof o?.priority === 'string' && VALID_PRIORITY.has(o.priority.toLowerCase())
        ? (o.priority.toLowerCase() as BreakdownSubtask['priority'])
        : 'medium'
    out.push({
      title: title.slice(0, 200),
      expectedOutput:
        typeof o?.expectedOutput === 'string' ? o.expectedOutput.trim().slice(0, 200) : undefined,
      role: typeof o?.role === 'string' ? o.role.trim().slice(0, 40) : undefined,
      priority,
    })
    if (out.length >= max) break
  }
  return out
}

// ---- Mission 工作流预览:目标 → 结构化工作流(真实 LLM,不落库)----
// 给 Mission Composer 用:展示「目标 / 推荐团队 / 步骤(工具+确认点+交付物)/ 预期交付物 / 风险」。
// 用户确认后,可把 steps 直接落库为子任务(预览即执行,不二次调模型)。
export type WorkflowStep = {
  title: string
  detail?: string
  tool?: string // 主要用到的能力(如 读取文件 / 写文件 / 运行命令 / 联网检索)
  role?: string // 由哪个角色负责
  needsApproval?: boolean // 是否需要人工确认
  deliverable?: string // 该步的产物
  priority?: 'urgent' | 'high' | 'medium' | 'low'
}
export type WorkflowPlan = {
  goal: string
  summary?: string
  team: { role: string; why?: string }[]
  steps: WorkflowStep[]
  deliverables: string[]
  confirmations: string[] // 需要人工确认的点
  risks: string[]
}

export async function planWorkflow(opts: {
  goal: string
  team?: { name: string; role: string }[]
  callers?: CallerHint[]
}): Promise<{ plan: WorkflowPlan | null; error?: string }> {
  let caller = resolveCaller({})
  if (!caller && opts.callers) {
    for (const c of opts.callers) {
      caller = resolveCaller(c)
      if (caller) break
    }
  }
  if (!caller)
    return { plan: null, error: '没有可用的 AI 端点(请给至少一个助手配置可用的 API Key 或本地端点)' }

  const teamLine = opts.team?.length
    ? '现有 AI 团队(team.role 请尽量从中选取):\n' +
      opts.team.map((t) => `- ${t.name}(${t.role})`).join('\n')
    : ''
  const sys =
    '你是 AI 团队的总指挥,负责把一个目标变成清晰的执行工作流。只输出 JSON,不要任何多余文字、不要 markdown 代码块。所有文案用简体中文。'
  const user = [
    `目标:"""${opts.goal.slice(0, 2000)}"""`,
    '',
    '产出一个可执行工作流,字段:',
    '- summary:一句话说明你会怎么完成(给人看)',
    '- team:推荐参与的角色数组 [{"role":"角色名","why":"为什么需要"}](2–4 个)',
    '- steps:执行步骤数组(4–7 步),每步 {"title":"动宾短语","detail":"一句话说明","tool":"主要用到的能力(读取上下文/写入文件/运行验证/联网检索/生成交付 之一或类似)","role":"负责角色","needsApproval":true/false,"deliverable":"该步产物","priority":"high|medium|low"}',
    '- deliverables:最终交付物数组(字符串)',
    '- confirmations:需要人工确认/拍板的点(字符串数组)',
    '- risks:潜在风险或不确定项(字符串数组,可为空)',
    teamLine,
    '',
    '只输出 JSON:{"summary":"...","team":[...],"steps":[...],"deliverables":[...],"confirmations":[...],"risks":[...]}',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 40000)
    const res = await fetch(`${caller.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller.apiKey ? { Authorization: `Bearer ${caller.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: caller.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { plan: null, error: `模型调用失败 ${res.status}:${detail.slice(0, 200)}` }
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content ?? ''
    const plan = parseWorkflow(content, opts.goal)
    if (!plan) return { plan: null, error: '模型未能产出有效工作流,请重试' }
    return { plan }
  } catch (e) {
    return { plan: null, error: `工作流生成出错:${(e as Error).message}` }
  }
}

function parseWorkflow(content: string, goal: string): WorkflowPlan | null {
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    const m = content.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        parsed = JSON.parse(m[0]) as Record<string, unknown>
      } catch {
        return null
      }
    }
  }
  if (!parsed) return null
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim().slice(0, 240)) : []
  const team = Array.isArray(parsed.team)
    ? (parsed.team as Record<string, unknown>[])
        .map((t) => ({
          role: typeof t?.role === 'string' ? t.role.trim().slice(0, 40) : '',
          why: typeof t?.why === 'string' ? t.why.trim().slice(0, 160) : undefined,
        }))
        .filter((t) => t.role)
        .slice(0, 6)
    : []
  const steps = Array.isArray(parsed.steps)
    ? (parsed.steps as Record<string, unknown>[])
        .map((s) => {
          const title = typeof s?.title === 'string' ? s.title.trim() : ''
          if (!title) return null
          const priority =
            typeof s?.priority === 'string' && VALID_PRIORITY.has((s.priority as string).toLowerCase())
              ? ((s.priority as string).toLowerCase() as WorkflowStep['priority'])
              : 'medium'
          return {
            title: title.slice(0, 200),
            detail: typeof s?.detail === 'string' ? s.detail.trim().slice(0, 240) : undefined,
            tool: typeof s?.tool === 'string' ? s.tool.trim().slice(0, 60) : undefined,
            role: typeof s?.role === 'string' ? s.role.trim().slice(0, 40) : undefined,
            needsApproval: !!s?.needsApproval,
            deliverable: typeof s?.deliverable === 'string' ? s.deliverable.trim().slice(0, 160) : undefined,
            priority,
          } as WorkflowStep
        })
        .filter((s): s is WorkflowStep => !!s)
        .slice(0, 9)
    : []
  if (!steps.length) return null
  return {
    goal,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 400) : undefined,
    team,
    steps,
    deliverables: strArr(parsed.deliverables),
    confirmations: strArr(parsed.confirmations),
    risks: strArr(parsed.risks),
  }
}

export async function pickResponders(opts: {
  text: string
  authorName: string
  candidates: (CallerHint & { name: string; persona: string })[]
  max: number
}): Promise<number[]> {
  if (!opts.candidates.length) return []

  // 选一个可用端点:优先服务器默认供应商,否则借候选助手自带的 key
  let caller = resolveCaller({})
  if (!caller) {
    for (const c of opts.candidates) {
      caller = resolveCaller(c)
      if (caller) break
    }
  }
  if (!caller) return [] // 没有任何可用 key → 不主动回(等于旧行为)

  const list = opts.candidates
    .map((c, i) => `${i + 1}. ${c.name} — ${c.persona || '(无职责描述)'}`)
    .join('\n')
  const sys =
    '你是群聊调度器,负责判断哪些 AI 助手该主动回应一条新消息。只输出 JSON,不要任何多余文字。'
  const user = [
    '下面是群聊里的一条新消息,以及频道内若干 AI 助手的职责。',
    '判断哪些助手「适合主动出来回应」这条消息(就像群里相关领域的人会自然搭话)。',
    '规则:',
    '- 只选与消息真正相关、能给出有用回应的助手。',
    '- 宁缺毋滥:打招呼、闲聊、或与所有助手都无关时,返回空数组。',
    `- 最多选 ${opts.max} 个,按相关度从高到低排列。`,
    '',
    `消息(来自 ${opts.authorName}):`,
    `"""${opts.text.slice(0, 1000)}"""`,
    '',
    '助手:',
    list,
    '',
    '只输出 JSON,格式 {"pick":[序号,...]}(序号为上面列表编号,从 1 开始;无合适助手则 {"pick":[]})。',
  ].join('\n')

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch(`${caller.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(caller.apiKey ? { Authorization: `Bearer ${caller.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: caller.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: 80,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    if (!res.ok) return []
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return parsePicks(data.choices?.[0]?.message?.content ?? '', opts.candidates.length, opts.max)
  } catch {
    return []
  }
}
