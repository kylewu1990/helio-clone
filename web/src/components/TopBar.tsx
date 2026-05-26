// B1-B2:全宽顶部条 — 项目空间切换器 chip + 搜索 + 新建项目 + 主题切换 + 头像
// 对齐 docs/ai/reference/v4-opendesign-screens/01-home.png + 03-project-pixel2-preview.png
import { ChevronDown, Plus, Search, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { User } from '../lib/types'

export interface TopBarProps {
  me: User
  contextLabel: string // 例如 "主页" | "#pixel-2"
  onSearch: () => void
  onCreateProject: () => void
}

export function TopBar({ me, contextLabel, onSearch, onCreateProject }: TopBarProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const cur = document.documentElement.getAttribute('data-theme')
    return cur === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div
      className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line-soft)] px-4"
      style={{ background: 'var(--bg)' }}
    >
      {/* B1:中部 chip ▾ Aurora Labs / 主页 */}
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--glass-2)] px-2.5 py-1 text-[12.5px] text-[var(--ink-2)] hover:border-[var(--line-strong)]"
      >
        <ChevronDown size={11} className="text-[var(--mute)]" />
        <span className="font-medium text-[var(--ink)]">Aurora Labs</span>
        <span className="text-[var(--mute)]">/</span>
        <span className="text-[var(--ink-2)]">{contextLabel}</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* B2 搜索 */}
        <button
          type="button"
          onClick={onSearch}
          className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--glass-2)] px-2.5 py-1 text-[12.5px] text-[var(--mute)] hover:border-[var(--line-strong)] hover:text-[var(--ink-2)]"
        >
          <Search size={12} />
          <span>搜索</span>
          <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-1 py-px font-mono text-[10px] text-[var(--mute)]">
            ⌘K
          </kbd>
        </button>

        {/* B2 新建项目(橙底白字) */}
        <button
          type="button"
          onClick={onCreateProject}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white shadow-sm"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={13} />
          新建项目
        </button>

        {/* B2 主题切换 */}
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          title="切换主题"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* B2 头像 K */}
        <div
          className="grid h-8 w-8 place-items-center rounded-full font-mono text-[11px] font-medium text-white"
          style={{
            background: `var(--identity-${((me.avatarColor ?? 5) % 12) + 1})`,
            boxShadow: '0 0 0 1px var(--line)',
          }}
          title={me.name}
        >
          {me.name.slice(0, 1).toUpperCase()}
        </div>
      </div>
    </div>
  )
}
