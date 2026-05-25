export type User = {
  id: string
  handle: string
  name: string
  avatarColor: number
  status?: string | null
  isAssistant?: boolean
}

export type Assistant = User & {
  systemPrompt: string | null
  provider: string | null
  baseUrl: string | null
  hasApiKey: boolean
  model: string | null
  skills: string[]
  channelIds: string[]
  autoRespond: boolean
  memory: string | null
  createdById: string | null
}

export type Skill = {
  id: string
  name: string
  description: string
}

export type AssistantPreset = {
  id: string
  name: string
  nameZh: string
  initials: string
  color: number
  tier: 'pro' | 'balanced' | 'fast'
  tagline: string
  systemPrompt: string
  skills: string[]
}

export type ProviderInfo = {
  id: string
  label: string
  models: string[]
  configured: boolean
}

export type ProvidersResponse = {
  default: string
  providers: ProviderInfo[]
}

export type ChannelSummary = {
  id: string
  name: string
  topic?: string | null
  isDM: boolean
  isPrivate: boolean
  archived: boolean
  peer: User | null
  memberCount: number
  unread: number
  lastMessageAt: string
}

export type ChannelDetail = {
  id: string
  name: string
  topic?: string | null
  isDM: boolean
  isPrivate: boolean
  archived: boolean
  peer: User | null
  members: User[]
  pinned: Message[]
}

export type ReactionGroup = {
  emoji: string
  count: number
  userIds: string[]
}

export type EventCard = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
  description: string | null
}

export type Message = {
  id: string
  channelId: string
  authorId: string
  parentId: string | null
  body: string
  editedAt: string | null
  deletedAt: string | null
  pinnedAt: string | null
  toolsUsed: string[]
  cededBy: string[]
  event: EventCard | null
  createdAt: string
  author: User
  reactions: ReactionGroup[]
  replyCount: number
  lastReplyAt: string | null
  replyParticipants: User[]
}

export type SearchResult = {
  id: string
  channelId: string
  channelName: string
  isDM: boolean
  author: User
  body: string
  createdAt: string
}

export type InboxItem = {
  id: string
  messageId: string
  channelId: string
  channelName: string
  isDM: boolean
  author: User
  body: string
  createdAt: string
  read: boolean
}

export type InboxResponse = {
  items: InboxItem[]
  unread: number
}

export type Task = {
  id: string
  title: string
  status: string // todo | doing | review | done
  channelId: string | null
  assignee: User | null
  creator: User | null
  channel: { id: string; name: string } | null
  sortOrder: number
  // AI Workforce 工作流扩展(后端可选字段)
  missionId?: string | null
  priority?: string | null
  expectedOutput?: string | null
  reviewerId?: string | null
  createdAt: string
  updatedAt: string
}

export type Thread = {
  parent: Message
  replies: Message[]
}

/* ============================================================
   AI Workforce Workspace —— 前端状态模型(真实数据驱动)
   说明:工作台首屏全部由真实后端数据驱动。
   - Agent / 看板卡 Mission 由真实 Assistant / Task 派生(见 lib/workspace.ts)
   - Activity 由真实 AuditEvent 映射;Review / Delivery 由真实 API 映射
   - 后端真实资源行类型见本节末尾 MissionRow / ReviewRow / DeliveryRow /
     AuditEventRow / ContextDoc
   ============================================================ */

// AI 队员角色
export type AgentRole =
  | 'Product Strategist'
  | 'Developer'
  | 'Reviewer'
  | 'Researcher'
  | 'Writer'
  | 'Ops'
  | 'Designer'

// AI 队员运行状态
export type AgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked' | 'done'

export interface Agent {
  id: string
  name: string
  role: AgentRole
  status: AgentStatus
  currentTaskId?: string // 当前任务 ID
  currentTaskTitle?: string // 当前任务摘要(冗余,便于直接渲染)
  avatarColor: number
  trustLevel: 1 | 2 | 3 // 1=观察 2=执行 3=自主
  available?: boolean // 是否具备可用模型/key(由真实 Assistant.hasApiKey 等派生)
}

// Mission(任务的工作台表达,升级版 Task)
export type MissionStatus = 'backlog' | 'in_progress' | 'review' | 'delivered'
export type MissionPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface Mission {
  id: string
  title: string
  description?: string
  status: MissionStatus
  priority: MissionPriority
  assigneeId?: string
  assigneeName?: string // 冗余,便于渲染头像/名称
  assigneeColor?: number
  estimatedOutput?: string // 预计交付物
  missionId?: string // 归属的真实 Mission(若有)
  createdAt: string
  updatedAt: string
}

// Activity 运行日志事件
export type ActivityEventType =
  | 'agent-start'
  | 'agent-complete'
  | 'file-change'
  | 'review-request'
  | 'human-confirm'
  | 'blocked'
  | 'delivery-ready'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  agentId: string
  agentName: string
  agentColor: number
  description: string
  missionId?: string
  timestamp: string
  requiresHuman?: boolean
}

// Delivery 交付物(UI 卡,映射自真实 DeliveryRow,状态与后端一致)
export type DeliveryStatus = 'pending' | 'approved' | 'rejected'

export interface Delivery {
  id: string
  missionId: string | null
  missionTitle: string
  summary: string
  changedFiles: string[]
  testResult?: 'pass' | 'fail' | 'skipped'
  riskLevel?: 'low' | 'medium' | 'high'
  assigneeName?: string
  assigneeColor?: number
  status: DeliveryStatus
  createdAt: string
}

// Context Vault 现读取真实文档(见后端 /api/context-docs 与 ContextDoc 类型),
// 旧的 ContextVaultItem / ContextVaultKind 已移除。

/* ---- 任务拆解 Task Breakdown + 并行执行 Parallel Execution ----
   表达「总目标 → 子任务 → 负责人 → 状态 → 依赖 → 交付物」。
   子任务并行运行用 lane(轨道)编号区分。本轮为前端规划/示例表达,
   非真实 runtime;总目标可取真实进行中任务标题。 */
// manual = 任务 doing 但没有真实 TaskRun(人手动推进,不是 AI 在执行)
export type SubtaskStatus =
  | 'pending'
  | 'running'
  | 'review'
  | 'done'
  | 'blocked'
  | 'manual'

export interface Subtask {
  id: string
  title: string
  status: SubtaskStatus
  ownerName?: string
  ownerColor?: number
  lane: number // 并行轨道编号(1..n),同一时刻 running 的不同 lane = 并行
  progress?: number // 0..100,仅 running 时用于轨道进度
  dependsOn?: string[] // 依赖的子任务序号标签(如 ['1','2'])
  output?: string // 预计交付物
}

export interface MissionPlan {
  missionId: string
  goal: string // 总目标
  goalIsReal: boolean // true=取自真实进行中任务 false=示例
  subtasks: Subtask[]
}

/* ---- 质量审查 Quality Review(与后端 verdict 对齐) ---- */
export type ReviewVerdict = 'pass' | 'needs_fix' | 'blocked'

export interface ReviewCheck {
  label: string
  ok: boolean
}

export interface ReviewItem {
  id: string
  targetTitle: string // 被审对象
  reviewerName: string
  reviewerColor: number
  verdict: ReviewVerdict
  checks: ReviewCheck[]
  notes?: string
  timestamp: string
}

/* ---- 人工确认门 Human Approval ----
   聚合所有等待人类最终确认的事项。纯前端状态,不触发后端。 */
export type ApprovalKind = 'delivery' | 'review' | 'action'

export interface ApprovalItem {
  id: string
  kind: ApprovalKind
  refId: string // 对应的真实记录 id(如 delivery id),供审批落库
  title: string
  detail: string
  requestedBy: string
  createdAt: string
}

/* ============================================================
   后端真实资源行类型(与 server Prisma 模型一一对应)
   ============================================================ */

export type MissionStatusReal =
  | 'draft'
  | 'planning'
  | 'ready'
  | 'running'
  | 'review'
  | 'delivered'
  | 'archived'

export interface MissionRow {
  id: string
  title: string
  goal: string
  status: string // MissionStatusReal
  createdById: string | null
  contextDocIds: string | null // JSON 数组字符串
  createdAt: string
  updatedAt: string
}

export interface MissionDetail {
  mission: MissionRow
  tasks: Task[]
  reviews: ReviewRow[]
  deliveries: DeliveryRow[]
  audit: AuditEventRow[]
}

export interface ReviewRow {
  id: string
  missionId: string | null
  taskId: string | null
  reviewerId: string | null
  verdict: string // pass | needs_fix | blocked
  checksJson: string | null
  notes: string | null
  createdAt: string
}

export interface DeliveryRow {
  id: string
  missionId: string | null
  taskId: string | null
  title: string
  summary: string | null
  artifactJson: string | null
  testResult: string | null
  riskLevel: string | null
  status: string // pending | approved | rejected
  approvedById: string | null
  approvedAt: string | null
  createdById: string | null
  createdAt: string
}

export interface AuditEventRow {
  id: string
  missionId: string | null
  taskId: string | null
  actorId: string | null
  type: string
  summary: string
  payloadJson: string | null
  createdAt: string
}

export interface ContextDoc {
  id: string
  title: string
  path: string
  kind: string
  size?: number
  snippet?: string
  content?: string
}

/* ---- Task Execution Runtime(真实执行运行时) ---- */
export type TaskRunStatus =
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'needs_review' // 达工具调用上限,生成部分报告,可继续执行
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface TaskRunRow {
  id: string
  taskId: string
  missionId: string | null
  assistantId: string | null
  channelId: string | null
  triggeredById: string | null
  trigger: string // manual | auto | approval
  status: string // TaskRunStatus
  messageId: string | null
  toolsUsed: string | null // JSON 数组字符串
  output: string | null
  error: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

// 高危能力人工审批请求(run_command 等)
export interface ApprovalRow {
  id: string
  runId: string | null
  taskId: string | null
  missionId: string | null
  requestedById: string | null
  capability: string // run_command | write_file | ...
  command: string | null
  status: string // pending | approved | rejected
  decidedById: string | null
  decidedAt: string | null
  createdAt: string
}

// 开始执行的返回:正常创建 run / 缺信息需补填(如查天气缺城市)
export type ExecuteResult =
  | { runId: string; status: string; executorId?: string; routedFrom?: string }
  | { status: 'needs_input'; field: string; prompt: string }

// 任务执行报告:由 /api/tasks/:id/report 聚合的真实数据
export interface TaskToolCall {
  id: string
  tool: string
  output: string
  runId: string | null
  actorId: string | null
  createdAt: string
}
// ---- Sandbox Runtime(隔离执行)----
export type SandboxStatus =
  | 'preparing'
  | 'running'
  | 'testing'
  | 'ready_for_review'
  | 'applied'
  | 'discarded'
  | 'failed'
  | 'cancelled'

export interface SandboxRunRow {
  id: string
  taskRunId: string
  taskId: string | null
  missionId: string | null
  mode: string // copy | git_worktree
  rootPath: string
  workspacePath: string
  basePath: string | null
  status: string // SandboxStatus
  networkPolicy: string
  changedFiles: string | null // JSON [{path,status}]
  diffSummary: string | null
  buildResult: string | null // pass | fail | partial | skipped
  appliedFiles: string | null
  error: string | null
  createdById: string | null
  appliedById: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SandboxLogRow {
  id: string
  sandboxRunId: string
  seq: number
  type: string // prepare | command | stdout | stderr | tool | test | diff | system | error
  command: string | null
  cwd: string | null
  exitCode: number | null
  durationMs: number | null
  content: string | null
  createdAt: string
}

export interface SandboxArtifactRow {
  id: string
  sandboxRunId: string
  kind: string // diff | file | build_result | report | test
  path: string | null
  summary: string | null
  sizeBytes: number | null
  metadataJson: string | null
  createdAt: string
}

export interface SandboxReport {
  run: SandboxRunRow
  logs: SandboxLogRow[]
  artifacts: SandboxArtifactRow[]
}

// 隔离强度(诚实标注:有 Docker 才强隔离,否则本机信任沙盒)
export interface IsolationInfo {
  strong: boolean
  mode: 'docker' | 'trusted_local'
  label: string
  note: string
}

// 沙盒运行列表项(工作台「沙盒运行」区域用,带任务标题)
export type SandboxRunListRow = SandboxRunRow & { taskTitle: string | null }

export interface SandboxRunsResponse {
  isolation: IsolationInfo
  runs: SandboxRunListRow[]
}

// 推荐执行人
export interface SuggestAssignee {
  assistantId: string | null
  name?: string
  reason: string
}

export interface SandboxChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
}

export interface TaskReport {
  task: Task
  runs: TaskRunRow[]
  approvals: ApprovalRow[]
  audit: AuditEventRow[]
  deliveries: DeliveryRow[]
  toolCalls: TaskToolCall[]
  sandbox: SandboxReport | null
}

// 能力分层 / 权限矩阵(诚实声明)
export type CapabilityLevel = 'available' | 'approval' | 'unavailable'
export interface Capability {
  id: string
  label: string
  kind: 'human' | 'assistant' | 'future'
  level: string // CapabilityLevel
  danger: boolean
  description: string
}

export type WsEvent =
  | { type: 'presence'; online: string[] }
  | { type: 'message'; channelId: string; message: Message }
  | { type: 'message-updated'; channelId: string; message: Message }
  | { type: 'message-chunk'; channelId: string; messageId: string; chunk: string }
  | { type: 'channel-created'; channelId: string }
  | { type: 'channel-updated'; channelId: string }
  | { type: 'reaction'; channelId: string; messageId: string; reactions: ReactionGroup[] }
  | { type: 'thread-reply'; channelId: string; parentId: string; message: Message }
  | { type: 'typing'; channelId: string; userId: string }
  | { type: 'assistant-status'; channelId: string; userId: string; status: string }
  | { type: 'inbox'; userId: string }
  | { type: 'tasks' }
  | { type: 'workspace' } // mission/review/delivery/audit 变更,前端刷新工作台
  | { type: 'message-deleted'; channelId: string; id: string; parentId: string | null }
  | { type: 'messages-deleted'; channelId: string; ids: string[] }
  | { type: 'channel-deleted'; id: string }
  | { type: 'event-deleted'; channelId: string; id: string; cardIds: string[] }
