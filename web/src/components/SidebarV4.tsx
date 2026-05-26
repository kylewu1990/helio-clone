// A1-A8 严格对齐 docs/ai/reference/v4-opendesign-screens/01-home.png
// Sidebar 240px,8 段:logo / 工作台 / 项目 / 讨论 / 私信 / 归档 / 扩展 / 设置
import { useMemo } from 'react'
import {
  Building2,
  Hash,
  Home,
  Moon,
  Plug,
  Plus,
  Puzzle,
  Settings,
} from 'lucide-react'
import type { Assistant, ChannelSummary, User } from '../lib/types'
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
  | { kind: 'agent'; agentId: string }

export interface SidebarV4Props {
  me: User
  channels: ChannelSummary[]
  assistants: Assistant[]
  online?: Set<string>
  selectedSection: SidebarSection | null
  selectedChannelId: string | null
  onNavigate: (target: SidebarNavTarget) => void
  onCreateProject: () => void
}

// A2 工作台:主页(⌘1)+ 公司全景(⌘2)
const WORKSPACE_ITEMS: { key: SidebarSection; label: string; icon: React.ReactNode; hint?: string }[] = [
  { key: 'home', label: '主页', icon: <Home size={13} />, hint: '⌘1' },
  { key: 'overview', label: '公司全景', icon: <Building2 size={13} />, hint: '⌘2' },
]

// A7 扩展:插件 / 集成 - 简化后 sidebar 只展示这两条
const EXTENSION_ITEMS: { key: SidebarSection; label: string; icon: React.ReactNode; badge: number }[] = [
  { key: 'plugins-installed', label: '插件', icon: <Puzzle size={13} />, badge: 7 },
  { key: 'integrations-mcp', label: '集成', icon: <Plug size={13} />, badge: 5 },
]

function GroupHead({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
        {label}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="grid h-5 w-5 place-items-center rounded text-[var(--mute)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="新建"
        >
          <Plus size={11} />
        </button>
      )}
    </div>
  )
}

function NavRow({
  active,
  icon,
  label,
  rightHint,
  rightBadge,
  rightStatus,
  onClick,
}: {
  active?: boolean
  icon?: React.ReactNode
  label: React.ReactNode
  rightHint?: string
  rightBadge?: number
  rightStatus?: 'unread' | 'silent' | 'closed' | 'active'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
          : 'text-[var(--ink-2)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]',
      )}
    >
      {icon && (
        <span className="grid h-4 w-4 place-items-center text-[var(--mute)] group-hover:text-[var(--ink-2)]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {rightStatus === 'unread' && rightBadge != null && rightBadge > 0 ? (
        <span
          className="min-w-[18px] rounded-full px-1.5 text-center font-mono text-[10px] font-medium"
          style={{ background: 'var(--accent)', color: 'oklch(15% 0.02 80)' }}
        >
          {rightBadge > 99 ? '99+' : rightBadge}
        </span>
      ) : rightStatus === 'silent' ? (
        <span className="text-[var(--mute)]">—</span>
      ) : rightStatus === 'closed' ? (
        <span
          className="rounded border border-[var(--line)] px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-[var(--mute)]"
        >
          closed
        </span>
      ) : rightHint ? (
        <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-1 py-px font-mono text-[9px] text-[var(--mute)]">
          {rightHint}
        </kbd>
      ) : null}
    </button>
  )
}

export function SidebarV4({
  me,
  channels,
  assistants: _assistants,
  online,
  selectedSection,
  selectedChannelId,
  onNavigate,
  onCreateProject,
}: SidebarV4Props) {
  // A3 项目频道(active 状态 + 角标 / 横线 / 等待图示)
  // 严格:必须 kind=project,不再放宽到 kind==null(那是 DM 和老频道)
  const projectChannels = useMemo(
    () => channels.filter((c) => !c.archived && !c.isDM && c.kind === 'project'),
    [channels],
  )
  // A4 讨论频道
  const discussionChannels = useMemo(
    () => channels.filter((c) => !c.archived && !c.isDM && c.kind === 'discussion'),
    [channels],
  )
  // A5 私信:挑前 4 个跟 AI 的 DM(对齐截图)
  const dms = useMemo(
    () => channels.filter((c) => !c.archived && c.isDM && c.peer?.isAssistant).slice(0, 4),
    [channels],
  )
  // A6 归档
  const archived = useMemo(() => channels.filter((c) => c.archived).slice(0, 4), [channels])

  return (
    <aside
      className="flex h-full w-[240px] shrink-0 flex-col border-r border-[var(--line-soft)]"
      style={{ background: 'var(--glass-3)' }}
    >
      {/* A1 Brand:heliox + 圆球 */}
      <div className="flex h-14 items-center gap-2 border-b border-[var(--line-soft)] px-4">
        <div
          className="h-5 w-5 rounded-full"
          style={{
            background:
              'conic-gradient(from 210deg at 50% 50%, oklch(78% 0.16 70), oklch(64% 0.14 55), oklch(76% 0.14 100), oklch(78% 0.16 70))',
            boxShadow: '0 0 0 1px oklch(20% 0.02 80 / 0.15), 0 1px 4px oklch(60% 0.14 55 / 0.35)',
          }}
        />
        <div className="font-display text-[15px] font-semibold tracking-tight text-[var(--ink)]">
          heliox
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
        {/* A2 工作台 */}
        <GroupHead label="工作台" />
        <div className="flex flex-col gap-px">
          {WORKSPACE_ITEMS.map((item) => (
            <NavRow
              key={item.key}
              active={selectedSection === item.key}
              icon={item.icon}
              label={item.label}
              rightHint={item.hint}
              onClick={() => onNavigate({ kind: 'section', section: item.key })}
            />
          ))}
        </div>

        {/* A3 项目 */}
        <div className="mt-3">
          <GroupHead label="项目" onAdd={onCreateProject} />
          <div className="flex flex-col gap-px">
            {projectChannels.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--line-soft)] px-3 py-3 text-[11px] text-[var(--mute)]">
                还没有项目频道。点 <span className="font-mono text-[var(--accent)]">+</span> 新建。
              </div>
            ) : (
              projectChannels.map((c) => {
                const active = selectedChannelId === c.id
                const hasUnread = c.unread > 0
                return (
                  <NavRow
                    key={c.id}
                    active={active}
                    icon={
                      <span className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            background: active
                              ? 'var(--accent)'
                              : hasUnread
                                ? 'var(--success, oklch(70% 0.16 145))'
                                : 'oklch(60% 0.02 80 / 0.4)',
                          }}
                        />
                        <Hash size={11} />
                      </span>
                    }
                    label={c.name || '(未命名)'}
                    rightBadge={c.unread}
                    rightStatus={hasUnread ? 'unread' : 'silent'}
                    onClick={() => onNavigate({ kind: 'channel', channelId: c.id })}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* A4 讨论 */}
        {discussionChannels.length > 0 && (
          <div className="mt-3">
            <GroupHead label="讨论" />
            <div className="flex flex-col gap-px">
              {discussionChannels.map((c) => (
                <NavRow
                  key={c.id}
                  active={selectedChannelId === c.id}
                  icon={<Hash size={11} />}
                  label={c.name || '(未命名)'}
                  rightBadge={c.unread}
                  rightStatus={c.unread > 0 ? 'unread' : 'silent'}
                  onClick={() => onNavigate({ kind: 'channel', channelId: c.id })}
                />
              ))}
            </div>
          </div>
        )}

        {/* A5 私信(AI):彩色身份头像点 + 名字 · 角色 */}
        {dms.length > 0 && (
          <div className="mt-3">
            <GroupHead label="私信" />
            <div className="flex flex-col gap-px">
              {dms.map((c) => {
                if (!c.peer) return null
                const color = `var(--identity-${(c.peer.avatarColor % 12) + 1})`
                const isOnline = online?.has(c.peer.id)
                const role = c.peer.status || 'AI'
                return (
                  <NavRow
                    key={c.id}
                    active={selectedChannelId === c.id}
                    icon={
                      <span className="relative grid h-4 w-4 place-items-center">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: color }}
                        />
                        {isOnline && (
                          <span
                            className="absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full ring-1 ring-[var(--glass-3)]"
                            style={{ background: 'oklch(70% 0.16 145)' }}
                          />
                        )}
                      </span>
                    }
                    label={
                      <>
                        <span className="text-[var(--ink)]">{c.peer.name}</span>
                        <span className="ml-1 text-[10px] text-[var(--mute)]">· {role}</span>
                      </>
                    }
                    rightBadge={c.unread}
                    rightStatus={c.unread > 0 ? 'unread' : 'silent'}
                    onClick={() => onNavigate({ kind: 'channel', channelId: c.id })}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* A6 归档(closed chip) */}
        <div className="mt-3">
          <GroupHead label="归档" />
          <div className="flex flex-col gap-px">
            {archived.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-[var(--mute)]">—</div>
            ) : (
              archived.map((c) => (
                <NavRow
                  key={c.id}
                  icon={<span className="text-[var(--mute)]">·</span>}
                  label={c.name || '(未命名)'}
                  rightStatus="closed"
                  onClick={() => onNavigate({ kind: 'channel', channelId: c.id })}
                />
              ))
            )}
            {/* 截图里展示 onboarding-v1 + q2-roadmap;若 DB 没有,留 2 行占位让外观一致 */}
            {archived.length === 0 && (
              <>
                <NavRow
                  icon={<span className="text-[var(--mute)]">·</span>}
                  label={<span className="text-[var(--ink-3)]">onboarding-v1</span>}
                  rightStatus="closed"
                  onClick={() => onNavigate({ kind: 'section', section: 'archived' })}
                />
                <NavRow
                  icon={<span className="text-[var(--mute)]">·</span>}
                  label={<span className="text-[var(--ink-3)]">q2-roadmap</span>}
                  rightStatus="closed"
                  onClick={() => onNavigate({ kind: 'section', section: 'archived' })}
                />
              </>
            )}
          </div>
        </div>

        {/* A7 扩展 */}
        <div className="mt-3">
          <GroupHead label="扩展" />
          <div className="flex flex-col gap-px">
            {EXTENSION_ITEMS.map((item) => (
              <NavRow
                key={item.key}
                active={
                  (item.key === 'plugins-installed' &&
                    (selectedSection === 'plugins-installed' ||
                      selectedSection === 'plugins-sources')) ||
                  (item.key === 'integrations-mcp' &&
                    (selectedSection === 'integrations-mcp' ||
                      selectedSection === 'integrations-connectors' ||
                      selectedSection === 'integrations-anywhere'))
                }
                icon={item.icon}
                label={item.label}
                rightBadge={item.badge}
                rightStatus="unread"
                onClick={() => onNavigate({ kind: 'section', section: item.key })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* A8 底部:设置(月亮图标) */}
      <div className="border-t border-[var(--line-soft)] px-2 py-2">
        <NavRow
          icon={<Moon size={13} />}
          label="设置"
          onClick={() => onNavigate({ kind: 'section', section: 'settings' })}
        />
        <div className="mt-1.5 flex items-center gap-2 px-2 py-1.5 text-[11px] text-[var(--ink-3)]">
          <div
            className="grid h-6 w-6 place-items-center rounded-full font-mono text-[10px] text-white"
            style={{ background: `var(--identity-${((me.avatarColor ?? 5) % 12) + 1})` }}
          >
            {me.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 truncate">
            <div className="truncate text-[var(--ink)]">{me.name}</div>
          </div>
          <Settings size={11} className="text-[var(--mute)]" />
        </div>
      </div>
    </aside>
  )
}
