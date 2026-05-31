/**
 * M2 pi 路真测 —— visualRunner='pi':pi-agent-core 在 scratch 用 write_file 生成 →
 * 读回 → sanitize → persist 到正式 sandbox(非 scratch)。真 Gemini + 真 DB + 真落盘。
 * 验证:job ready / SandboxRun.workspacePath 在 .helio/sandboxes(不是 tmpdir)/ HTML 合法 /
 *       泳道有 visual 的 tool_start/tool_result/file 事件(证明 pi 真跑了工具)。
 */
import { randomUUID } from 'node:crypto'
import { resolve as pathResolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { prisma } from '../src/db.js'
import { runDeckWorkflow, type DeckWorkflowDeps } from '../src/orchestration/deckWorkflow.js'

const heliRoot = process.env.HELIO_ROOT || pathResolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const events: { kind: string; role: string; title: string }[] = []
const deps: DeckWorkflowDeps = {
  emitRunEvent: async (scope, ev: any) => {
    events.push({ kind: ev.kind, role: ev.role, title: ev.title })
    await prisma.runEvent.create({ data: { runId: scope.runId, generationJobId: scope.generationJobId ?? null, role: ev.role ?? null, phase: ev.phase ?? null, kind: ev.kind ?? 'stage', tool: ev.tool ?? null, title: ev.title ?? '', status: ev.status ?? null, detail: ev.detail ?? null } }).catch(() => {})
  },
  postDeliveryCard: async () => {},
  writeAudit: async () => {},
  broadcastWorkspace: () => {},
  memberIds: async () => [],
  shapeMessage: (m) => m,
  fullMessageInclude: { author: true },
  scanRepoPlugins: async () => [],
  heliRoot,
}

async function main() {
  await prisma.appSetting.upsert({ where: { id: 'app' }, update: { visualRunner: 'pi' }, create: { id: 'app', visualRunner: 'pi' } })
  const aria = await prisma.user.findFirst({ where: { handle: 'aria' } })
  const me = await prisma.user.findFirst({ where: { isAssistant: false } })
  if (!aria || !me) throw new Error('缺用户')
  const jobId = randomUUID()
  console.log('=== M2 pi-path test, visualRunner=pi, jobId', jobId.slice(0, 8))
  const t0 = Date.now()
  await runDeckWorkflow(
    { jobId, me: { id: me.id, name: me.name }, assistant: { ...(aria as any) }, topic: 'M2:pi runner 接住 visual 执行', audience: 'engineers', deckType: 'pitch deck', pageCount: 5, themeId: 'creative', channelId: null, attachments: [], taskId: null, pluginPrompts: [] },
    deps,
  )
  const dt = Date.now() - t0

  // 两路都用 cuid(等价),按 title 定位本轮 job(非路由 jobId)
  const job = await prisma.generationJob.findFirst({ where: { title: { contains: 'pi runner 接住 visual' } }, orderBy: { createdAt: 'desc' } })
  const sb = job?.resultSandboxRunId ? await prisma.sandboxRun.findUnique({ where: { id: job.resultSandboxRunId } }) : null
  const htmlPath = sb ? pathResolve(sb.workspacePath, 'index.html') : ''
  const htmlOk = htmlPath && existsSync(htmlPath)
  const htmlLen = htmlOk ? readFileSync(htmlPath, 'utf8').length : 0
  const visualToolEvents = events.filter((e) => e.role === 'visual' && (e.kind === 'tool_start' || e.kind === 'tool_result' || e.kind === 'file'))
  const persistInRealSandbox = !!sb && sb.workspacePath.includes('.helio/sandboxes') && !sb.workspacePath.includes('deck-pi-')

  console.log('\n=== visual tool events (', visualToolEvents.length, '):')
  for (const e of visualToolEvents) console.log(`   [${e.kind}/${e.role}] ${e.title}`)
  console.log('=== GenerationJob status=%s', job?.status)
  console.log('=== SandboxRun workspacePath=%s', sb?.workspacePath)
  console.log('=== persist 在正式 sandbox(非 scratch)=%s', persistInRealSandbox)
  console.log('=== HTML exists=%s len=%d', htmlOk, htmlLen)
  console.log('=== took %dms', dt)

  await prisma.appSetting.update({ where: { id: 'app' }, data: { visualRunner: 'mastra-inline' } }).catch(() => {})
  const pass = job?.status === 'ready' && htmlOk && htmlLen > 1000 && visualToolEvents.length > 0 && persistInRealSandbox
  console.log(pass ? '\n=== M2_PI_OK ===' : '\n=== M2_PI_FAIL ===')
  await prisma.$disconnect()
  if (!pass) process.exit(1)
}
main().catch(async (e) => { console.error('=== M2_PI_FAIL ===', e?.stack || e); await prisma.appSetting.update({ where: { id: 'app' }, data: { visualRunner: 'mastra-inline' } }).catch(() => {}); await prisma.$disconnect(); process.exit(1) })
