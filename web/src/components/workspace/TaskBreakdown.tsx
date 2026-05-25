import { useState } from 'react'
import { GitFork, Plus, Target, FileText } from 'lucide-react'
import { Avatar } from '../Avatar'
import { SectionTitle, EmptyHint } from './AgentRoster'
import { AssignMenu } from './AssignMenu'
import type {
  Assistant,
  MissionPlan,
  MissionRow,
  Subtask,
  SubtaskStatus,
  TaskRunRow,
} from '../../lib/types'

const STATUS_META: Record<SubtaskStatus, { label: string; color: string }> = {
  pending: { label: '待办', color: 'var(--ink-30)' },
  running: { label: '执行中', color: 'var(--info)' },
  review: { label: '复核', color: 'var(--warning)' },
  done: { label: '完成', color: 'var(--success)' },
  blocked: { label: '待批准', color: 'var(--warning)' },
  // doing 但无真实 TaskRun —— 人手动推进,明确区分于「AI 执行中」
  manual: { label: '手动进行中', color: 'var(--ink-30)' },
}

// 轨道色:按 lane 编号循环取色,表达并行执行的不同负责人轨道。
const LANE_COLORS = ['var(--lane-1)', 'var(--lane-2)', 'var(--lane-3)']
const laneColor = (lane: number) => LANE_COLORS[(lane - 1) % LANE_COLORS.length]

// 任务拆解 + 并行执行:总目标 → 子任务(负责人/状态/交付物),全部真实任务派生。
// 同时 running 的不同 lane 表达多负责人并行;后端无依赖/进度 → 不伪造,running 用不定态条。
export function TaskBreakdown({
  plan,
  parallelLanes,
  mission,
  runByTask,
  assistants,
  onAssign,
  onAutoAssign,
  onOpenReport,
  onAddTask,
}: {
  plan: MissionPlan | null
  parallelLanes: number
  mission?: MissionRow | null
  runByTask?: Map<string, TaskRunRow>
  assistants: Assistant[]
  onAssign: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onOpenReport?: (taskId: string) => void
  onAddTask?: (title: string) => void
}) {
  const [draft, setDraft] = useState('')
  const submit = () => {
    const t = draft.trim()
    if (t && onAddTask) {
      onAddTask(t)
      setDraft('')
    }
  }
  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle
          icon={<GitFork size={13} />}
          title="任务拆解"
          count={plan?.subtasks.length}
        />
        {parallelLanes > 1 && (
          <span
            className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
            title="多个负责人正在并行推进"
          >
            <span
              className="h-1.5 w-1.5 rounded-full agent-pulse-ring"
              style={{ background: 'var(--agent-working)' }}
            />
            {parallelLanes} 路并行执行
          </span>
        )}
      </div>

      {!plan ? (
        <EmptyHint text="还没有任务可拆解。在上方创建 Mission 或选择一个 Mission,这里展示其真实子任务。" />
      ) : (
        <>
          {/* 总目标(真实 Mission 目标或真实任务分组) */}
          <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-2.5">
            <Target
              size={15}
              className="mt-0.5 shrink-0 text-[var(--accent-text)]"
            />
            <div className="min-w-0">
              <span className="text-[11px] tracking-wide text-[var(--text-tertiary)]">
                {mission ? '当前 Mission 目标' : '总目标(按真实任务归集)'}
              </span>
              <p className="line-clamp-2 text-[13px] font-medium text-[var(--text-primary)]">
                {plan.goal}
              </p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {plan.subtasks.length === 0 && (
              <EmptyHint
                text={
                  mission
                    ? '该 Mission 还没有子任务。在下方添加,即创建归属此 Mission 的真实任务。'
                    : '暂无子任务'
                }
              />
            )}
            {plan.subtasks.map((s, i) => (
              <SubtaskRow
                key={s.id}
                index={i + 1}
                subtask={s}
                hasRun={!!runByTask?.get(s.id)}
                assistants={assistants}
                onAssign={onAssign}
                onAutoAssign={onAutoAssign}
                onOpenReport={onOpenReport}
              />
            ))}
          </div>

          {onAddTask && (
            <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5">
              <Plus size={14} className="shrink-0 text-[var(--text-tertiary)]" />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="为该 Mission 添加子任务,回车创建…"
                className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function SubtaskRow({
  index,
  subtask,
  hasRun,
  assistants,
  onAssign,
  onAutoAssign,
  onOpenReport,
}: {
  index: number
  subtask: Subtask
  hasRun?: boolean
  assistants: Assistant[]
  onAssign: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onOpenReport?: (taskId: string) => void
}) {
  const meta = STATUS_META[subtask.status]
  const lc = laneColor(subtask.lane)
  const running = subtask.status === 'running'
  return (
    <div
      className="rounded-r-[var(--radius-lg)] border border-l-0 bg-[var(--canvas)] py-2 pr-2.5 pl-2.5"
      style={{ borderColor: 'var(--border)', borderLeft: `3px solid ${lc}` }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] text-[var(--text-tertiary)]">
          {index}
        </span>
        {subtask.ownerName && (
          <Avatar
            user={{
              name: subtask.ownerName,
              avatarColor: subtask.ownerColor ?? 5,
              isAssistant: true,
            }}
            size={18}
          />
        )}
        <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">
          {subtask.title}
        </p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: meta.color,
            background: `color-mix(in oklch, ${meta.color} 12%, transparent)`,
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* 进行中:不定态轨道条(只表达「执行中」,不报具体百分比) */}
      {running && (
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--lane-track)' }}
        >
          <div
            className="lane-indeterminate h-full rounded-full"
            style={{ background: lc }}
          />
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
        <span title="并行轨道">轨道 {subtask.lane}</span>
        {/* 未指派的子任务:直接指派 AI / 自动选择(无需跳到完整任务页) */}
        {!subtask.ownerName && (
          <AssignMenu
            assistants={assistants}
            onPick={(aid) => onAssign(subtask.id, aid)}
            onAuto={() => onAutoAssign(subtask.id)}
            size="xs"
          />
        )}
        {hasRun && onOpenReport && (
          <button
            onClick={() => onOpenReport(subtask.id)}
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent-text)]"
            title="查看执行详情 / 报告"
          >
            <FileText size={10} /> 报告
          </button>
        )}
        {subtask.output && (
          <span className="ml-auto max-w-28 truncate rounded-full bg-[var(--paper-mid)] px-1.5 py-0.5">
            {subtask.output}
          </span>
        )}
      </div>
    </div>
  )
}
