// 沙盒运行时真实端到端 smoke(API + 本地 LLM)。
// 证明完整接线:executeTask → 创建 SandboxRun → run_command 在沙盒 cwd 执行 → 收尾 diff/build →
// 报告聚合 sandbox → apply/discard。结束清理测试助手/任务,并丢弃沙盒目录。
//
// 运行: node docs/ai/sandbox_e2e.mjs

const BASE = 'http://127.0.0.1:5373'
const KYLE = 'cmpgn2ana0000nv5lhboxasra' // 真人用户(seed: kyle)
const H = { 'x-user-id': KYLE, 'Content-Type': 'application/json' }
const MARK = '【SANDBOX-E2E】'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function j(path, init) {
  // 空 body 的 POST 不带 JSON content-type,避免 Fastify 空 body 报错(对齐前端 api.ts)
  const headers = { 'x-user-id': KYLE, ...(init?.headers || {}) }
  if (init?.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + '/api' + path, { ...init, headers })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${res.status} ${path} :: ${text.slice(0, 300)}`)
  return data
}

let assistantId, taskId
try {
  // 1) 创建指向本地 LLM、带 run_command 的测试助手
  const asst = await j('/assistants', {
    method: 'POST',
    body: JSON.stringify({
      name: MARK + '沙盒工程师',
      systemPrompt:
        '你是执行命令的工程师。收到任务后必须调用 run_command 工具实际执行命令(先 pwd 再 ls -la),' +
        '然后用一句话报告当前工作目录路径。不要只用文字描述,必须真的调用工具。',
      baseUrl: 'http://127.0.0.1:8317/v1',
      apiKey: 'sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd',
      model: 'gemini-2.5-flash',
      skills: ['run_command'],
    }),
  })
  assistantId = asst.id
  console.log('创建助手:', asst.name, asst.id)

  // 2) 创建命令类任务并指派
  const task = await j('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: MARK + '在沙盒里运行 pwd 和 ls -la,报告当前工作目录',
      assigneeId: assistantId,
      expectedOutput: '当前工作目录路径(应在 .helio/sandboxes/<runId>/workspace)',
    }),
  })
  taskId = task.id
  console.log('创建任务:', task.id)

  // 3) 开始执行
  const exec = await j(`/tasks/${taskId}/execute`, { method: 'POST', body: JSON.stringify({}) })
  console.log('execute 返回:', JSON.stringify(exec))

  // 4) 轮询报告直到 run 终态
  let report, latest
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    report = await j(`/tasks/${taskId}/report`)
    latest = report.runs[0]
    const sbStatus = report.sandbox?.run?.status ?? '—'
    process.stdout.write(`  [${i}] run=${latest?.status ?? '—'} sandbox=${sbStatus}\n`)
    if (latest && ['succeeded', 'failed', 'needs_approval', 'cancelled'].includes(latest.status)) break
  }

  console.log('\n=== 执行结果 ===')
  console.log('TaskRun 状态:', latest?.status)
  console.log('AI 汇报:', (latest?.output || latest?.error || '').slice(0, 300))
  const sb = report.sandbox
  if (!sb) {
    console.log('!! 未生成 SandboxRun(异常:命令类任务应建沙盒)')
  } else {
    console.log('SandboxRun:', sb.run.id, 'status=', sb.run.status, 'mode=', sb.run.mode)
    console.log('workspacePath:', sb.run.workspacePath.replace(/^.*\/\.helio\//, '.helio/'))
    console.log('diffSummary:', sb.run.diffSummary, '| buildResult:', sb.run.buildResult)
    const cmds = sb.logs.filter((l) => l.type === 'command')
    console.log(`命令日志 ${cmds.length} 条:`)
    for (const c of cmds) {
      const inWs = (c.content || '').includes('/.helio/sandboxes/') || (c.cwd || '').includes('/.helio/sandboxes/')
      console.log(`  $ ${c.command}  [exit ${c.exitCode}, ${c.durationMs}ms]${inWs ? '  cwd∈sandbox' : ''}`)
      console.log('    out:', (c.content || '').replace(/\n/g, ' ').slice(0, 160))
    }
    // 验证 cwd 在沙盒
    const pwdLog = cmds.find((c) => /\bpwd\b/.test(c.command || ''))
    if (pwdLog) {
      const ok = (pwdLog.content || '').includes('/.helio/sandboxes/') && (pwdLog.content || '').includes('/workspace')
      console.log(ok ? 'PASS  pwd 输出在沙盒 workspace' : 'WARN  pwd 输出未含沙盒路径')
    }
  }

  // 5) 清理:丢弃沙盒目录(若存在),删除测试任务与助手
  console.log('\n=== 清理 ===')
  if (latest?.id && sb && sb.run.status !== 'discarded' && sb.run.status !== 'applied') {
    try {
      await j(`/task-runs/${latest.id}/discard`, { method: 'POST' })
      console.log('已丢弃沙盒(API discard)')
    } catch (e) {
      console.log('discard 跳过:', e.message)
    }
  }
  await j(`/tasks/${taskId}`, { method: 'DELETE' }).catch(() => {})
  await j(`/assistants/${assistantId}`, { method: 'DELETE' }).catch(() => {})
  console.log('已删除测试任务与测试助手')
} catch (e) {
  console.error('E2E 失败:', e.message)
  // 尽力清理
  if (taskId) await j(`/tasks/${taskId}`, { method: 'DELETE' }).catch(() => {})
  if (assistantId) await j(`/assistants/${assistantId}`, { method: 'DELETE' }).catch(() => {})
  process.exit(1)
}
