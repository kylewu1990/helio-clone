import { useEffect } from 'react'
import {
  X,
  Hand,
  ShieldAlert,
  PackageCheck,
  Check,
  Ban,
  RotateCcw,
  ArrowUpRight,
  Terminal,
  AlertTriangle,
  Info,
  HelpCircle,
  Wand2,
} from 'lucide-react'
import type { ApprovalItem, ApprovalRow, Delivery, PendingInputRow } from '../../lib/types'

const CAP_LABEL: Record<string, string> = {
  run_command: '执行命令',
  write_file: '写文件',
  computer_control: '电脑控制',
  browser_control: '浏览器自动化',
}

// Pending User Action 抽屉:清晰的决策界面 —— 为什么需要你、批准后会发生什么、风险、相关命令/文件、按钮。
export function PendingActionDrawer({
  items,
  approvals,
  deliveries,
  pendingInputs = [],
  onClose,
  onDecide,
  onOpen,
  onOpenPendingInput,
}: {
  items: ApprovalItem[]
  approvals: ApprovalRow[]
  deliveries: Delivery[]
  pendingInputs?: PendingInputRow[]
  onClose: () => void
  onDecide: (item: ApprovalItem, status: 'approved' | 'rejected') => void
  onOpen?: (item: ApprovalItem) => void
  onOpenPendingInput?: (pi: PendingInputRow) => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const total = items.length + pendingInputs.length

  return (
    <div className="fixed inset-0 z-[55] flex">
      <div className="scrim-in flex-1 bg-[color-mix(in_oklch,black_50%,transparent)]" onClick={onClose} />
      <aside className="cockpit-in flex h-full w-full max-w-[460px] flex-col border-l border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
        <header className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Hand size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
              需要你处理
            </div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{total} 项待决策</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {total === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] py-14 text-center">
              <Check size={26} className="mx-auto text-[var(--success)]" strokeWidth={1.5} />
              <p className="mt-3 text-[13px] text-[var(--text-secondary)]">没有待你处理的事项</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingInputs.map((pi) => (
                <PendingInputCard key={pi.id} pi={pi} onOpen={onOpenPendingInput} />
              ))}
              {items.map((item) => {
                if (item.kind === 'action') {
                  const ap = approvals.find((a) => a.id === item.refId)
                  return <ActionCard key={item.id} item={item} approval={ap} onDecide={onDecide} onOpen={onOpen} />
                }
                const d = deliveries.find((x) => x.id === item.refId)
                return <DeliveryDecisionCard key={item.id} item={item} delivery={d} onDecide={onDecide} onOpen={onOpen} />
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function PendingInputCard({ pi, onOpen }: { pi: PendingInputRow; onOpen?: (pi: PendingInputRow) => void }) {
  return (
    <article
      className="rounded-[var(--radius-xl)] border p-4"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 35%, var(--border))', background: 'var(--accent-soft)' }}
    >
      <div className="flex items-center gap-2">
        <HelpCircle size={15} className="shrink-0 text-[var(--accent-text)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{pi.question}</span>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: 'var(--accent-text)', background: 'var(--surface-1)' }}>
          待你补充
        </span>
      </div>
      {pi.reason && <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">{pi.reason}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onOpen?.(pi)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          <Wand2 size={14} /> 去补充 / 按默认继续
        </button>
      </div>
    </article>
  )
}

function ActionCard({
  item,
  approval,
  onDecide,
  onOpen,
}: {
  item: ApprovalItem
  approval?: ApprovalRow
  onDecide: (item: ApprovalItem, status: 'approved' | 'rejected') => void
  onOpen?: (item: ApprovalItem) => void
}) {
  const cap = approval ? CAP_LABEL[approval.capability] ?? approval.capability : '高危能力'
  return (
    <article className="rounded-[var(--radius-xl)] border p-4" style={{ borderColor: 'color-mix(in oklch, var(--warning) 35%, var(--border))', background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2">
        <ShieldAlert size={15} className="shrink-0 text-[var(--warning)]" />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">AI 请求:{cap}</span>
        <span className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: 'var(--destructive)', background: 'color-mix(in oklch, var(--destructive) 13%, transparent)' }}>
          高危
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{item.detail}</p>

      {approval?.command && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">
            <Terminal size={11} /> 将执行的命令
          </div>
          <pre className="max-h-28 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--terminal-bg)] p-2 font-mono text-[11px] leading-relaxed text-[var(--terminal-ink)] whitespace-pre-wrap break-words">
            {approval.command}
          </pre>
        </div>
      )}

      <Why>
        <Line icon={<Info size={12} />}>为什么需要你:这是高危能力,默认不自动放行,必须你确认。</Line>
        <Line icon={<Check size={12} />}>批准后:命令在隔离沙盒执行,AI 自动续跑该任务,主项目不受影响。</Line>
        <Line icon={<AlertTriangle size={12} />} tone="var(--warning)">风险:命令可读写沙盒文件;请确认无破坏性操作再批准。</Line>
      </Why>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onDecide(item, 'approved')}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
          style={{ background: 'var(--success)' }}
        >
          <Check size={14} /> 批准并继续
        </button>
        <button
          onClick={() => onDecide(item, 'rejected')}
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--destructive)]"
        >
          <Ban size={14} /> 拒绝
        </button>
        {onOpen && (
          <button
            onClick={() => onOpen(item)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
            title="在工作区查看 / 编辑指令"
          >
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
    </article>
  )
}

function DeliveryDecisionCard({
  item,
  delivery,
  onDecide,
  onOpen,
}: {
  item: ApprovalItem
  delivery?: Delivery
  onDecide: (item: ApprovalItem, status: 'approved' | 'rejected') => void
  onOpen?: (item: ApprovalItem) => void
}) {
  return (
    <article className="rounded-[var(--radius-xl)] border p-4" style={{ borderColor: 'color-mix(in oklch, var(--accent) 32%, var(--border))', background: 'var(--surface-2)' }}>
      <div className="flex items-center gap-2">
        <PackageCheck size={15} className="shrink-0 text-[var(--accent-text)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.title}</span>
        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}>
          待验收
        </span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{item.detail}</p>

      {delivery?.summary && (
        <p className="mt-2 line-clamp-3 rounded-[var(--radius-md)] bg-[var(--surface-3)] p-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {delivery.summary}
        </p>
      )}
      {delivery && delivery.changedFiles.length > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">变更 {delivery.changedFiles.length} 个文件</p>
      )}

      <Why>
        <Line icon={<Info size={12} />}>为什么需要你:AI 已完成并提交一份交付物,需要你验收。</Line>
        <Line icon={<Check size={12} />}>确认后:交付标记为已验收,任务进入收尾。</Line>
        <Line icon={<RotateCcw size={12} />} tone="var(--warning)">打回后:AI 会根据问题继续修正再交付。</Line>
      </Why>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onDecide(item, 'approved')}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
          style={{ background: 'var(--success)' }}
        >
          <Check size={14} /> 确认验收
        </button>
        <button
          onClick={() => onDecide(item, 'rejected')}
          className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium hover:bg-[var(--hover)]"
          style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
        >
          <RotateCcw size={14} /> 打回
        </button>
        {onOpen && (
          <button
            onClick={() => onOpen(item)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
            title="在交付中心查看"
          >
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
    </article>
  )
}

function Why({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">{children}</div>
}

function Line({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px] leading-relaxed" style={{ color: tone ?? 'var(--text-secondary)' }}>
      <span className="mt-0.5 shrink-0" style={{ color: tone ?? 'var(--text-tertiary)' }}>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  )
}
