import { useRef, useState } from 'react'
import {
  RefreshCw,
  ExternalLink,
  TerminalSquare,
  MonitorSmartphone,
  Smartphone,
  Monitor,
  Globe,
} from 'lucide-react'

// Interactive Delivery —— Heliox 自有「可交互交付」预览。网页类任务的主交付是可点的 Web 预览。
// 去截图(2026-05-26):截图是 Debug 证据,不是交付物;交付证据 = 可交互的真实 Web 产物。
// iframe 用 sandbox 隔离(允许脚本跑小游戏,但无 same-origin,不能读我们的会话)。
// 工具条:刷新 / 打开新窗口 / 设备宽度自适应。

type Device = 'desktop' | 'tablet' | 'mobile'
const DEVICE_W: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '390px' }

export function InteractivePreview({
  previewUrl,
  entry,
  files = [],
  buildResult,
  height,
}: {
  previewUrl: string
  entry?: string | null
  files?: string[]
  buildResult?: string | null
  /** 不传则撑满父容器(min-height: 320px) */
  height?: number
}) {
  const [device, setDevice] = useState<Device>('desktop')
  const [reloadKey, setReloadKey] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)]"
      style={height ? undefined : { height: '100%' }}
    >
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent-text)]">
          <Globe size={13} /> 可交互预览
        </span>
        {entry && (
          <code className="max-w-[40%] truncate rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            {entry}
          </code>
        )}
        {buildResult && buildResult !== 'skipped' && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{
              color: buildResult === 'pass' ? 'var(--success)' : 'var(--destructive)',
              background: `color-mix(in oklch, ${buildResult === 'pass' ? 'var(--success)' : 'var(--destructive)'} 14%, transparent)`,
            }}
          >
            build {buildResult}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <DeviceBtn active={device === 'desktop'} onClick={() => setDevice('desktop')} title="桌面宽度">
            <Monitor size={13} />
          </DeviceBtn>
          <DeviceBtn active={device === 'tablet'} onClick={() => setDevice('tablet')} title="平板宽度">
            <MonitorSmartphone size={13} />
          </DeviceBtn>
          <DeviceBtn active={device === 'mobile'} onClick={() => setDevice('mobile')} title="手机宽度">
            <Smartphone size={13} />
          </DeviceBtn>
          <span className="mx-1 h-4 w-px bg-[var(--border)]" />
          <IconBtn onClick={() => setReloadKey((k) => k + 1)} title="刷新预览">
            <RefreshCw size={13} />
          </IconBtn>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            title="在新窗口打开"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* iframe 预览(设备宽度居中,自适应不溢出) */}
      <div
        className="flex justify-center overflow-auto bg-[var(--surface-3)] p-2"
        style={height ? { height } : { flex: 1, minHeight: 320 }}
      >
        <iframe
          key={reloadKey}
          ref={frameRef}
          src={previewUrl}
          title="interactive-preview"
          sandbox="allow-scripts allow-forms allow-pointer-lock allow-modals"
          className="h-full rounded-[var(--radius-md)] border border-[var(--border)] bg-white"
          style={{ width: DEVICE_W[device], maxWidth: '100%', transition: 'width .2s' }}
        />
      </div>

      {/* 信息条:文件数 + 诚实的 console 说明(不再是假按钮)。console 日志真正落在执行驾驶舱 Debug。 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-2.5 py-2">
        {files.length > 0 && (
          <span className="text-[11px] text-[var(--text-tertiary)]">{files.length} 个网页文件</span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]" title="console 日志只在 AI 实际跑过 browser_console 工具时采集,可在执行驾驶舱 Debug 查看">
          <TerminalSquare size={12} /> console 日志见执行驾驶舱 Debug(若已跑 browser_console)
        </span>
      </div>
    </div>
  )
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}

function DeviceBtn({ children, active, onClick, title }: { children: React.ReactNode; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--hover)]"
      style={{ color: active ? 'var(--accent-text)' : 'var(--text-tertiary)', background: active ? 'var(--accent-soft)' : 'transparent' }}
    >
      {children}
    </button>
  )
}
