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
} from './lib/types'
import { type MainView as LegacyMainView } from './components/Rail'
import { SidebarV4, type SidebarSection, type SidebarNavTarget } from './components/SidebarV4'
import { PluginsView } from './components/views/PluginsView'
import { IntegrationsView } from './components/views/IntegrationsView'
import { HomeViewV4 } from './components/views/HomeViewV4'
import { CompanyOverview } from './components/views/CompanyOverview'
import { AgentProfileView } from './components/views/AgentProfileView'
import { NewProjectModal } from './components/NewProjectModal'
import { CommandPalette, useCommandPalette } from './components/ui/command-palette'
import { toast } from 'sonner'
// v4:Sidebar 已被 SidebarV4 取代,旧组件保留到 Phase F 一起清理
import { ChannelView } from './components/ChannelView'
import { ThreadPanel } from './components/ThreadPanel'
import { CreateAssistantModal } from './components/CreateAssistantModal'
import { InboxView } from './components/InboxView'
import { TasksView } from './components/TasksView'
import { TerminalView } from './components/TerminalView'
import { MissionWorkspace } from './components/workspace/MissionWorkspace'
import { MissionComposer } from './components/workspace/MissionComposer'
import { PendingActionDrawer } from './components/workspace/PendingActionDrawer'
import { SafetyDrawer } from './components/workspace/SafetyDrawer'
import { ExecutionCockpit } from './components/workspace/ExecutionCockpit'
import { PendingInputModal, type PendingInputData } from './components/workspace/PendingInputModal'
import { SettingsModal } from './components/workspace/SettingsModal'
import { TemplatePreview } from './components/workspace/TemplatePreview'
import { ChannelSettingsModal } from './components/ChannelSettingsModal'
import { MessageSquareText } from 'lucide-react'
import {
  mapCapabilityApprovals,
  computeApprovals,
  mapDeliveries,
} from './lib/workspace'
import type {
  InboxResponse,
  Task,
  MissionRow,
  DeliveryRow,
  AuditEventRow,
  TaskRunRow,
  ApprovalRow,
  ApprovalItem,
  Capability,
  SandboxRunListRow,
  IsolationInfo,
  WorkflowStep,
  AppSettings,
  TemplateResolved,
  PendingInputRow,
  RunEvent,
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
  const [_theme] = useState<Theme>(readTheme())
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
  // v4:MainView 扩展(saved 旧值兼容);新页面通过 sidebarSection 联动切换
  type MainView = LegacyMainView | 'overview' | 'plugins' | 'integrations' | 'archived' | 'guide' | 'agent'
  const [view, setView] = useState<MainView>('home')
  const [sidebarSection, setSidebarSection] = useState<SidebarSection | null>('home')
  const [agentProfileId, setAgentProfileId] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const palette = useCommandPalette()
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const [showSafety, setShowSafety] = useState(false)
  const [inbox, setInbox] = useState<InboxResponse>({ items: [], unread: 0 })
  const [tasks, setTasks] = useState<Task[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [_auditEvents, setAuditEvents] = useState<AuditEventRow[]>([])
  const [taskRuns, setTaskRuns] = useState<TaskRunRow[]>([])
  const [approvals, setApprovals] = useState<ApprovalRow[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [sandboxRuns, setSandboxRuns] = useState<SandboxRunListRow[]>([])
  const [isolation, setIsolation] = useState<IsolationInfo | null>(null)
  const [locateId, setLocateId] = useState<string | null>(null)
  const [reportTaskId, setReportTaskId] = useState<string | null>(null) // Execution Cockpit
  // 待补信息:exec=执行前缺信息(按 taskId 续跑) / record=已落库 PendingInput(按 id 解决)
  const [pendingInput, setPendingInput] = useState<
    | { kind: 'exec'; taskId: string; data: PendingInputData }
    | { kind: 'record'; id: string; taskId: string | null; data: PendingInputData }
    | null
  >(null)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [_sidebarOpen, setSidebarOpen] = useState(false) // 窄屏:侧栏抽屉开关
  const [wsTick, setWsTick] = useState(0) // Chat 工作区刷新信号(tasks/workspace 变更时 +1)
  // Live Run:按 runId 聚合的实时运行事件(WS run-event 增量 append),供 Chat / Cockpit 实时展示
  const [runEvents, setRunEvents] = useState<Record<string, RunEvent[]>>({})
  // Chat 深链聚焦:从 Home/Mission/Delivery「查看现场」带入具体 Run / 面板
  const [chatFocus, setChatFocus] = useState<{ runId?: string; tab?: string; key: number } | null>(null)
  const [composerGoal, setComposerGoal] = useState('') // Mission Composer 预填目标(任务模板)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [templates, setTemplates] = useState<TemplateResolved[]>([])
  const [pendingInputs, setPendingInputs] = useState<PendingInputRow[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [templatePreview, setTemplatePreview] = useState<TemplateResolved | null>(null)

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

  // 工作台真实数据(Mission / Review / Delivery / AuditEvent / 执行运行时 / 审批 / 沙盒运行 / 待补信息)
  const refreshWorkspace = useCallback(async () => {
    const [m, d, a, runs, aps, sb, pi] = await Promise.all([
      api.missions(),
      api.deliveries(),
      api.auditEvents({ limit: 50 }),
      api.taskRuns(),
      api.approvals(),
      api.sandboxRuns(20),
      api.pendingInputs(),
    ])
    setMissions(m)
    setDeliveries(d)
    setAuditEvents(a)
    setTaskRuns(runs)
    setApprovals(aps)
    setSandboxRuns(sb.runs)
    setIsolation(sb.isolation)
    setPendingInputs(pi)
  }, [])

  // 模板(按当前 Settings + 助手实时解析执行人/模型/工具;返回里也带 settings)
  const refreshTemplates = useCallback(async () => {
    const r = await api.templates()
    setTemplates(r.templates)
    setSettings(r.settings)
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
        // 缺信息:用结构化 Pending User Action UI 收集后再执行(替代浏览器 prompt)
        if (res && 'prompt' in res) {
          setPendingInput({
            kind: 'exec',
            taskId: id,
            data: {
              question: res.prompt,
              reason: res.reason,
              options: res.options,
              recommended: res.recommended,
              defaultValue: res.defaultValue,
              allowCustom: res.allowCustom,
            },
          })
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

  // 工作区指派:把任务指派给某 AI(执行由用户在工作区/驾驶舱显式触发)。
  const assignTaskUI = useCallback(
    async (taskId: string, assistantId: string) => {
      await api.updateTask(taskId, { assigneeId: assistantId })
      await Promise.all([refreshTasks(), refreshWorkspace()])
    },
    [refreshTasks, refreshWorkspace],
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

  // 进入某个 Mission 的工作区
  const openMission = useCallback((id: string) => {
    setActiveMissionId(id)
    setView('mission')
    setShowPending(false)
  }, [])

  // 从 Mission 跳进执行它的 AI 助手 Chat 工作区(打开/复用与该助手的私信)
  // 深链:可带 focus(具体 Run / 面板),打开后自动展开 dock 并聚焦。
  const openAssistantChat = useCallback(
    async (_assistantId: string, _focus?: { runId?: string; tab?: string }) => {
      // v4:不再创建 DM,点 AI 名字应该跳 Agent profile 页(Phase F 实装)
      toast.info('AI 助手现在是只读资料卡。请在项目频道里 @ 它派工')
    },
    [],
  )

  // 深链:直接按频道打开 Chat 工作区并聚焦具体 Run / 面板(驾驶舱「执行对话」、交付「查看现场」)
  const openChannelFocus = useCallback(
    (channelId: string, focus?: { runId?: string; tab?: string }) => {
      setReportTaskId(null)
      setShowPending(false)
      setView('channel')
      setSelectedId(channelId)
      setSidebarOpen(false)
      setChatFocus(focus ? { ...focus, key: Date.now() } : { tab: 'preview', key: Date.now() })
    },
    [],
  )

  // Mission Composer「开始运行 / 仅创建」:用预览出的工作流步骤真实落库,进入工作区;autorun 时自动指派并执行第一步。
  const startFromComposer = useCallback(
    async (goal: string, steps: WorkflowStep[], autorun: boolean) => {
      try {
        const m = await api.createMission({ goal })
        await api.breakdownMission(
          m.id,
          steps.map((s) => ({
            title: s.title,
            expectedOutput: s.deliverable,
            role: s.role,
            priority: s.priority,
          })),
        )
        await Promise.all([refreshTasks(), refreshWorkspace()])
        setShowComposer(false)
        openMission(m.id)
        if (autorun) {
          const detail = await api.mission(m.id).catch(() => null)
          const first = detail?.tasks[0]
          if (first) {
            const r = await api.suggestAssignee(first.id).catch(() => null)
            if (r?.assistantId) {
              await api.updateTask(first.id, { assigneeId: r.assistantId })
              void executeTask(first.id) // 不阻塞:打开驾驶舱并轮询
            }
          }
        }
      } catch (e) {
        window.alert('创建工作流失败:' + parseErr(e))
      }
    },
    [refreshTasks, refreshWorkspace, openMission, executeTask],
  )

  // 从快速模板创建 Mission:落库模板步骤为子任务 → 按所选模式运行(auto/confirm/plan)。
  const startFromTemplate = useCallback(
    async (template: TemplateResolved, goal: string, mode: 'auto' | 'confirm' | 'plan') => {
      try {
        const m = await api.createMission({ goal: goal || template.goalTemplate })
        await api.breakdownMission(
          m.id,
          template.steps.map((s) => ({
            title: s.title,
            expectedOutput: s.deliverable,
            role: s.executor?.name,
            priority: s.priority,
          })),
        )
        await api.runMission(m.id, mode)
        await Promise.all([refreshTasks(), refreshWorkspace()])
        setTemplatePreview(null)
        openMission(m.id)
      } catch (e) {
        window.alert('启动模板失败:' + parseErr(e))
      }
    },
    [refreshTasks, refreshWorkspace, openMission],
  )

  // 解决一条「待补信息」:补充自定义值 / 选项 / 按默认假设继续 → 后端续跑
  const resolvePending = useCallback(
    async (value: string | null, useDefault: boolean) => {
      if (!pendingInput) return
      setPendingBusy(true)
      try {
        if (pendingInput.kind === 'exec') {
          // 执行前缺信息:直接用值(或默认值)再次执行该任务
          const taskId = pendingInput.taskId
          const v = useDefault ? pendingInput.data.defaultValue ?? '' : value ?? ''
          setPendingInput(null)
          await executeTask(taskId, v || undefined)
        } else {
          const id = pendingInput.id
          const taskId = pendingInput.taskId
          setPendingInput(null)
          await api.resolvePendingInput(id, useDefault ? { useDefault: true } : { value: value ?? '' })
          await Promise.all([refreshTasks(), refreshWorkspace()])
          if (taskId) setReportTaskId(taskId) // 打开驾驶舱看续跑
        }
      } catch (e) {
        window.alert('继续失败:' + parseErr(e))
      } finally {
        setPendingBusy(false)
      }
    },
    [pendingInput, executeTask, refreshTasks, refreshWorkspace],
  )

  // 打开一条已落库的待补信息(从 Home/Mission/Chat 进入结构化补充)
  const openPendingInput = useCallback((pi: PendingInputRow) => {
    let options: { label: string; value: string; hint?: string }[] = []
    try {
      options = pi.optionsJson ? JSON.parse(pi.optionsJson) : []
    } catch {
      options = []
    }
    const assistantName = pi.assistantId
      ? assistants.find((a) => a.id === pi.assistantId)?.name
      : undefined
    setPendingInput({
      kind: 'record',
      id: pi.id,
      taskId: pi.taskId,
      data: {
        question: pi.question,
        reason: pi.reason,
        options,
        recommended: pi.recommended ?? -1,
        defaultValue: pi.defaultValue,
        allowCustom: pi.allowCustom,
        assistantName,
      },
    })
    setShowPending(false)
  }, [assistants])

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
    setChatFocus(null) // 手动切频道清除深链聚焦
    setSidebarOpen(false) // 选完关闭窄屏抽屉
  }, [])

  const pinMessage = useCallback(async (id: string) => {
    await api.pinMessage(id) // 效果由 WS message-updated / channel-updated 同步
  }, [])

  // 身份就绪后加载 me + 频道 + 助手
  useEffect(() => {
    if (!userId) return
    api.me().then(setMe)
    refreshAssistants()
    refreshInbox()
    refreshTasks()
    refreshWorkspace()
    refreshCapabilities()
    refreshTemplates()
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
    refreshTemplates,
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
    } else if (e.type === 'run-event') {
      // Live Run:增量 append(去重 by id),实时驱动 Chat / Cockpit 时间线
      setRunEvents((prev) => {
        const cur = prev[e.runId] ?? []
        if (cur.some((x) => x.id === e.event.id)) return prev
        return { ...prev, [e.runId]: [...cur, e.event] }
      })
    } else if (e.type === 'tasks') {
      refreshTasks()
      refreshWorkspace()
      setWsTick((t) => t + 1)
    } else if (e.type === 'workspace') {
      refreshWorkspace()
      refreshTemplates()
      setWsTick((t) => t + 1)
    } else if (e.type === 'memory-updated') {
      // v3 G3:Memory 变更 → 刷新 wsTick(MemoryPanel + Brain 角标 useEffect 重跑)
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
      await api.createAssistant(data)
      setUsers(await api.users())
      await refreshAssistants()
      // v4:不再自动开 DM
    },
    [refreshAssistants],
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

  // 待你处理(Pending Deck / Drawer):真实高危审批 + 待验收交付
  const deliveriesUI = useMemo(() => mapDeliveries(deliveries, users), [deliveries, users])
  const approvalItems = useMemo<ApprovalItem[]>(
    () => [
      ...mapCapabilityApprovals(approvals, users, tasks),
      ...computeApprovals(deliveriesUI),
    ],
    [approvals, users, tasks, deliveriesUI],
  )

  const decidePendingItem = useCallback(
    (item: ApprovalItem, status: 'approved' | 'rejected') => {
      if (item.kind === 'action') decideApproval(item.refId, status)
      else decideDelivery(item.refId, status)
    },
    [decideApproval, decideDelivery],
  )

  const openPendingItem = useCallback(
    (item: ApprovalItem) => {
      let mid: string | null = null
      if (item.kind === 'action') {
        const ap = approvals.find((a) => a.id === item.refId)
        mid = ap?.missionId ?? (ap?.taskId ? tasks.find((t) => t.id === ap.taskId)?.missionId ?? null : null)
      } else {
        mid = deliveries.find((d) => d.id === item.refId)?.missionId ?? null
      }
      if (mid) openMission(mid)
      setShowPending(false)
    },
    [approvals, deliveries, tasks, openMission],
  )

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

  const onSidebarNavigate = (target: SidebarNavTarget) => {
    if (target.kind === 'channel') {
      setSidebarSection(null)
      setView('channel')
      selectChannel(target.channelId)
      return
    }
    const sec = target.section
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
      {
        id: 'go:home',
        label: '主页',
        group: '导航',
        onSelect: () => onSidebarNavigate({ kind: 'section', section: 'home' }),
      },
      {
        id: 'go:overview',
        label: '公司全景',
        group: '导航',
        onSelect: () => onSidebarNavigate({ kind: 'section', section: 'overview' }),
      },
      {
        id: 'go:plugins',
        label: '插件',
        group: '导航',
        onSelect: () => onSidebarNavigate({ kind: 'section', section: 'plugins-installed' }),
      },
      {
        id: 'go:integrations',
        label: '集成',
        group: '导航',
        onSelect: () => onSidebarNavigate({ kind: 'section', section: 'integrations-mcp' }),
      },
    )
    return items
  }, [channels, assistants])

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <SidebarV4
        me={me}
        channels={channels}
        selectedSection={sidebarSection}
        selectedChannelId={view === 'channel' ? selectedId : null}
        onNavigate={onSidebarNavigate}
        onCreateProject={() => setShowNewProject(true)}
        onOpenCommandPalette={() => palette.setOpen(true)}
      />
      <NewProjectModal
        open={showNewProject}
        onOpenChange={setShowNewProject}
        me={me}
        users={users}
        assistants={assistants}
        onSubmit={async (data) => {
          // 1) 创建频道
          const ch = await api.createChannel({
            name: data.name,
            kind: 'project',
            goal: data.goal,
            scope: data.scope,
            phase: data.phase,
            ownerId: data.ownerId,
          })
          // 2) 加 AI 队员(实装为 ChannelMember 批量加入)
          for (const uid of data.memberIds) {
            try {
              await api.addMember(ch.id, uid)
            } catch {
              /* AI 可能已经被 J3 自动加入,忽略冲突 */
            }
          }
          await refreshChannels()
          setView('channel')
          setSidebarSection(null)
          selectChannel(ch.id)
          toast.success(`项目频道 #${data.name} 已创建`)
        }}
      />
      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        items={paletteItems}
      />
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--canvas)]">
        {view === 'home' ? (
          <HomeViewV4
            me={me}
            channels={channels}
            templates={templates}
            onPickProject={(channelId) => {
              setView('channel')
              setSidebarSection(null)
              selectChannel(channelId)
            }}
            onSubmitMission={(text) => {
              const projects = channels.filter(
                (c) => !c.archived && (c.kind === 'project' || c.kind == null),
              )
              if (projects.length === 0) {
                toast.error('还没有项目频道,先在 sidebar 创建一个')
                return
              }
              // 简化:挑第一个项目,进入并把派工文本带入 composer(深链)
              const target = projects[0]
              setView('channel')
              setSidebarSection(null)
              selectChannel(target.id)
              setChatFocus({ tab: 'preview', key: Date.now() })
              // 让目标频道的 composer 看到这段(localStorage 替代直接 prop)
              localStorage.setItem(`draft:${target.id}`, text)
              toast.success(`已带入 #${target.name}。发送即派工。`)
            }}
            onUseTemplate={(t) => setTemplatePreview(t)}
          />
        ) : view === 'mission' && activeMissionId ? (
          <MissionWorkspace
            missionId={activeMissionId}
            missions={missions}
            taskRuns={taskRuns}
            sandboxRuns={sandboxRuns}
            approvals={approvals}
            users={users}
            assistants={assistants}
            statuses={statuses}
            isolation={isolation}
            onBack={() => setView('home')}
            onMenuClick={() => setSidebarOpen(true)}
            onAssignTask={assignTaskUI}
            onAutoAssign={autoAssign}
            onExecuteTask={executeTask}
            onContinueRun={continueRun}
            onDecideDelivery={decideDelivery}
            onCreateDelivery={createDelivery}
            onAddMissionTask={addMissionTask}
            onBreakdownMission={breakdownMission}
            onOpenReport={openReport}
            onOpenAssistantChat={openAssistantChat}
            onOpenPendingInput={openPendingInput}
          />
        ) : view === 'plugins' ? (
          <PluginsView
            initialTab={sidebarSection === 'plugins-sources' ? 'sources' : 'installed'}
          />
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
          <CompanyOverview
            onOpenChannel={(channelId) => {
              setView('channel')
              setSidebarSection(null)
              selectChannel(channelId)
            }}
          />
        ) : view === 'archived' ? (
          <div className="mx-auto h-full w-full max-w-[1200px] overflow-y-auto px-10 py-8">
            <h1 className="font-display text-[24px] font-semibold text-[var(--ink)]">归档</h1>
            <p className="mt-4 text-[13px] text-[var(--ink-3)]">
              已归档的项目频道(待实装)
            </p>
          </div>
        ) : view === 'guide' ? (
          <div className="mx-auto h-full w-full max-w-[1200px] overflow-y-auto px-10 py-8">
            <h1 className="font-display text-[24px] font-semibold text-[var(--ink)]">引导</h1>
            <p className="mt-4 text-[13px] text-[var(--ink-3)]">
              新用户上手指南(待实装)
            </p>
          </div>
        ) : view === 'agent' && agentProfileId ? (
          <AgentProfileView
            agentId={agentProfileId}
            onBack={() => {
              setView('home')
              setSidebarSection('home')
            }}
            onJumpChannel={(channelId) => {
              setView('channel')
              setSidebarSection(null)
              selectChannel(channelId)
            }}
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
            users={users}
            assistants={assistants}
            wsRefreshKey={wsTick}
            runEvents={runEvents}
            focusRunId={chatFocus?.runId ?? null}
            focusTab={chatFocus?.tab ?? null}
            onOpenReport={openReport}
            onContinueRun={continueRun}
            onDecideDelivery={decideDelivery}
            onOpenPendingInput={openPendingInput}
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
      {showComposer && (
        <MissionComposer
          key={composerGoal}
          initialGoal={composerGoal}
          onClose={() => {
            setShowComposer(false)
            setComposerGoal('')
          }}
          onStart={startFromComposer}
        />
      )}
      {showPending && (
        <PendingActionDrawer
          items={approvalItems}
          approvals={approvals}
          deliveries={deliveriesUI}
          pendingInputs={pendingInputs}
          onClose={() => setShowPending(false)}
          onDecide={decidePendingItem}
          onOpen={openPendingItem}
          onOpenPendingInput={openPendingInput}
        />
      )}
      {showSafety && (
        <SafetyDrawer
          capabilities={capabilities}
          isolation={isolation}
          onClose={() => setShowSafety(false)}
        />
      )}
      {reportTaskId && (
        <ExecutionCockpit
          taskId={reportTaskId}
          users={users}
          isolation={isolation}
          runEvents={runEvents}
          onClose={() => setReportTaskId(null)}
          onOpenChannel={(channelId, runId) => {
            openChannelFocus(channelId, { runId, tab: 'preview' })
          }}
          onGenerateDelivery={createDelivery}
          onContinue={continueRun}
          onCancel={cancelTask}
          onDecideApproval={decideApproval}
        />
      )}
      {pendingInput && (
        <PendingInputModal
          data={pendingInput.data}
          busy={pendingBusy}
          onCancel={() => setPendingInput(null)}
          onSubmit={(value) => resolvePending(value, false)}
          onUseDefault={() => resolvePending(null, true)}
        />
      )}
      {showSettings && (
        <SettingsModal
          assistants={assistants}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s)
            refreshTemplates()
          }}
        />
      )}
      {templatePreview && (
        <TemplatePreview
          template={templatePreview}
          defaultMode={
            templatePreview.defaultMode === 'auto' && settings && !settings.autoRun
              ? 'confirm'
              : templatePreview.defaultMode
          }
          onClose={() => setTemplatePreview(null)}
          onStart={(goal, mode) => startFromTemplate(templatePreview, goal, mode)}
          onOpenSettings={() => {
            setTemplatePreview(null)
            setShowSettings(true)
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
