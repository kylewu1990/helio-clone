import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, AtSign, Briefcase, ChevronRight, Clock, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion'
import { cn } from '../../lib/cn'

type AgentData = Awaited<ReturnType<typeof api.agent>>

function TrustBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? 'var(--ok)' : value >= 60 ? 'var(--accent)' : value >= 40 ? 'var(--warn)' : 'var(--danger)'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[var(--mute)]">
        <span>{label}</span>
        <span className="text-[var(--ink-2)]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--glass-3)]">
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

export interface AgentProfileViewProps {
  agentId: string
  onBack: () => void
  onJumpChannel: (channelId: string) => void
}

export function AgentProfileView({ agentId, onBack, onJumpChannel }: AgentProfileViewProps) {
  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .agent(agentId)
      .then(setData)
      .catch((e: any) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [agentId])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--mute)]">
        加载 Agent profile…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-[var(--mute)]">
        <span>加载失败:{error ?? 'unknown'}</span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={13} />
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto h-full w-full max-w-[1100px] overflow-y-auto px-10 py-8">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
        <ArrowLeft size={13} />
        返回
      </Button>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        className="flex items-start gap-5"
      >
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl border border-[var(--line-soft)] font-display text-[36px] font-bold text-white shadow-[var(--shadow-1)]"
          style={{ background: `var(--identity-${((data.user.avatarColor ?? 9) % 12) + 1})` }}
        >
          {data.user.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[32px] font-semibold tracking-tight text-[var(--ink)]">
              {data.user.name}
            </h1>
            <Badge variant="accent">AI 助手</Badge>
            {data.user.preset && <Badge variant="default">{data.user.preset}</Badge>}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--mute)]">
            @{data.user.handle}
          </div>
          {data.persona.systemPromptSummary && (
            <p className="mt-3 max-w-[680px] text-[13px] leading-relaxed text-[var(--ink-2)]">
              {data.persona.systemPromptSummary}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.user.skills.map((s) => (
              <span
                key={s}
                className="rounded border border-[var(--line)] bg-[var(--glass-2)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--ink-3)]"
              >
                {s}
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-dashed border-[var(--line-soft)] bg-[var(--glass-2)] px-3 py-2 text-[12px] text-[var(--mute)]">
            <AtSign size={12} className="mr-1 inline-block" />
            这是只读资料卡。在项目频道里 @ {data.user.name} 派工。
          </div>
        </div>
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* 左:L2 记忆 + 当前任务 + 最近 Delivery */}
        <div className="flex flex-col gap-5">
          {data.activeTask && (
            <Card className="border-[var(--accent)]/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase size={14} className="text-[var(--accent)]" />
                  当前在做
                  <Badge variant="accent">{data.activeTask.status}</Badge>
                </CardTitle>
                <CardDescription>
                  在 #{data.activeTask.channel?.name ?? '?'} 频道
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-[14px] text-[var(--ink)]">{data.activeTask.title}</p>
                {data.activeTask.channel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onJumpChannel(data.activeTask!.channel!.id)}
                    className="mt-3 -ml-2"
                  >
                    去频道里 @ ta
                    <ChevronRight size={13} />
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>项目记忆(L2 / L3)</CardTitle>
              <CardDescription>{data.projectMemories.length} 个项目的记忆条目</CardDescription>
            </CardHeader>
            <CardContent>
              {data.projectMemories.length === 0 ? (
                <div className="text-[12px] text-[var(--mute)]">还没有项目记忆</div>
              ) : (
                <Accordion type="multiple" defaultValue={[data.projectMemories[0].channelId]}>
                  {data.projectMemories.map((m) => (
                    <AccordionItem key={m.channelId} value={m.channelId}>
                      <AccordionTrigger>
                        <span className="flex items-center gap-2 text-[13.5px]">
                          <span className="font-mono text-[var(--mute)]">#</span>
                          {m.channelName}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {m.l2 && (
                            <div>
                              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                                L2 · 项目长期
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                                {m.l2.content.slice(0, 600)}
                                {m.l2.content.length > 600 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          {m.l3 && (
                            <div>
                              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                                L3 · 滚动情节
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                                {m.l3.content.slice(0, 400)}
                                {m.l3.content.length > 400 ? '…' : ''}
                              </p>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onJumpChannel(m.channelId)}
                            className="mt-1 -ml-2"
                          >
                            去这个项目 <ChevronRight size={13} />
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>近期交付</CardTitle>
              <CardDescription>最近 5 条 Delivery</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentDeliveries.length === 0 ? (
                <div className="text-[12px] text-[var(--mute)]">还没有交付</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.recentDeliveries.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-[var(--ink)]">{d.title}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--mute)]">
                          <Clock size={10} className="mr-1 inline-block" />
                          {new Date(d.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                      <Badge
                        variant={
                          d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'default'
                        }
                      >
                        {d.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右:信任分级 + 活跃项目 */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--accent)]" />
                信任分级
              </CardTitle>
              <CardDescription>基于历史表现</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TrustBar label="自动度" value={data.trust.autonomy} />
              <TrustBar label="准确率" value={data.trust.accuracy} />
              <TrustBar label="对话流畅" value={data.trust.fluency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>活跃项目</CardTitle>
              <CardDescription>在 {data.activeChannels.length} 个项目里活跃</CardDescription>
            </CardHeader>
            <CardContent>
              {data.activeChannels.length === 0 ? (
                <div className="text-[12px] text-[var(--mute)]">还没进任何项目频道</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {data.activeChannels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onJumpChannel(c.id)}
                      className={cn(
                        'group flex items-center justify-between rounded px-2 py-1.5 text-left text-[12.5px] transition-colors',
                        'hover:bg-[var(--accent-soft)]',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[var(--mute)]">#</span>
                        <span className="truncate text-[var(--ink)]">{c.name}</span>
                        {c.phase && (
                          <span className="font-mono text-[10px] uppercase text-[var(--accent)]">
                            {c.phase}
                          </span>
                        )}
                      </div>
                      <ChevronRight size={13} className="text-[var(--mute)]" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
