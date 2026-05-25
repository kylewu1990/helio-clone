import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  GitCommitHorizontal,
  PackageCheck,
  ScrollText,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { ContextDoc } from '../../lib/types'

const KIND_ICON: Record<string, React.ReactNode> = {
  context: <BookOpen size={15} />,
  task: <ScrollText size={15} />,
  review: <ShieldCheck size={15} />,
  delivery: <PackageCheck size={15} />,
  principles: <FileText size={15} />,
  decisions: <GitCommitHorizontal size={15} />,
}

// Context Vault:读取并搜索真实项目文档(后端 /api/context-docs)。可打开阅读全文。
export function ContextVault({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [docs, setDocs] = useState<ContextDoc[]>([])
  const [q, setQ] = useState('')
  const [active, setActive] = useState<ContextDoc | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setActive(null)
    setLoading(true)
    api
      .contextDocs(q.trim() || undefined)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [open, q])

  const openDoc = (id: string) => {
    setLoading(true)
    api
      .contextDoc(id)
      .then(setActive)
      .catch(() => setActive(null))
      .finally(() => setLoading(false))
  }

  if (!open) return null
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/30"
        onClick={onClose}
        style={{ animation: 'activity-in 200ms ease-out' }}
      />
      <aside
        className="fixed top-0 right-0 z-40 flex h-full w-[92vw] max-w-md flex-col border-l border-[var(--border)] bg-[var(--chrome-frame)] shadow-xl"
        style={{ animation: 'activity-in 200ms ease-out' }}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex items-center gap-2">
            {active ? (
              <button
                onClick={() => setActive(null)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
                title="返回列表"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <BookOpen size={16} className="text-[var(--accent-text)]" />
            )}
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {active ? active.title : 'Context Vault'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
            title="关闭"
          >
            <X size={16} />
          </button>
        </header>

        {active ? (
          <div className="flex-1 overflow-y-auto p-4">
            <code className="mb-2 block truncate font-mono text-[11px] text-[var(--text-tertiary)]">
              {active.path}
            </code>
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--text-secondary)]">
              {active.content}
            </pre>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-[var(--border)] p-3">
              <div className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--paper-mid)] px-2.5 py-1.5">
                <Search size={14} className="text-[var(--text-tertiary)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="搜索项目文档内容…"
                  className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-3 px-1 text-xs text-[var(--text-tertiary)]">
                团队共享的真实项目文档。点击打开全文阅读{q.trim() ? ',已按关键词过滤' : ''}。
              </p>
              {loading && (
                <p className="px-1 text-xs text-[var(--text-tertiary)]">加载中…</p>
              )}
              {!loading && docs.length === 0 && (
                <p className="px-1 text-xs text-[var(--text-tertiary)]">没有匹配的文档。</p>
              )}
              <div className="flex flex-col gap-2">
                {docs.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => openDoc(it.id)}
                    className="card-lift rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--accent-text)' }}>
                        {KIND_ICON[it.kind] ?? <FileText size={15} />}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {it.title}
                      </span>
                      {typeof it.size === 'number' && (
                        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                          {(it.size / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </div>
                    {it.snippet && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                        …{it.snippet}…
                      </p>
                    )}
                    <code className="mt-2 block truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                      {it.path}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
