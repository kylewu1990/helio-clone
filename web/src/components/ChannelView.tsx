import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare, ChevronDown, Hash, PanelRight, Pin, Settings2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageRow } from './MessageRow'
import { AssistantWorkspace } from './workspace/AssistantWorkspace'
import { ProjectHeaderCardV4 } from './ProjectHeaderCardV4'
import {
  ActivityBar,
  ChannelIntro,
  DayDivider,
  IconBtn,
  RunStatusCard,
  SelectModeBar,
  SplitControls,
} from './ChannelView.parts'
import { api } from '../lib/api'
import { dayKey } from '../lib/format'
import type { Assistant, ChannelDetail, Message, User, RunEvent, Task } from '../lib/types'

const DOCK_FRAC_KEY = 'heliox:dock-frac'
const DOCK_MIN_PX = 320
const CHAT_MIN_PX = 360

export function ChannelView({
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
  users,
  assistants,
  wsRefreshKey,
  runEvents,
  focusRunId,
  focusTab,
  onDecideDelivery,
}: {
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
  users: User[]
  assistants: Assistant[]
  wsRefreshKey: number
  runEvents?: Record<string, RunEvent[]>
  focusRunId?: string | null
  focusTab?: string | null
  onDecideDelivery: (id: string, status: 'approved' | 'rejected') => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showPins, setShowPins] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [dockOpen, setDockOpen] = useState(false)
  const [dockTab, setDockTab] = useState<string | null>(null)
  const [dockFrac, setDockFrac] = useState<number>(() => {
    const v = Number(localStorage.getItem(DOCK_FRAC_KEY))
    return Number.isFinite(v) && v >= 0.2 && v <= 0.8 ? v : 0.42
  })
  const [fullscreen, setFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const draggingRef = useRef(false)
  const [projTasks, setProjTasks] = useState<Task[]>([])
  const [memorizedAgents, setMemorizedAgents] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const desktop = typeof window !== 'undefined' && window.innerWidth >= 768
    // J:project 频道默认就把 dock 打开,让 Preview tab 直接可见(截图 03)
    setDockOpen(
      desktop &&
        (!!(detail.isDM && detail.peer?.isAssistant) || detail.kind === 'project'),
    )
  }, [detail.id, detail.isDM, detail.peer?.isAssistant, detail.kind])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    localStorage.setItem(DOCK_FRAC_KEY, String(dockFrac))
  }, [dockFrac])

  useEffect(() => {
    if (focusRunId || focusTab) setDockOpen(true)
  }, [focusRunId, focusTab])

  useEffect(() => {
    if (!dockOpen || fullscreen || isMobile) return
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      let dockW = rect.right - e.clientX
      dockW = Math.max(DOCK_MIN_PX, Math.min(rect.width - CHAT_MIN_PX, dockW))
      setDockFrac(dockW / rect.width)
    }
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dockOpen, fullscreen, isMobile])

  useEffect(() => {
    if (detail.kind !== 'project') {
      setProjTasks([])
      return
    }
    api.channelWorkspace(detail.id).then((ws) => setProjTasks(ws.tasks ?? [])).catch(() => setProjTasks([]))
  }, [detail.id, detail.kind, wsRefreshKey])

  useEffect(() => {
    api.channelMemories(detail.id)
      .then((r) => {
        const set = new Set<string>()
        for (const a of r.agents) if (a.l2) set.add(a.agent.id)
        setMemorizedAgents(set)
      })
      .catch(() => setMemorizedAgents(new Set()))
  }, [detail.id, wsRefreshKey])

  const channelRun = useMemo(() => {
    const all = Object.values(runEvents ?? {}).flat().filter((e) => e.channelId === detail.id)
    if (!all.length) return null
    all.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    const lastRunId = all[all.length - 1].runId
    return { runId: lastRunId, events: all.filter((e) => e.runId === lastRunId) }
  }, [runEvents, detail.id])

  useEffect(() => {
    setSelectMode(false)
    setSelected(new Set())
    setConfirmBulk(false)
  }, [detail.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, messages[messages.length - 1]?.body, detail.id])

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

  const scrollToMessage = (id: string) => {
    const el = scrollRef.current?.querySelector(`[data-mid="${id}"]`) as HTMLElement | null
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const orig = el.style.background
    el.style.transition = 'background 0.4s'
    el.style.background = 'var(--accent-soft)'
    setTimeout(() => { el.style.background = orig }, 1600)
    return true
  }

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
  const dockWidth = fullscreen ? '100%' : `${Math.round(dockFrac * 100)}%`
  const subtitle = detail.isDM
    ? detail.peer?.isAssistant
      ? 'AI 助手 · 随时待命'
      : detail.peer && online.has(detail.peer.id) ? '在线' : '离线'
    : detail.topic || `${detail.members.length} 位成员`

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-1">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={`min-w-0 flex-1 flex-col ${dockOpen && fullscreen && !isMobile ? 'hidden' : 'flex'}`}
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-5">
          {detail.isDM && detail.peer ? (
            <Avatar user={detail.peer} size={26} showPresence online={online.has(detail.peer.id)} />
          ) : (
            <Hash size={18} className="text-[var(--text-tertiary)]" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{detail.name}</div>
          </div>
          <div className="ml-1 truncate border-l border-[var(--border)] pl-3 text-xs text-[var(--text-tertiary)]">
            {detail.isPrivate && '🔒 '}
            {detail.archived && '(已归档) '}
            {subtitle}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {channelRun && channelRun.events.length > 0 && (() => {
              const last = channelRun.events[channelRun.events.length - 1]
              const isRunning = last.status === 'running'
              const color = isRunning ? 'var(--agent-working)' : 'var(--info)'
              return (
                <button
                  onClick={() => { setDockTab('runs'); setDockOpen(true) }}
                  title="查看 AI 完整执行过程"
                  className="mr-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                  style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)` }}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'agent-pulse-ring' : ''}`} style={{ background: color }} />
                  {isRunning ? 'AI 执行中' : 'AI 刚完成'}
                </button>
              )
            })()}
            <IconBtn onClick={() => (selectMode ? exitSelect() : setSelectMode(true))} title={selectMode ? '退出多选' : '多选删除消息'} active={selectMode}>
              <CheckSquare size={16} />
            </IconBtn>
            {!detail.isDM && (
              <IconBtn onClick={onOpenSettings} title="频道设置">
                <Settings2 size={16} />
              </IconBtn>
            )}
            <IconBtn onClick={() => setDockOpen((v) => !v)} title={dockOpen ? '收起工作区' : '展开工作区'} active={dockOpen}>
              <PanelRight size={16} />
            </IconBtn>
          </div>
        </header>

        {selectMode && (
          <SelectModeBar
            count={selected.size}
            confirm={confirmBulk}
            onAll={() => setSelected(new Set(messages.map((m) => m.id)))}
            onClear={() => setSelected(new Set())}
            onConfirm={() => setConfirmBulk(true)}
            onCommit={() => { onBulkDelete([...selected]); exitSelect() }}
            onCancel={() => setConfirmBulk(false)}
            onExit={exitSelect}
          />
        )}

        {detail.pinned.length > 0 && (
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--chrome-frame)]">
            <button
              onClick={() => setShowPins((v) => !v)}
              className="flex w-full items-center gap-1.5 px-5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
            >
              <Pin size={12} style={{ color: 'var(--accent-text)' }} />
              {detail.pinned.length} 条固定消息
              <ChevronDown size={13} style={{ transform: showPins ? 'rotate(180deg)' : 'none' }} />
            </button>
            {showPins && (
              <div className="max-h-48 overflow-y-auto px-3 pb-2">
                {detail.pinned.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => scrollToMessage(p.id)}
                    className="flex w-full gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--hover)]"
                  >
                    <span className="font-medium text-[var(--text-secondary)]">{p.author.name}</span>
                    <span className="truncate text-[var(--text-tertiary)]">{p.body}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {detail.kind === 'project' && (
          <ProjectHeaderCardV4 detail={detail} tasks={projTasks} users={users} me={me} />
        )}

        <div ref={scrollRef} className="constellation-bg flex-1 overflow-y-auto px-5 py-4">
          <ChannelIntro detail={detail} />
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
            const grouped =
              !newDay &&
              prev &&
              prev.authorId === m.authorId &&
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
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
                  onOpenCockpit={() => { setDockTab('runs'); setDockOpen(true) }}
                  onOpenDelivery={() => { setDockTab('delivery'); setDockOpen(true) }}
                  onDecideDelivery={onDecideDelivery}
                  hasMemory={memorizedAgents.has(m.authorId)}
                />
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {channelRun && channelRun.events.length > 0 && (
          <RunStatusCard
            events={channelRun.events}
            onOpen={() => { setDockTab('runs'); setDockOpen(true) }}
          />
        )}

        <ActivityBar activity={activity} typingNames={typingNames} onStop={onStop} />

        <div
          className={detail.kind === 'project' ? 'project-composer-glow' : undefined}
        >
          <Composer
            key={draftKey}
            placeholder={
              detail.kind === 'project'
                ? `执行中...可输入下一条指令,会按顺序排队执行`
                : `发消息到 ${detail.isDM ? detail.name : '#' + detail.name}`
            }
            draftKey={draftKey}
            onSend={onSend}
            onTyping={onTyping}
            mentionables={detail.members}
          />
        </div>
      </motion.div>

      {dockOpen && !fullscreen && !isMobile && (
        <div
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            draggingRef.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          onDoubleClick={() => setDockFrac(0.42)}
          title="拖拽调整工作区宽度 · 双击复位"
          className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-[var(--border)] transition-colors hover:bg-[var(--accent)]"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
          <span className="h-8 w-0.5 rounded-full bg-[var(--border-strong)] transition-colors group-hover:bg-white" />
        </div>
      )}

      {dockOpen &&
        (isMobile ? (
          <div className="fixed inset-0 z-40 flex flex-col bg-[var(--surface-1)]">
            <AssistantWorkspace
              channelId={detail.id}
              channelName={detail.name}
              peer={detail.peer}
              assistants={assistants}
              users={users}
              refreshKey={wsRefreshKey}
              runEvents={runEvents}
              focusRunId={focusRunId}
              focusTab={(dockTab ?? focusTab) as never}
              onClose={() => setDockOpen(false)}
              onOpenReport={() => {}}
              onContinueRun={() => {}}
              onDecideDelivery={onDecideDelivery}
              onSendInstruction={onSend}
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex h-full min-w-0 shrink-0 flex-col border-l border-[var(--border)]"
            style={{ width: dockWidth }}
          >
            <AssistantWorkspace
              channelId={detail.id}
              channelName={detail.name}
              peer={detail.peer}
              assistants={assistants}
              users={users}
              refreshKey={wsRefreshKey}
              runEvents={runEvents}
              focusRunId={focusRunId}
              focusTab={(dockTab ?? focusTab) as never}
              splitControls={
                <SplitControls
                  fullscreen={fullscreen}
                  onPreset={(f) => { setFullscreen(false); setDockFrac(f) }}
                  onToggleFullscreen={() => setFullscreen((v) => !v)}
                />
              }
              onClose={() => setDockOpen(false)}
              onOpenReport={() => {}}
              onContinueRun={() => {}}
              onDecideDelivery={onDecideDelivery}
              onSendInstruction={onSend}
            />
          </motion.div>
        ))}
    </div>
  )
}

