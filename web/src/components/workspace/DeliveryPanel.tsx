import { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  PackageCheck,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { Avatar } from '../Avatar'
import { relativeTime } from '../../lib/format'
import { SectionTitle, EmptyHint } from './AgentRoster'
import type { Delivery, Task } from '../../lib/types'

const TEST_META: Record<
  NonNullable<Delivery['testResult']>,
  { label: string; color: string }
> = {
  pass: { label: '测试通过', color: 'var(--success)' },
  fail: { label: '测试失败', color: 'var(--destructive)' },
  skipped: { label: '未跑测试', color: 'var(--text-tertiary)' },
}

const RISK_META: Record<
  NonNullable<Delivery['riskLevel']>,
  { label: string; color: string }
> = {
  low: { label: '低风险', color: 'var(--success)' },
  medium: { label: '中风险', color: 'var(--warning)' },
  high: { label: '高风险', color: 'var(--destructive)' },
}

// Delivery Panel:真实交付物。确认 / 打回经后端落库(刷新仍在)。可从已完成任务生成交付。
export function DeliveryPanel({
  deliveries,
  doneTasks,
  onDecide,
  onCreate,
}: {
  deliveries: Delivery[]
  doneTasks: Task[]
  onDecide: (id: string, status: 'approved' | 'rejected') => void
  onCreate: (data: { taskId?: string; missionId?: string; title: string; summary?: string }) => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between">
        <SectionTitle
          icon={<PackageCheck size={13} />}
          title="交付确认"
          count={deliveries.length || undefined}
        />
        {doneTasks.length > 0 && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="mb-2 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent-text)]"
          >
            {adding ? '收起' : '+ 生成交付'}
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2 flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-2.5">
          <p className="text-[11px] text-[var(--text-tertiary)]">
            从已完成任务生成真实交付物(待你确认):
          </p>
          {doneTasks.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onCreate({
                  taskId: t.id,
                  missionId: t.missionId ?? undefined,
                  title: t.title,
                  summary: t.expectedOutput ?? undefined,
                })
                setAdding(false)
              }}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-left text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--hover)]"
            >
              <Plus size={12} className="shrink-0 text-[var(--text-tertiary)]" />
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
        {deliveries.length === 0 && !adding && (
          <EmptyHint text="暂无待确认交付。把已完成任务「生成交付」后,在此等待你确认。" />
        )}
        {deliveries.map((d) => (
          <DeliveryCard key={d.id} delivery={d} onDecide={onDecide} />
        ))}
      </div>
    </section>
  )
}

function DeliveryCard({
  delivery,
  onDecide,
}: {
  delivery: Delivery
  onDecide: (id: string, status: 'approved' | 'rejected') => void
}) {
  const [open, setOpen] = useState(false)
  const test = delivery.testResult ? TEST_META[delivery.testResult] : null
  const risk = delivery.riskLevel ? RISK_META[delivery.riskLevel] : null
  const pending = delivery.status === 'pending'

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-3"
      style={{
        background: pending ? 'var(--glass-surface)' : 'var(--canvas)',
        borderColor: pending ? 'var(--glass-border)' : 'var(--border)',
        backdropFilter: pending ? 'blur(8px)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--text-primary)]">
          {delivery.missionTitle}
        </p>
        <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
          {relativeTime(delivery.createdAt)}
        </span>
      </div>
      {delivery.summary && (
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {delivery.summary}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {delivery.assigneeName && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Avatar
              user={{
                name: delivery.assigneeName,
                avatarColor: delivery.assigneeColor ?? 5,
                isAssistant: false,
              }}
              size={16}
            />
            <span className="max-w-20 truncate">{delivery.assigneeName}</span>
          </span>
        )}
        {test && <Badge label={test.label} color={test.color} />}
        {risk && <Badge label={risk.label} color={risk.color} />}
        {delivery.changedFiles.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--paper-mid)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {delivery.changedFiles.length} 个文件
          </button>
        )}
      </div>

      {open && delivery.changedFiles.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--border)] pt-2">
          {delivery.changedFiles.map((f) => (
            <li
              key={f}
              className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-secondary)]"
            >
              <FileCode2 size={11} className="shrink-0 text-[var(--text-tertiary)]" />
              <span className="truncate">{f}</span>
            </li>
          ))}
        </ul>
      )}

      {pending ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onDecide(delivery.id, 'approved')}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--success)' }}
          >
            <Check size={13} /> 确认交付
          </button>
          <button
            onClick={() => onDecide(delivery.id, 'rejected')}
            className="inline-flex items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--hover)]"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
          >
            <RotateCcw size={13} /> 打回
          </button>
        </div>
      ) : (
        <div
          className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-xs font-medium"
          style={{
            color: delivery.status === 'approved' ? 'var(--success)' : 'var(--warning)',
            background:
              delivery.status === 'approved'
                ? 'var(--success-soft)'
                : 'color-mix(in oklch, var(--warning) 10%, transparent)',
          }}
        >
          {delivery.status === 'approved' ? (
            <>
              <Check size={13} /> 已确认交付
            </>
          ) : (
            <>
              <RotateCcw size={13} /> 已打回
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}
