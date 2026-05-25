import { Bot } from 'lucide-react'
import { identityColor, initials } from '../lib/format'
import type { User } from '../lib/types'

export function Avatar({
  user,
  size = 36,
  online,
  showPresence = false,
}: {
  user: Pick<User, 'name' | 'avatarColor' | 'isAssistant'>
  size?: number
  online?: boolean
  showPresence?: boolean
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-[var(--radius-lg)] font-semibold text-white select-none"
        style={{
          background: identityColor(user.avatarColor),
          fontSize: size * 0.4,
        }}
      >
        {initials(user.name)}
      </div>
      {user.isAssistant ? (
        <span
          className="absolute -right-1 -bottom-1 flex items-center justify-center rounded-full text-white"
          style={{
            width: size * 0.42,
            height: size * 0.42,
            background: 'var(--accent)',
            boxShadow: '0 0 0 2px var(--canvas)',
          }}
          title="AI 助手"
        >
          <Bot size={size * 0.28} strokeWidth={2.5} />
        </span>
      ) : (
        showPresence && (
          <span
            className="absolute -right-0.5 -bottom-0.5 rounded-full"
            style={{
              width: size * 0.3,
              height: size * 0.3,
              background: online ? 'var(--success)' : 'var(--ink-30)',
              boxShadow: '0 0 0 2px var(--canvas)',
            }}
          />
        )
      )}
    </div>
  )
}
