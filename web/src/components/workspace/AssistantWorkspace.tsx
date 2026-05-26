import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  FileCode2,
  ListChecks,
  PackageCheck,
  Activity as ActivityIcon,
  BookOpen,
  Bug,
  Gauge,
  PanelRightClose,
  Camera,
  FolderSearch,
  Wrench,
  ShieldAlert,
  Loader2,
  Layers,
  HelpCircle,
  Wand2,
  Network,
  Brain,
} from 'lucide-react'
import { AlgorithmGraph } from './AlgorithmGraph'
import { MemoryPanel } from './MemoryPanel'
import { api } from '../../lib/api'
import { StepTimeline } from './StepTimeline'
import { DeliveryCenter } from './DeliveryCenter'
import { ActivityFeed } from './ActivityFeed'
import { LiveRunTimeline } from './LiveRunTimeline'
import { InteractivePreview } from './InteractivePreview'
import { buildProductSteps } from '../../lib/steps'
import {
  RUN_STATUS_META,
  latestRunByTask,
  mapActivities,
  mapDeliveries,
  deriveWebPreview,
} from '../../lib/workspace'
import { SKILL_LABELS } from '../../lib/constants'
import type {
  Assistant,
  User,
  TaskReport,
  ContextDoc,
  ChannelWorkspace,
  SandboxRunListRow,
  SandboxChangedFile,
  PendingInputRow,
  RunEvent,
} from '../../lib/types'

type Tab =
  | 'preview'
  | 'editor'
  | 'inspect'
  | 'tasks'
  | 'graph'
  | 'deliveries'
  | 'memory'
  | 'activity'
  // 老 tab,继续兼容现有路径(本轮不暴露在 dock 顶部)
  | 'files'
  | 'runs'
  | 'delivery'
  | 'skills'
  | 'context'

// v4 doctrine §2.3:dock 8 tab,preview 默认在最前,其次成品三件套(editor / inspect),再过程五件套。
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'preview', label: 'Preview', icon: <Eye size={13} /> },
  { key: 'editor', label: 'Editor', icon: <FileCode2 size={13} /> },
  { key: 'inspect', label: 'Inspect', icon: <Bug size={13} /> },
  { key: 'tasks', label: 'Tasks', icon: <ListChecks size={13} /> },
  { key: 'graph', label: 'Graph', icon: <Network size={13} /> },
  { key: 'deliveries', label: 'Deliveries', icon: <PackageCheck size={13} /> },
  { key: 'memory', label: 'Memory', icon: <Brain size={13} /> },
  { key: 'activity', label: 'Activity', icon: <ActivityIcon size={13} /> },
]

const ACTIVE_RUN = new Set(['queued', 'running', 'needs_approval'])

// 高危能力说明(只读列为安全)
const DANGER_SKILLS = new Set(['run_command', 'write_file'])
const SKILL_DESC: Record<string, string> = {
  run_command: '在隔离沙盒里运行命令 · 高危动作需你批准',
  write_file: '在隔离沙盒里写入/修改文件',
  list_dir: '浏览项目目录结构',
  read_file: '读取项目文件作为上下文',
  fetch_url: '联网读取网页 / 抓取真实数据',
  generate_image: '生成图片',
  current_datetime: '获取真实当前时间',
  create_task: '把目标拆成可执行子任务',
  search_messages: '检索历史消息',
  calculator: '做数值计算',
  remember: '把要点写入长期记忆',
  read_calendar: '查看日历事件',
  create_event: '创建日历事件',
  update_event: '更新日历事件',
  list_channels: '查看可用频道',
}

function sbFiles(sb: SandboxRunListRow): SandboxChangedFile[] {
  if (!sb.changedFiles) return []
  try {
    return JSON.parse(sb.changedFiles)
  } catch {
    return []
  }
}

// Chat 工作区:与某助手的频道作用域,左聊天 / 右产物面板(Genspark 式)。全部真实数据驱动。
export function AssistantWorkspace({
  channelId,
  channelName,
  peer,
  assistants,
  users,
  refreshKey,
  runEvents,
  focusRunId,
  focusTab,
  splitControls,
  onClose,
  onOpenReport,
  onContinueRun,
  onDecideDelivery,
  onOpenPendingInput,
}: {
  channelId: string
  channelName: string
  peer: User | null
  assistants: Assistant[]
  users: User[]
  refreshKey: number
  runEvents?: Record<string, RunEvent[]>
  focusRunId?: string | null
  focusTab?: Tab | null
  splitControls?: React.ReactNode
  onClose: () => void
  onOpenReport: (taskId: string) => void
  onContinueRun: (runId: string) => void
  onDecideDelivery: (id: string, status: 'approved' | 'rejected') => void
  onOpenPendingInput?: (pi: PendingInputRow) => void
}) {
  const [ws, setWs] = useState<ChannelWorkspace | null>(null)
  const [tab, setTab] = useState<Tab>('runs')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [report, setReport] = useState<TaskReport | null>(null)
  const [contextDocs, setContextDocs] = useState<ContextDoc[] | null>(null)

  const load = useCallback(async () => {
    try {
      setWs(await api.channelWorkspace(channelId))
    } catch {
      setWs(null)
    }
  }, [channelId])

  useEffect(() => {
    setSelectedTaskId(null)
    setReport(null)
    load()
  }, [load, refreshKey])

  const runByTask = useMemo(() => latestRunByTask(ws?.runs ?? []), [ws])
  const anyActive = useMemo(
    () => (ws?.runs ?? []).some((r) => ACTIVE_RUN.has(r.status)),
    [ws],
  )
  // 执行中:轮询频道工作区
  useEffect(() => {
    if (!anyActive) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [anyActive, load])

  const tasks = ws?.tasks ?? []
  const deliveriesUI = useMemo(() => mapDeliveries(ws?.deliveries ?? [], users), [ws, users])
  const activities = useMemo(() => mapActivities(ws?.audit ?? [], users), [ws, users])
  const sandboxes = ws?.sandboxRuns ?? []
  const pendingDelivery = deliveriesUI.filter((d) => d.status === 'pending').length
  const fileCount = sandboxes.reduce((s, sb) => s + sbFiles(sb).length, 0)

  // 默认选中:进行中的 > 有 run 的 > 第一个
  useEffect(() => {
    if (selectedTaskId && tasks.some((t) => t.id === selectedTaskId)) return
    const active = tasks.find((t) => {
      const r = runByTask.get(t.id)
      return r && ACTIVE_RUN.has(r.status)
    })
    const withRun = tasks.find((t) => runByTask.has(t.id))
    setSelectedTaskId(active?.id ?? withRun?.id ?? tasks[0]?.id ?? null)
  }, [tasks, selectedTaskId, runByTask])

  // 选中任务的执行报告(Runs/Preview/Context 用)
  const loadReport = useCallback(async () => {
    if (!selectedTaskId) {
      setReport(null)
      return
    }
    try {
      setReport(await api.taskReport(selectedTaskId))
    } catch {
      setReport(null)
    }
  }, [selectedTaskId])
  useEffect(() => {
    loadReport()
  }, [loadReport, refreshKey, ws])
  const reportActive = report?.runs[0] && ACTIVE_RUN.has(report.runs[0].status)
  useEffect(() => {
    if (!reportActive) return
    const t = setInterval(loadReport, 2500)
    return () => clearInterval(t)
  }, [reportActive, loadReport])

  useEffect(() => {
    if (tab === 'context' && contextDocs === null) {
      api.contextDocs().then(setContextDocs).catch(() => setContextDocs([]))
    }
  }, [tab, contextDocs])

  const steps = useMemo(() => buildProductSteps(report), [report])
  const executor = report?.runs[0]?.assistantId
    ? users.find((u) => u.id === report.runs[0].assistantId)?.name
    : peer?.name
  const assistant = peer ? assistants.find((a) => a.id === peer.id) ?? null : null

  // Live Run:合并「初次加载的 runEvents(report)」与「WS 实时推送(runEvents[runId])」,去重 by id,按 seq 排序
  const latestRunId = report?.runs[0]?.id
  const mergedEvents = useMemo(() => {
    const base = report?.runEvents ?? []
    const live = (latestRunId && runEvents?.[latestRunId]) || []
    const map = new Map<string, RunEvent>()
    for (const e of [...base, ...live]) map.set(e.id, e)
    return [...map.values()].sort((a, b) => a.seq - b.seq)
  }, [report?.runEvents, runEvents, latestRunId])
  const interactive = useMemo(() => deriveWebPreview(report?.sandbox), [report])

  // 深链聚焦:打开具体 Run / 切到指定面板
  useEffect(() => {
    if (focusTab) setTab(focusTab)
  }, [focusTab])
  useEffect(() => {
    if (focusRunId && ws) {
      const r = ws.runs.find((x) => x.id === focusRunId)
      if (r) setSelectedTaskId(r.taskId)
    }
  }, [focusRunId, ws])

  const badge: Partial<Record<Tab, number>> = {
    runs: ws?.runs.length ?? 0,
    delivery: pendingDelivery,
    files: fileCount,
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-[var(--surface-1)]">
      {/* 头部 */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <Layers size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">工作区</div>
          <div className="truncate text-[10.5px] text-[var(--text-tertiary)]">
            {peer ? `与 ${channelName} 协作` : `#${channelName}`} · 产物 / 运行 / 交付
          </div>
        </div>
        {splitControls}
        <button
          onClick={onClose}
          title="收起工作区"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <PanelRightClose size={16} />
        </button>
      </header>

      {/* 待你补充信息(needs_input,#5 在 Chat 工作区可见) */}
      {(ws?.pendingInputs ?? []).length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--accent-soft)] px-3 py-2">
          {(ws?.pendingInputs ?? []).map((pi) => (
            <div key={pi.id} className="flex items-center gap-2">
              <HelpCircle size={13} className="shrink-0 text-[var(--accent-text)]" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-primary)]" title={pi.question}>
                {pi.question}
              </span>
              <button
                onClick={() => onOpenPendingInput?.(pi)}
                className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                <Wand2 size={11} /> 去补充
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 栏 */}
      <nav className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = tab === t.key
          const b = badge[t.key] ?? 0
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative flex shrink-0 items-center gap-1 px-2 py-2.5 text-[11.5px] font-medium transition-colors"
              style={{ color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}
            >
              {t.icon}
              {t.label}
              {b > 0 && (
                <span
                  className="rounded-full px-1 text-[9px] font-semibold"
                  style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
                >
                  {b}
                </span>
              )}
              {active && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />}
            </button>
          )
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        {ws === null ? (
          <Loading />
        ) : tab === 'runs' ? (
          <RunsPanel
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            report={report}
            steps={steps}
            executor={executor}
            runByTask={runByTask}
            events={mergedEvents}
            onSelect={setSelectedTaskId}
            onOpenReport={onOpenReport}
            onContinue={onContinueRun}
            onOpenPreview={() => setTab('preview')}
          />
        ) : tab === 'preview' ? (
          <PreviewPanel deliveries={deliveriesUI} report={report} interactive={interactive} onGo={() => setTab('deliveries')} />
        ) : tab === 'editor' ? (
          <EditorPanel sandboxes={sandboxes} onOpenReport={onOpenReport} />
        ) : tab === 'inspect' ? (
          <InspectPanel interactive={interactive} />
        ) : tab === 'tasks' ? (
          <RunsPanel
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            report={report}
            steps={steps}
            executor={executor}
            runByTask={runByTask}
            events={mergedEvents}
            onSelect={setSelectedTaskId}
            onOpenReport={onOpenReport}
            onContinue={onContinueRun}
            onOpenPreview={() => setTab('preview')}
          />
        ) : tab === 'files' ? (
          <FilesPanel sandboxes={sandboxes} onOpenReport={onOpenReport} />
        ) : tab === 'deliveries' || tab === 'delivery' ? (
          <DeliveryCenter
            deliveries={deliveriesUI}
            sandboxRuns={sandboxes}
            doneTasks={tasks.filter((t) => t.status === 'done')}
            onDecide={onDecideDelivery}
          />
        ) : tab === 'activity' ? (
          activities.length === 0 ? (
            <Empty icon={<ActivityIcon size={24} />} text="这个频道还没有运行记录。让 AI 执行一个任务,这里会按人话记录每一步。" />
          ) : (
            <ActivityFeed events={activities} limit={50} title="本频道活动" />
          )
        ) : tab === 'graph' ? (
          // v2 Algorithm Graph:把当下频道所有节点(任务/Agent/交付/进度/A2A/工具/审批/Optimizer)
          //   按 verb 边连起来,自动度低的 task 高亮警示。
          //   refreshKey 复用 AssistantWorkspace 已有的 props.refreshKey + ws 状态(用 ws?.tasks.length 作弱依赖)。
          <AlgorithmGraph
            channelId={channelId}
            refreshKey={refreshKey + (ws?.tasks?.length ?? 0) + (ws?.deliveries?.length ?? 0)}
          />
        ) : tab === 'memory' ? (
          // v3 G3 Memory:L2/L3 只读面板
          <MemoryPanel channelId={channelId} refreshKey={refreshKey} />
        ) : tab === 'skills' ? (
          <SkillsPanel assistant={assistant} />
        ) : (
          <ContextPanel docs={contextDocs} report={report} channelName={channelName} />
        )}
      </div>
    </aside>
  )
}

// ---- Runs ----
function RunsPanel({
  tasks,
  selectedTaskId,
  report,
  steps,
  executor,
  runByTask,
  events,
  onSelect,
  onOpenReport,
  onContinue,
  onOpenPreview,
}: {
  tasks: TaskReport['task'][]
  selectedTaskId: string | null
  report: TaskReport | null
  steps: ReturnType<typeof buildProductSteps>
  executor?: string
  runByTask: Map<string, import('../../lib/types').TaskRunRow>
  events: RunEvent[]
  onSelect: (id: string) => void
  onOpenReport: (taskId: string) => void
  onContinue: (runId: string) => void
  onOpenPreview: () => void
}) {
  const selected = tasks.find((t) => t.id === selectedTaskId)
  const latest = report?.runs[0]
  const runLive = !!latest && ACTIVE_RUN.has(latest.status)
  const hasWebPreview = (report?.sandbox?.artifacts ?? []).some((a) => a.kind === 'web_preview')
  if (tasks.length === 0)
    return (
      <Empty
        icon={<ListChecks size={24} />}
        text="还没有运行。在左侧对 AI 说「做一个页面 / 跑个任务 / 查个数据」,或在任务里指派给它执行 —— 运行会出现在这里。"
      />
    )
  return (
    <div className="flex flex-col gap-3">
      {/* 运行任务选择 */}
      <div className="flex flex-col gap-1">
        {tasks.map((t) => {
          const r = runByTask.get(t.id)
          const sel = t.id === selectedTaskId
          const active = r && ACTIVE_RUN.has(r.status)
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="flex items-center gap-2 rounded-[var(--radius-md)] border px-2 py-1.5 text-left text-[12px]"
              style={{
                background: sel ? 'var(--accent-soft)' : 'var(--surface-2)',
                borderColor: sel ? 'color-mix(in oklch, var(--accent) 30%, var(--border))' : 'var(--border)',
              }}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'agent-pulse-ring' : ''}`}
                style={{ background: r ? (RUN_STATUS_META[r.status] ?? {}).color ?? 'var(--text-tertiary)' : 'var(--border-strong)' }}
              />
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{t.title}</span>
              {r && (
                <span className="shrink-0 text-[10px]" style={{ color: (RUN_STATUS_META[r.status] ?? {}).color }}>
                  {(RUN_STATUS_META[r.status] ?? { label: r.status }).label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Step Timeline */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
        {!selected ? (
          <Empty icon={<Gauge size={22} />} text="选择上方一个运行查看执行步骤" />
        ) : !latest ? (
          <Empty icon={<Gauge size={22} />} text={`「${selected.title}」还没有执行记录。`} />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
                  <Gauge size={11} className="text-[var(--accent-text)]" /> 执行步骤
                </div>
                <h3 className="mt-0.5 truncate text-[13px] font-semibold text-[var(--text-primary)]">{selected.title}</h3>
              </div>
              <button
                onClick={() => onOpenReport(selected.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
              >
                <Gauge size={12} /> 驾驶舱
              </button>
            </div>
            <StepTimeline steps={steps} executorName={executor} />

            {/* Live Run:执行中/已完成的真实过程流(命令/文件/浏览器/构建/交付),实时透明 */}
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
                <span className={`h-1.5 w-1.5 rounded-full ${runLive ? 'live-dot' : ''}`} style={{ background: runLive ? 'var(--info)' : 'var(--border-strong)' }} />
                执行过程 {runLive ? '· 实时' : ''}
              </div>
              <LiveRunTimeline events={events} compact live={runLive} />
            </div>

            {hasWebPreview && (
              <button
                onClick={onOpenPreview}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[12px] font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                打开可交互预览
              </button>
            )}
            {(latest.status === 'needs_review' || latest.status === 'failed') && (
              <button
                onClick={() => onContinue(latest.id)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[12px] font-medium"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--warning)' }}
              >
                继续执行
              </button>
            )}
            {latest.output && !latest.error && (
              <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-2.5">
                <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">AI 汇报</div>
                <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text-secondary)]">{latest.output}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---- Preview ----
function PreviewPanel({
  deliveries,
  report,
  interactive,
  onGo,
}: {
  deliveries: ReturnType<typeof mapDeliveries>
  report: TaskReport | null
  interactive: import('../../lib/types').InteractiveArtifact | null
  onGo: () => void
}) {
  const latest = deliveries[0]
  const shots = report?.sandbox?.artifacts.filter((a) => a.kind === 'screenshot' && a.path) ?? []
  // 优先用 report 派生的 interactive;否则用最新交付里携带的 interactive
  const web = interactive ?? latest?.interactive ?? null
  const lines = latest?.summary
    ? latest.summary.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 12)
    : []
  if (!web && !latest && shots.length === 0)
    return <Empty icon={<Eye size={24} />} text="还没有可预览的产物。网页类任务执行成功后,这里以可交互预览为主、截图为证据。" />
  return (
    <div className="flex flex-col gap-3">
      {/* 主交付:可交互 Web 预览(截图只是证据) */}
      {web?.previewUrl && (
        <InteractivePreview
          previewUrl={web.previewUrl}
          entry={web.entry}
          files={web.files}
          buildResult={web.buildResult}
          height={360}
        />
      )}
      {latest && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
            <PackageCheck size={11} className="text-[var(--accent-text)]" /> 最新交付预览
          </div>
          <h2 className="mt-1 text-[14.5px] font-semibold text-[var(--text-primary)]">{latest.missionTitle}</h2>
          {lines.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{l.replace(/^[-*\d.、)]+\s*/, '')}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={onGo}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
          >
            查看完整交付 <PackageCheck size={12} />
          </button>
        </div>
      )}
      {shots.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
            <Camera size={11} /> 截图证据
          </div>
          <div className="flex flex-wrap gap-2">
            {shots.map((s) => (
              <a key={s.id} href={s.path ?? '#'} target="_blank" rel="noreferrer">
                <img src={s.path ?? ''} alt={s.summary ?? ''} className="h-36 rounded-[var(--radius-lg)] border border-[var(--border)] object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Files ----
function FilesPanel({
  sandboxes,
  onOpenReport,
}: {
  sandboxes: SandboxRunListRow[]
  onOpenReport: (taskId: string) => void
}) {
  const FILE_STATUS: Record<string, { label: string; color: string }> = {
    added: { label: '新增', color: 'var(--success)' },
    modified: { label: '修改', color: 'var(--warning)' },
    deleted: { label: '删除', color: 'var(--destructive)' },
  }
  const withFiles = sandboxes.filter((sb) => sbFiles(sb).length > 0)
  if (withFiles.length === 0)
    return <Empty icon={<FileCode2 size={24} />} text="还没有文件变更。AI 在隔离沙盒里写入/修改的文件会在这里汇总。" />
  return (
    <div className="flex flex-col gap-3">
      {withFiles.map((sb) => {
        const files = sbFiles(sb)
        return (
          <div key={sb.id} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            <div className="flex items-center gap-2">
              <FileCode2 size={13} className="text-[var(--accent-text)]" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">{sb.taskTitle ?? '沙盒执行'}</span>
              <span className="shrink-0 text-[10.5px] text-[var(--text-tertiary)]">{sb.diffSummary}</span>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1">
              {files.map((f) => {
                const fm = FILE_STATUS[f.status] ?? { label: f.status, color: 'var(--ink-30)' }
                return (
                  <li key={f.path} className="flex items-center gap-2 text-[11.5px]">
                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium" style={{ color: fm.color, background: `color-mix(in oklch, ${fm.color} 14%, transparent)` }}>
                      {fm.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{f.path}</span>
                  </li>
                )
              })}
            </ul>
            {sb.taskId && (
              <button
                onClick={() => onOpenReport(sb.taskId!)}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-[11.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
              >
                <Gauge size={12} /> 完整 diff / 应用
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Skills ----
function SkillsPanel({ assistant }: { assistant: Assistant | null }) {
  if (!assistant)
    return <Empty icon={<Wrench size={24} />} text="这个频道不是与某个 AI 助手的私信,没有可展示的能力清单。" />
  const skills = assistant.skills ?? []
  if (skills.length === 0)
    return <Empty icon={<Wrench size={24} />} text={`${assistant.name} 暂未启用任何工具能力。可在助手设置里开启。`} />
  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">{assistant.name}</span> 当前启用 {skills.length} 项能力。高危动作(运行命令)会在隔离沙盒里执行并请你批准。
      </div>
      {skills.map((s) => {
        const danger = DANGER_SKILLS.has(s)
        return (
          <div key={s} className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
              style={{
                color: danger ? 'var(--warning)' : 'var(--accent-text)',
                background: danger ? 'color-mix(in oklch, var(--warning) 13%, transparent)' : 'var(--accent-soft)',
              }}
            >
              {danger ? <ShieldAlert size={14} /> : <Wrench size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{SKILL_LABELS[s] ?? s}</span>
                <code className="font-mono text-[10px] text-[var(--text-tertiary)]">{s}</code>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{SKILL_DESC[s] ?? '可调用的工具能力'}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---- Context ----
function ContextPanel({
  docs,
  report,
  channelName,
}: {
  docs: ContextDoc[] | null
  report: TaskReport | null
  channelName: string
}) {
  const used = useMemo(() => {
    const set = new Set<string>()
    for (const tc of report?.toolCalls ?? []) {
      if (tc.tool === 'read_file' || tc.tool === 'list_dir' || tc.tool === 'grep') {
        const m = tc.output.match(/(?:文件|目录)\s*([^\s:：\n]+)/)
        if (m) set.add(m[1])
      }
    }
    return [...set].slice(0, 12)
  }, [report])

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
          <FolderSearch size={11} className="text-[var(--accent-text)]" /> 本频道用到的上下文
        </div>
        {used.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {used.map((u) => (
              <li key={u} className="flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--text-secondary)]">
                <FileCode2 size={11} className="shrink-0 text-[var(--text-tertiary)]" /> {u}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
            选一个运行(Runs)后,这里显示本次 AI 实际读取的文件/目录。
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
          <BookOpen size={11} /> 工作记忆 & 文件库
        </div>
        {docs === null ? (
          <p className="text-[11.5px] text-[var(--text-tertiary)]">加载中…</p>
        ) : docs.length === 0 ? (
          <p className="text-[11.5px] text-[var(--text-tertiary)]">暂无可用上下文文档。</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {docs.slice(0, 10).map((d) => (
              <div key={d.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <FileCode2 size={11} className="text-[var(--accent-text)]" />
                  <span className="text-[11.5px] font-medium text-[var(--text-primary)]">{d.title}</span>
                  {typeof d.size === 'number' && (
                    <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{(d.size / 1024).toFixed(1)} KB</span>
                  )}
                </div>
                <code className="mt-0.5 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">{d.path}</code>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10.5px] text-[var(--text-tertiary)]">Channel scoped · 仅 {channelName} 的运行与产物</p>
      </div>
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mt-6 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-5 py-10 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-tertiary)]" style={{ background: 'var(--surface-3)' }}>
        {icon}
      </span>
      <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{text}</p>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-[12px] text-[var(--text-tertiary)]">
      <Loader2 size={14} className="animate-spin" /> 加载工作区…
    </div>
  )
}

// ---- v4 Editor tab:Monaco 浏览沙盒文件(本轮:只读 + 显示最新沙盒 changedFiles)----
function EditorPanel({
  sandboxes,
  onOpenReport,
}: {
  sandboxes: SandboxRunListRow[]
  onOpenReport?: (taskId: string) => void
}) {
  const latest = sandboxes[0] ?? null
  const files = latest ? sbFiles(latest) : []
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [Monaco, setMonaco] = useState<any | null>(null)

  useEffect(() => {
    // 懒加载 Monaco,避免首次 bundle 膨胀
    import('@monaco-editor/react')
      .then((m) => setMonaco(() => m.default))
      .catch(() => setMonaco(null))
  }, [])

  useEffect(() => {
    if (!latest || !selectedPath) return
    setLoading(true)
    fetch(`/api/sandbox-runs/${latest.id}/preview/${selectedPath}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then(setContent)
      .catch(() => setContent('// 文件加载失败,可能不是预览路径下文件'))
      .finally(() => setLoading(false))
  }, [latest, selectedPath])

  if (!latest) {
    return (
      <Empty
        icon={<FileCode2 size={24} />}
        text="沙盒还没产物。在 composer 派工 → 等执行完成,这里会列出沙盒里写的文件。"
      />
    )
  }

  return (
    <div className="grid h-full grid-cols-[200px_1fr] gap-2 overflow-hidden">
      <div className="overflow-y-auto rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
          沙盒文件 ({files.length})
        </div>
        {files.length === 0 ? (
          <div className="text-[11px] text-[var(--mute)]">最新沙盒未记录改动文件</div>
        ) : (
          files.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelectedPath(f.path)}
              className={`block w-full truncate rounded px-1.5 py-1 text-left font-mono text-[11px] ${
                selectedPath === f.path
                  ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                  : 'text-[var(--ink-3)] hover:bg-[var(--glass)] hover:text-[var(--ink)]'
              }`}
              title={f.path}
            >
              {f.path}
            </button>
          ))
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-[var(--line-soft)] bg-[var(--bg)]">
        {!selectedPath ? (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--mute)]">
            选择左侧文件查看内容
          </div>
        ) : loading ? (
          <Loading />
        ) : Monaco ? (
          <Monaco
            height="100%"
            value={content ?? ''}
            theme="vs-dark"
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
            path={selectedPath}
          />
        ) : (
          <pre className="h-full overflow-auto p-3 font-mono text-[11px] text-[var(--ink-2)]">
            {content ?? '// Monaco 加载失败'}
          </pre>
        )}
      </div>
      {onOpenReport && latest.taskId && (
        <button
          type="button"
          onClick={() => onOpenReport(latest.taskId!)}
          className="hidden"
        />
      )}
    </div>
  )
}

// ---- v4 Inspect tab:对 preview iframe 的 console / network / DOM(快路径:eruda 注入)----
function InspectPanel({
  interactive,
}: {
  interactive: import('../../lib/types').InteractiveArtifact | null
}) {
  const url = interactive?.previewUrl ?? null
  if (!url) {
    return (
      <Empty
        icon={<Bug size={24} />}
        text="还没有可调试的预览。在 composer 派工 → preview 出现后,这里能看 console / network / DOM。"
      />
    )
  }
  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-4">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
          调试入口
        </div>
        <h3 className="mt-1 text-[14px] font-medium text-[var(--ink)]">
          对当前 preview iframe 检视 console / network / DOM
        </h3>
        <p className="mt-2 text-[12.5px] text-[var(--ink-3)]">
          v4 快路径:沙盒模板会注入 eruda(本地 vendor 化,无外网 CDN),
          能在 preview iframe 内拉出完整 devtools 面板。本面板提供入口与浏览器原生 devtools 兜底。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--glass)] px-3 py-1.5 text-[12px] text-[var(--ink)] hover:bg-[var(--glass-2)]"
          >
            在新窗口打开 preview ↗
          </a>
          <button
            type="button"
            onClick={() => {
              // 给 preview iframe 发 message,eruda 监听后展开
              const iframe = document.querySelector(
                'iframe[src*="/api/sandbox-runs/"]',
              ) as HTMLIFrameElement | null
              if (!iframe || !iframe.contentWindow) return
              try {
                iframe.contentWindow.postMessage({ type: 'heliox:open-eruda' }, '*')
              } catch {
                /* 跨域时 noop */
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[oklch(15%_0.02_80)] hover:bg-[var(--accent-2)]"
          >
            在 preview 里展开 devtools
          </button>
        </div>
      </div>
      <div className="rounded-md border border-dashed border-[var(--line-soft)] bg-[var(--glass-3)] p-3 text-[11px] text-[var(--ink-3)]">
        <strong className="text-[var(--ink-2)]">为什么是这样:</strong>{' '}
        Heliox 不抢浏览器 devtools。preview iframe 同源(后端 mount 沙盒静态服务),
        所以你可以直接打开 devtools 看完整调用栈。eruda 提供 iframe 内的轻量 console,
        适合移动端预览或截图记录。
      </div>
    </div>
  )
}
