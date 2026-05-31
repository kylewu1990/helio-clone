/**
 * M1 E2E(场景 1 + 5)—— 驱动**真实运行的 server**,经真实 HTTP 路由 + flag 分流器跑同一 deck。
 * flag=mastra 与 flag=legacy 两路各跑一次,验证 GenerationJob/SandboxRun/preview HTML 结构一致。
 * 前置:server 已起在 127.0.0.1:5473;assistants 已配 Gemini。
 */
import { prisma } from '../src/db.js'

const SERVER = process.env.SERVER || 'http://127.0.0.1:5473'

async function setEngine(engine: 'legacy' | 'mastra') {
  await prisma.appSetting.upsert({ where: { id: 'app' }, update: { orchestrationEngine: engine }, create: { id: 'app', orchestrationEngine: engine } })
}

// 两路都用 cuid(等价),无法按路由 jobId 查 → 按 title 标记 + 时间窗定位本轮 job。
async function pollJobByTitle(marker: string, sinceMs: number, ms: number) {
  const t0 = Date.now()
  let last: any = null
  while (Date.now() - t0 < ms) {
    const j = await prisma.generationJob.findFirst({
      where: { title: { contains: marker }, createdAt: { gte: new Date(sinceMs) } },
      orderBy: { createdAt: 'desc' },
    })
    last = j
    if (j && (j.status === 'ready' || j.status === 'failed')) return j
    await new Promise((r) => setTimeout(r, 2000))
  }
  return last
}

async function dispatch(engine: 'legacy' | 'mastra', userId: string, assistantId: string) {
  await setEngine(engine)
  const eff = await prisma.appSetting.findUnique({ where: { id: 'app' } })
  console.log(`\n=== [${engine}] flag set → DB.orchestrationEngine=${(eff as any)?.orchestrationEngine}`)
  const marker = `三框架编排的工程价值(${engine} 路 ${Date.now().toString().slice(-6)})`
  const sinceMs = Date.now() - 3000
  const res = await fetch(`${SERVER}/api/templates/generate-pptx-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ topic: marker, assistantId, pageCount: 5, themeId: 'creative' }),
  })
  const body: any = await res.json()
  if (!body?.jobId) {
    console.log(`[${engine}] dispatch FAILED:`, JSON.stringify(body).slice(0, 200))
    return { engine, ok: false }
  }
  console.log(`[${engine}] dispatched (route jobId=${body.jobId.slice(0, 8)}) → polling by title…`)
  const job = await pollJobByTitle(marker, sinceMs, 200000)
  const sb = job?.resultSandboxRunId ? await prisma.sandboxRun.findUnique({ where: { id: job.resultSandboxRunId } }) : null
  let htmlLen = 0
  let htmlHead = ''
  if (sb) {
    const pr = await fetch(`${SERVER}/api/sandbox-runs/${sb.id}/preview/index.html`)
    if (pr.ok) {
      const html = await pr.text()
      htmlLen = html.length
      htmlHead = html.slice(0, 60).replace(/\n/g, ' ')
    }
  }
  const sections = sb?.diffSummary?.match(/(\d+) sections/)?.[1]
  console.log(`[${engine}] job.status=${job?.status} sandbox=${sb?.id?.slice(0, 8)} rolesJson=${job?.rolesJson ? 'set' : 'null'}`)
  console.log(`[${engine}] preview HTTP htmlLen=${htmlLen} sections=${sections} head="${htmlHead}"`)
  return {
    engine, ok: job?.status === 'ready' && htmlLen > 1000,
    status: job?.status, sandbox: sb?.id, htmlLen, sections, hasRoles: !!job?.rolesJson,
  }
}

async function main() {
  const sam = await prisma.user.findFirst({ where: { isAssistant: false } })
  const aria = await prisma.user.findFirst({ where: { handle: 'aria' } })
  if (!sam || !aria) throw new Error('缺用户')
  console.log('user=%s assistant=%s server=%s', sam.handle, aria.handle, SERVER)

  const m = await dispatch('mastra', sam.id, aria.id)
  const l = await dispatch('legacy', sam.id, aria.id)

  console.log('\n=== COMPARE ===')
  console.log('mastra:', JSON.stringify(m))
  console.log('legacy:', JSON.stringify(l))
  const bothReady = (m as any).ok && (l as any).ok
  const structAligned = (m as any).status === (l as any).status && !!(m as any).sandbox && !!(l as any).sandbox
  console.log(bothReady && structAligned ? '\n=== M1_E2E_OK(两路都产出 ready + 有 sandbox + preview 真返回 HTML)===' : '\n=== M1_E2E_FAIL ===')

  // 收尾:flag 回 legacy(默认安全态)
  await setEngine('legacy')
  await prisma.$disconnect()
  if (!(bothReady && structAligned)) process.exit(1)
}
main().catch(async (e) => { console.error('=== M1_E2E_FAIL ===', e?.stack || e); await prisma.$disconnect(); process.exit(1) })
