// J/N1:模板派工时弹出"选项目频道"小弹窗。
// 列当前所有非归档项目频道,选完 → onPick(channelId)。
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { ChannelSummary } from '../lib/types'

export function ChannelPicker({
  open,
  channels,
  templateTitle,
  onPick,
  onClose,
}: {
  open: boolean
  channels: ChannelSummary[]
  templateTitle: string
  onPick: (channelId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!open) setQ('')
  }, [open])
  if (!open) return null
  const projects = channels.filter((c) => !c.archived && !c.isDM && (c.kind === 'project' || c.kind == null))
  const list = q
    ? projects.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    : projects
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[min(440px,92vw)] rounded-[14px] border border-[var(--line)] bg-[var(--glass-2)] shadow-[var(--shadow-2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
              选项目频道派工
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-[var(--ink)]">
              {templateTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--mute)] hover:bg-[var(--glass)] hover:text-[var(--ink-2)]"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-2.5 py-1.5">
            <Search size={13} className="text-[var(--mute)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索项目频道…"
              className="flex-1 bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
            />
          </div>
          <ul className="mt-3 flex max-h-[280px] flex-col overflow-y-auto">
            {list.length === 0 ? (
              <li className="rounded-md px-2 py-3 text-[12px] text-[var(--mute)]">
                没有可用的项目频道。
              </li>
            ) : (
              list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[12.5px] text-[var(--ink-2)] hover:bg-[var(--glass)] hover:text-[var(--ink)]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--mute)]">#</span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-[10.5px] text-[var(--mute)]">
                      {c.phase ?? '—'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
