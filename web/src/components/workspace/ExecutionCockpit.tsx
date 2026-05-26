import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X,
  Bot,
  Wrench,
  MessageSquare,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  RotateCw,
  Square,
  Activity,
  Terminal as TerminalIcon,
  Sparkles,
  Hand,
  Check,
  Ban,
  Gauge,
} from 'lucide-react'
import { api } from '../../lib/api'
import { RUN_STATUS_META, deriveWebPreview } from '../../lib/workspace'
import { buildProductSteps } from '../../lib/steps'
import { relativeTime, formatTime, identityColor, initials } from '../../lib/format'
import { SandboxPanel } from './SandboxPanel'
import { StepTimeline } from './StepTimeline'
import { LiveRunTimeline } from './LiveRunTimeline'
import { InteractivePreview } from './InteractivePreview'
import type { TaskReport, User, IsolationInfo, RunEvent } from '../../lib/types'

const CAP_LABEL: Record<string, string> = {
  run_command: '执行命令',
  write_file: '写文件',
  computer_control: '电脑控制',
  browser_control: '浏览器自动化',
}

const ACTIVE_RUN = new Set(['queued', 'running', 'needs_approval'])
const ACTIVE_SANDBOX = new Set(['preparing', 'running', 'testing'])

// Execution Cockpit:一个任务的沉浸式执行驾驶舱。右侧宽幅停靠,执行中实时轮询。
// 全部真实数据(/api/tasks/:id/report 聚合 TaskRun + 工具调用审计 + 审批 + 交付 + 沙盒)。
export function ExecutionCockpit({
  taskId,
  users,
  isolation,
  runEvents,
  onClose,
  onOpenChannel,
  onGenerateDelivery,
  onContinue,
  onCancel,
  onDecideApproval,
}: {
  taskId: string
  users: User[]
  isolation?: IsolationInfo | null
  runEvents?: Record<string, RunEvent[]>
  onClose: () => void
  onOpenChannel: (channelId: string, runId?: string) => void
  onGenerateDelivery: (data: { taskId: string; title: string; summary?: string }) => Promise<void> | void
  onContinue?: (taskRunId: string) => void | Promise<void>
  onCancel?: (taskId: string) => void | Promise<void>
  onDecideApproval?: (id: string, status: 'approved' | 'rejected') => void | Promise<void>
}) {
  const [report, setReport] = useState<TaskReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      setReport(await api.taskReport(taskId))
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const latest = report?.runs[0]
  const sbStatus = report?.sandbox?.run.status
  const isActive =
    (latest && ACTIVE_RUN.has(latest.status)) || (sbStatus && ACTIVE_SANDBOX.has(sbStatus))

  // 执行中:轮询刷新 + 计时
  useEffect(() => {
    if (!isActive) return
    const poll = setInterval(load, 2500)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [isActive, load])

  // Esc 关闭
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const userOf = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)) || null
  const nameOf = (id: string | null | undefined) =>
    userOf(id)?.name || (id ? '未知' : '系统')

  const executor = userOf(latest?.assistantId)
  const pendingApprovals = report?.approvals.filter((a) => a.status === 'pending') ?? []
  const hasDelivery = report?.deliveries.some((d) => d.taskId === taskId) ?? false
  const canGenerate = latest?.status === 'succeeded' && !hasDelivery
  const canContinue = latest?.status === 'needs_review' || latest?.status === 'failed'
  const canCancel = !!latest && ACTIVE_RUN.has(latest.status)

  const elapsed = (() => {
    if (!latest?.startedAt) return null
    const end = latest.endedAt ? new Date(latest.endedAt).getTime() : now
    const s = Math.max(0, Math.floor((end - new Date(latest.startedAt).getTime()) / 1000))
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
  })()

  const runAction = async (key: string, fn: () => Promise<void> | void) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      await load()
    } finally {
      setBusy(null)
    }
  }

  const generate = () =>
    runAction('gen', async () => {
      if (!report) return
      await onGenerateDelivery({
        taskId,
        title: `交付:${report.task.title}`,
        summary: latest?.output?.slice(0, 1000) || undefined,
      })
    })

  const steps = buildProductSteps(report)

  // Live Run:合并 report.runEvents 与 WS 实时事件,去重排序
  const latestRunId = report?.runs[0]?.id
  const mergedEvents = useMemo(() => {
    const base = report?.runEvents ?? []
    const live = (latestRunId && runEvents?.[latestRunId]) || []
    const map = new Map<string, RunEvent>()
    for (const e of [...base, ...live]) map.set(e.id, e)
    return [...map.values()].sort((a, b) => a.seq - b.seq)
  }, [report?.runEvents, runEvents, latestRunId])
  const interactive = useMemo(() => deriveWebPreview(report?.sandbox), [report])

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 遮罩 */}
      <div className="scrim-in flex-1 bg-[color-mix(in_oklch,black_55%,transparent)]" onClick={onClose} />

      {/* 停靠驾驶舱 */}
      <aside className="cockpit-in relative flex h-full w-full max-w-[960px] flex-col border-l border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
        {/* 顶部极光(执行中) */}
        <div className="h-[2px] w-full overflow-hidden bg-[var(--border)]">
          {isActive && <div className="aurora-bar h-full w-full" />}
        </div>

        {/* 头部 */}
        <header className="border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
                <Gauge size={12} className="text-[var(--accent-text)]" />
                Execution Cockpit
              </div>
              <h2 className="mt-1 truncate text-[15px] font-semibold text-[var(--text-primary)]">
                {report?.task.title ?? '加载中…'}
              </h2>
            </div>
            {latest && <StatusPill status={latest.status} live={!!isActive} />}
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)]"
              title="关闭 (Esc)"
            >
              <X size={17} />
            </button>
          </div>

          {/* 执行人 + 元信息 */}
          {latest && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                {executor ? (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-semibold text-white"
                    style={{ background: identityColor(executor.avatarColor) }}
                  >
                    {initials(executor.name)}
                  </span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-3)] text-[var(--text-tertiary)]">
                    <Bot size={14} />
                  </span>
                )}
                <div className="leading-tight">
                  <div className="text-[12px] font-medium text-[var(--text-primary)]">
                    {nameOf(latest.assistantId)}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">执行人</div>
                </div>
              </div>
              <Meta icon={<Activity size={12} />} label="计时" value={elapsed ?? '—'} />
              <Meta label="触发" value={triggerLabel(latest.trigger)} />
              <Meta label="次数" value={`${report?.runs.length ?? 0} 次`} />
              <Meta
                label="开始"
                value={latest.startedAt ? formatTime(latest.startedAt) : '—'}
              />
            </div>
          )}

          {/* 控制栏 */}
          {latest && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {latest.channelId && (
                <CtlBtn icon={<MessageSquare size={13} />} onClick={() => onOpenChannel(latest.channelId!, latest.id)}>
                  执行对话 / 预览
                </CtlBtn>
              )}
              {canCancel && onCancel && (
                <CtlBtn
                  icon={<Square size={12} />}
                  tone="danger"
                  busy={busy === 'cancel'}
                  onClick={() => runAction('cancel', () => onCancel(taskId))}
                >
                  取消执行
                </CtlBtn>
              )}
              {canContinue && onContinue && (
                <CtlBtn
                  icon={<RotateCw size={13} />}
                  tone="warning"
                  busy={busy === 'cont'}
                  onClick={() => runAction('cont', () => onContinue(latest.id))}
                >
                  继续执行
                </CtlBtn>
              )}
              {canGenerate && (
                <CtlBtn icon={<PackagePlus size={13} />} tone="accent" busy={busy === 'gen'} onClick={generate}>
                  生成交付
                </CtlBtn>
              )}
              {hasDelivery && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
                  <CheckCircle2 size={12} /> 已生成交付
                </span>
              )}
            </div>
          )}
        </header>

        {/* 主体:时间线 + 主面板 */}
        <div className="flex min-h-0 flex-1">
          {/* 产品化步骤时间线 */}
          <div className="hidden w-[270px] shrink-0 overflow-y-auto border-r border-[var(--border)] px-3.5 py-3.5 lg:block">
            <div className="mb-3 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
              执行步骤
            </div>
            <StepTimeline steps={steps} executorName={executor?.name} />
          </div>

          {/* 主面板 */}
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {loading && (
              <div className="py-16 text-center text-xs text-[var(--text-tertiary)]">加载执行记录…</div>
            )}

            {!loading && (!report || report.runs.length === 0) && (
              <div className="mt-6 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 py-14 text-center">
                <Sparkles size={26} className="mx-auto text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <p className="mt-3 text-[13px] font-medium text-[var(--text-secondary)]">
                  该任务还没有执行记录
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                  指派给 AI 助手后点「开始执行」,这里会实时显示工具调用、命令输出、文件变更与交付。
                </p>
              </div>
            )}

            {!loading && report && latest && (
              <div className="flex flex-col gap-4">
                {/* 待你处理 */}
                {(pendingApprovals.length > 0 ||
                  latest.status === 'needs_review' ||
                  sbStatus === 'ready_for_review' ||
                  canGenerate) && (
                  <PendingBlock>
                    {pendingApprovals.map((ap) => (
                      <div
                        key={ap.id}
                        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2"
                      >
                        <ShieldAlert size={14} className="shrink-0 text-[var(--warning)]" />
                        <span className="min-w-0 flex-1 text-[12px] text-[var(--text-secondary)]">
                          助手请求高危能力:
                          <span className="font-medium text-[var(--text-primary)]">
                            {CAP_LABEL[ap.capability] ?? ap.capability}
                          </span>
                          {ap.command ? (
                            <code className="ml-1 rounded bg-[var(--surface-3)] px-1 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                              {ap.command}
                            </code>
                          ) : null}
                        </span>
                        {onDecideApproval && (
                          <span className="flex shrink-0 gap-1.5">
                            <button
                              onClick={() => runAction(`ap-${ap.id}`, () => onDecideApproval(ap.id, 'approved'))}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                              style={{ background: 'var(--success)' }}
                            >
                              <Check size={12} /> 批准
                            </button>
                            <button
                              onClick={() => runAction(`ap-${ap.id}`, () => onDecideApproval(ap.id, 'rejected'))}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--destructive)] disabled:opacity-50"
                            >
                              <Ban size={12} /> 拒绝
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                    {latest.status === 'needs_review' && (
                      <PendingLine>
                        本次达到工具调用上限,已生成部分报告并保留沙盒 —— 点上方「继续执行」在同一沙盒接着完成。
                      </PendingLine>
                    )}
                    {sbStatus === 'ready_for_review' && (
                      <PendingLine>
                        沙盒已就绪待验收 —— 在下方沙盒区「批准应用到主项目」或「丢弃」。批准前主项目不会被修改。
                      </PendingLine>
                    )}
                    {canGenerate && (
                      <PendingLine>执行成功 —— 点上方「生成交付」把结果沉淀为可审批的交付物。</PendingLine>
                    )}
                  </PendingBlock>
                )}

                {/* Interactive Delivery:可交互网页预览(主交付,截图为证据) */}
                {interactive?.previewUrl && (
                  <Section icon={<Sparkles size={13} className="text-[var(--accent-text)]" />} title="可交互交付预览">
                    <InteractivePreview
                      previewUrl={interactive.previewUrl}
                      entry={interactive.entry}
                      files={interactive.files}
                      buildResult={interactive.buildResult}
                      height={440}
                    />
                  </Section>
                )}

                {/* Live Run:实时执行过程(工具/命令/文件/浏览器/构建),人话默认层 */}
                {mergedEvents.length > 0 && (
                  <Section icon={<Activity size={13} className="text-[var(--accent-text)]" />} title="执行过程(Live Run)">
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <LiveRunTimeline events={mergedEvents} live={!!isActive} />
                    </div>
                  </Section>
                )}

                {/* AI 汇报 / 失败原因 */}
                {(latest.output || latest.error) && (
                  <Section
                    icon={
                      latest.error ? (
                        <AlertTriangle size={13} className="text-[var(--destructive)]" />
                      ) : (
                        <MessageSquare size={13} className="text-[var(--accent-text)]" />
                      )
                    }
                    title={latest.error ? '失败原因' : 'AI 汇报'}
                  >
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                      <pre
                        className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed"
                        style={{ color: latest.error ? 'var(--destructive)' : 'var(--text-secondary)' }}
                      >
                        {latest.error || latest.output}
                      </pre>
                    </div>
                  </Section>
                )}

                {/* 沙盒执行(终端/diff/build/截图/apply) */}
                {report.sandbox && (
                  <Section icon={<TerminalIcon size={13} />} title="沙盒执行(隔离工作区)">
                    <SandboxPanel
                      sandbox={report.sandbox}
                      isolation={isolation}
                      onChanged={load}
                      onContinue={onContinue}
                    />
                  </Section>
                )}

                {/* 原始工具日志(Debug,默认折叠 —— 默认视图是上方产品化步骤) */}
                {report.toolCalls.length > 0 && (
                  <details className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[var(--text-tertiary)]">
                      <Wrench size={13} /> Debug · 原始工具日志 · {report.toolCalls.length} 次
                      <span className="ml-auto text-[10px] font-normal text-[var(--text-tertiary)]">点击展开</span>
                    </summary>
                    <div className="flex flex-col gap-2 border-t border-[var(--border)] p-2.5">
                      {report.toolCalls.map((tc) => (
                        <div
                          key={tc.id}
                          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-2.5"
                        >
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                            <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono font-medium text-[var(--accent-text)]">
                              {tc.tool}
                            </span>
                            <span className="ml-auto">{relativeTime(tc.createdAt)}</span>
                          </div>
                          <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--text-secondary)]">
                            {tc.output || '(无输出)'}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* 审批记录 */}
                {report.approvals.length > 0 && (
                  <Section icon={<ShieldAlert size={13} />} title="审批记录">
                    <div className="flex flex-col gap-1.5">
                      {report.approvals.map((ap) => (
                        <div
                          key={ap.id}
                          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px]"
                        >
                          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                            {CAP_LABEL[ap.capability] ?? ap.capability}
                            {ap.command ? `:${ap.command}` : ''}
                          </span>
                          <ApprovalTag status={ap.status} />
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function StatusPill({ status, live }: { status: string; live: boolean }) {
  const meta = RUN_STATUS_META[status] ?? { label: status, color: 'var(--ink-30)' }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)` }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? 'live-dot' : ''}`}
        style={{ background: meta.color, color: meta.color }}
      />
      {meta.label}
    </span>
  )
}

function ApprovalTag({ status }: { status: string }) {
  const m =
    status === 'approved'
      ? { label: '已批准', color: 'var(--success)' }
      : status === 'rejected'
        ? { label: '已拒绝', color: 'var(--destructive)' }
        : { label: '待批准', color: 'var(--warning)' }
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: m.color, background: `color-mix(in oklch, ${m.color} 14%, transparent)` }}
    >
      {m.label}
    </span>
  )
}

function Meta({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {icon && <span className="text-[var(--text-tertiary)]">{icon}</span>}
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="font-medium text-[var(--text-secondary)]">{value}</span>
    </div>
  )
}

function CtlBtn({
  icon,
  children,
  onClick,
  tone = 'default',
  busy,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'accent' | 'warning' | 'danger'
  busy?: boolean
}) {
  const style =
    tone === 'accent'
      ? { background: 'var(--accent)', color: 'white', border: '1px solid transparent' }
      : tone === 'warning'
        ? { color: 'var(--warning)', borderColor: 'var(--border-strong)' }
        : tone === 'danger'
          ? { color: 'var(--destructive)', borderColor: 'var(--border-strong)' }
          : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
      style={style}
    >
      {icon}
      {busy ? '处理中…' : children}
    </button>
  )
}

function PendingBlock({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[color-mix(in_oklch,var(--accent)_35%,transparent)] bg-[var(--accent-soft)] p-3 surface-glow">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--accent-text)]">
        <Hand size={13} /> 需要你处理
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function PendingLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
      {children}
    </div>
  )
}

function triggerLabel(t: string) {
  return t === 'approval'
    ? '审批续跑'
    : t === 'auto'
      ? '自动'
      : t === 'continue'
        ? '继续'
        : '手动开始'
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}
