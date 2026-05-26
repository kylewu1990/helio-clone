import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Menu,
  Target,
  Sparkles,
  Loader2,
  Send,
  Play,
  RotateCw,
  Gauge,
  CircleDot,
  Hand,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ListChecks,
  PackageCheck,
  ShieldAlert,
  Plus,
  HelpCircle,
  Wand2,
  Zap,
  Footprints,
} from 'lucide-react'
import { api } from '../../lib/api'
import { Avatar } from '../Avatar'
import { AssignMenu } from './AssignMenu'
import { StepTimeline } from './StepTimeline'
import { DeliveryCenter } from './DeliveryCenter'
import { ActivityFeed } from './ActivityFeed'
import { buildProductSteps } from '../../lib/steps'
import {
  RUN_STATUS_META,
  latestRunByTask,
  mapActivities,
  mapDeliveries,
} from '../../lib/workspace'
import type {
  Assistant,
  Task,
  User,
  MissionRow,
  MissionDetail,
  TaskRunRow,
  SandboxRunListRow,
  ApprovalRow,
  IsolationInfo,
  TaskReport,
  PendingInputRow,
} from '../../lib/types'

const MISSION_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草案', color: 'var(--text-tertiary)' },
  planning: { label: '规划中', color: 'var(--info)' },
  ready: { label: '就绪', color: 'var(--info)' },
  running: { label: '执行中', color: 'var(--agent-working)' },
  review: { label: '复核中', color: 'var(--warning)' },
  delivered: { label: '已交付', color: 'var(--success)' },
  archived: { label: '已归档', color: 'var(--text-tertiary)' },
}

const ACTIVE_RUN = new Set(['queued', 'running', 'needs_approval'])
const CAP_LABEL: Record<string, string> = {
  run_command: '运行命令',
  write_file: '写文件',
  computer_control: '电脑控制',
  browser_control: '浏览器自动化',
}

// Mission —— 纯目标管理层(非聊天/非工作台):Overview / Task Breakdown / Delivery / Pending / Progress。
// 真正的 Genspark 式工作区在 Chat 频道里;这里负责发布、拆解、指派、状态与交付。
export function MissionWorkspace({
  missionId,
  missions,
  taskRuns,
  sandboxRuns,
  approvals,
  users,
  assistants,
  onBack,
  onMenuClick,
  onAssignTask,
  onAutoAssign,
  onExecuteTask,
  onContinueRun,
  onDecideDelivery,
  onCreateDelivery,
  onAddMissionTask,
  onBreakdownMission,
  onOpenReport,
  onOpenAssistantChat,
  onOpenPendingInput,
}: {
  missionId: string
  missions: MissionRow[]
  taskRuns: TaskRunRow[]
  sandboxRuns: SandboxRunListRow[]
  approvals: ApprovalRow[]
  users: User[]
  assistants: Assistant[]
  statuses: Record<string, { status: string; ts: number }>
  isolation: IsolationInfo | null
  onBack: () => void
  onMenuClick: () => void
  onAssignTask: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onExecuteTask: (taskId: string) => void
  onContinueRun: (taskRunId: string) => void | Promise<void>
  onDecideDelivery: (id: string, status: 'approved' | 'rejected') => void
  onCreateDelivery: (data: { taskId?: string; missionId?: string; title: string; summary?: string }) => void
  onAddMissionTask: (missionId: string, title: string) => void
  onBreakdownMission: (missionId: string) => void | Promise<void>
  onOpenReport: (taskId: string) => void
  onOpenAssistantChat: (assistantId: string) => void
  onOpenPendingInput?: (pi: PendingInputRow) => void
}) {
  const [detail, setDetail] = useState<MissionDetail | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [report, setReport] = useState<TaskReport | null>(null)
  const [instruction, setInstruction] = useState('')
  const [breaking, setBreaking] = useState(false)
  const [adding, setAdding] = useState(false)

  const missionRow = missions.find((m) => m.id === missionId) ?? detail?.mission ?? null

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await api.mission(missionId))
    } catch {
      setDetail(null)
    }
  }, [missionId])
  useEffect(() => {
    loadDetail()
  }, [loadDetail, taskRuns])

  const tasks = useMemo(() => detail?.tasks ?? [], [detail])
  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks])
  const runByTask = useMemo(() => latestRunByTask(taskRuns), [taskRuns])
  const missionSandboxes = useMemo(
    () => sandboxRuns.filter((s) => s.missionId === missionId || (s.taskId && taskIds.has(s.taskId))),
    [sandboxRuns, missionId, taskIds],
  )
  const missionDeliveries = useMemo(() => mapDeliveries(detail?.deliveries ?? [], users), [detail, users])
  const activities = useMemo(() => mapActivities(detail?.audit ?? [], users), [detail, users])
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === 'pending' && (a.missionId === missionId || (a.taskId && taskIds.has(a.taskId)))),
    [approvals, missionId, taskIds],
  )
  // 团队 = 被指派到本 Mission 子任务的助手
  const team = useMemo(() => {
    const seen = new Map<string, User>()
    for (const t of tasks) if (t.assignee && !seen.has(t.assignee.id)) seen.set(t.assignee.id, t.assignee)
    return [...seen.values()]
  }, [tasks])

  // 展开子任务时拉报告(看执行步骤),执行中轮询
  const loadReport = useCallback(async () => {
    if (!expandedTaskId) {
      setReport(null)
      return
    }
    try {
      setReport(await api.taskReport(expandedTaskId))
    } catch {
      setReport(null)
    }
  }, [expandedTaskId])
  useEffect(() => {
    loadReport()
  }, [loadReport, taskRuns])
  const reportActive = report?.runs[0] && ACTIVE_RUN.has(report.runs[0].status)
  useEffect(() => {
    if (!reportActive) return
    const t = setInterval(loadReport, 2500)
    return () => clearInterval(t)
  }, [reportActive, loadReport])

  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const review = tasks.filter((t) => t.status === 'review').length
  // 进度口径:已完成 + 待复核(产出已就绪)都计入,状态与真实 run/delivery 一致
  const pct = total ? Math.round(((done + review) / total) * 100) : 0
  const activeCount = tasks.filter((t) => {
    const r = runByTask.get(t.id)
    return r && ACTIVE_RUN.has(r.status)
  }).length
  const pendingDelivery = missionDeliveries.filter((d) => d.status === 'pending').length
  const deliveredCount = missionDeliveries.filter((d) => d.status === 'approved').length
  const meta = (() => {
    if (pendingDelivery > 0) return { label: '待验收', color: 'var(--accent-text)' }
    if (activeCount > 0) return { label: '执行中', color: 'var(--info)' }
    if (total > 0 && done === total) return { label: '已交付', color: 'var(--success)' }
    if (review > 0) return { label: '复核中', color: 'var(--warning)' }
    return MISSION_STATUS[missionRow?.status ?? 'draft'] ?? { label: missionRow?.status ?? '', color: 'var(--text-tertiary)' }
  })()

  const submitInstruction = () => {
    const v = instruction.trim()
    if (!v) return
    onAddMissionTask(missionId, v)
    setInstruction('')
    setAdding(false)
  }
  const breakdown = async () => {
    if (breaking) return
    setBreaking(true)
    try {
      await onBreakdownMission(missionId)
      await loadDetail()
    } finally {
      setBreaking(false)
    }
  }

  const steps = useMemo(() => buildProductSteps(report), [report])
  const reportExecutor = report?.runs[0]?.assistantId
    ? users.find((u) => u.id === report.runs[0].assistantId)?.name
    : undefined
  const primaryAssistant = team[0]?.id ?? null

  const pendingInputs = detail?.pendingInputs ?? []
  const runMode = missionRow?.runMode ?? null
  const hasTodo = tasks.some((t) => t.status === 'todo')
  const anyActive = tasks.some((t) => {
    const r = runByTask.get(t.id)
    return r && ACTIVE_RUN.has(r.status)
  })
  const [running, setRunning] = useState(false)
  const runMission = async (mode: 'auto' | 'confirm' | 'plan') => {
    if (running) return
    setRunning(true)
    try {
      await api.runMission(missionId, mode)
      await loadDetail()
    } finally {
      setRunning(false)
    }
  }
  const advance = async () => {
    if (running) return
    setRunning(true)
    try {
      await api.advanceMission(missionId)
      await loadDetail()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--chrome-frame)] px-4 py-3">
        <button onClick={onMenuClick} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--hover)] md:hidden">
          <Menu size={18} />
        </button>
        <button
          onClick={onBack}
          className="flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
        >
          <ArrowLeft size={16} /> <span className="hidden sm:inline">总览</span>
        </button>
        <div className="h-5 w-px bg-[var(--border)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">Mission</div>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{missionRow?.title ?? '加载中…'}</h1>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
              style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 13%, transparent)` }}
            >
              {activeCount > 0 && <CircleDot size={10} className="agent-pulse-ring" />}
              {meta.label}
            </span>
          </div>
        </div>
        {primaryAssistant && (
          <button
            onClick={() => onOpenAssistantChat(primaryAssistant)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
            title="进入执行该 Mission 的 AI 助手 Chat 工作区"
          >
            <MessageSquare size={14} /> <span className="hidden sm:inline">在 Chat 协作</span>
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-4 p-4 md:p-6">
          {/* ---- Mission Overview ---- */}
          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
                <Target size={12} className="text-[var(--accent-text)]" /> 目标
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{missionRow?.goal}</p>
              {total > 0 && (
                <div className="mt-3.5">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                    <span>{done}/{total} 子任务完成</span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                </div>
              )}
              {team.length > 0 && (
                <div className="mt-3.5 flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-tertiary)]">团队</span>
                  <div className="flex -space-x-1.5">
                    {team.map((a) => (
                      <button key={a.id} onClick={() => onOpenAssistantChat(a.id)} title={`与 ${a.name} 协作`} className="ring-2 ring-[var(--surface-1)]" style={{ borderRadius: 'var(--radius-md)' }}>
                        <Avatar user={{ name: a.name, avatarColor: a.avatarColor, isAssistant: true }} size={22} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat n={activeCount} label="执行中" color="var(--info)" icon={<CircleDot size={13} />} />
              <Stat n={pendingApprovals.length} label="待确认" color="var(--warning)" icon={<Hand size={13} />} />
              <Stat n={pendingDelivery} label="待验收" color="var(--accent-text)" icon={<PackageCheck size={13} />} />
              <Stat n={deliveredCount} label="已交付" color="var(--success)" icon={<PackageCheck size={13} />} />
            </div>
          </section>

          {/* ---- 待你补充信息(needs_input,#5 在 Mission 可见)---- */}
          {pendingInputs.length > 0 && (
            <section className="rounded-[var(--radius-xl)] border p-3.5 surface-glow" style={{ borderColor: 'color-mix(in oklch, var(--accent) 35%, var(--border))', background: 'var(--accent-soft)' }}>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--accent-text)]">
                <HelpCircle size={13} /> AI 需要你补充信息 · {pendingInputs.length}
              </div>
              <div className="flex flex-col gap-2">
                {pendingInputs.map((pi) => (
                  <div key={pi.id} className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-1)] px-3 py-2">
                    <span className="min-w-0 flex-1 text-[12.5px] text-[var(--text-primary)]">{pi.question}</span>
                    <button
                      onClick={() => onOpenPendingInput?.(pi)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] font-medium text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Wand2 size={12} /> 去补充
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- 运行控制:三模式 / 逐步推进(#3)---- */}
          {total > 0 && hasTodo && (
            <section className="flex flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-3">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                <Play size={13} className="text-[var(--accent-text)]" /> 运行
              </span>
              {runMode && (
                <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10.5px] text-[var(--text-tertiary)]">
                  当前模式:{runMode === 'auto' ? '一键跑完' : runMode === 'confirm' ? '逐步确认' : '只计划'}
                </span>
              )}
              {anyActive ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--info)]">
                  <Loader2 size={13} className="animate-spin" /> 执行中…
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => runMission('auto')}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    <Zap size={13} /> 一键跑完
                  </button>
                  <button
                    onClick={advance}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)] disabled:opacity-50"
                  >
                    <Footprints size={13} /> 执行下一步
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ---- Task Breakdown ---- */}
          <section>
            <SectionHead icon={<ListChecks size={14} />} title="任务拆解" count={total}>
              {total > 0 && (
                <button
                  onClick={() => setAdding((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
                >
                  <Plus size={12} /> 补一条子任务
                </button>
              )}
            </SectionHead>

            {adding && (
              <div className="mb-3 flex items-end gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-2.5">
                <textarea
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitInstruction()
                    }
                  }}
                  rows={2}
                  placeholder="新增一个子任务 / 一步工作,回车提交…"
                  className="min-h-0 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
                />
                <button
                  onClick={submitInstruction}
                  disabled={!instruction.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  <Send size={15} />
                </button>
              </div>
            )}

            {total === 0 ? (
              <div className="flex flex-col items-center gap-2.5 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-6 py-12 text-center">
                <Sparkles size={26} className="text-[var(--accent-text)]" strokeWidth={1.5} />
                <p className="text-[13px] font-medium text-[var(--text-primary)]">还没有子任务</p>
                <p className="max-w-sm text-[12px] text-[var(--text-tertiary)]">让 AI 把目标拆解为可执行子任务,再逐个指派、执行、交付。</p>
                <button
                  onClick={breakdown}
                  disabled={breaking}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {breaking ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  AI 拆解工作流
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {tasks.map((t) => (
                  <SubtaskRow
                    key={t.id}
                    task={t}
                    run={runByTask.get(t.id)}
                    expanded={t.id === expandedTaskId}
                    assistants={assistants}
                    steps={t.id === expandedTaskId ? steps : []}
                    executor={t.id === expandedTaskId ? reportExecutor : undefined}
                    report={t.id === expandedTaskId ? report : null}
                    onToggle={() => setExpandedTaskId((cur) => (cur === t.id ? null : t.id))}
                    onAssign={(aid) => onAssignTask(t.id, aid)}
                    onAuto={() => onAutoAssign(t.id)}
                    onExecute={() => onExecuteTask(t.id)}
                    onContinue={(rid) => onContinueRun(rid)}
                    onOpenReport={() => onOpenReport(t.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ---- Pending(本 Mission 待你处理的高危审批)---- */}
          {pendingApprovals.length > 0 && (
            <section>
              <SectionHead icon={<Hand size={14} />} title="待你处理" count={pendingApprovals.length} />
              <div className="flex flex-col gap-2">
                {pendingApprovals.map((a) => {
                  const task = tasks.find((t) => t.id === a.taskId)
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-[var(--radius-lg)] border px-3.5 py-3"
                      style={{ borderColor: 'color-mix(in oklch, var(--warning) 35%, var(--border))', background: 'color-mix(in oklch, var(--warning) 7%, transparent)' }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)]" style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 14%, transparent)' }}>
                        <ShieldAlert size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                          高危能力:{CAP_LABEL[a.capability] ?? a.capability}
                        </div>
                        <div className="truncate text-[11.5px] text-[var(--text-tertiary)]">
                          {a.command ? <code className="font-mono">{a.command}</code> : (task ? `任务「${task.title}」` : '待你批准后继续执行')}
                        </div>
                      </div>
                      {task && (
                        <button
                          onClick={() => onOpenReport(task.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
                        >
                          <Gauge size={12} /> 去处理
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ---- Delivery ---- */}
          <section>
            <SectionHead icon={<PackageCheck size={14} />} title="交付" count={missionDeliveries.length || undefined} />
            <DeliveryCenter
              deliveries={missionDeliveries}
              sandboxRuns={missionSandboxes}
              doneTasks={tasks.filter((t) => t.status === 'done')}
              onDecide={onDecideDelivery}
              onCreate={onCreateDelivery}
            />
          </section>

          {/* ---- Progress(活动)---- */}
          {activities.length > 0 && (
            <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <ActivityFeed events={activities} limit={20} title="Mission 进展" />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- 子任务行(可展开看执行步骤) ----
function SubtaskRow({
  task,
  run,
  expanded,
  assistants,
  steps,
  executor,
  report,
  onToggle,
  onAssign,
  onAuto,
  onExecute,
  onContinue,
  onOpenReport,
}: {
  task: Task
  run?: TaskRunRow
  expanded: boolean
  assistants: Assistant[]
  steps: ReturnType<typeof buildProductSteps>
  executor?: string
  report: TaskReport | null
  onToggle: () => void
  onAssign: (assistantId: string) => void
  onAuto: () => void
  onExecute: () => void
  onContinue: (runId: string) => void
  onOpenReport: () => void
}) {
  const status = run?.status
  const active = status && ACTIVE_RUN.has(status)
  const dot =
    task.status === 'done'
      ? 'var(--success)'
      : active
        ? status === 'needs_approval'
          ? 'var(--warning)'
          : 'var(--info)'
        : status === 'failed' || status === 'needs_review'
          ? 'var(--warning)'
          : 'var(--text-tertiary)'
  const latest = report?.runs[0]
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-start gap-2.5 p-3">
        <button onClick={onToggle} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" title={expanded ? '收起' : '展开执行步骤'}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${active ? 'agent-pulse-ring' : ''}`} style={{ background: dot }} />
        <div className="min-w-0 flex-1">
          <button onClick={onToggle} className="block w-full text-left">
            <p className="text-[13px] font-medium leading-snug text-[var(--text-primary)]">{task.title}</p>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {task.assignee ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                <Avatar user={{ name: task.assignee.name, avatarColor: task.assignee.avatarColor, isAssistant: true }} size={14} />
                {task.assignee.name}
              </span>
            ) : (
              <span className="text-[11px] text-[var(--text-tertiary)]">未指派</span>
            )}
            {status && (
              <span className="text-[10.5px]" style={{ color: (RUN_STATUS_META[status] ?? {}).color ?? 'var(--text-tertiary)' }}>
                {(RUN_STATUS_META[status] ?? { label: status }).label}
              </span>
            )}
            {task.expectedOutput && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                <PackageCheck size={10} /> {task.expectedOutput}
              </span>
            )}
          </div>
        </div>
        {/* 行内操作 */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {!task.assignee && task.status === 'todo' && (
            <AssignMenu assistants={assistants} onPick={onAssign} onAuto={onAuto} size="xs" />
          )}
          {task.assignee && task.status === 'todo' && !active && (
            <ActBtn icon={<Play size={11} />} tone="accent" onClick={onExecute}>开始执行</ActBtn>
          )}
          {(status === 'needs_review' || status === 'failed') && run && (
            <ActBtn icon={<RotateCw size={11} />} tone="warning" onClick={() => onContinue(run.id)}>继续</ActBtn>
          )}
          {run && <ActBtn icon={<Gauge size={11} />} onClick={onOpenReport}>驾驶舱</ActBtn>}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-3.5">
          {!latest ? (
            <p className="py-4 text-center text-[12px] text-[var(--text-tertiary)]">
              「{task.title}」还没有执行。{task.assignee ? '点「开始执行」开始。' : '先指派给一个 AI 助手。'}
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
                <Gauge size={11} className="text-[var(--accent-text)]" /> 执行步骤
              </div>
              <StepTimeline steps={steps} executorName={executor} />
              {latest.output && !latest.error && (
                <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] p-2.5">
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">AI 汇报</div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">{latest.output}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ActBtn({
  icon,
  children,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'accent' | 'warning'
}) {
  const style =
    tone === 'accent'
      ? { background: 'var(--accent)', color: 'white', borderColor: 'transparent' }
      : tone === 'warning'
        ? { color: 'var(--warning)', borderColor: 'var(--border-strong)' }
        : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1 text-[10.5px] font-medium transition-colors hover:opacity-90"
      style={style}
    >
      {icon}
      {children}
    </button>
  )
}

function Stat({ n, label, color, icon }: { n: number; label: string; color: string; icon: React.ReactNode }) {
  const on = n > 0
  return (
    <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <span style={{ color: on ? color : 'var(--text-tertiary)' }}>{icon}</span>
      <div className="mt-2">
        <div className="text-[19px] font-semibold tabular-nums leading-none" style={{ color: on ? color : 'var(--text-tertiary)' }}>{n}</div>
        <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  )
}

function SectionHead({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  children?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      <span className="text-[var(--accent-text)]">{icon}</span>
      <span className="text-[12px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase">{title}</span>
      {count != null && <span className="text-[12px] text-[var(--text-tertiary)]">· {count}</span>}
      {children && <span className="ml-auto">{children}</span>}
    </div>
  )
}
