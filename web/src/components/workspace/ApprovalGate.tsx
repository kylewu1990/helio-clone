import { Check, PackageCheck, ShieldQuestion, UserCheck, X } from 'lucide-react'
import type { ApprovalItem, ApprovalKind } from '../../lib/types'

const KIND_ICON: Record<ApprovalKind, React.ReactNode> = {
  delivery: <PackageCheck size={14} />,
  review: <ShieldQuestion size={14} />,
  action: <UserCheck size={14} />,
}

// 人工确认门 Human Approval:聚合真实待审批交付 + 高危能力(run_command)审批。
// approve/reject 经后端落库;高危能力批准后端会自动续跑放行(刷新仍在)。
export function ApprovalGate({
  items,
  onDecide,
}: {
  items: ApprovalItem[]
  onDecide: (item: ApprovalItem, status: 'approved' | 'rejected') => void
}) {
  if (items.length === 0) return null

  return (
    <div
      className="mx-4 mt-4 overflow-hidden rounded-[var(--radius-xl)] border"
      style={{
        borderColor: 'var(--accent)',
        background: 'var(--accent-soft)',
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <UserCheck size={15} style={{ color: 'var(--accent-text)' }} />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          人工确认门
        </span>
        <span className="text-[11px] tracking-wide text-[var(--text-tertiary)]">
          Human Approval · {items.length} 项等待你的确认
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {items.slice(0, 4).map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <span style={{ color: 'var(--accent-text)' }}>{KIND_ICON[it.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {it.title}
              </p>
              <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                {it.detail} · 来自 {it.requestedBy}
              </p>
            </div>
            <button
              onClick={() => onDecide(it, 'approved')}
              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--success)' }}
            >
              <Check size={12} /> 批准
            </button>
            <button
              onClick={() => onDecide(it, 'rejected')}
              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-[var(--hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
            >
              <X size={12} /> 打回
            </button>
          </div>
        ))}
        {items.length > 4 && (
          <p className="px-1 pt-0.5 text-[11px] text-[var(--text-tertiary)]">
            还有 {items.length - 4} 项待确认…
          </p>
        )}
      </div>
    </div>
  )
}
