import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckSquare,
  ChevronDown,
  Hash,
  Menu,
  PanelRight,
  Pin,
  Settings2,
  Square,
  Trash2,
  X,
  Columns2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelRightClose,
  Loader2,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageRow } from './MessageRow'
import { AssistantWorkspace } from './workspace/AssistantWorkspace'
import { ProjectHeaderCardV4 as ProjectHeaderCard } from './ProjectHeaderCardV4'
import { api } from '../lib/api'
import { dayKey, formatDayDivider } from '../lib/format'
import type { Assistant, ChannelDetail, Message, User, PendingInputRow, RunEvent } from '../lib/types'

const DOCK_FRAC_KEY = 'heliox:dock-frac'
const DOCK_MIN_PX = 320 // dock 最小宽
const CHAT_MIN_PX = 360 // 聊天最小宽

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
  users,
  assistants,
  wsRefreshKey,
  runEvents,
  focusRunId,
  focusTab,
  onOpenReport,
  onContinueRun,
  onDecideDelivery,
  onOpenPendingInput,
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
  users: User[]
  assistants: Assistant[]
  wsRefreshKey: number
  runEvents?: Record<string, RunEvent[]>
  focusRunId?: string | null
  focusTab?: string | null
  onOpenReport: (taskId: string) => void
  onContinueRun: (runId: string) => void
  onDecideDelivery: (id: string, status: 'approved' | 'rejected') => void
  onOpenPendingInput?: (pi: PendingInputRow) => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showPins, setShowPins] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  // Chat 工作区 dock:桌面下与 AI 助手私信默认展开;移动端默认收起(全屏抽屉不抢聊天)
  const [dockOpen, setDockOpen] = useState(false)
  // Channel-First:卡片按钮(进度卡「查看完整过程」/ 交付卡「在交付中心查看」)临时聚焦的 dock tab
  const [dockTab, setDockTab] = useState<string | null>(null)
  useEffect(() => {
    const desktop = typeof window !== 'undefined' && window.innerWidth >= 768
    setDockOpen(desktop && !!(detail.isDM && detail.peer?.isAssistant))
  }, [detail.id, detail.isDM, detail.peer?.isAssistant])

  // Resizable Workspace Split:dock 占容器宽度的比例(本地持久化)+ 全屏预览 + 拖拽
  const containerRef = useRef<HTMLDivElement>(null)
  const [dockFrac, setDockFrac] = useState<number>(() => {
    const v = Number(localStorage.getItem(DOCK_FRAC_KEY))
    return Number.isFinite(v) && v >= 0.2 && v <= 0.8 ? v : 0.42
  })
  const [fullscreen, setFullscreen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const draggingRef = useRef(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    localStorage.setItem(DOCK_FRAC_KEY, String(dockFrac))
  }, [dockFrac])
  // 深链聚焦某面板/运行 → 自动展开 dock
  useEffect(() => {
    if (focusRunId || focusTab) setDockOpen(true)
  }, [focusRunId, focusTab])

  // 拖拽改宽:按容器右边界到指针的距离算 dock 宽,夹紧后转比例存档
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

  const dockWidth = fullscreen ? '100%' : `${Math.round(dockFrac * 100)}%`

  // v3 G1:project 频道 → 拉一份轻量 tasks 用于 ProjectHeaderCard 完成率统计
  //   只在 kind=project 时 fetch,刷新依赖 wsRefreshKey
  const [projTasks, setProjTasks] = useState<import('../lib/types').Task[]>([])
  useEffect(() => {
    if (detail.kind !== 'project') {
      setProjTasks([])
      return
    }
    api
      .channelWorkspace(detail.id)
      .then((ws) => setProjTasks(ws.tasks ?? []))
      .catch(() => setProjTasks([]))
  }, [detail.id, detail.kind, wsRefreshKey])

  // v3 G3:拉本频道所有有 L2 Memory 的 AI id 集合 — MessageRow 用它在 AI 头像旁加 Brain 角标
  const [memorizedAgents, setMemorizedAgents] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    api
      .channelMemories(detail.id)
      .then((r) => {
        const set = new Set<string>()
        for (const a of r.agents) if (a.l2) set.add(a.agent.id)
        setMemorizedAgents(set)
      })
      .catch(() => setMemorizedAgents(new Set()))
  }, [detail.id, wsRefreshKey])

  // Live Run:本频道最近一次执行的运行事件(左侧轻量过程卡)
  const channelRun = useMemo(() => {
    const all = Object.values(runEvents ?? {}).flat().filter((e) => e.channelId === detail.id)
    if (!all.length) return null
    all.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    const lastRunId = all[all.length - 1].runId
    return { runId: lastRunId, events: all.filter((e) => e.runId === lastRunId) }
  }, [runEvents, detail.id])

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
    <div ref={containerRef} className="flex h-full min-h-0 flex-1">
      <div className={`min-w-0 flex-1 flex-col ${dockOpen && fullscreen && !isMobile ? 'hidden' : 'flex'}`}>
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
          {/* D5 设计深钻:dock 关闭时也能感知 AI 在工作 —— header 右侧 AI 执行中胶囊。
              只依赖真实 channelRun(events.length>0),终态/无运行则不显示;点击 → 展开 dock 并切到 runs。 */}
          {channelRun && channelRun.events.length > 0 && (() => {
            const last = channelRun.events[channelRun.events.length - 1]
            const isRunning = last.status === 'running'
            const color = isRunning ? 'var(--agent-working)' : 'var(--info)'
            return (
              <button
                onClick={() => {
                  setDockTab('runs')
                  setDockOpen(true)
                }}
                title="查看 AI 完整执行过程"
                className="mr-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{
                  color,
                  background: `color-mix(in oklch, ${color} 12%, transparent)`,
                }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'agent-pulse-ring' : ''}`}
                  style={{ background: color }}
                />
                {isRunning ? 'AI 执行中' : 'AI 刚完成'}
              </button>
            )
          })()}
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
          <button
            onClick={() => setDockOpen((v) => !v)}
            title={dockOpen ? '收起工作区' : '展开工作区(产物 / 运行 / 交付)'}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)]"
            style={{ color: dockOpen ? 'var(--accent-text)' : 'var(--text-secondary)' }}
          >
            <PanelRight size={16} />
          </button>
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

      {/* v3 G1:project 频道 → 顶部挂项目卡(目标 + 阶段进度条 + 完成率 + owner) */}
      {detail.kind === 'project' && (
        <ProjectHeaderCard detail={detail} tasks={projTasks} users={users} me={me} />
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
                onOpenCockpit={() => {
                  setDockTab('runs')
                  setDockOpen(true)
                }}
                onOpenDelivery={() => {
                  setDockTab('delivery')
                  setDockOpen(true)
                }}
                // D11:Delivery Card 内嵌接受/拒绝,直接调用 ChannelView 已有的 onDecideDelivery
                onDecideDelivery={onDecideDelivery}
                // v3 G3:该消息作者(AI)在本频道有 L2 记忆 → MessageRow 头像旁加 Brain 角标
                hasMemory={memorizedAgents.has(m.authorId)}
              />
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Live Run:左侧轻量过程卡(执行中显示当前阶段 + 最近动作),点开看完整过程。
          只依赖真实 runEvents(channelRun),不再受 activity.length 影响(P1.3)。 */}
      {channelRun && channelRun.events.length > 0 && (
        <RunStatusCard
          events={channelRun.events}
          onOpen={() => {
            setDockTab('runs')
            setDockOpen(true)
          }}
        />
      )}

      <ActivityBar activity={activity} typingNames={typingNames} onStop={onStop} />

      <Composer
        key={draftKey}
        placeholder={`发消息到 ${detail.isDM ? detail.name : '#' + detail.name}`}
        draftKey={draftKey}
        onSend={onSend}
        onTyping={onTyping}
        mentionables={detail.members}
      />
      </div>

      {/* 拖拽手柄(桌面、非全屏) */}
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

      {/* Dock:桌面/平板为可调宽分栏;移动端为全屏抽屉 */}
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
              onOpenReport={onOpenReport}
              onContinueRun={onContinueRun}
              onDecideDelivery={onDecideDelivery}
              onOpenPendingInput={onOpenPendingInput}
            />
          </div>
        ) : (
          <div
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
                  onPreset={(f) => {
                    setFullscreen(false)
                    setDockFrac(f)
                  }}
                  onToggleFullscreen={() => setFullscreen((v) => !v)}
                />
              }
              onClose={() => setDockOpen(false)}
              onOpenReport={onOpenReport}
              onContinueRun={onContinueRun}
              onDecideDelivery={onDecideDelivery}
              onOpenPendingInput={onOpenPendingInput}
            />
          </div>
        ))}
    </div>
  )
}

// 工作区分栏控件:预设比例(聊天为主 / 均分 / 预览为主)+ 全屏预览。
function SplitControls({
  fullscreen,
  onPreset,
  onToggleFullscreen,
}: {
  fullscreen: boolean
  onPreset: (dockFrac: number) => void
  onToggleFullscreen: () => void
}) {
  return (
    <div className="hidden shrink-0 items-center gap-0.5 lg:flex">
      <SplitBtn title="聊天为主 70 / 30" onClick={() => onPreset(0.3)}>
        <PanelLeftClose size={14} />
      </SplitBtn>
      <SplitBtn title="均分 50 / 50" onClick={() => onPreset(0.5)}>
        <Columns2 size={14} />
      </SplitBtn>
      <SplitBtn title="预览为主 30 / 70" onClick={() => onPreset(0.68)}>
        <PanelRightClose size={14} />
      </SplitBtn>
      <SplitBtn title={fullscreen ? '退出全屏预览' : '全屏预览'} onClick={onToggleFullscreen} active={fullscreen}>
        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </SplitBtn>
    </div>
  )
}

function SplitBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)]"
      style={{ color: active ? 'var(--accent-text)' : 'var(--text-tertiary)', background: active ? 'var(--accent-soft)' : 'transparent' }}
    >
      {children}
    </button>
  )
}

// 左侧聊天的轻量运行过程卡:执行中显示当前阶段 + 最近 2 步动作,点开看完整过程。
function RunStatusCard({ events, onOpen }: { events: RunEvent[]; onOpen: () => void }) {
  if (!events.length) return null
  const last = events[events.length - 1]
  const recent = events.slice(-3)
  const running = last.status === 'running'
  return (
    <button
      onClick={onOpen}
      className="mx-4 mb-1 flex items-start gap-2.5 rounded-[var(--radius-lg)] border px-3 py-2 text-left transition-colors hover:bg-[var(--hover)]"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 28%, var(--border))', background: 'var(--accent-soft)' }}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--accent-text)]">
        {running ? <Loader2 size={13} className="animate-spin" /> : <Columns2 size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{last.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {recent.map((e) => (
            <span key={e.id} className="truncate text-[10.5px] text-[var(--text-tertiary)]">
              {e.tool ?? e.kind} · {e.status === 'error' ? '失败' : e.status === 'running' ? '进行中' : '完成'}
            </span>
          ))}
        </div>
      </div>
      <span className="shrink-0 self-center text-[10.5px] font-medium text-[var(--accent-text)]">查看过程</span>
    </button>
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
