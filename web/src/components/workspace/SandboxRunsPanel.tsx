import { useState } from 'react'
import { Boxes, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, FileText } from 'lucide-react'
import { SectionTitle, EmptyHint } from './AgentRoster'
import { SandboxPanel } from './SandboxPanel'
import { SANDBOX_STATUS_META } from '../../lib/workspace'
import { api } from '../../lib/api'
import type { SandboxRunListRow, IsolationInfo, SandboxReport } from '../../lib/types'

// 工作台「沙盒运行」区域:展示最近的沙盒运行(本机信任/强隔离诚实标记 + 路径 + 模式 + diff + build/test),
// 展开任意一条 → 拉取完整报告(命令/日志/diff/截图)并提供 批准应用 / 丢弃 / 继续执行。
export function SandboxRunsPanel({
  runs,
  isolation,
  onChanged,
  onContinue,
  onOpenReport,
}: {
  runs: SandboxRunListRow[]
  isolation: IsolationInfo | null
  onChanged: () => void | Promise<void>
  onContinue: (taskRunId: string) => void | Promise<void>
  onOpenReport: (taskId: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [report, setReport] = useState<SandboxReport | null>(null)
  const [loading, setLoading] = useState(false)
  const strong = isolation?.strong ?? false

  const toggle = async (run: SandboxRunListRow) => {
    if (openId === run.id) {
      setOpenId(null)
      setReport(null)
      return
    }
    setOpenId(run.id)
    setReport(null)
    setLoading(true)
    try {
      setReport(await api.sandboxReport(run.taskRunId))
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Boxes size={13} />} title="沙盒运行" count={runs.length} />
        {isolation && (
          <span
            className="mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              color: strong ? 'var(--success)' : 'var(--warning)',
              background: `color-mix(in oklch, ${strong ? 'var(--success)' : 'var(--warning)'} 12%, transparent)`,
            }}
            title={isolation.note}
          >
            {strong ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
            {isolation.label}
          </span>
        )}
      </div>

      {runs.length === 0 ? (
        <EmptyHint text="还没有沙盒运行。把代码/命令类任务指派给 AI 并开始执行,这里会显示隔离工作区的执行情况、diff、build/test 与截图。" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {runs.map((run) => {
            const meta = SANDBOX_STATUS_META[run.status] ?? { label: run.status, color: 'var(--ink-30)' }
            const open = openId === run.id
            return (
              <div
                key={run.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)]"
              >
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button
                    onClick={() => toggle(run)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {open ? (
                      <ChevronDown size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                    ) : (
                      <ChevronRight size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">
                      {run.taskTitle ?? '(未关联任务)'}
                    </span>
                  </button>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)` }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-2.5 pb-2 text-[10px] text-[var(--text-tertiary)]">
                  <span className="font-mono">{run.mode === 'git_worktree' ? 'worktree' : 'copy'}</span>
                  {run.diffSummary && <span>· {run.diffSummary}</span>}
                  {run.buildResult && <span>· build/test={run.buildResult}</span>}
                  <span className="min-w-0 flex-1 truncate font-mono" title={run.workspacePath}>
                    {run.workspacePath.replace(/^.*\/\.helio\//, '.helio/')}
                  </span>
                  {run.taskId && (
                    <button
                      onClick={() => onOpenReport(run.taskId!)}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--accent-text)]"
                      title="打开执行报告"
                    >
                      <FileText size={10} /> 报告
                    </button>
                  )}
                </div>
                {open && (
                  <div className="border-t border-[var(--border)] p-2">
                    {loading && (
                      <div className="py-4 text-center text-[11px] text-[var(--text-tertiary)]">加载沙盒详情…</div>
                    )}
                    {!loading && report && (
                      <SandboxPanel
                        sandbox={report}
                        isolation={isolation}
                        onChanged={async () => {
                          await onChanged()
                          setReport(await api.sandboxReport(run.taskRunId).catch(() => null))
                        }}
                        onContinue={onContinue}
                      />
                    )}
                    {!loading && !report && (
                      <div className="py-4 text-center text-[11px] text-[var(--text-tertiary)]">无法加载该沙盒详情</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
