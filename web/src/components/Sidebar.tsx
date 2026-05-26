import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronRight, Hash, MessageSquare, Pencil, Plus, Rocket, Search, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import type {
  Assistant,
  ChannelSummary,
  ProjectPhase,
  SearchResult,
  User,
} from '../lib/types'

// v3 G1:项目频道阶段视觉(色 + 中文标签)。与 ProjectHeaderCard 共享。
export const PROJECT_PHASES: { key: NonNullable<ProjectPhase>; label: string; color: string }[] = [
  { key: 'discovery', label: '探索', color: 'var(--info)' },
  { key: 'build', label: '构建', color: 'var(--accent)' },
  { key: 'review', label: '评审', color: 'var(--warning)' },
  { key: 'ship', label: '上线', color: 'var(--success)' },
  { key: 'maintenance', label: '维护', color: 'var(--text-tertiary)' },
]

function UnreadBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <span
      className="ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold text-white"
      style={{ background: 'var(--accent)' }}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function Sidebar({
  open,
  onClose,
  me,
  users,
  channels,
  assistants,
  online,
  selectedId,
  onSelect,
  onCreateChannel,
  onOpenDM,
  onCreateAssistant,
  onEditAssistant,
  onDeleteAssistant,
  onDeleteChannel,
}: {
  open: boolean
  onClose: () => void
  me: User
  users: User[]
  channels: ChannelSummary[]
  assistants: Assistant[]
  online: Set<string>
  selectedId: string | null
  onSelect: (id: string, messageId?: string) => void
  // v3 G1:扩签名,kind 必填;kind='project' 时 goal+phase 必填
  onCreateChannel: (data: {
    name: string
    kind: 'project' | 'discussion' | 'random'
    goal?: string
    phase?: NonNullable<ProjectPhase>
  }) => void
  onOpenDM: (userId: string) => void
  onCreateAssistant: () => void
  onEditAssistant: (a: Assistant) => void
  onDeleteAssistant: (id: string) => void
  onDeleteChannel: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  // v3 G1:创建频道的多步状态(kind → name → goal/phase 仅 project 需要)
  const [creating, setCreating] = useState<null | 'discussion' | 'project'>(null)
  const [draft, setDraft] = useState('')
  const [draftGoal, setDraftGoal] = useState('')
  const [draftPhase, setDraftPhase] = useState<NonNullable<ProjectPhase>>('discovery')
  const [dmPicker, setDmPicker] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [confirmDelCh, setConfirmDelCh] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  // v3 G1:折叠状态(默认全展开)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // 搜索消息(防抖)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      api.search(q).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // v3 G1:4 段分组(项目 / 讨论 / 私信 / 归档)— 老频道(kind=null)进讨论
  const allChannels = channels.filter((c) => !c.isDM)
  const projectChannels = allChannels.filter((c) => c.kind === 'project' && !c.archived)
  const discussionChannels = allChannels.filter(
    (c) => (c.kind === 'discussion' || c.kind === 'random' || !c.kind) && !c.archived,
  )
  const archivedChannels = allChannels.filter((c) => c.archived)
  const dmList = channels.filter((c) => c.isDM && !c.peer?.isAssistant)

  const filtered = (list: ChannelSummary[]) =>
    query.trim()
      ? list.filter((c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : list

  const dmPeerIds = useMemo(
    () => new Set(dmList.map((d) => d.peer?.id)),
    [dmList],
  )

  const submitChannel = () => {
    if (!creating) return
    const name = draft.trim()
    if (!name) {
      setCreating(null)
      setDraft('')
      return
    }
    if (creating === 'project') {
      const goal = draftGoal.trim()
      if (!goal) return // 项目必须有目标(UI 上 placeholder 提示)
      onCreateChannel({ name, kind: 'project', goal, phase: draftPhase })
    } else {
      onCreateChannel({ name, kind: 'discussion' })
    }
    setDraft('')
    setDraftGoal('')
    setDraftPhase('discovery')
    setCreating(null)
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--chrome-frame)] max-md:fixed max-md:inset-y-0 max-md:left-14 max-md:z-40 max-md:shadow-xl max-md:transition-transform ${open ? 'max-md:translate-x-0' : 'max-md:-translate-x-[calc(100%+3.5rem)]'}`}
      >
      <header className="flex items-center gap-2 px-4 py-3.5">
        <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">
          Heliox · AI 工作台
        </h1>
      </header>

      <div className="relative px-3 pb-2">
        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--paper-mid)] px-2.5 py-1.5">
          <Search size={14} className="text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索消息 / 频道"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
        </div>
        {query.trim() && results.length > 0 && (
          <div className="absolute inset-x-3 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] py-1 shadow-xl">
            <div className="px-3 py-1 text-[10px] font-medium tracking-wide text-[var(--text-tertiary)] uppercase">
              消息结果
            </div>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onSelect(r.channelId, r.id)
                  setQuery('')
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-[var(--hover)]"
              >
                <span className="text-xs text-[var(--text-tertiary)]">
                  {r.isDM ? '' : '#'}
                  {r.channelName} · {r.author.name}
                </span>
                <span className="line-clamp-2 text-sm text-[var(--text-primary)]">
                  {r.body}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {/* v3 G1:[项目] 段 — kind=project 非归档,header 显示阶段角标 */}
        <SectionHeader
          label="项目"
          icon={<Rocket size={11} />}
          count={projectChannels.length}
          collapsed={collapsed.project}
          onToggle={() => setCollapsed((m) => ({ ...m, project: !m.project }))}
          onAdd={() => {
            setCreating(creating === 'project' ? null : 'project')
            setDmPicker(false)
          }}
        />
        {creating === 'project' && (
          <div className="mb-2 space-y-1.5 rounded-[var(--radius-md)] border border-[var(--accent-soft)] bg-[var(--surface-2)] p-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCreating(null)
                  setDraft('')
                  setDraftGoal('')
                }
              }}
              placeholder="项目频道名(如 efe-web 改版)"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <input
              value={draftGoal}
              onChange={(e) => setDraftGoal(e.target.value)}
              placeholder="目标(必填,200 字内)"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {PROJECT_PHASES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setDraftPhase(p.key)}
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-colors"
                  style={{
                    color: draftPhase === p.key ? 'white' : p.color,
                    background:
                      draftPhase === p.key ? p.color : `color-mix(in oklch, ${p.color} 10%, transparent)`,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={submitChannel}
                disabled={!draft.trim() || !draftGoal.trim()}
                className="flex-1 rounded-[var(--radius-md)] px-2 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                创建项目频道
              </button>
              <button
                onClick={() => {
                  setCreating(null)
                  setDraft('')
                  setDraftGoal('')
                }}
                className="rounded-[var(--radius-md)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)]"
              >
                取消
              </button>
            </div>
          </div>
        )}
        {!collapsed.project &&
          filtered(projectChannels).map((c) => (
            <ChannelRow
              key={c.id}
              c={c}
              selected={c.id === selectedId}
              confirmDel={confirmDelCh === c.id}
              onSelect={onSelect}
              onAskDel={() => setConfirmDelCh(c.id)}
              onConfirmDel={() => {
                onDeleteChannel(c.id)
                setConfirmDelCh(null)
              }}
              onCancelDel={() => setConfirmDelCh(null)}
            />
          ))}

        {/* v3 G1:[讨论] 段 — kind=discussion / random / 老 null 频道 */}
        <div className="mt-3">
          <SectionHeader
            label="讨论"
            icon={<MessageSquare size={11} />}
            count={discussionChannels.length}
            collapsed={collapsed.discussion}
            onToggle={() => setCollapsed((m) => ({ ...m, discussion: !m.discussion }))}
            onAdd={() => {
              setCreating(creating === 'discussion' ? null : 'discussion')
              setDmPicker(false)
            }}
          />
          {creating === 'discussion' && (
            <div className="mb-1 px-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitChannel()
                  if (e.key === 'Escape') {
                    setCreating(null)
                    setDraft('')
                  }
                }}
                onBlur={submitChannel}
                placeholder="新讨论频道名,回车创建"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none"
              />
            </div>
          )}
          {!collapsed.discussion &&
            filtered(discussionChannels).map((c) => (
              <ChannelRow
                key={c.id}
                c={c}
                selected={c.id === selectedId}
                confirmDel={confirmDelCh === c.id}
                onSelect={onSelect}
                onAskDel={() => setConfirmDelCh(c.id)}
                onConfirmDel={() => {
                  onDeleteChannel(c.id)
                  setConfirmDelCh(null)
                }}
                onCancelDel={() => setConfirmDelCh(null)}
              />
            ))}
        </div>

        {/* AI 助手 */}
        <div className="mt-4">
          <SectionHeader label="AI 助手" onAdd={onCreateAssistant} />
          {assistants.length === 0 && (
            <button
              onClick={onCreateAssistant}
              className="mx-1 mb-1 w-[calc(100%-0.5rem)] rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] px-2 py-2 text-left text-xs text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)]"
            >
              + 新建一个 AI 助手,在频道 @ 它或私信对话
            </button>
          )}
          {assistants
            .filter(
              (a) =>
                !query.trim() ||
                a.name.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((a) => {
              const dm = dmList.find((d) => d.peer?.id === a.id)
              const active = dm ? dm.id === selectedId : false
              return (
                <div
                  key={a.id}
                  className="group/asst relative flex items-center"
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onEditAssistant(a)
                  }}
                >
                  <Row
                    active={active}
                    unread={dm?.unread ?? 0}
                    onClick={() => onOpenDM(a.id)}
                  >
                    <Avatar user={a} size={20} />
                    <span className="truncate">{a.name}</span>
                    <UnreadBadge n={dm?.unread ?? 0} />
                  </Row>
                  {confirmDel === a.id ? (
                    <div className="absolute right-1 flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--canvas)] px-1 py-0.5 shadow">
                      <button
                        onClick={() => {
                          onDeleteAssistant(a.id)
                          setConfirmDel(null)
                        }}
                        className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                        style={{ background: 'var(--destructive)' }}
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setConfirmDel(null)}
                        className="rounded px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="absolute right-1 hidden items-center gap-0.5 group-hover/asst:flex">
                      <button
                        onClick={() => onEditAssistant(a)}
                        title="编辑助手"
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDel(a.id)}
                        title="删除助手"
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--destructive)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>

        {/* 私信 */}
        <div className="mt-4">
          <SectionHeader
            label="私信"
            onAdd={() => {
              setDmPicker((v) => !v)
              setCreating(null)
            }}
          />
          {dmPicker && (
            <div className="mb-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)]">
              {users
                .filter(
                  (u) =>
                    u.id !== me.id && !u.isAssistant && !dmPeerIds.has(u.id),
                )
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setDmPicker(false)
                      onOpenDM(u.id)
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--hover)]"
                  >
                    <Avatar user={u} size={22} />
                    <span className="truncate text-[var(--text-primary)]">
                      {u.name}
                    </span>
                  </button>
                ))}
            </div>
          )}
          {filtered(dmList).map((c) => (
            <div
              key={c.id}
              className="group/dm relative flex items-center"
              onContextMenu={(e) => {
                e.preventDefault()
                setConfirmDelCh(c.id)
              }}
            >
              <Row
                active={c.id === selectedId}
                unread={c.unread}
                onClick={() => onSelect(c.id)}
              >
                {c.peer && (
                  <Avatar
                    user={c.peer}
                    size={20}
                    showPresence
                    online={online.has(c.peer.id)}
                  />
                )}
                <span className="truncate">{c.name}</span>
                <UnreadBadge n={c.unread} />
              </Row>
              {confirmDelCh === c.id ? (
                <div className="absolute right-1 flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--canvas)] px-1 py-0.5 shadow">
                  <button
                    onClick={() => {
                      onDeleteChannel(c.id)
                      setConfirmDelCh(null)
                    }}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                    style={{ background: 'var(--destructive)' }}
                    title="删除整段私信记录"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setConfirmDelCh(null)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelCh(c.id)}
                  title="删除私信对话"
                  className="absolute right-1 hidden h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors group-hover/dm:flex hover:bg-[var(--hover)] hover:text-[var(--destructive)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* v3 G1:[归档] 段 */}
        {archivedChannels.length > 0 && (
          <div className="mt-3">
            <SectionHeader
              label="归档"
              icon={<Archive size={11} />}
              count={archivedChannels.length}
              collapsed={collapsed.archived ?? true}
              onToggle={() => setCollapsed((m) => ({ ...m, archived: !(m.archived ?? true) }))}
            />
            {(collapsed.archived ?? true) === false &&
              filtered(archivedChannels).map((c) => (
                <ChannelRow
                  key={c.id}
                  c={c}
                  selected={c.id === selectedId}
                  confirmDel={confirmDelCh === c.id}
                  onSelect={onSelect}
                  onAskDel={() => setConfirmDelCh(c.id)}
                  onConfirmDel={() => {
                    onDeleteChannel(c.id)
                    setConfirmDelCh(null)
                  }}
                  onCancelDel={() => setConfirmDelCh(null)}
                />
              ))}
          </div>
        )}
      </div>
    </aside>
    </>
  )
}

function SectionHeader({
  label,
  icon,
  count,
  collapsed,
  onToggle,
  onAdd,
}: {
  label: string
  icon?: React.ReactNode
  count?: number
  collapsed?: boolean
  onToggle?: () => void
  onAdd?: () => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1">
      <button
        onClick={onToggle}
        disabled={!onToggle}
        className="flex items-center gap-1 text-xs font-semibold tracking-wide text-[var(--text-tertiary)] uppercase transition-colors hover:text-[var(--text-secondary)] disabled:cursor-default"
      >
        {onToggle && (
          <ChevronRight
            size={12}
            style={{ transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 150ms' }}
          />
        )}
        {icon}
        <span>{label}</span>
        {typeof count === 'number' && (
          <span className="text-[10px] font-normal opacity-70">· {count}</span>
        )}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}

// 复用的频道行(项目 / 讨论 / 归档 都用)
function ChannelRow({
  c,
  selected,
  confirmDel,
  onSelect,
  onAskDel,
  onConfirmDel,
  onCancelDel,
}: {
  c: ChannelSummary
  selected: boolean
  confirmDel: boolean
  onSelect: (id: string) => void
  onAskDel: () => void
  onConfirmDel: () => void
  onCancelDel: () => void
}) {
  const phase = c.kind === 'project'
    ? PROJECT_PHASES.find((p) => p.key === (c.phase ?? 'discovery')) ?? null
    : null
  return (
    <div
      className="group/ch relative flex items-center"
      onContextMenu={(e) => {
        e.preventDefault()
        onAskDel()
      }}
    >
      <Row active={selected} unread={c.unread} onClick={() => onSelect(c.id)}>
        {c.kind === 'project' ? (
          <Rocket
            size={14}
            style={{ color: phase?.color ?? 'var(--text-tertiary)' }}
          />
        ) : (
          <Hash size={16} className="text-[var(--text-tertiary)]" />
        )}
        <span className="truncate">{c.name}</span>
        {phase && (
          <span
            className="ml-1 shrink-0 rounded px-1 py-px text-[9.5px] font-medium"
            style={{
              color: phase.color,
              background: `color-mix(in oklch, ${phase.color} 12%, transparent)`,
            }}
          >
            {phase.label}
          </span>
        )}
        <UnreadBadge n={c.unread} />
      </Row>
      {confirmDel ? (
        <div className="absolute right-1 flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--canvas)] px-1 py-0.5 shadow">
          <button
            onClick={onConfirmDel}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
            style={{ background: 'var(--destructive)' }}
            title="删除频道及其全部消息"
          >
            删除
          </button>
          <button
            onClick={onCancelDel}
            className="rounded px-1.5 py-0.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          onClick={onAskDel}
          title="删除频道"
          className="absolute right-1 hidden h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors group-hover/ch:flex hover:bg-[var(--hover)] hover:text-[var(--destructive)]"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function Row({
  active,
  unread,
  onClick,
  children,
}: {
  active: boolean
  unread: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active
          ? 'var(--accent-text)'
          : unread
            ? 'var(--text-primary)'
            : 'var(--text-secondary)',
        fontWeight: unread && !active ? 600 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
