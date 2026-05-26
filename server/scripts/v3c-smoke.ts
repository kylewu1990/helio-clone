// v3 Phase C — channelId 错位修复 4 场景 + 1 回归(J1~J5)
//
// 灵魂场景 X:项目频道里产品经理 create_task 后,task 立即触发 executeTask,
//   briefMsg / Progress / Delivery 全部落回项目频道,零 DM 错位。
//
// 跑法:HELIO_NO_LISTEN=1 pnpm -C server exec tsx scripts/v3c-smoke.ts
//
// 设计原则:
// - 不依赖外部 LLM(给 AI 配 baseUrl=http://127.0.0.1:8317/v1,canGenerate 通过即可;
//   LLM stream 阶段无服务可达会失败,但 TaskRun.channelId / audit 已经在 executeTask 决策段写入)。
// - 场景 W/Z 完全不调 executeTask,只测 create_task 工具 + maybeTriggerAssistants。
// - 场景 X/Y 等 J1 决策段写完,不等 LLM。

import { prisma } from '../src/db.js'
import { runTool } from '../src/skills.js'
// side-effect import:让 index.ts 加载并注册 J5 setAutoExecAfterCreateTaskHook;
// HELIO_NO_LISTEN=1 跳过 listen + migrate,但 hook 注册仍执行(在 if 块外)。
import '../src/index.js'

const log = (...args: unknown[]) => console.log('[v3c-smoke]', ...args)
let failed = 0
const ok = (m: string) => log('  ✓', m)
const fail = (m: string) => {
  log('  ✗', m)
  failed++
  process.exitCode = 1
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const STAMP = Date.now()
const tag = (s: string) => `v3c-${STAMP}-${s}`

async function ensureUser(opts: {
  handle: string
  name: string
  isAssistant: boolean
  skills?: string[]
}) {
  const existing = await prisma.user.findUnique({ where: { handle: opts.handle } })
  if (existing) return existing
  return prisma.user.create({
    data: {
      handle: opts.handle,
      name: opts.name,
      avatarColor: opts.isAssistant ? 2 : 5,
      isAssistant: opts.isAssistant,
      // 本地 LLM 端点(canGenerate 通过即可,实际 stream 失败不影响 J1 决策段断言)
      provider: opts.isAssistant ? 'custom' : null,
      baseUrl: opts.isAssistant ? 'http://127.0.0.1:8317/v1' : null,
      apiKey: opts.isAssistant ? 'sk-local-smoke' : null,
      model: opts.isAssistant ? 'gemini-2.5-flash' : null,
      skills: opts.skills ? JSON.stringify(opts.skills) : null,
      autoRespond: opts.isAssistant ? true : false,
    } as any,
  })
}

async function createProjectChannel(opts: {
  name: string
  ownerId: string
  memberIds: string[]
}) {
  return prisma.channel.create({
    data: {
      name: opts.name,
      kind: 'project',
      isDM: false,
      goal: 'v3c smoke 验证项目',
      phase: 'build',
      ownerId: opts.ownerId,
      startedAt: new Date(),
      members: { create: opts.memberIds.map((id) => ({ userId: id })) },
    },
  })
}

async function createDM(aId: string, bId: string) {
  return prisma.channel.create({
    data: {
      name: '',
      isDM: true,
      members: { create: [{ userId: aId }, { userId: bId }] },
    },
  })
}

// ─────────────────────────────────────────────────────────────────────
// 场景 W:DM 里调 create_task 被拒
// ─────────────────────────────────────────────────────────────────────
async function scenarioW() {
  log('— 场景 W:DM 里 create_task 被拒 ──────')
  const kyle = await ensureUser({ handle: tag('kyle'), name: 'Kyle (v3c)', isAssistant: false })
  const pm = await ensureUser({
    handle: tag('pm'),
    name: '产品经理 (v3c)',
    isAssistant: true,
    skills: ['create_task'],
  })
  const dm = await createDM(kyle.id, pm.id)
  const before = await prisma.task.count()
  const result = await runTool('create_task', { title: 'W-试图在 DM 建任务' }, {
    channelId: dm.id,
    userId: kyle.id,
  })
  const after = await prisma.task.count()
  if (after === before) ok('Task count 未增长(DM 创建被拒)')
  else fail(`Task count 增长 ${after - before}(应该 0)`)
  if (/不能在私信里建任务/.test(result || '')) ok('返回错误串含「不能在私信里建任务」')
  else fail(`返回串不含拒绝提示:${result?.slice(0, 80)}`)
}

// ─────────────────────────────────────────────────────────────────────
// 场景 X(灵魂):项目频道里 create_task 后立即触发 executeTask
// ─────────────────────────────────────────────────────────────────────
async function scenarioX() {
  log('— 场景 X(灵魂):create_task 后立即开工 ──────')
  const kyle = await ensureUser({ handle: tag('x-kyle'), name: 'Kyle X (v3c)', isAssistant: false })
  const pm = await ensureUser({
    handle: tag('x-pm'),
    name: '产品经理 X (v3c)',
    isAssistant: true,
    skills: ['create_task'],
  })
  const eng = await ensureUser({
    handle: tag('x-eng'),
    name: '软件工程师 X (v3c)',
    isAssistant: true,
    // exec skills:让 pickAutoExecutor 能选中(write_file / run_command 是 A2A_EXEC_SKILLS 的关键项)
    skills: ['write_file', 'run_command'],
  })
  const proj = await createProjectChannel({
    name: tag('x-proj'),
    ownerId: kyle.id,
    memberIds: [kyle.id, pm.id, eng.id],
  })
  // 模拟产品经理调 create_task(灵魂场景:project 频道里拆 todo)
  const result = await runTool(
    'create_task',
    { title: 'X-灵魂场景:构建英语学习首页' },
    { channelId: proj.id, userId: kyle.id },
  )
  if (!/已创建任务/.test(result || '')) fail(`create_task 返回不符:${result?.slice(0, 80)}`)
  else ok('create_task 工具返回「已创建任务」')

  // J5 hook 是 fire-and-forget;等一下让 executeTask 决策段 + TaskRun.create 完成
  await sleep(800)

  // 找刚创的 task
  const tasks = await prisma.task.findMany({
    where: { channelId: proj.id, title: { contains: 'X-灵魂场景' } },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })
  const task = tasks[0]
  if (!task) {
    fail('找不到 task')
    return
  }
  if (task.channelId === proj.id) ok(`Task.channelId === 项目频道 id`)
  else fail(`Task.channelId=${task.channelId} ≠ projectId=${proj.id}`)

  if (task.assigneeId === eng.id) ok(`Task.assigneeId === 软件工程师 id(J5 hook 补派)`)
  else fail(`Task.assigneeId=${task.assigneeId} ≠ engId=${eng.id}`)

  // audit 应该有 auto_exec_after_create_task
  const audit = await prisma.auditEvent.findFirst({
    where: { taskId: task.id, type: 'auto_exec_after_create_task' },
  })
  if (audit) ok('AuditEvent: auto_exec_after_create_task 已写入')
  else fail('AuditEvent: auto_exec_after_create_task 缺失')

  // 关键:TaskRun.channelId 必须 === task.channelId(零 DM 错位)
  const run = await prisma.taskRun.findFirst({
    where: { taskId: task.id },
    orderBy: { startedAt: 'desc' },
  })
  if (!run) {
    fail('TaskRun 未创建(executeTask 未触发或卡在 channelId 决策前)')
    return
  }
  if (run.channelId === proj.id) ok(`TaskRun.channelId === 项目频道 id(零 DM 错位 ✓)`)
  else fail(`TaskRun.channelId=${run.channelId} ≠ projectId=${proj.id} — DM 错位重现!`)

  if (run.assistantId === eng.id) ok('TaskRun.assistantId === 软件工程师')
  else fail(`TaskRun.assistantId=${run.assistantId} ≠ engId=${eng.id}`)
}

// ─────────────────────────────────────────────────────────────────────
// 场景 Y:executeTask channelId 强一致(opts.channelId 错传 DM,内部用 task.channelId)
// ─────────────────────────────────────────────────────────────────────
async function scenarioY() {
  log('— 场景 Y:executeTask channelId 强一致 ──────')
  const { executeTask } = (await import('../src/index.js')) as any
  if (!executeTask) {
    fail('executeTask 未 export — 无法独立模拟 channel_mismatch')
    return
  }
  const kyle = await ensureUser({ handle: tag('y-kyle'), name: 'Kyle Y (v3c)', isAssistant: false })
  const eng = await ensureUser({
    handle: tag('y-eng'),
    name: '软件工程师 Y (v3c)',
    isAssistant: true,
    skills: ['write_file', 'run_command'],
  })
  const proj = await createProjectChannel({
    name: tag('y-proj'),
    ownerId: kyle.id,
    memberIds: [kyle.id, eng.id],
  })
  const wrongDM = await createDM(kyle.id, eng.id)

  // 创个 task 钉到项目频道,assignee=工程师(executeTask 才能继续)
  const task = await prisma.task.create({
    data: {
      title: 'Y-channelId 强一致测试',
      status: 'todo',
      channelId: proj.id,
      assigneeId: eng.id,
      createdById: kyle.id,
    },
  })

  // 故意传错的 DM channelId,断言内部用 task.channelId 兜回项目频道
  // fire-and-forget;executeTask 后续会走 LLM stream 失败,但 J1 决策段已写 TaskRun + audit
  void executeTask(task.id, {
    triggeredById: kyle.id,
    trigger: 'manual',
    channelId: wrongDM.id, // 故意错传 — J1 应忽略并报 mismatch
  }).catch(() => {})

  await sleep(800)

  const run = await prisma.taskRun.findFirst({
    where: { taskId: task.id },
    orderBy: { startedAt: 'desc' },
  })
  if (!run) {
    fail('TaskRun 未创建 — executeTask 卡在 channelId 决策前')
    return
  }
  if (run.channelId === proj.id) ok('TaskRun.channelId === task.channelId(项目频道,J1 兜回 ✓)')
  else fail(`TaskRun.channelId=${run.channelId} ≠ projectId=${proj.id} — J1 失效!`)

  if (run.channelId !== wrongDM.id) ok('TaskRun.channelId !== 错传的 DM(opts.channelId 被忽略 ✓)')
  else fail('TaskRun.channelId === 错传的 DM — J1 没生效')

  const mismatch = await prisma.auditEvent.findFirst({
    where: { taskId: task.id, type: 'executeTask.channel_mismatch' },
  })
  if (mismatch) ok('AuditEvent: executeTask.channel_mismatch 已写入')
  else fail('AuditEvent: executeTask.channel_mismatch 缺失 — J1 audit 未触发')
}

// ─────────────────────────────────────────────────────────────────────
// 场景 Z:无 executor 硬 cede
// ─────────────────────────────────────────────────────────────────────
async function scenarioZ() {
  log('— 场景 Z:无 executor 硬 cede ──────')
  const { maybeTriggerAssistantsForTest, fullMessageIncludeForTest } = await loadInternalsForZ()
  if (!maybeTriggerAssistantsForTest) {
    log('  ⚠ maybeTriggerAssistants 未导出,场景 Z 改为断言数据条件即可:')
    log('  跳过直接调用,改用最小数据条件验证 H2 cede 路径会触发(不实际触发)')
  }
  const kyle = await ensureUser({ handle: tag('z-kyle'), name: 'Kyle Z (v3c)', isAssistant: false })
  // 只加产品经理(无 exec skills),不加软件工程师,但 J3 会自动补加 → 故意先创频道再立即测
  // 为了真实模拟"无 executor",我们手动构造一个不带 exec skills 的频道(绕过 J3 自动补)
  const pm = await ensureUser({
    handle: tag('z-pm'),
    name: '产品经理 Z (v3c)',
    isAssistant: true,
    skills: ['create_task'], // 无 write_file / run_command
  })
  // 直接用 prisma 建频道(绕过 POST /api/channels 的 ensureProjectExecutor)
  const proj = await prisma.channel.create({
    data: {
      name: tag('z-proj'),
      kind: 'project',
      isDM: false,
      goal: 'v3c Z 场景:无 exec AI',
      phase: 'build',
      ownerId: kyle.id,
      startedAt: new Date(),
      members: { create: [{ userId: kyle.id }, { userId: pm.id }] },
    },
  })
  // 验证频道里确实没有 exec-skills AI
  const members = await prisma.channelMember.findMany({
    where: { channelId: proj.id },
    include: { user: true },
  })
  const execAssistants = members
    .map((m) => m.user)
    .filter((u: any) => u.isAssistant && /write_file|run_command|browser_open/.test(u.skills || ''))
  if (execAssistants.length === 0) ok('频道里 0 个 exec-skills AI(场景前置条件成立)')
  else fail(`频道里有 ${execAssistants.length} 个 exec AI,前置不符`)

  // 模拟用户发消息("构建网站"是 build intent)
  const msg = await prisma.message.create({
    data: {
      channelId: proj.id,
      authorId: kyle.id,
      body: 'Z-请帮我构建英语学习网站',
      type: null,
    } as any,
  })

  // 触发 maybeTriggerAssistants
  if (maybeTriggerAssistantsForTest) {
    await maybeTriggerAssistantsForTest(proj.id, {
      body: msg.body,
      parentId: null,
      authorIsAssistant: false,
      authorId: kyle.id,
      messageId: msg.id,
    })
  }

  // 检查:1) system_no_executor 消息出现 2) trigger 消息 cededBy 含所有 AI 3) audit h2.no_executor_cede
  const sysMsg = await prisma.message.findFirst({
    where: { channelId: proj.id, type: 'system_no_executor' },
  })
  if (sysMsg) ok('频道里出现 type=system_no_executor 系统消息')
  else fail('未找到 system_no_executor 消息')

  const refreshed = await prisma.message.findUnique({ where: { id: msg.id } })
  const cededBy = (refreshed?.cededBy || '') as string
  if (cededBy && cededBy.includes('产品经理 Z')) ok(`触发消息 cededBy 含产品经理(${cededBy.slice(0, 60)})`)
  else fail(`cededBy 不含产品经理:${cededBy || '(空)'}`)

  const audit = await prisma.auditEvent.findFirst({
    where: { type: 'h2.no_executor_cede' },
    orderBy: { createdAt: 'desc' },
  })
  if (audit) ok('AuditEvent: h2.no_executor_cede 已写入')
  else fail('AuditEvent: h2.no_executor_cede 缺失')
}

// ─────────────────────────────────────────────────────────────────────
// 内部函数:加载 maybeTriggerAssistants(不导出时跳过场景 Z 调用路径)
// ─────────────────────────────────────────────────────────────────────
async function loadInternalsForZ(): Promise<{
  maybeTriggerAssistantsForTest: any
  fullMessageIncludeForTest: any
}> {
  const m: any = await import('../src/index.js').catch(() => null)
  return {
    maybeTriggerAssistantsForTest: m?.maybeTriggerAssistants ?? null,
    fullMessageIncludeForTest: m?.fullMessageInclude ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────
// 回归 R:确认 J1 没破坏 Mission 子任务(channelId=null 走 DM 兜底)
// ─────────────────────────────────────────────────────────────────────
async function regressionR() {
  log('— 回归 R:Mission 子任务(channelId=null)不被 J1 拒绝 ──────')
  // 只断言代码路径:J1 改动允许 task.channelId 缺失时走 opts.channelId 或 ensureDM 兜底
  // 实际 Mission 子任务通过 advanceMission → executeTask(无 opts.channelId)→ 走 ensureDM
  // 这里只能静态确认我们的 J1 改动是"task.channelId 优先,缺失才兜底",不会无条件拒绝
  // 通过 grep:确认 executeTask 中有 ensureDM 兜底分支保留
  const fs = await import('node:fs/promises')
  const srcUrl = new URL('../src/index.ts', import.meta.url)
  const src = await fs.readFile(srcUrl, 'utf8')
  if (src.includes('await ensureDM(opts.triggeredById, assistant.id)'))
    ok('executeTask 仍保留 ensureDM 兜底(Mission 子任务不退化)')
  else fail('executeTask ensureDM 兜底分支丢失 — Mission 子任务可能退化')
  if (src.includes("type: 'executeTask.dm_fallback'"))
    ok('dm_fallback audit 记录已加,Mission 路径可追踪')
  else fail('dm_fallback audit 缺失')
}

// ─────────────────────────────────────────────────────────────────────
// 清理:跑完一次性清掉本轮造的数据(避免下次 ensureUser 命中老 stamp)
// 不动其他 smoke 留下的 v3a-* / v2-* 用户
// ─────────────────────────────────────────────────────────────────────
async function cleanup() {
  const stampPrefix = `v3c-${STAMP}`
  const users = await prisma.user.findMany({
    where: { handle: { startsWith: stampPrefix } },
    select: { id: true },
  })
  if (users.length === 0) return
  const userIds = users.map((u) => u.id)
  const channels = await prisma.channelMember.findMany({
    where: { userId: { in: userIds } },
    select: { channelId: true },
  })
  const channelIds = Array.from(new Set(channels.map((c) => c.channelId)))
  await prisma.taskRun.deleteMany({ where: { task: { channelId: { in: channelIds } } } }).catch(() => {})
  await prisma.task.deleteMany({ where: { channelId: { in: channelIds } } }).catch(() => {})
  await prisma.message.deleteMany({ where: { channelId: { in: channelIds } } }).catch(() => {})
  await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => {})
  await prisma.channelMember.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {})
  await prisma.channel.deleteMany({ where: { id: { in: channelIds } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {})
  log(`清理:${userIds.length} 用户 / ${channelIds.length} 频道`)
}

async function main() {
  try {
    await scenarioW()
    await scenarioX()
    await scenarioY()
    await scenarioZ()
    await regressionR()
  } finally {
    await cleanup().catch((e) => log('清理失败:', e))
    await prisma.$disconnect()
  }
  if (failed > 0) {
    log(`\nFAILED: ${failed} 项不通过`)
    process.exit(1)
  } else {
    log('\nPASS: 所有场景通过(含灵魂场景 X)')
  }
}

main().catch((e) => {
  console.error('[v3c-smoke] crashed:', e)
  process.exit(1)
})
