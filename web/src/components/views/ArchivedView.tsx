import { useMemo, useState } from 'react'
import { Archive, RotateCcw, Hash, Lock, Users as UsersIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import type { ChannelSummary } from '../../lib/types'

// K4 ArchivedView — 列出归档频道(Channel WHERE archivedAt IS NOT NULL),
// 可一键"恢复"(PATCH /api/channels/:id { archived: false })。
// 数据源:App 已加载的 channels(每条都带 archived/lastMessageAt),前端 filter 即可。
export function ArchivedView({
  channels,
  onRefreshChannels,
  onOpenChannel,
}: {
  channels: ChannelSummary[]
  onRefreshChannels: () => Promise<ChannelSummary[]> | void
  onOpenChannel?: (channelId: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null) // 正在恢复中的 channelId

  const archived = useMemo(
    () => channels.filter((c) => c.archived).sort((a, b) => {
      const at = new Date(a.lastMessageAt ?? 0).getTime()
      const bt = new Date(b.lastMessageAt ?? 0).getTime()
      return bt - at
    }),
    [channels],
  )

  const projects = archived.filter((c) => !c.isDM)
  const dms = archived.filter((c) => c.isDM)

  async function restore(id: string, name: string) {
    setBusy(id)
    try {
      await api.patchChannel(id, { archived: false })
      toast.success(`已恢复 #${name}`)
      await onRefreshChannels()
    } catch (e) {
      toast.error(`恢复失败:${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto h-full w-full max-w-[1200px] overflow-y-auto px-10 py-8">
      <div className="mb-2 flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
        <Archive size={11} /> Archive
      </div>
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-[var(--ink)]">
        归档
      </h1>
      <p className="mt-1 text-[13px] text-[var(--ink-3)]">
        归档共 <span className="font-medium text-[var(--ink)]">{archived.length}</span> 个频道
        {projects.length > 0 && <span> · 项目 {projects.length}</span>}
        {dms.length > 0 && <span> · 私信 {dms.length}</span>}
        。可点恢复 → 频道返回 sidebar;数据不会被删除。
      </p>

      {archived.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-3 text-[13px] text-[var(--mute)]">
          <Archive size={28} strokeWidth={1.4} />
          <span>暂无归档频道。频道设置里点"归档"会进这里。</span>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2.5">
          {archived.map((c) => (
            <ArchivedRow
              key={c.id}
              channel={c}
              busy={busy === c.id}
              onRestore={() => restore(c.id, c.name)}
              onOpen={onOpenChannel ? () => onOpenChannel(c.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ArchivedRow({
  channel,
  busy,
  onRestore,
  onOpen,
}: {
  channel: ChannelSummary
  busy: boolean
  onRestore: () => void
  onOpen?: () => void
}) {
  const icon = channel.isDM ? (
    <UsersIcon size={13} />
  ) : channel.isPrivate ? (
    <Lock size={13} />
  ) : (
    <Hash size={13} />
  )
  const last = channel.lastMessageAt ? new Date(channel.lastMessageAt) : null
  const days = last ? Math.floor((Date.now() - last.getTime()) / (24 * 3600 * 1000)) : null
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--glass-2)] text-[var(--ink-2)]">
        {icon}
      </span>
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-[var(--ink)]">
            {channel.isDM ? '私信:' : '#'}{channel.name}
          </span>
          {channel.kind && (
            <span className="rounded border border-[var(--line-soft)] bg-[var(--glass-2)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--mute)]">
              {channel.kind}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--mute)]">
          {channel.topic && <span className="truncate">{channel.topic}</span>}
          {days != null && <span>· 最后活跃 {days === 0 ? '今天' : `${days}天前`}</span>}
          <span>· {channel.memberCount} 成员</span>
        </div>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onRestore}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
        恢复
      </button>
    </div>
  )
}
