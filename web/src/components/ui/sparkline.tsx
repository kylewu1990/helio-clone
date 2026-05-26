import { cn } from '../../lib/cn'

export interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  className?: string
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = 'var(--accent)',
  fill,
  className,
}: SparklineProps) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / Math.max(1, data.length - 1)
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return { x, y }
  })
  const path = points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}` : `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`))
    .join(' ')
  const area = fill
    ? `${path} L ${width} ${height} L 0 ${height} Z`
    : null
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block', className)}
      role="img"
      aria-label="sparkline"
    >
      {area && <path d={area} fill={fill} opacity={0.18} />}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
