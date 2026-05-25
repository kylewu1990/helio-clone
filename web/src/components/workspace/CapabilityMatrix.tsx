import { ShieldCheck, ShieldAlert, ShieldX, Terminal, Bot, Cpu } from 'lucide-react'
import { SectionTitle, EmptyHint } from './AgentRoster'
import type { Capability } from '../../lib/types'

// 能力分层 / 权限矩阵:诚实展示系统当前真实具备 / 需人工审批 / 未实现的能力。
// 对照用户反馈:终端能力分层要清楚(人类终端 vs 助手 run_command vs 未来电脑/浏览器控制)。

const LEVEL_META: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  available: { label: '可用', color: 'var(--success)', icon: <ShieldCheck size={13} /> },
  approval: { label: '需人工批准', color: 'var(--warning)', icon: <ShieldAlert size={13} /> },
  unavailable: { label: '未实现', color: 'var(--text-tertiary)', icon: <ShieldX size={13} /> },
}

const KIND_META: Record<string, { label: string; icon: React.ReactNode }> = {
  human: { label: '人类操作', icon: <Terminal size={12} /> },
  assistant: { label: 'AI 助手', icon: <Bot size={12} /> },
  future: { label: '路线规划(未实现)', icon: <Cpu size={12} /> },
}

export function CapabilityMatrix({ capabilities }: { capabilities: Capability[] }) {
  const order: Capability['kind'][] = ['human', 'assistant', 'future']
  const grouped = order
    .map((k) => ({ kind: k, items: capabilities.filter((c) => c.kind === k) }))
    .filter((g) => g.items.length > 0)

  return (
    <section className="flex min-h-0 flex-col">
      <SectionTitle
        icon={<ShieldCheck size={13} />}
        title="能力分层 · 权限矩阵"
        count={capabilities.length}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {capabilities.length === 0 && <EmptyHint text="能力清单加载中…" />}
        <div className="flex flex-col gap-3">
          {grouped.map((g) => (
            <div key={g.kind}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[var(--text-tertiary)]">
                {KIND_META[g.kind]?.icon}
                {KIND_META[g.kind]?.label}
              </div>
              <div className="flex flex-col gap-1.5">
                {g.items.map((c) => {
                  const lm = LEVEL_META[c.level] ?? LEVEL_META.unavailable
                  return (
                    <div
                      key={c.id}
                      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            color: lm.color,
                            background: `color-mix(in oklch, ${lm.color} 14%, transparent)`,
                          }}
                        >
                          {lm.icon}
                          {lm.label}
                        </span>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">
                          {c.label}
                        </span>
                        {c.danger && c.level !== 'unavailable' && (
                          <span className="ml-auto text-[10px] text-[var(--warning)]">
                            高危
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">
                        {c.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
