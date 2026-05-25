// 能力分层与权限矩阵 —— 诚实地声明系统当前真实具备/需审批/未实现的能力。
//
// 三层(对照用户反馈「终端能力分层不清」「高危能力要权限+人工确认」):
//   - human   : 人类本人手动操作(内置交互终端)。完整能力,本人为所欲为。
//   - assistant: AI 助手在任务执行/聊天中通过工具调用具备的能力。
//   - future  : 产品路线上规划、但当前后端尚未实现的能力(诚实标注不可用)。
//
// 级别:
//   - available   : 真实可用,直接执行。
//   - approval    : 高危,任务执行中必须经人工 Human Approval 才放行(危险动作不静默执行)。
//   - unavailable : 未实现,调用即拒绝,不伪装成已具备。

export type CapabilityKind = 'human' | 'assistant' | 'future'
export type CapabilityLevel = 'available' | 'approval' | 'unavailable'

export interface Capability {
  id: string
  label: string
  kind: CapabilityKind
  level: CapabilityLevel
  danger: boolean
  description: string
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'human_terminal',
    label: '人类终端',
    kind: 'human',
    level: 'available',
    danger: true,
    description:
      '你本人在内置终端(/ws/terminal)手动执行命令,完整 shell 权限,工作目录为项目根。命令会记 terminal.command 审计,但不受 AI 审批约束 —— 这是人类自己的操作。',
  },
  {
    id: 'assistant_read_fs',
    label: '助手只读文件',
    kind: 'assistant',
    level: 'available',
    danger: false,
    description:
      '助手可调用 list_dir / read_file 浏览与读取工作区文本文件(限工作区根、屏蔽敏感与二进制文件)。只读,无需审批。',
  },
  {
    id: 'assistant_run_command',
    label: '助手执行命令(高危)',
    kind: 'assistant',
    level: 'approval',
    danger: true,
    description:
      '助手在任务执行中调用 run_command 运行 shell(构建/测试/git 等)。写文件、命令替换、后台任务、非 GET 网络等属高危:任务执行里必须经人工批准才放行;危险命令(rm -rf / sudo / shutdown 等)始终硬拦截。聊天中由真人当场要求调用时沿用既有边界。',
  },
  {
    id: 'assistant_run_command_lowrisk',
    label: '助手低风险命令(只读)',
    kind: 'assistant',
    // 级别随 LOW_RISK_AUTO_APPROVE 策略变化(CAPABILITIES 在模块加载时求值,故内联判断)
    level:
      (process.env.LOW_RISK_AUTO_APPROVE ?? 'true').toLowerCase() !== 'false'
        ? 'available'
        : 'approval',
    danger: false,
    description:
      '只读、无副作用的命令(date/pwd/ls/whoami/cat/grep/find/sed/awk + curl·wget 仅 GET 公开网址 等)在任务执行中' +
      ((process.env.LOW_RISK_AUTO_APPROVE ?? 'true').toLowerCase() !== 'false'
        ? '免人工审批直接放行(轻审批)'
        : '(当前配置为仍需人工审批)') +
      '。写文件重定向、命令替换 $()、后台任务 &、非 GET 网络请求一律转人工审批门;rm -rf / sudo / shutdown 等危险命令始终硬拦截。可用 LOW_RISK_AUTO_APPROVE 环境变量切换该策略。',
  },
  {
    id: 'write_file',
    label: '助手写文件 / 改代码(仅沙盒)',
    kind: 'assistant',
    level: 'available',
    danger: true,
    description:
      '受控可用:任务执行的沙盒运行时里,助手可调用 write_file 在隔离工作区(.helio/sandboxes/<runId>/workspace)内写/改文本文件。只写沙盒,绝不直接落主项目;变更进入 diff,经人工在执行报告里「批准应用」并通过 dry-run 校验(拒绝 .env/key/db/uploads/node_modules/dist 等)后才写回主项目。聊天路径不提供直接写盘。',
  },
  {
    id: 'browser_control',
    label: '浏览器控制(本地验证)',
    kind: 'assistant',
    level: 'available',
    danger: true,
    description:
      '受控可用(本地验证用途):任务执行的沙盒运行时里,助手可用 headless Chrome(经 CDP)打开本地页面、截图、读取 console、点击/输入。' +
      '默认只允许 localhost / 127.0.0.1 / file:// 等本地地址;访问外站、登录、提交表单、上传文件、输入密钥需人工批准。' +
      '每个动作写 SandboxLog / AuditEvent,截图作为 artifact 存档。聊天路径不提供浏览器控制。',
  },
  {
    id: 'computer_control',
    label: '电脑控制(全局鼠标/键盘)',
    kind: 'future',
    level: 'unavailable',
    danger: true,
    description:
      '未实现(仅实验模式文案):没有桌面级全局鼠标 / 键盘 / 窗口控制能力,助手不能操作你的电脑桌面。' +
      '当前的「浏览器控制」只驱动一个隔离的 headless 浏览器,不等于控制整台电脑。',
  },
]

// 隔离强度:有 Docker/Colima/容器才是 OS 级强隔离;否则诚实标注为「本机信任沙盒」(非强隔离)。
// 真实探测放在 sandbox.ts(detectIsolation);此处只给静态文案常量,供 UI/文档引用。
export const SANDBOX_TRUST_NOTE =
  '本机信任沙盒(非强隔离):隔离工作区 + 命令路径守卫 + 危险词硬拦截 + env 脱敏 + 依赖软链的纵深防御,' +
  '不是 Docker/容器/seccomp 级强隔离。主项目写入仍只能由人类在报告里手动 apply。'

export function capabilityFor(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id)
}

// ============================================================
// 低风险命令策略 —— 保留高危审批,但把「只读、无副作用」的命令设计为
// 可配置免审批/轻审批,危险词仍始终硬拦截。三级分类:
//   blocked        : 危险动作,无论是否授权一律拒绝(rm -rf / sudo / shutdown …)。
//   low_risk       : 只读无副作用(date/pwd/ls/cat/grep/find + curl|wget 仅 GET 公开网址 …)。
//                    LOW_RISK_AUTO_APPROVE=true(默认)时任务执行中免审批直接放行。
//   needs_approval : 其余命令(写文件、命令替换、后台任务、非 GET 网络等)走人工审批门。
// 策略可用 LOW_RISK_AUTO_APPROVE 环境变量切换,并在能力矩阵 UI 如实展示。
// ============================================================

export type CommandClass = 'blocked' | 'low_risk' | 'needs_approval'

// 是否对低风险只读命令免审批(默认开启;设 LOW_RISK_AUTO_APPROVE=false 则一律审批)
export const LOW_RISK_AUTO_APPROVE =
  (process.env.LOW_RISK_AUTO_APPROVE ?? 'true').toLowerCase() !== 'false'

// 始终硬拦截的高危模式(无论是否授权)。非安全边界,挡明显误操作 + 不可逆动作。
const DANGEROUS_RE =
  /\brm\s+-[a-z]*[rf]|\bmkfs\b|\bdd\s+if=|:\(\)\s*\{|\bshutdown\b|\breboot\b|\bhalt\b|\bsudo\b|\bsu\b|\bchmod\s+(-R\s+)?[0-7]*777|\bchown\b|>\s*\/dev\/[sh]d|\bmv\s+\S+\s+\/(?!Users)|\bkill(all)?\b|\bnpm\s+publish\b|\bgit\s+push\b|\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i

// 只读命令白名单(命令头,已去路径前缀)。这些命令无写盘/无外发副作用。
const READONLY_CMDS = new Set([
  'date', 'pwd', 'ls', 'whoami', 'id', 'uname', 'hostname', 'echo', 'printf',
  'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'find', 'which',
  'env', 'printenv', 'df', 'du', 'uptime', 'stat', 'file', 'basename',
  'dirname', 'realpath', 'tree', 'nl', 'sort', 'uniq', 'cut', 'sed', 'awk',
  'true', 'sleep', 'node', 'jq', 'ping',
])
// 受控网络读取:curl / wget 仅允许 GET(无写文件/上传/POST)
const NET_CMDS = new Set(['curl', 'wget'])

// 沙盒「本机信任模式」下额外放行的常见开发命令(写代码/跑 build/test/git 查看)。
// 仅在隔离 workspace 内执行(guardSandboxCommand 挡路径逃逸),主项目写入仍只能人工 apply。
// 注意:危险词(rm -rf / sudo / git push / npm publish / curl|bash 等)仍由 DANGEROUS_RE 始终硬拦截。
const DEV_CMDS = new Set([
  // JS/TS 工具链
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'tsx', 'ts-node', 'tsc',
  'vite', 'esbuild', 'rollup', 'webpack', 'next', 'nest',
  'jest', 'vitest', 'mocha', 'ava', 'playwright', 'cypress',
  'eslint', 'prettier', 'biome',
  // Python 工具链
  'python', 'python3', 'pip', 'pip3', 'poetry', 'pytest', 'ruff', 'black', 'mypy', 'uv',
  // 其他常见
  'go', 'cargo', 'rustc', 'make', 'cmake', 'gradle', 'mvn',
  'git', 'diff', 'patch',
  // 沙盒内文件操作(路径由 guardSandboxCommand 限制在 workspace)
  'cp', 'mv', 'mkdir', 'rmdir', 'touch', 'ln', 'tee',
  // 子 shell(脚本运行;沙盒隔离,apply 仍人工)
  'bash', 'sh', 'zsh', 'time', 'xargs',
])

// 给前端展示用:低风险白名单摘要(只读命令 + 受控网络)
export const LOW_RISK_SUMMARY = {
  autoApprove: LOW_RISK_AUTO_APPROVE,
  readonly: [...READONLY_CMDS],
  network: [...NET_CMDS],
}

/** 命令分级:blocked(硬拦截)/ low_risk(只读免审批)/ needs_approval(人工审批)。 */
export function classifyCommand(raw: string): CommandClass {
  const cmd = (raw ?? '').trim()
  if (!cmd) return 'needs_approval'
  if (DANGEROUS_RE.test(cmd)) return 'blocked'
  // 写文件重定向(> 或 >>,/dev/null 除外)→ 可能落盘,转人工审批
  if (/>>?\s*(?!\/dev\/null\b)\S/.test(cmd)) return 'needs_approval'
  // 命令替换 $() / 反引号 → 不可静态判定,转人工审批
  if (/\$\(|`/.test(cmd)) return 'needs_approval'
  // 后台任务 &(排除 &&)→ 转人工审批
  if (cmd.replace(/&&/g, '  ').includes('&')) return 'needs_approval'
  // 按管道 / 逻辑连接 / 分号拆段,每段命令头都须在只读白名单内
  const segments = cmd.split(/\|\||&&|\||;/).map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return 'needs_approval'
  for (const seg of segments) {
    const head = (seg.split(/\s+/)[0] || '').replace(/^.*\//, '') // 去路径前缀
    if (!head) return 'needs_approval'
    if (READONLY_CMDS.has(head)) continue
    if (NET_CMDS.has(head)) {
      // curl/wget:禁止写文件 / 上传 / 非 GET
      if (
        /\s-[a-zA-Z]*[oOT]\b|--output\b|--upload-file\b|--data\b|\s-d\b|-X\s*(?!GET\b)\w+|--request\s+(?!GET\b)\w+/i.test(
          seg,
        )
      )
        return 'needs_approval'
      continue
    }
    return 'needs_approval'
  }
  return 'low_risk'
}

// 沙盒「本机信任模式」的命令分级(比聊天/主项目宽松,但危险词仍硬拦截):
//   blocked        : 危险动作一律拒绝(rm -rf / sudo / git push / npm publish / curl|bash …)。
//   allowed        : 只读命令 ∪ 常见开发命令(node/pnpm/tsx/python/build/test/git status·diff …)∪ GET 网络,
//                    在隔离 workspace 内免人工审批直接放行(主项目写入仍只能人工 apply)。
//   needs_approval : 含非 GET 网络,或出现无法识别的命令头(未知二进制)→ 转人工审批门。
// 这样代码/命令类任务在沙盒里能真正写代码、跑程序,而不会因「一刀切禁 node/pnpm」变鸡肋。
export type SandboxCommandClass = 'blocked' | 'allowed' | 'needs_approval'

export function classifyCommandForSandbox(raw: string): SandboxCommandClass {
  const cmd = (raw ?? '').trim()
  if (!cmd) return 'needs_approval'
  if (DANGEROUS_RE.test(cmd)) return 'blocked'
  // 命令替换 $()/反引号:沙盒隔离 + apply 人工,允许(便于 node -e/脚本)
  // 按管道 / 逻辑连接 / 分号 / 重定向拆段,逐段校验命令头是否在放行集合内。
  const segments = cmd
    .split(/\|\||&&|\||;|>>?|<|&(?!&)/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!segments.length) return 'needs_approval'
  for (const seg of segments) {
    // 去掉前置 env 赋值(FOO=bar cmd)与子 shell 包裹
    const cleaned = seg.replace(/^\(+/, '').replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '').trim()
    const head = (cleaned.split(/\s+/)[0] || '').replace(/^.*\//, '').replace(/^['"]|['"]$/g, '')
    if (!head) continue // 纯重定向目标 / 空段
    if (head.startsWith('$') || head.startsWith('-')) continue // 变量/选项残片
    if (READONLY_CMDS.has(head) || DEV_CMDS.has(head)) continue
    if (NET_CMDS.has(head)) {
      if (
        /\s-[a-zA-Z]*[T]\b|--upload-file\b|--data\b|\s-d\b|-X\s*(?!GET\b)\w+|--request\s+(?!GET\b)\w+/i.test(
          seg,
        )
      )
        return 'needs_approval' // 非 GET / 上传 → 审批
      continue
    }
    return 'needs_approval' // 未识别命令头 → 审批
  }
  return 'allowed'
}
