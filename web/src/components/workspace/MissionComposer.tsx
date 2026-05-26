import { useEffect, useRef, useState } from 'react'
import {
  X,
  Target,
  Sparkles,
  Loader2,
  Users,
  Wrench,
  Hand,
  PackageCheck,
  AlertTriangle,
  Play,
  FlaskConical,
  Pencil,
  ArrowLeft,
  Check,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { WorkflowPlan, WorkflowStep } from '../../lib/types'

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--destructive)',
  high: 'var(--warning)',
  medium: 'var(--info)',
  low: 'var(--text-tertiary)',
}

// Mission Composer:描述目标 → AI 生成工作流预览(目标/团队/步骤/工具/确认点/交付物)→ 开始运行 / Test Run / 编辑步骤。
export function MissionComposer({
  onClose,
  onStart,
  initialGoal = '',
}: {
  onClose: () => void
  // autorun=true:创建并立刻指派执行第一步;false:仅落库工作流,进入工作区
  onStart: (goal: string, steps: WorkflowStep[], autorun: boolean) => Promise<void>
  initialGoal?: string
}) {
  const [goal, setGoal] = useState(initialGoal)
  const [plan, setPlan] = useState<WorkflowPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [starting, setStarting] = useState<'run' | 'test' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taRef.current?.focus()
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !planning && !starting && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, planning, starting])

  const generate = async () => {
    const g = goal.trim()
    if (!g || planning) return
    setPlanning(true)
    setError(null)
    try {
      const { plan } = await api.planMission(g)
      setPlan(plan)
    } catch (e) {
      let msg = (e as Error).message || '生成失败'
      try {
        msg = JSON.parse(msg.replace(/^\d+\s+/, '')).error ?? msg
      } catch {
        /* ignore */
      }
      setError(msg)
    } finally {
      setPlanning(false)
    }
  }

  const start = async (autorun: boolean) => {
    if (!plan || starting) return
    setStarting(autorun ? 'run' : 'test')
    try {
      await onStart(goal.trim(), plan.steps, autorun)
    } finally {
      setStarting(null)
    }
  }

  const editStep = (i: number, patch: Partial<WorkflowStep>) => {
    if (!plan) return
    setPlan({ ...plan, steps: plan.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }
  const removeStep = (i: number) => {
    if (!plan) return
    setPlan({ ...plan, steps: plan.steps.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="scrim-in fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklch,black_58%,transparent)] p-4 sm:p-8" onClick={onClose}>
      <div
        className="cockpit-in my-auto w-full max-w-3xl rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          {plan && (
            <button
              onClick={() => setPlan(null)}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
              title="改目标"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
              <Sparkles size={12} className="text-[var(--accent-text)]" /> Mission Composer
            </div>
            <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--text-primary)]">
              {plan ? 'AI 工作流预览 · 确认后开始' : '描述一个目标,交给 AI 团队'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={17} />
          </button>
        </header>

        {!plan ? (
          /* ---- 目标输入 ---- */
          <div className="p-5">
            <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
              <Target size={16} className="mt-0.5 shrink-0 text-[var(--accent-text)]" />
              <textarea
                ref={taRef}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
                }}
                rows={4}
                placeholder="例如:为 Heliox 设计一个新用户 5 分钟上手引导,让用户首次进入就能创建第一个 Mission 并跑通一次执行…"
                className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
              />
            </div>
            {error && (
              <p className="mt-3 flex items-start gap-1.5 text-[12px] text-[var(--destructive)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}
            <p className="mt-3 text-[12px] text-[var(--text-tertiary)]">
              AI 会先生成一份工作流预览:推荐团队、执行步骤、用到的能力、需要你确认的点、预期交付物。你确认后才会真正落库执行。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={generate}
                disabled={!goal.trim() || planning}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {planning ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {planning ? 'AI 生成工作流中…' : '生成工作流 (⌘↵)'}
              </button>
            </div>
          </div>
        ) : (
          /* ---- 工作流预览 ---- */
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-5">
            {/* 目标 + 概述 */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
                <Target size={12} className="text-[var(--accent-text)]" /> 目标
              </div>
              <p className="mt-1 text-[13.5px] font-medium leading-relaxed text-[var(--text-primary)]">{plan.goal}</p>
              {plan.summary && (
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{plan.summary}</p>
              )}
            </div>

            {/* 推荐团队 */}
            {plan.team.length > 0 && (
              <Block icon={<Users size={13} />} title="推荐团队">
                <div className="flex flex-wrap gap-2">
                  {plan.team.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)]"
                      title={t.why}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      <span className="font-medium text-[var(--text-primary)]">{t.role}</span>
                    </span>
                  ))}
                </div>
              </Block>
            )}

            {/* 步骤 */}
            <Block
              icon={<Wrench size={13} />}
              title={`执行步骤 · ${plan.steps.length}`}
              action={
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent-text)]"
                >
                  <Pencil size={12} /> {editing ? '完成编辑' : '编辑步骤'}
                </button>
              }
            >
              <ol className="flex flex-col gap-2">
                {plan.steps.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-text)]">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            value={s.title}
                            onChange={(e) => editStep(i, { title: e.target.value })}
                            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1 text-[13px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                          />
                        ) : (
                          <p className="text-[13px] font-medium text-[var(--text-primary)]">{s.title}</p>
                        )}
                        {s.detail && !editing && (
                          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{s.detail}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {s.role && <Chip>{s.role}</Chip>}
                          {s.tool && (
                            <Chip>
                              <Wrench size={10} className="text-[var(--text-tertiary)]" /> {s.tool}
                            </Chip>
                          )}
                          {s.priority && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ color: PRIORITY_COLOR[s.priority], background: `color-mix(in oklch, ${PRIORITY_COLOR[s.priority]} 13%, transparent)` }}
                            >
                              {s.priority}
                            </span>
                          )}
                          {s.needsApproval && (
                            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 13%, transparent)' }}>
                              <Hand size={10} /> 需你确认
                            </span>
                          )}
                          {s.deliverable && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                              <PackageCheck size={11} /> {s.deliverable}
                            </span>
                          )}
                        </div>
                      </div>
                      {editing && (
                        <button
                          onClick={() => removeStep(i)}
                          className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--destructive)]"
                          title="删除该步"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Block>

            {/* 确认点 / 交付物 / 风险 */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {plan.confirmations.length > 0 && (
                <MiniBlock icon={<Hand size={12} />} title="需要你确认" tone="var(--warning)">
                  {plan.confirmations.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </MiniBlock>
              )}
              {plan.deliverables.length > 0 && (
                <MiniBlock icon={<PackageCheck size={12} />} title="预期交付物" tone="var(--accent-text)">
                  {plan.deliverables.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </MiniBlock>
              )}
              {plan.risks.length > 0 && (
                <MiniBlock icon={<AlertTriangle size={12} />} title="风险 / 不确定项" tone="var(--destructive)">
                  {plan.risks.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </MiniBlock>
              )}
            </div>

            {/* 操作 */}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                onClick={() => start(false)}
                disabled={!!starting}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
                title="落库工作流并进入工作区,但不立即执行"
              >
                {starting === 'test' ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
                创建工作流(不执行)
              </button>
              <button
                onClick={() => start(true)}
                disabled={!!starting}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
                title="落库工作流、进入工作区,并自动指派执行第一步"
              >
                {starting === 'run' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                开始运行
              </button>
            </div>
            <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Check size={11} /> 这些步骤会被真实落库为子任务(预览即执行,不会二次调用模型)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Block({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text-secondary)] uppercase">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  )
}

function MiniBlock({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: tone }}>
        {icon}
        {title}
      </div>
      <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-[var(--text-secondary)] [&>li]:flex [&>li]:gap-1.5 [&>li]:before:mt-1.5 [&>li]:before:h-1 [&>li]:before:w-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:bg-[var(--text-tertiary)] [&>li]:before:content-['']">
        {children}
      </ul>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
      {children}
    </span>
  )
}
