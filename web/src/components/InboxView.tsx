import { Inbox as InboxIcon, Hash, Menu } from 'lucide-react'
import { Avatar } from './Avatar'
import { formatTime } from '../lib/format'
import type { InboxItem } from '../lib/types'

export function InboxView({
  items,
  onOpen,
  onMarkRead,
  onMenuClick,
}: {
  items: InboxItem[]
  onOpen: (channelId: string, messageId: string) => void
  onMarkRead: () => void
  onMenuClick: () => void
}) {
  const hasUnread = items.some((i) => !i.read)
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-5">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] md:hidden"
          title="菜单"
        >
          <Menu size={18} />
        </button>
        <InboxIcon size={18} className="text-[var(--text-tertiary)]" />
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          收件箱
        </div>
        <div className="ml-auto">
          {hasUnread && (
            <button
              onClick={onMarkRead}
              className="rounded-[var(--radius-md)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
            >
              全部标记已读
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
            <InboxIcon size={40} strokeWidth={1.5} />
            <p>还没有人 @ 你。被提及的消息会汇总到这里。</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-1">
            {items.map((i) => (
              <button
                key={i.id}
                onClick={() => onOpen(i.channelId, i.messageId)}
                className="flex w-full gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]"
                style={{
                  background: i.read ? 'transparent' : 'var(--accent-soft)',
                }}
              >
                <Avatar user={i.author} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {i.author.name}
                    </span>
                    <span>在</span>
                    <span className="flex items-center gap-0.5">
                      {!i.isDM && <Hash size={11} />}
                      {i.channelName}
                    </span>
                    <span className="ml-auto">{formatTime(i.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-[var(--text-primary)]">
                    {i.body}
                  </div>
                </div>
                {!i.read && (
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
