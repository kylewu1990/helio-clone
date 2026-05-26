// Phase J/N7:Composer @ 真菜单(老路径)+ / 真菜单(新加)
// 灵感参考 tiptap CommandsMenu(MIT,https://github.com/ueberdosis/tiptap/tree/main/demos/src/Examples/CommandsMenu)。
// 因为本 Composer 用原生 textarea(非 tiptap),菜单交互手写实现,语义对齐:
//   - 候选过滤、ArrowUp/Down、Enter 选中、Esc 关闭。
// see /THIRD_PARTY_LICENSES.md
import { useRef, useState } from 'react'
import { Loader2, Paperclip, SendHorizontal } from 'lucide-react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import type { User } from '../lib/types'

function detectQuery(val: string, caret: number) {
  const upto = val.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at === -1) return null
  const before = at === 0 ? '' : upto[at - 1]
  if (before && !/\s/.test(before)) return null // @ 必须在词首
  const frag = upto.slice(at + 1)
  if (/\s/.test(frag)) return null // @ 后有空格 → 已结束
  return { at, query: frag }
}

// Phase J/N7:在词首检测 `/<frag>` 触发 slash 菜单
function detectSlashQuery(val: string, caret: number) {
  const upto = val.slice(0, caret)
  const slash = upto.lastIndexOf('/')
  if (slash === -1) return null
  const before = slash === 0 ? '' : upto[slash - 1]
  if (before && !/\s/.test(before)) return null
  const frag = upto.slice(slash + 1)
  if (/\s/.test(frag)) return null
  return { at: slash, query: frag }
}

// Phase J/N7:项目频道默认 6 条 slash 命令(对齐 doctrine 的标准动作词)
export type SlashCommand = {
  id: string
  label: string
  hint: string
  // 触发后写到 composer 的占位文本;默认 fallback = '/' + id + ' '
  expand?: string
}
export const DEFAULT_CHANNEL_SLASH: SlashCommand[] = [
  { id: 'build',      label: '/build · 开工',       hint: '把任务派给软件工程师,进入 Build 阶段' },
  { id: 'review',     label: '/review · 评审',     hint: '把最新交付丢给评审 AI,出验收清单' },
  { id: 'ship',       label: '/ship · 发布',        hint: '把通过的交付转 ship + 写发布说明' },
  { id: 'note',       label: '/note · 备忘',        hint: '在本频道留一条非任务的备忘(写入记忆)' },
  { id: 'task',       label: '/task · 新建任务',    hint: '把这条消息拆成正式 Task(走派工链路)' },
  { id: 'screenshot', label: '/screenshot · 截图',  hint: '让 AI 用浏览器截图当前 preview 入口' },
]

export function Composer({
  placeholder,
  onSend,
  onTyping,
  mentionables = [],
  slashCommands = DEFAULT_CHANNEL_SLASH,
  draftKey,
}: {
  placeholder: string
  onSend: (body: string) => void
  onTyping?: () => void
  mentionables?: User[]
  // Phase J/N7:项目频道 slash 命令(空数组 = 不开 slash 菜单)
  slashCommands?: SlashCommand[]
  draftKey?: string
}) {
  const [value, setValue] = useState(() =>
    draftKey ? localStorage.getItem(draftKey) ?? '' : '',
  )
  const [mention, setMention] = useState<{ at: number; query: string } | null>(
    null,
  )
  const [slash, setSlash] = useState<{ at: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const [slashActive, setSlashActive] = useState(0)
  const [uploading, setUploading] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const insertAtCursor = (text: string) => {
    const ta = taRef.current
    const caret = ta?.selectionStart ?? value.length
    const next = value.slice(0, caret) + text + value.slice(caret)
    const pos = caret + text.length
    setValue(next)
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus()
        ta.setSelectionRange(pos, pos)
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
      }
    })
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const r = await api.upload(file)
      const md = r.isImage ? `![${r.name}](${r.url})` : `[${r.name}](${r.url})`
      insertAtCursor(md + '\n')
    } catch {
      /* 忽略上传失败 */
    } finally {
      setUploading(false)
    }
  }

  const candidates = mention
    ? mentionables
        .filter((u) => {
          const q = mention.query.toLowerCase()
          return (
            !q ||
            u.name.toLowerCase().includes(q) ||
            u.handle.toLowerCase().includes(q)
          )
        })
        .slice(0, 6)
    : []
  const menuOpen = candidates.length > 0
  const activeIdx = Math.min(active, candidates.length - 1)

  // Phase J/N7:slash 候选(传空数组 = 关掉 /)
  const slashCandidates = slash
    ? (slashCommands.length === 0
        ? []
        : slashCommands.filter((c) => {
            const q = slash.query.toLowerCase()
            return !q || c.id.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
          }))
    : []
  const slashOpen = slashCandidates.length > 0
  const slashIdx = Math.min(slashActive, Math.max(0, slashCandidates.length - 1))

  const refresh = (val: string, caret: number) => {
    setValue(val)
    if (draftKey) {
      if (val) localStorage.setItem(draftKey, val)
      else localStorage.removeItem(draftKey)
    }
    const m = detectQuery(val, caret)
    setMention(m)
    setActive(0)
    // / 仅在 @ 未激活时触发,避免两菜单重叠
    setSlash(m ? null : detectSlashQuery(val, caret))
    setSlashActive(0)
  }

  const insertSlash = (cmd: SlashCommand) => {
    if (!slash) return
    const caret = taRef.current?.selectionStart ?? value.length
    const before = value.slice(0, slash.at)
    const after = value.slice(caret)
    const insert = cmd.expand ?? `/${cmd.id} `
    const next = before + insert + after
    const pos = (before + insert).length
    setValue(next)
    setSlash(null)
    if (draftKey) {
      if (next) localStorage.setItem(draftKey, next)
      else localStorage.removeItem(draftKey)
    }
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(pos, pos)
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
      }
    })
  }

  const insertMention = (u: User) => {
    if (!mention) return
    const caret = taRef.current?.selectionStart ?? value.length
    const before = value.slice(0, mention.at)
    const after = value.slice(caret)
    const insert = '@' + u.name + ' '
    const next = before + insert + after
    const pos = (before + insert).length
    setValue(next)
    setMention(null)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(pos, pos)
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
      }
    })
  }

  const submit = () => {
    const body = value.trim()
    if (!body) return
    onSend(body)
    setValue('')
    setMention(null)
    setSlash(null)
    if (draftKey) localStorage.removeItem(draftKey)
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div className="px-5 pb-5">
      <div className="relative">
        {menuOpen && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] py-1 shadow-xl">
            <div className="px-3 py-1 text-[10px] font-medium tracking-wide text-[var(--text-tertiary)] uppercase">
              提及成员
            </div>
            {candidates.map((u, i) => (
              <button
                key={u.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(u)
                }}
                onMouseEnter={() => setActive(i)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                style={{
                  background: i === activeIdx ? 'var(--hover)' : 'transparent',
                }}
              >
                <Avatar user={u} size={22} />
                <span className="truncate text-[var(--text-primary)]">
                  {u.name}
                </span>
                <span className="ml-auto truncate text-xs text-[var(--text-tertiary)]">
                  {u.isAssistant ? 'AI' : '@' + u.handle}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* Phase J/N7:slash 命令菜单(/build /review …) */}
        {slashOpen && !menuOpen && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] py-1 shadow-xl">
            <div className="px-3 py-1 text-[10px] font-medium tracking-wide text-[var(--text-tertiary)] uppercase">
              快捷命令
            </div>
            {slashCandidates.map((c, i) => (
              <button
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertSlash(c)
                }}
                onMouseEnter={() => setSlashActive(i)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left"
                style={{
                  background: i === slashIdx ? 'var(--hover)' : 'transparent',
                }}
              >
                <span className="text-sm text-[var(--text-primary)]">{c.label}</span>
                <span className="text-[10.5px] text-[var(--text-tertiary)]">{c.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--canvas)] px-3 py-2 focus-within:border-[var(--accent)]">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadFile(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="上传文件/图片"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Paperclip size={16} />
            )}
          </button>
          <textarea
            ref={taRef}
            value={value}
            rows={1}
            placeholder={placeholder}
            onPaste={(e) => {
              const item = [...e.clipboardData.items].find((i) =>
                i.type.startsWith('image/'),
              )
              const f = item?.getAsFile()
              if (f) {
                e.preventDefault()
                uploadFile(f)
              }
            }}
            onChange={(e) => {
              refresh(e.target.value, e.target.selectionStart ?? 0)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
              if (e.target.value) onTyping?.()
            }}
            onKeyDown={(e) => {
              // 输入法合成中(中文/候选词未上屏):完全交给输入法,回车只用于上屏,绝不触发发送/换行处理
              if (e.nativeEvent.isComposing) return

              if (menuOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => (a + 1) % candidates.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive(
                    (a) => (a - 1 + candidates.length) % candidates.length,
                  )
                  return
                }
                // 提及菜单内:Enter / Tab 选中候选(⌘/Ctrl+Enter 例外,落到下面去发送)
                if (
                  e.key === 'Tab' ||
                  (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)
                ) {
                  e.preventDefault()
                  insertMention(candidates[activeIdx])
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setMention(null)
                  return
                }
              }
              // Phase J/N7:slash 菜单按键
              if (slashOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSlashActive((a) => (a + 1) % slashCandidates.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSlashActive((a) => (a - 1 + slashCandidates.length) % slashCandidates.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
                  e.preventDefault()
                  insertSlash(slashCandidates[slashIdx])
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSlash(null)
                  return
                }
              }
              // ⌘+Enter / Ctrl+Enter 发送;普通 Enter 不拦截 → 由 textarea 自然换行
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            className="max-h-50 flex-1 resize-none bg-transparent py-1 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white transition-opacity disabled:opacity-30"
            style={{ background: 'var(--accent)' }}
            title="发送(⌘ + Enter)"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
      {value.trim() && (
        <div className="mt-1.5 px-1 text-[10px] leading-none text-[var(--text-tertiary)]">
          Enter 换行 · ⌘ + Enter 发送
        </div>
      )}
    </div>
  )
}
