import {
  Columns2,
  Hash,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelRightClose,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { formatDayDivider } from '../lib/format'
import type { ChannelDetail, RunEvent } from '../lib/types'

export function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
      style={{ color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

export function SelectModeBar({
  count,
  confirm,
  onAll,
  onClear,
  onConfirm,
  onCommit,
  onCancel,
  onExit,
}: {
  count: number
  confirm: boolean
  onAll: () => void
  onClear: () => void
  onConfirm: () => void
  onCommit: () => void
  onCancel: () => void
  onExit: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--chrome-frame)] px-5 py-2 text-sm">
      <span className="text-[var(--text-secondary)]">已选 {count} 条</span>
      <button onClick={onAll} className="text-[var(--accent-text)]">全选</button>
      <button onClick={onClear} className="text-[var(--text-tertiary)]">清空</button>
      <div className="ml-auto flex items-center gap-2">
        {confirm ? (
          <>
            <span className="text-[var(--text-secondary)]">删除选中的 {count} 条?不可恢复</span>
            <button onClick={onCommit} className="rounded px-2 py-1 text-xs font-medium text-white" style={{ background: 'var(--destructive)' }}>确认删除</button>
            <button onClick={onCancel} className="text-[var(--text-tertiary)]">取消</button>
          </>
        ) : (
          <>
            <button
              onClick={() => count && onConfirm()}
              disabled={!count}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium disabled:opacity-40"
              style={{ color: 'var(--destructive)' }}
            >
              <Trash2 size={14} /> 删除
            </button>
            <button onClick={onExit} title="退出多选" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// 工作区分栏:预设比例 + 全屏预览。
export function SplitControls({
  fullscreen,
  onPreset,
  onToggleFullscreen,
}: {
  fullscreen: boolean
  onPreset: (dockFrac: number) => void
  onToggleFullscreen: () => void
}) {
  return (
    <div className="hidden shrink-0 items-center gap-0.5 lg:flex">
      <SplitBtn title="聊天为主 70 / 30" onClick={() => onPreset(0.3)}>
        <PanelLeftClose size={14} />
      </SplitBtn>
      <SplitBtn title="均分 50 / 50" onClick={() => onPreset(0.5)}>
        <Columns2 size={14} />
      </SplitBtn>
      <SplitBtn title="预览为主 30 / 70" onClick={() => onPreset(0.68)}>
        <PanelRightClose size={14} />
      </SplitBtn>
      <SplitBtn title={fullscreen ? '退出全屏预览' : '全屏预览'} onClick={onToggleFullscreen} active={fullscreen}>
        {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </SplitBtn>
    </div>
  )
}

function SplitBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)]"
      style={{
        color: active ? 'var(--accent-text)' : 'var(--text-tertiary)',
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

// 左侧聊天的轻量运行过程卡:执行中显示当前阶段 + 最近 2-3 步动作,点开看完整过程。
export function RunStatusCard({ events, onOpen }: { events: RunEvent[]; onOpen: () => void }) {
  if (!events.length) return null
  const last = events[events.length - 1]
  const recent = events.slice(-3)
  const running = last.status === 'running'
  return (
    <button
      onClick={onOpen}
      className="mx-4 mb-1 flex items-start gap-2.5 rounded-[var(--radius-lg)] border px-3 py-2 text-left transition-colors hover:bg-[var(--hover)]"
      style={{
        borderColor: 'color-mix(in oklch, var(--accent) 28%, var(--border))',
        background: 'var(--accent-soft)',
      }}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--accent-text)]">
        {running ? <Loader2 size={13} className="animate-spin" /> : <Columns2 size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">{last.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {recent.map((e) => (
            <span key={e.id} className="truncate text-[10.5px] text-[var(--text-tertiary)]">
              {e.tool ?? e.kind} · {e.status === 'error' ? '失败' : e.status === 'running' ? '进行中' : '完成'}
            </span>
          ))}
        </div>
      </div>
      <span className="shrink-0 self-center text-[10.5px] font-medium text-[var(--accent-text)]">查看过程</span>
    </button>
  )
}

export function ActivityBar({
  activity,
  typingNames,
  onStop,
}: {
  activity: string[]
  typingNames: string[]
  onStop: () => void
}) {
  const aiBusy = activity.length > 0
  const lines = [...activity]
  if (typingNames.length) {
    lines.push(
      typingNames.length === 1
        ? `${typingNames[0]} 正在输入…`
        : `${typingNames.slice(0, 2).join('、')}${typingNames.length > 2 ? ' 等' : ''} 正在输入…`,
    )
  }
  if (lines.length === 0) return <div className="h-5" />
  return (
    <div className="flex min-h-5 items-center gap-2 px-6 py-0.5 text-xs">
      <span className="flex gap-0.5 text-[var(--accent-text)]">
        <Dot d={0} />
        <Dot d={150} />
        <Dot d={300} />
      </span>
      <span className="truncate text-[var(--text-tertiary)]">{lines.join(' · ')}</span>
      {aiBusy && (
        <button
          onClick={onStop}
          title="停止所有 AI 生成"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
        >
          <Square size={9} style={{ fill: 'currentColor' }} /> 停止
        </button>
      )}
    </div>
  )
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="inline-block h-1 w-1 animate-pulse rounded-full"
      style={{ background: 'currentColor', animationDelay: `${d}ms` }}
    />
  )
}

export function ChannelIntro({ detail }: { detail: ChannelDetail }) {
  if (detail.isDM) {
    if (!detail.peer) return null
    return (
      <div className="mb-4 flex flex-col items-start gap-2 pb-2">
        <Avatar user={detail.peer} size={48} />
        <div className="text-lg font-semibold text-[var(--text-primary)]">{detail.peer.name}</div>
        <p className="text-sm text-[var(--text-tertiary)]">这是你和 {detail.peer.name} 的私信开端。</p>
      </div>
    )
  }
  return (
    <div className="mb-4 pb-2">
      <div className="mb-1 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
        >
          <Hash size={18} />
        </div>
        <span className="text-lg font-semibold text-[var(--text-primary)]">{detail.name}</span>
      </div>
      <p className="text-sm text-[var(--text-tertiary)]">
        这是 #{detail.name} 频道的开端。{detail.topic}
      </p>
    </div>
  )
}

export function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-xs font-medium text-[var(--text-tertiary)]">{formatDayDivider(iso)}</span>
      <div className="h-px flex-1 bg-[var(--border)]" />
    </div>
  )
}
