import { useEffect, useRef, useState } from 'react'
import { Hand, X } from 'lucide-react'

// 待补信息:执行时缺少必要输入(如查天气缺城市)时,用明确的 Pending User Action UI
// 代替浏览器原生 prompt。诚实展示后端给出的提示文案。
export function PendingInputModal({
  prompt,
  onSubmit,
  onCancel,
}: {
  prompt: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])

  const submit = () => {
    const v = value.trim()
    if (v) onSubmit(v)
  }

  return (
    <div
      className="scrim-in fixed inset-0 z-[60] flex items-center justify-center bg-[color-mix(in_oklch,black_55%,transparent)] p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-[color-mix(in_oklch,var(--accent)_35%,transparent)] bg-[var(--surface-1)] p-5 shadow-2xl surface-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Hand size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
              需要你补充信息
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-primary)]">{prompt}</p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="输入后回车继续…"
          className="mt-4 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--hover)]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-[var(--radius-md)] px-3.5 py-1.5 text-[12px] font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            提交并继续
          </button>
        </div>
      </div>
    </div>
  )
}
