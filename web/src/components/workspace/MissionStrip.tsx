import { Rocket } from 'lucide-react'
import { relativeTime } from '../../lib/format'
import { SectionTitle } from './AgentRoster'
import type { MissionRow } from '../../lib/types'

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: '草案', color: 'var(--ink-30)' },
  planning: { label: '规划中', color: 'var(--info)' },
  ready: { label: '就绪', color: 'var(--info)' },
  running: { label: '执行中', color: 'var(--agent-working)' },
  review: { label: '审查', color: 'var(--warning)' },
  delivered: { label: '已交付', color: 'var(--success)' },
  archived: { label: '归档', color: 'var(--ink-30)' },
}

// 真实 Mission 列表(横向)。点击选中 → 任务拆解区展示该 Mission 的真实子任务。
export function MissionStrip({
  missions,
  selectedId,
  onSelect,
}: {
  missions: MissionRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section>
      <SectionTitle icon={<Rocket size={13} />} title="Missions" count={missions.length} />
      {missions.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">
          还没有 Mission。在上方输入目标,创建你的第一个 Mission。
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {missions.map((m) => {
            const meta = STATUS_META[m.status] ?? STATUS_META.draft
            const active = m.id === selectedId
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className="card-lift w-[240px] shrink-0 rounded-[var(--radius-lg)] border p-3 text-left"
                style={{
                  background: active ? 'var(--glass-surface)' : 'var(--canvas)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  backdropFilter: active ? 'blur(8px)' : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      color: meta.color,
                      background: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                    {relativeTime(m.updatedAt)}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium text-[var(--text-primary)]">
                  {m.title}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
