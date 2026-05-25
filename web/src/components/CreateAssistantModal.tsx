import { useEffect, useState } from 'react'
import { Bot, Sparkles, Wrench, X } from 'lucide-react'
import { identityColor } from '../lib/format'
import { api } from '../lib/api'
import type {
  Assistant,
  AssistantPreset,
  ChannelSummary,
  ProviderInfo,
  Skill,
} from '../lib/types'
import { KNOWN, TIER_LABEL } from '../lib/constants'

const COLORS = Array.from({ length: 12 }, (_, i) => i + 1)

export function CreateAssistantModal({
  editing,
  onClose,
  onSubmit,
}: {
  editing?: Assistant | null
  onClose: () => void
  onSubmit: (data: {
    name: string
    systemPrompt?: string
    provider?: string
    baseUrl?: string
    apiKey?: string
    model?: string
    skills?: string[]
    channelIds?: string[]
    avatarColor?: number
    autoRespond?: boolean
    memory?: string
  }) => Promise<void>
}) {
  const isEdit = !!editing

  const initProviderSel = () => {
    if (!editing) return 'openai'
    if (editing.baseUrl) {
      const k = KNOWN.find((x) => x.baseUrl === editing.baseUrl)
      return k ? k.id : 'custom'
    }
    return 'server:' + (editing.provider || 'default')
  }

  const [presets, setPresets] = useState<AssistantPreset[]>([])
  const [serverProviders, setServerProviders] = useState<ProviderInfo[]>([])
  const [allSkills, setAllSkills] = useState<Skill[]>([])
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [channelIds, setChannelIds] = useState<string[]>([])
  const [presetId, setPresetId] = useState<string | null>(null)
  const [presetQuery, setPresetQuery] = useState('')
  const [name, setName] = useState(editing?.name ?? '')
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? '')
  const [providerSel, setProviderSel] = useState(initProviderSel())
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? KNOWN[0].baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(editing?.model ?? KNOWN[0].models[0])
  const [skills, setSkills] = useState<string[]>(editing?.skills ?? [])
  const [avatarColor, setAvatarColor] = useState(editing?.avatarColor ?? 9)
  const [autoRespond, setAutoRespond] = useState(editing?.autoRespond ?? true)
  const [memory, setMemory] = useState(editing?.memory ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isEdit) api.assistantPresets().then(setPresets)
    api.channels().then((cs) => {
      const open = cs.filter((c) => !c.isDM)
      setChannels(open)
      setChannelIds(
        isEdit ? editing?.channelIds ?? [] : open.map((c) => c.id),
      )
    })
    api.skills().then(setAllSkills)
    api.providers().then((r) => setServerProviders(r.providers))
  }, [isEdit, editing])

  const isDirect = !providerSel.startsWith('server:')
  const known = KNOWN.find((k) => k.id === providerSel)
  const serverP = serverProviders.find(
    (p) => 'server:' + p.id === providerSel,
  )

  const applyPreset = (p: AssistantPreset) => {
    setPresetId(p.id)
    setName(p.nameZh)
    setSystemPrompt(p.systemPrompt)
    setSkills(p.skills)
    setAvatarColor(p.color)
  }

  const toggleSkill = (id: string) =>
    setSkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    )

  const changeProvider = (sel: string) => {
    setProviderSel(sel)
    if (sel.startsWith('server:')) {
      const sp = serverProviders.find((p) => 'server:' + p.id === sel)
      if (sp?.models.length) setModel(sp.models[0])
    } else {
      const k = KNOWN.find((x) => x.id === sel)!
      setBaseUrl(k.baseUrl)
      if (k.models.length) setModel(k.models[0])
    }
  }

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const data: Parameters<typeof onSubmit>[0] = {
        name: name.trim(),
        systemPrompt: systemPrompt.trim() || undefined,
        model: model.trim() || undefined,
        skills,
        channelIds,
        avatarColor,
        autoRespond,
        memory: memory.trim(),
      }
      if (isDirect) {
        data.provider = providerSel
        data.baseUrl = baseUrl.trim()
        if (apiKey.trim()) data.apiKey = apiKey.trim()
        else if (!isEdit) data.apiKey = ''
      } else {
        data.provider = providerSel.slice('server:'.length)
        data.baseUrl = '' // 清掉自带连接,改用服务器配置
      }
      await onSubmit(data)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--canvas)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Bot size={16} />
            </span>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {isEdit ? '编辑助手' : '新建 AI 助手'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!isEdit && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <Sparkles size={13} /> 选择职业模板(可改)
              </div>
              <input
                value={presetQuery}
                onChange={(e) => setPresetQuery(e.target.value)}
                placeholder="搜索职业…(如 工程 / 营销 / SEO)"
                className="mb-2 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
              />
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {presets
                  .filter((p) => {
                    const q = presetQuery.trim().toLowerCase()
                    return (
                      !q ||
                      p.nameZh.toLowerCase().includes(q) ||
                      p.name.toLowerCase().includes(q) ||
                      p.tagline.toLowerCase().includes(q)
                    )
                  })
                  .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border p-2.5 text-left transition-colors"
                    style={{
                      borderColor:
                        presetId === p.id ? 'var(--accent)' : 'var(--border)',
                      background:
                        presetId === p.id ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-bold text-white"
                      style={{ background: identityColor(p.color) }}
                    >
                      {p.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {p.nameZh}
                        </span>
                        <span className="shrink-0 rounded px-1 text-[10px] text-[var(--text-tertiary)] ring-1 ring-[var(--border)]">
                          {TIER_LABEL[p.tier]}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--text-tertiary)]">
                        {p.tagline}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如:法务"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            />
          </Field>

          <Field label="人设 / 指令(System Prompt)">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              placeholder="描述助手的角色、职责、语气与边界。"
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)] focus:outline-none"
            />
          </Field>

          <Field label="长期记忆(可空;助手也会用「记笔记」工具自动补充)">
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              rows={3}
              placeholder="跨对话保留:用户偏好、长期事实、团队约定…每次对话都会注入 system prompt。"
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)] focus:outline-none"
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Wrench size={13} /> 技能 / 工具(模型按需自动调用)
            </div>
            <div className="flex flex-wrap gap-2">
              {allSkills.map((s) => {
                const on = skills.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSkill(s.id)}
                    title={s.description}
                    className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      background: on ? 'var(--accent-soft)' : 'transparent',
                      color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
                    }}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>

          {channels.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
                加入频道(可在其中 @ 它)
              </div>
              <div className="flex flex-wrap gap-2">
                {channels.map((c) => {
                  const on = channelIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setChannelIds((cur) =>
                          on ? cur.filter((x) => x !== c.id) : [...cur, c.id],
                        )
                      }
                      className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                      style={{
                        borderColor: on ? 'var(--accent)' : 'var(--border)',
                        background: on ? 'var(--accent-soft)' : 'transparent',
                        color: on
                          ? 'var(--accent-text)'
                          : 'var(--text-secondary)',
                      }}
                    >
                      #{c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                主动参与讨论
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                开启后,频道里出现相关消息时无需 @ 也会主动回应(仍受相关性判断与频率限制)。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoRespond}
              onClick={() => setAutoRespond((v) => !v)}
              className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{
                background: autoRespond ? 'var(--accent)' : 'var(--border-strong)',
              }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                style={{ left: autoRespond ? '1.125rem' : '0.125rem' }}
              />
            </button>
          </div>

          <Field label="供应商">
            <select
              value={providerSel}
              onChange={(e) => changeProvider(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            >
              <optgroup label="在此填 API Key">
                {KNOWN.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </optgroup>
              {serverProviders.length > 0 && (
                <optgroup label="服务器共享(key 在服务器)">
                  {serverProviders.map((p) => (
                    <option key={p.id} value={'server:' + p.id}>
                      {p.label}
                      {p.configured ? '' : '(未配置)'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>

          {isDirect && (
            <>
              <Field label="Base URL">
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.xxx.com/v1"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    isEdit && editing?.hasApiKey
                      ? '已配置 ✓,留空则不变'
                      : '填入 API Key(存本地数据库,内部自用)'
                  }
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
                />
              </Field>
            </>
          )}

          <Field label="模型">
            <input
              list="model-options"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="模型名"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <datalist id="model-options">
              {((isDirect ? known?.models : serverP?.models) ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          {!isDirect && serverP && !serverP.configured && (
            <p className="text-xs text-[var(--warning)]">
              该服务器供应商未配置密钥,助手会先返回占位提示。
            </p>
          )}

          <Field label="头像颜色">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAvatarColor(c)}
                  className="h-7 w-7 rounded-[var(--radius-md)]"
                  style={{
                    background: identityColor(c),
                    outline:
                      avatarColor === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Field>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded-[var(--radius-md)] px-3.5 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? '保存中…' : isEdit ? '保存' : '创建助手'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  )
}
