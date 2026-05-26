import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Eye,
  FilePen,
  PackageCheck,
  UserCheck,
  Zap,
} from 'lucide-react'
import { relativeTime } from '../../lib/format'
import { SectionTitle, EmptyHint } from './AgentRoster'
import type { ActivityEvent, ActivityEventType } from '../../lib/types'

const EVENT_META: Record<
  ActivityEventType,
  { icon: React.ReactNode; color: string }
> = {
  'agent-start': { icon: <Zap size={13} />, color: 'var(--info)' },
  'agent-complete': { icon: <CheckCircle2 size={13} />, color: 'var(--success)' },
  'file-change': { icon: <FilePen size={13} />, color: 'var(--warning)' },
  'review-request': { icon: <Eye size={13} />, color: 'var(--agent-reviewing)' },
  'human-confirm': { icon: <UserCheck size={13} />, color: 'var(--accent)' },
  blocked: { icon: <AlertCircle size={13} />, color: 'var(--destructive)' },
  'delivery-ready': { icon: <PackageCheck size={13} />, color: 'var(--accent)' },
}

// Live Activity Timeline:最近运行记录,带连接竖线与事件类型图标。人类可读,工具名作次级 chip。
export function ActivityFeed({
  events,
  limit = 12,
  title = '活动',
}: {
  events: ActivityEvent[]
  limit?: number
  title?: string
}) {
  const list = events.slice(0, limit)
  return (
    <section className="flex min-h-0 flex-col">
      <SectionTitle icon={<Activity size={13} />} title={title} />
      <div className="relative min-h-0 flex-1 overflow-y-auto pr-0.5">
        {list.length === 0 && <EmptyHint text="暂无运行记录" />}
        <ol className="relative">
          {list.map((e, i) => {
            const meta = EVENT_META[e.type]
            return (
              <li
                key={e.id}
                className="activity-in relative flex gap-3 pb-3 pl-1"
              >
                {/* 连接竖线 */}
                {i < list.length - 1 && (
                  <span
                    className="absolute top-6 left-[13px] bottom-0 w-px"
                    style={{ background: 'var(--border)' }}
                  />
                )}
                <span
                  className="z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    color: meta.color,
                    background: `color-mix(in oklch, ${meta.color} 12%, var(--canvas))`,
                  }}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-[var(--text-secondary)]">
                    <span className="font-medium text-[var(--text-primary)]">
                      {e.agentName}
                    </span>{' '}
                    {e.description}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {relativeTime(e.timestamp)}
                    </span>
                    {e.secondary && (
                      <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                        {e.secondary}
                      </span>
                    )}
                    {e.requiresHuman && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          color: 'var(--accent-text)',
                          background: 'var(--accent-soft)',
                        }}
                      >
                        待人工确认
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
