import { useState } from 'react'
import { Users, ChevronDown } from 'lucide-react'
import { Avatar } from '../Avatar'
import type { Agent, AgentStatus } from '../../lib/types'

const STATUS_META: Record<AgentStatus, { label: string; color: string; pulse?: boolean }> = {
  idle: { label: '空闲', color: 'var(--agent-idle)' },
  working: { label: '执行中', color: 'var(--agent-working)', pulse: true },
  reviewing: { label: '复核中', color: 'var(--agent-reviewing)', pulse: true },
  blocked: { label: '待输入', color: 'var(--agent-blocked)' },
  done: { label: '已完成', color: 'var(--agent-done)' },
}

// 紧凑 Team Strip:一行头像 + 状态点 + 概要(N 在线/执行中/待输入/无 key)。点击展开详情。
export function TeamStrip({ agents }: { agents: Agent[] }) {
  const [open, setOpen] = useState(false)
  const working = agents.filter((a) => a.status === 'working' || a.status === 'reviewing').length
  const waiting = agents.filter((a) => a.status === 'blocked').length
  const noKey = agents.filter((a) => a.available === false).length
  const online = agents.filter((a) => a.available !== false).length

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <Users size={15} className="shrink-0 text-[var(--accent-text)]" />
        <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)] uppercase">
          AI 团队
        </span>
        {/* 头像叠排 */}
        <div className="flex -space-x-2">
          {agents.slice(0, 8).map((a) => {
            const meta = STATUS_META[a.status]
            return (
              <span key={a.id} className="relative" title={`${a.name} · ${meta.label}`}>
                <span
                  className="block rounded-[var(--radius-md)] ring-2"
                  style={{ '--tw-ring-color': 'var(--surface-1)' } as React.CSSProperties}
                >
                  <Avatar
                    user={{ name: a.name, avatarColor: a.avatarColor, isAssistant: false }}
                    size={26}
                  />
                </span>
                <span
                  className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ${meta.pulse ? 'agent-pulse-ring' : ''}`}
                  style={{ background: meta.color, boxShadow: '0 0 0 1.5px var(--surface-1)' }}
                />
              </span>
            )
          })}
          {agents.length > 8 && (
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-3)] text-[10px] font-medium text-[var(--text-tertiary)] ring-2 ring-[var(--surface-1)]">
              +{agents.length - 8}
            </span>
          )}
        </div>
        {/* 概要 */}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
          <Stat n={online} label="在线" color="var(--agent-working)" />
          {working > 0 && <Stat n={working} label="执行中" color="var(--info)" />}
          {waiting > 0 && <Stat n={waiting} label="待输入" color="var(--agent-blocked)" />}
          {noKey > 0 && <Stat n={noKey} label="无 key" color="var(--warning)" />}
          <ChevronDown
            size={14}
            className="transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </div>
      </button>

      {open && (
        <div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const meta = STATUS_META[a.status]
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2"
              >
                <div className="relative shrink-0">
                  <Avatar
                    user={{ name: a.name, avatarColor: a.avatarColor, isAssistant: true }}
                    size={30}
                  />
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ${meta.pulse ? 'agent-pulse-ring' : ''}`}
                    style={{ background: meta.color, boxShadow: '0 0 0 2px var(--surface-2)' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">
                      {a.name}
                    </span>
                    {a.available === false && (
                      <span
                        className="shrink-0 rounded px-1 text-[9px] font-medium"
                        style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 12%, transparent)' }}
                      >
                        无 key
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                    {a.status === 'working' && a.currentTaskTitle ? a.currentTaskTitle : a.role}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 13%, transparent)` }}
                >
                  {meta.label}
                </span>
              </div>
            )
          })}
          {agents.length === 0 && (
            <p className="col-span-full py-3 text-center text-[12px] text-[var(--text-tertiary)]">
              还没有 AI 队员。到「消息」里创建助手即可。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums text-[var(--text-secondary)]">{n}</span>
      {label}
    </span>
  )
}
