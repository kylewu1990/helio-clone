import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  Lightbulb,
  Sparkles,
  Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '../../lib/api'
import type { ChannelSummary, TemplateResolved, User } from '../../lib/types'
import { Sparkline } from '../ui/sparkline'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { TiptapComposer } from '../ui/tiptap-composer'
import { cn } from '../../lib/cn'

interface KpiResponse {
  onlineAgents: number
  deliveriesThisWeek: number
  reviewing: number
  todoMine: number
  deliverySparkline: { day: string; count: number }[]
}

export interface HomeViewV4Props {
  me: User
  channels: ChannelSummary[]
  templates: TemplateResolved[]
  onPickProject: (channelId: string) => void
  onSubmitMission: (text: string) => void
  onUseTemplate: (t: TemplateResolved) => void
}

const KPI_ITEMS = [
  { key: 'onlineAgents' as const, label: '在岗 Agent', icon: <Bot size={14} /> },
  { key: 'deliveriesThisWeek' as const, label: '本周交付', icon: <FileCheck2 size={14} /> },
  { key: 'reviewing' as const, label: '待评审', icon: <ClipboardList size={14} /> },
  { key: 'todoMine' as const, label: '我的待办', icon: <Activity size={14} /> },
]

export function HomeViewV4({
  me,
  channels,
  templates,
  onPickProject,
  onSubmitMission,
  onUseTemplate,
}: HomeViewV4Props) {
  const [kpi, setKpi] = useState<KpiResponse | null>(null)
  const [composer, setComposer] = useState('')

  useEffect(() => {
    let mounted = true
    api.homeKpis().then((d) => mounted && setKpi(d)).catch(() => {})
    return () => { mounted = false }
  }, [])

  const greetings = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '凌晨好'
    if (hour < 12) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  const projectChannels = useMemo(
    () => channels.filter((c) => !c.archived && (c.kind === 'project' || c.kind == null)).slice(0, 6),
    [channels],
  )

  const recentTemplates = templates.slice(0, 6)

  // Optimizer 建议:简单本地推断(基于真实 channels / kpi)
  const optimizerHints = useMemo(() => {
    const hints: { title: string; reason: string }[] = []
    if (kpi && kpi.reviewing > 0) {
      hints.push({
        title: `${kpi.reviewing} 件交付等待你的评审`,
        reason: '右上 ⌘K → 切到项目频道 dock 的 Deliveries 一键 accept / reject',
      })
    }
    if (projectChannels.length === 0) {
      hints.push({ title: '还没有项目频道', reason: '点 sidebar 的 + 新建第一个项目,AI 会自动加入' })
    }
    if (kpi && kpi.onlineAgents === 0) {
      hints.push({ title: '没有在岗 Agent', reason: '集成页配置一个 provider(Claude / OpenRouter),Agent 会上线' })
    }
    if (hints.length === 0)
      hints.push({ title: '一切运转良好', reason: 'AI 团队正在按计划推进。可以在 composer 派一个新任务。' })
    return hints.slice(0, 3)
  }, [kpi, projectChannels])

  return (
    <div className="mx-auto h-full w-full max-w-[1400px] overflow-y-auto px-10 py-8">
      {/* 4 KPI 横条 - 大数字 44px */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {KPI_ITEMS.map((it) => {
          const value = kpi?.[it.key] ?? 0
          return (
            <motion.div
              key={it.key}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <Card className="px-5 py-4">
                <div className="flex items-center justify-between text-[var(--mute)]">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">{it.label}</span>
                  <span className="text-[var(--ink-3)]">{it.icon}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="font-display text-[44px] font-bold tabular-nums leading-none text-[var(--ink)]">
                    {value}
                  </div>
                  {it.key === 'deliveriesThisWeek' && kpi?.deliverySparkline && (
                    <Sparkline
                      data={kpi.deliverySparkline.map((d) => d.count)}
                      width={92}
                      height={32}
                      stroke="var(--accent)"
                      fill="var(--accent)"
                    />
                  )}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {/* 大问候 + tiptap composer + 右辅栏 280px */}
      <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="font-display text-[34px] font-bold tracking-tight text-[var(--ink)] sm:text-[36px]"
          >
            {greetings},{me.name}
            <span
              className="ml-2 bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(94deg, var(--accent-2), var(--accent))' }}
            >
              ——
            </span>
            <span className="text-[var(--ink-2)]"> 想让 AI 团队做点什么?</span>
          </motion.h1>
          <div className="mt-6 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--glass)] p-4 shadow-[var(--shadow-1)] backdrop-blur">
            <TiptapComposer
              value={composer}
              onChange={setComposer}
              placeholder="描述一个任务,比如:做一个 Button 组件,有 5 个 variant + destructive 状态;或:把上周的 deliveries 整理成 release notes…"
              minHeight={96}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-[11px] text-[var(--mute)]">
                提交后会让你选择目标项目频道,然后 AI 自动派工
              </div>
              <Button
                onClick={() => {
                  const v = composer.trim()
                  if (!v) return
                  onSubmitMission(v)
                  setComposer('')
                }}
                disabled={!composer.trim()}
              >
                <Sparkles size={14} />
                派工
              </Button>
            </div>
          </div>
        </div>

        {/* 右辅栏 280px:今日动态 + Optimizer 建议 + 快捷入口 */}
        <aside className="flex w-full flex-col gap-4 xl:w-[280px]">
          <Card className="p-4">
            <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--mute)]">
              <Activity size={11} /> 今日动态
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-[var(--ink-2)]">
              {kpi ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span>{kpi.onlineAgents} 个 Agent 在岗</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                    <span>本周已交付 {kpi.deliveriesThisWeek} 件</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                    <span>{kpi.reviewing} 件等评审</span>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--mute)]">加载中…</div>
              )}
            </div>
          </Card>

          <Card
            className="p-4"
            style={{
              borderColor: 'color-mix(in oklch, var(--accent) 28%, var(--line))',
              background: 'color-mix(in oklch, var(--accent) 6%, var(--glass))',
            }}
          >
            <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em]" style={{ color: 'var(--accent)' }}>
              <Lightbulb size={11} /> Optimizer 建议
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {optimizerHints.map((h, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed text-[var(--ink)]">
                  <div className="font-medium">{h.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">{h.reason}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--mute)]">
              <Zap size={11} /> 快捷入口
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[12.5px]">
              <ShortcutRow label="⌘K 命令面板" hint="跳任意频道 / Agent" />
              <ShortcutRow label="侧栏 +" hint="新建项目频道" />
              <ShortcutRow label="集成 → MCP" hint="挂接外部能力" />
            </div>
          </Card>
        </aside>
      </div>

      {/* 常用工作 + 你的项目 */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              常用工作
              <Badge variant="default">{recentTemplates.length}</Badge>
            </CardTitle>
            <CardDescription>从模板起步,自动派给合适的 AI</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recentTemplates.length === 0 ? (
              <div className="col-span-2 rounded-md border border-dashed border-[var(--line-soft)] p-6 text-center text-[12px] text-[var(--mute)]">
                还没有可用模板
              </div>
            ) : (
              recentTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUseTemplate(t)}
                  className={cn(
                    'group flex items-start gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-3 text-left transition-colors',
                    'hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]',
                  )}
                  disabled={!t.available}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--bg)] text-base">
                    {t.icon || '✨'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13.5px] font-medium text-[var(--ink)]">{t.title}</div>
                      {!t.available && <Badge variant="warning">{t.blockedReason || '未就绪'}</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-[var(--ink-3)]">{t.subtitle}</div>
                    {t.primaryExecutor && (
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-3)]">
                        @ {t.primaryExecutor.name}
                      </div>
                    )}
                  </div>
                  <ArrowUpRight size={14} className="mt-1 shrink-0 text-[var(--mute)] group-hover:text-[var(--accent)]" />
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>你的项目</CardTitle>
            <CardDescription>点开进入项目频道</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {projectChannels.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--line-soft)] p-6 text-center text-[12px] text-[var(--mute)]">
                还没有项目频道,点 sidebar 的 <span className="font-mono text-[var(--accent)]">+</span> 新建
              </div>
            ) : (
              projectChannels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickProject(c.id)}
                  className="group flex items-center justify-between rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
                      <span className="font-mono text-[var(--mute)]">#</span>
                      <span className="truncate">{c.name || '(未命名)'}</span>
                      {c.phase && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">{c.phase}</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--mute)]">{c.goal || '—'}</div>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-[var(--mute)] group-hover:text-[var(--accent)]" />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ShortcutRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex items-center justify-between rounded px-1 py-1 text-[12.5px] text-[var(--ink-2)]">
      <span>{label}</span>
      <span className="text-[11px] text-[var(--mute)]">{hint}</span>
    </div>
  )
}
