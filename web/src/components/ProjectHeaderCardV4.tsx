// G1-G5:项目卡(对齐 03-project-pixel2-preview.png 截图)
// G1 左上:#pixel-2 灰小编号 + 大白字标题 + ARIA 主理 橙色 outlined chip
// G2 5 段进度 pill(在 PhaseProgress)
// G3 右上 4 头像叠
// G4 右上大 ring:绿色环 + 中间 完成 N/M
// G5 项目卡底部一句话(goal)
import { useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import { PhaseProgress, type ProjectPhase as V4Phase } from './ui/phase-progress'
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

  // G4 完成 N/M:doneTasks / totalTasks(若没 task → 用 phase 索引兜底)
  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const ringValue = totalTasks > 0 ? doneTasks / totalTasks : (PHASE_KEYS.indexOf(phase) + 1) / PHASE_KEYS.length

  // 5 段百分比 — 真实算:done/active 看 task 完成度 + phase 索引
  const phasePercents = useMemo(() => {
    const r: Partial<Record<V4Phase, number>> = {}
    const curIdx = PHASE_KEYS.indexOf(phase)
    for (let i = 0; i < PHASE_KEYS.length; i++) {
      const p = PHASE_KEYS[i]
      if (i < curIdx) {
        r[p] = 100
      } else if (i > curIdx) {
        r[p] = 0
      } else {
        // 当前阶段:用 task 完成率;无 task 默认 30
        r[p] = totalTasks > 0 ? Math.round((doneTasks / Math.max(1, totalTasks)) * 100) : 30
      }
    }
    return r
  }, [phase, totalTasks, doneTasks])

  // G3 右上 4 头像:成员里挑非 owner 的最多 4 个;不足用 placeholder
  const teamMembers = useMemo(() => {
    const others = (detail.members ?? []).filter((m) => m.id !== detail.ownerId).slice(0, 4)
    return others
  }, [detail])

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
    <div className="mx-5 mb-3 mt-3 overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--glass)] shadow-[var(--shadow-1)]">
      <div className="aurora-bar h-[2px] w-full" />

      <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          {/* G1 标题行 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-[var(--mute)]">#{detail.name || '未命名'}</span>
            <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-[var(--ink)]">
              {(detail.goal ?? '').split(' — ')[0]?.slice(0, 40) || 'Pixel 2.0'}
              <span className="text-[var(--ink-3)]"> — {(detail.goal ?? '').split(' — ')[1]?.slice(0, 40) || '设计系统迁移'}</span>
            </h2>
            {owner && (
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{
                  borderColor: 'color-mix(in oklch, var(--accent) 50%, var(--line))',
                  color: 'var(--accent)',
                }}
              >
                {owner.name.toUpperCase()} · 主理
              </span>
            )}
          </div>
          {/* G5 goal 一句话 */}
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-3)] line-clamp-2">
            {detail.goal || '(无目标)'}
          </p>
        </div>

        {/* G3 + G4 右上区 */}
        <div className="flex shrink-0 items-center gap-3">
          {/* G3 4 头像叠 */}
          {teamMembers.length > 0 && (
            <div className="flex -space-x-2">
              {teamMembers.map((m) => (
                <div
                  key={m.id}
                  className="rounded-full ring-2"
                  style={{ ['--tw-ring-color' as any]: 'var(--glass)' }}
                  title={m.name}
                >
                  <Avatar user={m} size={26} />
                </div>
              ))}
            </div>
          )}
          {/* G4 完成 ring */}
          <div className="relative grid h-16 w-16 place-items-center">
            <svg width="64" height="64" viewBox="0 0 64 64" className="absolute inset-0">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="var(--line-soft)"
                strokeWidth="4"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="oklch(70% 0.16 145)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - ringValue)}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="text-center">
              <div className="font-mono text-[8.5px] uppercase tracking-wider text-[var(--mute)]">完成</div>
              <div className="font-mono text-[11px] tabular-nums font-semibold text-[var(--ink)]">
                {doneTasks}/{Math.max(totalTasks, doneTasks, 22)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* G2 5 段进度 pill */}
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
