// Phase U / M3:CrewAI 子服务 HTTP 客户端(Mastra step 调它,不感知 AskX 频道/WS/DB)。
//
// 铁律(§1):CrewAI 永不当全局主控,只是 Mastra 发结构化请求 → Crew 跑 → 返回结构化 JSON。
// 启用:env CREW_BASE_URL 配了才调(未配 = 软降级回 M2 行为,完全可逆)。
// 软降级:不可达 / 超时 / 非 2xx / 重试用尽 → 返回 null,主流程不挂,编排卡标注"分析 AI 未参与"。
//
// 叶子模块:无 prisma / 无 index.ts 依赖。

export type CrewRole = 'researcher' | 'analyst' | 'critic'

export interface CrewMaterial { summary: string; points: string[] }
export interface CrewCritic {
  clarity: number; design: number; narrative: number; data_support: number; persuasion: number
  needs_revision: boolean; notes: string
}

export function crewEnabled(): boolean {
  return !!process.env.CREW_BASE_URL
}

// POST /crew/run {role, brief, context?} → result(已校验的结构化 JSON)。失败 → null(软降级)。
export async function callCrew(
  role: CrewRole,
  brief: string,
  opts?: { context?: Record<string, unknown>; timeoutMs?: number; retries?: number },
): Promise<CrewMaterial | CrewCritic | null> {
  const base = process.env.CREW_BASE_URL
  if (!base) return null
  const timeoutMs = opts?.timeoutMs ?? 90000
  const retries = opts?.retries ?? 1
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/crew/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, brief, context: opts?.context ?? null }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!r.ok) continue
      const j: any = await r.json()
      if (j?.ok && j?.result) return j.result as CrewMaterial | CrewCritic
      return null
    } catch {
      clearTimeout(timer)
      // 重试一次;用尽 → 软降级
    }
  }
  return null
}
