import { useState, type ReactNode } from 'react'
import { CalendarClock, Eye, MessageSquare, Pencil, Pin, SmilePlus, Trash2, Wrench } from 'lucide-react'
import { Avatar } from './Avatar'
import { MarkdownBody } from './MarkdownBody'
import { formatTime } from '../lib/format'
import type { Message, User } from '../lib/types'
import { EMOJI, SKILL_LABELS } from '../lib/constants'

export function MessageRow({
  message,
  grouped,
  me,
  onReact,
  onOpenThread,
  onEdit,
  onDelete,
  onPin,
  onDeleteEvent,
  selectMode = false,
  selected = false,
  onToggleSelect,
  inThread = false,
  mentionNames = [],
}: {
  message: Message
  grouped: boolean
  me: User
  onReact: (messageId: string, emoji: string) => void
  onOpenThread?: (messageId: string) => void
  onEdit?: (messageId: string, body: string) => void
  onDelete?: (messageId: string) => void
  onPin?: (messageId: string) => void
  onDeleteEvent?: (eventId: string) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (messageId: string) => void
  inThread?: boolean
  mentionNames?: string[]
}) {
  const [palette, setPalette] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmDelEvent, setConfirmDelEvent] = useState(false)
  const isMine = message.authorId === me.id

  // 已删除:占位
  if (message.deletedAt) {
    return (
      <div
        data-mid={message.id}
        className="flex gap-3 px-2"
        style={{ paddingTop: grouped ? 1 : 8, paddingBottom: 1 }}
      >
        <div className="w-9 shrink-0">
          {!grouped && <Avatar user={message.author} size={36} />}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {message.author.name}
            </div>
          )}
          <div className="text-sm text-[var(--text-tertiary)] italic">
            此消息已删除
          </div>
        </div>
      </div>
    )
  }

  const saveEdit = () => {
    const v = draft.trim()
    if (v && v !== message.body) onEdit?.(message.id, v)
    setEditing(false)
  }

  return (
    <div
      data-mid={message.id}
      onContextMenu={(e) => {
        if (selectMode || !onDelete) return
        e.preventDefault()
        setConfirmDel(true)
      }}
      onClick={selectMode ? () => onToggleSelect?.(message.id) : undefined}
      className={`group relative flex gap-3 rounded-[var(--radius-md)] px-2 transition-colors ${
        selectMode
          ? `cursor-pointer ${selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]'}`
          : 'hover:bg-[var(--hover)]'
      }`}
      style={{ paddingTop: grouped ? 1 : 8, paddingBottom: 1 }}
    >
      {selectMode && (
        <div className="flex w-5 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="h-4 w-4"
            style={{ accentColor: 'var(--accent)' }}
          />
        </div>
      )}
      <div className="w-9 shrink-0">
        {!grouped && <Avatar user={message.author} size={36} />}
        {grouped && (
          <span className="hidden pt-0.5 text-right text-[10px] leading-5 text-[var(--text-tertiary)] group-hover:block">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {message.author.name}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // 输入法合成中:交给输入法上屏,不触发保存
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  saveEdit()
                }
                if (e.key === 'Escape') {
                  setDraft(message.body)
                  setEditing(false)
                }
              }}
              rows={2}
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <div className="mt-1 flex gap-2 text-xs text-[var(--text-tertiary)]">
              <button onClick={saveEdit} className="text-[var(--accent-text)]">
                保存
              </button>
              <button
                onClick={() => {
                  setDraft(message.body)
                  setEditing(false)
                }}
              >
                取消
              </button>
              <span>Enter 保存 · Esc 取消</span>
            </div>
          </div>
        ) : (
          <div>
            <MarkdownBody body={message.body} mentionNames={mentionNames} />
            {message.editedAt && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                (已编辑)
              </span>
            )}
          </div>
        )}

        {/* 事件:日历卡片(该消息是某事件的卡片 + 讨论线程根) */}
        {message.event && (
          <div
            onContextMenu={(e) => {
              if (!onDeleteEvent) return
              e.preventDefault()
              e.stopPropagation()
              setConfirmDelEvent(true)
            }}
            className="relative mt-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--paper-mid)] p-3"
          >
            <div className="flex items-center gap-2">
              <CalendarClock size={16} style={{ color: 'var(--accent-text)' }} />
              <span className="font-semibold text-[var(--text-primary)]">
                {message.event.title}
              </span>
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              {formatEventTime(message.event.startsAt, message.event.endsAt)}
              {message.event.location && ` · ${message.event.location}`}
            </div>
            {message.event.description && (
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                {message.event.description}
              </div>
            )}
            {!inThread && onOpenThread && (
              <button
                onClick={() => onOpenThread(message.id)}
                className="mt-2 text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                {message.replyCount > 0
                  ? `${message.replyCount} 条讨论 ›`
                  : '进入讨论 ›'}
              </button>
            )}
            {confirmDelEvent && (
              <div className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-2 text-xs">
                <span className="text-[var(--text-secondary)]">
                  删除该事件?(连同卡片)
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteEvent?.(message.event!.id)
                    setConfirmDelEvent(false)
                  }}
                  className="font-medium"
                  style={{ color: 'var(--destructive)' }}
                >
                  删除
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDelEvent(false)
                  }}
                  className="text-[var(--text-tertiary)]"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}

        {/* 工具调用标签 */}
        {message.toolsUsed.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Wrench size={11} />
            {message.toolsUsed.map((t) => (
              <span
                key={t}
                className="rounded px-1 ring-1 ring-[var(--border)]"
              >
                {SKILL_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}

        {/* cede:已读但本轮选择不回的助手(主动响应透明) */}
        {message.cededBy.length > 0 && (
          <div
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]"
            title={`${message.cededBy.join('、')} 看到了但本轮选择不回应`}
          >
            <Eye size={11} />
            {message.cededBy.length} 位助手已读未回
          </div>
        )}

        {/* 反应条 */}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(me.id)
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(message.id, r.emoji)}
                  className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors"
                  style={{
                    borderColor: mine ? 'var(--accent)' : 'var(--border)',
                    background: mine ? 'var(--accent-soft)' : 'var(--paper-mid)',
                    color: mine ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 话题串入口 */}
        {!inThread && message.replyCount > 0 && onOpenThread && (
          <button
            onClick={() => onOpenThread(message.id)}
            className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-md)] px-1 py-0.5 text-xs font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-soft)]"
          >
            <span className="flex -space-x-1">
              {message.replyParticipants.map((p) => (
                <Avatar key={p.id} user={p} size={16} />
              ))}
            </span>
            {message.replyCount} 条回复
          </button>
        )}
      </div>

      {/* 悬浮操作条 */}
      {!editing && !selectMode && (
        <div
          className={`absolute -top-3 right-2 z-10 items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-0.5 shadow-sm ${confirmDel ? 'flex' : 'hidden group-hover:flex'}`}
        >
          {confirmDel ? (
            <div className="flex items-center gap-1 px-1 text-xs">
              <span className="text-[var(--text-secondary)]">删除?</span>
              <button
                onClick={() => {
                  onDelete?.(message.id)
                  setConfirmDel(false)
                }}
                className="font-medium"
                style={{ color: 'var(--destructive)' }}
              >
                删除
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="text-[var(--text-tertiary)]"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <ActionButton
                  title="添加反应"
                  onClick={() => setPalette((v) => !v)}
                >
                  <SmilePlus size={16} />
                </ActionButton>
                {palette && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setPalette(false)}
                    />
                    <div className="absolute top-7 right-0 z-20 grid max-h-48 w-64 grid-cols-8 gap-0.5 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-1.5 shadow-lg">
                      {EMOJI.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            onReact(message.id, e)
                            setPalette(false)
                          }}
                          className="rounded-[var(--radius-md)] py-1 text-base transition-colors hover:bg-[var(--hover)]"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {!inThread && onOpenThread && (
                <ActionButton
                  title="在话题串中回复"
                  onClick={() => onOpenThread(message.id)}
                >
                  <MessageSquare size={16} />
                </ActionButton>
              )}
              {onPin && (
                <ActionButton
                  title={message.pinnedAt ? '取消固定' : '固定'}
                  onClick={() => onPin(message.id)}
                >
                  <Pin
                    size={15}
                    style={{
                      fill: message.pinnedAt ? 'currentColor' : 'none',
                      color: message.pinnedAt ? 'var(--accent-text)' : undefined,
                    }}
                  />
                </ActionButton>
              )}
              {isMine && onEdit && (
                <ActionButton
                  title="编辑"
                  onClick={() => {
                    setDraft(message.body)
                    setEditing(true)
                  }}
                >
                  <Pencil size={15} />
                </ActionButton>
              )}
              {onDelete && (
                <ActionButton title="删除" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={15} />
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function formatEventTime(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const str = s.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (endsAt) {
    const e = new Date(endsAt)
    return `${str} – ${e.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  return str
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}
