import { useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { Avatar } from '../Avatar'
import { relativeTime } from '../../lib/format'
import { SectionTitle } from './AgentRoster'
import type { ReviewItem, ReviewVerdict, Task } from '../../lib/types'

const VERDICT_META: Record<ReviewVerdict, { label: string; color: string }> = {
  pass: { label: '通过', color: 'var(--verdict-pass)' },
  needs_fix: { label: '需修复', color: 'var(--verdict-fix)' },
  blocked: { label: '受阻', color: 'var(--verdict-reviewing)' },
}

// 质量审查:真实 Review(pass / needs_fix / blocked + checks + notes)。可提交新审查。
export function QualityReview({
  reviews,
  reviewableTasks,
  onSubmit,
}: {
  reviews: ReviewItem[]
  reviewableTasks: Task[]
  onSubmit: (data: {
    taskId?: string
    verdict: ReviewVerdict
    notes?: string
  }) => void
}) {
  const [open, setOpen] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [verdict, setVerdict] = useState<ReviewVerdict>('pass')
  const [notes, setNotes] = useState('')

  const submit = () => {
    onSubmit({ taskId: taskId || undefined, verdict, notes: notes.trim() || undefined })
    setNotes('')
    setOpen(false)
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle
          icon={<ShieldCheck size={13} />}
          title="质量审查"
          count={reviews.length || undefined}
        />
        <button
          onClick={() => setOpen((v) => !v)}
          className="mb-2 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-text)]"
        >
          {open ? '收起' : '+ 提交审查'}
        </button>
      </div>

      {open && (
        <div className="mb-2 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-2.5">
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="">(可选)关联任务…</option>
            {reviewableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title.slice(0, 40)}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {(['pass', 'needs_fix', 'blocked'] as ReviewVerdict[]).map((v) => (
              <button
                key={v}
                onClick={() => setVerdict(v)}
                className="flex-1 rounded-[var(--radius-md)] border px-2 py-1 text-[11px] font-medium transition-colors"
                style={{
                  color: verdict === v ? '#fff' : VERDICT_META[v].color,
                  background: verdict === v ? VERDICT_META[v].color : 'transparent',
                  borderColor: VERDICT_META[v].color,
                }}
              >
                {VERDICT_META[v].label}
              </button>
            ))}
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="审查备注(可选)…"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
          <button
            onClick={submit}
            className="rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            提交审查结论
          </button>
        </div>
      )}

      {reviews.length === 0 && !open ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-5 text-center">
          <ShieldCheck size={22} className="text-[var(--text-tertiary)]" />
          <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
            暂无审查记录。点「+ 提交审查」对任务给出 pass / 需修复 / 受阻 结论,结果会持久化到后端。
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </section>
  )
}

function ReviewCard({ review }: { review: ReviewItem }) {
  const meta = VERDICT_META[review.verdict]
  const active = review.verdict !== 'pass'
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-3"
      style={{
        background: active ? 'var(--glass-surface)' : 'var(--canvas)',
        borderColor: active ? 'var(--glass-border)' : 'var(--border)',
        backdropFilter: active ? 'blur(8px)' : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--text-primary)]">
          {review.targetTitle}
        </p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: meta.color,
            background: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
          }}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
        <Avatar
          user={{
            name: review.reviewerName,
            avatarColor: review.reviewerColor,
            isAssistant: false,
          }}
          size={16}
        />
        <span>{review.reviewerName}</span>
        <span>· {relativeTime(review.timestamp)}</span>
      </div>

      {review.checks.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {review.checks.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px]">
              {c.ok ? (
                <Check size={12} style={{ color: 'var(--verdict-pass)' }} />
              ) : (
                <X size={12} style={{ color: 'var(--verdict-fix)' }} />
              )}
              <span
                style={{
                  color: c.ok ? 'var(--text-secondary)' : 'var(--text-primary)',
                }}
              >
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {review.notes && (
        <p className="mt-2 border-t border-[var(--border)] pt-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {review.notes}
        </p>
      )}
    </div>
  )
}
