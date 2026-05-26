// v3 Phase A — Memory 层(L1 = systemPrompt 不进表;L2/L3 = Memory 表)。
// 设计:
//   - L2 Project Memory:per (agent × channel),append-only + 滚动窗口截断(默认 15k chars)
//   - L3 Episodic Memory:per (agent × channel),prepend(最近在上) + ~5k chars 上限
//   - itemCount 累计;Dream Cycle 在 Phase B 真正做"L3 → L2 固化"
import { prisma } from './db.js'

const L2_MAX_CHARS = 15_000
const L3_MAX_CHARS = 5_000
const L3_PER_LINE_MAX = 200

export type MemoryRow = {
  id: string
  agentId: string
  channelId: string | null
  level: number
  content: string
  keywords: string | null
  itemCount: number
  lastDreamAt: Date | null
  whyJson: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * 项目频道的"初始化套话":第一次 @ AI 时给一份项目元信息让 AI 起步即知道在哪儿。
 * 写一次后被 append 操作覆盖式增量;不重复 init。
 */
export async function ensureL2(
  agentId: string,
  channelId: string,
  opts: { goal?: string | null; scope?: string | null; phase?: string | null; ownerName?: string | null },
): Promise<MemoryRow> {
  const existing = await prisma.memory.findUnique({
    where: { agentId_channelId_level: { agentId, channelId, level: 2 } },
  })
  if (existing) return existing as MemoryRow
  const lines = [
    `# 项目记忆(L2)`,
    `创建时间:${new Date().toISOString()}`,
    opts.goal ? `## 目标\n${opts.goal}` : null,
    opts.scope ? `## 范围\n${opts.scope}` : null,
    opts.phase ? `当前阶段:${opts.phase}` : null,
    opts.ownerName ? `项目负责人:${opts.ownerName}` : null,
    '',
    `## 关键决定 / 经验(随项目推进追加)`,
  ].filter(Boolean) as string[]
  const created = await prisma.memory.create({
    data: {
      agentId,
      channelId,
      level: 2,
      content: lines.join('\n'),
      itemCount: 1,
      whyJson: JSON.stringify({
        reason: 'l2_init',
        trigger: 'first_mention_or_action',
        seed: { goal: opts.goal ?? null, phase: opts.phase ?? null },
      }),
    },
  })
  return created as MemoryRow
}

/** 在 L2 顶部(目标后)的"关键决定"区追加一行;超长滚动截断尾部。 */
export async function appendL2(
  agentId: string,
  channelId: string,
  line: string,
  why?: Record<string, unknown>,
): Promise<void> {
  const trimmed = line.trim()
  if (!trimmed) return
  const cur = await prisma.memory.findUnique({
    where: { agentId_channelId_level: { agentId, channelId, level: 2 } },
  })
  if (!cur) {
    // 没初始化也允许 append(降级)
    await prisma.memory.create({
      data: {
        agentId,
        channelId,
        level: 2,
        content: `# 项目记忆(L2)\n\n## 关键决定 / 经验\n- ${trimmed}\n`,
        itemCount: 1,
        whyJson: why ? JSON.stringify(why) : null,
      },
    })
    return
  }
  // 找"关键决定"段并 prepend(最新在上),保持项目元信息不动
  const marker = '## 关键决定 / 经验'
  let next: string
  const idx = cur.content.indexOf(marker)
  if (idx >= 0) {
    const head = cur.content.slice(0, idx + marker.length)
    const tail = cur.content.slice(idx + marker.length)
    next = `${head}\n- [${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${trimmed}${tail}`
  } else {
    next = `${cur.content}\n${marker}\n- [${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${trimmed}`
  }
  if (next.length > L2_MAX_CHARS) next = next.slice(0, L2_MAX_CHARS - 80) + '\n…(截断)'
  await prisma.memory.update({
    where: { id: cur.id },
    data: {
      content: next,
      itemCount: cur.itemCount + 1,
      whyJson: why ? JSON.stringify(why) : cur.whyJson,
    },
  })
}

/** 追加一条 L3 情节摘要(prepend,最近在上)。 */
export async function appendEpisodic(
  agentId: string,
  channelId: string,
  summary: string,
  why?: Record<string, unknown>,
): Promise<void> {
  const s = summary.trim().slice(0, L3_PER_LINE_MAX)
  if (!s) return
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const head = `- [${ts}] ${s}`
  const cur = await prisma.memory.findUnique({
    where: { agentId_channelId_level: { agentId, channelId, level: 3 } },
  })
  if (!cur) {
    await prisma.memory.create({
      data: {
        agentId,
        channelId,
        level: 3,
        content: `# 情节记忆(L3)— 最近事件\n\n${head}\n`,
        itemCount: 1,
        whyJson: why ? JSON.stringify(why) : null,
      },
    })
    return
  }
  // prepend 到首条事件位置
  const marker = '— 最近事件'
  let next: string
  const idx = cur.content.indexOf(marker)
  if (idx >= 0) {
    const cut = idx + marker.length
    next = `${cur.content.slice(0, cut)}\n\n${head}${cur.content.slice(cut + 1) /* drop one trailing \n */}`
  } else {
    next = `${head}\n${cur.content}`
  }
  if (next.length > L3_MAX_CHARS) next = next.slice(0, L3_MAX_CHARS - 60) + '\n…(更早被压缩)'
  await prisma.memory.update({
    where: { id: cur.id },
    data: {
      content: next,
      itemCount: cur.itemCount + 1,
      whyJson: why ? JSON.stringify(why) : cur.whyJson,
    },
  })
}

/** 一次性拿到 L2 + L3(L1 在 caller 处用 user.systemPrompt)。 */
export async function loadMemories(
  agentId: string,
  channelId: string,
): Promise<{ l2: MemoryRow | null; l3: MemoryRow | null }> {
  const rows = await prisma.memory.findMany({
    where: { agentId, channelId, level: { in: [2, 3] } },
  })
  const l2 = (rows.find((r: any) => r.level === 2) as MemoryRow | undefined) ?? null
  const l3 = (rows.find((r: any) => r.level === 3) as MemoryRow | undefined) ?? null
  return { l2, l3 }
}
