// Runtime Productization 真实端到端 smoke(API + 本地 LLM gemini-2.5-flash + 真实 headless Chrome)。
// 覆盖:A 工作台指派+执行闭环 / B 代码任务沙盒内 write_file+pnpm build(不因 5 轮上限停)/
//       C 报告可见 路径·日志·diff·build/test + apply 写回主项目 / D 浏览器控制打开 localhost 截图存 artifact /
//       E 测试数据清理为 0(SandboxRun/Log/Artifact + .helio/sandboxes + uploads 截图 + 任务/助手)。
// 原则:不造假。所有"通过"以真实 TaskRun/SandboxRun/命令日志/截图文件为依据;跑完清理并校验零残留。
//
// 运行(从 server 目录,使 @prisma/client 解析):
//   pnpm -C server exec tsx ../docs/ai/runtime_prod_smoke.mjs
//
// 前置:server 在 5373;web 在 5173(smoke D 需要);本地 LLM 在 8317。

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..') // helio-clone(脚本在 docs/ai)
// @prisma/client 在 server/node_modules,从 server 锚定解析(本脚本在 docs/ai 无 node_modules)
const reqFromServer = createRequire(resolve(__root, 'server', 'package.json'))
const { PrismaClient } = reqFromServer('@prisma/client')
// DATABASE_URL 来自 server/.env(prisma client 读 process.env)
try {
  if (!process.env.DATABASE_URL) process.loadEnvFile(resolve(__root, 'server', '.env'))
} catch { /* .env 可选;默认 file:./dev.db */ }
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:' + resolve(__root, 'server', 'prisma', 'dev.db')

const prisma = new PrismaClient()
const BASE = 'http://127.0.0.1:5373'
const WEB = 'http://localhost:5173'
const KYLE = 'cmpgn2ana0000nv5lhboxasra'
const MARK = '【RT-PROD-SMOKE】'
const LOCAL = {
  baseUrl: 'http://127.0.0.1:8317/v1',
  apiKey: 'sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd',
  model: 'gemini-2.5-flash',
}
const ROOT = __root // helio-clone
const SANDBOX_ROOT = resolve(ROOT, '.helio', 'sandboxes')
const UPLOAD_DIR = resolve(ROOT, 'server', 'uploads')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function j(path, init) {
  const headers = { 'x-user-id': KYLE, ...(init?.headers || {}), Connection: 'close' }
  if (init?.body) headers['Content-Type'] = 'application/json'
  // 长执行请求(/execute)偶发连接重置(keep-alive 复用)→ 对网络错误重试,不对 HTTP 状态错误重试
  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + '/api' + path, { ...init, headers, keepalive: false })
      const text = await res.text()
      let data
      try { data = JSON.parse(text) } catch { data = text }
      if (!res.ok) throw new Error(`${res.status} ${path} :: ${text.slice(0, 300)}`)
      return data
    } catch (e) {
      // HTTP 状态错误(我们自抛的 `\d{3} ...`)不重试;网络错误(fetch failed)重试
      if (/^\d{3}\s/.test(e.message)) throw e
      lastErr = e
      console.log(`    (网络重试 ${attempt + 1}/4 ${path}: ${e.message}${e.cause ? ' / ' + (e.cause.code || e.cause.message) : ''})`)
      await sleep(1500)
    }
  }
  throw lastErr
}

const created = { assistantIds: [], taskIds: [], runIds: [], sandboxRunIds: [], shots: [] }
let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS ', msg) } else { fail++; console.log('  FAIL ', msg) } }

async function mkAssistant(name, systemPrompt, skills) {
  const a = await j('/assistants', {
    method: 'POST',
    body: JSON.stringify({ name: MARK + name, systemPrompt, ...LOCAL, skills }),
  })
  created.assistantIds.push(a.id)
  return a
}
async function mkTask(title, opts = {}) {
  const t = await j('/tasks', { method: 'POST', body: JSON.stringify({ title: MARK + title, ...opts }) })
  created.taskIds.push(t.id)
  return t
}
// 触发执行:/execute 是长阻塞请求,连接偶发重置或返回 409(已在执行)都不致命 —— 真实结果以轮询报告为准。
async function fireExecute(taskId, input) {
  try {
    return await j(`/tasks/${taskId}/execute`, { method: 'POST', body: JSON.stringify(input ? { input } : {}) })
  } catch (e) {
    if (/^409/.test(e.message) || !/^\d{3}\s/.test(e.message)) {
      console.log(`    (execute 连接重置/已在执行,转轮询: ${e.message})`)
      return null
    }
    throw e
  }
}
async function pollReport(taskId, { timeoutMs = 90000 } = {}) {
  let report, latest
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2000)
    report = await j(`/tasks/${taskId}/report`)
    latest = report.runs[0]
    const sb = report.sandbox?.run?.status ?? '—'
    process.stdout.write(`    run=${latest?.status ?? '—'} sandbox=${sb}\n`)
    if (latest && ['succeeded', 'failed', 'needs_approval', 'needs_review', 'cancelled'].includes(latest.status)) break
  }
  if (latest?.id) { created.runIds.push(latest.id); if (report.sandbox?.run?.id) created.sandboxRunIds.push(report.sandbox.run.id) }
  return { report, latest }
}

// 基线计数(测试数据应用后即删,回到此基线)
let baseline
async function snapshot() {
  return {
    assistants: await prisma.user.count({ where: { isAssistant: true } }),
    tasks: await prisma.task.count(),
    taskRuns: await prisma.taskRun.count(),
    sandboxRun: await prisma.sandboxRun.count(),
    sandboxLog: await prisma.sandboxLog.count(),
    sandboxArtifact: await prisma.sandboxArtifact.count(),
  }
}

try {
  baseline = await snapshot()
  console.log('基线:', JSON.stringify(baseline))
  const sandboxDirsBefore = existsSync(SANDBOX_ROOT) ? readdirSync(SANDBOX_ROOT) : []

  // ============ Smoke A:工作台指派 + 执行闭环(API = UI 按钮所调端点)============
  console.log('\n=== Smoke A:未指派任务 → 推荐执行人 → 指派 → 开始执行 ===')
  const aAsst = await mkAssistant(
    'A-通用助手',
    '你是助手。收到任务用一句话回答即可,可调用 current_datetime 获取当前时间。',
    ['current_datetime'],
  )
  const aTask = await mkTask('用一句话报告现在几点(工作台指派闭环测试)', {
    expectedOutput: '一句话当前时间',
  })
  ok(!aTask.assignee, 'A1 任务初始未指派')
  const suggest = await j(`/tasks/${aTask.id}/suggest-assignee`)
  ok(!!suggest.assistantId, `A2 自动推荐执行人: ${suggest.name ?? suggest.assistantId} (${suggest.reason})`)
  // 指派(UI「指派 AI」下拉所调端点)
  await j(`/tasks/${aTask.id}`, { method: 'PATCH', body: JSON.stringify({ assigneeId: suggest.assistantId }) })
  const aAfter = await j(`/tasks`).then((ts) => ts.find((t) => t.id === aTask.id))
  ok(aAfter?.assignee?.id === suggest.assistantId, 'A3 指派成功(任务已绑定执行人)')
  // 开始执行(UI「开始执行」按钮)
  await fireExecute(aTask.id)
  const aRes = await pollReport(aTask.id, { timeoutMs: 90000 })
  ok(!!aRes.latest?.id, `A4 开始执行,创建 TaskRun: ${aRes.latest?.id}`)
  ok(['succeeded', 'needs_review'].includes(aRes.latest?.status), `A5 执行到终态: ${aRes.latest?.status}`)

  // ============ Smoke B:代码任务沙盒内 write_file + pnpm build,不因 5 轮上限停 ============
  console.log('\n=== Smoke B:代码任务在沙盒内 write_file + pnpm build ===')
  const bAsst = await mkAssistant(
    'B-软件工程师',
    '你是软件工程师,在隔离沙盒里干活。必须真实调用工具,不要只用文字描述:\n' +
      '1) 调用 write_file,path=server/src/__rtsmoke__.ts,content 为 `export const RT_SMOKE = 42`\n' +
      '2) 调用 run_command 运行 `pnpm -C server build` 验证能编译\n' +
      '3) 再调用 run_command 运行 `node -e "console.log(require(\\"./server/dist/__rtsmoke__.js\\").RT_SMOKE)"` 或 `cat server/src/__rtsmoke__.ts` 确认\n' +
      '最后用一句话报告 build 的退出码。',
    ['write_file', 'run_command'],
  )
  const bTask = await mkTask('在沙盒里新建 server/src/__rtsmoke__.ts 并跑 pnpm -C server build 验证', {
    assigneeId: bAsst.id,
    expectedOutput: '__rtsmoke__.ts 写入 + build 退出码',
  })
  await fireExecute(bTask.id)
  const bRes = await pollReport(bTask.id, { timeoutMs: 180000 })
  const bSb = bRes.report.sandbox
  ok(!!bSb, 'B1 创建了 SandboxRun(代码类任务)')
  const toolNames = (bRes.report.toolCalls || []).map((t) => t.tool)
  ok(toolNames.includes('write_file'), `B2 调用了 write_file(工具调用: ${[...new Set(toolNames)].join(',')})`)
  const changed = bSb?.run?.changedFiles ? JSON.parse(bSb.run.changedFiles) : []
  ok(changed.some((f) => f.path.includes('__rtsmoke__.ts')), `B3 沙盒 diff 含新增文件 __rtsmoke__.ts(${bSb?.run?.diffSummary})`)
  const buildCmd = (bSb?.logs || []).find((l) => /pnpm.*build/.test(l.command || ''))
  ok(!!buildCmd, `B4 沙盒内真实执行了 pnpm build(exit ${buildCmd?.exitCode}, ${buildCmd?.durationMs}ms)`)
  ok((bRes.report.toolCalls || []).length > 5 || ['succeeded', 'needs_review'].includes(bRes.latest?.status),
    `B5 未因 5 轮工具上限停止(工具调用 ${bRes.report.toolCalls?.length} 次,状态 ${bRes.latest?.status})`)
  ok(!/工具调用轮数过多,已停止/.test(bRes.latest?.output || ''), 'B6 输出不是旧的「工具调用轮数过多,已停止」')

  // ============ Smoke C:报告可见 路径/日志/diff/build·test + apply 写回主项目 ============
  console.log('\n=== Smoke C:报告可见性 + apply 写回主项目 ===')
  ok(/\.helio\/sandboxes\//.test(bSb?.run?.workspacePath || ''), `C1 报告含沙盒 workspace 路径`)
  ok((bSb?.logs || []).some((l) => l.type === 'command'), 'C2 报告含命令日志')
  ok((bSb?.logs || []).some((l) => l.type === 'diff'), 'C3 报告含 diff 日志')
  ok(!!bSb?.run?.diffSummary, `C4 报告含 diff 摘要: ${bSb?.run?.diffSummary}`)
  ok(bSb?.run?.buildResult != null, `C5 报告含 build/test 结果: ${bSb?.run?.buildResult}`)
  // apply:把沙盒变更写回主项目(仅 ready_for_review 可应用)
  const mainFile = resolve(ROOT, 'server', 'src', '__rtsmoke__.ts')
  let applied = false
  if (bSb?.run?.status === 'ready_for_review') {
    const ap = await j(`/task-runs/${bRes.latest.id}/apply`, { method: 'POST', body: JSON.stringify({}) })
    applied = ap.applied?.some((p) => p.includes('__rtsmoke__.ts'))
    ok(applied && existsSync(mainFile), `C6 apply 写回主项目(server/src/__rtsmoke__.ts 出现): applied=${JSON.stringify(ap.applied)}`)
    // 立即清理 apply 写入的主项目文件(不污染仓库)
    if (existsSync(mainFile)) rmSync(mainFile)
    ok(!existsSync(mainFile), 'C7 已清理 apply 写入主项目的测试文件')
  } else {
    ok(false, `C6 沙盒未到 ready_for_review(实际 ${bSb?.run?.status}),无法测 apply`)
  }

  // ============ Smoke D:浏览器控制打开 localhost 截图存 artifact ============
  console.log('\n=== Smoke D:浏览器控制打开 http://localhost:5173 截图 ===')
  // 先确认 web 在 5173
  let webUp = false
  try { webUp = (await fetch(WEB + '/', { signal: AbortSignal.timeout(3000) })).ok } catch { webUp = false }
  if (!webUp) {
    ok(false, 'D0 web 未在 http://localhost:5173 运行(请先 pnpm -C web dev),跳过 Smoke D')
  } else {
    const dAsst = await mkAssistant(
      'D-验收工程师',
      '你是负责验证交付的工程师,可控制本地浏览器。必须真实调用工具,不要只描述:\n' +
        '1) 调用 browser_open,url=http://localhost:5173\n' +
        '2) 调用 browser_screenshot,label="工作台首页"\n' +
        '3) 调用 browser_console 检查有无报错\n' +
        '最后用一句话报告页面是否正常打开、有无 console 错误。',
      ['browser_open', 'browser_screenshot', 'browser_console'],
    )
    const dTask = await mkTask('打开本地工作台 http://localhost:5173 截图验收并检查 console', {
      assigneeId: dAsst.id,
      expectedOutput: '截图 + console 检查结论',
    })
    await fireExecute(dTask.id)
    const dRes = await pollReport(dTask.id, { timeoutMs: 150000 })
    const dSb = dRes.report.sandbox
    ok(!!dSb, 'D1 创建了 SandboxRun(浏览器类任务)')
    const shotArtifacts = (dSb?.artifacts || []).filter((a) => a.kind === 'screenshot' && a.path)
    ok(shotArtifacts.length > 0, `D2 生成了截图 artifact: ${shotArtifacts.map((s) => s.path).join(',')}`)
    for (const s of shotArtifacts) {
      const f = resolve(UPLOAD_DIR, (s.path || '').replace(/^\/uploads\//, ''))
      created.shots.push(f)
      ok(existsSync(f) && statSync(f).size > 0, `D3 截图文件真实存在且非空: ${s.path} (${existsSync(f) ? statSync(f).size : 0} 字节)`)
    }
    const browserLogs = (dSb?.logs || []).filter((l) => l.type === 'browser')
    ok(browserLogs.length > 0, `D4 有浏览器动作日志 ${browserLogs.length} 条(${browserLogs.map((l) => l.command).join(' / ')})`)
    ok(browserLogs.some((l) => /browser_open/.test(l.command || '')), 'D5 日志含 browser_open')
  }

  // ============ Smoke E:清理 + 校验零残留 ============
  console.log('\n=== Smoke E:清理测试数据并校验零残留 ===')
  // 丢弃仍存在的测试沙盒(删隔离目录),再删 DB 行
  for (const runId of created.runIds) {
    try { await j(`/task-runs/${runId}/discard`, { method: 'POST', body: JSON.stringify({}) }) } catch { /* 已 apply/discard */ }
  }
  // 删测试截图文件
  for (const f of created.shots) if (existsSync(f)) rmSync(f)
  // 删 DB:SandboxArtifact/Log/Run(按 taskId)、ApprovalRequest、AuditEvent、TaskRun、Message、ReadCursor、Task、助手
  const taskIds = created.taskIds
  const srRows = await prisma.sandboxRun.findMany({ where: { taskId: { in: taskIds } }, select: { id: true, rootPath: true } })
  const srIds = srRows.map((r) => r.id)
  // 物理删除残留沙盒目录(若 discard 未覆盖)
  for (const r of srRows) {
    if (r.rootPath && r.rootPath.includes('/.helio/sandboxes/') && existsSync(r.rootPath)) rmSync(r.rootPath, { recursive: true, force: true })
  }
  await prisma.sandboxArtifact.deleteMany({ where: { sandboxRunId: { in: srIds } } })
  await prisma.sandboxLog.deleteMany({ where: { sandboxRunId: { in: srIds } } })
  await prisma.sandboxRun.deleteMany({ where: { taskId: { in: taskIds } } })
  await prisma.approvalRequest.deleteMany({ where: { taskId: { in: taskIds } } })
  await prisma.auditEvent.deleteMany({ where: { taskId: { in: taskIds } } })
  // TaskRun → 关联的 DM channel/messages 也清:先找 run 的 channelId
  const runs = await prisma.taskRun.findMany({ where: { taskId: { in: taskIds } }, select: { id: true, channelId: true } })
  const chIds = [...new Set(runs.map((r) => r.channelId).filter(Boolean))]
  await prisma.taskRun.deleteMany({ where: { taskId: { in: taskIds } } })
  // 删测试任务
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } })
  // 删测试助手产生的 DM 频道(执行对话):仅删只含测试助手的 DM
  for (const chId of chIds) {
    try {
      await prisma.message.deleteMany({ where: { channelId: chId } })
      await prisma.readCursor.deleteMany({ where: { channelId: chId } })
      await prisma.channelMember.deleteMany({ where: { channelId: chId } })
      await prisma.channel.delete({ where: { id: chId } })
    } catch { /* 频道可能被复用,跳过 */ }
  }
  // 删测试助手(及其成员关系/消息由上面 DM 清理覆盖大部分;助手本身)
  for (const aid of created.assistantIds) {
    try { await j(`/assistants/${aid}`, { method: 'DELETE' }) } catch { /* fallback prisma */ }
  }
  await prisma.user.deleteMany({ where: { id: { in: created.assistantIds } } })

  // 校验:测试数据零残留 + 回到基线
  const after = await snapshot()
  const markTasks = await prisma.task.count({ where: { title: { contains: MARK } } })
  const markAsst = await prisma.user.count({ where: { name: { contains: MARK } } })
  const leftSr = await prisma.sandboxRun.count({ where: { taskId: { in: taskIds } } })
  const sandboxDirsAfter = existsSync(SANDBOX_ROOT) ? readdirSync(SANDBOX_ROOT) : []
  const newDirs = sandboxDirsAfter.filter((d) => !sandboxDirsBefore.includes(d))
  const leftoverDirs = newDirs.filter((d) => existsSync(resolve(SANDBOX_ROOT, d)))
  const leftShots = created.shots.filter((f) => existsSync(f))

  ok(markTasks === 0, `E1 无 MARK 测试任务残留(${markTasks})`)
  ok(markAsst === 0, `E2 无 MARK 测试助手残留(${markAsst})`)
  ok(leftSr === 0, `E3 测试 SandboxRun/Log/Artifact 已清(本测试 taskId 关联 SandboxRun=${leftSr})`)
  ok(leftoverDirs.length === 0, `E4 .helio/sandboxes 无测试残留目录(新增残留: ${leftoverDirs.join(',') || '无'})`)
  ok(leftShots.length === 0, `E5 uploads 无测试截图残留(${leftShots.length})`)
  ok(after.tasks === baseline.tasks && after.assistants === baseline.assistants,
    `E6 任务/助手计数回到基线(tasks ${baseline.tasks}→${after.tasks}, assistants ${baseline.assistants}→${after.assistants})`)
  ok(after.sandboxRun === baseline.sandboxRun && after.sandboxLog === baseline.sandboxLog && after.sandboxArtifact === baseline.sandboxArtifact,
    `E7 沙盒表回到基线(Run ${baseline.sandboxRun}→${after.sandboxRun}, Log ${baseline.sandboxLog}→${after.sandboxLog}, Artifact ${baseline.sandboxArtifact}→${after.sandboxArtifact})`)

  console.log(`\n==== 结果: ${pass} PASS / ${fail} FAIL ====`)
  await prisma.$disconnect()
  process.exit(fail === 0 ? 0 : 1)
} catch (e) {
  console.error('\nSMOKE 异常:', e.message)
  // 尽力清理
  try {
    for (const aid of created.assistantIds) await prisma.user.deleteMany({ where: { id: aid } }).catch(() => {})
    for (const tid of created.taskIds) await prisma.task.deleteMany({ where: { id: tid } }).catch(() => {})
  } catch { /* ignore */ }
  await prisma.$disconnect()
  process.exit(1)
}
