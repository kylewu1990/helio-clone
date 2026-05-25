import { useState } from 'react'
import { BookOpen, Menu, Sparkles, Target, FilePlus2, Loader2 } from 'lucide-react'
import type { WorkspaceSummary } from '../../lib/workspace'

// Mission Command:首屏顶部。Heliox 指挥中心标识 + Mission Composer(创建 + 一键 AI 拆解)+ 本轮状态摘要。
export function CommandHeader({
  summary,
  onCompose,
  onOpenVault,
  onMenuClick,
}: {
  summary: WorkspaceSummary
  onCompose: (goal: string, breakdown: boolean) => void | Promise<void>
  onOpenVault: () => void
  onMenuClick: () => void
}) {
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState<'plan' | 'draft' | null>(null)

  const submit = async (breakdown: boolean) => {
    const g = goal.trim()
    if (!g || busy) return
    setBusy(breakdown ? 'plan' : 'draft')
    try {
      await onCompose(g, breakdown)
      setGoal('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <header className="constellation-bg relative overflow-hidden border-b border-[var(--border)] bg-[var(--chrome-frame)] px-5 py-5 md:px-7 md:py-6">
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              onClick={onMenuClick}
              className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] md:hidden"
              title="菜单"
            >
              <Menu size={18} />
            </button>
            {/* Heliox 标识 */}
            <span
              className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-lg)] sm:flex"
              style={{
                background: 'linear-gradient(140deg, var(--accent), color-mix(in oklch, var(--accent) 50%, var(--info)))',
                boxShadow: '0 0 18px -4px var(--glow-accent)',
              }}
            >
              <HelioxMark />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[var(--text-tertiary)] uppercase">
                <span className="h-1.5 w-1.5 rounded-full agent-pulse-ring" style={{ background: 'var(--agent-working)' }} />
                Heliox · AI Team Command Center
              </div>
              <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--text-primary)] md:text-[1.6rem]">
                把一个目标,交给一支 AI 团队。
              </h1>
              <p className="mt-1 max-w-xl text-[13px] text-[var(--text-secondary)]">
                输入目标 → AI 拆解 → 指派执行人 → 实时驾驶舱观察 → 审查交付。人类只做关键决策。
              </p>
            </div>
          </div>
          <button
            onClick={onOpenVault}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            <BookOpen size={15} />
            <span className="hidden sm:inline">上下文库</span>
          </button>
        </div>

        {/* Mission Composer */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="flex flex-1 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2.5"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <Target size={16} className="shrink-0 text-[var(--accent-text)]" />
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit(true)}
              placeholder="描述你要完成的目标,回车交给 AI 拆解…"
              className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => submit(false)}
              disabled={!goal.trim() || !!busy}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] disabled:opacity-40"
              title="只创建 Mission 草案,稍后再拆解"
            >
              {busy === 'draft' ? <Loader2 size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
              建草案
            </button>
            <button
              onClick={() => submit(true)}
              disabled={!goal.trim() || !!busy}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-3.5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {busy === 'plan' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {busy === 'plan' ? 'AI 拆解中…' : '创建 + AI 拆解'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Stat label="活跃队员" value={summary.activeAgents} tone="working" />
          <Stat label="进行中" value={summary.inProgress} tone="info" />
          <Stat label="待复核" value={summary.inReview} tone="reviewing" />
          <Stat label="待你确认" value={summary.awaitingHuman} tone="accent" highlight />
        </div>
      </div>
    </header>
  )
}

// 原创标记:一个由轨道环抱的核心(constellation/恒星),非任何参考品牌
function HelioxMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <circle cx="12" cy="12" r="3.2" fill="white" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" opacity="0.85" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(60 12 12)" opacity="0.55" />
    </svg>
  )
}

function Stat({
  label,
  value,
  tone,
  highlight,
}: {
  label: string
  value: number
  tone: 'working' | 'info' | 'reviewing' | 'accent'
  highlight?: boolean
}) {
  const dot =
    tone === 'working'
      ? 'var(--agent-working)'
      : tone === 'reviewing'
        ? 'var(--agent-reviewing)'
        : tone === 'accent'
          ? 'var(--accent)'
          : 'var(--info)'
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-1.5"
      style={{
        background: highlight && value > 0 ? 'var(--accent-soft)' : 'var(--glass-surface)',
        borderColor: highlight && value > 0 ? 'var(--accent)' : 'var(--glass-border)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {highlight ? (
        <Sparkles size={13} style={{ color: 'var(--accent-text)' }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      )}
      <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
    </div>
  )
}
