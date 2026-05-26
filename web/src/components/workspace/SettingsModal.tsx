import { useEffect, useMemo, useState } from 'react'
import {
  X,
  SlidersHorizontal,
  Bot,
  Cpu,
  Server,
  KeyRound,
  Zap,
  Wand2,
  Check,
  Loader2,
  AlertTriangle,
  Wrench,
} from 'lucide-react'
import { api } from '../../lib/api'
import { identityColor, initials } from '../../lib/format'
import type { Assistant, AppSettings, ExecutorPublic } from '../../lib/types'

// Settings:配置「快速任务模板 / 通用任务默认由哪个 AI 执行」。
// 默认执行助手、默认模型展示、Base URL、是否一键执行、缺信息是否用默认假设继续。
// 不暴露 apiKey 明文(只显示「已配置」徽标)。
export function SettingsModal({
  assistants,
  onClose,
  onSaved,
}: {
  assistants: Assistant[]
  onClose: () => void
  onSaved?: (s: AppSettings) => void
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [executor, setExecutor] = useState<ExecutorPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    api
      .settings()
      .then((r) => {
        setSettings(r.settings)
        setExecutor(r.executor)
      })
      .finally(() => setLoading(false))
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 可作为执行人的助手(非图像模型;此处不强校验 key,后端解析可行性)
  const candidates = useMemo(
    () => assistants.filter((a) => !/image|dall-e/i.test(a.model ?? '')),
    [assistants],
  )

  const save = async (patch: Partial<AppSettings>) => {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    setSaving(true)
    try {
      const r = await api.updateSettings({
        defaultExecutorId: next.defaultExecutorId,
        autoRun: next.autoRun,
        assumeDefaults: next.assumeDefaults,
      })
      setSettings(r.settings)
      setExecutor(r.executor)
      setSavedAt(Date.now())
      onSaved?.(r.settings)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="scrim-in fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklch,black_58%,transparent)] p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="cockpit-in my-auto w-full max-w-2xl rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <SlidersHorizontal size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">
              Settings · 执行偏好
            </div>
            <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--text-primary)]">
              快速任务 / 通用任务的默认执行配置
            </h2>
          </div>
          {saving ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Loader2 size={12} className="animate-spin" /> 保存中
            </span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
              <Check size={12} /> 已保存
            </span>
          ) : null}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]"
          >
            <X size={17} />
          </button>
        </header>

        {loading || !settings ? (
          <div className="py-16 text-center text-[12px] text-[var(--text-tertiary)]">加载设置…</div>
        ) : (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-5">
            {/* 默认执行助手 */}
            <Section icon={<Bot size={13} />} title="默认执行助手" hint="快速模板 / 通用任务优先用它;若它不具备某步所需能力,会按角色自动路由给合适的助手。">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => save({ defaultExecutorId: null })}
                  className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left transition-colors"
                  style={
                    !settings.defaultExecutorId
                      ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface-2)' }
                  }
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-3)] text-[var(--text-tertiary)]">
                    <Wand2 size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)]">自动按角色挑选</div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">每步选最合适的可用助手</div>
                  </div>
                </button>
                {candidates.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => save({ defaultExecutorId: a.id })}
                    className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left transition-colors"
                    style={
                      settings.defaultExecutorId === a.id
                        ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                        : { borderColor: 'var(--border)', background: 'var(--surface-2)' }
                    }
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-semibold text-white"
                      style={{ background: identityColor(a.avatarColor) }}
                    >
                      {initials(a.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{a.name}</div>
                      <div className="truncate text-[11px] text-[var(--text-tertiary)]">{a.model || '(未设模型)'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>

            {/* 解析出的默认执行人信息(模型 / Base URL / key 状态 / 工具)*/}
            {executor && (
              <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-semibold text-white"
                    style={{ background: identityColor(executor.avatarColor) }}
                  >
                    {initials(executor.name)}
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">{executor.name}</span>
                  {executor.available ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: 'var(--success)', background: 'color-mix(in oklch, var(--success) 13%, transparent)' }}>
                      <Check size={10} /> 可执行
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: 'var(--warning)', background: 'color-mix(in oklch, var(--warning) 13%, transparent)' }}>
                      <AlertTriangle size={10} /> 未配置可用模型
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <Field icon={<Cpu size={11} />} label="模型">{executor.model}</Field>
                  <Field icon={<Server size={11} />} label="Base URL">{executor.baseUrlHost}</Field>
                  <Field icon={<KeyRound size={11} />} label="密钥">
                    {executor.hasApiKey ? '已配置' : '未配置'}
                  </Field>
                </div>
                {executor.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Wrench size={11} className="text-[var(--text-tertiary)]" />
                    {executor.tools.map((t) => (
                      <span key={t} className="rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 开关 */}
            <Section icon={<Zap size={13} />} title="执行行为" hint="控制快速模板默认怎么跑、缺信息时怎么办。">
              <Toggle
                icon={<Zap size={14} />}
                label="默认一键跑完"
                desc="点模板默认用「一键跑完」模式自动推进所有步骤(否则默认逐步确认)。"
                on={settings.autoRun}
                onToggle={() => save({ autoRun: !settings.autoRun })}
              />
              <Toggle
                icon={<Wand2 size={14} />}
                label="缺信息时按默认假设继续"
                desc="遇到澄清点时,AI 用最合理的 MVP 默认假设继续并标注假设,而不是停下等你;关掉则会弹出结构化补充提问。"
                on={settings.assumeDefaults}
                onToggle={() => save({ assumeDefaults: !settings.assumeDefaults })}
              />
            </Section>

            <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
              密钥不会在此明文展示或编辑;要改模型 / 端点 / 密钥,请在「AI 助手」里编辑对应助手。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4 first:mt-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[var(--accent-text)]">{icon}</span>
        <span className="text-[12px] font-semibold tracking-[0.04em] text-[var(--text-secondary)] uppercase">{title}</span>
      </div>
      {hint && <p className="mb-2.5 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{hint}</p>}
      {children}
    </section>
  )
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] tracking-wide text-[var(--text-tertiary)]">
        {icon} {label}
      </div>
      <div className="mt-0.5 truncate text-[12px] font-medium text-[var(--text-primary)]" title={String(children)}>
        {children}
      </div>
    </div>
  )
}

function Toggle({
  icon,
  label,
  desc,
  on,
  onToggle,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="mb-2 flex w-full items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-3)', color: on ? 'var(--accent-text)' : 'var(--text-tertiary)' }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{desc}</div>
      </div>
      <span
        className="mt-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--surface-3)' }}
      >
        <span
          className="h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}
