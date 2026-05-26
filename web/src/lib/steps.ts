/* 执行步骤产品化 —— 把真实审计 / 工具调用 / 沙盒 / 审批 / 交付,
   归并为用户能看懂的「执行阶段」时间线(不裸露 list_dir/read_file/grep)。
   纯函数,只用真实 TaskReport 数据,无 mock。 */

import type { TaskReport, TaskToolCall } from './types'

// ---- 工具 → 人类可读动作(原始工具名只作次级信息) ----
const TOOL_VERB: Record<string, string> = {
  list_dir: '查看项目结构',
  read_file: '阅读文件',
  grep: '检索代码',
  find: '查找文件',
  glob: '匹配文件',
  search: '检索资料',
  fetch_url: '联网检索',
  web_search: '联网检索',
  current_datetime: '获取当前时间',
  write_file: '写入文件',
  edit_file: '修改文件',
  apply_patch: '应用补丁',
  create_file: '新建文件',
  str_replace: '修改文件',
  run_command: '运行命令',
  create_task: '拆分子任务',
  update_task: '更新任务',
  browser_open: '打开网页',
  browser_navigate: '打开网页',
  browser_screenshot: '截图验证',
  browser_click: '操作网页',
}

export function toolVerb(tool: string): string {
  return TOOL_VERB[tool] ?? tool.replace(/_/g, ' ')
}

// run_command 命令文本(从工具输出里抠出 "$ xxx")
function commandOf(tc: TaskToolCall): string {
  const m = tc.output.match(/\$\s+([^\n]+)/)
  return m ? m[1] : ''
}

const READ_CMD = /^(pwd|ls|cat|grep|find|head|tail|tree|wc|stat|echo|which)\b/
const VERIFY_CMD = /\b(tsc|build|test|vitest|jest|pytest|lint|eslint|pnpm|npm|yarn|node|python|go test)\b/

type Phase = 'understand' | 'context' | 'write' | 'verify' | 'deliver' | 'await'

function phaseOfTool(tc: TaskToolCall): Phase {
  const t = tc.tool
  if (t === 'write_file' || t === 'edit_file' || t === 'apply_patch' || t === 'create_file' || t === 'str_replace')
    return 'write'
  if (t === 'create_task' || t === 'update_task') return 'understand'
  if (t.startsWith('browser_')) return 'verify'
  if (t === 'run_command') {
    const cmd = commandOf(tc)
    if (VERIFY_CMD.test(cmd)) return 'verify'
    if (READ_CMD.test(cmd)) return 'context'
    return 'verify'
  }
  // 读取类(list_dir/read_file/grep/find/fetch_url/current_datetime/search/glob…)
  return 'context'
}

export type StepStatus = 'done' | 'active' | 'pending' | 'failed' | 'waiting'

export interface ProductStep {
  key: Phase
  label: string
  hint: string // 一句话说明这个阶段在做什么
  status: StepStatus
  tools: { tool: string; count: number }[] // 用到的能力(次级展示)
  toolCount: number
  detail?: string // 结果摘要
  error?: string
}

const PHASE_LABEL: Record<Phase, { label: string; hint: string }> = {
  understand: { label: '理解需求', hint: '解析目标、明确要做什么' },
  context: { label: '读取上下文', hint: '查看项目结构与相关文件' },
  write: { label: '写入 / 修改文件', hint: '产出或改动文件' },
  verify: { label: '运行验证', hint: '构建 / 测试 / 截图确认可用' },
  deliver: { label: '生成交付', hint: '把结果沉淀为可验收的交付物' },
  await: { label: '等待你确认', hint: '需要你批准 / 验收后继续' },
}

const ORDER: Phase[] = ['understand', 'context', 'write', 'verify', 'deliver', 'await']

/** 把一次任务的真实执行,归并为产品化阶段时间线。 */
export function buildProductSteps(report: TaskReport | null): ProductStep[] {
  if (!report) return []
  const latest = report.runs[0]
  if (!latest) return []

  // 工具调用按阶段聚合
  const byPhase = new Map<Phase, Map<string, number>>()
  for (const p of ORDER) byPhase.set(p, new Map())
  for (const tc of report.toolCalls) {
    if (!tc.tool) continue
    const ph = phaseOfTool(tc)
    const m = byPhase.get(ph)!
    m.set(tc.tool, (m.get(tc.tool) ?? 0) + 1)
  }

  const sandbox = report.sandbox?.run
  const buildResult = sandbox?.buildResult
  const hasDelivery = report.deliveries.some((d) => d.taskId === report.task.id)
  const pendingApproval = report.approvals.some((a) => a.status === 'pending')
  const sbReady = sandbox?.status === 'ready_for_review'
  const runStatus = latest.status
  const runFailed = runStatus === 'failed'

  // verify 阶段也吸纳沙盒 build/test 结果
  const hasActivity = (p: Phase): boolean => {
    if (p === 'understand') return true // 一旦开始执行,理解需求即完成
    if (p === 'deliver') return hasDelivery
    if (p === 'await') return pendingApproval || sbReady || runStatus === 'needs_review' || (hasDelivery && deliveryPending(report))
    if (p === 'verify') return (byPhase.get('verify')!.size > 0) || (!!buildResult && buildResult !== 'skipped')
    return byPhase.get(p)!.size > 0
  }

  // 已"到达"的最后阶段(用于判定 active/pending 边界)
  let lastReached = 0
  ORDER.forEach((p, i) => {
    if (hasActivity(p)) lastReached = i
  })

  const active = runStatus === 'running' || runStatus === 'queued'
  const succeeded = runStatus === 'succeeded'

  return ORDER.map((p, i) => {
    const meta = PHASE_LABEL[p]
    const toolsMap = byPhase.get(p)!
    const tools = [...toolsMap.entries()].map(([tool, count]) => ({ tool, count }))
    const toolCount = tools.reduce((s, t) => s + t.count, 0)
    const reached = hasActivity(p)

    let status: StepStatus
    if (p === 'await') {
      status = reached ? 'waiting' : succeeded && hasDelivery ? 'done' : 'pending'
    } else if (runFailed && i >= lastReached) {
      status = i === lastReached ? 'failed' : 'pending'
    } else if (reached) {
      status = i < lastReached || succeeded ? 'done' : active ? 'active' : 'done'
    } else {
      status = active && i === lastReached + 1 ? 'active' : 'pending'
    }

    // 结果摘要
    let detail: string | undefined
    if (p === 'understand') detail = report.task.title
    else if (p === 'context' && toolCount > 0) detail = `查阅了 ${toolCount} 处上下文`
    else if (p === 'write' && sandbox?.diffSummary) detail = sandbox.diffSummary
    else if (p === 'write' && toolCount > 0) detail = `${toolCount} 次文件写入`
    else if (p === 'verify') {
      if (buildResult && buildResult !== 'skipped')
        detail = buildResult === 'pass' ? '构建 / 测试通过' : buildResult === 'fail' ? '构建 / 测试失败' : '构建 / 测试部分通过'
      else if (toolCount > 0) detail = `运行了 ${toolCount} 条验证命令`
    } else if (p === 'deliver' && hasDelivery) {
      const d = report.deliveries.find((x) => x.taskId === report.task.id)
      detail = d?.title
    } else if (p === 'await') {
      if (pendingApproval) detail = '有高危操作待你批准'
      else if (sbReady) detail = '沙盒已就绪,待你验收应用'
      else if (runStatus === 'needs_review') detail = '达工具上限,可继续执行'
      else if (deliveryPending(report)) detail = '交付物待你确认'
    }

    return {
      key: p,
      label: meta.label,
      hint: meta.hint,
      status,
      tools,
      toolCount,
      detail,
      error: status === 'failed' ? latest.error ?? undefined : undefined,
    }
  }).filter((s) => {
    // await 阶段没到达就隐藏(避免恒挂"等待确认");deliver 未到达但已成功也展示(提示可生成交付)
    if (s.key === 'await' && s.status === 'pending') return false
    return true
  })
}

function deliveryPending(report: TaskReport): boolean {
  return report.deliveries.some((d) => d.taskId === report.task.id && d.status === 'pending')
}
