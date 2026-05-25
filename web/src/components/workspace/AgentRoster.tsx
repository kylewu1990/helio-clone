import { Shield, Users } from 'lucide-react'
import { Avatar } from '../Avatar'
import type { Agent, AgentStatus } from '../../lib/types'

const STATUS_META: Record<
  AgentStatus,
  { label: string; color: string; pulse?: boolean }
> = {
  idle: { label: '空闲', color: 'var(--agent-idle)' },
  working: { label: '执行中', color: 'var(--agent-working)', pulse: true },
  reviewing: { label: '复核中', color: 'var(--agent-reviewing)', pulse: true },
  blocked: { label: '受阻', color: 'var(--agent-blocked)' },
  done: { label: '已完成', color: 'var(--agent-done)' },
}

const TRUST_LABEL = ['观察', '执行', '自主']

// AI Team Status:纵向队员列表。Working/Reviewing 状态用玻璃卡 + 光环区分。
// parallelLanes > 1 时标注当前并行执行的 Agent 轨道数。
export function AgentRoster({
  agents,
  parallelLanes = 0,
}: {
  agents: Agent[]
  parallelLanes?: number
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Users size={13} />} title="AI 团队" count={agents.length} />
        {parallelLanes > 1 && (
          <span
            className="mb-2 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--text-tertiary)]"
            title="多个 Agent 正在并行执行"
          >
            <span
              className="h-1.5 w-1.5 rounded-full agent-pulse-ring"
              style={{ background: 'var(--agent-working)' }}
            />
            {parallelLanes} 路并行
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
        {agents.length === 0 && <EmptyHint text="还没有 AI 队员" />}
      </div>
    </section>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const meta = STATUS_META[agent.status]
  const active = agent.status === 'working' || agent.status === 'reviewing'
  return (
    <div
      className="card-lift rounded-[var(--radius-lg)] border p-3"
      style={{
        background: active ? 'var(--glass-surface)' : 'var(--canvas)',
        borderColor: active ? 'var(--glass-border)' : 'var(--border)',
        backdropFilter: active ? 'blur(8px)' : undefined,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <Avatar
            user={{
              name: agent.name,
              avatarColor: agent.avatarColor,
              isAssistant: true,
            }}
            size={34}
          />
          <span
            className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ${meta.pulse ? 'agent-pulse-ring' : ''}`}
            style={{
              background: meta.color,
              boxShadow: '0 0 0 2px var(--canvas)',
            }}
            title={meta.label}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {agent.name}
            </span>
            {agent.available === false && (
              <span
                className="shrink-0 rounded px-1 text-[10px] font-medium"
                style={{
                  color: 'var(--warning)',
                  background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
                }}
                title="未配置可用模型 / key,暂不可工作"
              >
                无 key
              </span>
            )}
          </div>
          <div className="truncate text-xs text-[var(--text-tertiary)]">
            {agent.role}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            color: meta.color,
            background: `color-mix(in oklch, ${meta.color} 12%, transparent)`,
          }}
        >
          {meta.label}
        </span>
      </div>

      {active && agent.currentTaskTitle && (
        <div className="mt-2 truncate border-t border-[var(--border)] pt-2 text-xs text-[var(--text-secondary)]">
          {agent.currentTaskTitle}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
        <Shield size={11} />
        信任 · {TRUST_LABEL[agent.trustLevel - 1]}
        <span className="ml-1 flex gap-0.5">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className="h-1 w-3 rounded-full"
              style={{
                background:
                  n <= agent.trustLevel ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
          ))}
        </span>
      </div>
    </div>
  )
}

export function SectionTitle({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count?: number
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-0.5">
      <span className="text-[var(--text-tertiary)]">{icon}</span>
      <span className="text-[11px] font-semibold tracking-[0.1em] text-[var(--text-tertiary)] uppercase">
        {title}
      </span>
      {count != null && (
        <span className="text-[11px] text-[var(--text-tertiary)]">· {count}</span>
      )}
    </div>
  )
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--text-tertiary)]">
      {text}
    </div>
  )
}
