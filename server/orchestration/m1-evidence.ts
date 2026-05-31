/**
 * M1 证据抓取 —— 查最近 mastra / legacy 两路 GenerationJob 的结构等价证据:
 * job id + status + SandboxRun + Delivery + 按 role 的泳道 RunEvent 计数。
 * 纯 DB 读(不需要起服务)。
 */
import { prisma } from '../src/db.js'

async function evidenceFor(marker: string, label: string) {
  const job = await prisma.generationJob.findFirst({
    where: { title: { contains: marker } },
    orderBy: { createdAt: 'desc' },
  })
  if (!job) { console.log(`[${label}] NO JOB for marker="${marker}"`); return null }
  const sb = job.resultSandboxRunId ? await prisma.sandboxRun.findUnique({ where: { id: job.resultSandboxRunId } }) : null
  const delivery = sb ? await prisma.delivery.findFirst({ where: { artifactJson: { contains: sb.id } }, orderBy: { createdAt: 'desc' } }) : null
  const evs = await prisma.runEvent.findMany({ where: { generationJobId: job.id }, select: { role: true, phase: true, status: true, title: true } })
  const byRole: Record<string, number> = {}
  for (const e of evs) byRole[e.role ?? 'none'] = (byRole[e.role ?? 'none'] ?? 0) + 1
  console.log(`\n[${label}] job=${job.id} status=${job.status}`)
  console.log(`[${label}] sandbox=${sb?.id ?? 'none'} sbStatus=${sb?.status ?? '-'} diff="${sb?.diffSummary ?? '-'}"`)
  console.log(`[${label}] delivery=${delivery ? delivery.id : 'none'} title="${delivery?.title ?? '-'}"`)
  console.log(`[${label}] rolesJson=${job.rolesJson ?? 'null'}`)
  console.log(`[${label}] RunEvent total=${evs.length} byRole=${JSON.stringify(byRole)}`)
  for (const e of evs) console.log(`    · [${e.role}/${e.phase}/${e.status}] ${e.title}`)
  return { jobId: job.id, status: job.status, sandbox: sb?.id, delivery: delivery?.id, total: evs.length, byRole, workspacePath: sb?.workspacePath }
}

async function main() {
  // 上一轮 E2E 的 marker(title 含 "三框架编排的工程价值(<engine> 路 …")
  const m = await evidenceFor('mastra 路', 'mastra')
  const l = await evidenceFor('legacy 路', 'legacy')
  console.log('\n=== SUMMARY ===')
  console.log('mastra:', JSON.stringify(m))
  console.log('legacy:', JSON.stringify(l))
  await prisma.$disconnect()
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
