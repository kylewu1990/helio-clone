// 最小结构类型,避免依赖未直接安装的 'ws' 类型(pnpm 不提升传递依赖)。
// 仅用到 readyState 与 send,与 ws.WebSocket 结构兼容。
type WebSocketLike = { readyState: number; send: (data: string) => void }

export type Client = { userId: string; socket: WebSocketLike }

const clients = new Set<Client>()

function send(socket: WebSocketLike, payload: unknown) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload))
}

export function onlineUserIds(): string[] {
  return [...new Set([...clients].map((c) => c.userId))]
}

export function broadcastPresence() {
  const online = onlineUserIds()
  for (const c of clients) send(c.socket, { type: 'presence', online })
}

export function addClient(userId: string, socket: WebSocketLike): Client {
  const client: Client = { userId, socket }
  clients.add(client)
  broadcastPresence()
  return client
}

export function removeClient(client: Client) {
  clients.delete(client)
  broadcastPresence()
}

// 只推给频道成员,DM 内容不外泄
export function sendToUsers(userIds: string[], payload: unknown) {
  const set = new Set(userIds)
  for (const c of clients) if (set.has(c.userId)) send(c.socket, payload)
}
