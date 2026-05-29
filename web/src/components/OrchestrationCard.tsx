import { Loader2, Check, AlertTriangle, Users } from 'lucide-react'
import type { RunEvent } from '../lib/types'

// Phase T / M3:编排式多 AI deck —— 把一个 GenerationJob 的 run 事件按角色分泳道展示。
// 角色:plan(导演拆角色)/ content / data / visual(主笔)/ critic。
// 每泳道 = 角色标签 + 该角色最新动作标题 + 状态(进行中/完成/失败)。
// 数据源:RunEvent(kind='stage' 且带 role),由后端 runDeckJob 的 plan→fan-out→compose 各阶段 emit。
// 复用 ChannelCards 的玻璃面 + aurora-bar 动效语言,保持频道时间线视觉一致。

const ROLE_META: Record<string, { label: string; color: string; order: number }> = {
  plan: { label: '导演 · 拆角色', color: 'var(--info)', order: 0 },
  content: { label: '内容 AI', color: 'var(--accent)', order: 1 },
  data: { label: '数据 AI', color: 'var(--warning)', order: 2 },
  visual: { label: '视觉 AI · 主笔', color: 'var(--success)', order: 3 },
  critic: { label: '评审 AI', color: 'var(--accent-text)', order: 4 },
}

type Lane = { role: string; title: string; status: string | null }

export function OrchestrationCard({ events }: { events: RunEvent[] }) {
  const stageEvents = events.filter((e) => e.kind === 'stage' && e.role)
  if (stageEvents.length === 0) return null

  // 每角色取最新一条事件(后端按时间序 emit;此处 events 已升序)
  const byRole = new Map<string, Lane>()
  for (const e of stageEvents) {
    byRole.set(e.role as string, { role: e.role as string, title: e.title, status: e.status })
  }
  const lanes = [...byRole.values()].sort(
    (a, b) => (ROLE_META[a.role]?.order ?? 9) - (ROLE_META[b.role]?.order ?? 9),
  )
  const anyRunning = lanes.some((l) => l.status === 'running')

  return (
    <div
      className="mt-1 max-w-xl overflow-hidden rounded-[var(--radius-lg)] border"
      style={{
        borderColor: 'color-mix(in oklch, var(--accent) 30%, var(--border))',
        background: anyRunning ? 'var(--glass-surface)' : 'var(--surface-2)',
        backdropFilter: anyRunning ? 'blur(8px)' : undefined,
      }}
    >
      {/* 顶部:多 AI 协同标识 + 角色数 */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
        >
          <Users size={12} />
        </span>
        <span className="text-[12px] font-semibold text-[var(--accent-text)]">多 AI 协同出 deck</span>
        <span className="ml-auto shrink-0 text-[10.5px] text-[var(--text-tertiary)]">{lanes.length} 个角色</span>
      </div>

      {/* 泳道:每角色一行 */}
      <ol className="flex flex-col gap-1.5 px-3 py-2.5">
        {lanes.map((l) => {
          const meta = ROLE_META[l.role] ?? { label: l.role, color: 'var(--text-tertiary)', order: 9 }
          const running = l.status === 'running'
          return (
            <li key={l.role} className="flex items-center gap-2 text-[11.5px]">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${running ? 'agent-pulse-ring' : ''}`}
                style={{ color: meta.color, background: `color-mix(in oklch, ${meta.color} 16%, transparent)` }}
              >
                {running ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : l.status === 'error' ? (
                  <AlertTriangle size={10} />
                ) : (
                  <Check size={10} />
                )}
              </span>
              <span className="shrink-0 font-medium" style={{ color: meta.color, minWidth: 88 }}>
                {meta.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{l.title}</span>
            </li>
          )
        })}
      </ol>

      {/* 运行中:底部 aurora shimmer —— 与 ProgressCard 同语言,表达「多 AI 正在并行干活」 */}
      {anyRunning && <div className="aurora-bar h-1 w-full" aria-hidden />}
    </div>
  )
}
