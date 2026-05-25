// 真实端到端:write_file 写沙盒 → 报告 ready_for_review → 人工 apply 写回主项目 + AuditEvent。
// 运行: node docs/ai/sandbox_e2e_apply.mjs
import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = 'http://127.0.0.1:5373'
const KYLE = 'cmpgn2ana0000nv5lhboxasra'
const MARK = '【SANDBOX-E2E-APPLY】'
const ROOT = resolve(process.cwd())
const DEMO = 'docs/ai/__e2e_apply_demo__.md'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function j(path, init) {
  const headers = { 'x-user-id': KYLE }
  if (init?.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + '/api' + path, { ...init, headers })
  const t = await res.text()
  let d; try { d = JSON.parse(t) } catch { d = t }
  if (!res.ok) throw new Error(`${res.status} ${path} :: ${t.slice(0, 300)}`)
  return d
}

let assistantId, taskId, runId
try {
  const asst = await j('/assistants', { method: 'POST', body: JSON.stringify({
    name: MARK + '写文件工程师',
    systemPrompt: `你是改代码的工程师。任务要求创建文件时,必须调用 write_file 工具在沙盒里写入,路径用 ${DEMO},内容写一行 Markdown 标题“# E2E apply demo”。只调用一次 write_file,然后用一句话汇报。`,
    baseUrl: 'http://127.0.0.1:8317/v1',
    apiKey: 'sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd',
    model: 'gemini-2.5-flash',
    skills: ['write_file', 'run_command'],
  }) })
  assistantId = asst.id
  const task = await j('/tasks', { method: 'POST', body: JSON.stringify({
    title: MARK + `用 write_file 在沙盒创建 ${DEMO}`,
    assigneeId: assistantId,
  }) })
  taskId = task.id
  const exec = await j(`/tasks/${taskId}/execute`, { method: 'POST', body: JSON.stringify({}) })
  console.log('execute:', JSON.stringify(exec))

  let report, latest
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    report = await j(`/tasks/${taskId}/report`)
    latest = report.runs[0]
    console.log(`  [${i}] run=${latest?.status} sandbox=${report.sandbox?.run?.status}`)
    if (latest && ['succeeded','failed','needs_approval','cancelled'].includes(latest.status)) break
  }
  runId = latest?.id
  const sb = report.sandbox
  console.log('AI 汇报:', (latest?.output||'').slice(0,200))
  console.log('sandbox:', sb?.run?.status, '| changed:', sb?.run?.changedFiles, '| build:', sb?.run?.buildResult)
  const wroteInSandbox = existsSync(resolve(ROOT, '.helio/sandboxes', sb?.run?.id || 'x', 'workspace', DEMO))
  console.log(wroteInSandbox ? 'PASS  文件已写入沙盒 workspace' : 'WARN  沙盒内未见目标文件')
  console.log('apply 前主项目存在该文件?', existsSync(resolve(ROOT, DEMO)) ? 'YES(异常)' : 'NO(正确:批准前不改主项目)')

  // 人工 apply
  if (sb?.run?.status === 'ready_for_review') {
    const ap = await j(`/task-runs/${runId}/apply`, { method: 'POST' })
    console.log('apply 结果:', JSON.stringify(ap))
    const onMain = existsSync(resolve(ROOT, DEMO))
    console.log(onMain ? 'PASS  apply 后文件已写回主项目' : 'FAIL  apply 后主项目未见文件')
    if (onMain) console.log('  内容:', (await readFile(resolve(ROOT, DEMO),'utf8')).trim())
    // 校验 AuditEvent
    const r2 = await j(`/tasks/${taskId}/report`)
    const hasAudit = r2.audit.some((e) => e.type === 'sandbox.applied')
    console.log(hasAudit ? 'PASS  写入 AuditEvent(sandbox.applied)' : 'FAIL  缺少 sandbox.applied 审计')
    console.log('  apply 后任务状态:', r2.task.status, '(应为 review)')
  } else {
    console.log('SKIP apply(sandbox 非 ready_for_review)')
  }
} catch (e) {
  console.error('E2E-APPLY 失败:', e.message)
} finally {
  // 清理:删主项目里被 apply 的演示文件 + 测试数据 + 沙盒目录
  try { await rm(resolve(ROOT, DEMO), { force: true }) } catch {}
  if (runId) await j(`/task-runs/${runId}/discard`, { method: 'POST' }).catch(()=>{})
  if (taskId) await j(`/tasks/${taskId}`, { method: 'DELETE' }).catch(()=>{})
  if (assistantId) await j(`/assistants/${assistantId}`, { method: 'DELETE' }).catch(()=>{})
  console.log('已清理主项目演示文件 + 测试任务/助手(DB 行将由 _cleanup 脚本按 marker 清)')
}
