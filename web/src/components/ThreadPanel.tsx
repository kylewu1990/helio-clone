import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { MessageRow } from './MessageRow'
import { Composer } from './Composer'
import type { Message, Thread, User } from '../lib/types'

export function ThreadPanel({
  thread,
  me,
  mentionables,
  onClose,
  onReact,
  onSendReply,
  onEdit,
  onDelete,
}: {
  thread: Thread
  me: User
  mentionables: User[]
  onClose: () => void
  onReact: (messageId: string, emoji: string) => void
  onSendReply: (body: string) => void
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
}) {
  const mentionNames = mentionables.flatMap((m) => [m.name, m.handle])
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.replies.length, thread.parent.id])

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--canvas)] max-xl:fixed max-xl:inset-0 max-xl:z-50 max-xl:w-full">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          话题串
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <ThreadMessage
          message={thread.parent}
          me={me}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          mentionNames={mentionNames}
        />

        <div className="my-2 flex items-center gap-3 px-2">
          <span className="text-xs text-[var(--text-tertiary)]">
            {thread.replies.length} 条回复
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {thread.replies.map((r) => (
          <ThreadMessage
            key={r.id}
            message={r}
            me={me}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            mentionNames={mentionNames}
          />
        ))}
        <div ref={endRef} />
      </div>

      <Composer
        placeholder="回复话题串…"
        onSend={onSendReply}
        mentionables={mentionables}
      />
    </aside>
  )
}

function ThreadMessage({
  message,
  me,
  onReact,
  onEdit,
  onDelete,
  mentionNames,
}: {
  message: Message
  me: User
  onReact: (messageId: string, emoji: string) => void
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
  mentionNames: string[]
}) {
  return (
    <MessageRow
      message={message}
      grouped={false}
      me={me}
      onReact={onReact}
      onEdit={onEdit}
      onDelete={onDelete}
      inThread
      mentionNames={mentionNames}
    />
  )
}
