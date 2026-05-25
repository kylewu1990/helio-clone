import { useCallback, useEffect, useRef, useState } from 'react'
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
} from './lib/types'
import { Rail, type MainView } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { ChannelView } from './components/ChannelView'
import { ThreadPanel } from './components/ThreadPanel'
import { CreateAssistantModal } from './components/CreateAssistantModal'
import { InboxView } from './components/InboxView'
import { TasksView } from './components/TasksView'
import { TerminalView } from './components/TerminalView'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { ExecutionCockpit } from './components/workspace/ExecutionCockpit'
import { PendingInputModal } from './components/workspace/PendingInputModal'
import { ChannelSettingsModal } from './components/ChannelSettingsModal'
import { MessageSquareText } from 'lucide-react'
import type {
  InboxResponse,
  Task,
  MissionRow,
  ReviewRow,
  DeliveryRow,
  AuditEventRow,
  TaskRunRow,
  ApprovalRow,
  Capability,
  SandboxRunListRow,
  IsolationInfo,
} from './lib/types'

type Theme = 'light' | 'dark'

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light'
}

export function App() {
  const [userId, setUid] = useState<string | null>(getUserId())
  const [me, setMe] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChannelDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [theme, setTheme] = useState<Theme>(readTheme())
  const [thread, setThread] = useState<Thread | null>(null)
  const [threadParentId, setThreadParentId] = useState<string | null>(null)
  const [typing, setTyping] = useState<Record<string, number>>({})
  const [statuses, setStatuses] = useState<
    Record<string, { status: string; ts: number }>
  >({})
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [showCreateAssistant, setShowCreateAssistant] = useState(false)
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(
    null,
  )
  const [view, setView] = useState<MainView>('workspace')
  const [inbox, setInbox] = useState<InboxResponse>({ items: [], unread: 0 })
  const [tasks, setTasks] = useState<Task[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([])
  const [taskRuns, setTaskRuns] = useState<TaskRunRow[]>([])
  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [sandboxRuns, setSandboxRuns] = useState<SandboxRunListRow[]>([])
  const [isolation, setIsolation] = useState<IsolationInfo | null>(null)
  const [autoExecute, setAutoExecute] = useState<boolean>(
    () => localStorage.getItem('helio:auto-execute') === '1', // 指派后自动执行(本地设置,默认关)
  )
  const [locateId, setLocateId] = useState<string | null>(null)
  const [reportTaskId, setReportTaskId] = useState<string | null>(null) // Execution Cockpit
  const [pendingInput, setPendingInput] = useState<{ taskId: string; prompt: string } | null>(null) // 待补信息
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false) // 窄屏:侧栏抽屉开关

  // 首次:确保有身份(无登录,默认选 kyle / 第一个用户)
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

  const refreshInbox = useCallback(async () => {
    setInbox(await api.inbox())
  }, [])

  const refreshTasks = useCallback(async () => {
    setTasks(await api.tasks())
  }, [])

  // 工作台真实数据(Mission / Review / Delivery / AuditEvent / 执行运行时 / 审批 / 沙盒运行)
  const refreshWorkspace = useCallback(async () => {
    const [m, r, d, a, runs, aps, sb] = await Promise.all([
      api.missions(),
      api.reviews(),
      api.deliveries(),
      api.auditEvents({ limit: 50 }),
      api.taskRuns(),
      api.approvals(),
      api.sandboxRuns(20),
    ])
    setMissions(m)
    setReviews(r)
    setDeliveries(d)
    setAuditEvents(a)
    setTaskRuns(runs)
    setApprovals(aps)
    setSandboxRuns(sb.runs)
    setIsolation(sb.isolation)
  }, [])

  const refreshSandbox = useCallback(async () => {
    const sb = await api.sandboxRuns(20)
    setSandboxRuns(sb.runs)
    setIsolation(sb.isolation)
  }, [])

  // 能力矩阵(静态,加载一次)
  const refreshCapabilities = useCallback(async () => {
    setCapabilities(await api.capabilities())
  }, [])

  // 执行任务(指派给 AI 后手动开始)。
  // 缺信息(如查天气缺城市)→ 提示补填后再次执行;能力不足/无可用助手 → 弹出后端的真实原因。
  const executeTask = useCallback(
    async (id: string, input?: string) => {
      try {
        const res = await api.executeTask(id, input)
        // 缺信息:用 Pending User Action UI 收集后再执行(替代浏览器 prompt)
        if (res && 'prompt' in res) {
          setPendingInput({ taskId: id, prompt: res.prompt })
          return
        }
        // 成功开始执行:打开 Execution Cockpit 实时观察
        setReportTaskId(id)
      } catch (e) {
        const raw = (e as Error).message || '执行失败'
        let msg = raw
        try {
          msg = JSON.parse(raw.replace(/^\d+\s+/, '')).error ?? raw
        } catch {
          /* 用原始信息 */
        }
        window.alert(msg)
      } finally {
        await Promise.all([refreshTasks(), refreshWorkspace()])
      }
    },
    [refreshTasks, refreshWorkspace],
  )

  const openReport = useCallback((id: string) => setReportTaskId(id), [])

  const cancelTask = useCallback(
    async (id: string) => {
      await api.cancelTask(id).catch(() => {})
      await Promise.all([refreshTasks(), refreshWorkspace()])
    },
    [refreshTasks, refreshWorkspace],
  )

  const toggleAutoExecute = useCallback((v: boolean) => {
    setAutoExecute(v)
    localStorage.setItem('helio:auto-execute', v ? '1' : '0')
  }, [])

  // 工作台指派:把任务指派给某 AI;若开启「指派后自动执行」则立即开始执行。
  const assignTaskUI = useCallback(
    async (taskId: string, assistantId: string) => {
      await api.updateTask(taskId, { assigneeId: assistantId })
      await Promise.all([refreshTasks(), refreshWorkspace()])
      if (autoExecute) await executeTask(taskId)
    },
    [refreshTasks, refreshWorkspace, autoExecute, executeTask],
  )

  // 自动选择执行人:后端按意图+技能推荐,推荐到则指派(并可自动执行);无可用助手则提示真实原因。
  const autoAssign = useCallback(
    async (taskId: string) => {
      try {
        const r = await api.suggestAssignee(taskId)
        if (r.assistantId) await assignTaskUI(taskId, r.assistantId)
        else window.alert(r.reason || '没有可推荐的 AI 助手')
      } catch (e) {
        window.alert((e as Error).message || '推荐失败')
      }
    },
    [assignTaskUI],
  )

  // 继续执行:在同一沙盒接着做(触工具上限/失败后续跑;复用原执行人,跳过补信息门)。
  const continueRun = useCallback(
    async (taskRunId: string) => {
      try {
        await api.continueRun(taskRunId)
      } catch (e) {
        const raw = (e as Error).message || '继续执行失败'
        let msg = raw
        try {
          msg = JSON.parse(raw.replace(/^\d+\s+/, '')).error ?? raw
        } catch {
          /* 用原始信息 */
        }
        window.alert(msg)
      } finally {
        await Promise.all([refreshTasks(), refreshWorkspace()])
      }
    },
    [refreshTasks, refreshWorkspace],
  )

  // 高危能力人工审批(批准后端会自动续跑)
  const decideApproval = useCallback(
    async (id: string, status: 'approved' | 'rejected') => {
      await api.decideApproval(id, status)
      await Promise.all([refreshTasks(), refreshWorkspace()])
    },
    [refreshTasks, refreshWorkspace],
  )

  const parseErr = (e: unknown) => {
    const raw = (e as Error).message || ''
    try {
      return JSON.parse(raw.replace(/^\d+\s+/, '')).error ?? raw
    } catch {
      return raw
    }
  }

  // Mission Composer:创建 Mission,并可选地让 AI 真实拆解为子任务。返回新 mission id。
  const composeMission = useCallback(
    async (goal: string, breakdown: boolean): Promise<string | null> => {
      try {
        const m = await api.createMission({ goal })
        if (breakdown) {
          try {
            await api.breakdownMission(m.id)
          } catch (e) {
            window.alert('AI 拆解失败:' + parseErr(e))
          }
        }
        return m.id
      } catch (e) {
        window.alert('创建 Mission 失败:' + parseErr(e))
        return null
      } finally {
        await Promise.all([refreshTasks(), refreshWorkspace()])
      }
    },
    [refreshTasks, refreshWorkspace],
  )

  // 对已有 Mission 触发 AI 拆解
  const breakdownMission = useCallback(
    async (missionId: string) => {
      try {
        await api.breakdownMission(missionId)
      } catch (e) {
        window.alert('AI 拆解失败:' + parseErr(e))
      } finally {
        await Promise.all([refreshTasks(), refreshWorkspace()])
      }
    },
    [refreshTasks, refreshWorkspace],
  )

  const submitReview = useCallback(
    async (data: {
      taskId?: string
      missionId?: string
      verdict: 'pass' | 'needs_fix' | 'blocked'
      checks?: { label: string; ok: boolean }[]
      notes?: string
    }) => {
      await api.createReview(data)
      refreshWorkspace()
    },
    [refreshWorkspace],
  )

  const createDelivery = useCallback(
    async (data: {
      missionId?: string
      taskId?: string
      title: string
      summary?: string
    }) => {
      await api.createDelivery(data)
      refreshWorkspace()
    },
    [refreshWorkspace],
  )

  const decideDelivery = useCallback(
    async (id: string, status: 'approved' | 'rejected') => {
      await api.decideDelivery(id, status)
      refreshWorkspace()
    },
    [refreshWorkspace],
  )

  const addMissionTask = useCallback(
    async (missionId: string, title: string) => {
      await api.createTask(title, { missionId })
      await Promise.all([refreshTasks(), refreshWorkspace()])
    },
    [refreshTasks, refreshWorkspace],
  )

  const createTask = useCallback(
    async (title: string) => {
      await api.createTask(title)
      refreshTasks()
    },
    [refreshTasks],
  )

  const moveTask = useCallback(
    async (id: string, status: string) => {
      await api.updateTask(id, { status })
      refreshTasks()
    },
    [refreshTasks],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      await api.deleteTask(id)
      refreshTasks()
    },
    [refreshTasks],
  )

  const assignTask = useCallback(
    async (id: string, assigneeId: string | null) => {
      await api.updateTask(id, { assigneeId })
      refreshTasks()
    },
    [refreshTasks],
  )

  // 导航到某频道(任何视图都会切回聊天);可带 messageId 定位
  const selectChannel = useCallback((id: string, messageId?: string) => {
    setView('channel')
    setSelectedId(id)
    setLocateId(messageId ?? null)
    setSidebarOpen(false) // 选完关闭窄屏抽屉
  }, [])

  const pinMessage = useCallback(async (id: string) => {
    await api.pinMessage(id) // 效果由 WS message-updated / channel-updated 同步
  }, [])

  const openView = useCallback(
    (v: MainView) => {
      setView(v)
      setSidebarOpen(false)
      if (v === 'inbox') {
        // 进收件箱即标记已读
        api.inboxRead().then(refreshInbox)
      }
    },
    [refreshInbox],
  )

  // 身份就绪后加载 me + 频道 + 助手
  useEffect(() => {
    if (!userId) return
    api.me().then(setMe)
    refreshAssistants()
    refreshInbox()
    refreshTasks()
    refreshWorkspace()
    refreshCapabilities()
    refreshChannels().then((list) => {
      setSelectedId(
        (cur) => cur ?? list.find((c) => !c.isDM)?.id ?? list[0]?.id ?? null,
      )
    })
  }, [
    userId,
    refreshChannels,
    refreshAssistants,
    refreshInbox,
    refreshTasks,
    refreshWorkspace,
    refreshCapabilities,
  ])

  // 选中频道:载入详情 + 消息,标记已读,清空话题串/输入态
  useEffect(() => {
    if (!selectedId) return
    let alive = true
    setThread(null)
    setThreadParentId(null)
    setTyping({})
    setStatuses({})
    Promise.all([api.channel(selectedId), api.messages(selectedId)]).then(
      ([d, msgs]) => {
        if (!alive) return
        setDetail(d)
        setMessages(msgs)
        const last = msgs[msgs.length - 1]
        if (last) {
          api.markRead(selectedId, last.id)
          setChannels((cs) =>
            cs.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c)),
          )
        }
      },
    )
    return () => {
      alive = false
    }
  }, [selectedId])

  // 输入态/工作状态过期清理
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
        const cutoff = Date.now() - 20000 // 兜底:正常由后端发空状态主动清除
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

  const applyReactions = useCallback(
    (messageId: string, reactions: ReactionGroup[]) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      )
      setThread((prev) =>
        prev
          ? {
              parent:
                prev.parent.id === messageId
                  ? { ...prev.parent, reactions }
                  : prev.parent,
              replies: prev.replies.map((r) =>
                r.id === messageId ? { ...r, reactions } : r,
              ),
            }
          : prev,
      )
    },
    [],
  )

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
    const add = (m: Message) =>
      m.id === messageId ? { ...m, body: m.body + chunk } : m
    setMessages((prev) => prev.map(add))
    setThread((prev) =>
      prev
        ? { parent: add(prev.parent), replies: prev.replies.map(add) }
        : prev,
    )
  }, [])

  // WS 事件(plain function:每次渲染都拿到最新闭包)
  const onEvent = (e: WsEvent) => {
    if (e.type === 'presence') {
      setOnline(new Set(e.online))
    } else if (e.type === 'message') {
      if (e.channelId === selectedId) {
        setMessages((prev) =>
          prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message],
        )
        api.markRead(e.channelId, e.message.id)
        refreshChannels().then((list) =>
          setChannels(
            list.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c)),
          ),
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
                replyParticipants: m.replyParticipants.some(
                  (p) => p.id === e.message.author.id,
                )
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
    } else if (e.type === 'inbox') {
      refreshInbox()
    } else if (e.type === 'tasks') {
      refreshTasks()
      refreshWorkspace()
    } else if (e.type === 'workspace') {
      refreshWorkspace()
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
            prev.map((m) =>
              m.id === e.parentId
                ? { ...m, replyCount: Math.max(0, m.replyCount - 1) }
                : m,
            ),
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
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      )
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
    await api.deleteMessage(id) // 硬删,效果由 WS message-deleted 同步
  }, [])

  const bulkDeleteMessages = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    await api.bulkDeleteMessages(ids) // 效果由 WS messages-deleted 同步
  }, [])

  const deleteChannel = useCallback(
    async (id: string) => {
      const wasSelected = id === selectedId
      await api.deleteChannel(id)
      const list = await refreshChannels()
      if (wasSelected) {
        setThread(null)
        setThreadParentId(null)
        const next = list.find((c) => !c.isDM)?.id ?? null
        if (next) selectChannel(next)
        else {
          setSelectedId(null)
          setDetail(null)
          setMessages([])
        }
      }
    },
    [selectedId, refreshChannels, selectChannel],
  )

  const deleteEvent = useCallback(async (id: string) => {
    await api.deleteEvent(id) // 效果由 WS event-deleted 同步
  }, [])

  const stopGeneration = useCallback(() => {
    if (selectedId) api.stopChannel(selectedId).catch(() => {}) // 硬刹车:停当前频道所有 AI 生成
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
      await api.send(selectedId, body, threadParentId) // 效果由 WS thread-reply 统一处理
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

  const switchIdentity = useCallback((id: string) => {
    setUserId(id)
    setUid(id)
    setMe(null)
    setDetail(null)
    setMessages([])
    setSelectedId(null)
    setThread(null)
    setThreadParentId(null)
  }, [])

  const createChannel = useCallback(
    async (name: string) => {
      const { id } = await api.createChannel(name)
      await refreshChannels()
      selectChannel(id)
    },
    [refreshChannels, selectChannel],
  )

  const openDM = useCallback(
    async (uid: string) => {
      const { id } = await api.openDM(uid)
      await refreshChannels()
      selectChannel(id)
    },
    [refreshChannels, selectChannel],
  )

  const createAssistant = useCallback(
    async (data: {
      name: string
      systemPrompt?: string
      provider?: string
      baseUrl?: string
      apiKey?: string
      model?: string
      skills?: string[]
      channelIds?: string[]
      avatarColor?: number
      autoRespond?: boolean
      memory?: string
    }) => {
      const a = await api.createAssistant(data)
      setUsers(await api.users()) // 让助手进入 users(用于头像/输入中名称)
      await refreshAssistants()
      const { id } = await api.openDM(a.id)
      await refreshChannels()
      selectChannel(id)
    },
    [refreshAssistants, refreshChannels, selectChannel],
  )

  const deleteAssistant = useCallback(
    async (id: string) => {
      const wasViewing = detail?.isDM && detail.peer?.id === id
      await api.deleteAssistant(id)
      const [list] = await Promise.all([refreshChannels(), refreshAssistants()])
      setUsers(await api.users())
      if (wasViewing) setSelectedId(list.find((c) => !c.isDM)?.id ?? null)
    },
    [detail, refreshChannels, refreshAssistants],
  )

  const updateAssistant = useCallback(
    async (
      id: string,
      data: {
        name?: string
        systemPrompt?: string
        provider?: string
        baseUrl?: string
        apiKey?: string
        model?: string
        skills?: string[]
        channelIds?: string[]
        avatarColor?: number
        autoRespond?: boolean
        memory?: string
      },
    ) => {
      await api.updateAssistant(id, data)
      setUsers(await api.users())
      await refreshAssistants()
      // 若正在看该助手的私信,刷新详情以反映改名/换色
      if (detail?.isDM && detail.peer?.id === id && selectedId) {
        setDetail(await api.channel(selectedId))
      }
    },
    [detail, selectedId, refreshAssistants],
  )

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('helio.theme', next)
      return next
    })
  }, [])

  if (!me) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
        正在进入工作区…
      </div>
    )
  }

  const typingNames = Object.keys(typing)
    .filter((id) => id !== me.id)
    .map((id) => users.find((u) => u.id === id)?.name)
    .filter((n): n is string => !!n)

  const activity = Object.entries(statuses)
    .filter(([id]) => id !== me.id)
    .map(([id, s]) => {
      const name = users.find((u) => u.id === id)?.name
      return name ? `${name} ${s.status}` : null
    })
    .filter((x): x is string => !!x)

  return (
    <div className="flex h-full" style={{ background: 'var(--app-bg)' }}>
      <Rail
        me={me}
        users={users.filter((u) => !u.isAssistant)}
        theme={theme}
        view={view}
        inboxUnread={inbox.unread}
        onView={openView}
        onToggleTheme={toggleTheme}
        onSwitchIdentity={switchIdentity}
      />
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        me={me}
        users={users}
        channels={channels}
        assistants={assistants}
        online={online}
        selectedId={view === 'channel' ? selectedId : null}
        onSelect={selectChannel}
        onCreateChannel={createChannel}
        onOpenDM={openDM}
        onCreateAssistant={() => {
          setEditingAssistant(null)
          setShowCreateAssistant(true)
        }}
        onEditAssistant={(a) => {
          setEditingAssistant(a)
          setShowCreateAssistant(true)
        }}
        onDeleteAssistant={deleteAssistant}
        onDeleteChannel={deleteChannel}
      />
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--canvas)]">
        {view === 'workspace' ? (
          <WorkspaceView
            assistants={assistants}
            tasks={tasks}
            statuses={statuses}
            users={users}
            missions={missions}
            reviews={reviews}
            deliveries={deliveries}
            auditEvents={auditEvents}
            taskRuns={taskRuns}
            approvals={approvals}
            capabilities={capabilities}
            sandboxRuns={sandboxRuns}
            isolation={isolation}
            autoExecute={autoExecute}
            onToggleAutoExecute={toggleAutoExecute}
            onAssignTask={assignTaskUI}
            onAutoAssign={autoAssign}
            onContinueRun={continueRun}
            onRefreshSandbox={refreshSandbox}
            onComposeMission={composeMission}
            onBreakdownMission={breakdownMission}
            onSubmitReview={submitReview}
            onCreateDelivery={createDelivery}
            onDecideDelivery={decideDelivery}
            onAddMissionTask={addMissionTask}
            onExecuteTask={executeTask}
            onCancelTask={cancelTask}
            onDecideApproval={decideApproval}
            onOpenChannel={selectChannel}
            onOpenReport={openReport}
            onOpenMissions={() => openView('tasks')}
            onMenuClick={() => setSidebarOpen(true)}
          />
        ) : view === 'inbox' ? (
          <InboxView
            onMenuClick={() => setSidebarOpen(true)}
            items={inbox.items}
            onOpen={(channelId, messageId) => selectChannel(channelId, messageId)}
            onMarkRead={() => api.inboxRead().then(refreshInbox)}
          />
        ) : view === 'tasks' ? (
          <TasksView
            onMenuClick={() => setSidebarOpen(true)}
            tasks={tasks}
            members={users}
            taskRuns={taskRuns}
            onCreate={createTask}
            onMove={moveTask}
            onDelete={deleteTask}
            onAssign={assignTask}
            onExecute={executeTask}
            onCancel={cancelTask}
            onOpenReport={openReport}
          />
        ) : view === 'terminal' ? (
          <TerminalView
            onMenuClick={() => setSidebarOpen(true)}
            userId={userId ?? ''}
          />
        ) : detail ? (
          <ChannelView
            onMenuClick={() => setSidebarOpen(true)}
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
      {reportTaskId && (
        <ExecutionCockpit
          taskId={reportTaskId}
          users={users}
          isolation={isolation}
          onClose={() => setReportTaskId(null)}
          onOpenChannel={(channelId) => {
            setReportTaskId(null)
            selectChannel(channelId)
          }}
          onGenerateDelivery={createDelivery}
          onContinue={continueRun}
          onCancel={cancelTask}
          onDecideApproval={decideApproval}
        />
      )}
      {pendingInput && (
        <PendingInputModal
          prompt={pendingInput.prompt}
          onCancel={() => setPendingInput(null)}
          onSubmit={(value) => {
            const { taskId } = pendingInput
            setPendingInput(null)
            executeTask(taskId, value)
          }}
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
      {showCreateAssistant && (
        <CreateAssistantModal
          key={editingAssistant?.id ?? 'new'}
          editing={editingAssistant}
          onClose={() => {
            setShowCreateAssistant(false)
            setEditingAssistant(null)
          }}
          onSubmit={
            editingAssistant
              ? (data) => updateAssistant(editingAssistant.id, data)
              : createAssistant
          }
        />
      )}
    </div>
  )
}
