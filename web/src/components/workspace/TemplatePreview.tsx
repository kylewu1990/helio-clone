import { useEffect, useRef, useState } from 'react'
import {
  X,
  Target,
  Users,
  Wrench,
  Hand,
  PackageCheck,
  Play,
  ListChecks,
  Footprints,
  Zap,
  Loader2,
  FileWarning,
  Cpu,
  FilePen,
  TerminalSquare,
  MonitorPlay,
  ShieldAlert,
  Settings as SettingsIcon,
  MapPin,
} from 'lucide-react'
import { identityColor, initials } from '../../lib/format'
import type { TemplateResolved } from '../../lib/types'

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--destructive)',
  high: 'var(--warning)',
  medium: 'var(--info)',
  low: 'var(--text-tertiary)',
}

type Mode = 'auto' | 'confirm' | 'plan'
const MODES: { id: Mode; icon: React.ReactNode; title: string; desc: string }[] = [
  { id: 'auto', icon: <Zap size={15} />, title: '一键跑完', desc: '用默认假设自动推进所有步骤,直到交付或遇阻' },
  { id: 'confirm', icon: <Footprints size={15} />, title: '逐步确认', desc: '每个步骤前由你确认再执行' },
  { id: 'plan', icon: <ListChecks size={15} />, title: '只生成计划', desc: '只拆解落库,不执行' },
]

// 模板执行计划预览:执行前展示每步「执行人 / 模型 / 工具 / 是否写文件·跑命令·开浏览器 / 人工确认点 / 交付物」,
// 顶部三模式选择;槽位目标可编辑;无合适执行人时引导去 Settings。
export function TemplatePreview({
  template,
  defaultMode,
  onClose,
  onStart,
  onOpenSettings,
}: {
  template: TemplateResolved
  defaultMode: Mode
  onClose: () => void
  onStart: (goal: string, mode: Mode) => Promise<void>
  onOpenSettings: () => void
}) {
  const [goal, setGoal] = useState(template.goalTemplate)
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [starting, setStarting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taRef.current?.focus()
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !starting && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, starting])

  const hasSlot = /\[.+?\]/.test(goal)
  const start = async () => {
    if (starting) return
    setStarting(true)
    try {
      await onStart(goal.trim(), mode)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div
      className="scrim-in fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklch,black_58%,transparent)] p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="cockpit-in my-auto w-full max-w-3xl rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Target size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
              快速模板 · {template.category}
            </div>
            <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--text-primary)]">{template.title} · 执行计划预览</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={17} />
          </button>
        </header>

        <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-5">
          {/* 目标(可改槽位) */}
          <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
            <Target size={16} className="mt-0.5 shrink-0 text-[var(--accent-text)]" />
            <textarea
              ref={taRef}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
            />
          </div>
          {hasSlot && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--warning)]">
              <FileWarning size={12} /> 把目标里的 [方括号] 换成你的具体内容再开始
            </p>
          )}

          {/* 主执行人 + 可行性 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <Users size={13} className="text-[var(--text-tertiary)]" />
            <span className="text-[11px] text-[var(--text-tertiary)]">主要执行人</span>
            {template.primaryExecutor ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-md)] text-[10px] font-semibold text-white"
                  style={{ background: identityColor(template.primaryExecutor.avatarColor) }}
                >
                  {initials(template.primaryExecutor.name)}
                </span>
                <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{template.primaryExecutor.name}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                  <Cpu size={10} /> {template.primaryExecutor.model}
                </span>
              </span>
            ) : (
              <span className="text-[12px] text-[var(--warning)]">未解析到合适执行人</span>
            )}
            {!template.available && (
              <button
                onClick={onOpenSettings}
                className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--accent-text)] hover:bg-[var(--hover)]"
              >
                <SettingsIcon size={11} /> 去 Settings 配置
              </button>
            )}
          </div>
          {!template.available && template.blockedReason && (
            <p className="mt-1.5 flex items-start gap-1 text-[11.5px] leading-relaxed text-[var(--warning)]">
              <ShieldAlert size={12} className="mt-0.5 shrink-0" /> {template.blockedReason}
            </p>
          )}

          {/* 模式选择 */}
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">怎么跑</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="flex flex-col gap-1 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left transition-colors"
                  style={
                    mode === m.id
                      ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface-2)' }
                  }
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: mode === m.id ? 'var(--accent-text)' : 'var(--text-primary)' }}>
                    {m.icon} {m.title}
                  </span>
                  <span className="text-[11px] leading-snug text-[var(--text-tertiary)]">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 步骤(每步执行人/模型/工具/风险) */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
              <Wrench size={13} className="text-[var(--text-tertiary)]" /> 执行步骤 · {template.steps.length}
            </div>
            <ol className="flex flex-col gap-2">
              {template.steps.map((s, i) => (
                <li key={i} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-text)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{s.title}</p>
                        {/* 该步执行人 */}
                        {s.executor ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]" title={`${s.executor.name} · ${s.executor.model}`}>
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[8px] font-semibold text-white"
                              style={{ background: identityColor(s.executor.avatarColor) }}
                            >
                              {initials(s.executor.name)}
                            </span>
                            {s.executor.name}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 13%, transparent)' }}>
                            <ShieldAlert size={10} /> 缺执行人
                          </span>
                        )}
                      </div>
                      {s.detail && <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{s.detail}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {s.executor && (
                          <Chip>
                            <Cpu size={10} className="text-[var(--text-tertiary)]" /> {s.executor.model}
                          </Chip>
                        )}
                        {s.tool && <Chip><Wrench size={10} className="text-[var(--text-tertiary)]" /> {s.tool}</Chip>}
                        {s.writesFiles && <RiskChip icon={<FilePen size={10} />} tone="var(--info)">写文件</RiskChip>}
                        {s.runsCommands && <RiskChip icon={<TerminalSquare size={10} />} tone="var(--warning)">跑命令</RiskChip>}
                        {s.opensBrowser && <RiskChip icon={<MonitorPlay size={10} />} tone="var(--accent-text)">开浏览器</RiskChip>}
                        {s.needsApproval && <RiskChip icon={<Hand size={10} />} tone="var(--destructive)">需你确认</RiskChip>}
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color: PRIORITY_COLOR[s.priority], background: `color-mix(in oklch, ${PRIORITY_COLOR[s.priority]} 13%, transparent)` }}
                        >
                          {s.priority}
                        </span>
                        {s.deliverable && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                            <PackageCheck size={11} /> {s.deliverable}
                          </span>
                        )}
                      </div>
                      {!s.executor && s.executorReason && (
                        <p className="mt-1.5 text-[11px] text-[var(--warning)]">{s.executorReason}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 缺信息处理 / 交付位置 */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Info icon={<Hand size={12} />} title="失败 / 缺信息怎么办" tone="var(--warning)">
              {template.failureHandling}
            </Info>
            <Info icon={<MapPin size={12} />} title="交付落在哪" tone="var(--accent-text)">
              {template.deliveryLocation}
            </Info>
          </div>

          {/* 操作 */}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              onClick={start}
              disabled={starting || (hasSlot && mode !== 'plan')}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-lg)] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
              title={hasSlot && mode !== 'plan' ? '先把 [方括号] 槽位换成具体内容' : ''}
            >
              {starting ? <Loader2 size={15} className="animate-spin" /> : mode === 'plan' ? <ListChecks size={15} /> : <Play size={15} />}
              {mode === 'auto' ? '一键跑完' : mode === 'confirm' ? '创建并执行第一步' : '只生成计划'}
            </button>
          </div>
          <p className="mt-2 text-right text-[11px] text-[var(--text-tertiary)]">
            步骤会真实落库为子任务;{mode === 'plan' ? '不会执行' : mode === 'auto' ? '自动推进直到交付或遇阻' : '执行完一步后由你确认下一步'}。
          </p>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
      {children}
    </span>
  )
}
function RiskChip({ icon, tone, children }: { icon: React.ReactNode; tone: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: tone, background: `color-mix(in oklch, ${tone} 13%, transparent)` }}
    >
      {icon} {children}
    </span>
  )
}
function Info({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: tone }}>
        {icon} {title}
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{children}</p>
    </div>
  )
}
