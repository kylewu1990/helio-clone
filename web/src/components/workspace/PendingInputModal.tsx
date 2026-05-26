import { useEffect, useRef, useState } from 'react'
import { Hand, X, Sparkles, Check, HelpCircle, Wand2, ArrowRight } from 'lucide-react'

export type PendingInputData = {
  question: string
  reason?: string | null
  options?: { label: string; value: string; hint?: string }[]
  recommended?: number | null
  defaultValue?: string | null
  allowCustom?: boolean
  assistantName?: string
}

// 结构化「待你处理」:不再只在聊天里丢抽象问题。
// 说明「为什么问 / 怎么选 / 选了会怎样」,并提供:推荐默认项、"我不知道,按 MVP 默认假设继续"、自定义输入。
export function PendingInputModal({
  data,
  busy,
  onSubmit,
  onUseDefault,
  onCancel,
}: {
  data: PendingInputData
  busy?: boolean
  onSubmit: (value: string) => void
  onUseDefault: () => void
  onCancel: () => void
}) {
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const options = data.options ?? []
  const allowCustom = data.allowCustom !== false
  const recommended = data.recommended ?? -1

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel, busy])

  return (
    <div
      className="scrim-in fixed inset-0 z-[60] flex items-center justify-center bg-[color-mix(in_oklch,black_55%,transparent)] p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-lg rounded-[var(--radius-2xl)] border border-[color-mix(in_oklch,var(--accent)_35%,transparent)] bg-[var(--surface-1)] p-5 shadow-2xl surface-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Hand size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
              AI 需要你确认 {data.assistantName ? `· ${data.assistantName}` : ''}
            </div>
            <p className="mt-1 text-[14px] font-semibold leading-snug text-[var(--text-primary)]">{data.question}</p>
          </div>
          <button
            onClick={() => !busy && onCancel()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* 为什么问 */}
        {data.reason && (
          <div className="mt-3 flex items-start gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            <HelpCircle size={13} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
            <span><span className="font-medium text-[var(--text-primary)]">为什么问:</span> {data.reason}</span>
          </div>
        )}

        {/* 候选项 */}
        {options.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">选一个</div>
            <div className="flex flex-wrap gap-2">
              {options
                .filter((o) => o.value !== '__assume__')
                .map((o, i) => (
                  <button
                    key={o.value + i}
                    disabled={busy}
                    onClick={() => onSubmit(o.value)}
                    className="card-lift inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] border px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
                    style={
                      i === recommended
                        ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-text)' }
                        : { borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }
                    }
                    title={o.hint}
                  >
                    {i === recommended && <Sparkles size={12} />}
                    {o.label}
                    {o.hint && i !== recommended && (
                      <span className="text-[10px] font-normal text-[var(--text-tertiary)]">{o.hint}</span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* 自定义输入 */}
        {allowCustom && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">或自己填</div>
            <div className="flex gap-2">
              <input
                ref={ref}
                value={custom}
                disabled={busy}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && custom.trim() && onSubmit(custom.trim())}
                placeholder="输入你的答案…"
                className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={() => custom.trim() && onSubmit(custom.trim())}
                disabled={!custom.trim() || busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-lg)] px-3 py-2 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                <Check size={14} /> 用这个
              </button>
            </div>
          </div>
        )}

        {/* 我不知道,按 MVP 默认假设继续 */}
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
          <button
            onClick={onUseDefault}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="AI 用最合理的默认假设把任务做完,在汇报里标注假设"
          >
            <Wand2 size={14} /> 我不知道,按 MVP 默认假设继续
            {data.defaultValue && data.defaultValue !== '__assume__' && (
              <span className="text-[11px] text-[var(--text-tertiary)]">(默认 {data.defaultValue})</span>
            )}
          </button>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            {busy ? '处理中…' : <>选完即继续执行 <ArrowRight size={11} /></>}
          </span>
        </div>
      </div>
    </div>
  )
}
