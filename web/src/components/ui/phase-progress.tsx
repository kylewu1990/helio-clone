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
  maintenance: 'MAINTAIN',
}

export interface PhaseProgressProps {
  current: ProjectPhase
  percents?: Partial<Record<ProjectPhase, number>>
  className?: string
}

export function PhaseProgress({ current, percents, className }: PhaseProgressProps) {
  const currentIdx = PHASES.indexOf(current)
  return (
    <div className={cn('flex items-stretch gap-1.5', className)}>
      {PHASES.map((p, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const pct = percents?.[p]
        return (
          <div
            key={p}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors border',
              done && 'bg-[var(--ok)] text-[oklch(15%_0.02_80)] border-[var(--ok)]',
              active &&
                'bg-[var(--accent)] text-[oklch(15%_0.02_80)] border-[var(--accent)] phase-pulse',
              !done &&
                !active &&
                'bg-transparent text-[var(--mute)] border-[var(--line)]',
            )}
            title={`${LABELS[p]}${pct != null ? ` · ${pct}%` : ''}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold">{LABELS[p]}</span>
              {pct != null && (
                <span className="tabular-nums opacity-80">{pct}%</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
