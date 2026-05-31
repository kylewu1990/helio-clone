// Phase U / M2:visual 角色的 pi-agent-core 执行器。
//
// 微调铁律(用户独立复核要求):
//  1) pi **只在 scratch 临时目录**用 write_file 跑(发挥它的文件能力)→ 返回读回的内容。
//     **不写正式 sandbox workspace** —— persist 仍是落盘唯一真相源(产物与 M1 等价)。
//  2) 读回的内容由 caller 走 sanitizeDeckHtml(与 M1 同源清洗+校验)。
//  3) 预算:tool-round 上限 + timeout(对齐 M1 withTimeout 120s)。失败由 caller 同一次运行内回退 inline。
//  abort:caller(Mastra step)的 abortSignal → agent.abort();真中断时 throw AbortError(caller 不降级)。
//
// 叶子模块:只 import pi 包 + node;不 import index.ts / deckWorkflow.ts。

import { Agent } from '@earendil-works/pi-agent-core'
import { registerBuiltInApiProviders, Type, type Model } from '@earendil-works/pi-ai'
import { resolve as pathResolve } from 'node:path'

let _registered = false
function ensureRegistered() {
  if (!_registered) {
    registerBuiltInApiProviders()
    _registered = true
  }
}

export class PiAbortError extends Error {
  constructor(msg = 'pi visual aborted') {
    super(msg)
    this.name = 'PiAbortError'
  }
}

export type PiVisualEvent = {
  kind: 'tool_start' | 'tool_result' | 'file'
  tool?: string
  callId?: string | null
  title: string
  detail?: string | null
  status?: string | null
}

export interface PiVisualOpts {
  systemPrompt: string
  userMessage: string
  llm: { baseUrl: string | null; apiKey: string | null; model: string | null }
  scratchDir: string
  outFile?: string
  abortSignal?: AbortSignal
  onEvent?: (ev: PiVisualEvent) => void
  timeoutMs?: number
  maxToolRounds?: number
}

export interface PiVisualResult { rawText: string; wroteFile: boolean; toolRounds: number }

// 跑一个 pi Agent:把完整 HTML 用 write_file 写进 scratchDir/outFile,返回读回内容。
// 非 abort 失败 → throw(caller 降级 inline);真 abort → throw PiAbortError(caller 不降级,透传中断)。
export async function runPiVisual(opts: PiVisualOpts): Promise<PiVisualResult> {
  ensureRegistered()
  const fsp = await import('node:fs/promises')
  await fsp.mkdir(opts.scratchDir, { recursive: true })
  const outFile = opts.outFile || 'index.html'
  const timeoutMs = opts.timeoutMs ?? 120000
  const maxRounds = opts.maxToolRounds ?? 6

  const model: Model<'openai-completions'> = {
    id: opts.llm.model || 'gemini-2.5-flash',
    name: opts.llm.model || 'gemini-2.5-flash',
    api: 'openai-completions',
    provider: 'deck-visual',
    baseUrl: opts.llm.baseUrl || 'http://127.0.0.1:8317/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 32768,
  }

  let lastWritten = ''
  let wroteFile = false
  let toolRounds = 0
  let roundCapHit = false

  const writeFileTool = {
    name: 'write_file',
    description: '把完整文件内容写入工作目录文件(写 HTML deck 用它,一次写完整文件)。',
    parameters: Type.Object({
      path: Type.String({ description: '相对文件名,如 index.html' }),
      content: Type.String({ description: '文件完整内容(完整 HTML,以 <!doctype html> 开头)' }),
    }),
    execute: async (_id: string, params: any) => {
      const rel = String(params.path || outFile)
      const abs = pathResolve(opts.scratchDir, rel)
      const content = String(params.content ?? '')
      await fsp.writeFile(abs, content, 'utf8')
      lastWritten = content
      wroteFile = true
      opts.onEvent?.({ kind: 'file', tool: 'write_file', title: `visual 写入 ${rel}(${content.length} 字符)`, detail: rel, status: 'ok' })
      return { content: [{ type: 'text', text: `已写入 ${rel}(${content.length} 字符)` }] }
    },
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: opts.systemPrompt,
      model,
      thinkingLevel: 'off' as any,
      tools: [writeFileTool as any],
    },
    getApiKey: () => opts.llm.apiKey || '',
  })

  agent.subscribe((ev: any) => {
    if (ev.type === 'tool_execution_start') {
      toolRounds++
      const tool = ev.toolName ?? ev.toolCall?.name ?? 'write_file'
      opts.onEvent?.({ kind: 'tool_start', tool, callId: ev.toolCallId ?? null, title: `visual 调用工具 ${tool}`, status: 'running' })
      if (toolRounds > maxRounds) {
        roundCapHit = true
        agent.abort()
      }
    } else if (ev.type === 'tool_execution_end') {
      const tool = ev.toolName ?? ev.toolCall?.name ?? 'write_file'
      opts.onEvent?.({ kind: 'tool_result', tool, callId: ev.toolCallId ?? null, title: `工具 ${tool} 完成`, status: 'ok' })
    }
  })

  // abort 透传:caller signal → agent.abort()
  let externalAbort = false
  const onAbort = () => { externalAbort = true; agent.abort() }
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) { externalAbort = true; agent.abort() }
    else opts.abortSignal.addEventListener('abort', onAbort, { once: true })
  }

  // timeout 预算
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; agent.abort(); reject(new Error(`pi visual 超时(${timeoutMs}ms)`)) }, timeoutMs)
  })

  try {
    await Promise.race([
      (async () => { await agent.prompt(opts.userMessage); await agent.waitForIdle() })(),
      timeoutP,
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onAbort)
  }

  // 真中断(外部 abort)→ 透传,caller 不降级
  if (externalAbort || opts.abortSignal?.aborted) throw new PiAbortError()
  if (roundCapHit) throw new Error(`pi visual 超过工具轮数上限(${maxRounds})`)
  if (timedOut) throw new Error(`pi visual 超时(${timeoutMs}ms)`)

  // 读回 scratch 文件(优先);否则退回 agent 最终文本
  let rawText = ''
  if (wroteFile) {
    try { rawText = await fsp.readFile(pathResolve(opts.scratchDir, outFile), 'utf8') } catch { rawText = lastWritten }
  }
  if (!rawText) {
    const msgs = ((agent.state as any)?.messages ?? []) as any[]
    const lastAsst = [...msgs].reverse().find((m) => m?.role === 'assistant')
    rawText = ((lastAsst?.content || []) as any[]).filter((c) => c?.type === 'text').map((c) => c.text).join('')
  }
  if (!rawText) throw new Error('pi visual 未产出任何内容(无文件、无文本)')

  return { rawText, wroteFile, toolRounds }
}
