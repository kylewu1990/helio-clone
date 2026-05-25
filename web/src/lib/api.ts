import { getUserId } from './identity'
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
  createChannel: (name: string, topic?: string) =>
    req<{ id: string }>('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, topic }),
    }),
  patchChannel: (
    id: string,
    data: { name?: string; topic?: string; isPrivate?: boolean; archived?: boolean },
  ) =>
    req<{ ok: boolean }>(`/channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
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

  // ---- AI Workforce 工作流(真实持久化) ----
  missions: () => req<MissionRow[]>('/missions'),
  mission: (id: string) => req<MissionDetail>(`/missions/${id}`),
  createMission: (data: { title?: string; goal: string; contextDocIds?: string[] }) =>
    req<MissionRow>('/missions', { method: 'POST', body: JSON.stringify(data) }),
  updateMission: (
    id: string,
    data: { title?: string; goal?: string; status?: string; contextDocIds?: string[] },
  ) => req<MissionRow>(`/missions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  breakdownMission: (id: string) =>
    req<{ tasks: Task[] }>(`/missions/${id}/breakdown`, { method: 'POST' }),

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
  approvals: (status?: string) =>
    req<ApprovalRow[]>(`/approvals${status ? `?status=${status}` : ''}`),
  decideApproval: (id: string, status: 'approved' | 'rejected') =>
    req<ApprovalRow>(`/approvals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  capabilities: () => req<Capability[]>('/capabilities'),
}
