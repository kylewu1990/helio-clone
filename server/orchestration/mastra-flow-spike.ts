/**
 * M0 SPIKE — Mastra 控制流:.parallel(扇出) + .branch(orchestrate 开关) + 嵌套子 workflow。
 * 这是 M1 deckWorkflow 的形状骨架(无 LLM,纯控制流,快)。
 */
import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'

const mk = (id: string, fn: (i: any) => any, inS: any, outS: any) =>
  createStep({ id, inputSchema: inS, outputSchema: outS, execute: async ({ inputData }: any) => fn(inputData) })

const S = z.object({ topic: z.string() })
const contentStep = mk('content', (i) => ({ role: 'content', text: `content:${i.topic}` }), S, z.object({ role: z.string(), text: z.string() }))
const dataStep = mk('data', (i) => ({ role: 'data', text: `data:${i.topic}` }), S, z.object({ role: z.string(), text: z.string() }))

// 扇出:content + data 并行(各自独立 step)。parallel 输出按 stepId 聚合。
const fanout = createWorkflow({ id: 'fanout', inputSchema: S, outputSchema: z.object({ content: z.any(), data: z.any() }) })
  .parallel([contentStep, dataStep])
  .commit()

const planStep = mk('plan', (i) => ({ topic: i.topic, orchestrate: i.topic.includes('多') }), S, z.object({ topic: z.string(), orchestrate: z.boolean() }))
const soloStep = mk('solo', (i) => ({ mode: 'solo', topic: i.topic }), z.object({ topic: z.string(), orchestrate: z.boolean() }), z.object({ mode: z.string(), topic: z.string() }))
const orchStep = mk('orch', (i) => ({ mode: 'orchestrated', topic: i.topic }), z.object({ topic: z.string(), orchestrate: z.boolean() }), z.object({ mode: z.string(), topic: z.string() }))

const wf = createWorkflow({ id: 'branch-spike', inputSchema: S, outputSchema: z.any() })
  .then(planStep)
  .branch([
    [async ({ inputData }: any) => inputData.orchestrate === true, orchStep],
    [async ({ inputData }: any) => inputData.orchestrate === false, soloStep],
  ])
  .commit()

async function run(wf: any, input: any, label: string) {
  const events: string[] = []
  const r = await wf.createRun()
  const un = r.watch((ev: any) => events.push(`${ev?.type}:${ev?.payload?.id ?? ''}`))
  const res = await r.start({ inputData: input })
  if (typeof un === 'function') un()
  console.log(`[${label}] status=${res?.status} result=${JSON.stringify(res?.result)} events=${events.length}`)
  console.log(`[${label}] event-ids=${events.join(',')}`)
  return res
}

async function main() {
  await run(fanout, { topic: 'AI' }, 'PARALLEL')
  await run(wf, { topic: '多AI编排' }, 'BRANCH-orchestrate')
  await run(wf, { topic: '单AI' }, 'BRANCH-solo')
  console.log('=== FLOW_SPIKE_OK ===')
}
main().catch((e) => { console.error('=== FLOW_SPIKE_FAIL ===', e?.stack || e); process.exit(1) })
