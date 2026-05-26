import { useState } from 'react'
import {
  PackageCheck,
  Check,
  RotateCcw,
  FileCode2,
  ShieldCheck,
  AlertTriangle,
  ListChecks,
  FileText,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Avatar } from '../Avatar'
import { InteractivePreview } from './InteractivePreview'
import { relativeTime } from '../../lib/format'
import type { Delivery, Task, SandboxRunListRow, SandboxChangedFile } from '../../lib/types'

const TEST_META: Record<string, { label: string; color: string }> = {
  pass: { label: '验证通过', color: 'var(--success)' },
  fail: { label: '验证失败', color: 'var(--destructive)' },
  skipped: { label: '未跑验证', color: 'var(--text-tertiary)' },
}
const RISK_META: Record<string, { label: string; color: string }> = {
  low: { label: '低风险', color: 'var(--success)' },
  medium: { label: '中风险', color: 'var(--warning)' },
  high: { label: '高风险', color: 'var(--destructive)' },
}
const FILE_STATUS: Record<string, { label: string; color: string }> = {
  added: { label: '新增', color: 'var(--success)' },
  modified: { label: '修改', color: 'var(--warning)' },
  deleted: { label: '删除', color: 'var(--destructive)' },
}

function sandboxFiles(sb?: SandboxRunListRow | null): SandboxChangedFile[] {
  if (!sb?.changedFiles) return []
  try {
    return JSON.parse(sb.changedFiles)
  } catch {
    return []
  }
}

// 交付中心:每个交付物回答「报告在哪、改了什么、验证了吗、风险、下一步怎么验收」。
export function DeliveryCenter({
  deliveries,
  sandboxRuns,
  doneTasks,
  onDecide,
  onCreate,
}: {
  deliveries: Delivery[]
  sandboxRuns: SandboxRunListRow[]
  doneTasks: Task[]
  onDecide: (id: string, status: 'approved' | 'rejected') => void
  onCreate?: (data: { taskId?: string; missionId?: string; title: string; summary?: string }) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {onCreate && doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            <Plus size={13} /> 从已完成任务生成交付
          </button>
          {adding && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              {doneTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onCreate({
                      taskId: t.id,
                      missionId: t.missionId ?? undefined,
                      title: `交付:${t.title}`,
                      summary: t.expectedOutput ?? undefined,
                    })
                    setAdding(false)
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1.5 text-left text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover)]"
                >
                  <Plus size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {deliveries.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <PackageCheck size={26} className="mx-auto text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="mt-3 text-[13px] font-medium text-[var(--text-secondary)]">还没有交付物</p>
          <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
            任务执行成功后,在执行驾驶舱点「生成交付」,这里会汇总报告、变更、验证与验收步骤。
          </p>
        </div>
      ) : (
        deliveries.map((d) => {
          const sb =
            sandboxRuns.find((s) => s.taskId && d.missionId && s.taskId && s.missionId === d.missionId) ??
            sandboxRuns.find((s) => s.missionId === d.missionId) ??
            null
          return <DeliveryCard key={d.id} d={d} sandbox={sb} onDecide={onDecide} />
        })
      )}
    </div>
  )
}

function DeliveryCard({
  d,
  sandbox,
  onDecide,
}: {
  d: Delivery
  sandbox: SandboxRunListRow | null
  onDecide: (id: string, status: 'approved' | 'rejected') => void
}) {
  const [filesOpen, setFilesOpen] = useState(true)
  const test = d.testResult ? TEST_META[d.testResult] : sandbox?.buildResult ? TEST_META[sandbox.buildResult] : null
  const risk = d.riskLevel ? RISK_META[d.riskLevel] : null
  const pending = d.status === 'pending'
  const web = d.interactive ?? null
  const fileList = web?.files?.length ? web.files : d.changedFiles
  const files = fileList.length
    ? fileList.map((f) => ({ path: f, status: 'modified' as const }))
    : sandboxFiles(sandbox)
  // 文档结构预览:把 summary 按行/句拆成大纲
  const summaryLines = d.summary
    ? d.summary.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 8)
    : []

  return (
    <article
      className="rounded-[var(--radius-xl)] border p-4"
      style={{
        background: pending ? 'var(--surface-2)' : 'var(--surface-1)',
        borderColor: pending ? 'color-mix(in oklch, var(--accent) 30%, var(--border))' : 'var(--border)',
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] text-[var(--text-tertiary)] uppercase">
            <PackageCheck size={12} className="text-[var(--accent-text)]" /> 交付物
          </div>
          <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">{d.missionTitle}</h3>
        </div>
        <StatusPill status={d.status} />
      </header>

      {/* 元信息 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {d.assigneeName && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Avatar user={{ name: d.assigneeName, avatarColor: d.assigneeColor ?? 5, isAssistant: true }} size={16} />
            {d.assigneeName} 提交
          </span>
        )}
        <span className="text-[11px] text-[var(--text-tertiary)]">{relativeTime(d.createdAt)}</span>
        {test && <Badge label={test.label} color={test.color} icon={<ShieldCheck size={11} />} />}
        {risk && <Badge label={risk.label} color={risk.color} icon={<AlertTriangle size={11} />} />}
        {web?.previewUrl && (
          <Badge label="可交互" color="var(--accent-text)" icon={<PackageCheck size={11} />} />
        )}
      </div>

      {/* Interactive Delivery:主交付 = 可交互 Web 预览(回答「可交互地址在哪 / 怎么打开」) */}
      {web?.previewUrl && (
        <div className="mt-3">
          <InteractivePreview
            previewUrl={web.previewUrl}
            entry={web.entry}
            files={web.files}
            buildResult={web.buildResult}
            height={340}
          />
          {/* 生命周期诚实标注(P1.4):沙盒预览有时效,apply 后才永久;失效则看 diff */}
          <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
            {sandbox?.status === 'discarded'
              ? '沙盒预览已过期(沙盒已丢弃),可查看下方代码 diff。'
              : sandbox?.status === 'applied'
                ? '改动已应用到项目,预览长期有效。'
                : '沙盒预览(apply 前可用)· 应用到项目后永久有效;沙盒被清理后此预览会失效,届时看代码 diff。'}
          </p>
        </div>
      )}

      {/* Summary / 文档结构预览 */}
      {summaryLines.length > 0 && (
        <Section icon={<FileText size={13} />} title="Summary · 内容概览">
          {summaryLines.length > 1 ? (
            <ul className="flex flex-col gap-1">
              {summaryLines.map((l, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{l.replace(/^[-*\d.、)]+\s*/, '')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{summaryLines[0]}</p>
          )}
        </Section>
      )}

      {/* Changed Files */}
      {files.length > 0 && (
        <Section
          icon={<FileCode2 size={13} />}
          title={`Changed Files · ${files.length}`}
          onToggle={() => setFilesOpen((v) => !v)}
          open={filesOpen}
        >
          {filesOpen && (
            <ul className="flex flex-col gap-1">
              {files.map((f) => {
                const fm = FILE_STATUS[f.status] ?? { label: f.status, color: 'var(--ink-30)' }
                return (
                  <li key={f.path} className="flex items-center gap-2 text-[11.5px]">
                    <span
                      className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                      style={{ color: fm.color, background: `color-mix(in oklch, ${fm.color} 14%, transparent)` }}
                    >
                      {fm.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{f.path}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {sandbox?.diffSummary && (
            <p className="mt-1.5 font-mono text-[10.5px] text-[var(--text-tertiary)]">{sandbox.diffSummary}</p>
          )}
        </Section>
      )}

      {/* Verification + Risk */}
      <Section icon={<ShieldCheck size={13} />} title="Verification & Risk">
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Field label="验证">
            <span style={{ color: test?.color ?? 'var(--text-tertiary)' }}>{test?.label ?? '未跑验证'}</span>
          </Field>
          <Field label="风险">
            <span style={{ color: risk?.color ?? 'var(--text-tertiary)' }}>{risk?.label ?? '未评估'}</span>
          </Field>
          {sandbox && (
            <Field label="沙盒">
              {sandbox.status === 'applied' ? '已应用主项目' : sandbox.status === 'ready_for_review' ? '待验收应用' : sandbox.status}
            </Field>
          )}
        </div>
      </Section>

      {/* Human Acceptance Steps */}
      <Section icon={<ListChecks size={13} />} title="人工验收步骤">
        <ol className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
          {acceptanceSteps(d, files.length, !!sandbox).map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-[var(--text-tertiary)]">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* 决策 */}
      {pending ? (
        <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
          <button
            onClick={() => onDecide(d.id, 'approved')}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--success)' }}
          >
            <Check size={14} /> 确认验收
          </button>
          <button
            onClick={() => onDecide(d.id, 'rejected')}
            className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--hover)]"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
          >
            <RotateCcw size={14} /> 打回
          </button>
        </div>
      ) : (
        <div
          className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border-t border-[var(--border)] pt-3 text-[12px] font-medium"
          style={{ color: d.status === 'approved' ? 'var(--success)' : 'var(--warning)' }}
        >
          {d.status === 'approved' ? <Check size={13} /> : <RotateCcw size={13} />}
          {d.status === 'approved' ? '已验收' : '已打回'}
        </div>
      )}
    </article>
  )
}

function acceptanceSteps(d: Delivery, fileCount: number, hasSandbox: boolean): string[] {
  const steps: string[] = ['阅读上方 Summary,确认目标已达成']
  if (fileCount > 0) steps.push(`核对 ${fileCount} 个变更文件是否符合预期`)
  if (hasSandbox) steps.push('如改动需落地,在执行驾驶舱「批准应用到主项目」')
  steps.push(d.testResult === 'pass' ? '确认验证结果可信' : '如需要,补跑一次验证')
  steps.push('点「确认验收」完成交付,或「打回」让 AI 修正')
  return steps
}

function StatusPill({ status }: { status: string }) {
  const m =
    status === 'approved'
      ? { label: '已验收', color: 'var(--success)' }
      : status === 'rejected'
        ? { label: '已打回', color: 'var(--warning)' }
        : { label: '待你验收', color: 'var(--accent)' }
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: m.color, background: `color-mix(in oklch, ${m.color} 14%, transparent)` }}
    >
      {m.label}
    </span>
  )
}

function Section({
  icon,
  title,
  children,
  onToggle,
  open,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  onToggle?: () => void
  open?: boolean
}) {
  return (
    <section className="mt-3 border-t border-[var(--border)] pt-3">
      <button
        onClick={onToggle}
        disabled={!onToggle}
        className="mb-1.5 flex w-full items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)]"
      >
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        {title}
        {onToggle && (
          <span className="ml-auto text-[var(--text-tertiary)]">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
      <span className="font-medium">{children}</span>
    </span>
  )
}

function Badge({ label, color, icon }: { label: string; color: string; icon?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color, background: `color-mix(in oklch, ${color} 13%, transparent)` }}
    >
      {icon}
      {label}
    </span>
  )
}
