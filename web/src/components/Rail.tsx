import { useState } from 'react'
import {
  CheckSquare,
  Inbox,
  LayoutGrid,
  MessagesSquare,
  Moon,
  Orbit,
  Sun,
  SquareTerminal,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { identityColor } from '../lib/format'
import type { User } from '../lib/types'

export type MainView = 'home' | 'mission' | 'channel' | 'inbox' | 'tasks' | 'terminal'

export function Rail({
  me,
  users,
  theme,
  view,
  inboxUnread,
  onView,
  onToggleTheme,
  onSwitchIdentity,
}: {
  me: User
  users: User[]
  theme: 'light' | 'dark'
  view: MainView
  inboxUnread: number
  onView: (v: MainView) => void
  onToggleTheme: () => void
  onSwitchIdentity: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-[var(--border)] bg-[var(--chrome-frame)] py-3">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-white"
        style={{
          background:
            'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 55%, var(--info)))',
        }}
        title="Heliox · AI 工作台"
      >
        <Orbit size={19} strokeWidth={2} />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <NavButton
          active={view === 'home' || view === 'mission'}
          title="总览 · Mission Control"
          onClick={() => onView('home')}
        >
          <LayoutGrid size={18} />
        </NavButton>
        <NavButton
          active={view === 'channel'}
          title="消息"
          onClick={() => onView('channel')}
        >
          <MessagesSquare size={18} />
        </NavButton>
        <NavButton
          active={view === 'inbox'}
          badge={inboxUnread}
          title="收件箱"
          onClick={() => onView('inbox')}
        >
          <Inbox size={18} />
        </NavButton>
        <NavButton
          active={view === 'tasks'}
          title="任务"
          onClick={() => onView('tasks')}
        >
          <CheckSquare size={18} />
        </NavButton>
        <NavButton
          active={view === 'terminal'}
          title="终端"
          onClick={() => onView('terminal')}
        >
          <SquareTerminal size={18} />
        </NavButton>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          onClick={onToggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          title="切换主题"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-[var(--radius-lg)] outline-none ring-offset-2 focus-visible:ring-2"
            title={`${me.name}(点击切换身份)`}
          >
            <Avatar user={me} size={36} />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
              />
              <div className="absolute bottom-0 left-12 z-20 w-56 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--canvas)] py-1 shadow-xl">
                <div className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">
                  切换身份
                </div>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setOpen(false)
                      if (u.id !== me.id) onSwitchIdentity(u.id)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--hover)]"
                  >
                    <Avatar user={u} size={26} />
                    <span className="flex-1 truncate text-[var(--text-primary)]">
                      {u.name}
                    </span>
                    {u.id === me.id && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: identityColor(u.avatarColor) }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

function NavButton({
  active,
  badge = 0,
  title,
  onClick,
  children,
}: {
  active: boolean
  badge?: number
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-lg)] transition-colors"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
      }}
    >
      {children}
      {badge > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
