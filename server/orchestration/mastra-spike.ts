/**
 * M0 SPIKE — Mastra @mastra/core 1.37.1 hello-world.
 * 验证 R7:createWorkflow/createStep/.then/.parallel/.branch/.commit + createRun/start/watch,
 * 以及"在 step 里调真实 LLM(本地 Gemini 代理)"这条 M1 要走的路。
 * 运行:LOCAL_LLM_KEY=sk-... pnpm -C server exec tsx ../orchestration/mastra-spike.ts
 * (不进 tsc build,纯 tsx 跑)
 */
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const BASE = process.env.LOCAL_LLM_BASE || 'http://127.0.0.1:8317/v1'
const KEY = process.env.LOCAL_LLM_KEY || ''
const MODEL = process.env.LOCAL_LLM_MODEL || 'gemini-2.5-flash'

// 真实 LLM 调用(OpenAI 兼容),代表 M1 里 step.execute 调 generateReply 的位置
async function chat(prompt: string): Promise<string> {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 60 }),
  })
  const j: any = await r.json()
  return j?.choices?.[0]?.message?.content ?? `ERR:${JSON.stringify(j).slice(0, 120)}`
}

const events: string[] = []

// STEP 1:plan —— 打印 execute 上下文 keys(发现真实形状),返回结构化
const planStep = createStep({
  id: 'plan',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ topic: z.string(), roles: z.array(z.string()) }),
  execute: async (ctx: any) => {
    console.log('[execute ctx keys @plan]', Object.keys(ctx))
    const { inputData } = ctx
    return { topic: inputData.topic, roles: ['content', 'visual'] }
  },
})

// STEP 2:compose —— 在 step 里调真实 Gemini
const composeStep = createStep({
  id: 'compose',
  inputSchema: z.object({ topic: z.string(), roles: z.array(z.string()) }),
  outputSchema: z.object({ topic: z.string(), llm: z.string() }),
  execute: async ({ inputData }: any) => {
    const llm = KEY
      ? await chat(`一句话(<=15字)概括 deck 主题「${inputData.topic}」的开场标题。只回标题。`)
      : 'NO_KEY(skipped real LLM)'
    return { topic: inputData.topic, llm }
  },
})

const wf = createWorkflow({
  id: 'deck-spike',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ topic: z.string(), llm: z.string() }),
})
  .then(planStep)
  .then(composeStep)
  .commit()

async function main() {
  console.log('=== Mastra spike start (createRun) ===')
  // 1) createRun
  const run = await (wf as any).createRun()
  console.log('run id:', run?.runId ?? run?.id ?? '(no id field)')

  // 2) watch —— 拿 step 级事件(M1 桥接 emitRunEvent 的锚点)
  const unwatch = run.watch((ev: any) => {
    const type = ev?.type
    const stepId = ev?.payload?.id || ev?.payload?.stepName || ev?.payload?.currentStep?.id
    events.push(`${type}${stepId ? ':' + stepId : ''}`)
  })

  // 3) start
  const res = await run.start({ inputData: { topic: 'AI 编排三框架' } })
  if (typeof unwatch === 'function') unwatch()

  console.log('=== status:', res?.status)
  console.log('=== result:', JSON.stringify(res?.result ?? res?.steps ?? res, null, 2).slice(0, 600))
  console.log('=== watch events (', events.length, '):')
  console.log(events.join('\n'))
  console.log('=== SPIKE_OK ===')
}

main().catch((e) => {
  console.error('=== SPIKE_FAIL ===')
  console.error(e?.stack || e)
  process.exit(1)
})
