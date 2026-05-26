// Inspired by recharts/recharts examples/AreaChart (MIT), see /THIRD_PARTY_LICENSES.md
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
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
  const series = data.map((v, i) => ({ i, v }))
  const gradientId = `spark-${Math.random().toString(36).slice(2, 9)}`
  return (
    <div style={{ width, height }} className={cn('block', className)} role="img" aria-label="sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          {fill && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.32} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.6}
            fill={fill ? `url(#${gradientId})` : 'transparent'}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
