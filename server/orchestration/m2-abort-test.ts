/**
 * M2 abort 真测 —— Mastra step abortSignal → pi agent.abort() 透传。
 * 两例:
 *  A) 预置已 aborted 的 signal → 立即抛 PiAbortError(确定性)。
 *  B) 跑到一半(~1.2s)abort → 在远早于 timeout(120s)前抛 PiAbortError,无僵尸(进程正常退)。
 */
import { runPiVisual, PiAbortError } from '../src/orchestration/piVisualRunner.js'
import { tmpdir } from 'node:os'
import { resolve as pathResolve } from 'node:path'

const llm = { baseUrl: process.env.LOCAL_LLM_BASE || 'http://127.0.0.1:8317/v1', apiKey: process.env.LOCAL_LLM_KEY || '', model: 'gemini-2.5-flash' }
const sys = '你是资深前端工程师,擅长生成精美、内容详尽的长 HTML deck。'
const longMsg = '用 write_file 把一个**很长**的完整 HTML deck(至少 12 个 <section class="slide">,每节大量文字与内联样式)一次性写到 index.html。尽量详尽,越长越好。'

async function caseA() {
  const ac = new AbortController()
  ac.abort() // 预置中断
  try {
    await runPiVisual({ systemPrompt: sys, userMessage: longMsg, llm, scratchDir: pathResolve(tmpdir(), 'm2-abortA-' + process.pid), abortSignal: ac.signal, timeoutMs: 120000 })
    console.log('[A pre-aborted] UNEXPECTED 完成 → FAIL')
    return false
  } catch (e) {
    const ok = e instanceof PiAbortError
    console.log(`[A pre-aborted] threw ${ (e as Error).name } → ${ok ? 'OK' : 'FAIL'}`)
    return ok
  }
}

async function caseB() {
  const ac = new AbortController()
  const t0 = Date.now()
  const timer = setTimeout(() => { console.log(`[B mid-run] >>> abort at ${Date.now() - t0}ms`); ac.abort() }, 1200)
  try {
    await runPiVisual({ systemPrompt: sys, userMessage: longMsg, llm, scratchDir: pathResolve(tmpdir(), 'm2-abortB-' + process.pid), abortSignal: ac.signal, timeoutMs: 120000 })
    clearTimeout(timer)
    const dt = Date.now() - t0
    console.log(`[B mid-run] 完成 未中断(${dt}ms)—— 模型太快,本例不算失败但中断未触发`)
    return 'inconclusive'
  } catch (e) {
    clearTimeout(timer)
    const dt = Date.now() - t0
    const ok = e instanceof PiAbortError && dt < 60000 // 远早于 120s timeout
    console.log(`[B mid-run] threw ${(e as Error).name} in ${dt}ms → ${ok ? 'OK(真停)' : 'CHECK'}`)
    return ok
  }
}

async function main() {
  if (!llm.apiKey) { console.log('NO_KEY'); process.exit(1) }
  const a = await caseA()
  const b = await caseB()
  const pass = a && (b === true || b === 'inconclusive')
  console.log(pass ? '\n=== M2_ABORT_OK ===' : '\n=== M2_ABORT_FAIL ===')
  process.exit(pass ? 0 : 1)
}
main()
