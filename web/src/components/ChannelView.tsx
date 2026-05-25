import { useEffect, useRef, useState } from 'react'
import { CheckSquare, ChevronDown, Hash, Menu, Pin, Settings2, Square, Trash2, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageRow } from './MessageRow'
import { dayKey, formatDayDivider } from '../lib/format'
import type { ChannelDetail, Message, User } from '../lib/types'

export function ChannelView({
  onMenuClick,
  me,
  detail,
  messages,
  online,
  typingNames,
  activity,
  locateId,
  draftKey,
  onSend,
  onReact,
  onOpenThread,
  onEdit,
  onDelete,
  onBulkDelete,
  onDeleteEvent,
  onPin,
  onTyping,
  onOpenSettings,
  onStop,
}: {
  onMenuClick: () => void
  me: User
  detail: ChannelDetail
  messages: Message[]
  online: Set<string>
  typingNames: string[]
  activity: string[]
  locateId: string | null
  draftKey: string
  onSend: (body: string) => void
  onReact: (messageId: string, emoji: string) => void
  onOpenThread: (messageId: string) => void
  onEdit: (messageId: string, body: string) => void
  onDelete: (messageId: string) => void
  onBulkDelete: (ids: string[]) => void
  onDeleteEvent: (eventId: string) => void
  onPin: (messageId: string) => void
  onTyping: () => void
  onOpenSettings: () => void
  onStop: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showPins, setShowPins] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmBulk(false)
  }
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // 切换频道时重置多选
  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmBulk(false)
  }, [detail.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
    // 末条消息内容长度也作依赖:流式逐字输出(只改 body 不改条数)时也跟随滚动到底
  }, [messages.length, messages[messages.length - 1]?.body, detail.id])

  const scrollToMessage = (id: string) => {
    const el = scrollRef.current?.querySelector(
      `[data-mid="${id}"]`,
    ) as HTMLElement | null
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const orig = el.style.background
    el.style.transition = 'background 0.4s'
    el.style.background = 'var(--accent-soft)'
    setTimeout(() => {
      el.style.background = orig
    }, 1600)
    return true
  }

  // 从搜索/收件箱跳转:重试直到该消息渲染出来
  useEffect(() => {
    if (!locateId) return
    let tries = 0
    const tick = () => {
      if (scrollToMessage(locateId)) return
      if (tries++ < 8) setTimeout(tick, 150)
    }
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateId, detail.id])

  const mentionNames = detail.members.flatMap((m) => [m.name, m.handle])

  const subtitle = detail.isDM
    ? detail.peer?.isAssistant
      ? 'AI 助手 · 随时待命'
      : detail.peer && online.has(detail.peer.id)
        ? '在线'
        : '离线'
    : detail.topic || `${detail.members.length} 位成员`

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
        {detail.isDM && detail.peer ? (
          <Avatar
            user={detail.peer}
            size={26}
            showPresence
            online={online.has(detail.peer.id)}
          />
        ) : (
          <Hash size={18} className="text-[var(--text-tertiary)]" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {detail.name}
          </div>
        </div>
        <div className="ml-1 truncate border-l border-[var(--border)] pl-3 text-xs text-[var(--text-tertiary)]">
          {detail.isPrivate && '🔒 '}
          {detail.archived && '(已归档) '}
          {subtitle}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            title={selectMode ? '退出多选' : '多选删除消息'}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            style={{ color: selectMode ? 'var(--accent-text)' : 'var(--text-secondary)' }}
          >
            <CheckSquare size={16} />
          </button>
          {!detail.isDM && (
            <button
              onClick={onOpenSettings}
              title="频道设置"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            >
              <Settings2 size={16} />
            </button>
          )}
        </div>
      </header>

      {selectMode && (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--chrome-frame)] px-5 py-2 text-sm">
          <span className="text-[var(--text-secondary)]">
            已选 {selected.size} 条
          </span>
          <button
            onClick={() => setSelected(new Set(messages.map((m) => m.id)))}
            className="text-[var(--accent-text)]"
          >
            全选
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[var(--text-tertiary)]"
          >
            清空
          </button>
          <div className="ml-auto flex items-center gap-2">
            {confirmBulk ? (
              <>
                <span className="text-[var(--text-secondary)]">
                  删除选中的 {selected.size} 条?不可恢复
                </span>
                <button
                  onClick={() => {
                    onBulkDelete([...selected])
                    exitSelect()
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-white"
                  style={{ background: 'var(--destructive)' }}
                >
                  确认删除
                </button>
                <button
                  onClick={() => setConfirmBulk(false)}
                  className="text-[var(--text-tertiary)]"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => selected.size && setConfirmBulk(true)}
                  disabled={!selected.size}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium disabled:opacity-40"
                  style={{ color: 'var(--destructive)' }}
                >
                  <Trash2 size={14} /> 删除
                </button>
                <button
                  onClick={exitSelect}
                  title="退出多选"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {detail.pinned.length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--chrome-frame)]">
          <button
            onClick={() => setShowPins((v) => !v)}
            className="flex w-full items-center gap-1.5 px-5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            <Pin size={12} style={{ color: 'var(--accent-text)' }} />
            {detail.pinned.length} 条固定消息
            <ChevronDown
              size={13}
              style={{ transform: showPins ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {showPins && (
            <div className="max-h-48 overflow-y-auto px-3 pb-2">
              {detail.pinned.map((p) => (
                <button
                  key={p.id}
                  onClick={() => scrollToMessage(p.id)}
                  className="flex w-full gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--hover)]"
                >
                  <span className="font-medium text-[var(--text-secondary)]">
                    {p.author.name}
                  </span>
                  <span className="truncate text-[var(--text-tertiary)]">
                    {p.body}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <ChannelIntro detail={detail} />
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
          const grouped =
            !newDay &&
            prev &&
            prev.authorId === m.authorId &&
            new Date(m.createdAt).getTime() -
              new Date(prev.createdAt).getTime() <
              5 * 60_000
          return (
            <div key={m.id}>
              {newDay && <DayDivider iso={m.createdAt} />}
              <MessageRow
                message={m}
                grouped={!!grouped}
                me={me}
                onReact={onReact}
                onOpenThread={onOpenThread}
                onEdit={onEdit}
                onDelete={onDelete}
                onDeleteEvent={onDeleteEvent}
                onPin={onPin}
                selectMode={selectMode}
                selected={selected.has(m.id)}
                onToggleSelect={toggleSelect}
                mentionNames={mentionNames}
              />
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <ActivityBar activity={activity} typingNames={typingNames} onStop={onStop} />

      <Composer
        key={draftKey}
        placeholder={`发消息到 ${detail.isDM ? detail.name : '#' + detail.name}`}
        draftKey={draftKey}
        onSend={onSend}
        onTyping={onTyping}
        mentionables={detail.members}
      />
    </>
  )
}

function ActivityBar({
  activity,
  typingNames,
  onStop,
}: {
  activity: string[]
  typingNames: string[]
  onStop: () => void
}) {
  const aiBusy = activity.length > 0
  const lines = [...activity]
  if (typingNames.length) {
    lines.push(
      typingNames.length === 1
        ? `${typingNames[0]} 正在输入…`
        : `${typingNames.slice(0, 2).join('、')}${
            typingNames.length > 2 ? ' 等' : ''
          } 正在输入…`,
    )
  }
  if (lines.length === 0) return <div className="h-5" />
  return (
    <div className="flex min-h-5 items-center gap-2 px-6 py-0.5 text-xs">
      <span className="flex gap-0.5 text-[var(--accent-text)]">
        <Dot d={0} />
        <Dot d={150} />
        <Dot d={300} />
      </span>
      <span className="truncate text-[var(--text-tertiary)]">
        {lines.join(' · ')}
      </span>
      {aiBusy && (
        <button
          onClick={onStop}
          title="停止所有 AI 生成"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          <Square size={9} style={{ fill: 'currentColor' }} /> 停止
        </button>
      )}
    </div>
  )
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="inline-block h-1 w-1 animate-pulse rounded-full"
      style={{ background: 'currentColor', animationDelay: `${d}ms` }}
    />
  )
}

function ChannelIntro({ detail }: { detail: ChannelDetail }) {
  if (detail.isDM) {
    if (!detail.peer) return null
    return (
      <div className="mb-4 flex flex-col items-start gap-2 pb-2">
        <Avatar user={detail.peer} size={48} />
        <div className="text-lg font-semibold text-[var(--text-primary)]">
          {detail.peer.name}
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          这是你和 {detail.peer.name} 的私信开端。
        </p>
      </div>
    )
  }
  return (
    <div className="mb-4 pb-2">
      <div className="mb-1 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <Hash size={18} />
        </div>
        <span className="text-lg font-semibold text-[var(--text-primary)]">
          {detail.name}
        </span>
      </div>
      <p className="text-sm text-[var(--text-tertiary)]">
        这是 #{detail.name} 频道的开端。{detail.topic}
      </p>
    </div>
  )
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-xs font-medium text-[var(--text-tertiary)]">
        {formatDayDivider(iso)}
      </span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  )
}
