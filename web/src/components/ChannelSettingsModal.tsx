import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { api } from '../lib/api'
import type { ChannelDetail, User } from '../lib/types'

export function ChannelSettingsModal({
  detail,
  users,
  onClose,
  onChanged,
}: {
  detail: ChannelDetail
  users: User[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState(detail.name)
  const [topic, setTopic] = useState(detail.topic ?? '')
  const [isPrivate, setIsPrivate] = useState(detail.isPrivate)
  const [archived, setArchived] = useState(detail.archived)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const memberIds = new Set(detail.members.map((m) => m.id))
  const addable = users.filter((u) => !memberIds.has(u.id))

  const save = async () => {
    setBusy(true)
    try {
      await api.patchChannel(detail.id, {
        name: name.trim() || undefined,
        topic,
        isPrivate,
        archived,
      })
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const addMember = async (userId: string) => {
    await api.addMember(detail.id, userId)
    setAdding(false)
    onChanged()
  }
  const removeMember = async (userId: string) => {
    await api.removeMember(detail.id, userId)
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--canvas)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            频道设置
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="名称">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            />
          </Field>
          <Field label="主题">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="这个频道用来…"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
            />
          </Field>

          <Toggle label="私有频道" checked={isPrivate} onChange={setIsPrivate} />
          <Toggle label="归档频道" checked={archived} onChange={setArchived} />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                成员({detail.members.length})
              </span>
              <button
                onClick={() => setAdding((v) => !v)}
                className="flex items-center gap-1 text-xs text-[var(--accent-text)]"
              >
                <UserPlus size={13} /> 添加
              </button>
            </div>
            {adding && addable.length > 0 && (
              <div className="mb-2 max-h-40 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                {addable.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--hover)]"
                  >
                    <Avatar user={u} size={20} />
                    <span className="text-[var(--text-primary)]">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {detail.members.map((u) => (
                <div
                  key={u.id}
                  className="group flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5"
                >
                  <Avatar user={u} size={22} />
                  <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
                    {u.name}
                    {u.isAssistant && (
                      <span className="ml-1 text-xs text-[var(--text-tertiary)]">
                        AI
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => removeMember(u.id)}
                    title="移出频道"
                    className="hidden text-[var(--text-tertiary)] group-hover:block hover:text-[var(--destructive)]"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-[var(--radius-md)] px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-0.5"
    >
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <span
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--ink-20)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: checked ? 18 : 2 }}
        />
      </span>
    </button>
  )
}
