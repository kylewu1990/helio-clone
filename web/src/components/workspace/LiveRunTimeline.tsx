import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Terminal as TerminalIcon,
  FileCode2,
  Globe,
  Hammer,
  PackageCheck,
  Wrench,
  Flag,
  Loader2,
  Check,
  AlertTriangle,
  Hand,
  ChevronDown,
} from 'lucide-react'
import type { RunEvent } from '../../lib/types'

// Live Run Timeline —— Heliox 自有「执行透明」语言:把后端实时广播的结构化 RunEvent
// 渲染成一条人话过程流(阶段 / 命令 / 文件 / 浏览器 / 构建 / 交付),执行中带脉冲,失败高亮。
// 原始日志仍在 Debug;这里是默认的「人能看懂」层。纯展示,数据全真。

const KIND_ICON: Record<string, React.ReactNode> = {
  stage: <Flag size={12} />,
  command: <TerminalIcon size={12} />,
  file: <FileCode2 size={12} />,
  browser: <Globe size={12} />,
  build: <Hammer size={12} />,
  delivery: <PackageCheck size={12} />,
  status: <Hand size={12} />,
  tool_start: <Wrench size={12} />,
  tool_result: <Wrench size={12} />,
  tool_error: <Wrench size={12} />,
}

const PHASE_LABEL: Record<string, string> = {
  understand: '理解需求',
  context: '读取上下文',
  write: '写入文件',
  verify: '运行验证',
  deliver: '生成交付',
  await: '等待你',
}

function statusColor(s: string | null): string {
  if (s === 'error') return 'var(--destructive)'
  if (s === 'running') return 'var(--info)'
  return 'var(--success)'
}

// 折叠 start→result 配对(P1.1):优先按 callId 精确配对(同一工具调用 start/result 同 callId);
// 无 callId 时降级到旧逻辑(按 tool 名找后续终态),避免多次同名 run_command 互相误折叠。
const TERMINAL_KINDS = ['command', 'file', 'browser', 'tool_result', 'tool_error']
function foldEvents(events: RunEvent[]): RunEvent[] {
  return events.filter((e, i) => {
    if (e.status !== 'running') return true
    if (e.callId) {
      // 之后是否有同 callId 的终态 → 有则隐藏这条 running
      return !events.some(
        (n, j) => j > i && n.callId === e.callId && (n.status === 'ok' || n.status === 'error'),
      )
    }
    if (!e.tool) return true
    for (let j = i + 1; j < events.length; j++) {
      const n = events[j]
      if (n.tool === e.tool && (n.status === 'ok' || n.status === 'error') && TERMINAL_KINDS.includes(n.kind))
        return false
    }
    return true
  })
}

export function LiveRunTimeline({
  events,
  compact = false,
  live = false,
}: {
  events: RunEvent[]
  compact?: boolean
  live?: boolean
}) {
  const folded = useMemo(() => foldEvents(events), [events])
  const endRef = useRef<HTMLDivElement>(null)
  // 执行中:有新事件就把时间线末尾滚入视野(block:'nearest' 只滚最近的可滚容器,不抢整页)
  useEffect(() => {
    if (live && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [folded.length, live])
  if (folded.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-center text-[12px] text-[var(--text-tertiary)]">
        {live ? '正在准备执行…过程会实时显示在这里。' : '本次执行还没有过程事件。'}
      </div>
    )
  }
  return (
    <ol className="relative flex flex-col">
      {folded.map((e, i) => (
        <EventRow key={e.id} ev={e} last={i === folded.length - 1} compact={compact} />
      ))}
      <div ref={endRef} />
    </ol>
  )
}

function EventRow({ ev, last, compact }: { ev: RunEvent; last: boolean; compact: boolean }) {
  const [open, setOpen] = useState(false)
  const color = statusColor(ev.status)
  const running = ev.status === 'running'
  const shot = ev.kind === 'browser' && ev.detail && /\/uploads\/[^\s)]+\.(png|jpg|jpeg|webp)/.test(ev.detail)
    ? ev.detail.match(/\/uploads\/[^\s)]+\.(?:png|jpg|jpeg|webp)/)![0]
    : null
  const code = (ev.kind === 'command' || ev.kind === 'file' || ev.kind === 'build') && ev.detail && !shot
  const longDetail = !!ev.detail && ev.detail.length > 160

  return (
    <li className="relative flex gap-2.5 pb-2.5 last:pb-0">
      {/* 连接线 + 节点 */}
      <div className="relative flex flex-col items-center">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${running ? 'agent-pulse-ring' : ''}`}
          style={{ color, background: `color-mix(in oklch, ${color} 15%, transparent)` }}
        >
          {running ? (
            <Loader2 size={11} className="animate-spin" />
          ) : ev.status === 'error' ? (
            <AlertTriangle size={11} />
          ) : ev.status === 'ok' && (ev.kind === 'stage' || ev.kind === 'status') ? (
            <Check size={11} />
          ) : (
            KIND_ICON[ev.kind] ?? <Wrench size={12} />
          )}
        </span>
        {!last && <span className="w-px flex-1 bg-[var(--border)]" style={{ minHeight: 10 }} />}
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium" style={{ color: running ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {ev.title}
          </span>
          {ev.phase && !compact && (
            <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium text-[var(--text-tertiary)]" style={{ background: 'var(--surface-3)' }}>
              {PHASE_LABEL[ev.phase] ?? ev.phase}
            </span>
          )}
          {typeof ev.durationMs === 'number' && ev.durationMs > 0 && (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">{fmtMs(ev.durationMs)}</span>
          )}
        </div>

        {ev.tool && !compact && (
          <code className="font-mono text-[10px] text-[var(--text-tertiary)]">{ev.tool}</code>
        )}

        {/* 截图证据缩略 */}
        {shot && (
          <a href={shot} target="_blank" rel="noreferrer" className="mt-1 block w-fit">
            <img src={shot} alt="截图" className="max-h-24 rounded-[var(--radius-md)] border border-[var(--border)] object-cover" />
          </a>
        )}

        {/* 命令 / 文件 / 构建:代码块(可折叠长内容) */}
        {code && (
          <div className="mt-1">
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-[var(--text-secondary)]"
              style={!open && longDetail ? { maxHeight: 84, overflow: 'hidden' } : undefined}
            >
              {ev.detail}
            </pre>
            {longDetail && (
              <button onClick={() => setOpen((v) => !v)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none' }} /> {open ? '收起' : '展开全部'}
              </button>
            )}
          </div>
        )}

        {/* 其它纯文本 detail */}
        {ev.detail && !code && !shot && (
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{ev.detail}</p>
        )}
      </div>
    </li>
  )
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}
