import { useMemo } from 'react'
import {
  Menu,
  Plus,
  Sparkles,
  Hand,
  ChevronRight,
  Target,
  PackageCheck,
  ShieldCheck,
  CircleDot,
  FileText,
  Globe,
  Code2,
  MonitorPlay,
  CloudSun,
  SlidersHorizontal,
  Cpu,
  Bot,
  AlertTriangle,
} from 'lucide-react'
import { Avatar } from '../Avatar'
import { TeamStrip } from './TeamStrip'
import { ActivityFeed } from './ActivityFeed'
import { relativeTime, identityColor, initials } from '../../lib/format'
import type { TemplateResolved } from '../../lib/types'
import {
  deriveAgents,
  latestRunByTask,
  mapActivities,
  mapDeliveries,
  mapCapabilityApprovals,
  computeApprovals,
} from '../../lib/workspace'
import type {
  Assistant,
  Task,
  User,
  MissionRow,
  DeliveryRow,
  AuditEventRow,
  TaskRunRow,
  ApprovalRow,
} from '../../lib/types'

// 模板图标(后端给图标名,前端映射)
const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  FileText: <FileText size={16} />,
  Globe: <Globe size={16} />,
  Code2: <Code2 size={16} />,
  MonitorPlay: <MonitorPlay size={16} />,
  CloudSun: <CloudSun size={16} />,
}

const MISSION_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草案', color: 'var(--text-tertiary)' },
  planning: { label: '规划中', color: 'var(--info)' },
  ready: { label: '就绪', color: 'var(--info)' },
  running: { label: '执行中', color: 'var(--agent-working)' },
  review: { label: '复核中', color: 'var(--warning)' },
  delivered: { label: '已交付', color: 'var(--success)' },
  archived: { label: '已归档', color: 'var(--text-tertiary)' },
}

// Home —— Mission Overview / Command Center。克制、有呼吸感:全局态势 + 待处理 + Mission 进展 + 近期交付 + 进入工作区。
export function HomeView({
  assistants,
  tasks,
  statuses,
  users,
  missions,
  deliveries,
  auditEvents,
  taskRuns,
  approvals,
  templates,
  pendingInputCount = 0,
  onNewMission,
  onOpenMission,
  onOpenPending,
  onOpenSafety,
  onOpenSettings,
  onMenuClick,
  onUseTemplate,
}: {
  assistants: Assistant[]
  tasks: Task[]
  statuses: Record<string, { status: string; ts: number }>
  users: User[]
  missions: MissionRow[]
  deliveries: DeliveryRow[]
  auditEvents: AuditEventRow[]
  taskRuns: TaskRunRow[]
  approvals: ApprovalRow[]
  templates: TemplateResolved[]
  pendingInputCount?: number
  onNewMission: () => void
  onOpenMission: (id: string) => void
  onOpenPending: () => void
  onOpenSafety: () => void
  onOpenSettings: () => void
  onMenuClick: () => void
  onUseTemplate: (t: TemplateResolved) => void
}) {
  const runByTask = useMemo(() => latestRunByTask(taskRuns), [taskRuns])
  const agents = useMemo(
    () => deriveAgents(assistants, tasks, statuses, runByTask),
    [assistants, tasks, statuses, runByTask],
  )
  const activities = useMemo(() => mapActivities(auditEvents, users), [auditEvents, users])
  const deliveriesUI = useMemo(() => mapDeliveries(deliveries, users), [deliveries, users])
  const approvalItems = useMemo(
    () => [
      ...mapCapabilityApprovals(approvals, users, tasks),
      ...computeApprovals(deliveriesUI),
    ],
    [approvals, users, tasks, deliveriesUI],
  )

  // 每个 Mission 的真实进度统计
  const missionStats = useMemo(() => {
    const m = new Map<
      string,
      { total: number; done: number; review: number; active: number; assignees: User[]; lastAt: string; pendingDelivery: boolean; deliveredCount: number }
    >()
    for (const mi of missions) {
      const mt = tasks.filter((t) => t.missionId === mi.id)
      const assignees: User[] = []
      let active = 0
      let lastAt = mi.updatedAt
      for (const t of mt) {
        if (t.assignee && !assignees.some((a) => a.id === t.assignee!.id)) assignees.push(t.assignee)
        const r = runByTask.get(t.id)
        if (r && (r.status === 'running' || r.status === 'queued' || r.status === 'needs_approval')) active++
        if (t.updatedAt > lastAt) lastAt = t.updatedAt
      }
      m.set(mi.id, {
        total: mt.length,
        done: mt.filter((t) => t.status === 'done').length,
        // review = 已成功待复核(产出已就绪,只差人工验收)→ 计入进度,避免显示 0%/规划中
        review: mt.filter((t) => t.status === 'review').length,
        active,
        assignees: assignees.slice(0, 4),
        lastAt,
        pendingDelivery: deliveries.some((d) => d.missionId === mi.id && d.status === 'pending'),
        deliveredCount: deliveries.filter((d) => d.missionId === mi.id && d.status === 'approved').length,
      })
    }
    return m
  }, [missions, tasks, runByTask, deliveries])

  const activeMissions = missions.filter((m) => m.status !== 'archived')
  const activeAgents = agents.filter((a) => a.status === 'working' || a.status === 'reviewing').length
  const running = missions.filter((m) => (missionStats.get(m.id)?.active ?? 0) > 0).length
  const recentDeliveries = deliveriesUI.slice(0, 4)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Hero */}
      <header className="constellation-bg relative shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--chrome-frame)] px-5 py-5 md:px-8 md:py-7">
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              onClick={onMenuClick}
              className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--hover)] md:hidden"
            >
              <Menu size={18} />
            </button>
            <span
              className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] sm:flex"
              style={{
                background: 'linear-gradient(140deg, var(--accent), color-mix(in oklch, var(--accent) 50%, var(--info)))',
                boxShadow: '0 0 20px -4px var(--glow-accent)',
              }}
            >
              <HelioxMark />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-[var(--text-tertiary)] uppercase">
                <span className="h-1.5 w-1.5 rounded-full agent-pulse-ring" style={{ background: 'var(--agent-working)' }} />
                Heliox · Mission Control
              </div>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)] md:text-[1.7rem]">
                你的 AI 团队总览
              </h1>
              <p className="mt-1 max-w-xl text-[13px] text-[var(--text-secondary)]">
                把目标交给团队,在这里一眼看清:谁在做、做到哪、要你确认什么、交付在哪。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
              title="Settings · 默认执行 AI / 一键执行"
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              onClick={onOpenSafety}
              className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] sm:flex"
              title="安全与能力(沙盒隔离 / 权限矩阵)"
            >
              <ShieldCheck size={16} />
            </button>
            <button
              onClick={onNewMission}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-3.5 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={16} /> 新建 Mission
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <Stat label="活跃队员" value={activeAgents} dot="var(--agent-working)" />
          <Stat label="执行中 Mission" value={running} dot="var(--info)" />
          <Stat label="Mission 总数" value={activeMissions.length} dot="var(--text-tertiary)" />
          <Stat label="待你处理" value={approvalItems.length + pendingInputCount} dot="var(--accent)" highlight />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-4 md:p-6">
          {/* 任务模板:快速开始(显示执行人 / 模型 / 工具,点前就知道谁会跑)*/}
          <section>
            <SectionHead icon={<Sparkles size={14} />} title="快速开始 · 任务模板" />
            {templates.length === 0 ? (
              <p className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] py-6 text-center text-[12px] text-[var(--text-tertiary)]">
                加载模板中…(或在 Settings 配置一个可用的执行助手)
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onUseTemplate(t)}
                    className="card-lift group flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left"
                    title={t.goalTemplate}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)]"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                      >
                        {TEMPLATE_ICON[t.icon] ?? <Sparkles size={16} />}
                      </span>
                      {t.available ? (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ color: 'var(--success)', background: 'color-mix(in oklch, var(--success) 13%, transparent)' }}>
                          可执行
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 13%, transparent)' }} title={t.blockedReason}>
                          <AlertTriangle size={9} /> 待配置
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-[12.5px] font-semibold leading-tight text-[var(--text-primary)]">{t.title}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{t.subtitle}</div>
                    </div>
                    {/* 执行人 + 模型 */}
                    <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--border)] pt-2">
                      {t.primaryExecutor ? (
                        <>
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[8px] font-semibold text-white"
                            style={{ background: identityColor(t.primaryExecutor.avatarColor) }}
                          >
                            {initials(t.primaryExecutor.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-secondary)]">
                            {t.primaryExecutor.name}
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                          <Bot size={11} /> 待解析
                        </span>
                      )}
                    </div>
                    {t.primaryExecutor && (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                        <Cpu size={10} />
                        <span className="truncate">{t.primaryExecutor.model}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Pending Deck(高危审批 + 待验收交付 + AI 缺信息补充)*/}
          {approvalItems.length + pendingInputCount > 0 && (
            <button
              onClick={onOpenPending}
              className="surface-glow group flex items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3.5 text-left"
              style={{ borderColor: 'color-mix(in oklch, var(--accent) 35%, var(--border))', background: 'var(--accent-soft)' }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent)] text-white">
                <Hand size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {approvalItems.length + pendingInputCount} 项需要你处理
                </div>
                <div className="truncate text-[12px] text-[var(--text-secondary)]">
                  {pendingInputCount > 0 ? `${pendingInputCount} 项 AI 缺信息待补充` : ''}
                  {pendingInputCount > 0 && approvalItems.length > 0 ? ' · ' : ''}
                  {approvalItems.slice(0, 2).map((i) => i.title).join(' · ')}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-lg)] bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-white">
                去处理 <ChevronRight size={14} />
              </span>
            </button>
          )}

          {/* Team Strip */}
          <TeamStrip agents={agents} />

          {/* Missions + 右栏 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Missions */}
            <section>
              <SectionHead icon={<Target size={14} />} title="Missions" count={activeMissions.length} />
              {activeMissions.length === 0 ? (
                <button
                  onClick={onNewMission}
                  className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-6 py-14 text-center transition-colors hover:bg-[var(--hover)]"
                >
                  <Sparkles size={26} className="text-[var(--accent-text)]" strokeWidth={1.5} />
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">还没有 Mission</p>
                  <p className="text-[12px] text-[var(--text-tertiary)]">点这里描述一个目标,让 AI 生成工作流并执行</p>
                </button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeMissions.map((m) => (
                    <MissionCard
                      key={m.id}
                      mission={m}
                      stats={missionStats.get(m.id)}
                      onOpen={() => onOpenMission(m.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 右栏:近期交付 + 活动 */}
            <div className="flex min-w-0 flex-col gap-4">
              <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-3.5">
                <SectionHead icon={<PackageCheck size={14} />} title="近期交付" count={recentDeliveries.length || undefined} flush />
                {recentDeliveries.length === 0 ? (
                  <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-6 text-center text-[12px] text-[var(--text-tertiary)]">
                    暂无交付。任务完成后会出现在这里。
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {recentDeliveries.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => d.missionId && onOpenMission(d.missionId)}
                        className="card-lift flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-left"
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                          style={{
                            color: d.status === 'approved' ? 'var(--success)' : d.status === 'rejected' ? 'var(--warning)' : 'var(--accent-text)',
                            background: d.status === 'pending' ? 'var(--accent-soft)' : 'var(--surface-3)',
                          }}
                        >
                          <PackageCheck size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{d.missionTitle}</div>
                          <div className="text-[11px] text-[var(--text-tertiary)]">
                            {d.status === 'pending' ? '待你验收' : d.status === 'approved' ? '已验收' : '已打回'} · {relativeTime(d.createdAt)}
                          </div>
                        </div>
                        <ChevronRight size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-3.5">
                <ActivityFeed events={activities} limit={8} title="全局活动" />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MissionCard({
  mission,
  stats,
  onOpen,
}: {
  mission: MissionRow
  stats?: { total: number; done: number; review: number; active: number; assignees: User[]; lastAt: string; pendingDelivery: boolean; deliveredCount: number }
  onOpen: () => void
}) {
  const total = stats?.total ?? 0
  const done = stats?.done ?? 0
  const review = stats?.review ?? 0
  const active = stats?.active ?? 0
  // 进度口径:已完成 + 待复核(产出已就绪)都计入,避免"做完了仍 0%"
  const progressed = done + review
  const pct = total ? Math.round((progressed / total) * 100) : 0
  // 展示状态与真实 run/delivery 一致:执行中 / 待验收 / 复核中 / 已交付,而不是恒"规划中"
  const display = (() => {
    if (stats?.pendingDelivery) return { label: '待验收', color: 'var(--accent-text)' }
    if (active > 0) return { label: '执行中', color: 'var(--info)' }
    if (total > 0 && done === total) return { label: '已交付', color: 'var(--success)' }
    if (review > 0) return { label: '复核中', color: 'var(--warning)' }
    return MISSION_STATUS[mission.status] ?? { label: mission.status, color: 'var(--text-tertiary)' }
  })()
  const meta = display
  return (
    <button
      onClick={onOpen}
      className="card-lift group flex flex-col rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
          style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 13%, transparent)` }}
        >
          {(stats?.active ?? 0) > 0 ? <CircleDot size={10} className="agent-pulse-ring" /> : null}
          {meta.label}
        </span>
        <ChevronRight size={16} className="shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" />
      </div>

      <h3 className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text-primary)]">
        {mission.title}
      </h3>

      {/* 进度 */}
      {total > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
            <span>{done}/{total} 子任务</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
          </div>
        </div>
      )}

      {/* 底部:执行人 + 标记 + 时间 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {(stats?.assignees ?? []).map((a) => (
            <span key={a.id} className="ring-2 ring-[var(--surface-1)]" style={{ borderRadius: 'var(--radius-md)' }}>
              <Avatar user={{ name: a.name, avatarColor: a.avatarColor, isAssistant: true }} size={20} />
            </span>
          ))}
          {(stats?.assignees.length ?? 0) === 0 && total === 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)]">待 AI 拆解</span>
          )}
        </div>
        {stats?.pendingDelivery && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}>
            <PackageCheck size={10} /> 待验收
          </span>
        )}
        <span className="ml-auto text-[11px] text-[var(--text-tertiary)]">{relativeTime(stats?.lastAt ?? mission.updatedAt)}</span>
      </div>
    </button>
  )
}

function Stat({ label, value, dot, highlight }: { label: string; value: number; dot: string; highlight?: boolean }) {
  const on = highlight && value > 0
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-1.5"
      style={{
        background: on ? 'var(--accent-soft)' : 'var(--glass-surface)',
        borderColor: on ? 'var(--accent)' : 'var(--glass-border)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {on ? <Sparkles size={13} style={{ color: 'var(--accent-text)' }} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{value}</span>
      <span className="text-xs text-[var(--text-tertiary)]">{label}</span>
    </div>
  )
}

function SectionHead({
  icon,
  title,
  count,
  flush,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  flush?: boolean
}) {
  return (
    <div className={`flex items-center gap-1.5 ${flush ? 'mb-2.5' : 'mb-3'}`}>
      <span className="text-[var(--accent-text)]">{icon}</span>
      <span className="text-[12px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase">{title}</span>
      {count != null && <span className="text-[12px] text-[var(--text-tertiary)]">· {count}</span>}
    </div>
  )
}

function HelioxMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <circle cx="12" cy="12" r="3.2" fill="white" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" opacity="0.85" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(60 12 12)" opacity="0.55" />
    </svg>
  )
}
