/* AI Team Command Center —— 前端适配层(真实数据驱动)

   全部派生只用真实数据(真实 Assistant / Task / 任务状态 / 真实
   Mission / Review / Delivery / AuditEvent)。无真实数据源的分区返回空,
   由组件渲染诚实空状态。纯函数,无副作用,无任何 mock。 */

import type {
  Agent,
  AgentRole,
  AgentStatus,
  Assistant,
  Mission,
  MissionPriority,
  MissionStatus,
  Task,
  User,
  ActivityEvent,
  ActivityEventType,
  Delivery,
  MissionPlan,
  Subtask,
  SubtaskStatus,
  ReviewItem,
  ReviewVerdict,
  ApprovalItem,
  AuditEventRow,
  DeliveryRow,
  ReviewRow,
  TaskRunRow,
  ApprovalRow,
  SandboxRunListRow,
} from './types'

// ---------- 用户解析 ----------

function resolveUser(
  users: User[],
  id: string | null | undefined,
): { name: string; color: number } | null {
  if (!id) return null
  const u = users.find((x) => x.id === id)
  return u ? { name: u.name, color: u.avatarColor } : null
}

// ---------- 角色推断(由真实 name + skills + systemPrompt) ----------

const ROLE_RULES: [AgentRole, RegExp][] = [
  ['Reviewer', /(review|审|复核|检查|质量|qa|测试|test)/i],
  ['Designer', /(design|设计|ui|ux|视觉|绘|画图|image)/i],
  ['Researcher', /(research|研究|调研|教研|分析|analyst|fetch_url|市场)/i],
  ['Developer', /(dev|code|工程|开发|coder|build|程序|技术|run_command|软件)/i],
  ['Writer', /(writ|文案|写作|编辑|author|copy)/i],
  ['Ops', /(ops|运维|部署|运营|devops|秘书|会议|协调|日程|calendar|event)/i],
  ['Product Strategist', /(product|产品|策略|strateg|pm|规划|经理)/i],
]

function inferRole(a: Assistant): AgentRole {
  const hay = `${a.name} ${a.systemPrompt ?? ''} ${a.skills.join(' ')}`
  for (const [role, re] of ROLE_RULES) if (re.test(hay)) return role
  return 'Developer'
}

function trustFromSkills(count: number): 1 | 2 | 3 {
  if (count >= 5) return 3
  if (count >= 2) return 2
  return 1
}

const REVIEW_HINT = /(审|复核|检查|review)/i

/** 由真实 Assistant + 实时工作状态 + 真实 TaskRun 派生 AI 队员。无真实助手时返回 []。
 * 关键:只有「实时生成中(live status)」或「存在真实 running/queued/needs_approval 的 TaskRun」
 * 才算 AI 在执行;task.status==='doing' 但无 TaskRun ≠ AI 执行,不再据此标 working。 */
export function deriveAgents(
  assistants: Assistant[],
  tasks: Task[],
  statuses: Record<string, { status: string; ts: number }>,
  runByTask?: Map<string, TaskRunRow>,
): Agent[] {
  // 每个助手作为执行人的最新 run 状态(真实执行运行时)
  const runState = new Map<
    string,
    { active: boolean; needsApproval: boolean; taskId?: string }
  >()
  if (runByTask) {
    for (const [taskId, r] of runByTask) {
      if (!r.assistantId) continue
      const cur = runState.get(r.assistantId) ?? { active: false, needsApproval: false }
      if (r.status === 'running' || r.status === 'queued') {
        cur.active = true
        cur.taskId = taskId
      } else if (r.status === 'needs_approval') {
        cur.needsApproval = true
        if (!cur.taskId) cur.taskId = taskId
      }
      runState.set(r.assistantId, cur)
    }
  }
  return assistants.map((a) => {
    const myTasks = tasks.filter((t) => t.assignee?.id === a.id)
    const live = statuses[a.id]
    const rs = runState.get(a.id)

    let status: AgentStatus = 'idle'
    let currentTaskTitle: string | undefined
    if (live) {
      status = REVIEW_HINT.test(live.status) ? 'reviewing' : 'working'
      currentTaskTitle = live.status
    } else if (rs?.active) {
      status = 'working'
      currentTaskTitle = tasks.find((t) => t.id === rs.taskId)?.title
    } else if (rs?.needsApproval) {
      status = 'blocked'
      currentTaskTitle = tasks.find((t) => t.id === rs.taskId)?.title
    } else if (myTasks.some((t) => t.status === 'done')) {
      status = 'done'
    }

    return {
      id: a.id,
      name: a.name,
      role: inferRole(a),
      status,
      currentTaskId: rs?.taskId,
      currentTaskTitle,
      avatarColor: a.avatarColor,
      trustLevel: trustFromSkills(a.skills.length),
      available: a.hasApiKey, // 无自带 key 的助手标记为不可用(真实)
    }
  })
}

// ---------- Mission(看板)派生 ----------

const TASK_STATUS_MAP: Record<string, MissionStatus> = {
  todo: 'backlog',
  doing: 'in_progress',
  review: 'review',
  done: 'delivered',
}

function priorityFromTask(t: Task): MissionPriority {
  const p = (t.priority ?? '').toLowerCase()
  if (p === 'urgent' || p === 'high' || p === 'medium' || p === 'low') return p
  // 无真实优先级时按 id 稳定派生(仅视觉编码,不抖动)
  const order: MissionPriority[] = ['low', 'medium', 'high', 'urgent']
  let h = 0
  for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0
  return order[h % order.length]
}

/** 真实 Task → 看板卡 Mission。后端无 review 状态机时 review 列保持为空。 */
export function buildBoardMissions(tasks: Task[]): Mission[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: TASK_STATUS_MAP[t.status] ?? 'backlog',
    priority: priorityFromTask(t),
    assigneeId: t.assignee?.id,
    assigneeName: t.assignee?.name ?? undefined,
    assigneeColor: t.assignee?.avatarColor,
    estimatedOutput: t.expectedOutput ?? (t.channel?.name ? `#${t.channel.name}` : undefined),
    missionId: t.missionId ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }))
}

// ---------- 任务拆解 / 并行执行(真实任务) ----------

// 子任务状态:只有存在真实 running/queued 的 TaskRun 才算「执行中」;
// doing 但无 TaskRun → 'manual'(手动进行中,不是 AI 在执行);needs_approval → 'blocked'。
function subtaskStatusOf(t: Task, run?: TaskRunRow): SubtaskStatus {
  if (t.status === 'done') return 'done'
  if (t.status === 'review') return 'review'
  if (t.status === 'doing') {
    if (run && (run.status === 'running' || run.status === 'queued')) return 'running'
    if (run && run.status === 'needs_approval') return 'blocked'
    return 'manual'
  }
  return 'pending'
}

function tasksToSubtasks(
  items: Task[],
  runByTask?: Map<string, TaskRunRow>,
): Subtask[] {
  const laneOf = new Map<string, number>()
  let nextLane = 2
  return items.slice(0, 16).map((t) => {
    let lane = 1
    const key = t.assignee?.id
    if (key) {
      if (!laneOf.has(key)) laneOf.set(key, nextLane++)
      lane = laneOf.get(key)!
    }
    return {
      id: t.id,
      title: t.title,
      status: subtaskStatusOf(t, runByTask?.get(t.id)),
      ownerName: t.assignee?.name ?? undefined,
      ownerColor: t.assignee?.avatarColor,
      lane,
      output: t.expectedOutput ?? (t.channel?.name ? `#${t.channel.name}` : undefined),
    }
  })
}

/** 由真实 Mission 的目标 + 其真实子任务构建拆解视图(用真实 TaskRun 判定执行中)。 */
export function buildPlanFromTasks(
  goal: string,
  tasks: Task[],
  runByTask?: Map<string, TaskRunRow>,
): MissionPlan {
  return {
    missionId: 'mission',
    goal,
    goalIsReal: true,
    subtasks: tasksToSubtasks(tasks, runByTask),
  }
}

/** 未选中 Mission 时的回退:把真实任务按频道分组成一个拆解视图。无任务返回 null。 */
export function buildMissionPlan(
  tasks: Task[],
  runByTask?: Map<string, TaskRunRow>,
): MissionPlan | null {
  if (!tasks.length) return null
  const byChannel = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.channel?.name) continue
    byChannel.set(t.channel.name, [...(byChannel.get(t.channel.name) ?? []), t])
  }
  let best: { name: string; items: Task[] } | null = null
  for (const [name, items] of byChannel) {
    if (items.length >= 2 && (!best || items.length > best.items.length)) {
      best = { name, items }
    }
  }
  if (best) return buildPlanFromTasks(`#${best.name}`, best.items, runByTask)
  const active = tasks.filter((t) => t.status === 'doing' || t.status === 'todo')
  const focus = active.length ? active : tasks
  const doing = tasks.find((t) => t.status === 'doing')
  return buildPlanFromTasks(
    doing?.title ?? focus[0]?.title ?? '当前推进中的工作',
    focus,
    runByTask,
  )
}

/** 真实并行度:同时有真实 running/queued TaskRun 的不同执行人数(无 run 不计)。 */
export function parallelLaneCount(runByTask: Map<string, TaskRunRow>): number {
  const keys = new Set<string>()
  for (const [taskId, r] of runByTask) {
    if (r.status === 'running' || r.status === 'queued')
      keys.add(r.assistantId ?? `task-${taskId}`)
  }
  return keys.size
}

// ---------- 运行轨迹 / 审计(真实 AuditEvent) ----------

const AUDIT_TYPE_MAP: Record<string, ActivityEventType> = {
  'mission.created': 'agent-start',
  'mission.status_changed': 'file-change',
  'task.created': 'agent-start',
  'task.status_changed': 'file-change',
  'review.submitted': 'review-request',
  'delivery.created': 'delivery-ready',
  'approval.decided': 'human-confirm',
  'terminal.command': 'file-change',
  'ai.tool_call': 'agent-start',
  // 执行运行时事件
  'task.exec_started': 'agent-start',
  'task.exec_succeeded': 'agent-complete',
  'task.exec_failed': 'blocked',
  'task.exec_cancelled': 'blocked',
  'task.exec_needs_approval': 'review-request',
  'task.exec_routed': 'agent-start',
  'approval.requested': 'review-request',
}

// 需要人类介入的审计类型(Activity Feed 打「待人工确认」角标)
const AUDIT_REQUIRES_HUMAN = new Set([
  'delivery.created',
  'approval.requested',
  'task.exec_needs_approval',
])

/** 真实 AuditEvent → Activity Feed 事件。无事件返回 []。 */
export function mapActivities(
  audit: AuditEventRow[],
  users: User[],
): ActivityEvent[] {
  return audit.map((e) => {
    const actor = resolveUser(users, e.actorId)
    return {
      id: e.id,
      type: AUDIT_TYPE_MAP[e.type] ?? 'file-change',
      agentId: e.actorId ?? 'system',
      agentName: actor?.name ?? '系统',
      agentColor: actor?.color ?? 5,
      description: e.summary,
      missionId: e.missionId ?? undefined,
      timestamp: e.createdAt,
      requiresHuman: AUDIT_REQUIRES_HUMAN.has(e.type),
    }
  })
}

// ---------- 执行运行时(真实 TaskRun)派生 ----------

// 每个任务的「最新」执行记录(runs 已按 createdAt 倒序)
export function latestRunByTask(runs: TaskRunRow[]): Map<string, TaskRunRow> {
  const map = new Map<string, TaskRunRow>()
  for (const r of runs) if (!map.has(r.taskId)) map.set(r.taskId, r)
  return map
}

// 每个任务的「最新」沙盒运行(sandbox-runs 已按 createdAt 倒序)
export function latestSandboxByTask(
  runs: SandboxRunListRow[],
): Map<string, SandboxRunListRow> {
  const map = new Map<string, SandboxRunListRow>()
  for (const r of runs) if (r.taskId && !map.has(r.taskId)) map.set(r.taskId, r)
  return map
}

// 执行状态展示元数据(等待/执行中/需批准/失败/已取消/已完成)
export const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'var(--ink-30)' },
  running: { label: '执行中', color: 'var(--info)' },
  needs_approval: { label: '待批准', color: 'var(--warning)' },
  needs_review: { label: '部分完成 · 可继续', color: 'var(--warning)' },
  succeeded: { label: '已完成', color: 'var(--success)' },
  failed: { label: '失败', color: 'var(--destructive)' },
  cancelled: { label: '已取消', color: 'var(--ink-30)' },
}

// 沙盒状态展示元数据(准备/执行/测试/待验收/已应用/已丢弃/失败/已取消)
export const SANDBOX_STATUS_META: Record<string, { label: string; color: string }> = {
  preparing: { label: '准备沙盒', color: 'var(--ink-30)' },
  running: { label: '沙盒执行中', color: 'var(--info)' },
  testing: { label: '测试中', color: 'var(--info)' },
  ready_for_review: { label: '待人工验收', color: 'var(--warning)' },
  applied: { label: '已应用到主项目', color: 'var(--success)' },
  discarded: { label: '已丢弃', color: 'var(--ink-30)' },
  failed: { label: '失败', color: 'var(--destructive)' },
  cancelled: { label: '已取消', color: 'var(--ink-30)' },
}

// ---------- 交付确认(真实 Delivery) ----------

export function mapDeliveries(rows: DeliveryRow[], users: User[]): Delivery[] {
  return rows.map((d) => {
    const creator = resolveUser(users, d.createdById)
    let changedFiles: string[] = []
    if (d.artifactJson) {
      try {
        const a = JSON.parse(d.artifactJson)
        if (Array.isArray(a?.files)) changedFiles = a.files
      } catch {
        /* ignore */
      }
    }
    return {
      id: d.id,
      missionId: d.missionId,
      missionTitle: d.title,
      summary: d.summary ?? '',
      changedFiles,
      testResult: (d.testResult as Delivery['testResult']) ?? undefined,
      riskLevel: (d.riskLevel as Delivery['riskLevel']) ?? undefined,
      assigneeName: creator?.name,
      assigneeColor: creator?.color,
      status: (d.status as Delivery['status']) ?? 'pending',
      createdAt: d.createdAt,
    }
  })
}

// ---------- 质量审查(真实 Review) ----------

export function mapReviews(
  rows: ReviewRow[],
  users: User[],
  tasks: Task[],
): ReviewItem[] {
  return rows.map((r) => {
    const reviewer = resolveUser(users, r.reviewerId)
    let checks: { label: string; ok: boolean }[] = []
    if (r.checksJson) {
      try {
        const c = JSON.parse(r.checksJson)
        if (Array.isArray(c)) checks = c
      } catch {
        /* ignore */
      }
    }
    const task = r.taskId ? tasks.find((t) => t.id === r.taskId) : undefined
    return {
      id: r.id,
      targetTitle: task?.title ?? '审查项',
      reviewerName: reviewer?.name ?? '审查者',
      reviewerColor: reviewer?.color ?? 5,
      verdict: (r.verdict as ReviewVerdict) ?? 'needs_fix',
      checks,
      notes: r.notes ?? undefined,
      timestamp: r.createdAt,
    }
  })
}

// ---------- 人工确认门(由真实待审批交付聚合) ----------

export function computeApprovals(deliveries: Delivery[]): ApprovalItem[] {
  return deliveries
    .filter((d) => d.status === 'pending')
    .map((d) => ({
      id: `ap-d-${d.id}`,
      kind: 'delivery' as const,
      refId: d.id,
      title: d.missionTitle,
      detail: d.assigneeName ? `由 ${d.assigneeName} 提交 · 待你确认` : '待你确认',
      requestedBy: d.assigneeName ?? '工作区',
      createdAt: d.createdAt,
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
}

// 高危能力审批(真实 ApprovalRequest)→ 人工确认门条目。kind='action',refId=审批 id。
const CAP_LABEL: Record<string, string> = {
  run_command: '执行命令',
  write_file: '写文件',
  computer_control: '电脑控制',
  browser_control: '浏览器自动化',
}

export function mapCapabilityApprovals(
  rows: ApprovalRow[],
  users: User[],
  tasks: Task[],
): ApprovalItem[] {
  return rows
    .filter((r) => r.status === 'pending')
    .map((r) => {
      const requester = resolveUser(users, r.requestedById)
      const task = r.taskId ? tasks.find((t) => t.id === r.taskId) : undefined
      const cap = CAP_LABEL[r.capability] ?? r.capability
      return {
        id: `ap-c-${r.id}`,
        kind: 'action' as const,
        refId: r.id,
        title: r.command ? `${cap}:${r.command}` : `高危能力:${cap}`,
        detail: task ? `任务「${task.title}」· 高危动作待批准` : '高危动作待批准',
        requestedBy: requester?.name ?? '助手',
        createdAt: r.createdAt,
      }
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
}

// ---------- 首屏摘要 ----------

export interface WorkspaceSummary {
  activeAgents: number
  inProgress: number
  inReview: number
  awaitingHuman: number
}

export function computeSummary(
  agents: Agent[],
  missions: Mission[],
  reviews: ReviewItem[],
  approvals: ApprovalItem[],
): WorkspaceSummary {
  return {
    activeAgents: agents.filter(
      (a) => a.status === 'working' || a.status === 'reviewing',
    ).length,
    inProgress: missions.filter((m) => m.status === 'in_progress').length,
    inReview:
      missions.filter((m) => m.status === 'review').length +
      reviews.filter((r) => r.verdict === 'needs_fix' || r.verdict === 'blocked').length,
    awaitingHuman: approvals.length,
  }
}
