// G2:5 段进度卡(横排 5 段 pill,等宽,每段:状态点 + 名称 + 百分比 + 进度条)
// 对齐 docs/ai/reference/v4-opendesign-screens/03-project-pixel2-preview.png
import { cn } from '../../lib/cn'

export type ProjectPhase =
  | 'discovery'
  | 'build'
  | 'review'
  | 'ship'
  | 'maintenance'

export const PHASES: ProjectPhase[] = [
  'discovery',
  'build',
  'review',
  'ship',
  'maintenance',
]

const LABELS: Record<ProjectPhase, string> = {
  discovery: 'DISCOVERY',
  build: 'BUILD',
  review: 'REVIEW',
  ship: 'SHIP',
  maintenance: 'MAINTENANCE',
}

export interface PhaseProgressProps {
  current: ProjectPhase
  percents?: Partial<Record<ProjectPhase, number>>
  className?: string
}

export function PhaseProgress({ current, percents, className }: PhaseProgressProps) {
  const currentIdx = PHASES.indexOf(current)
  return (
    <div className={cn('grid grid-cols-5 gap-2', className)}>
      {PHASES.map((p, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const future = idx > currentIdx
        const pct = percents?.[p] ?? (done ? 100 : 0)
        const dotColor = done
          ? 'oklch(70% 0.16 145)'
          : active
            ? 'var(--accent)'
            : 'oklch(60% 0.02 80 / 0.4)'
        const barFg = done
          ? 'oklch(70% 0.16 145)'
          : active
            ? 'var(--accent)'
            : 'oklch(60% 0.02 80 / 0.3)'
        return (
          <div
            key={p}
            className={cn(
              'rounded-lg border px-3 py-2 transition-colors',
              done && 'border-[var(--line-soft)] bg-[var(--glass)]',
              active && 'border-[var(--accent)]/40 bg-[color-mix(in_oklch,var(--accent)_8%,var(--glass))] phase-pulse',
              future && 'border-dashed border-[var(--line-soft)] bg-transparent',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', active && 'agent-pulse-ring')}
                  style={{ background: dotColor }}
                />
                <span
                  className="font-mono text-[9.5px] uppercase tracking-[0.16em]"
                  style={{
                    color: done
                      ? 'oklch(70% 0.16 145)'
                      : active
                        ? 'var(--accent)'
                        : 'var(--mute)',
                  }}
                >
                  {LABELS[p]}
                </span>
              </div>
              <span
                className="font-mono text-[10.5px] tabular-nums font-medium"
                style={{
                  color: done
                    ? 'oklch(70% 0.16 145)'
                    : active
                      ? 'var(--accent)'
                      : 'var(--mute)',
                }}
              >
                {pct}%
              </span>
            </div>
            {/* 进度条:done 100% / active 部分填充 / future 空 */}
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barFg }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
