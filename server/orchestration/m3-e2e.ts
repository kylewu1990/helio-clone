/**
 * M3 真测(场景 4)—— 驱动真实运行的 server(已配 CREW_BASE_URL),挂频道,派含数据主题的 deck。
 * argv[2]='up' :CrewAI 在线 → 期望 critic crew 真被调(role=critic 事件 status=ok 带评分)。
 * argv[2]='down':CrewAI 停掉 → 期望软降级(role=critic status=error "分析 AI 未参与"),deck 仍 ready。
 * 前置:server 起在 5473 且 env CREW_BASE_URL 已设;crew 服务由外部 bash 起/停。
 */
import { prisma } from '../src/db.js'

const SERVER = process.env.SERVER || 'http://127.0.0.1:5473'
const CHANNEL = 'cmpmxw93z0012nvfhrlsy9m07'
const ARIA = 'cmpmxw93o0001nvfhky0ddt7s'
const mode = (process.argv[2] || 'up') as 'up' | 'down'

async function pollByTitle(marker: string, sinceMs: number, ms: number) {
  const t0 = Date.now()
  let last: any = null
  while (Date.now() - t0 < ms) {
    const j = await prisma.generationJob.findFirst({ where: { title: { contains: marker }, createdAt: { gte: new Date(sinceMs) } }, orderBy: { createdAt: 'desc' } })
    last = j
    if (j && (j.status === 'ready' || j.status === 'failed')) return j
    await new Promise((r) => setTimeout(r, 2500))
  }
  return last
}

async function main() {
  const sam = await prisma.user.findFirst({ where: { isAssistant: false } })
  if (!sam) throw new Error('缺真人')
  const ex = await prisma.channelMember.findFirst({ where: { channelId: CHANNEL, userId: sam.id } })
  if (!ex) await prisma.channelMember.create({ data: { channelId: CHANNEL, userId: sam.id } })
  await prisma.appSetting.upsert({ where: { id: 'app' }, update: { orchestrationEngine: 'mastra', visualRunner: 'mastra-inline', deckOrchestration: true }, create: { id: 'app', orchestrationEngine: 'mastra' } })

  const marker = `数据调研 deck:2026 AI 市场份额与趋势(${mode} ${Date.now().toString().slice(-6)})`
  const since = Date.now() - 3000
  const res = await fetch(`${SERVER}/api/templates/generate-pptx-ai`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': sam.id },
    body: JSON.stringify({ topic: marker, assistantId: ARIA, channelId: CHANNEL, pageCount: 6, themeId: 'creative' }),
  })
  const body: any = await res.json()
  if (!body?.jobId) { console.log('dispatch FAIL:', JSON.stringify(body).slice(0, 160)); process.exit(1) }
  console.log(`[${mode}] dispatched → polling…`)
  const job = await pollByTitle(marker, since, 240000)
  const evs = await prisma.runEvent.findMany({ where: { generationJobId: job?.id }, select: { role: true, status: true, title: true } })
  const critic = evs.filter((e) => e.role === 'critic')
  const dataEvs = evs.filter((e) => e.role === 'data')

  console.log(`[${mode}] job.status=${job?.status} rolesJson=${job?.rolesJson}`)
  console.log(`[${mode}] critic 事件:`)
  for (const e of critic) console.log(`    [${e.status}] ${e.title}`)
  console.log(`[${mode}] data 事件:`)
  for (const e of dataEvs) console.log(`    [${e.status}] ${e.title}`)

  let pass = false
  if (mode === 'up') {
    const criticOk = critic.some((e) => e.status === 'ok' && /评审完成|均分/.test(e.title))
    pass = job?.status === 'ready' && criticOk
    console.log(`[up] deck ready=${job?.status === 'ready'} criticCrewCalled(ok+score)=${criticOk}`)
  } else {
    const degraded = critic.some((e) => e.status === 'error' && /分析 AI 未参与/.test(e.title))
    pass = job?.status === 'ready' && degraded
    console.log(`[down] deck still ready=${job?.status === 'ready'} criticSoftDegraded=${degraded}`)
  }
  console.log(pass ? `\n=== M3_${mode.toUpperCase()}_OK ===` : `\n=== M3_${mode.toUpperCase()}_FAIL ===`)
  await prisma.$disconnect()
  if (!pass) process.exit(1)
}
main().catch(async (e) => { console.error('FAIL', e?.stack || e); await prisma.$disconnect(); process.exit(1) })
