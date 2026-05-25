import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { Sparkles, Loader2, Target } from 'lucide-react'
import type {
  Assistant,
  Task,
  User,
  MissionRow,
  ReviewRow,
  DeliveryRow,
  AuditEventRow,
  TaskRunRow,
  ApprovalRow,
  Capability,
  ApprovalItem,
  SandboxRunListRow,
  IsolationInfo,
} from '../../lib/types'
import {
  buildBoardMissions,
  buildMissionPlan,
  buildPlanFromTasks,
  computeApprovals,
  computeSummary,
  deriveAgents,
  latestRunByTask,
  latestSandboxByTask,
  mapActivities,
  mapCapabilityApprovals,
  mapDeliveries,
  mapReviews,
  parallelLaneCount,
} from '../../lib/workspace'
import { CommandHeader } from './CommandHeader'
import { ApprovalGate } from './ApprovalGate'
import { MissionStrip } from './MissionStrip'
import { AgentRoster } from './AgentRoster'
import { MissionBoard } from './MissionBoard'
import { TaskBreakdown } from './TaskBreakdown'
import { QualityReview } from './QualityReview'
import { ActivityFeed } from './ActivityFeed'
import { DeliveryPanel } from './DeliveryPanel'
import { CapabilityMatrix } from './CapabilityMatrix'
import { SandboxRunsPanel } from './SandboxRunsPanel'
import { ContextVault } from './ContextVault'

const MISSION_STATUS_LABEL: Record<string, string> = {
  draft: '草案',
  planning: '规划中',
  ready: '就绪',
  running: '执行中',
  review: '复核中',
  delivered: '已交付',
  archived: '已归档',
}

// AI Team Command Center 主视图。全部真实数据驱动:三带布局(Composer / Pending / Team·Operate·Track)。
export function WorkspaceView({
  assistants,
  tasks,
  statuses,
  users,
  missions,
  reviews,
  deliveries,
  auditEvents,
  taskRuns,
  approvals,
  capabilities,
  sandboxRuns,
  isolation,
  autoExecute,
  onToggleAutoExecute,
  onAssignTask,
  onAutoAssign,
  onContinueRun,
  onRefreshSandbox,
  onComposeMission,
  onBreakdownMission,
  onSubmitReview,
  onCreateDelivery,
  onDecideDelivery,
  onAddMissionTask,
  onExecuteTask,
  onCancelTask,
  onDecideApproval,
  onOpenChannel,
  onOpenReport,
  onOpenMissions,
  onMenuClick,
}: {
  assistants: Assistant[]
  tasks: Task[]
  statuses: Record<string, { status: string; ts: number }>
  users: User[]
  missions: MissionRow[]
  reviews: ReviewRow[]
  deliveries: DeliveryRow[]
  auditEvents: AuditEventRow[]
  taskRuns: TaskRunRow[]
  approvals: ApprovalRow[]
  capabilities: Capability[]
  sandboxRuns: SandboxRunListRow[]
  isolation: IsolationInfo | null
  autoExecute: boolean
  onToggleAutoExecute: (v: boolean) => void
  onAssignTask: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onContinueRun: (taskRunId: string) => void | Promise<void>
  onRefreshSandbox: () => void | Promise<void>
  onComposeMission: (goal: string, breakdown: boolean) => Promise<string | null>
  onBreakdownMission: (missionId: string) => void | Promise<void>
  onSubmitReview: (data: {
    taskId?: string
    missionId?: string
    verdict: 'pass' | 'needs_fix' | 'blocked'
    checks?: { label: string; ok: boolean }[]
    notes?: string
  }) => void
  onCreateDelivery: (data: {
    missionId?: string
    taskId?: string
    title: string
    summary?: string
  }) => void
  onDecideDelivery: (id: string, status: 'approved' | 'rejected') => void
  onAddMissionTask: (missionId: string, title: string) => void
  onExecuteTask: (taskId: string) => void
  onCancelTask: (taskId: string) => void
  onDecideApproval: (id: string, status: 'approved' | 'rejected') => void
  onOpenChannel: (channelId: string, messageId?: string) => void
  onOpenReport: (taskId: string) => void
  onOpenMissions: () => void
  onMenuClick: () => void
}) {
  const [vaultOpen, setVaultOpen] = useState(false)
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [missionTasks, setMissionTasks] = useState<Task[] | null>(null)
  const [breakingDown, setBreakingDown] = useState(false)

  // 选中真实 Mission 时拉取其详情(真实任务拆解)
  useEffect(() => {
    if (!selectedMissionId) {
      setMissionTasks(null)
      return
    }
    let alive = true
    api
      .mission(selectedMissionId)
      .then((d) => alive && setMissionTasks(d.tasks))
      .catch(() => alive && setMissionTasks([]))
    return () => {
      alive = false
    }
  }, [selectedMissionId, tasks, auditEvents])

  const selectedMission = missions.find((m) => m.id === selectedMissionId) ?? null

  const runByTask = useMemo(() => latestRunByTask(taskRuns), [taskRuns])
  const sandboxByTask = useMemo(() => latestSandboxByTask(sandboxRuns), [sandboxRuns])
  const assistantIds = useMemo(() => new Set(assistants.map((a) => a.id)), [assistants])

  const agents = useMemo(
    () => deriveAgents(assistants, tasks, statuses, runByTask),
    [assistants, tasks, statuses, runByTask],
  )
  const boardMissions = useMemo(() => buildBoardMissions(tasks), [tasks])
  const activities = useMemo(() => mapActivities(auditEvents, users), [auditEvents, users])
  const deliveriesUI = useMemo(() => mapDeliveries(deliveries, users), [deliveries, users])
  const reviewsUI = useMemo(() => mapReviews(reviews, users, tasks), [reviews, users, tasks])
  const approvalItems = useMemo<ApprovalItem[]>(
    () => [
      ...mapCapabilityApprovals(approvals, users, tasks),
      ...computeApprovals(deliveriesUI),
    ],
    [approvals, users, tasks, deliveriesUI],
  )
  const summary = useMemo(
    () => computeSummary(agents, boardMissions, reviewsUI, approvalItems),
    [agents, boardMissions, reviewsUI, approvalItems],
  )
  const lanes = useMemo(() => parallelLaneCount(runByTask), [runByTask])

  const decideApprovalItem = (item: ApprovalItem, status: 'approved' | 'rejected') => {
    if (item.kind === 'action') onDecideApproval(item.refId, status)
    else onDecideDelivery(item.refId, status)
  }

  const openRunChannel = (taskId: string) => {
    const ch = runByTask.get(taskId)?.channelId
    if (ch) onOpenChannel(ch)
  }

  const plan = useMemo(() => {
    if (selectedMission)
      return buildPlanFromTasks(selectedMission.goal, missionTasks ?? [], runByTask)
    return buildMissionPlan(tasks, runByTask)
  }, [selectedMission, missionTasks, tasks, runByTask])

  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'done'), [tasks])
  const reviewableTasks = useMemo(
    () => tasks.filter((t) => t.status === 'doing' || t.status === 'review' || t.status === 'done'),
    [tasks],
  )

  // Composer:创建(+可选 AI 拆解)后自动选中新 Mission
  const handleCompose = async (goal: string, breakdown: boolean) => {
    const id = await onComposeMission(goal, breakdown)
    if (id) setSelectedMissionId(id)
  }

  const handleBreakdown = async () => {
    if (!selectedMission || breakingDown) return
    setBreakingDown(true)
    try {
      await onBreakdownMission(selectedMission.id)
    } finally {
      setBreakingDown(false)
    }
  }

  const selectedTaskCount = selectedMission
    ? (missionTasks?.length ?? tasks.filter((t) => t.missionId === selectedMission.id).length)
    : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CommandHeader
        summary={summary}
        onCompose={handleCompose}
        onOpenVault={() => setVaultOpen(true)}
        onMenuClick={onMenuClick}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Pending Deck:高危能力审批 + 待确认交付(置顶高亮,空则不渲染) */}
        <ApprovalGate items={approvalItems} onDecide={decideApprovalItem} />

        <div className="flex flex-col gap-4 p-4">
          {/* Mission 选择条 */}
          <MissionStrip
            missions={missions}
            selectedId={selectedMissionId}
            onSelect={(id) => setSelectedMissionId((cur) => (cur === id ? null : id))}
          />

          {/* 选中 Mission 的焦点条:目标 + 状态 + AI 拆解 */}
          {selectedMission && (
            <div className="surface-card flex flex-wrap items-center gap-3 px-4 py-3">
              <Target size={16} className="shrink-0 text-[var(--accent-text)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
                    {selectedMission.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                    {MISSION_STATUS_LABEL[selectedMission.status] ?? selectedMission.status}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                    {selectedTaskCount} 个子任务
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]" title={selectedMission.goal}>
                  {selectedMission.goal}
                </p>
              </div>
              <button
                onClick={handleBreakdown}
                disabled={breakingDown}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] px-3 py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
                title="让 AI 把该 Mission 的目标拆解为可执行子任务"
              >
                {breakingDown ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {breakingDown ? 'AI 拆解中…' : selectedTaskCount > 0 ? '再次 AI 拆解' : 'AI 拆解'}
              </button>
            </div>
          )}

          {/* 三栏作战台:Team · Operate · Track */}
          <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_340px]">
            {/* 左:AI 团队 + 能力 */}
            <div className="flex min-w-0 flex-col gap-4">
              <Panel className="max-h-[520px]">
                <AgentRoster agents={agents} parallelLanes={lanes} />
              </Panel>
              <Panel className="max-h-[300px]">
                <CapabilityMatrix capabilities={capabilities} />
              </Panel>
            </div>

            {/* 中:Mission Board + 任务拆解 */}
            <div className="flex min-w-0 flex-col gap-4">
              <Panel className="max-h-[380px]">
                <MissionBoard
                  missions={boardMissions}
                  runByTask={runByTask}
                  sandboxByTask={sandboxByTask}
                  assistantIds={assistantIds}
                  assistants={assistants}
                  autoExecute={autoExecute}
                  onToggleAutoExecute={onToggleAutoExecute}
                  onAssign={onAssignTask}
                  onAutoAssign={onAutoAssign}
                  onOpenFull={onOpenMissions}
                  onExecute={onExecuteTask}
                  onContinue={onContinueRun}
                  onCancel={onCancelTask}
                  onOpenRun={openRunChannel}
                  onOpenReport={onOpenReport}
                />
              </Panel>
              <Panel className="max-h-[460px]">
                <TaskBreakdown
                  plan={plan}
                  parallelLanes={lanes}
                  mission={selectedMission}
                  runByTask={runByTask}
                  assistants={assistants}
                  onAssign={onAssignTask}
                  onAutoAssign={onAutoAssign}
                  onOpenReport={onOpenReport}
                  onAddTask={
                    selectedMission ? (title) => onAddMissionTask(selectedMission.id, title) : undefined
                  }
                />
              </Panel>
            </div>

            {/* 右:运行轨迹 + 交付 + 质量 */}
            <div className="flex min-w-0 flex-col gap-4">
              <Panel className="max-h-[360px]">
                <ActivityFeed events={activities} />
              </Panel>
              <Panel className="max-h-[320px]">
                <DeliveryPanel
                  deliveries={deliveriesUI}
                  doneTasks={doneTasks}
                  onDecide={onDecideDelivery}
                  onCreate={onCreateDelivery}
                />
              </Panel>
              <Panel className="max-h-[300px]">
                <QualityReview
                  reviews={reviewsUI}
                  reviewableTasks={reviewableTasks}
                  onSubmit={onSubmitReview}
                />
              </Panel>
            </div>
          </div>

          {/* 沙盒运行:最近隔离执行(诚实标注 + diff/build·test/截图 + apply/discard/继续) */}
          <Panel className="max-h-[460px]">
            <SandboxRunsPanel
              runs={sandboxRuns}
              isolation={isolation}
              onChanged={onRefreshSandbox}
              onContinue={onContinueRun}
              onOpenReport={onOpenReport}
            />
          </Panel>
        </div>
      </div>

      <ContextVault open={vaultOpen} onClose={() => setVaultOpen(false)} />
    </div>
  )
}

// 统一分区面板:surface-1 升起 + 描边,在深色 canvas 上形成层次。
function Panel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-3 ${className}`}>
      {children}
    </div>
  )
}
