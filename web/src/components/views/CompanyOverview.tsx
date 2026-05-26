import { useEffect, useState } from 'react'
import { Activity, Box, ChevronRight, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { AutonomyRing } from '../ui/autonomy-ring'
import { Sparkline } from '../ui/sparkline'
import { cn } from '../../lib/cn'

type Department = {
  key: string
  label: string
  status: 'RUNNING' | 'STUCK' | 'IDLE'
  autonomy: number
  deliveriesThisWeek: number
  openTasks: number
  sparkline: number[]
  channels: Array<{ id: string; name: string; phase: string | null }>
  oneLiner: string
}

export interface CompanyOverviewProps {
  onOpenChannel: (channelId: string) => void
}

const STATUS_VARIANT: Record<Department['status'], 'success' | 'warning' | 'default'> = {
  RUNNING: 'success',
  STUCK: 'warning',
  IDLE: 'default',
}

const STATUS_LABEL: Record<Department['status'], string> = {
  RUNNING: '推进中',
  STUCK: '阻塞',
  IDLE: '待命',
}

export function CompanyOverview({ onOpenChannel }: CompanyOverviewProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    setLoading(true)
    api
      .overviewDepartments()
      .then((r) => setDepartments(r.departments))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  const totalDeliveries = departments.reduce((s, d) => s + d.deliveriesThisWeek, 0)
  const totalTasks = departments.reduce((s, d) => s + d.openTasks, 0)
  const avgAutonomy =
    departments.length > 0
      ? Math.round(departments.reduce((s, d) => s + d.autonomy, 0) / departments.length)
      : 0

  return (
    <div className="mx-auto h-full w-full max-w-[1400px] overflow-y-auto px-10 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">
            公司全景
          </div>
          <h1 className="mt-1 font-display text-[32px] font-semibold tracking-tight text-[var(--ink)]">
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(94deg, var(--accent-2), var(--accent))',
              }}
            >
              你的 AI 公司
            </span>
            <span className="text-[var(--ink-2)]"> · 6 个部门状态一览</span>
          </h1>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          刷新
        </Button>
      </div>

      {/* 顶部 4 KPI 横条 */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiPill label="部门数" value={departments.length} />
        <KpiPill label="本周交付" value={totalDeliveries} />
        <KpiPill label="在跑任务" value={totalTasks} />
        <KpiPill label="平均自动度" value={`${avgAutonomy}%`} />
      </div>

      {/* 部门卡网格 */}
      {loading && departments.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--line-soft)] p-10 text-center text-[13px] text-[var(--mute)]">
          加载部门数据中…
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {departments.map((d) => (
            <motion.div
              key={d.key}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
            <Card className="card-lift">
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Box size={14} className="text-[var(--mute)]" />
                    <CardTitle className="truncate">{d.label}</CardTitle>
                    <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </div>
                  <div className="mt-2 text-[12.5px] text-[var(--ink-3)]">{d.oneLiner}</div>
                </div>
                <AutonomyRing value={d.autonomy} size={88} label="auto" />
              </CardHeader>

              <CardContent className="space-y-3">
                {/* 数据点 */}
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <Metric label="本周交付" value={d.deliveriesThisWeek} />
                  <Metric label="在跑任务" value={d.openTasks} />
                </div>

                {/* 7 日 sparkline */}
                {d.sparkline.some((v) => v > 0) ? (
                  <div className="flex items-center justify-between rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] px-3 py-2">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                        近 7 日交付
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                        累计 {d.sparkline.reduce((s, v) => s + v, 0)} 件
                      </div>
                    </div>
                    <Sparkline
                      data={d.sparkline}
                      width={100}
                      height={28}
                      stroke="var(--accent)"
                      fill="var(--accent)"
                    />
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-[var(--line-soft)] px-3 py-2 text-center text-[11px] text-[var(--mute)]">
                    本周还没有交付
                  </div>
                )}

                {/* 项目列表 */}
                <div className="flex flex-col gap-1">
                  {d.channels.length === 0 ? (
                    <div className="text-[11px] text-[var(--mute)]">无项目</div>
                  ) : (
                    d.channels.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onOpenChannel(c.id)}
                        className={cn(
                          'group flex items-center justify-between rounded px-2 py-1.5 text-left text-[12.5px] transition-colors',
                          'hover:bg-[var(--glass-2)]',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-[var(--mute)]">#</span>
                          <span className="truncate text-[var(--ink)]">{c.name || '未命名'}</span>
                          {c.phase && (
                            <span className="font-mono text-[10px] uppercase text-[var(--accent)]">
                              {c.phase}
                            </span>
                          )}
                        </div>
                        <ChevronRight
                          size={13}
                          className="shrink-0 text-[var(--mute)] group-hover:text-[var(--accent)]"
                        />
                      </button>
                    ))
                  )}
                  {d.channels.length > 4 && (
                    <div className="px-2 pt-1 text-[10px] text-[var(--mute)]">
                      还有 {d.channels.length - 4} 个项目…
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

function KpiPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--glass)] px-5 py-4 backdrop-blur">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
        {label}
      </div>
      <div className="mt-1.5 font-display text-[36px] font-bold tabular-nums leading-none text-[var(--ink)]">
        {value}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-[var(--line-soft)] bg-[var(--glass-2)] px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[16px] font-semibold tabular-nums text-[var(--ink)]">
        {value}
        <Activity size={11} className="text-[var(--mute)]" />
      </div>
    </div>
  )
}
