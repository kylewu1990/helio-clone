import { useEffect, useRef } from 'react'
import type { WsEvent } from './types'

// 自动重连的 WebSocket。返回 send 供发送 typing 等上行消息。
export function useWebSocket(
  userId: string | null,
  onEvent: (e: WsEvent) => void,
) {
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!userId) return
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(
        `${proto}://${location.host}/ws?userId=${encodeURIComponent(userId)}`,
      )
      wsRef.current = ws
      ws.onmessage = (ev) => {
        try {
          cbRef.current(JSON.parse(ev.data) as WsEvent)
        } catch {
          /* ignore */
        }
      }
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500)
      }
    }
    connect()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [userId])

  const send = useRef((data: unknown) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(data))
  }).current

  return { send }
}
