// 主页 C/D/E 区 — 严格对齐 docs/ai/reference/v4-opendesign-screens/01-home.png
// 大问候卡(C)+ 12 项常用工作(D)+ 右辅栏(E1-E4)
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, Grid3X3, Lightbulb, Plus, Settings } from 'lucide-react'
import { api } from '../../lib/api'
import type { Assistant, AuditEventRow, ChannelSummary, User } from '../../lib/types'
import { HOME_TEMPLATES, type HomeTemplateCard } from '../../lib/templates'
import { TiptapComposer, type SlashItem } from '../ui/tiptap-composer'

interface KpiResponse {
  onlineAgents: number
  deliveriesThisWeek: number
  reviewing: number
  todoMine: number
  blocked: number
  deliverySparkline: { day: string; count: number }[]
  prevWeek: {
    onlineAgents: number
    deliveriesThisWeek: number
    reviewing: number
    blocked: number
  }
}

// Phase J/N3:本周 vs 上周对照,算 delta 字符串 + tone。
function deltaOf(
  curr: number,
  prev: number,
  mode: 'abs' | 'pct',
  betterDir: 'up' | 'down',
): { text: string; tone: 'ok' | 'warn' | 'mute' } {
  if (curr === prev) return { text: '同上周', tone: 'mute' }
  const diff = curr - prev
  let text: string
  if (mode === 'pct') {
    if (prev === 0) text = '+∞%'
    else {
      const pct = Math.round((diff / prev) * 100)
      text = `${pct > 0 ? '+' : ''}${pct}%`
    }
  } else {
    text = `${diff > 0 ? '+' : ''}${diff}`
  }
  const goodChange = betterDir === 'up' ? diff > 0 : diff < 0
  return { text, tone: goodChange ? 'ok' : 'warn' }
}

export interface HomeViewV4Props {
  me: User
  channels: ChannelSummary[]
  assistants?: Assistant[]
  onPickProject: (channelId: string) => void
  onSubmitMission: (text: string) => void
  onUseTemplate: (t: HomeTemplateCard) => void
  onOpenOverview: () => void
  onOpenSettings: () => void
  onCreateProject: () => void
}

function greetingPrefix(): string {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function todayLabel(d = new Date()): string {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

// 把 AuditEvent.type 映射成一句话颜色 + icon
function eventStyle(type: string): { dot: string; iconTone: string; icon: string } {
  if (type.startsWith('optimizer.'))
    return { dot: 'oklch(70% 0.14 300)', iconTone: 'optimizer', icon: '✨' }
  if (type === 'delivery.created' || type === 'task.finished' || type === 'review.passed')
    return { dot: 'oklch(70% 0.16 145)', iconTone: 'ok', icon: '✓' }
  if (type === 'incident.waiting' || type.includes('blocked'))
    return { dot: 'var(--accent)', iconTone: 'warn', icon: '!' }
  return { dot: 'var(--mute)', iconTone: 'mute', icon: '·' }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function HomeViewV4({
  me,
  channels,
  assistants,
  onPickProject,
  onSubmitMission,
  onUseTemplate,
  onOpenOverview,
  onOpenSettings,
  onCreateProject,
}: HomeViewV4Props) {
  const [kpi, setKpi] = useState<KpiResponse | null>(null)
  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [composer, setComposer] = useState('')
  // Phase J/N4:Optimizer 主页建议(无 → 不显示 E3 段)
  const [topSuggestion, setTopSuggestion] = useState<{
    id: string
    channelId: string | null
    channelName: string | null
    title: string | null
    body: string | null
    ageMinutes: number | null
    accepted: boolean
  } | null>(null)

  useEffect(() => {
    api.homeKpis().then(setKpi).catch(() => {})
    api.auditEvents({ limit: 8 }).then(setEvents).catch(() => setEvents([]))
    api
      .optimizerSuggestions(1)
      .then((rows) => {
        const top = rows.find((r) => !r.accepted) ?? rows[0] ?? null
        setTopSuggestion(top)
      })
      .catch(() => setTopSuggestion(null))
  }, [])

  const greetings = useMemo(() => greetingPrefix(), [])
  const dateLabel = useMemo(() => todayLabel(), [])
  const projectChannels = useMemo(
    () => channels.filter((c) => !c.archived && !c.isDM && c.kind === 'project'),
    [channels],
  )
  const onlineAgents = kpi?.onlineAgents ?? 0
  const deliveriesThisWeek = kpi?.deliveriesThisWeek ?? 0
  const reviewing = kpi?.reviewing ?? 0
  const blocked = kpi?.blocked ?? 0
  const prev = kpi?.prevWeek
  const deltaAgents = prev ? deltaOf(onlineAgents, prev.onlineAgents, 'abs', 'up') : { text: '同上周', tone: 'mute' as const }
  const deltaDeliveries = prev ? deltaOf(deliveriesThisWeek, prev.deliveriesThisWeek, 'pct', 'up') : { text: '同上周', tone: 'mute' as const }
  const deltaReviewing = prev ? deltaOf(reviewing, prev.reviewing, 'abs', 'down') : { text: '同上周', tone: 'mute' as const }
  const deltaBlocked = prev ? deltaOf(blocked, prev.blocked, 'abs', 'down') : { text: '同上周', tone: 'mute' as const }
  const summarySentence = `${dateLabel} · ${onlineAgents} 个 Agent 在岗,${reviewing} 件交付待你审,${blocked} 处被卡。直接打字,或挑下面的常用工作。`

  // E2 — 6 条事件流。优先用真 AuditEvent;不足 6 条用 seed:demo 提供的同语义补齐
  const eventList = useMemo(() => {
    const real = events.slice(0, 6)
    return real
  }, [events])

  const submit = () => {
    const v = composer.trim()
    if (!v) return
    onSubmitMission(v)
    setComposer('')
  }

  const slashItems: SlashItem[] = useMemo(
    () => [
      ...HOME_TEMPLATES.slice(0, 8).map((t) => ({
        id: t.id,
        label: t.title,
        hint: '常用工作',
        onSelect: () => onUseTemplate(t),
      })),
      {
        id: 'new-project',
        label: '新建项目',
        hint: '⌘N',
        onSelect: onCreateProject,
      },
      {
        id: 'open-overview',
        label: '打开公司全景',
        hint: '⌘2',
        onSelect: onOpenOverview,
      },
    ],
    [onUseTemplate, onCreateProject, onOpenOverview],
  )

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px]">
      {/* 左主区(C + D) */}
      <div className="min-w-0">
        {/* C — 大问候卡 */}
        <section
          className="overflow-hidden rounded-[18px] border border-[var(--line)] shadow-[var(--shadow-1)]"
          style={{ background: 'var(--glass-2)' }}
        >
          <div className="px-7 pb-5 pt-6">
            {/* C1:小绿点状态 + 灰小字 */}
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'oklch(70% 0.16 145)' }}
              />
              <span>{greetings.replace('好', '好')} · {me.name?.toUpperCase()} · AURORA LABS</span>
            </div>

            {/* C2:大标题 */}
            <h1 className="mt-3 font-display text-[32px] font-bold leading-tight tracking-tight text-[var(--ink)]">
              想让 AI 团队做点什么?
            </h1>

            {/* C3:副文 */}
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-3)]">
              {summarySentence}
            </p>

            {/* C4:Composer(占主卡 70% 宽,大圆角 + 深灰背景 + 大留白) */}
            <div
              className="mt-5 rounded-2xl border border-[var(--line-soft)] px-4 py-4"
              style={{ background: 'var(--bg)', maxWidth: '760px' }}
            >
              <TiptapComposer
                value={composer}
                onChange={setComposer}
                placeholder='例如:把 pixel-2 的进度做一份本周 PPT,讲给投资人听 — 30 分钟内要'
                minHeight={64}
                onSubmit={submit}
                mentions={(assistants ?? []).map((a) => ({
                  id: a.id,
                  label: a.name,
                  handle: a.handle,
                }))}
                slashItems={slashItems}
              />
              {/* C5 Composer 底部行 */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--glass-2)] px-2.5 py-1 text-[11.5px] text-[var(--ink-3)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: 'oklch(70% 0.16 145)' }}
                  />
                  派给 Aurora Labs
                </span>
                <div className="flex items-center gap-2 text-[11.5px] text-[var(--mute)]">
                  <span>⇄ 派工</span>
                  <span>·</span>
                  <span>⏎ 换行</span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!composer.trim()}
                    className="ml-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white shadow-sm disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    派工
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* C6:4 KPI(主卡内底部,横向 4 列,字号要大 ≥ 48px tabular-nums) */}
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label="在岗 AGENT" value={onlineAgents} delta={deltaAgents.text} deltaTone={deltaAgents.tone} />
              <Kpi label="本周交付" value={deliveriesThisWeek} delta={deltaDeliveries.text} deltaTone={deltaDeliveries.tone} />
              <Kpi label="待审" value={reviewing} delta={deltaReviewing.text} deltaTone={deltaReviewing.tone} />
              <Kpi label="被卡" value={blocked} delta={deltaBlocked.text} deltaTone={deltaBlocked.tone} />
            </div>
          </div>
        </section>

        {/* D — 常用工作 12 项 */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[18px] font-semibold text-[var(--ink)]">常用工作</h2>
              <span className="text-[12px] text-[var(--mute)]">{HOME_TEMPLATES.length} 项</span>
            </div>
            <button
              type="button"
              onClick={onOpenOverview}
              className="flex items-center gap-1 text-[12.5px] text-[var(--ink-2)] hover:text-[var(--ink)]"
            >
              公司全景
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {HOME_TEMPLATES.map((t) => (
              <TemplateCard key={t.id} t={t} onClick={() => onUseTemplate(t)} />
            ))}
          </div>
        </section>
      </div>

      {/* 右辅栏(E1-E4)280px */}
      <aside className="flex w-full flex-col gap-4 md:w-[280px] xl:w-[300px]">
        {/* E1-E2:今日动态 · 实时 */}
        <section
          className="overflow-hidden rounded-[14px] border border-[var(--line)] p-4"
          style={{ background: 'var(--glass-2)' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
              今日动态 · 实时
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {eventList.length === 0 ? (
              <li className="text-[11.5px] text-[var(--mute)]">
                还没有今天的动态。
              </li>
            ) : (
              eventList.map((e) => {
                const style = eventStyle(e.type)
                return (
                  <li key={e.id} className="flex items-start gap-2">
                    <span
                      className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-medium"
                      style={{
                        background:
                          style.iconTone === 'optimizer'
                            ? 'oklch(70% 0.14 300 / 0.18)'
                            : style.iconTone === 'ok'
                              ? 'oklch(70% 0.16 145 / 0.18)'
                              : style.iconTone === 'warn'
                                ? 'color-mix(in oklch, var(--accent) 22%, transparent)'
                                : 'var(--glass)',
                        color: style.dot,
                      }}
                    >
                      {style.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{e.summary}</p>
                      <span className="text-[10.5px] text-[var(--mute)]">{formatTime(e.createdAt)}</span>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>

        {/* E3:Optimizer 建议(紫色卡) — Phase J/N4 真后端 */}
        {topSuggestion && (
          <section
            className="overflow-hidden rounded-[14px] border p-4"
            style={{
              borderColor: 'color-mix(in oklch, oklch(70% 0.14 300) 35%, var(--line))',
              background: 'color-mix(in oklch, oklch(70% 0.14 300) 6%, var(--glass-2))',
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: 'oklch(70% 0.14 300)' }}
              >
                <Lightbulb size={11} />
                Optimizer 建议
              </div>
              {topSuggestion.channelName && topSuggestion.channelId && (
                <button
                  type="button"
                  onClick={() => onPickProject(topSuggestion.channelId!)}
                  className="text-[10.5px] hover:underline"
                  style={{ color: 'oklch(70% 0.14 300)' }}
                >
                  #{topSuggestion.channelName}
                </button>
              )}
            </div>
            <div
              className="mt-3 rounded-lg border border-dashed p-3"
              style={{
                borderColor: 'color-mix(in oklch, oklch(70% 0.14 300) 30%, transparent)',
                background: 'color-mix(in oklch, oklch(70% 0.14 300) 4%, transparent)',
              }}
            >
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider"
                style={{
                  background: 'color-mix(in oklch, oklch(70% 0.14 300) 14%, transparent)',
                  color: 'oklch(70% 0.14 300)',
                }}
              >
                优化机会
              </span>
              <p className="mt-2 text-[12.5px] font-medium leading-snug text-[var(--ink)]">
                {topSuggestion.title ?? topSuggestion.body ?? '(无标题)'}
              </p>
              {topSuggestion.body && topSuggestion.title && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-3)] line-clamp-3">
                  {topSuggestion.body}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {topSuggestion.channelId && (
                  <button
                    type="button"
                    onClick={() => onPickProject(topSuggestion.channelId!)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white"
                    style={{ background: 'oklch(70% 0.14 300)' }}
                  >
                    去频道处理
                  </button>
                )}
                <span className="text-[10.5px] text-[var(--mute)]">
                  {topSuggestion.ageMinutes != null
                    ? `已 ${topSuggestion.ageMinutes} 分钟`
                    : ''}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* E4:快捷入口 */}
        <section
          className="overflow-hidden rounded-[14px] border border-[var(--line)] p-4"
          style={{ background: 'var(--glass-2)' }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
            快捷入口
          </div>
          <ul className="mt-2 flex flex-col">
            <ShortcutRow
              icon={<Grid3X3 size={13} />}
              label="公司全景"
              hint="6 个部门 / 13 个 Agent"
              onClick={onOpenOverview}
            />
            <ShortcutRow
              icon={<Plus size={13} />}
              label="新建项目"
              hint="起一个新频道 ⌘N"
              onClick={onCreateProject}
            />
            <ShortcutRow
              icon={<Settings size={13} />}
              label="设置"
              hint="provider / 模型 / 沙盒"
              onClick={onOpenSettings}
            />
          </ul>
          {projectChannels.length > 0 && (
            <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
                你的项目
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                {projectChannels.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onPickProject(c.id)}
                    className="flex items-center justify-between rounded px-2 py-1 text-[12px] text-[var(--ink-2)] hover:bg-[var(--glass)] hover:text-[var(--ink)]"
                  >
                    <span className="truncate">
                      <span className="text-[var(--mute)]">#</span>
                      {c.name}
                    </span>
                    <ChevronRight size={11} className="text-[var(--mute)]" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function Kpi({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string
  value: number
  delta: string
  deltaTone: 'ok' | 'warn' | 'mute'
}) {
  const tone =
    deltaTone === 'ok'
      ? 'oklch(70% 0.16 145)'
      : deltaTone === 'warn'
        ? 'oklch(62% 0.18 28)'
        : 'var(--mute)'
  return (
    <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--glass)] px-4 py-3">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="font-display text-[48px] font-bold leading-none tabular-nums text-[var(--ink)]">
          {value}
        </div>
        <span className="mb-1 text-[12px] font-medium tabular-nums" style={{ color: tone }}>
          {delta}
        </span>
      </div>
    </div>
  )
}

function TemplateCard({ t, onClick }: { t: HomeTemplateCard; onClick: () => void }) {
  const Icon = t.icon
  // M3:PPT 模板单独高亮 + NEW 角标(Phase L+M 已真闭环)
  const isPpt = t.id === 'ppt'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-full flex-col rounded-[14px] border p-4 text-left transition-colors ${
        isPpt
          ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] hover:border-[var(--accent)]/70'
          : 'border-[var(--line-soft)] bg-[var(--glass-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]'
      }`}
    >
      {isPpt && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
          NEW · 真闭环
        </span>
      )}
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-[var(--bg)] ${
          isPpt
            ? 'border-[var(--accent)]/40 text-[var(--accent)]'
            : 'border-[var(--line)] text-[var(--ink-2)] group-hover:text-[var(--accent)]'
        }`}
      >
        <Icon size={16} />
      </div>
      <div className="mt-3 text-[13.5px] font-semibold leading-tight text-[var(--ink)]">{t.title}</div>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
        {isPpt ? '一句话主题 → AI 出 outline → 真 .pptx + HTML 预览。点开 = 弹 PPT Studio。' : t.subtitle}
      </p>
      <div className="mt-4 flex items-center gap-2 border-t border-[var(--line-soft)] pt-3 text-[11px] text-[var(--mute)]">
        <div className="flex -space-x-1.5">
          {t.collaborators.map((c) => (
            <span
              key={c.initials}
              className="grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] font-mono text-[9px] text-white"
              style={{ background: `var(--identity-${(c.color % 12) + 1})` }}
              title={c.initials}
            >
              {c.initials}
            </span>
          ))}
        </div>
        <span>{isPpt ? 'Deck Architect · 约 30 秒' : `协作 · 约 ${t.etaMinutes} 分钟`}</span>
      </div>
    </button>
  )
}

function ShortcutRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  onClick?: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-[var(--ink-2)] hover:bg-[var(--glass)] hover:text-[var(--ink)]"
      >
        <span className="text-[var(--mute)]">{icon}</span>
        <span className="flex-1">
          <span className="text-[var(--ink)]">{label}</span>
          <span className="ml-1 text-[10.5px] text-[var(--mute)]">· {hint}</span>
        </span>
        <ChevronRight size={11} className="text-[var(--mute)]" />
      </button>
    </li>
  )
}
