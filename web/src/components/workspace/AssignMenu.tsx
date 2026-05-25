import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import type { Assistant } from '../../lib/types'

// 指派 AI 下拉:直接在卡片/子任务行上把任务指派给某个 AI,或「自动选择执行人」。
// 用原生 <select> 保证稳健(无 click-outside 处理),自动项调用后端按意图+技能推荐。
export function AssignMenu({
  assistants,
  onPick,
  onAuto,
  size = 'sm',
}: {
  assistants: Assistant[]
  onPick: (assistantId: string) => void | Promise<void>
  onAuto: () => void | Promise<void>
  size?: 'sm' | 'xs'
}) {
  const [busy, setBusy] = useState(false)
  const onChange = async (v: string) => {
    if (!v) return
    setBusy(true)
    try {
      if (v === '__auto') await onAuto()
      else await onPick(v)
    } finally {
      setBusy(false)
    }
  }
  const pad = size === 'xs' ? 'py-0.5 pl-5 pr-1 text-[10px]' : 'py-0.5 pl-5 pr-1.5 text-[11px]'
  return (
    <div className="relative inline-flex items-center">
      <UserPlus
        size={size === 'xs' ? 10 : 12}
        className="pointer-events-none absolute left-1 text-[var(--accent-text)]"
      />
      <select
        value=""
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value
          e.target.value = ''
          void onChange(v)
        }}
        title="指派给 AI 助手"
        className={`cursor-pointer appearance-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--canvas)] font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--hover)] focus:outline-none disabled:opacity-60 ${pad}`}
      >
        <option value="">{busy ? '指派中…' : '指派 AI'}</option>
        <option value="__auto">⚡ 自动选择执行人</option>
        {assistants.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.hasApiKey ? '' : '(未配置)'}
          </option>
        ))}
      </select>
    </div>
  )
}
