/**
 * M2 头牌真测(场景 2 + Button deck + pi)—— 驱动真实运行的 server,挂频道 strategy-q3
 * (4 个 Gemini 助理:aria/lex=gemini-3-pro,cypher/foster=gemini-2.5-flash)。
 * 两 flag 两路:visualRunner='pi' vs 'mastra-inline',同一 Button 组件 deck,验证:
 *  - 都 job=ready + SandboxRun 在正式 .helio/sandboxes + preview HTTP ≥1KB 合法 HTML(iframe 可渲染)
 *  - 泳道 RunEvent 按 generationJobId 分组,有 content/data/visual 角色;pi 路 visual 有 tool_start/file/tool_result
 *  - rolesMeta 显示各角色的 assistant + model(多助理协同可见)
 */
import { prisma } from '../src/db.js'

const SERVER = process.env.SERVER || 'http://127.0.0.1:5473'
const CHANNEL = 'cmpmxw93z0012nvfhrlsy9m07' // strategy-q3
const ARIA = 'cmpmxw93o0001nvfhky0ddt7s'

async function setFlags(visualRunner: 'pi' | 'mastra-inline') {
  await prisma.appSetting.upsert({
    where: { id: 'app' },
    update: { orchestrationEngine: 'mastra', visualRunner, deckOrchestration: true },
    create: { id: 'app', orchestrationEngine: 'mastra', visualRunner, deckOrchestration: true },
  })
}

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

async function dispatch(visualRunner: 'pi' | 'mastra-inline', userId: string) {
  await setFlags(visualRunner)
  const marker = `Button 组件库 deck(${visualRunner} ${Date.now().toString().slice(-6)})`
  const since = Date.now() - 3000
  const res = await fetch(`${SERVER}/api/templates/generate-pptx-ai`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ topic: marker, assistantId: ARIA, channelId: CHANNEL, pageCount: 5, themeId: 'creative' }),
  })
  const body: any = await res.json()
  if (!body?.jobId) { console.log(`[${visualRunner}] dispatch FAIL:`, JSON.stringify(body).slice(0, 160)); return { visualRunner, ok: false } }
  console.log(`\n[${visualRunner}] dispatched (route ${body.jobId.slice(0, 8)}) → polling…`)
  const job = await pollByTitle(marker, since, 220000)
  const sb = job?.resultSandboxRunId ? await prisma.sandboxRun.findUnique({ where: { id: job.resultSandboxRunId } }) : null
  const evs = await prisma.runEvent.findMany({ where: { generationJobId: job?.id }, select: { role: true, kind: true } })
  const byRoleKind: Record<string, number> = {}
  for (const e of evs) { const k = `${e.role}/${e.kind}`; byRoleKind[k] = (byRoleKind[k] || 0) + 1 }
  let bytes = 0, doctype = false
  if (sb) {
    const pr = await fetch(`${SERVER}/api/sandbox-runs/${sb.id}/preview/index.html`)
    if (pr.ok) { const h = await pr.text(); bytes = h.length; doctype = /<!doctype html/i.test(h) }
  }
  const realSandbox = !!sb && sb.workspacePath.includes('.helio/sandboxes') && !sb.workspacePath.includes('deck-pi-')
  const piToolEvents = (byRoleKind['visual/tool_start'] || 0) + (byRoleKind['visual/file'] || 0) + (byRoleKind['visual/tool_result'] || 0)
  console.log(`[${visualRunner}] job=${job?.id?.slice(0, 8)} status=${job?.status} realSandbox=${realSandbox} preview=${bytes}B doctype=${doctype}`)
  console.log(`[${visualRunner}] RunEvent byRole/kind=${JSON.stringify(byRoleKind)} piVisualToolEvents=${piToolEvents}`)
  console.log(`[${visualRunner}] rolesMeta=${job?.rolesJson}`)
  return { visualRunner, ok: job?.status === 'ready' && bytes > 1000 && doctype && realSandbox, status: job?.status, bytes, realSandbox, piToolEvents, byRoleKind }
}

async function main() {
  const sam = await prisma.user.findFirst({ where: { isAssistant: false } })
  if (!sam) throw new Error('缺真人')
  // 确保 sam 是频道成员(测试前置)
  const exists = await prisma.channelMember.findFirst({ where: { channelId: CHANNEL, userId: sam.id } })
  if (!exists) { await prisma.channelMember.create({ data: { channelId: CHANNEL, userId: sam.id } }); console.log('+ added sam to channel') }

  const pi = await dispatch('pi', sam.id)
  const inline = await dispatch('mastra-inline', sam.id)

  console.log('\n=== COMPARE (pi vs mastra-inline) ===')
  console.log('pi    :', JSON.stringify(pi))
  console.log('inline:', JSON.stringify(inline))
  const bothReady = (pi as any).ok && (inline as any).ok
  const piHadToolEvents = (pi as any).piToolEvents > 0
  const inlineNoToolEvents = (inline as any).piToolEvents === 0 // inline 不该有 pi 工具事件
  console.log(`bothReady=${bothReady} piHadToolEvents=${piHadToolEvents} inlineNoToolEvents=${inlineNoToolEvents}`)
  console.log(bothReady && piHadToolEvents && inlineNoToolEvents ? '\n=== M2_CHANNEL_OK ===' : '\n=== M2_CHANNEL_FAIL ===')

  await setFlags('mastra-inline')
  await prisma.appSetting.update({ where: { id: 'app' }, data: { orchestrationEngine: 'legacy' } }).catch(() => {}) // 收尾回安全态
  await prisma.$disconnect()
  if (!(bothReady && piHadToolEvents && inlineNoToolEvents)) process.exit(1)
}
main().catch(async (e) => { console.error('=== M2_CHANNEL_FAIL ===', e?.stack || e); await prisma.appSetting.update({ where: { id: 'app' }, data: { orchestrationEngine: 'legacy', visualRunner: 'mastra-inline' } }).catch(() => {}); await prisma.$disconnect(); process.exit(1) })
