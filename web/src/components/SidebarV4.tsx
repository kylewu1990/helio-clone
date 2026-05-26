import { useMemo } from 'react'
import {
  Archive,
  Building2,
  Compass,
  Hash,
  Home,
  KeyRound,
  Layers,
  Plug,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react'
import type { ChannelSummary, User } from '../lib/types'
import { cn } from '../lib/cn'

export type SidebarSection =
  | 'home'
  | 'overview'
  | 'projects'
  | 'archived'
  | 'guide'
  | 'plugins-installed'
  | 'plugins-sources'
  | 'integrations-mcp'
  | 'integrations-connectors'
  | 'integrations-anywhere'
  | 'settings'

export type SidebarNavTarget =
  | { kind: 'section'; section: SidebarSection }
  | { kind: 'channel'; channelId: string }

export interface SidebarV4Props {
  me: User
  channels: ChannelSummary[]
  selectedSection: SidebarSection | null
  selectedChannelId: string | null
  onNavigate: (target: SidebarNavTarget) => void
  onCreateProject: () => void
  onOpenCommandPalette: () => void
}

const WORKSPACE_ITEMS: { key: SidebarSection; label: string; icon: React.ReactNode }[] = [
  { key: 'home', label: '主页', icon: <Home size={14} /> },
  { key: 'overview', label: '公司全景', icon: <Building2 size={14} /> },
  { key: 'projects', label: '项目列表', icon: <Layers size={14} /> },
  { key: 'archived', label: '归档', icon: <Archive size={14} /> },
  { key: 'guide', label: '引导', icon: <Compass size={14} /> },
]

const PLUGIN_ITEMS: { key: SidebarSection; label: string }[] = [
  { key: 'plugins-installed', label: '已装' },
  { key: 'plugins-sources', label: '订阅源' },
]

const INTEGRATION_ITEMS: { key: SidebarSection; label: string }[] = [
  { key: 'integrations-mcp', label: 'MCP' },
  { key: 'integrations-connectors', label: '连接器' },
  { key: 'integrations-anywhere', label: 'Anywhere' },
]

function GroupHead({
  label,
  onAdd,
}: {
  label: string
  onAdd?: () => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--mute)]">
        {label}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="grid h-5 w-5 place-items-center rounded text-[var(--mute)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="新建"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  )
}

function NavItem({
  active,
  icon,
  label,
  hint,
  badge,
  onClick,
}: {
  active?: boolean
  icon?: React.ReactNode
  label: string
  hint?: React.ReactNode
  badge?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group grid w-full grid-cols-[18px_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
          : 'text-[var(--ink-2)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]',
      )}
    >
      <span className="grid place-items-center text-[var(--mute)] group-hover:text-[var(--ink-2)]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {badge ?? hint ?? null}
    </button>
  )
}

export function SidebarV4({
  me,
  channels,
  selectedSection,
  selectedChannelId,
  onNavigate,
  onCreateProject,
  onOpenCommandPalette,
}: SidebarV4Props) {
  const projectChannels = useMemo(
    () =>
      channels
        .filter((c) => !c.archived && (c.kind === 'project' || c.kind == null))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [channels],
  )

  return (
    <aside
      className="flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--line-soft)] backdrop-blur"
      style={{ background: 'var(--glass-3)' }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-[var(--line-soft)] px-3">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 rounded-md"
            style={{
              background:
                'conic-gradient(from 210deg at 50% 50%, oklch(78% 0.16 70), oklch(64% 0.14 55), oklch(76% 0.14 100), oklch(78% 0.16 70))',
              boxShadow: '0 0 0 1px oklch(20% 0.02 80 / 0.1), 0 2px 6px oklch(60% 0.14 55 / 0.3)',
            }}
          />
          <div className="font-display text-[14px] font-semibold tracking-tight text-[var(--ink)]">
            Heliox<span className="text-[var(--accent)]">·</span>
            <span className="text-[var(--ink-2)]">AI 工作台</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex w-full items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--glass-2)] px-2.5 py-1.5 text-left text-[12.5px] text-[var(--mute)] hover:border-[var(--line-strong)] hover:text-[var(--ink-2)]"
        >
          <Search size={13} />
          <span className="flex-1">搜索 / 频道</span>
          <kbd className="rounded border border-[var(--line)] bg-[var(--glass-2)] px-1.5 py-px font-mono text-[10px] text-[var(--mute)]">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* 工作台 */}
        <div className="px-3">
          <GroupHead label="工作台" />
          <div className="flex flex-col gap-px">
            {WORKSPACE_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                active={selectedSection === item.key}
                icon={item.icon}
                label={item.label}
                onClick={() => onNavigate({ kind: 'section', section: item.key })}
              />
            ))}
          </div>
        </div>

        {/* 项目 */}
        <div className="mt-3 px-3">
          <GroupHead label="项目" onAdd={onCreateProject} />
          <div className="flex flex-col gap-px">
            {projectChannels.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--line-soft)] px-3 py-3 text-[12px] text-[var(--mute)]">
                还没有项目频道。点上方 <span className="font-mono text-[var(--accent)]">+</span> 新建第一个。
              </div>
            ) : (
              projectChannels.map((c) => {
                const active = selectedChannelId === c.id
                return (
                  <NavItem
                    key={c.id}
                    active={active}
                    icon={<Hash size={12} className="text-[var(--mute)]" />}
                    label={c.name || '(未命名)'}
                    hint={
                      c.unread > 0 ? (
                        <span
                          className="ml-auto min-w-[18px] rounded-full px-1.5 text-center font-mono text-[10px]"
                          style={{ background: 'var(--accent)', color: 'oklch(15% 0.02 80)' }}
                        >
                          {c.unread > 99 ? '99+' : c.unread}
                        </span>
                      ) : c.phase ? (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                          {c.phase.slice(0, 4)}
                        </span>
                      ) : undefined
                    }
                    onClick={() => onNavigate({ kind: 'channel', channelId: c.id })}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* 插件 */}
        <div className="mt-3 px-3">
          <GroupHead label="插件" />
          <div className="flex flex-col gap-px">
            {PLUGIN_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                active={selectedSection === item.key}
                icon={<Plug size={12} />}
                label={item.label}
                onClick={() => onNavigate({ kind: 'section', section: item.key })}
              />
            ))}
          </div>
        </div>

        {/* 集成 */}
        <div className="mt-3 px-3">
          <GroupHead label="集成" />
          <div className="flex flex-col gap-px">
            {INTEGRATION_ITEMS.map((item) => (
              <NavItem
                key={item.key}
                active={selectedSection === item.key}
                icon={
                  item.key === 'integrations-mcp' ? (
                    <KeyRound size={12} />
                  ) : item.key === 'integrations-connectors' ? (
                    <Sparkles size={12} />
                  ) : (
                    <Compass size={12} />
                  )
                }
                label={item.label}
                onClick={() => onNavigate({ kind: 'section', section: item.key })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer:settings + me */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--line-soft)] px-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className="grid h-7 w-7 place-items-center rounded-full border border-[var(--line-soft)] font-mono text-[11px] text-white"
            style={{
              background: `var(--identity-${(me.avatarColor ?? 9) % 12 + 1})`,
            }}
          >
            {me.name.slice(0, 1)}
          </div>
          <div className="min-w-0 text-[12.5px]">
            <div className="truncate text-[var(--ink)]">{me.name}</div>
            <div className="truncate text-[11px] text-[var(--mute)]">{me.handle ? `@${me.handle}` : ''}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'section', section: 'settings' })}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="设置"
        >
          <Settings size={14} />
        </button>
      </div>
    </aside>
  )
}
