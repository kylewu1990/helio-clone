import { useState } from 'react'
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  Menu,
  Play,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { RUN_STATUS_META, latestRunByTask } from '../lib/workspace'
import type { Task, TaskRunRow, User } from '../lib/types'

const COLS = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '完成' },
] as const

export function TasksView({
  tasks,
  members,
  taskRuns,
  onCreate,
  onMove,
  onDelete,
  onAssign,
  onExecute,
  onCancel,
  onOpenReport,
  onMenuClick,
}: {
  tasks: Task[]
  members: User[]
  taskRuns: TaskRunRow[]
  onCreate: (title: string) => void
  onMove: (id: string, status: string) => void
  onDelete: (id: string) => void
  onAssign: (id: string, assigneeId: string | null) => void
  onExecute: (id: string) => void
  onCancel: (id: string) => void
  onOpenReport: (id: string) => void
  onMenuClick: () => void
}) {
  const [draft, setDraft] = useState('')
  const runByTask = latestRunByTask(taskRuns)

  const submit = () => {
    const t = draft.trim()
    if (t) onCreate(t)
    setDraft('')
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-5">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] md:hidden"
          title="菜单"
        >
          <Menu size={18} />
        </button>
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          任务
        </div>
        <div className="ml-2 flex flex-1 items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--paper-mid)] px-2.5 py-1.5">
          <Plus size={14} className="text-[var(--text-tertiary)]" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="新建任务,回车添加到待办"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
        </div>
      </header>

      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {COLS.map((col, ci) => {
          const colTasks = tasks.filter((t) => t.status === col.key)
          return (
            <div key={col.key} className="flex w-72 shrink-0 flex-col">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {col.label}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {colTasks.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {colTasks.map((t) => {
                  const run = runByTask.get(t.id)
                  const runMeta = run ? RUN_STATUS_META[run.status] : undefined
                  const isActive =
                    run?.status === 'running' || run?.status === 'queued'
                  const executable = !!t.assignee?.isAssistant
                  // doing 但无真实 TaskRun → 人手动推进,明确区分「AI 执行中」
                  const manualOnly = t.status === 'doing' && !run
                  return (
                  <div
                    key={t.id}
                    className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
                        {t.title}
                      </div>
                      {runMeta ? (
                        <span
                          className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            color: runMeta.color,
                            background: `color-mix(in oklch, ${runMeta.color} 14%, transparent)`,
                          }}
                          title={run?.error ?? undefined}
                        >
                          {runMeta.label}
                        </span>
                      ) : (
                        manualOnly && (
                          <span
                            className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]"
                            style={{ background: 'var(--paper-mid)' }}
                            title="进行中,但没有 AI 执行记录(人手动推进)"
                          >
                            手动进行中
                          </span>
                        )
                      )}
                    </div>
                    {(executable || run) && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {executable &&
                          (isActive ? (
                            <button
                              onClick={() => onCancel(t.id)}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--hover)]"
                              style={{
                                borderColor: 'var(--border-strong)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              <Square size={11} /> 取消执行
                            </button>
                          ) : (
                            <button
                              onClick={() => onExecute(t.id)}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                              style={{ background: 'var(--accent)' }}
                            >
                              <Play size={11} /> {run ? '重新执行' : '开始执行'}
                            </button>
                          ))}
                        {run && (
                          <button
                            onClick={() => onOpenReport(t.id)}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent-text)]"
                            title="查看执行详情 / 报告"
                          >
                            <FileText size={11} /> 报告
                          </button>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      <AssigneePicker
                        task={t}
                        members={members}
                        onAssign={onAssign}
                      />
                      <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {ci > 0 && (
                          <IconBtn
                            title="左移"
                            onClick={() => onMove(t.id, COLS[ci - 1].key)}
                          >
                            <ChevronLeft size={14} />
                          </IconBtn>
                        )}
                        {ci < COLS.length - 1 && (
                          <IconBtn
                            title="右移"
                            onClick={() => onMove(t.id, COLS[ci + 1].key)}
                          >
                            <ChevronRight size={14} />
                          </IconBtn>
                        )}
                        <IconBtn title="删除" onClick={() => onDelete(t.id)} danger>
                          <Trash2 size={13} />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                  )
                })}
                {colTasks.length === 0 && (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--text-tertiary)]">
                    空
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function AssigneePicker({
  task,
  members,
  onAssign,
}: {
  task: Task
  members: User[]
  onAssign: (id: string, assigneeId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const a = task.assignee
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)]"
      >
        {a ? (
          <>
            <Avatar user={a} size={16} />
            <span>{a.name}</span>
          </>
        ) : (
          <span>+ 指派</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-7 left-0 z-20 max-h-56 w-48 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-1 shadow-lg">
            <button
              onClick={() => {
                onAssign(task.id, null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)]"
            >
              不指派
            </button>
            {members.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  onAssign(task.id, u.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--hover)]"
                style={{
                  background: a?.id === u.id ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <Avatar user={u} size={18} />
                <span className="truncate text-[var(--text-primary)]">{u.name}</span>
                {u.isAssistant && (
                  <Bot size={12} className="ml-auto text-[var(--accent-text)]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)]"
      style={{ color: danger ? 'var(--destructive)' : undefined }}
    >
      {children}
    </button>
  )
}
