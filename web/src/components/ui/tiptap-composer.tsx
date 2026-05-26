// Inspired by tiptap/tiptap demos/src/Examples (MIT), see /THIRD_PARTY_LICENSES.md
// C4 / I1:必装并接通 @tiptap/react + Mention + slash
//   - Mention 用 `@`,候选来自传入的 members 列表(name+handle 模糊匹配)
//   - Slash 用 `/`,候选来自传入的 slashCommands(命令菜单)
//   - 都用同一种轻量 floating popover(避免引入 tippy.js 大依赖)
import { useEffect, useRef, useState } from 'react'
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import { cn } from '../../lib/cn'

export interface MentionItem {
  id: string
  label: string // 显示名(name)
  handle?: string // 用于 @handle 匹配
}

export interface SlashItem {
  id: string
  label: string
  hint?: string
  onSelect: () => void
}

export interface TiptapComposerProps {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
  mentions?: MentionItem[]
  slashItems?: SlashItem[]
  onSubmit?: () => void
}

// 简易浮层 dropdown(@ / 候选共用)
function FloatingMenu({
  anchorEl,
  items,
  activeIdx,
  onPick,
  onClose,
}: {
  anchorEl: HTMLElement | null
  items: { id: string; label: string; hint?: string }[]
  activeIdx: number
  onPick: (i: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!anchorEl) return setPos(null)
    const rect = anchorEl.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }, [anchorEl, items.length])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  if (!pos || items.length === 0) return null
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 999 }}
      className="min-w-[220px] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg)] py-1 shadow-[var(--shadow-2)]"
    >
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          onMouseEnter={() => onPick(i)}
          onClick={() => onPick(i)}
          className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] ${
            activeIdx === i
              ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
              : 'text-[var(--ink-2)] hover:bg-[var(--glass-2)]'
          }`}
        >
          <span className="truncate">{it.label}</span>
          {it.hint && <span className="text-[10.5px] text-[var(--mute)]">{it.hint}</span>}
        </button>
      ))}
    </div>
  )
}

export function TiptapComposer({
  value,
  onChange,
  placeholder = '描述一个任务…',
  className,
  minHeight = 96,
  mentions = [],
  slashItems = [],
  onSubmit,
}: TiptapComposerProps) {
  // slash menu 状态(@ 走 tiptap Mention 内置 suggestion;/ 我们自己用 floating menu)
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashAnchor, setSlashAnchor] = useState<HTMLElement | null>(null)
  const [slashActive, setSlashActive] = useState(0)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionActive, setMentionActive] = useState(0)
  const mentionAnchorRef = useRef<HTMLElement | null>(null)
  const mentionPropsRef = useRef<any>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention-chip' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return mentions
              .filter(
                (m) =>
                  m.label.toLowerCase().includes(q) ||
                  (m.handle ?? '').toLowerCase().includes(q),
              )
              .slice(0, 6)
              .map((m) => ({ id: m.id, label: m.label }))
          },
          render: () => {
            return {
              onStart: (props: any) => {
                mentionPropsRef.current = props
                setMentionQuery(props.query)
                setMentionActive(0)
                setMentionOpen(true)
                const rect = props.clientRect?.()
                if (rect)
                  mentionAnchorRef.current = anchorAtRect(rect)
              },
              onUpdate: (props: any) => {
                mentionPropsRef.current = props
                setMentionQuery(props.query)
                const rect = props.clientRect?.()
                if (rect)
                  mentionAnchorRef.current = anchorAtRect(rect)
              },
              onKeyDown: (props: any) => {
                const items = filterMentions(mentionPropsRef.current?.items ?? [], props.query ?? mentionQuery)
                if (props.event.key === 'ArrowDown') {
                  setMentionActive((i) => Math.min(i + 1, Math.max(0, items.length - 1)))
                  return true
                }
                if (props.event.key === 'ArrowUp') {
                  setMentionActive((i) => Math.max(0, i - 1))
                  return true
                }
                if (props.event.key === 'Enter' || props.event.key === 'Tab') {
                  const sel = items[mentionActive]
                  if (sel) {
                    mentionPropsRef.current.command(sel)
                    setMentionOpen(false)
                  }
                  return true
                }
                if (props.event.key === 'Escape') {
                  setMentionOpen(false)
                  return true
                }
                return false
              },
              onExit: () => setMentionOpen(false),
            }
          },
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap-composer prose prose-sm max-w-none focus:outline-none',
          'text-[14px] leading-relaxed text-[var(--ink)]',
          className,
        ),
        style: `min-height:${minHeight}px;`,
      },
      handleKeyDown(_view, event) {
        // ⌘⏎ / Ctrl⏎ 派工
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault()
          onSubmit()
          return true
        }
        // Slash menu 自家处理(@ 走 Mention 插件)
        if (slashOpen) {
          if (event.key === 'ArrowDown') {
            setSlashActive((i) => Math.min(i + 1, slashItems.length - 1))
            event.preventDefault()
            return true
          }
          if (event.key === 'ArrowUp') {
            setSlashActive((i) => Math.max(0, i - 1))
            event.preventDefault()
            return true
          }
          if (event.key === 'Enter') {
            const it = filterSlash(slashItems, slashQuery)[slashActive]
            if (it) {
              it.onSelect()
              setSlashOpen(false)
              event.preventDefault()
              return true
            }
          }
          if (event.key === 'Escape') {
            setSlashOpen(false)
            event.preventDefault()
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText())
      // 极简 slash 触发:行首是 / 或最后一个非空格 token 以 / 开头
      const text = editor.getText()
      const m = text.match(/(^|\s)\/([^\s]*)$/)
      if (m) {
        setSlashOpen(true)
        setSlashQuery(m[2] ?? '')
        setSlashActive(0)
        const dom = (editor.view.dom as HTMLElement) ?? null
        setSlashAnchor(dom)
      } else if (slashOpen) {
        setSlashOpen(false)
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getText()
    if (value !== current) editor.commands.setContent(value || '')
  }, [editor, value])

  const slashFiltered = filterSlash(slashItems, slashQuery)
  const mentionFiltered = mentionPropsRef.current
    ? filterMentions(mentionPropsRef.current.items ?? [], mentionQuery)
    : []

  return (
    <>
      <EditorContent editor={editor} />
      {slashOpen && (
        <FloatingMenu
          anchorEl={slashAnchor}
          items={slashFiltered}
          activeIdx={slashActive}
          onPick={(i) => {
            const it = slashFiltered[i]
            if (!it) return
            it.onSelect()
            setSlashOpen(false)
          }}
          onClose={() => setSlashOpen(false)}
        />
      )}
      {mentionOpen && (
        <FloatingMenu
          anchorEl={mentionAnchorRef.current}
          items={mentionFiltered.map((m: any) => ({ id: m.id, label: m.label }))}
          activeIdx={mentionActive}
          onPick={(i) => {
            const it = mentionFiltered[i]
            if (!it) return
            mentionPropsRef.current?.command?.({ id: it.id, label: it.label })
            setMentionOpen(false)
          }}
          onClose={() => setMentionOpen(false)}
        />
      )}
    </>
  )
}

function filterSlash(items: SlashItem[], q: string): SlashItem[] {
  if (!q) return items.slice(0, 8)
  const low = q.toLowerCase()
  return items.filter((s) => s.label.toLowerCase().includes(low)).slice(0, 8)
}
function filterMentions(items: any[], q: string): any[] {
  if (!q) return items.slice(0, 6)
  const low = q.toLowerCase()
  return items.filter((m) => (m.label ?? '').toLowerCase().includes(low)).slice(0, 6)
}
function anchorAtRect(rect: DOMRect): HTMLElement {
  // 用一个 detached 元素描述 clientRect:tiptap suggestion 给的是 clientRect()。
  // 我们的 FloatingMenu 期望 anchorEl.getBoundingClientRect(),所以伪造一个临时元素。
  const el = document.createElement('div')
  ;(el as any).getBoundingClientRect = () => rect
  return el
}

// 让 TS 不报 unused
void ReactRenderer
