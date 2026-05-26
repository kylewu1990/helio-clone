import { useEffect, useState } from 'react'
import { Brain, RefreshCw, Sparkles } from 'lucide-react'
import { Avatar } from '../Avatar'
import { api } from '../../lib/api'
import type { ChannelMemoriesResponse } from '../../lib/types'

// v3 G3:Memory 只读面板 — 显示该频道里每个 AI 的 L2 + L3。
// Phase B 加手动编辑 + Dream Cycle 触发按钮。
export function MemoryPanel({ channelId, refreshKey }: { channelId: string; refreshKey: number }) {
  const [data, setData] = useState<ChannelMemoriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      setData(await api.channelMemories(channelId))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, refreshKey])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-[11px] text-[var(--text-tertiary)]">
        <Brain size={13} className="text-[var(--accent-text)]" />
        <span className="font-semibold text-[var(--text-secondary)]">AI 记忆</span>
        <span>· L1 角色 / L2 项目 / L3 情节</span>
        <button
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)]"
          title="刷新"
        >
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 text-[12px]">
        {loading && (
          <div className="text-[var(--text-tertiary)]">加载中…</div>
        )}
        {err && !loading && (
          <div className="text-[var(--destructive)]">加载失败:{err}</div>
        )}
        {!loading && !err && (!data || data.agents.length === 0) && (
          <div className="text-[var(--text-tertiary)]">
            这个频道还没有 AI 助手。把 AI 加入 → 派任务 → 记忆会自动累积。
          </div>
        )}
        {!loading && data && (
          <div className="flex flex-col gap-3">
            {data.agents.map(({ agent, l2, l3 }) => (
              <div
                key={agent.id}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]"
              >
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-3)] px-3 py-2">
                  <Avatar user={{ ...agent, isAssistant: true }} size={22} />
                  <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {agent.name}
                  </span>
                  <span className="ml-auto flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                    {l2 && (
                      <span className="rounded px-1 py-px font-medium" style={{ color: 'var(--accent-text)', background: 'color-mix(in oklch, var(--accent-text) 12%, transparent)' }}>
                        L2 · {l2.itemCount} 条
                      </span>
                    )}
                    {l3 && (
                      <span className="rounded px-1 py-px font-medium" style={{ color: 'var(--info)', background: 'color-mix(in oklch, var(--info) 12%, transparent)' }}>
                        L3 · {l3.itemCount} 条
                      </span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 px-3 py-2">
                  <MemoryBlock
                    title="L2 项目记忆(长期 / 关键决定)"
                    color="var(--accent-text)"
                    item={l2}
                  />
                  <MemoryBlock
                    title="L3 情节记忆(最近事件,prepend)"
                    color="var(--info)"
                    item={l3}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoryBlock({
  title,
  color,
  item,
}: {
  title: string
  color: string
  item: { content: string; updatedAt: string; itemCount: number; whyJson?: string | null } | null
}) {
  if (!item) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--text-tertiary)]">
        <span className="font-semibold" style={{ color }}>
          {title}
        </span>
        <div className="mt-0.5">(尚无记录,在项目频道里 @ 这个 AI / 派任务即触发)</div>
      </div>
    )
  }
  return (
    <div
      className="rounded-[var(--radius-md)] border px-2.5 py-2"
      style={{ borderColor: `color-mix(in oklch, ${color} 22%, var(--border))` }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color }}>
          {title}
        </span>
        <Sparkles size={10} className="text-[var(--text-tertiary)]" />
        <span className="text-[9.5px] text-[var(--text-tertiary)]">
          更新于 {new Date(item.updatedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
        {item.content}
      </pre>
    </div>
  )
}
