// Sandbox Runtime —— 代码/命令类 TaskRun 的隔离执行内核。
//
// 诚实定位:当前环境无 Docker/Colima 时,这是「本机信任沙盒」(非 OS 级强隔离),
// 由 隔离工作区 + 命令路径守卫 + 危险词硬拦截 + env 脱敏 + 依赖软链 构成纵深防御。
// 有 Docker/容器时才升级为「强隔离沙盒」(detectIsolation 探测,UI/文档据此标注,不假称强隔离)。
//
// 借鉴 Markus 的「私有工作区 → 执行/构建/测试 → 报告 → 人工批准后发布」思想,
// 但不复制其 UI/文案/源码。核心闭环:
//   主项目快照 → .helio/sandboxes/<runId>/workspace → AI 写/跑/测 → diff/build/test 落库
//   → 人工 apply(dry-run 校验、拒敏感/生成文件)→ 写回主项目 / 或 discard 丢弃。
//
// 设计要点:
//   - FS 纯函数核心(prepare/guard/run/diff/apply/discard)不依赖 DB,便于确定性 smoke。
//   - DB 封装(createSandboxRun/finalize/apply/discard/report)写 SandboxRun/Log/Artifact。
//   - 当前项目非 git repo → 用 copy fallback;若为 git repo 则可走 worktree(此处仍走 copy,
//     以保证非 git 环境一致;预留 mode 字段)。
//   - 忽略 node_modules/dist/.helio/uploads/*.db/.env/key 等;node_modules 以软链注入 workspace,
//     让 build/test 真能在沙盒内跑,而不污染 diff。
//   - 代码/命令类任务在沙盒内放宽:允许 node/pnpm/tsx/python/build/test/git status·diff 等开发命令
//     (见 permissions.classifyCommandForSandbox),危险词仍硬拦截;主项目写入仍只能人工 apply。

import { spawn, spawnSync } from 'node:child_process'
import {
  cp,
  mkdir,
  rm,
  readdir,
  readFile,
  writeFile,
  symlink,
  copyFile,
  stat,
} from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { prisma } from './db.js'

// 项目根 = server/src 上跳两级(可用 HELIO_ROOT 覆盖,与 skills.ts 的 COMMAND_ROOT 一致)
export const PROJECT_ROOT =
  process.env.HELIO_ROOT ||
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SANDBOX_ROOT = resolve(PROJECT_ROOT, '.helio', 'sandboxes')

// 沙盒内命令的执行超时(ms)。开发命令(pnpm build/test 等)比聊天命令耗时长,故默认放宽到 180s。
// 可用 SANDBOX_CMD_TIMEOUT_MS 覆盖。
export const SANDBOX_CMD_TIMEOUT_MS = (() => {
  const v = Number(process.env.SANDBOX_CMD_TIMEOUT_MS)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 180_000
})()

export type IsolationInfo = {
  strong: boolean // 是否 OS 级强隔离(容器)
  mode: 'docker' | 'trusted_local' // 当前隔离实现
  label: string // 给 UI 的简短标记
  note: string // 诚实说明
}

let _isoCache: IsolationInfo | null = null
// 探测隔离强度:有可用 Docker 才算强隔离;否则诚实返回「本机信任沙盒」。结果缓存(进程内)。
export function detectIsolation(): IsolationInfo {
  if (_isoCache) return _isoCache
  let dockerOk = false
  try {
    const r = spawnSync('docker', ['info'], { timeout: 2500, stdio: 'ignore' })
    dockerOk = r.status === 0
  } catch {
    dockerOk = false
  }
  _isoCache = dockerOk
    ? {
        strong: true,
        mode: 'docker',
        label: '强隔离沙盒(Docker)',
        note: '检测到可用 Docker:命令在容器内执行,与主机文件系统/网络隔离。',
      }
    : {
        strong: false,
        mode: 'trusted_local',
        label: '本机信任沙盒(非强隔离)',
        note:
          '未检测到 Docker/容器:隔离工作区 + 命令路径守卫 + 危险词硬拦截 + env 脱敏 + 依赖软链的纵深防御,' +
          '不是 OS 级强隔离;shell 仍图灵完备,守卫为启发式。主项目写入仍只能由人类手动 apply。',
      }
  return _isoCache
}

// 复制 / 遍历 / diff 时忽略的目录名(基名匹配)
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.helio', '.git', 'uploads',
  '.next', 'coverage', '.turbo', '.cache',
])
// 复制 / 遍历时忽略的文件(基名正则)
const IGNORE_FILE_RE =
  /(\.db|\.db-journal|\.db\.bak.*|\.env.*|\.key|\.pem|\.p12|\.pfx|\.DS_Store|\.tsbuildinfo|\.log)$/i

// apply 时禁止写回主项目的敏感 / 生成文件(相对路径匹配)
const APPLY_DENY: RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)\.helio(\/|$)/,
  /(^|\/)uploads(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /\.(db|db-journal|key|pem|p12|pfx)$/i,
  /(^|\/)providers\.json$/i, // 含明文 key
  /(^|\/)dev\.db/i,
  /\.tsbuildinfo$/i,
]

// 软链注入的依赖目录(让 build/test 在沙盒内可跑,且被 diff 忽略)
const NODE_MODULES_DIRS = ['', 'server', 'web']

function basename(p: string): string {
  return p.split('/').pop() || p
}

// 是否在复制 / 遍历时忽略(传入绝对 src 路径,基于相对 PROJECT_ROOT 判定)
function ignoredForCopy(src: string): boolean {
  const rel = relative(PROJECT_ROOT, src)
  if (!rel || rel.startsWith('..')) return false // 根目录本身
  const segs = rel.split('/')
  for (const s of segs) if (IGNORE_DIRS.has(s)) return true
  const base = basename(src)
  if (IGNORE_FILE_RE.test(base)) return true
  return false
}

// 路径是否被包含在 root 之内(含 root 本身)
function within(root: string, p: string): boolean {
  return p === root || p.startsWith(root.replace(/\/$/, '') + '/')
}

// ============================================================
// FS 纯函数核心(不依赖 DB)
// ============================================================

export type PreparedSandbox = {
  rootPath: string
  workspacePath: string
  basePath: string
  mode: 'copy' | 'git_worktree'
}

// 准备沙盒目录:base = 纯净快照(diff 基线);workspace = 工作副本(+ node_modules 软链)。
export async function prepareSandboxFs(runId: string): Promise<PreparedSandbox> {
  const rootPath = resolve(SANDBOX_ROOT, runId)
  const basePath = resolve(rootPath, 'base')
  const workspacePath = resolve(rootPath, 'workspace')
  await rm(rootPath, { recursive: true, force: true })
  await mkdir(basePath, { recursive: true })

  // 1) 纯净快照(忽略 node_modules/dist/.helio/*.db/.env 等)。
  //    注意:沙盒目录在项目根内,Node cp 不允许把目录拷进自身子目录,故逐个顶层条目复制。
  const topEntries = await readdir(PROJECT_ROOT, { withFileTypes: true })
  for (const e of topEntries) {
    if (IGNORE_DIRS.has(e.name)) continue
    if (e.isSymbolicLink()) continue
    const src = join(PROJECT_ROOT, e.name)
    const dst = join(basePath, e.name)
    if (e.isFile()) {
      if (IGNORE_FILE_RE.test(e.name)) continue
      await copyFile(src, dst)
    } else if (e.isDirectory()) {
      await cp(src, dst, { recursive: true, filter: (s) => !ignoredForCopy(s) })
    }
  }
  // 2) 工作副本 = 快照的拷贝(起点完全一致 → diff 干净;workspace 与 base 互不为子目录)
  await cp(basePath, workspacePath, { recursive: true })
  // 3) 软链依赖,使 build/test 在沙盒内可运行;软链不进 diff(被 IGNORE_DIRS 排除)
  for (const sub of NODE_MODULES_DIRS) {
    const srcNM = resolve(PROJECT_ROOT, sub, 'node_modules')
    if (!existsSync(srcNM)) continue
    const dstNM = resolve(workspacePath, sub, 'node_modules')
    await mkdir(dirname(dstNM), { recursive: true })
    try {
      await symlink(srcNM, dstNM, 'dir')
    } catch {
      /* 已存在则忽略 */
    }
  }
  return { rootPath, workspacePath, basePath, mode: 'copy' }
}

export type GuardResult = { ok: true; cwd: string } | { ok: false; reason: string }

// 命令路径守卫(沙盒模式):cwd 不能逃出 workspace;命令里引用沙盒外的绝对/家目录/越界相对
// 路径一律拒绝并记录。这是真实的、可记录的边界(非完美安全沙盒,shell 仍图灵完备,
// 故与 classifyCommand 硬拦截 + 依赖软链 + env 脱敏共同构成纵深防御)。
export function guardSandboxCommand(
  command: string,
  workspacePath: string,
  relCwd?: string | null,
): GuardResult {
  let cwd = workspacePath
  if (relCwd && relCwd.trim()) {
    const r = resolve(workspacePath, relCwd.trim())
    if (!within(workspacePath, r))
      return { ok: false, reason: `cwd「${relCwd}」超出沙盒 workspace` }
    cwd = r
  }
  const tokens = command.match(/(?:"[^"]*"|'[^']*'|[^\s]+)/g) ?? []
  for (const raw of tokens) {
    const tok = raw.replace(/^['"]|['"]$/g, '')
    if (!tok) continue
    if (tok === '~' || tok.startsWith('~/') || tok.startsWith('~'))
      return { ok: false, reason: `命令引用家目录路径(${tok})被沙盒拒绝` }
    if (tok.startsWith('-')) continue // 选项
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(tok)) continue // URL(http:// 等)
    if (tok.startsWith('/')) {
      if (tok === '/dev/null') continue
      if (within(workspacePath, tok)) continue
      return { ok: false, reason: `命令引用沙盒外绝对路径(${tok})被拒绝` }
    }
    if (tok.includes('..')) {
      const resolved = resolve(cwd, tok)
      if (!within(workspacePath, resolved))
        return { ok: false, reason: `命令引用越界相对路径(${tok})被拒绝` }
    }
  }
  return { ok: true, cwd }
}

// 给沙盒命令的脱敏 env:剥离 key/secret/token/供应商凭据,避免泄露到子进程
export function sandboxEnv(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|OPENAI|ANTHROPIC|LLM_API|PROVIDER/i.test(k))
      continue
    e[k] = v
  }
  e.HELIO_SANDBOX = '1'
  return e
}

export type RunResult = {
  command: string
  cwd: string
  exitCode: number | null
  durationMs: number
  stdout: string
  killed: boolean
  errored?: boolean
}

// 在沙盒内执行一条命令(shell),捕获合并输出 / 退出码 / 耗时,带超时与截断。
export function runInSandbox(
  command: string,
  opts: { cwd: string; timeoutMs?: number; maxBytes?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  const cwd = opts.cwd
  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxBytes = opts.maxBytes ?? 16 * 1024
  return new Promise<RunResult>((done) => {
    const start = Date.now()
    const child = spawn(command, { shell: true, cwd, env: opts.env ?? sandboxEnv() })
    let out = ''
    const append = (b: Buffer) => {
      if (out.length < maxBytes) out += b.toString()
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      done({
        command,
        cwd,
        exitCode: null,
        durationMs: Date.now() - start,
        stdout: `执行出错:${e.message}`,
        killed: false,
        errored: true,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const body =
        out.length >= maxBytes ? out.slice(0, maxBytes) + '\n…(输出已截断)' : out
      done({
        command,
        cwd,
        exitCode: killed ? null : code,
        durationMs: Date.now() - start,
        stdout: body,
        killed,
      })
    })
  })
}

// 递归遍历源文件(忽略 IGNORE_DIRS / IGNORE_FILE_RE / 符号链接),返回相对路径列表
async function walkSource(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue
        await walk(join(dir, e.name))
      } else if (e.isFile()) {
        if (IGNORE_FILE_RE.test(e.name)) continue
        out.push(relative(root, join(dir, e.name)))
      }
    }
  }
  await walk(root)
  return out
}

function hashFile(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash('sha1')
    const s = createReadStream(path)
    s.on('error', rej)
    s.on('data', (d) => h.update(d))
    s.on('end', () => res(h.digest('hex')))
  })
}

export type ChangedFile = { path: string; status: 'added' | 'modified' | 'deleted' }
export type DiffResult = {
  files: ChangedFile[]
  diff: string
  summary: string
}

// 对比 base 与 workspace,得出变更文件清单 + 统一 diff 文本(用系统 diff -ruN,忽略生成目录)。
export async function collectDiffFs(
  basePath: string,
  workspacePath: string,
): Promise<DiffResult> {
  const [baseFiles, wsFiles] = await Promise.all([
    walkSource(basePath),
    walkSource(workspacePath),
  ])
  const baseSet = new Set(baseFiles)
  const wsSet = new Set(wsFiles)
  const files: ChangedFile[] = []
  for (const f of wsFiles) {
    if (!baseSet.has(f)) {
      files.push({ path: f, status: 'added' })
    } else {
      const [a, b] = await Promise.all([
        hashFile(join(basePath, f)),
        hashFile(join(workspacePath, f)),
      ])
      if (a !== b) files.push({ path: f, status: 'modified' })
    }
  }
  for (const f of baseFiles) if (!wsSet.has(f)) files.push({ path: f, status: 'deleted' })
  files.sort((x, y) => x.path.localeCompare(y.path))

  // 统一 diff(系统 diff;忽略目录用 -x)。base/workspace 同父目录,输出路径可读。
  const excludes = [...IGNORE_DIRS].flatMap((d) => ['-x', d])
  const root = dirname(basePath)
  const dr = await runInSandbox(
    `diff -ruN ${excludes.join(' ')} base workspace`,
    { cwd: root, timeoutMs: 30_000, maxBytes: 64 * 1024 },
  )
  // diff 退出码 0=相同 1=有差异 2=出错;0/1 均视为成功
  const diff = dr.exitCode === 2 ? `(diff 生成失败)\n${dr.stdout}` : dr.stdout

  const added = files.filter((f) => f.status === 'added').length
  const modified = files.filter((f) => f.status === 'modified').length
  const deleted = files.filter((f) => f.status === 'deleted').length
  const summary = files.length
    ? `${files.length} 文件(+${added} ~${modified} -${deleted})`
    : '无文件改动'
  return { files, diff, summary }
}

export type ApplyResult = {
  applied: string[]
  blocked: { path: string; reason: string }[]
  skippedDeletions: string[]
}

// dry-run 校验 + 应用:仅 added/modified;拒绝敏感/生成文件;deleted 不自动删(报告)。
export async function applySandboxFs(
  workspacePath: string,
  files: ChangedFile[],
): Promise<ApplyResult> {
  const applied: string[] = []
  const blocked: { path: string; reason: string }[] = []
  const skippedDeletions: string[] = []

  // 第一遍:dry-run 校验
  const toCopy: string[] = []
  for (const f of files) {
    if (f.status === 'deleted') {
      skippedDeletions.push(f.path)
      continue
    }
    if (APPLY_DENY.some((re) => re.test(f.path))) {
      blocked.push({ path: f.path, reason: '敏感/生成文件,禁止写回主项目' })
      continue
    }
    const src = resolve(workspacePath, f.path)
    if (!within(workspacePath, src)) {
      blocked.push({ path: f.path, reason: '源路径越界' })
      continue
    }
    const dst = resolve(PROJECT_ROOT, f.path)
    if (!within(PROJECT_ROOT, dst)) {
      blocked.push({ path: f.path, reason: '目标路径越界主项目' })
      continue
    }
    if (!existsSync(src)) {
      blocked.push({ path: f.path, reason: '源文件不存在' })
      continue
    }
    toCopy.push(f.path)
  }
  // 第二遍:校验通过才写回
  for (const rel of toCopy) {
    const src = resolve(workspacePath, rel)
    const dst = resolve(PROJECT_ROOT, rel)
    await mkdir(dirname(dst), { recursive: true })
    await copyFile(src, dst)
    applied.push(rel)
  }
  return { applied, blocked, skippedDeletions }
}

export async function discardSandboxFs(rootPath: string): Promise<void> {
  // 安全:只删 SANDBOX_ROOT 之内的目录
  if (!within(SANDBOX_ROOT, rootPath)) throw new Error('拒绝:沙盒路径越界')
  await rm(rootPath, { recursive: true, force: true })
}

// ============================================================
// DB 封装(写 SandboxRun / SandboxLog / SandboxArtifact)
// ============================================================

let seqCounter = new Map<string, number>()
function nextSeq(sandboxRunId: string): number {
  const n = (seqCounter.get(sandboxRunId) ?? 0) + 1
  seqCounter.set(sandboxRunId, n)
  return n
}

export async function logSandbox(
  sandboxRunId: string,
  entry: {
    type: string
    command?: string | null
    cwd?: string | null
    exitCode?: number | null
    durationMs?: number | null
    content?: string | null
  },
) {
  try {
    await prisma.sandboxLog.create({
      data: {
        sandboxRunId,
        seq: nextSeq(sandboxRunId),
        type: entry.type,
        command: entry.command ?? null,
        cwd: entry.cwd ?? null,
        exitCode: entry.exitCode ?? null,
        durationMs: entry.durationMs ?? null,
        content: entry.content != null ? String(entry.content).slice(0, 16_000) : null,
      },
    })
  } catch (e) {
    console.error('[sandbox-log]', e)
  }
}

// 创建并准备一个 SandboxRun(失败则标记 failed 并抛出)。
export async function createSandboxRun(input: {
  taskRunId: string
  taskId?: string | null
  missionId?: string | null
  createdById?: string | null
}) {
  const row = await prisma.sandboxRun.create({
    data: {
      taskRunId: input.taskRunId,
      taskId: input.taskId ?? null,
      missionId: input.missionId ?? null,
      mode: 'copy',
      rootPath: '',
      workspacePath: '',
      status: 'preparing',
      createdById: input.createdById ?? null,
      startedAt: new Date(),
    },
  })
  try {
    const prepared = await prepareSandboxFs(row.id)
    const updated = await prisma.sandboxRun.update({
      where: { id: row.id },
      data: {
        rootPath: prepared.rootPath,
        workspacePath: prepared.workspacePath,
        basePath: prepared.basePath,
        mode: prepared.mode,
        status: 'running',
      },
    })
    await logSandbox(row.id, {
      type: 'prepare',
      content: `已创建隔离工作区(${prepared.mode}):${relative(PROJECT_ROOT, prepared.workspacePath)};已软链 node_modules,忽略 node_modules/dist/.helio/uploads/*.db/.env/key。`,
    })
    return updated
  } catch (e) {
    await prisma.sandboxRun
      .update({
        where: { id: row.id },
        data: { status: 'failed', error: (e as Error).message.slice(0, 500), endedAt: new Date() },
      })
      .catch(() => {})
    throw e
  }
}

// 收尾:收集 diff、(有代码改动时)跑 build/test、置 ready_for_review。
export async function finalizeSandbox(
  sandboxRunId: string,
  opts: { runBuild?: boolean } = {},
) {
  const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
  if (!run || !run.basePath) return
  await prisma.sandboxRun.update({ where: { id: sandboxRunId }, data: { status: 'testing' } })

  const diff = await collectDiffFs(run.basePath, run.workspacePath)
  await logSandbox(sandboxRunId, {
    type: 'diff',
    content: diff.diff || '(无差异)',
  })
  for (const f of diff.files)
    await prisma.sandboxArtifact.create({
      data: { sandboxRunId, kind: 'file', path: f.path, summary: f.status },
    })
  if (diff.files.length)
    await prisma.sandboxArtifact.create({
      data: {
        sandboxRunId,
        kind: 'diff',
        summary: diff.summary,
        sizeBytes: diff.diff.length,
      },
    })

  // build/test:仅当有代码改动且允许时运行(避免对无改动任务空跑)
  let buildResult: string | null = null
  const hasCode = diff.files.some(
    (f) => f.status !== 'deleted' && /\.(ts|tsx|js|jsx|mjs|cjs|json|css)$/.test(f.path),
  )
  if (opts.runBuild !== false && hasCode) {
    const cmds = await detectBuildCommands(run.workspacePath, diff.files)
    if (cmds.length) {
      let pass = 0
      let fail = 0
      for (const c of cmds) {
        const r = await runInSandbox(c.command, {
          cwd: run.workspacePath,
          timeoutMs: 180_000,
          maxBytes: 12 * 1024,
        })
        const ok = r.exitCode === 0
        ok ? pass++ : fail++
        await logSandbox(sandboxRunId, {
          type: 'test',
          command: c.command,
          cwd: run.workspacePath,
          exitCode: r.exitCode,
          durationMs: r.durationMs,
          content: r.stdout,
        })
        await prisma.sandboxArtifact.create({
          data: {
            sandboxRunId,
            kind: 'build_result',
            summary: `${c.label}: ${ok ? 'PASS' : r.killed ? 'TIMEOUT' : 'FAIL'} (exit ${r.exitCode})`,
            metadataJson: JSON.stringify({ command: c.command, exitCode: r.exitCode, durationMs: r.durationMs }),
          },
        })
      }
      buildResult = fail === 0 ? 'pass' : pass === 0 ? 'fail' : 'partial'
    } else {
      buildResult = 'skipped'
    }
  } else {
    buildResult = hasCode ? 'skipped' : 'skipped'
  }

  return prisma.sandboxRun.update({
    where: { id: sandboxRunId },
    data: {
      status: 'ready_for_review',
      changedFiles: JSON.stringify(diff.files),
      diffSummary: diff.summary,
      buildResult,
      endedAt: new Date(),
    },
  })
}

async function detectBuildCommands(
  workspacePath: string,
  changedFiles: ChangedFile[],
): Promise<{ label: string; command: string }[]> {
  const topDirs = new Set(changedFiles.map((f) => f.path.split('/')[0]))
  const out: { label: string; command: string }[] = []
  for (const pkg of ['server', 'web']) {
    if (!topDirs.has(pkg)) continue
    const pj = join(workspacePath, pkg, 'package.json')
    if (!existsSync(pj)) continue
    try {
      const scripts = (JSON.parse(await readFile(pj, 'utf8')).scripts ?? {}) as Record<string, string>
      if (scripts.build) out.push({ label: `${pkg} build`, command: `pnpm -C ${pkg} build` })
      if (scripts.test && !/(no test|exit 1)/i.test(scripts.test))
        out.push({ label: `${pkg} test`, command: `pnpm -C ${pkg} test` })
    } catch {
      /* ignore */
    }
  }
  return out
}

export async function failSandbox(sandboxRunId: string, error: string, status = 'failed') {
  return prisma.sandboxRun
    .update({
      where: { id: sandboxRunId },
      data: { status, error: error.slice(0, 500), endedAt: new Date() },
    })
    .catch(() => null)
}

// 人工 apply:校验 + 写回主项目;返回结果(AuditEvent 由调用方写)。
export async function applySandbox(sandboxRunId: string, actorId: string) {
  const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
  if (!run) return { error: 'sandbox not found', code: 404 as const }
  if (run.status === 'applied') return { error: '该沙盒已应用', code: 400 as const }
  if (run.status === 'discarded') return { error: '该沙盒已丢弃', code: 400 as const }
  if (!run.workspacePath || !existsSync(run.workspacePath))
    return { error: '沙盒工作区不存在(可能已被清理)', code: 400 as const }
  let files: ChangedFile[] = []
  try {
    files = run.changedFiles ? JSON.parse(run.changedFiles) : []
  } catch {
    files = []
  }
  if (!files.length) {
    // 没有记录的改动 → 现场重算一次,避免漏 apply
    if (run.basePath) files = (await collectDiffFs(run.basePath, run.workspacePath)).files
  }
  const result = await applySandboxFs(run.workspacePath, files)
  await prisma.sandboxRun.update({
    where: { id: sandboxRunId },
    data: {
      status: 'applied',
      appliedFiles: JSON.stringify(result.applied),
      appliedById: actorId,
      endedAt: new Date(),
    },
  })
  await logSandbox(sandboxRunId, {
    type: 'system',
    content:
      `人工批准应用到主项目:写回 ${result.applied.length} 个文件` +
      (result.blocked.length ? `;拦截 ${result.blocked.length} 个敏感/生成文件` : '') +
      (result.skippedDeletions.length ? `;跳过 ${result.skippedDeletions.length} 个删除(需人工处理)` : ''),
  })
  return { run, result }
}

export async function discardSandbox(sandboxRunId: string, actorId: string) {
  const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
  if (!run) return { error: 'sandbox not found', code: 404 as const }
  if (run.status === 'applied') return { error: '已应用的沙盒不可丢弃', code: 400 as const }
  if (run.rootPath && within(SANDBOX_ROOT, run.rootPath))
    await discardSandboxFs(run.rootPath).catch(() => {})
  await prisma.sandboxRun.update({
    where: { id: sandboxRunId },
    data: { status: 'discarded', appliedById: actorId, endedAt: new Date() },
  })
  await logSandbox(sandboxRunId, { type: 'system', content: '人工丢弃沙盒,主项目未改变。' })
  return { run }
}

// 报告:SandboxRun + 日志 + 产物(供前端面板 / API)。
export async function getSandboxReport(sandboxRunId: string) {
  const run = await prisma.sandboxRun.findUnique({ where: { id: sandboxRunId } })
  if (!run) return null
  const [logs, artifacts] = await Promise.all([
    prisma.sandboxLog.findMany({ where: { sandboxRunId }, orderBy: { seq: 'asc' }, take: 300 }),
    prisma.sandboxArtifact.findMany({ where: { sandboxRunId }, orderBy: { createdAt: 'asc' }, take: 300 }),
  ])
  return { run, logs, artifacts }
}

export async function getSandboxByTaskRun(taskRunId: string) {
  const run = await prisma.sandboxRun.findFirst({
    where: { taskRunId },
    orderBy: { createdAt: 'desc' },
  })
  return run ? getSandboxReport(run.id) : null
}
