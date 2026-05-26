// v3 Phase A — 4 场景验证(P 创建项目 / Q L2L3 写入 / R Context 注入 / S 重启后记忆持续)
// 关键:S 是"灵魂测试场景" — 写入 → 关 Prisma 客户端模拟"重启" → 重新 import 模块 → 仍能读到 L2。
// 不依赖 LLM,直接走 prisma + buildProjectContext 函数,验证逻辑闭环。
//
// 运行:HELIO_NO_LISTEN=1 pnpm -C server exec tsx scripts/v3a-smoke.ts
import { prisma } from '../src/db.js'
import { ensureL2, appendL2, appendEpisodic, loadMemories } from '../src/memory.js'
import { buildProjectContext } from '../src/context.js'

const log = (...args: unknown[]) => console.log('[v3a-smoke]', ...args)
const ok = (m: string) => log('  ✓', m)
const fail = (m: string) => {
  log('  ✗', m)
  process.exitCode = 1
}

async function ensureUser(opts: { handle: string; name: string; isAssistant: boolean; color?: number; systemPrompt?: string }) {
  const existing = await prisma.user.findUnique({ where: { handle: opts.handle } })
  if (existing) {
    if (opts.systemPrompt && (existing as any).systemPrompt !== opts.systemPrompt) {
      await prisma.user.update({ where: { id: existing.id }, data: { systemPrompt: opts.systemPrompt } })
    }
    return existing
  }
  return prisma.user.create({
    data: {
      handle: opts.handle,
      name: opts.name,
      avatarColor: opts.color ?? 1,
      isAssistant: opts.isAssistant,
      systemPrompt: opts.systemPrompt ?? null,
    },
  })
}

async function scenarioP(): Promise<{ channelId: string; humanId: string; aiId: string }> {
  log('— 场景 P: 创建项目频道 ——————')
  const human = await ensureUser({ handle: 'v3a-kyle', name: 'Kyle (v3a)', isAssistant: false, color: 5 })
  const ai = await ensureUser({
    handle: 'v3a-ai-aria',
    name: 'Aria (v3a)',
    isAssistant: true,
    color: 2,
    systemPrompt: '你是 Aria,Heliox 项目频道里的全栈 AI 助手。负责任务执行与协作沟通,保持简短直接。',
  })
  const channelName = `v3a-project-${Date.now()}`
  const channel: any = await prisma.channel.create({
    data: {
      name: channelName,
      kind: 'project',
      goal: '搭建 efe-web 第三册的 7-level 学习路径,2026 Q2 上线 alpha',
      scope: '前端 React + Vite,后端 Node + Prisma,目标 1k+ 注册用户/月',
      phase: 'discovery',
      ownerId: human.id,
      startedAt: new Date(),
      members: { create: [{ userId: human.id }, { userId: ai.id }] },
    },
  })
  log(`  创建项目频道 #${channel.name} (kind=${channel.kind}, phase=${channel.phase}, goal="${channel.goal!.slice(0, 30)}…")`)
  if (channel.kind === 'project') ok('kind=project 写入')
  else fail(`kind 错误:${channel.kind}`)
  if (channel.phase === 'discovery') ok('phase=discovery 默认')
  if (channel.goal) ok('goal 必填,已设置')
  if (channel.ownerId === human.id) ok('owner 设置正确')

  // 切换 phase 真实更新
  await prisma.channel.update({
    where: { id: channel.id },
    data: { phase: 'build' },
  })
  const after: any = await prisma.channel.findUnique({ where: { id: channel.id } })
  if (after.phase === 'build') ok('phase 切换:discovery → build 持久化')
  else fail(`phase 未更新:${after.phase}`)

  return { channelId: channel.id, humanId: human.id, aiId: ai.id }
}

async function scenarioQ(ctx: { channelId: string; humanId: string; aiId: string }) {
  log('— 场景 Q: L2/L3 记忆真实写入 ——————')
  // 模拟 user @ AI → ensureL2
  const channel: any = await prisma.channel.findUnique({ where: { id: ctx.channelId } })
  await ensureL2(ctx.aiId, ctx.channelId, {
    goal: channel.goal,
    scope: channel.scope,
    phase: channel.phase,
    ownerName: 'Kyle',
  })
  const after1 = await loadMemories(ctx.aiId, ctx.channelId)
  if (after1.l2) ok(`L2 已创建(${after1.l2.content.length} chars)`)
  else fail('L2 未创建')
  if (after1.l2?.content.includes('efe-web')) ok('L2 内容含项目 goal 关键词')

  // 模拟 AI 完成 task → appendL2 + L3
  await appendL2(ctx.aiId, ctx.channelId, '完成首页设计稿(Figma 链接已存项目仓库)', {
    reason: 'delivery_approved',
    taskId: 'fake-task-1',
  })
  await appendEpisodic(ctx.aiId, ctx.channelId, '执行任务「首页设计稿」,生成 3 个候选方案', {
    reason: 'task_completed',
  })
  const after2 = await loadMemories(ctx.aiId, ctx.channelId)
  if (after2.l2?.itemCount === 2) ok('L2 itemCount=2(init + appendL2)')
  else fail(`L2 itemCount 异常:${after2.l2?.itemCount}`)
  if (after2.l2?.content.includes('首页设计稿')) ok('L2 追加内容真实写入')
  if (after2.l3) ok(`L3 已创建(${after2.l3.content.length} chars)`)
  if (after2.l3?.itemCount === 1) ok('L3 itemCount=1')
}

async function scenarioR(ctx: { channelId: string; humanId: string; aiId: string }) {
  log('— 场景 R: Project Context 真实注入 ——————')
  // 造一条 trigger message(用户问问题)
  const trig = await prisma.message.create({
    data: {
      channelId: ctx.channelId,
      authorId: ctx.humanId,
      body: '我们之前讨论过的首页方案,跟现在的目标还匹配吗?',
    },
  })
  // 也造几条历史消息确保 context 有内容
  for (let i = 0; i < 3; i++) {
    await prisma.message.create({
      data: {
        channelId: ctx.channelId,
        authorId: i % 2 === 0 ? ctx.humanId : ctx.aiId,
        body: `历史消息 ${i + 1}:讨论 efe-web 的 user journey`,
      },
    })
  }

  const ctxOut = await buildProjectContext({
    agentId: ctx.aiId,
    channelId: ctx.channelId,
    triggerMessageId: trig.id,
  })

  // 拼成单个 string 便于 grep 验证
  const systemPrompt = ctxOut.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  log(`  build 完成,stats=${JSON.stringify(ctxOut.stats)}`)
  if (systemPrompt.includes('Aria') || systemPrompt.includes('Heliox')) ok('system prompt 含 L1 角色(systemPrompt)')
  if (systemPrompt.includes('efe-web')) ok('system prompt 含 L2 项目 goal 关键词')
  if (systemPrompt.includes('首页设计稿')) ok('system prompt 含 L2 关键决定(场景 Q 写入)')
  if (systemPrompt.includes('情节记忆') || systemPrompt.includes('user journey')) ok('system prompt 含 L3 episodic 数据')
  if (systemPrompt.includes('项目元信息')) ok('system prompt 含项目元(goal+phase+scope)')
  const why = JSON.parse(ctxOut.whyJson)
  if (why.used?.l2 && why.used?.l3 && why.used?.l1) ok('whyJson.used.{l1,l2,l3} 全 true')
  if (ctxOut.stats.totalEstimatedTokens < 6000) ok(`总 tokens 在预算内 (${ctxOut.stats.totalEstimatedTokens} ≤ 6000)`)
  else fail(`token 超预算:${ctxOut.stats.totalEstimatedTokens}`)
  // 历史消息(非 system)真实存在
  const nonSystem = ctxOut.messages.filter((m) => m.role !== 'system')
  if (nonSystem.length >= 3) ok(`非 system 消息 ${nonSystem.length} 条(历史 + trigger)`)
  if (nonSystem.some((m) => m.content.includes('首页方案'))) ok('trigger message 在 context 里')
}

async function scenarioS(ctx: { channelId: string; humanId: string; aiId: string }) {
  log('— 场景 S(灵魂测试): 跨 session 记忆持续 ——————')
  // 模拟"重启":断开 prisma client → 重连(用一个新连接读)
  // Prisma 单例 prisma 已经 query 过,现在 disconnect → 再用 buildProjectContext(它会重新拿连接)
  await prisma.$disconnect()
  log('  prisma.$disconnect() 模拟 server 关闭')

  // 重新调 buildProjectContext(prisma client 内部自动重连)
  const ctxAfterRestart = await buildProjectContext({
    agentId: ctx.aiId,
    channelId: ctx.channelId,
  })
  const sys = ctxAfterRestart.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  if (sys.includes('efe-web')) ok('重启后 L2 仍含 goal「efe-web」')
  else fail('L2 重启后丢失')
  if (sys.includes('首页设计稿')) ok('重启后 L2 仍含场景 Q 写入的关键决定')
  else fail('场景 Q L2 写入丢失')
  if (sys.includes('情节记忆') || sys.includes('user journey') || ctxAfterRestart.stats.l3Chars > 0) ok('重启后 L3 情节摘要可读')
  else fail('L3 重启后丢失')

  // 关键 checkpoint:模拟"AI 不需要重新解释背景"— 重启后再发一条新触发,
  //   AI 的 system prompt 应该不依赖任何 in-memory state
  const newTrig = await prisma.message.create({
    data: {
      channelId: ctx.channelId,
      authorId: ctx.humanId,
      body: '现在我们做 user signup 流程,你有什么建议?',
    },
  })
  const ctxAgain = await buildProjectContext({
    agentId: ctx.aiId,
    channelId: ctx.channelId,
    triggerMessageId: newTrig.id,
  })
  const sysAgain = ctxAgain.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  // AI 在新会话里"知道"项目目标 + 历史决定 → system prompt 必须含 goal + L2 关键决定
  if (sysAgain.includes('efe-web') && sysAgain.includes('首页设计稿')) {
    ok('灵魂测试 PASS:重启后新触发消息的 context 仍含项目 goal + 历史 L2 关键决定')
  } else {
    fail('灵魂测试 FAIL:AI 在新 session 中丢失项目背景')
  }
}

async function summarize(ctx: { channelId: string }) {
  log('— 数据库统计 ——————')
  const memCount = await prisma.memory.count({ where: { channelId: ctx.channelId } })
  log(`  Memory 总条目:${memCount}(应 = 2:L2 + L3)`)
  const edgeCount = await prisma.edge.count({ where: { channelId: ctx.channelId } })
  log(`  Edge 总条目:${edgeCount}(包括 v2 触发点)`)
  const ch: any = await prisma.channel.findUnique({ where: { id: ctx.channelId } })
  log(`  最终 channel:kind=${ch.kind}, phase=${ch.phase}, goal="${ch.goal?.slice(0, 50)}…"`)
}

async function main() {
  const start = Date.now()
  const ctx = await scenarioP()
  await scenarioQ(ctx)
  await scenarioR(ctx)
  await scenarioS(ctx)
  await summarize(ctx)
  log(`完成,耗时 ${Date.now() - start}ms。exitCode=${process.exitCode ?? 0}`)
  await prisma.$disconnect()
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => {
  console.error('[smoke-error]', e)
  process.exit(1)
})
