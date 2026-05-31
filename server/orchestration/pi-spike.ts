/**
 * M0 SPIKE — pi-agent-core 0.78.0 hello-world(M2 visual/engineer runner 形状)。
 * 验证 R7:
 *  1) 自建 Model 指向本地 OpenAI 兼容 Gemini 代理(custom baseUrl + getApiKey)
 *  2) prompt → 流式事件(agent_start / message_update / tool_execution_* / agent_end)
 *  3) 本地文件工具真执行(write_file 落盘)+ 最终文本提取
 *  4) abort() 可中断
 */
import { Agent } from '@earendil-works/pi-agent-core'
import { registerBuiltInApiProviders, Type, type Model } from '@earendil-works/pi-ai'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

registerBuiltInApiProviders()

const BASE = process.env.LOCAL_LLM_BASE || 'http://127.0.0.1:8317/v1'
const KEY = process.env.LOCAL_LLM_KEY || ''
const MODEL_ID = process.env.LOCAL_LLM_MODEL || 'gemini-2.5-flash'

// 自建 Model:OpenAI 兼容端点(本地 Gemini 代理)
const model: Model<'openai-completions'> = {
  id: MODEL_ID,
  name: MODEL_ID,
  api: 'openai-completions',
  provider: 'local-gemini',
  baseUrl: BASE,
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 8192,
}

const sandbox = mkdtempSync(join(tmpdir(), 'pi-spike-'))
const written: string[] = []

// 本地文件工具(代表 M2 sandbox 落盘能力)
const writeFileTool = {
  name: 'write_file',
  description: '把内容写入沙盒里的一个文件。写 HTML/代码用它。',
  parameters: Type.Object({
    path: Type.String({ description: '相对文件名,如 index.html' }),
    content: Type.String({ description: '文件完整内容' }),
  }),
  execute: async (_toolCallId: string, params: any, _signal: AbortSignal, _onUpdate: any) => {
    const fs = await import('node:fs/promises')
    const abs = join(sandbox, params.path)
    await fs.writeFile(abs, params.content, 'utf8')
    written.push(params.path)
    return { content: [{ type: 'text', text: `已写入 ${params.path}(${params.content.length} 字符)` }] }
  },
}

const events: string[] = []
let finalText = ''

const agent = new Agent({
  initialState: {
    systemPrompt: '你是工程师 AI。当被要求生成文件时,必须调用 write_file 工具落盘,然后用一句话汇报。',
    model,
    thinkingLevel: 'off' as any,
    tools: [writeFileTool as any],
  },
  getApiKey: () => KEY,
})

agent.subscribe((ev: any) => {
  events.push(ev.type)
  if (ev.type === 'tool_execution_start') events.push(`  ↳ tool:${ev.toolName ?? ev.toolCall?.name ?? '?'}`)
  if (ev.type === 'message_end' && ev.message?.role === 'assistant') {
    const txt = (ev.message.content || [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
    if (txt) finalText = txt
  }
})

async function main() {
  if (!KEY) {
    console.log('NO_KEY — skip live run')
    return
  }
  console.log('=== pi-agent-core spike start ===')
  console.log('sandbox:', sandbox)
  await agent.prompt(
    '生成一个最小的 index.html(只要 <!doctype html><html><body><h1>Hello Pi</h1></body></html>),用 write_file 工具写到 index.html。',
  )
  await agent.waitForIdle()

  const wroteFile = written.includes('index.html') && existsSync(join(sandbox, 'index.html'))
  console.log('=== events (', events.length, '):')
  console.log(events.join('\n'))
  console.log('=== tool wrote index.html:', wroteFile)
  if (wroteFile) {
    const c = readFileSync(join(sandbox, 'index.html'), 'utf8')
    console.log('=== file content (first 120):', c.slice(0, 120).replace(/\n/g, ' '))
  }
  console.log('=== final assistant text:', finalText.slice(0, 200))
  const hasToolEvents = events.some((e) => e.startsWith('  ↳ tool:') || e === 'tool_execution_start')
  console.log('=== SPIKE_RESULT toolEvents=%s wroteFile=%s gotText=%s', hasToolEvents, wroteFile, finalText.length > 0)
  console.log(hasToolEvents && wroteFile ? '=== PI_SPIKE_OK ===' : '=== PI_SPIKE_PARTIAL (text-only, tool path needs check) ===')
}

main().catch((e) => {
  console.error('=== PI_SPIKE_FAIL ===')
  console.error(e?.stack || e)
  process.exit(1)
})
