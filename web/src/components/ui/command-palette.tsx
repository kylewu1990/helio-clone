// Inspired by cmdk (MIT), see /THIRD_PARTY_LICENSES.md
import * as React from 'react'
import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../../lib/cn'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  group?: string
  onSelect: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PaletteItem[]
  placeholder?: string
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = '搜索频道 / 助手 / 命令…',
}: CommandPaletteProps) {
  // 按 group 分组
  const groups = React.useMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const it of items) {
      const g = it.group ?? '快速跳转'
      const arr = map.get(g) ?? []
      arr.push(it)
      map.set(g, arr)
    }
    return Array.from(map.entries())
  }, [items])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[20%] z-50 w-full max-w-[560px] -translate-x-1/2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg)] shadow-[var(--shadow-2)] focus:outline-none',
          )}
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">命令面板</DialogPrimitive.Title>
          <Command className="bg-transparent" loop>
            <Command.Input
              placeholder={placeholder}
              className="w-full bg-transparent px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--mute)] focus:outline-none border-b border-[var(--line-soft)]"
            />
            <Command.List className="max-h-[420px] overflow-y-auto p-2">
              <Command.Empty className="p-6 text-center text-sm text-[var(--ink-3)]">
                没匹配到结果
              </Command.Empty>
              {groups.map(([g, list]) => (
                <Command.Group
                  key={g}
                  heading={g}
                  className="text-[10px] uppercase tracking-wider text-[var(--mute)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                >
                  {list.map((it) => (
                    <Command.Item
                      key={it.id}
                      value={`${it.label} ${it.hint ?? ''}`}
                      onSelect={() => {
                        it.onSelect()
                        onOpenChange(false)
                      }}
                      className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm text-[var(--ink)] data-[selected=true]:bg-[var(--accent-soft)]"
                    >
                      <span>{it.label}</span>
                      {it.hint && (
                        <span className="text-[11px] text-[var(--mute)]">{it.hint}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// hook:监听 ⌘K / Ctrl+K 打开
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { open, setOpen }
}
