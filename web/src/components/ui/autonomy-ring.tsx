import { cn } from '../../lib/cn'

export interface AutonomyRingProps {
  value: number // 0..100
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
}

// 颜色梯度按 doctrine §6.3:autonomy 100% = 全暖橙;<60% = 暖橙 → warn,极低 = danger。
function strokeFor(value: number) {
  if (value >= 80) return 'var(--accent)'
  if (value >= 60) return 'var(--accent-2)'
  if (value >= 40) return 'var(--warn)'
  return 'var(--danger)'
}

export function AutonomyRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  className,
}: AutonomyRingProps) {
  const v = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (v / 100) * circumference
  const stroke = strokeFor(v)
  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-label={`autonomy ${v}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 480ms var(--ease)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums leading-none text-[var(--ink)]"
          style={{ fontSize: Math.max(11, size * 0.28) }}
        >
          {v}
        </span>
        {label && (
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--mute)]">
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
