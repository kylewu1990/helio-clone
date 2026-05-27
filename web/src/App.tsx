import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './lib/api'
import { getUserId, setUserId } from './lib/identity'
import { useWebSocket } from './lib/ws'
import type {
  Assistant,
  ChannelDetail,
  ChannelSummary,
  Message,
  ReactionGroup,
  Thread,
  User,
  WsEvent,
  RunEvent,
} from './lib/types'
import { SidebarV4, type SidebarSection, type SidebarNavTarget } from './components/SidebarV4'
import { TopBar } from './components/TopBar'
import { PluginsView } from './components/views/PluginsView'
import { IntegrationsView } from './components/views/IntegrationsView'
import { HomeViewV4 } from './components/views/HomeViewV4'
import { CompanyOverview } from './components/views/CompanyOverview'
import { AgentProfileView } from './components/views/AgentProfileView'
import { ArchivedView } from './components/views/ArchivedView'
import { OnboardingView } from './components/views/OnboardingView'
import { NewProjectModal } from './components/NewProjectModal'
import { CommandPalette, useCommandPalette } from './components/ui/command-palette'
import { toast } from 'sonner'
import { ChannelView } from './components/ChannelView'
import { ThreadPanel } from './components/ThreadPanel'
import { SettingsModal } from './components/workspace/SettingsModal'
import { ChannelSettingsModal } from './components/ChannelSettingsModal'
import { ChannelPicker } from './components/ChannelPicker'
import { PptStudioModal } from './components/PptStudioModal'
import type { HomeTemplateCard } from './lib/templates'
import { MessageSquareText } from 'lucide-react'

type MainView = 'home' | 'overview' | 'channel' | 'plugins' | 'integrations' | 'archived' | 'guide' | 'agent'

export function App() {
  const [userId, setUid] = useState<string | null>(getUserId())
  const [me, setMe] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChannelDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [thread, setThread] = useState<Thread | null>(null)
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [typing, setTyping] = useState<Record<string, number>>({})
  const [statuses, setStatuses] = useState<Record<string, { status: string; ts: number }>>({})
  const [view, setView] = useState<MainView>('home')
  const [sidebarSection, setSidebarSection] = useState<SidebarSection | null>('home')
  const [agentProfileId, setAgentProfileId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  // J/N1:模板派工 channel picker
  const [pendingTemplate, setPendingTemplate] = useState<HomeTemplateCard | null>(null)
  // L4:PPT Studio modal — PPT 模板走零 LLM 直生成路径
  const [showPptStudio, setShowPptStudio] = useState(false)
  const palette = useCommandPalette()
  const [locateId, setLocateId] = useState<string | null>(null)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [wsTick, setWsTick] = useState(0)
  const [runEvents, setRunEvents] = useState<Record<string, RunEvent[]>>({})
  const [chatFocus, setChatFocus] = useState<{ runId?: string; tab?: string; key: number } | null>(null)

  useEffect(() => {
    api.users().then((all) => {
      setUsers(all)
      if (!getUserId() && all.length) {
        const def = all.find((u) => u.handle === 'kyle') ?? all[0]
        setUserId(def.id)
        setUid(def.id)
      }
    })
  }, [])

  const refreshChannels = useCallback(async () => {
    const list = await api.channels()
    setChannels(list)
    return list
  }, [])

  const refreshAssistants = useCallback(async () => {
    const list = await api.assistants()
    setAssistants(list)
    return list
  }, [])

  const selectChannel = useCallback((id: string, messageId?: string) => {
    setView('channel')
    setSelectedId(id)
    setLocateId(messageId ?? null)
    setChatFocus(null)
  }, [])

  const pinMessage = useCallback(async (id: string) => {
    await api.pinMessage(id)
  }, [])

  useEffect(() => {
    if (!userId) return
    api.me().then(setMe)
    refreshAssistants()
    refreshChannels().then((list) => {
      setSelectedId((cur) => cur ?? list.find((c) => !c.isDM)?.id ?? list[0]?.id ?? null)
    })
  }, [userId, refreshChannels, refreshAssistants])

  useEffect(() => {
    if (!selectedId) return
    let alive = true
    setThread(null)
    setThreadParentId(null)
    setTyping({})
    setStatuses({})
    Promise.all([api.channel(selectedId), api.messages(selectedId)]).then(([d, msgs]) => {
      if (!alive) return
      setDetail(d)
      setMessages(msgs)
      const last = msgs[msgs.length - 1]
      if (last) {
        api.markRead(selectedId, last.id)
        setChannels((cs) => cs.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c)))
      }
    })
    return () => {
      alive = false
    }
  }, [selectedId])

  // typing / status 过期清理
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((cur) => {
        const cutoff = Date.now() - 3000
        const next: Record<string, number> = {}
        let changed = false
        for (const [k, v] of Object.entries(cur)) {
          if (v >= cutoff) next[k] = v
          else changed = true
        }
        return changed ? next : cur
      })
      setStatuses((cur) => {
        const cutoff = Date.now() - 20000
        const next: Record<string, { status: string; ts: number }> = {}
        let changed = false
        for (const [k, v] of Object.entries(cur)) {
          if (v.ts >= cutoff) next[k] = v
          else changed = true
        }
        return changed ? next : cur
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const applyReactions = useCallback((messageId: string, reactions: ReactionGroup[]) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
    setThread((prev) =>
      prev
        ? {
            parent: prev.parent.id === messageId ? { ...prev.parent, reactions } : prev.parent,
            replies: prev.replies.map((r) => (r.id === messageId ? { ...r, reactions } : r)),
          }
        : prev,
    )
  }, [])

  const applyUpdatedMessage = useCallback((m: Message) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
    setThread((prev) =>
      prev
        ? {
            parent: prev.parent.id === m.id ? m : prev.parent,
            replies: prev.replies.map((r) => (r.id === m.id ? m : r)),
          }
        : prev,
    )
  }, [])

  const appendChunk = useCallback((messageId: string, chunk: string) => {
    const add = (m: Message) => (m.id === messageId ? { ...m, body: m.body + chunk } : m)
    setMessages((prev) => prev.map(add))
    setThread((prev) => (prev ? { parent: add(prev.parent), replies: prev.replies.map(add) } : prev))
  }, [])

  const onEvent = (e: WsEvent) => {
    if (e.type === 'presence') {
      setOnline(new Set(e.online))
    } else if (e.type === 'message') {
      if (e.channelId === selectedId) {
        setMessages((prev) => (prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]))
        api.markRead(e.channelId, e.message.id)
        refreshChannels().then((list) =>
          setChannels(list.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c))),
        )
      } else {
        refreshChannels()
      }
    } else if (e.type === 'message-updated') {
      if (e.channelId === selectedId) applyUpdatedMessage(e.message)
    } else if (e.type === 'message-chunk') {
      if (e.channelId === selectedId) appendChunk(e.messageId, e.chunk)
    } else if (e.type === 'reaction') {
      applyReactions(e.messageId, e.reactions)
    } else if (e.type === 'thread-reply') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === e.parentId
            ? {
                ...m,
                replyCount: m.replyCount + 1,
                lastReplyAt: e.message.createdAt,
                replyParticipants: m.replyParticipants.some((p) => p.id === e.message.author.id)
                  ? m.replyParticipants
                  : [...m.replyParticipants, e.message.author].slice(0, 3),
              }
            : m,
        ),
      )
      setThread((prev) =>
        prev && prev.parent.id === e.parentId
          ? {
              ...prev,
              replies: prev.replies.some((r) => r.id === e.message.id)
                ? prev.replies
                : [...prev.replies, e.message],
            }
          : prev,
      )
    } else if (e.type === 'typing') {
      if (e.channelId === selectedId && e.userId !== me?.id) {
        setTyping((c) => ({ ...c, [e.userId]: Date.now() }))
      }
    } else if (e.type === 'assistant-status') {
      if (e.channelId === selectedId) {
        setStatuses((c) => {
          if (!e.status) {
            const next = { ...c }
            delete next[e.userId]
            return next
          }
          return { ...c, [e.userId]: { status: e.status, ts: Date.now() } }
        })
      }
    } else if (e.type === 'run-event') {
      setRunEvents((prev) => {
        const cur = prev[e.runId] ?? []
        if (cur.some((x) => x.id === e.event.id)) return prev
        return { ...prev, [e.runId]: [...cur, e.event] }
      })
    } else if (e.type === 'tasks' || e.type === 'workspace') {
      setWsTick((t) => t + 1)
    } else if (e.type === 'memory-updated') {
      if (e.channelId === selectedId) setWsTick((t) => t + 1)
    } else if (e.type === 'channel-created') {
      refreshChannels()
    } else if (e.type === 'channel-updated') {
      if (e.channelId === selectedId) api.channel(e.channelId).then(setDetail)
      refreshChannels()
    } else if (e.type === 'message-deleted') {
      if (e.channelId === selectedId) {
        setMessages((prev) => prev.filter((m) => m.id !== e.id))
        if (e.parentId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === e.parentId ? { ...m, replyCount: Math.max(0, m.replyCount - 1) } : m)),
          )
          setThread((prev) =>
            prev && prev.parent.id === e.parentId
              ? { ...prev, replies: prev.replies.filter((r) => r.id !== e.id) }
              : prev,
          )
        }
      }
      setThread((prev) => (prev && prev.parent.id === e.id ? null : prev))
      refreshChannels()
    } else if (e.type === 'messages-deleted') {
      if (e.channelId === selectedId) {
        const del = new Set(e.ids)
        setMessages((prev) => prev.filter((m) => !del.has(m.id)))
        setThread((prev) => (prev && del.has(prev.parent.id) ? null : prev))
      }
      refreshChannels()
    } else if (e.type === 'channel-deleted') {
      if (e.id === selectedId) {
        setSelectedId(null)
        setDetail(null)
        setMessages([])
        setThread(null)
        setThreadParentId(null)
      }
      refreshChannels()
    } else if (e.type === 'event-deleted') {
      if (e.channelId === selectedId) {
        const del = new Set(e.cardIds)
        setMessages((prev) => prev.filter((m) => !del.has(m.id)))
        setThread((prev) => (prev && del.has(prev.parent.id) ? null : prev))
      }
      refreshChannels()
    }
  }

  const { send: wsSend } = useWebSocket(userId, onEvent)

  const sendMessage = useCallback(
    async (body: string) => {
      if (!selectedId) return
      const msg = await api.send(selectedId, body)
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    },
    [selectedId],
  )

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const { reactions } = await api.react(messageId, emoji)
      applyReactions(messageId, reactions)
    },
    [applyReactions],
  )

  const editMessage = useCallback(
    async (id: string, body: string) => {
      const m = await api.editMessage(id, body)
      applyUpdatedMessage(m)
    },
    [applyUpdatedMessage],
  )

  const deleteMessage = useCallback(async (id: string) => {
    await api.deleteMessage(id)
  }, [])

  const bulkDeleteMessages = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    await api.bulkDeleteMessages(ids)
  }, [])

  const deleteEvent = useCallback(async (id: string) => {
    await api.deleteEvent(id)
  }, [])

  const stopGeneration = useCallback(() => {
    if (selectedId) api.stopChannel(selectedId).catch(() => {})
  }, [selectedId])

  const openThread = useCallback(async (messageId: string) => {
    setThreadParentId(messageId)
    const t = await api.thread(messageId)
    setThread(t)
  }, [])

  const closeThread = useCallback(() => {
    setThread(null)
    setThreadParentId(null)
  }, [])

  const sendThreadReply = useCallback(
    async (body: string) => {
      if (!selectedId || !threadParentId) return
      await api.send(selectedId, body, threadParentId)
    },
    [selectedId, threadParentId],
  )

  const lastTypingSent = useRef(0)
  const onTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSent.current > 2000 && selectedId) {
      lastTypingSent.current = now
      wsSend({ type: 'typing', channelId: selectedId })
    }
  }, [selectedId, wsSend])

  const decideDelivery = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    await api.decideDelivery(id, status)
    setWsTick((t) => t + 1)
  }, [])

  const onSidebarNavigate = (target: SidebarNavTarget) => {
    if (target.kind === 'channel') {
      setSidebarSection(null)
      setView('channel')
      selectChannel(target.channelId)
      return
    }
    if (target.kind === 'agent') {
      setAgentProfileId(target.agentId)
      setView('agent')
      setSidebarSection(null)
      return
    }
    const sec = target.section
    // M3:ppt-studio 不是 view,而是触发 modal — 不改 sidebarSection 让用户看到当前 view 仍在
    if (sec === 'ppt-studio') {
      const projects = channels.filter((c) => !c.archived && !c.isDM && (c.kind === 'project' || c.kind == null))
      if (projects.length === 0) { toast.error('还没有项目频道,先在 sidebar 创建一个'); return }
      setShowPptStudio(true)
      return
    }
    setSidebarSection(sec)
    if (sec === 'home') setView('home')
    else if (sec === 'overview') setView('overview')
    else if (sec === 'projects') setView('home')
    else if (sec === 'archived') setView('archived')
    else if (sec === 'guide') setView('guide')
    else if (sec === 'plugins-installed' || sec === 'plugins-sources') setView('plugins')
    else if (sec === 'integrations-mcp' || sec === 'integrations-connectors' || sec === 'integrations-anywhere')
      setView('integrations')
    else if (sec === 'settings') setShowSettings(true)
  }

  const paletteItems = useMemo(() => {
    const items: Array<{ id: string; label: string; hint?: string; group?: string; onSelect: () => void }> = []
    channels
      .filter((c) => !c.archived)
      .forEach((c) =>
        items.push({
          id: `ch:${c.id}`,
          label: `# ${c.name || '未命名'}`,
          hint: c.phase ?? undefined,
          group: '项目频道',
          onSelect: () => onSidebarNavigate({ kind: 'channel', channelId: c.id }),
        }),
      )
    assistants.forEach((a) =>
      items.push({
        id: `ag:${a.id}`,
        label: a.name,
        hint: 'Agent profile',
        group: 'AI 助手',
        onSelect: () => {
          setAgentProfileId(a.id)
          setView('agent')
          setSidebarSection(null)
        },
      }),
    )
    items.push(
      { id: 'go:home', label: '主页', group: '导航', onSelect: () => onSidebarNavigate({ kind: 'section', section: 'home' }) },
      { id: 'go:overview', label: '公司全景', group: '导航', onSelect: () => onSidebarNavigate({ kind: 'section', section: 'overview' }) },
      { id: 'go:plugins', label: '插件', group: '导航', onSelect: () => onSidebarNavigate({ kind: 'section', section: 'plugins-installed' }) },
      { id: 'go:integrations', label: '集成', group: '导航', onSelect: () => onSidebarNavigate({ kind: 'section', section: 'integrations-mcp' }) },
    )
    return items
  }, [channels, assistants])

  const typingNames = me
    ? Object.keys(typing)
        .filter((id) => id !== me.id)
        .map((id) => users.find((u) => u.id === id)?.name)
        .filter((n): n is string => !!n)
    : []

  const activity = me
    ? Object.entries(statuses)
        .filter(([id]) => id !== me.id)
        .map(([id, s]) => {
          const name = users.find((u) => u.id === id)?.name
          return name ? `${name} ${s.status}` : null
        })
        .filter((x): x is string => !!x)
    : []

  if (!me) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
        正在进入工作区…
      </div>
    )
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <SidebarV4
        me={me}
        channels={channels}
        assistants={assistants}
        online={online}
        selectedSection={sidebarSection}
        selectedChannelId={view === 'channel' ? selectedId : null}
        onNavigate={(t) => {
          if (t.kind === 'agent') {
            setAgentProfileId(t.agentId)
            setView('agent')
            setSidebarSection(null)
            return
          }
          onSidebarNavigate(t)
        }}
        onCreateProject={() => setShowNewProject(true)}
      />
      <NewProjectModal
        open={showNewProject}
        onOpenChange={setShowNewProject}
        me={me}
        users={users}
        assistants={assistants}
        onSubmit={async (data) => {
          const ch = await api.createChannel({
            name: data.name,
            kind: 'project',
            goal: data.goal,
            scope: data.scope,
            phase: data.phase,
            ownerId: data.ownerId,
          })
          for (const uid of data.memberIds) {
            try { await api.addMember(ch.id, uid) } catch { /* AI 可能已被自动加入 */ }
          }
          await refreshChannels()
          setView('channel')
          setSidebarSection(null)
          selectChannel(ch.id)
          toast.success(`项目频道 #${data.name} 已创建`)
        }}
      />
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} items={paletteItems} />
      <PptStudioModal
        open={showPptStudio}
        channels={channels}
        onClose={() => setShowPptStudio(false)}
        onDone={(res) => {
          setShowPptStudio(false)
          if (res.channelId) {
            setView('channel')
            setSidebarSection(null)
            selectChannel(res.channelId)
            setChatFocus({ tab: 'deliveries', key: Date.now() })
          } else {
            // 没选频道:打开 .pptx 下载页(新标签)
            try { window.open(res.pptxUrl, '_blank', 'noreferrer') } catch { /* noop */ }
          }
        }}
      />
      <ChannelPicker
        open={!!pendingTemplate}
        channels={channels}
        templateTitle={pendingTemplate?.title ?? ''}
        onClose={() => setPendingTemplate(null)}
        onPick={async (channelId) => {
          const tpl = pendingTemplate
          setPendingTemplate(null)
          if (!tpl) return
          setView('channel')
          setSidebarSection(null)
          selectChannel(channelId)
          setChatFocus({ tab: 'preview', key: Date.now() })
          try {
            await api.send(channelId, tpl.prefilledPrompt)
            const ch = channels.find((c) => c.id === channelId)
            toast.success(`已派工到 #${ch?.name ?? channelId}(模板:${tpl.title})`)
          } catch (e) {
            toast.error('派工失败:' + (e as Error).message)
          }
        }}
      />
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--canvas)]">
        <TopBar
          me={me}
          contextLabel={
            view === 'channel' && detail
              ? `#${detail.name}`
              : view === 'overview'
                ? '公司全景'
                : view === 'plugins'
                  ? '插件'
                  : view === 'integrations'
                    ? '集成'
                    : view === 'archived'
                      ? '归档'
                      : view === 'agent'
                        ? 'Agent'
                        : '主页'
          }
          onSearch={() => palette.setOpen(true)}
          onCreateProject={() => setShowNewProject(true)}
        />
        {view === 'home' ? (
          <HomeViewV4
            me={me}
            channels={channels}
            assistants={assistants}
            onPickProject={(channelId) => { setView('channel'); setSidebarSection(null); selectChannel(channelId) }}
            onSubmitMission={(text) => {
              const projects = channels.filter((c) => !c.archived && (c.kind === 'project' || c.kind == null))
              if (projects.length === 0) { toast.error('还没有项目频道,先在 sidebar 创建一个'); return }
              const target = projects[0]
              setView('channel'); setSidebarSection(null); selectChannel(target.id)
              setChatFocus({ tab: 'preview', key: Date.now() })
              localStorage.setItem(`draft:${target.id}`, text)
              toast.success(`已带入 #${target.name}。发送即派工。`)
            }}
            onUseTemplate={(t) => {
              const projects = channels.filter((c) => !c.archived && !c.isDM && (c.kind === 'project' || c.kind == null))
              if (projects.length === 0) { toast.error('还没有项目频道,先在 sidebar 创建一个'); return }
              // L4:PPT 模板走零 LLM 直生成路径(PptStudioModal),其他模板仍走 ChannelPicker → @AI 派工
              if (t.id === 'ppt') {
                setShowPptStudio(true)
                return
              }
              setPendingTemplate(t)
            }}
            onOpenOverview={() => { setView('overview'); setSidebarSection('overview') }}
            onOpenSettings={() => setShowSettings(true)}
            onCreateProject={() => setShowNewProject(true)}
          />
        ) : view === 'plugins' ? (
          <PluginsView initialTab={sidebarSection === 'plugins-sources' ? 'sources' : 'installed'} />
        ) : view === 'integrations' ? (
          <IntegrationsView
            initialTab={
              sidebarSection === 'integrations-connectors'
                ? 'connectors'
                : sidebarSection === 'integrations-anywhere'
                  ? 'anywhere'
                  : 'mcp'
            }
          />
        ) : view === 'overview' ? (
          <CompanyOverview onOpenChannel={(channelId) => { setView('channel'); setSidebarSection(null); selectChannel(channelId) }} />
        ) : view === 'archived' ? (
          <ArchivedView
            channels={channels}
            onRefreshChannels={refreshChannels}
            onOpenChannel={(channelId) => { setView('channel'); setSidebarSection(null); selectChannel(channelId) }}
          />
        ) : view === 'guide' ? (
          <OnboardingView
            onFinish={() => { setView('home'); setSidebarSection('home') }}
          />
        ) : view === 'agent' && agentProfileId ? (
          <AgentProfileView
            agentId={agentProfileId}
            onBack={() => { setView('home'); setSidebarSection('home') }}
            onJumpChannel={(channelId) => { setView('channel'); setSidebarSection(null); selectChannel(channelId) }}
          />
        ) : detail ? (
          <ChannelView
            me={me}
            detail={detail}
            messages={messages}
            online={online}
            typingNames={typingNames}
            activity={activity}
            locateId={locateId}
            draftKey={`draft:${detail.id}`}
            onSend={sendMessage}
            onReact={toggleReaction}
            onOpenThread={openThread}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onBulkDelete={bulkDeleteMessages}
            onDeleteEvent={deleteEvent}
            onPin={pinMessage}
            onTyping={onTyping}
            onOpenSettings={() => setShowChannelSettings(true)}
            onStop={stopGeneration}
            users={users}
            assistants={assistants}
            wsRefreshKey={wsTick}
            runEvents={runEvents}
            focusRunId={chatFocus?.runId ?? null}
            focusTab={chatFocus?.tab ?? null}
            onDecideDelivery={decideDelivery}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
            <MessageSquareText size={40} strokeWidth={1.5} />
            <p>选择一个频道或私信开始</p>
          </div>
        )}
      </section>
      {view === 'channel' && thread && (
        <ThreadPanel
          thread={thread}
          me={me}
          mentionables={detail?.members ?? []}
          onClose={closeThread}
          onReact={toggleReaction}
          onSendReply={sendThreadReply}
          onEdit={editMessage}
          onDelete={deleteMessage}
        />
      )}
      {showSettings && (
        <SettingsModal
          assistants={assistants}
          onClose={() => setShowSettings(false)}
          onSaved={() => { /* settings 持久化在后端 */ }}
        />
      )}
      {showChannelSettings && detail && view === 'channel' && (
        <ChannelSettingsModal
          detail={detail}
          users={users}
          onClose={() => setShowChannelSettings(false)}
          onChanged={() => {
            api.channel(detail.id).then(setDetail)
            refreshChannels()
          }}
        />
      )}
    </div>
  )
}
