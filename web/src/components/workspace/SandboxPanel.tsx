import { useState } from 'react'
import {
  Boxes,
  FileDiff,
  Terminal,
  FlaskConical,
  Check,
  Trash2,
  CheckCircle2,
  Camera,
  Globe,
  ShieldCheck,
  ShieldAlert,
  RotateCw,
} from 'lucide-react'
import { api } from '../../lib/api'
import { SANDBOX_STATUS_META } from '../../lib/workspace'
import type {
  SandboxReport,
  SandboxChangedFile,
  IsolationInfo,
} from '../../lib/types'

const BUILD_META: Record<string, { label: string; color: string }> = {
  pass: { label: 'build/test 通过', color: 'var(--success)' },
  fail: { label: 'build/test 失败', color: 'var(--destructive)' },
  partial: { label: 'build/test 部分通过', color: 'var(--warning)' },
  skipped: { label: 'build/test 跳过', color: 'var(--ink-30)' },
}
const FILE_STATUS_META: Record<string, { label: string; color: string }> = {
  added: { label: '新增', color: 'var(--success)' },
  modified: { label: '修改', color: 'var(--warning)' },
  deleted: { label: '删除', color: 'var(--destructive)' },
}

function PanelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] px-2.5 py-1.5">
      <div className="text-[10px] tracking-wide text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 truncate text-[var(--text-primary)]">{children}</div>
    </div>
  )
}

// 沙盒执行面板:真实读取 SandboxRun/Log/Artifact;批准前不修改主项目。
// 同时展示「本机信任沙盒 / 强隔离沙盒」诚实标记、命令/diff/build·test/浏览器截图,
// 以及 批准应用 / 丢弃 / 继续执行(触工具上限后可续)。
export function SandboxPanel({
  sandbox,
  isolation,
  onChanged,
  onContinue,
}: {
  sandbox: SandboxReport
  isolation?: IsolationInfo | null
  onChanged: () => void | Promise<void>
  onContinue?: (taskRunId: string) => void | Promise<void>
}) {
  const [busy, setBusy] = useState<'apply' | 'discard' | 'continue' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const { run, logs, artifacts } = sandbox
  const meta = SANDBOX_STATUS_META[run.status] ?? { label: run.status, color: 'var(--ink-30)' }

  let changed: SandboxChangedFile[] = []
  try {
    changed = run.changedFiles ? JSON.parse(run.changedFiles) : []
  } catch {
    changed = []
  }
  const cmdLogs = logs.filter((l) => l.type === 'command' || l.type === 'error')
  const testLogs = logs.filter((l) => l.type === 'test')
  const browserLogs = logs.filter((l) => l.type === 'browser')
  const diffLog = logs.find((l) => l.type === 'diff')
  const shots = artifacts.filter((a) => a.kind === 'screenshot' && a.path)
  // 空变更:ready_for_review 但没有任何文件改动 → 不该让用户「批准应用 0 文件」(#9)
  const hasChanges = changed.length > 0
  const canApply = run.status === 'ready_for_review' && hasChanges
  const emptyReady = run.status === 'ready_for_review' && !hasChanges

  const apply = async () => {
    if (busy) return
    setBusy('apply')
    setMsg(null)
    try {
      const r = await api.applyRun(run.taskRunId)
      setMsg(
        `已应用 ${r.applied.length} 个文件到主项目` +
          (r.blocked.length ? `,拦截 ${r.blocked.length} 个敏感/生成文件` : '') +
          (r.skippedDeletions.length ? `,跳过 ${r.skippedDeletions.length} 个删除` : ''),
      )
      await onChanged()
    } catch (e) {
      setMsg('应用失败:' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const discard = async () => {
    if (busy) return
    setBusy('discard')
    setMsg(null)
    try {
      await api.discardRun(run.taskRunId)
      setMsg('已丢弃沙盒,主项目未改变。')
      await onChanged()
    } catch (e) {
      setMsg('丢弃失败:' + (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const strong = isolation?.strong ?? false
  const isoLabel = isolation?.label ?? '本机信任沙盒(非强隔离)'

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--paper-mid)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Boxes size={14} className="text-[var(--accent-text)]" />
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">沙盒执行(隔离工作区)</span>
        <span
          className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)` }}
        >
          {meta.label}
        </span>
      </div>

      {/* 诚实隔离标记:有 Docker 才强隔离,否则本机信任沙盒(非强隔离) */}
      <div
        className="mb-2 flex items-start gap-1.5 rounded-[var(--radius-md)] px-2 py-1 text-[10px]"
        style={{
          color: strong ? 'var(--success)' : 'var(--warning)',
          background: `color-mix(in oklch, ${strong ? 'var(--success)' : 'var(--warning)'} 10%, transparent)`,
        }}
        title={isolation?.note ?? '无 Docker/OS sandbox 时为本机信任沙盒,不是强隔离;主项目写入仍只能人工 apply。'}
      >
        {strong ? <ShieldCheck size={12} className="mt-0.5 shrink-0" /> : <ShieldAlert size={12} className="mt-0.5 shrink-0" />}
        <span>{isoLabel} · 主项目写入仍需人工 apply</span>
      </div>

      {/* 概要:模式 / diff / build / 网络策略 */}
      <div className="mb-2 grid grid-cols-2 gap-1.5 text-[11px]">
        <PanelField label="隔离模式">{run.mode === 'git_worktree' ? 'git worktree' : 'copy 工作区'}</PanelField>
        <PanelField label="变更">{run.diffSummary ?? '—'}</PanelField>
        {run.buildResult && (
          <PanelField label="构建/测试">
            <span style={{ color: (BUILD_META[run.buildResult] ?? {}).color }}>
              {(BUILD_META[run.buildResult] ?? { label: run.buildResult }).label}
            </span>
          </PanelField>
        )}
        <PanelField label="网络策略">
          {run.networkPolicy === 'none' ? '禁网' : run.networkPolicy === 'full_with_approval' ? '需审批联网' : '仅公开 GET'}
        </PanelField>
      </div>
      <div className="mb-2 truncate rounded-[var(--radius-md)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--text-tertiary)]" title={run.workspacePath}>
        {run.workspacePath.replace(/^.*\/\.helio\//, '.helio/')}
      </div>

      {run.error && (
        <div className="mb-2 rounded-[var(--radius-md)] border border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-2 py-1 text-[11px] text-[var(--destructive)]">
          {run.error}
        </div>
      )}

      {/* 变更文件清单 */}
      {changed.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <FileDiff size={12} /> 变更文件 · {changed.length}
          </div>
          <div className="flex flex-col gap-0.5">
            {changed.map((f) => {
              const fm = FILE_STATUS_META[f.status] ?? { label: f.status, color: 'var(--ink-30)' }
              return (
                <div key={f.path} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                    style={{ color: fm.color, background: `color-mix(in oklch, ${fm.color} 14%, transparent)` }}
                  >
                    {fm.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{f.path}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 命令日志(真实退出码/耗时) */}
      {cmdLogs.length > 0 && (
        <details className="mb-2 group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <Terminal size={12} /> 命令日志 · {cmdLogs.length}
          </summary>
          <div className="mt-1 flex flex-col gap-1.5">
            {cmdLogs.map((l) => (
              <div key={l.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] p-2">
                <div className="mb-1 flex items-center gap-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">$ {l.command}</span>
                  {l.exitCode != null && <span>exit {l.exitCode}</span>}
                  {l.durationMs != null && <span>{l.durationMs}ms</span>}
                </div>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--text-secondary)]">
                  {l.content || '(无输出)'}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* build/test 日志 */}
      {testLogs.length > 0 && (
        <details className="mb-2 group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <FlaskConical size={12} /> 构建/测试日志 · {testLogs.length}
          </summary>
          <div className="mt-1 flex flex-col gap-1.5">
            {testLogs.map((l) => (
              <div key={l.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] p-2">
                <div className="mb-1 flex items-center gap-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">$ {l.command}</span>
                  <span style={{ color: l.exitCode === 0 ? 'var(--success)' : 'var(--destructive)' }}>
                    exit {l.exitCode ?? '—'}
                  </span>
                  {l.durationMs != null && <span>{Math.round(l.durationMs / 100) / 10}s</span>}
                </div>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--text-secondary)]">
                  {l.content || '(无输出)'}
                </pre>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 浏览器动作日志 */}
      {browserLogs.length > 0 && (
        <details className="mb-2 group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <Globe size={12} /> 浏览器动作 · {browserLogs.length}
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {browserLogs.map((l) => (
              <div key={l.id} className="flex items-start gap-2 text-[10px]">
                <span className="shrink-0 font-mono text-[var(--accent-text)]">{l.command}</span>
                <span className="min-w-0 flex-1 text-[var(--text-secondary)]">{l.content}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 浏览器截图(artifact) */}
      {shots.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <Camera size={12} /> 浏览器截图 · {shots.length}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shots.map((s) => (
              <a
                key={s.id}
                href={s.path ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
                title={s.summary ?? '截图'}
              >
                <img
                  src={s.path ?? ''}
                  alt={s.summary ?? 'screenshot'}
                  className="h-28 rounded-[var(--radius-md)] border border-[var(--border)] object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* diff 文本 */}
      {diffLog?.content && diffLog.content !== '(无差异)' && (
        <details className="mb-2 group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)]">
            <FileDiff size={12} /> 完整 diff
          </summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] p-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            {diffLog.content}
          </pre>
        </details>
      )}

      {/* 空变更:无需应用(#9 不再让用户误以为有交付) */}
      {emptyReady && (
        <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)]">
          <CheckCircle2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
          本次执行没有产生文件变更,无需应用到主项目。
        </div>
      )}

      {/* 批准应用 / 丢弃 / 继续执行(仅有真实变更的 ready_for_review 可应用;批准前不改主项目) */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
        {canApply && (
          <>
            <button
              onClick={apply}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--success)' }}
            >
              <Check size={13} /> {busy === 'apply' ? '应用中…' : '批准应用到主项目'}
            </button>
            <button
              onClick={discard}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--destructive)] disabled:opacity-60"
            >
              <Trash2 size={13} /> {busy === 'discard' ? '丢弃中…' : '丢弃沙盒'}
            </button>
          </>
        )}
        {onContinue && run.status !== 'applied' && run.status !== 'discarded' && (
          <button
            onClick={async () => {
              setBusy('continue')
              try {
                await onContinue(run.taskRunId)
              } finally {
                setBusy(null)
              }
            }}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--hover)] disabled:opacity-60"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--warning)' }}
            title="在同一沙盒继续执行(保留先前改动与上下文)"
          >
            <RotateCw size={13} /> {busy === 'continue' ? '继续中…' : '继续执行'}
          </button>
        )}
        {emptyReady && (
          <button
            onClick={discard}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--destructive)] disabled:opacity-60"
          >
            <Trash2 size={13} /> {busy === 'discard' ? '清理中…' : '清理沙盒'}
          </button>
        )}
        {canApply && <span className="text-[10px] text-[var(--text-tertiary)]">批准前主项目不会被修改</span>}
      </div>
      {run.status === 'applied' && (
        <div className="mt-2 inline-flex items-center gap-1 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--success)]">
          <CheckCircle2 size={12} /> 已应用到主项目
          {run.appliedFiles ? `(${(JSON.parse(run.appliedFiles) as string[]).length} 文件)` : ''}
        </div>
      )}
      {msg && <div className="mt-2 text-[11px] text-[var(--text-secondary)]">{msg}</div>}
    </section>
  )
}
