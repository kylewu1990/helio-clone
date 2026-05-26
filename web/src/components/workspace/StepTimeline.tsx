import {
  Brain,
  FolderSearch,
  FilePen,
  FlaskConical,
  PackagePlus,
  Hand,
  Check,
  Loader2,
  AlertTriangle,
  Circle,
} from 'lucide-react'
import { toolVerb, type ProductStep, type StepStatus } from '../../lib/steps'

const PHASE_ICON: Record<string, React.ReactNode> = {
  understand: <Brain size={14} />,
  context: <FolderSearch size={14} />,
  write: <FilePen size={14} />,
  verify: <FlaskConical size={14} />,
  deliver: <PackagePlus size={14} />,
  await: <Hand size={14} />,
}

const STATUS_META: Record<StepStatus, { color: string; ring: string }> = {
  done: { color: 'var(--success)', ring: 'var(--success)' },
  active: { color: 'var(--info)', ring: 'var(--info)' },
  pending: { color: 'var(--text-tertiary)', ring: 'var(--border-strong)' },
  failed: { color: 'var(--destructive)', ring: 'var(--destructive)' },
  waiting: { color: 'var(--warning)', ring: 'var(--warning)' },
}

const STATUS_LABEL: Record<StepStatus, string> = {
  done: '已完成',
  active: '进行中',
  pending: '待进行',
  failed: '失败',
  waiting: '等待你',
}

// 产品化执行步骤时间线:理解需求 → 读取上下文 → 写入/修改 → 运行验证 → 生成交付 → 等待确认。
// 每步显示状态/结果摘要/用到的能力(人类可读),原始工具名收进次级 chip。
export function StepTimeline({
  steps,
  executorName,
}: {
  steps: ProductStep[]
  executorName?: string
}) {
  if (!steps.length)
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] py-8 text-center text-[12px] text-[var(--text-tertiary)]">
        还没有执行步骤
      </div>
    )
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => {
        const meta = STATUS_META[s.status]
        const last = i === steps.length - 1
        return (
          <li key={s.key} className="relative flex gap-3 pb-4">
            {!last && (
              <span
                className="absolute top-7 left-[13px] bottom-0 w-px"
                style={{ background: 'var(--border)' }}
              />
            )}
            {/* 状态节点 */}
            <span
              className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                color: meta.color,
                background: `color-mix(in oklch, ${meta.color} 14%, var(--surface-1))`,
                boxShadow: `0 0 0 1px color-mix(in oklch, ${meta.ring} 40%, transparent)`,
              }}
            >
              {s.status === 'done' ? (
                <Check size={14} strokeWidth={2.5} />
              ) : s.status === 'active' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : s.status === 'failed' ? (
                <AlertTriangle size={13} />
              ) : s.status === 'waiting' ? (
                PHASE_ICON[s.key]
              ) : s.status === 'pending' ? (
                <Circle size={11} />
              ) : (
                PHASE_ICON[s.key]
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {s.label}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    color: meta.color,
                    background: `color-mix(in oklch, ${meta.color} 13%, transparent)`,
                  }}
                >
                  {STATUS_LABEL[s.status]}
                </span>
                {executorName && (s.status === 'active' || s.status === 'done') && (
                  <span className="text-[11px] text-[var(--text-tertiary)]">· {executorName}</span>
                )}
              </div>

              {/* 结果摘要 / 失败原因 */}
              {s.error ? (
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--destructive)]">
                  {s.error}
                </p>
              ) : s.detail ? (
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {s.detail}
                </p>
              ) : (
                <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{s.hint}</p>
              )}

              {/* 用到的能力(人类可读) */}
              {s.tools.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.tools.map((t) => (
                    <span
                      key={t.tool}
                      className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]"
                      title={t.tool}
                    >
                      {toolVerb(t.tool)}
                      {t.count > 1 && <span className="text-[var(--text-tertiary)]">×{t.count}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
