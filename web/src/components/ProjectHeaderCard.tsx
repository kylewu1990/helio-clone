import { useState } from 'react'
import { Calendar, Crosshair, Rocket, Users } from 'lucide-react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import { PROJECT_PHASES } from './Sidebar'
import type { ChannelDetail, ProjectPhase, Task, User } from '../lib/types'

// v3 G1:项目频道顶部卡。一眼回答"这是个什么项目、卡在哪个阶段、谁负责、做到哪里了"。
// 设计:类 Delivery Card 视觉(surface-glow 头部 + 阶段进度条),但用 Rocket 图标 + accent 主轴。
// owner 可见时阶段切换;非 owner 只读。
export function ProjectHeaderCard({
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
  const phase = (detail.phase ?? 'discovery') as NonNullable<ProjectPhase>
  const phaseIdx = PROJECT_PHASES.findIndex((p) => p.key === phase)
  const owner = users.find((u) => u.id === detail.ownerId) ?? null
  const isOwner = me.id === detail.ownerId
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const totalTasks = tasks.length
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const switchPhase = async (next: NonNullable<ProjectPhase>) => {
    if (!isOwner || busy || next === phase) return
    setBusy(true)
    try {
      await api.patchChannel(detail.id, { phase: next })
      onUpdated?.()
    } finally {
      setBusy(false)
    }
  }

  if (detail.kind !== 'project') return null

  return (
    <div
      className="mx-5 mt-3 mb-1 overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-1)]"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 24%, var(--border))' }}
    >
      {/* 头部 banner:goal + owner + 完成率 */}
      <div
        className="surface-glow flex items-start gap-2.5 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 14%, transparent)' }}
        >
          <Rocket size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--accent)]">
              项目
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">·</span>
            <span
              className="rounded px-1 py-px text-[9.5px] font-medium"
              style={{
                color: PROJECT_PHASES[phaseIdx]?.color ?? 'var(--text-tertiary)',
                background: `color-mix(in oklch, ${PROJECT_PHASES[phaseIdx]?.color ?? 'var(--text-tertiary)'} 14%, transparent)`,
              }}
            >
              {PROJECT_PHASES[phaseIdx]?.label ?? phase}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--text-primary)]">
            <Crosshair size={11} className="mr-1 inline text-[var(--text-tertiary)]" />
            {detail.goal || '(无目标)'}
          </div>
          {detail.scope && (
            <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
              {detail.scope}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {owner && (
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-secondary)]">
              <Avatar user={owner} size={18} />
              <span className="font-medium">{owner.name}</span>
            </span>
          )}
          {totalTasks > 0 && (
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
              <Users size={11} />
              {doneTasks}/{totalTasks} 完成 ({completionPct}%)
            </span>
          )}
          {detail.deadline && (
            <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
              <Calendar size={11} />
              截止 {new Date(detail.deadline).toLocaleDateString('zh-CN')}
            </span>
          )}
        </div>
      </div>

      {/* 阶段进度条:5 段;当前段 aurora-bar shimmer + 文字加深;之前段 done 色;之后段 muted */}
      <div className="flex items-stretch gap-px px-2 py-2">
        {PROJECT_PHASES.map((p, i) => {
          const isPast = i < phaseIdx
          const isCurrent = i === phaseIdx
          const interactive = isOwner && !busy
          return (
            <button
              key={p.key}
              onClick={() => switchPhase(p.key)}
              disabled={!interactive}
              title={isOwner ? `点击切换到 ${p.label}` : p.label}
              className="group/phase relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[var(--radius-sm)] px-1.5 py-1 text-[10px] font-medium transition-colors"
              style={{
                color: isCurrent
                  ? p.color
                  : isPast
                    ? 'color-mix(in oklch, ' + p.color + ' 60%, var(--text-tertiary))'
                    : 'var(--text-tertiary)',
                background: isCurrent
                  ? `color-mix(in oklch, ${p.color} 14%, transparent)`
                  : 'transparent',
                cursor: interactive ? 'pointer' : 'default',
              }}
            >
              <span className="font-semibold">{p.label}</span>
              {isCurrent && (
                <span
                  className="aurora-bar absolute right-0 bottom-0 left-0 h-0.5"
                  aria-hidden
                />
              )}
              {isPast && (
                <span
                  className="absolute right-0 bottom-0 left-0 h-0.5"
                  style={{ background: p.color, opacity: 0.45 }}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
