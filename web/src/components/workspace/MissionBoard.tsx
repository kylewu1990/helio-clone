import { Kanban, ArrowUpRight, Play, Square, FileText, Boxes, RotateCw } from 'lucide-react'
import { Avatar } from '../Avatar'
import { SectionTitle } from './AgentRoster'
import { RUN_STATUS_META, SANDBOX_STATUS_META } from '../../lib/workspace'
import { AssignMenu } from './AssignMenu'
import type {
  Assistant,
  Mission,
  MissionPriority,
  MissionStatus,
  TaskRunRow,
  SandboxRunListRow,
} from '../../lib/types'

const COLUMNS: { key: MissionStatus; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: 'var(--ink-30)' },
  { key: 'in_progress', label: '进行中', color: 'var(--info)' },
  { key: 'review', label: '待复核', color: 'var(--warning)' },
  { key: 'delivered', label: '已交付', color: 'var(--success)' },
]

const PRIORITY_COLOR: Record<MissionPriority, string> = {
  urgent: 'var(--priority-urgent)',
  high: 'var(--priority-high)',
  medium: 'var(--priority-medium)',
  low: 'var(--priority-low)',
}

// Mission Board:Backlog / In Progress / Review / Delivered 四列交付流。
// 全部由真实任务派生(横向滚动)。后端无 review 状态机时 Review 列为空。
export function MissionBoard({
  missions,
  runByTask,
  sandboxByTask,
  assistantIds,
  assistants,
  autoExecute,
  onToggleAutoExecute,
  onAssign,
  onAutoAssign,
  onOpenFull,
  onExecute,
  onContinue,
  onCancel,
  onOpenRun,
  onOpenReport,
}: {
  missions: Mission[]
  runByTask: Map<string, TaskRunRow>
  sandboxByTask: Map<string, SandboxRunListRow>
  assistantIds: Set<string>
  assistants: Assistant[]
  autoExecute: boolean
  onToggleAutoExecute: (v: boolean) => void
  onAssign: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onOpenFull: () => void
  onExecute: (taskId: string) => void
  onContinue: (runId: string) => void
  onCancel: (taskId: string) => void
  onOpenRun: (taskId: string) => void
  onOpenReport: (taskId: string) => void
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle
          icon={<Kanban size={13} />}
          title="任务看板"
          count={missions.length}
        />
        <div className="mb-2 flex items-center gap-3">
          <label
            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            title="开启后:把任务指派给 AI 时立即开始执行(本地设置)"
          >
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => onToggleAutoExecute(e.target.checked)}
              className="h-3 w-3 accent-[var(--accent)]"
            />
            指派后自动执行
          </label>
          <button
            onClick={onOpenFull}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-text)]"
          >
            打开完整看板 <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
        {COLUMNS.map((col) => {
          const items = missions.filter((m) => m.status === col.key)
          return (
            <div
              key={col.key}
              className="flex w-[210px] shrink-0 flex-col"
            >
              <div className="mb-2 flex items-center gap-1.5 px-0.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: col.color }}
                />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {col.label}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 overflow-y-auto">
                {items.map((m) => (
                  <MissionCard
                    key={m.id}
                    mission={m}
                    run={runByTask.get(m.id)}
                    sandbox={sandboxByTask.get(m.id)}
                    assistants={assistants}
                    executable={
                      !!m.assigneeId && assistantIds.has(m.assigneeId)
                    }
                    onAssign={onAssign}
                    onAutoAssign={onAutoAssign}
                    onExecute={onExecute}
                    onContinue={onContinue}
                    onCancel={onCancel}
                    onOpenRun={onOpenRun}
                    onOpenReport={onOpenReport}
                  />
                ))}
                {items.length === 0 && (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-5 text-center text-[11px] text-[var(--text-tertiary)]">
                    空
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MissionCard({
  mission,
  run,
  sandbox,
  assistants,
  executable,
  onAssign,
  onAutoAssign,
  onExecute,
  onContinue,
  onCancel,
  onOpenRun,
  onOpenReport,
}: {
  mission: Mission
  run?: TaskRunRow
  sandbox?: SandboxRunListRow
  assistants: Assistant[]
  executable: boolean
  onAssign: (taskId: string, assistantId: string) => void | Promise<void>
  onAutoAssign: (taskId: string) => void | Promise<void>
  onExecute: (taskId: string) => void
  onContinue: (runId: string) => void
  onCancel: (taskId: string) => void
  onOpenRun: (taskId: string) => void
  onOpenReport: (taskId: string) => void
}) {
  const runMeta = run ? RUN_STATUS_META[run.status] : undefined
  const isActive = run?.status === 'running' || run?.status === 'queued'
  const canContinue = run?.status === 'needs_review' || run?.status === 'failed'
  // doing 但无真实 TaskRun → 人手动推进,明确标注(不伪装成 AI 执行中)
  const manualOnly = mission.status === 'in_progress' && !run
  const sbMeta = sandbox ? SANDBOX_STATUS_META[sandbox.status] : undefined
  return (
    <div
      className="card-lift rounded-r-[var(--radius-lg)] border border-l-0 bg-[var(--canvas)] py-2.5 pr-2.5 pl-3"
      style={{
        borderColor: 'var(--border)',
        borderLeft: `3px solid ${PRIORITY_COLOR[mission.priority]}`,
      }}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--text-primary)]">
          {mission.title}
        </p>
        {runMeta ? (
          <button
            onClick={() => run?.channelId && onOpenRun(mission.id)}
            disabled={!run?.channelId}
            title={run?.channelId ? '查看执行对话' : undefined}
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 disabled:cursor-default"
            style={{
              color: runMeta.color,
              background: `color-mix(in oklch, ${runMeta.color} 14%, transparent)`,
            }}
          >
            {runMeta.label}
          </button>
        ) : (
          manualOnly && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]"
              style={{ background: 'var(--paper-mid)' }}
              title="任务处于进行中,但没有 AI 执行记录(人手动推进)"
            >
              手动进行中
            </span>
          )
        )}
      </div>

      {/* 沙盒状态徽章(任务卡可见 sandbox 状态) */}
      {sbMeta && (
        <button
          onClick={() => onOpenReport(mission.id)}
          className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
          style={{ color: sbMeta.color, background: `color-mix(in oklch, ${sbMeta.color} 12%, transparent)` }}
          title="查看沙盒执行详情"
        >
          <Boxes size={10} /> 沙盒 · {sbMeta.label}
          {sandbox?.diffSummary ? ` · ${sandbox.diffSummary}` : ''}
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {mission.assigneeName ? (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Avatar
              user={{
                name: mission.assigneeName,
                avatarColor: mission.assigneeColor ?? 5,
                isAssistant: true,
              }}
              size={16}
            />
            <span className="max-w-16 truncate">{mission.assigneeName}</span>
          </span>
        ) : (
          // 未指派:直接给「指派 AI」下拉 + 「自动选择执行人」(无需跳到完整任务页)
          <AssignMenu
            assistants={assistants}
            onPick={(aid) => onAssign(mission.id, aid)}
            onAuto={() => onAutoAssign(mission.id)}
          />
        )}

        {/* 指派给 AI 的任务:开始执行 / 取消 / 继续执行 */}
        {executable &&
          (isActive ? (
            <button
              onClick={() => onCancel(mission.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-[var(--hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
              title="取消执行"
            >
              <Square size={10} /> 取消
            </button>
          ) : canContinue && run ? (
            <button
              onClick={() => onContinue(run.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--warning)' }}
              title="在同一沙盒继续执行"
            >
              <RotateCw size={10} /> 继续执行
            </button>
          ) : (
            <button
              onClick={() => onExecute(mission.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-0.5 text-[10px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
              title="让该 AI 开始执行任务"
            >
              <Play size={10} /> {run ? '重跑' : '开始执行'}
            </button>
          ))}
      </div>
      {run && (
        <button
          onClick={() => onOpenReport(mission.id)}
          className="mt-2 inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent-text)]"
          title="查看执行详情 / 报告"
        >
          <FileText size={10} /> 执行报告
        </button>
      )}
    </div>
  )
}
