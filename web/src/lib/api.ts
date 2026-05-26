import { getUserId } from './identity'
import type { GraphNode, GraphEdge } from './types'
import type {
  Assistant,
  AssistantPreset,
  ChannelDetail,
  ChannelSummary,
  InboxResponse,
  Message,
  ProvidersResponse,
  ReactionGroup,
  SearchResult,
  Skill,
  Task,
  Thread,
  User,
  MissionRow,
  MissionDetail,
  ReviewRow,
  DeliveryRow,
  AuditEventRow,
  ContextDoc,
  TaskRunRow,
  ApprovalRow,
  Capability,
  ExecuteResult,
  TaskReport,
  SandboxReport,
  SandboxRunsResponse,
  IsolationInfo,
  SuggestAssignee,
  WorkflowPlan,
  ChannelWorkspace,
  SettingsResponse,
  TemplatesResponse,
  PendingInputRow,
  RunEvent,
} from './types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'x-user-id': getUserId() ?? '',
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  // 只有带 body 时才声明 JSON,避免 DELETE/GET 空 body 触发 Fastify 解析报错
  if (init?.body) headers['Content-Type'] = 'application/json'
  const res = await fetch('/api' + path, { ...init, headers })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  if (res.status === 204) return null as T
  return res.json() as Promise<T>
}

export const api = {
  upload: async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'x-user-id': getUserId() ?? '' },
      body: fd,
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    return res.json() as Promise<{ url: string; name: string; isImage: boolean }>
  },
  me: () => req<User>('/me'),
  users: () => req<User[]>('/users'),
  channels: () => req<ChannelSummary[]>('/channels'),
  channel: (id: string) => req<ChannelDetail>(`/channels/${id}`),
  messages: (id: string) => req<Message[]>(`/channels/${id}/messages`),
  thread: (messageId: string) =>
    req<Thread>(`/messages/${messageId}/thread`),
  send: (id: string, body: string, parentId?: string) =>
    req<Message>(`/channels/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, parentId }),
    }),
  editMessage: (id: string, body: string) =>
    req<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteMessage: (id: string) =>
    req<{ ok: boolean }>(`/messages/${id}`, { method: 'DELETE' }),
  bulkDeleteMessages: (ids: string[]) =>
    req<{ ok: boolean; count: number }>(`/messages/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  search: (q: string) =>
    req<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  inbox: () => req<InboxResponse>('/inbox'),
  inboxRead: () => req<{ ok: boolean }>('/inbox/read', { method: 'POST' }),
  tasks: () => req<Task[]>('/tasks'),
  createTask: (
    title: string,
    opts?: {
      missionId?: string
      status?: string
      assigneeId?: string
      channelId?: string
      priority?: string
      expectedOutput?: string
    },
  ) =>
    req<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, ...opts }),
    }),
  updateTask: (
    id: string,
    data: { title?: string; status?: string; assigneeId?: string | null },
  ) =>
    req<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    req<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  react: (messageId: string, emoji: string) =>
    req<{ reactions: ReactionGroup[] }>(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  // v3 G1:kind 必填;kind=project 必填 goal,可选 scope/phase/ownerId/deadline
  createChannel: (data: {
    name: string
    topic?: string
    kind: 'project' | 'discussion' | 'random'
    goal?: string
    scope?: string
    phase?: 'discovery' | 'build' | 'review' | 'ship' | 'maintenance'
    ownerId?: string
    deadline?: string
  }) =>
    req<{ id: string }>('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  patchChannel: (
    id: string,
    data: {
      name?: string
      topic?: string
      isPrivate?: boolean
      archived?: boolean
      // v3 字段
      goal?: string
      scope?: string
      phase?: 'discovery' | 'build' | 'review' | 'ship' | 'maintenance'
      ownerId?: string | null
      deadline?: string | null
    },
  ) =>
    req<{ ok: boolean }>(`/channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  // v3 G3
  channelMemories: (id: string) =>
    req<import('./types').ChannelMemoriesResponse>(`/channels/${id}/memories`),
  deleteChannel: (id: string) =>
    req<{ ok: boolean }>(`/channels/${id}`, { method: 'DELETE' }),
  deleteEvent: (id: string) =>
    req<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  addMember: (id: string, userId: string) =>
    req<{ ok: boolean }>(`/channels/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  removeMember: (id: string, userId: string) =>
    req<{ ok: boolean }>(`/channels/${id}/members/${userId}`, {
      method: 'DELETE',
    }),
  pinMessage: (id: string) =>
    req<{ ok: boolean }>(`/messages/${id}/pin`, { method: 'POST' }),
  openDM: (userId: string) =>
    req<{ id: string }>('/dms', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  assistants: () => req<Assistant[]>('/assistants'),
  assistantPresets: () => req<AssistantPreset[]>('/assistant-presets'),
  skills: () => req<Skill[]>('/skills'),
  providers: () => req<ProvidersResponse>('/providers'),
  createAssistant: (data: {
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
  }) =>
    req<Assistant>('/assistants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAssistant: (
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
  ) =>
    req<Assistant>(`/assistants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteAssistant: (id: string) =>
    req<{ ok: boolean }>(`/assistants/${id}`, { method: 'DELETE' }),
  markRead: (id: string, messageId: string) =>
    req<{ ok: boolean }>(`/channels/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),
  stopChannel: (id: string) =>
    req<{ ok: boolean }>(`/channels/${id}/stop`, { method: 'POST' }),
  channelWorkspace: (id: string) =>
    req<ChannelWorkspace>(`/channels/${id}/workspace`),

  // v2 Algorithm Graph:返回拼装好的 {nodes, edges}(后端已 join 真实 task/agent/delivery/...)
  channelGraph: (id: string) =>
    req<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/channels/${id}/graph`),

  // v2 Optimizer:接受/dismiss 建议
  applyOptimizerSuggestion: (data: {
    messageId: string
    type: 'skip_pending_input' | 'approve_delivery' | 'dismiss'
    payload?: Record<string, unknown>
  }) =>
    req<{ ok: boolean }>(`/optimizer/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ---- AI Workforce 工作流(真实持久化) ----
  missions: () => req<MissionRow[]>('/missions'),
  mission: (id: string) => req<MissionDetail>(`/missions/${id}`),
  createMission: (data: { title?: string; goal: string; contextDocIds?: string[] }) =>
    req<MissionRow>('/missions', { method: 'POST', body: JSON.stringify(data) }),
  updateMission: (
    id: string,
    data: { title?: string; goal?: string; status?: string; contextDocIds?: string[] },
  ) => req<MissionRow>(`/missions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  breakdownMission: (
    id: string,
    subtasks?: { title: string; expectedOutput?: string; role?: string; priority?: string }[],
  ) =>
    req<{ tasks: Task[] }>(`/missions/${id}/breakdown`, {
      method: 'POST',
      body: JSON.stringify(subtasks?.length ? { subtasks } : {}),
    }),
  planMission: (goal: string) =>
    req<{ plan: WorkflowPlan }>(`/missions/plan-preview`, {
      method: 'POST',
      body: JSON.stringify({ goal }),
    }),

  reviews: (params?: { taskId?: string; missionId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return req<ReviewRow[]>(`/reviews${q ? `?${q}` : ''}`)
  },
  createReview: (data: {
    taskId?: string
    missionId?: string
    reviewerId?: string
    verdict: 'pass' | 'needs_fix' | 'blocked'
    checks?: { label: string; ok: boolean }[]
    notes?: string
  }) => req<ReviewRow>('/reviews', { method: 'POST', body: JSON.stringify(data) }),

  deliveries: (params?: { missionId?: string; status?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return req<DeliveryRow[]>(`/deliveries${q ? `?${q}` : ''}`)
  },
  createDelivery: (data: {
    missionId?: string
    taskId?: string
    title: string
    summary?: string
    testResult?: string
    riskLevel?: string
    artifact?: unknown
  }) => req<DeliveryRow>('/deliveries', { method: 'POST', body: JSON.stringify(data) }),
  decideDelivery: (id: string, status: 'approved' | 'rejected' | 'pending') =>
    req<DeliveryRow>(`/deliveries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  auditEvents: (params?: { missionId?: string; limit?: number }) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    ).toString()
    return req<AuditEventRow[]>(`/audit-events${q ? `?${q}` : ''}`)
  },

  contextDocs: (q?: string) =>
    req<ContextDoc[]>(`/context-docs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  contextDoc: (id: string) => req<ContextDoc>(`/context-docs/${id}`),

  // ---- Task Execution Runtime(真实执行) ----
  executeTask: (id: string, input?: string) =>
    req<ExecuteResult>(`/tasks/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input: input ?? undefined }),
    }),
  taskReport: (id: string) => req<TaskReport>(`/tasks/${id}/report`),
  cancelTask: (id: string) =>
    req<{ ok: boolean }>(`/tasks/${id}/cancel`, { method: 'POST' }),
  sandboxReport: (runId: string) =>
    req<SandboxReport>(`/task-runs/${runId}/sandbox-report`),
  applyRun: (runId: string) =>
    req<{ ok: boolean; applied: string[]; blocked: { path: string; reason: string }[]; skippedDeletions: string[] }>(
      `/task-runs/${runId}/apply`,
      { method: 'POST' },
    ),
  discardRun: (runId: string) =>
    req<{ ok: boolean }>(`/task-runs/${runId}/discard`, { method: 'POST' }),
  continueRun: (runId: string) =>
    req<ExecuteResult>(`/task-runs/${runId}/continue`, { method: 'POST' }),
  sandboxRuns: (limit?: number) =>
    req<SandboxRunsResponse>(`/sandbox-runs${limit ? `?limit=${limit}` : ''}`),
  sandboxIsolation: () => req<IsolationInfo>('/sandbox/isolation'),
  suggestAssignee: (taskId: string) =>
    req<SuggestAssignee>(`/tasks/${taskId}/suggest-assignee`),
  taskRuns: (taskId?: string) =>
    req<TaskRunRow[]>(`/task-runs${taskId ? `?taskId=${taskId}` : ''}`),
  runEvents: (runId: string) => req<RunEvent[]>(`/task-runs/${runId}/events`),
  approvals: (status?: string) =>
    req<ApprovalRow[]>(`/approvals${status ? `?status=${status}` : ''}`),
  decideApproval: (id: string, status: 'approved' | 'rejected') =>
    req<ApprovalRow>(`/approvals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  capabilities: () => req<Capability[]>('/capabilities'),

  // ---- v4 主页 / 公司全景 / Agent profile ----
  homeKpis: () =>
    req<{
      onlineAgents: number
      deliveriesThisWeek: number
      reviewing: number
      todoMine: number
      deliverySparkline: { day: string; count: number }[]
    }>('/home-kpis'),
  overviewDepartments: () =>
    req<{
      departments: Array<{
        key: string
        label: string
        status: 'RUNNING' | 'STUCK' | 'IDLE'
        autonomy: number
        deliveriesThisWeek: number
        openTasks: number
        sparkline: number[]
        channels: Array<{ id: string; name: string; phase: string | null }>
        oneLiner: string
      }>
    }>('/overview/departments'),
  agent: (id: string) =>
    req<{
      user: {
        id: string
        name: string
        handle: string
        avatarColor: number | null
        isAssistant: boolean
        preset: string | null
        provider: string | null
        model: string | null
        skills: string[]
      }
      persona: { systemPromptSummary: string | null; l1: string | null }
      projectMemories: Array<{
        channelId: string
        channelName: string
        l2?: { content: string; updatedAt: string }
        l3?: { content: string; updatedAt: string }
      }>
      activeTask: { id: string; title: string; status: string; channel: { id: string; name: string } | null; updatedAt: string } | null
      recentDeliveries: Array<{ id: string; title: string; status: string; createdAt: string }>
      activeChannels: Array<{ id: string; name: string; phase: string | null; goal: string | null; lastActiveAt: string | null }>
      trust: { autonomy: number; accuracy: number; fluency: number }
    }>(`/agents/${id}`),

  // ---- Settings / Templates / Pending Input / Mission Run(本轮新增) ----
  settings: () => req<SettingsResponse>('/settings'),
  updateSettings: (data: { defaultExecutorId?: string | null; autoRun?: boolean; assumeDefaults?: boolean }) =>
    req<SettingsResponse>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  templates: () => req<TemplatesResponse>('/templates'),
  pendingInputs: (status?: string) =>
    req<PendingInputRow[]>(`/pending-inputs${status ? `?status=${status}` : ''}`),
  resolvePendingInput: (id: string, data: { value?: string; useDefault?: boolean }) =>
    req<ExecuteResult | { ok: boolean }>(`/pending-inputs/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  runMission: (id: string, mode: 'auto' | 'confirm' | 'plan') =>
    req<{ ok: boolean; mode: string; started: boolean }>(`/missions/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  advanceMission: (id: string) =>
    req<{ ok: boolean }>(`/missions/${id}/advance`, { method: 'POST' }),
}
