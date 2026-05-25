// 沙盒运行时确定性 smoke(真实执行,不依赖 LLM,不写 DB,不污染主项目)。
//
// 直接驱动 sandbox.ts 的 FS 纯函数核心,覆盖验收 A/B/C/D:
//   A 执行 pwd 的 cwd 在 .helio/sandboxes/<runId>/workspace
//   B 读 ~/.ssh/id_rsa 或逃出 cwd 被守卫拒绝
//   C 在沙盒内写文件 + 跑 build,得到真实命令/退出码/日志
//   D 丢弃沙盒后主项目未变;apply 只应用允许 diff、拒敏感/生成文件
//
// 运行: pnpm -C server exec tsx ../docs/ai/sandbox_smoke.ts
// 清理: 结束时删除创建的沙盒目录与 apply 写回的临时文件。

import {
  PROJECT_ROOT,
  SANDBOX_ROOT,
  prepareSandboxFs,
  guardSandboxCommand,
  runInSandbox,
  collectDiffFs,
  applySandboxFs,
  discardSandboxFs,
  sandboxEnv,
} from '../../server/src/sandbox.js'
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

let failures = 0
const created: string[] = [] // 待清理的沙盒 rootPath
const appliedToMain: string[] = [] // 待清理的主项目临时文件(绝对路径)

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

async function smokeA() {
  console.log('\n== Smoke A: pwd 在沙盒 workspace ==')
  const runId = 'smoke-A-' + randomUUID().slice(0, 8)
  const sb = await prepareSandboxFs(runId)
  created.push(sb.rootPath)
  const g = guardSandboxCommand('pwd', sb.workspacePath)
  const r = await runInSandbox('pwd', { cwd: g.ok ? g.cwd : sb.workspacePath, env: sandboxEnv() })
  const out = r.stdout.trim()
  console.log('  cwd 输出:', out)
  check(
    'A pwd 在 .helio/sandboxes/<runId>/workspace',
    out.includes(`/.helio/sandboxes/${runId}/workspace`) && r.exitCode === 0,
    `exit ${r.exitCode}`,
  )
  // 主项目根的标志文件应存在于沙盒副本里(确认是真实副本)
  check('A 沙盒含主项目副本(package.json)', existsSync(join(sb.workspacePath, 'package.json')))
  // node_modules 以软链注入(让 build 可跑),且不进 diff
  check('A node_modules 已软链注入', existsSync(join(sb.workspacePath, 'server', 'node_modules')))
}

async function smokeB() {
  console.log('\n== Smoke B: 越界读 / 逃逸被拒绝 ==')
  const runId = 'smoke-B-' + randomUUID().slice(0, 8)
  const sb = await prepareSandboxFs(runId)
  created.push(sb.rootPath)
  const ws = sb.workspacePath

  const g1 = guardSandboxCommand('cat ~/.ssh/id_rsa', ws)
  check('B 拒绝 cat ~/.ssh/id_rsa', g1.ok === false, g1.ok ? '' : g1.reason)
  const g2 = guardSandboxCommand('cat /etc/passwd', ws)
  check('B 拒绝 cat /etc/passwd(沙盒外绝对路径)', g2.ok === false, g2.ok ? '' : g2.reason)
  const g3 = guardSandboxCommand('cat ../../../../etc/passwd', ws)
  check('B 拒绝 ../ 逃逸到沙盒外', g3.ok === false, g3.ok ? '' : g3.reason)
  const g4 = guardSandboxCommand('ls ..', ws, '..')
  check('B 拒绝 cwd 越界(relCwd=..)', g4.ok === false, g4.ok ? '' : g4.reason)
  // 反例:沙盒内读应放行
  const g5 = guardSandboxCommand('cat package.json', ws)
  check('B 放行沙盒内 cat package.json', g5.ok === true, g5.ok ? '' : g5.reason)

  // 真实证明:即便绕过分级直接尝试,守卫先于执行拒绝;若守卫放行,确认读不到宿主机密钥
  const real = await runInSandbox('cat /etc/hostname', { cwd: ws, env: sandboxEnv() })
  console.log('  (参考)若执行 cat /etc/hostname 退出码:', real.exitCode)
}

async function smokeC() {
  console.log('\n== Smoke C: 沙盒内写文件 + 跑 build,真实命令/退出码/日志 ==')
  const runId = 'smoke-C-' + randomUUID().slice(0, 8)
  const sb = await prepareSandboxFs(runId)
  created.push(sb.rootPath)
  const ws = sb.workspacePath

  // 模拟 write_file:在沙盒内写一个合法 TS,使 server build 仍通过
  const rel = 'server/src/__smoke_sandbox__.ts'
  const target = resolve(ws, rel)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, '// sandbox smoke marker\nexport const SANDBOX_SMOKE = 1\n', 'utf8')
  check('C write_file 路径在沙盒内', target.startsWith(ws + '/'))

  // diff:应识别到新增文件
  const diff = await collectDiffFs(sb.basePath, ws)
  const found = diff.files.find((f) => f.path === rel && f.status === 'added')
  check('C diff 识别新增文件', !!found, diff.summary)
  check('C diff 文本非空', diff.diff.includes('__smoke_sandbox__.ts'))

  // 在沙盒内真实跑 server build(node_modules 软链可用)
  console.log('  运行: pnpm -C server build(沙盒内,最长 180s)…')
  const build = await runInSandbox('pnpm -C server build', {
    cwd: ws,
    timeoutMs: 180_000,
    maxBytes: 4 * 1024,
    env: sandboxEnv(),
  })
  console.log(`  build 退出码: ${build.exitCode} 耗时 ${build.durationMs}ms`)
  console.log('  build 日志尾:', build.stdout.split('\n').slice(-4).join(' | ').slice(0, 300))
  check('C 沙盒内 build 真实运行且通过', build.exitCode === 0, `exit ${build.exitCode}`)
  // build 产物在沙盒内,不应进入 diff(dist 被忽略)
  const diff2 = await collectDiffFs(sb.basePath, ws)
  check('C build 产物(dist)不进 diff', !diff2.files.some((f) => f.path.startsWith('server/dist')))
}

async function smokeD() {
  console.log('\n== Smoke D: 丢弃后主项目未变;apply 只应用允许 diff ==')
  // --- D1 discard ---
  const runId1 = 'smoke-D1-' + randomUUID().slice(0, 8)
  const sb1 = await prepareSandboxFs(runId1)
  const ws1 = sb1.workspacePath
  const sentinel = 'docs/ai/__smoke_discard_only_in_sandbox__.md'
  await writeFile(resolve(ws1, sentinel), 'only in sandbox', 'utf8')
  const mainSentinel = resolve(PROJECT_ROOT, sentinel)
  await discardSandboxFs(sb1.rootPath)
  check('D 丢弃后沙盒目录已删除', !existsSync(sb1.rootPath))
  check('D 丢弃后主项目未出现沙盒文件', !existsSync(mainSentinel))

  // --- D2 apply:允许文件写回;敏感文件两层防御(diff 阶段忽略 / apply 阶段拒绝)---
  const runId2 = 'smoke-D2-' + randomUUID().slice(0, 8)
  const sb2 = await prepareSandboxFs(runId2)
  created.push(sb2.rootPath)
  const ws2 = sb2.workspacePath
  const allowRel = 'docs/ai/__smoke_apply__.md'
  const denyKeyRel = 'providers.json' // 含明文 key:不被 diff 忽略,但命中 apply dry-run 拒绝清单
  const denyEnvRel = 'server/.env.smoke' // 第一层:在 diff 收集阶段即被忽略
  await writeFile(resolve(ws2, allowRel), '# smoke apply marker\n', 'utf8')
  await writeFile(resolve(ws2, denyKeyRel), '{"providers":[{"apiKey":"should_not_apply"}]}\n', 'utf8')
  await mkdir(dirname(resolve(ws2, denyEnvRel)), { recursive: true })
  await writeFile(resolve(ws2, denyEnvRel), 'SECRET=should_not_apply\n', 'utf8')

  const diff = await collectDiffFs(sb2.basePath, ws2)
  console.log('  diff 文件:', diff.files.map((f) => f.path))
  const res = await applySandboxFs(ws2, diff.files)
  console.log('  applied:', res.applied, ' blocked:', res.blocked.map((b) => b.path))

  const mainAllow = resolve(PROJECT_ROOT, allowRel)
  const mainDenyKey = resolve(PROJECT_ROOT, denyKeyRel)
  const mainDenyEnv = resolve(PROJECT_ROOT, denyEnvRel)
  if (existsSync(mainAllow)) appliedToMain.push(mainAllow)

  check('D apply 写回允许文件', res.applied.includes(allowRel) && existsSync(mainAllow))
  check(
    'D apply dry-run 拒绝敏感 providers.json',
    res.blocked.some((b) => b.path === denyKeyRel) && !existsSync(mainDenyKey),
  )
  check(
    'D 敏感 .env 在 diff 阶段即被忽略(不进 diff/不落主项目)',
    !diff.files.some((f) => f.path === denyEnvRel) && !existsSync(mainDenyEnv),
  )
  // 校验写回内容真实
  if (existsSync(mainAllow)) {
    const body = await readFile(mainAllow, 'utf8')
    check('D 写回内容正确', body.includes('smoke apply marker'))
  }
}

async function cleanup() {
  console.log('\n== 清理 ==')
  for (const root of created) {
    try {
      await rm(root, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
  for (const f of appliedToMain) {
    try {
      await rm(f, { force: true })
      console.log('  已删除 apply 临时文件:', f.replace(PROJECT_ROOT + '/', ''))
    } catch {
      /* ignore */
    }
  }
  // 兜底:删除可能残留的 smoke 沙盒
  try {
    if (existsSync(SANDBOX_ROOT)) {
      const { readdir } = await import('node:fs/promises')
      for (const d of await readdir(SANDBOX_ROOT)) {
        if (d.startsWith('smoke-')) await rm(join(SANDBOX_ROOT, d), { recursive: true, force: true })
      }
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  console.log('PROJECT_ROOT =', PROJECT_ROOT)
  try {
    await smokeA()
    await smokeB()
    await smokeC()
    await smokeD()
  } finally {
    await cleanup()
  }
  console.log(`\n=== 结果: ${failures === 0 ? 'ALL PASS' : failures + ' FAIL'} ===`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
