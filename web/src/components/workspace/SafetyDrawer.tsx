import { useEffect } from 'react'
import { X, ShieldCheck, ShieldAlert, Boxes } from 'lucide-react'
import { CapabilityMatrix } from './CapabilityMatrix'
import type { Capability, IsolationInfo } from '../../lib/types'

// Safety & Capabilities 抽屉:把"能力矩阵 / 沙盒隔离 / 权限说明"从首页下沉到这里。
export function SafetyDrawer({
  capabilities,
  isolation,
  onClose,
}: {
  capabilities: Capability[]
  isolation: IsolationInfo | null
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const strong = isolation?.strong ?? false
  return (
    <div className="fixed inset-0 z-[55] flex">
      <div className="scrim-in flex-1 bg-[color-mix(in_oklch,black_50%,transparent)]" onClick={onClose} />
      <aside className="cockpit-in flex h-full w-full max-w-[420px] flex-col border-l border-[var(--border)] bg-[var(--surface-1)] shadow-2xl">
        <header className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-3)] text-[var(--accent-text)]">
            <ShieldCheck size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
              Safety & Capabilities
            </div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">安全与能力</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:bg-[var(--hover)]">
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 沙盒隔离 */}
          <section className="mb-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            <div className="flex items-center gap-2">
              <Boxes size={15} className="text-[var(--accent-text)]" />
              <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">沙盒隔离</span>
              <span
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color: strong ? 'var(--success)' : 'var(--warning)',
                  background: `color-mix(in oklch, ${strong ? 'var(--success)' : 'var(--warning)'} 13%, transparent)`,
                }}
              >
                {strong ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                {isolation?.label ?? '本机信任沙盒'}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {isolation?.note ??
                'AI 的写入/命令都在隔离工作区进行,主项目写入需人工 apply 才生效。本机无 Docker 时为信任沙盒(非强隔离)。'}
            </p>
          </section>

          {/* 能力矩阵 */}
          <CapabilityMatrix capabilities={capabilities} />
        </div>
      </aside>
    </div>
  )
}
