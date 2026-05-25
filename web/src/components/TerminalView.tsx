import { useEffect, useRef } from 'react'
import { Menu, SquareTerminal } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// 终端视图:每次挂载新建一个独立 WS(/ws/terminal)对应后端一个 pty;
// 切走视图/刷新即卸载 → cleanup 关 WS → 后端 kill pty(刷新即重建,无持久化)。
export function TerminalView({
  userId,
  onMenuClick,
}: {
  userId: string
  onMenuClick: () => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !userId) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: '#1a1a1a', foreground: '#e4e4e4' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    // 容器尺寸为 0 时 fit 会抛错,先判尺寸再 fit
    const safeFit = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        try {
          fit.fit()
        } catch {
          /* ignore */
        }
      }
    }
    requestAnimationFrame(safeFit)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(
      `${proto}://${location.host}/ws/terminal?userId=${encodeURIComponent(userId)}`,
    )

    ws.onopen = () => {
      safeFit()
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data)
        if (m.type === 'data') term.write(m.data)
        else if (m.type === 'exit')
          term.write(`\r\n\x1b[90m[进程已退出 ${m.exitCode}]\x1b[0m\r\n`)
      } catch {
        /* 忽略非 JSON 帧 */
      }
    }

    const dataSub = term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', data }))
    })

    const ro = new ResizeObserver(() => {
      safeFit()
      if (ws.readyState === 1)
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    })
    ro.observe(host)

    return () => {
      ro.disconnect()
      dataSub.dispose()
      ws.close()
      term.dispose()
    }
  }, [userId])

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-5">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] md:hidden"
          title="菜单"
        >
          <Menu size={18} />
        </button>
        <SquareTerminal size={18} className="text-[var(--text-tertiary)]" />
        <div className="text-sm font-semibold text-[var(--text-primary)]">终端</div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#1a1a1a] p-2">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </>
  )
}
