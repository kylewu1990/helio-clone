export function identityColor(n: number): string {
  const i = ((n - 1) % 12) + 1
  return `var(--identity-${i})`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDayDivider(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return '今天'
  if (sameDay(d, yest)) return '昨天'
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

export function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

// 相对时间(用于 Live Activity 时间线):刚刚 / N 分钟前 / N 小时前 / 日期
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}
