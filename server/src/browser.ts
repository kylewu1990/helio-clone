// Browser Control(本地验证用)—— 用 headless Chrome 经 CDP(Chrome DevTools Protocol)
// 驱动一个隔离的浏览器,用于「写完程序后验证 UI」:打开本地页面、截图、读取 console、点击/输入。
//
// 诚实边界:
//   - 这是「浏览器控制」,不是「电脑控制」:只驱动一个独立 headless 浏览器进程,不碰你的桌面/全局键鼠。
//   - 默认只允许 localhost / 127.0.0.1 / file:// 等本地地址;外站需调用方人工批准后才放行。
//   - 不安装任何重依赖:用 Node 内置全局 WebSocket(Node 22+)直连 CDP,Chrome 用系统已装的。
//   - 每个动作由调用方(skills.ts)写 SandboxLog/AuditEvent,截图存为 artifact。

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'

// 截图落盘目录(= index.ts 的 UPLOAD_DIR,server/uploads,可经 /uploads 访问)
const UPLOAD_DIR = resolve(process.cwd(), 'uploads')

// 系统 Chrome / Edge / Chromium 可执行文件候选(可用 HELIO_CHROME 覆盖)
const CHROME_CANDIDATES = [
  process.env.HELIO_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[]

function findChrome(): string | null {
  for (const c of CHROME_CANDIDATES) if (c && existsSync(c)) return c
  return null
}

export function browserAvailable(): boolean {
  return findChrome() !== null && typeof WebSocket === 'function'
}

// 仅本地地址放行(其余需调用方人工批准)
export function isLocalUrl(url: string): boolean {
  const u = url.trim()
  if (/^file:\/\//i.test(u)) return true
  try {
    const parsed = new URL(u)
    if (!/^https?:$/.test(parsed.protocol)) return false
    const h = parsed.hostname.toLowerCase()
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h === '[::1]' ||
      h.endsWith('.localhost')
    )
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => res(port))
    })
  })
}

export type ConsoleMsg = { level: string; text: string; ts: number }

// 一个 CDP 连接(连到某个 page target),带 id/响应配对与事件累积。
class CdpSession {
  private ws: WebSocket
  private nextId = 0
  private pending = new Map<number, { res: (v: any) => void; rej: (e: any) => void }>()
  console: ConsoleMsg[] = []

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.onmessage = (ev: MessageEvent) => this.onMessage(String(ev.data))
  }

  static async connect(wsUrl: string): Promise<CdpSession> {
    const ws = new WebSocket(wsUrl)
    await new Promise<void>((res, rej) => {
      ws.onopen = () => res()
      ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'))
    })
    const s = new CdpSession(ws)
    await s.send('Page.enable')
    await s.send('Runtime.enable')
    await s.send('Log.enable').catch(() => {})
    return s
  }

  private onMessage(data: string) {
    let m: any
    try {
      m = JSON.parse(data)
    } catch {
      return
    }
    if (m.id && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!
      this.pending.delete(m.id)
      if (m.error) p.rej(new Error(m.error.message || 'CDP error'))
      else p.res(m.result)
      return
    }
    // 事件:累积 console / 异常 / 日志
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params?.args ?? [])
        .map((a: any) => (a.value !== undefined ? String(a.value) : a.description ?? a.type))
        .join(' ')
      this.pushConsole(m.params?.type ?? 'log', args)
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params?.exceptionDetails
      this.pushConsole('error', d?.exception?.description ?? d?.text ?? 'exception')
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params?.entry
      if (e) this.pushConsole(e.level ?? 'log', e.text ?? '')
    }
  }

  private pushConsole(level: string, text: string) {
    this.console.push({ level, text: String(text).slice(0, 2000), ts: Date.now() })
    if (this.console.length > 300) this.console.shift()
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.nextId
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      try {
        this.ws.send(JSON.stringify({ id, method, params }))
      } catch (e) {
        this.pending.delete(id)
        rej(e)
      }
      // 单条命令超时保护
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          rej(new Error(`CDP ${method} 超时`))
        }
      }, 30_000)
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

// 进程内单例浏览器 + 单页会话
let chromeProc: ChildProcess | null = null
let chromePort = 0
let session: CdpSession | null = null
let currentUrl = ''
let chromeProfile = '' // 本次启动的独立 profile 目录(退出时清理)
let chromeExited = false // 本次进程是否已退出(profile 锁/崩溃 → 快速失败)

// 每次启动用「独立临时 profile」:共用同一 user-data-dir 时,后启的 Chrome 会把请求交给
// 已存在的实例后自行退出、不开 DevTools 端点(经典「端点未就绪」根因)。一机一 profile 即可避免争用。
async function ensureChrome(): Promise<void> {
  if (chromeProc && !chromeProc.killed && !chromeExited && session) return
  // 残留的半死会话先清干净,避免引用到已退出的进程
  if (chromeProc || session) await browserClose().catch(() => {})
  const bin = findChrome()
  if (!bin) throw new Error('未找到本机 Chrome/Edge/Chromium 可执行文件(可设 HELIO_CHROME 指定路径)')
  if (typeof WebSocket !== 'function')
    throw new Error('当前 Node 运行时无内置 WebSocket(需 Node 22+)')

  chromePort = await freePort()
  chromeProfile = resolve(process.cwd(), '..', '.helio', 'browser-profiles', randomUUID())
  await mkdir(chromeProfile, { recursive: true })
  chromeExited = false
  const launchedProfile = chromeProfile
  chromeProc = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--window-size=1280,860',
      `--remote-debugging-port=${chromePort}`,
      `--user-data-dir=${launchedProfile}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  )
  chromeProc.on('exit', () => {
    chromeProc = null
    session = null
    chromeExited = true
    // 退出即清理该实例的临时 profile(best-effort)
    void rm(launchedProfile, { recursive: true, force: true }).catch(() => {})
  })

  // 等 DevTools 端点就绪,拿到一个 page target(进程若中途退出则快速失败,不空等 9s)
  let pageWsUrl = ''
  for (let i = 0; i < 60; i++) {
    if (chromeExited) break
    try {
      const list = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()) as any[]
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        pageWsUrl = page.webSocketDebuggerUrl
        break
      }
    } catch {
      /* 端点未就绪 */
    }
    await sleep(150)
  }
  if (!pageWsUrl) {
    await browserClose().catch(() => {})
    throw new Error(
      chromeExited
        ? 'Chrome 启动后立即退出(profile 被占用或被系统拦截);已切换独立 profile 重试仍失败,请检查本机 Chrome 是否可用'
        : 'Chrome DevTools 端点未就绪(超时);请确认本机 Chrome 可正常以 --headless 启动',
    )
  }
  session = await CdpSession.connect(pageWsUrl)
}

export type BrowserOpenResult = {
  ok: boolean
  url: string
  title?: string
  status?: number
  error?: string
}

// 打开页面(本地放行;外站由调用方在放行后才调用本函数)。导航后等待 load 或超时。
export async function browserOpen(url: string): Promise<BrowserOpenResult> {
  try {
    await ensureChrome()
    if (!session) throw new Error('浏览器会话未建立')
    session.console = [] // 新页面清空 console 缓冲
    await session.send('Page.navigate', { url })
    // 等待 load(轮询 document.readyState),最长约 8s
    let title = ''
    for (let i = 0; i < 40; i++) {
      await sleep(200)
      try {
        const r = await session.send('Runtime.evaluate', {
          expression: 'JSON.stringify({ s: document.readyState, t: document.title })',
          returnByValue: true,
        })
        const parsed = JSON.parse(r?.result?.value ?? '{}')
        title = parsed.t ?? ''
        if (parsed.s === 'complete') break
      } catch {
        /* 继续等 */
      }
    }
    currentUrl = url
    return { ok: true, url, title }
  } catch (e) {
    return { ok: false, url, error: (e as Error).message }
  }
}

// 截图当前页面,落盘到 uploads,返回可访问 url + 绝对路径。
export async function browserScreenshot(label?: string): Promise<{
  ok: boolean
  url?: string
  path?: string
  bytes?: number
  error?: string
}> {
  try {
    if (!session) throw new Error('请先 browser_open 打开一个页面')
    const r = await session.send('Page.captureScreenshot', { format: 'png' })
    const b64 = r?.data
    if (!b64) throw new Error('截图为空')
    const buf = Buffer.from(b64, 'base64')
    await mkdir(UPLOAD_DIR, { recursive: true })
    const name = `bshot-${randomUUID()}.png`
    await writeFile(resolve(UPLOAD_DIR, name), buf)
    return { ok: true, url: `/uploads/${name}`, path: resolve(UPLOAD_DIR, name), bytes: buf.length }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// 读取当前页面已收集的 console / 错误(自最近一次 open 起)。
export async function browserConsole(): Promise<{ ok: boolean; messages: ConsoleMsg[]; error?: string }> {
  if (!session) return { ok: false, messages: [], error: '请先 browser_open 打开一个页面' }
  return { ok: true, messages: session.console.slice(-80) }
}

// 点击元素(优先 CSS selector;否则按可见文本匹配第一个含该文本的可点击元素)。
export async function browserClick(opts: { selector?: string; text?: string }): Promise<{
  ok: boolean
  matched?: boolean
  error?: string
}> {
  try {
    if (!session) throw new Error('请先 browser_open 打开一个页面')
    const expr = opts.selector
      ? `(()=>{const el=document.querySelector(${JSON.stringify(opts.selector)});if(!el)return false;el.scrollIntoView();el.click();return true;})()`
      : `(()=>{const t=${JSON.stringify(opts.text ?? '')};const els=[...document.querySelectorAll('a,button,[role=button],input[type=submit],input[type=button],summary,li,span,div')];const el=els.find(e=>(e.innerText||e.value||'').trim().includes(t));if(!el)return false;el.scrollIntoView();el.click();return true;})()`
    const r = await session.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    return { ok: true, matched: !!r?.result?.value }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// 在输入框输入文本(CSS selector 定位;设置 value 并派发 input/change 事件)。
export async function browserType(opts: { selector: string; text: string }): Promise<{
  ok: boolean
  matched?: boolean
  error?: string
}> {
  try {
    if (!session) throw new Error('请先 browser_open 打开一个页面')
    const expr = `(()=>{const el=document.querySelector(${JSON.stringify(opts.selector)});if(!el)return false;el.focus();el.value=${JSON.stringify(opts.text)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`
    const r = await session.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    return { ok: true, matched: !!r?.result?.value }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function browserStatus() {
  return { running: !!chromeProc && !!session, url: currentUrl, port: chromePort }
}

export async function browserClose(): Promise<void> {
  session?.close()
  session = null
  if (chromeProc && !chromeProc.killed) {
    try {
      chromeProc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
  chromeProc = null
  // 兜底清理本次的独立临时 profile(exit handler 也会清,这里防止漏)
  if (chromeProfile) {
    const p = chromeProfile
    chromeProfile = ''
    void rm(p, { recursive: true, force: true }).catch(() => {})
  }
}
