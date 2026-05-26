import { useMemo, useState } from 'react'
import { Crosshair, Rocket } from 'lucide-react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import { AutonomyRing } from './ui/autonomy-ring'
import { PhaseProgress, type ProjectPhase as V4Phase } from './ui/phase-progress'
import { Badge } from './ui/badge'
import type { ChannelDetail, Task, User } from '../lib/types'

const PHASE_KEYS: V4Phase[] = ['discovery', 'build', 'review', 'ship', 'maintenance']

export function ProjectHeaderCardV4({
  detail,
  tasks,
  users,
  me,
  onUpdated,
}: {
  detail: ChannelDetail
  tasks: Task[]
  users: User[]
  me: User
  onUpdated?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const phase = ((detail.phase as V4Phase) ?? 'discovery') as V4Phase
  const owner = users.find((u) => u.id === detail.ownerId) ?? null
  const isOwner = me.id === detail.ownerId

  // 4 阶段完成率(build / review / ship / maintenance):各阶段 task 完成率
  const phasePercents = useMemo(() => {
    const r: Partial<Record<V4Phase, number>> = {}
    for (const p of PHASE_KEYS) {
      const phaseTasks = tasks.filter((t: any) => (t.phase ?? null) === p || (p === phase && !t.phase))
      if (phaseTasks.length === 0) {
        r[p] = 0
      } else {
        const done = phaseTasks.filter((t) => t.status === 'done').length
        r[p] = Math.round((done / phaseTasks.length) * 100)
      }
    }
    return r
  }, [tasks, phase])

  // 频道级自动度:平均所有 task 的 autonomy(若有 autonomy 字段)
  const autonomy = useMemo(() => {
    const vals = tasks
      .map((t: any) => t.autonomy)
      .filter((v) => typeof v === 'number' && v >= 0 && v <= 100)
    if (vals.length === 0) {
      // 退化:用完成率
      const done = tasks.filter((t) => t.status === 'done').length
      return tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0
    }
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }, [tasks])

  const switchPhase = async (next: V4Phase) => {
    if (!isOwner || busy || next === phase) return
    setBusy(true)
    try {
      await api.patchChannel(detail.id, { phase: next as any })
      onUpdated?.()
    } finally {
      setBusy(false)
    }
  }

  if (detail.kind && detail.kind !== 'project') return null

  return (
    <div className="mx-5 mb-2 mt-3 overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--glass)] shadow-[var(--shadow-1)] backdrop-blur">
      <div className="aurora-bar h-[2px] w-full" />

      <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          {/* 编号 + 标题 + ALPHA chip */}
          <div className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
              style={{
                color: 'var(--accent)',
                background: 'var(--accent-soft)',
              }}
            >
              <Rocket size={13} />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--mute)]">
              项目
            </span>
            <span className="text-[var(--mute-2)]">·</span>
            <h2 className="truncate text-[18px] font-semibold tracking-tight text-[var(--ink)]">
              #{detail.name || '未命名'}
            </h2>
            <Badge variant="accent">ALPHA</Badge>
          </div>

          {/* goal */}
          <div className="mt-2 flex items-start gap-1.5 text-[13px] text-[var(--ink-2)]">
            <Crosshair size={11} className="mt-1 shrink-0 text-[var(--mute)]" />
            <span className="line-clamp-2">{detail.goal || '(无目标)'}</span>
          </div>

          {/* owner */}
          {owner && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
              <Avatar user={owner} size={20} />
              <span>负责人:{owner.name}</span>
              {detail.startedAt && (
                <span className="text-[var(--mute)]">
                  · 开始于 {new Date(detail.startedAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 自动度 ring */}
        <div className="flex shrink-0 items-center gap-4">
          <AutonomyRing value={autonomy} size={72} label="auto" />
        </div>
      </div>

      {/* 5 段进度条 + 4 阶段百分比 */}
      <div className="border-t border-[var(--line-soft)] bg-[var(--glass-2)] px-5 py-3">
        <PhaseProgress current={phase} percents={phasePercents} />
        {isOwner && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--mute)]">
            <span>切换阶段:</span>
            {PHASE_KEYS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => switchPhase(p)}
                disabled={busy || p === phase}
                className="rounded border border-[var(--line)] bg-[var(--glass)] px-1.5 py-0.5 font-mono uppercase tracking-wider transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
