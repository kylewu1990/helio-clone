import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as dagre from '@dagrejs/dagre'
import {
  Brain,
  CheckCircle2,
  Cog,
  CornerDownLeft,
  HelpCircle,
  Loader2,
  PackageCheck,
  Sparkles,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '../../lib/api'
import type { GraphEdge, GraphNode, NodeKind, EdgeVerb } from '../../lib/types'

// v2 Algorithm Graph(Heliox 自有,零 ReactFlow 默认样式泄漏)。
// - 节点完全自绘 HTML(SVG 只画边),复用 D 系列 token(--accent / --info / --warning / --destructive / glass-surface 等)。
// - dagre 布局负责坐标计算;前端做 pan/zoom + 节点 click。
// - 边按 verb 着色 + 文字标签;弧线用 bezier(SVG path)。

const NODE_W = 168
const NODE_H = 54

// 节点视觉:每个 kind 一种图标 + 一种 accent 来源
const NODE_VIS: Record<NodeKind, { icon: typeof Cog; color: string; label: string }> = {
  task: { icon: Cog, color: 'var(--accent)', label: '任务' },
  agent: { icon: UserIcon, color: 'var(--info)', label: 'Agent' },
  delivery: { icon: PackageCheck, color: 'var(--success)', label: '交付' },
  progress: { icon: Loader2, color: 'var(--info)', label: '进度' },
  a2a_response: { icon: CornerDownLeft, color: 'var(--warning)', label: 'A2A' },
  tool: { icon: Wrench, color: 'var(--text-tertiary)', label: '工具' },
  approval: { icon: HelpCircle, color: 'var(--destructive)', label: '审批' },
  optimizer: { icon: Sparkles, color: 'var(--accent-text)', label: 'Optimizer' },
}

// 边 verb 颜色 + 中文标签
const VERB_VIS: Record<EdgeVerb, { color: string; label: string }> = {
  assigns: { color: 'var(--accent)', label: '派' },
  delegates: { color: 'var(--info)', label: '委托' },
  reviews: { color: 'var(--warning)', label: '评审' },
  approves: { color: 'var(--success)', label: '批准' },
  supplies: { color: 'var(--success)', label: '产出' },
  feeds: { color: 'var(--text-tertiary)', label: '喂入' },
  depends_on: { color: 'var(--text-secondary)', label: '依赖' },
  blocked_by: { color: 'var(--destructive)', label: '被卡' },
  delivers_to: { color: 'var(--success)', label: '交付到' },
  monitors: { color: 'var(--accent-text)', label: '监控' },
}

type LaidOutNode = GraphNode & { x: number; y: number }

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: LaidOutNode[]; size: { w: number; h: number } } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 64, nodesep: 28, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  const key = (n: { kind: NodeKind; id: string }) => `${n.kind}:${n.id}`
  for (const n of nodes) g.setNode(key(n), { width: NODE_W, height: NODE_H })
  const ids = new Set(nodes.map(key))
  for (const e of edges) {
    const a = `${e.fromKind}:${e.fromId}`
    const b = `${e.toKind}:${e.toId}`
    if (ids.has(a) && ids.has(b)) g.setEdge(a, b)
  }
  dagre.layout(g)
  const out: LaidOutNode[] = nodes.map((n) => {
    const p = g.node(key(n))
    return { ...n, x: p ? p.x - NODE_W / 2 : 0, y: p ? p.y - NODE_H / 2 : 0 }
  })
  const gr = g.graph() as { width?: number; height?: number }
  return { nodes: out, size: { w: gr.width ?? 800, h: gr.height ?? 480 } }
}

export function AlgorithmGraph({ channelId, refreshKey }: { channelId: string; refreshKey: number }) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ kind: NodeKind; id: string } | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await api.channelGraph(channelId)
      setNodes(r.nodes ?? [])
      setEdges(r.edges ?? [])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, refreshKey])

  const laid = useMemo(() => layoutGraph(nodes, edges), [nodes, edges])
  const selectedNode = useMemo(
    () => (selected ? laid.nodes.find((n) => n.kind === selected.kind && n.id === selected.id) : null) ?? null,
    [selected, laid],
  )

  // pan + zoom(纯 transform,不依赖任何外部库)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const draggingRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const dz = -e.deltaY * 0.0015
    setZoom((z) => Math.max(0.4, Math.min(2.2, z + dz)))
  }
  const onPointerDown = (e: React.PointerEvent) => {
    // 仅在画布空白处启动 pan(节点会 stopPropagation)
    draggingRef.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = draggingRef.current
    if (!d) return
    setPan({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
  }
  const onPointerUp = () => {
    draggingRef.current = null
  }

  const resetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-[11px] text-[var(--text-tertiary)]">
        <Brain size={13} className="text-[var(--accent-text)]" />
        <span className="font-semibold text-[var(--text-secondary)]">Algorithm Graph</span>
        <span>· {nodes.length} 节点 / {edges.length} 边</span>
        <button
          onClick={() => void load()}
          className="ml-auto rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)]"
          title="刷新"
        >
          刷新
        </button>
        <button
          onClick={resetView}
          className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)]"
          title="回到原点"
        >
          回正
        </button>
        <span className="font-mono">{Math.round(zoom * 100)}%</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollerRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="constellation-bg relative h-full w-full cursor-grab touch-pan-x touch-pan-y active:cursor-grabbing"
          style={{ touchAction: 'manipulation' }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-tertiary)]">
              <Loader2 size={14} className="mr-1 animate-spin" /> 加载图谱…
            </div>
          )}
          {err && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--destructive)]">
              加载失败:{err}
            </div>
          )}
          {!loading && !err && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-tertiary)]">
              频道还没有图谱节点 — 派任务 / @AI 后会自动生成
            </div>
          )}
          {!loading && nodes.length > 0 && (
            <div
              className="absolute origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: laid.size.w,
                height: laid.size.h,
              }}
            >
              <svg
                width={laid.size.w}
                height={laid.size.h}
                className="absolute inset-0 pointer-events-none"
              >
                <defs>
                  {Object.entries(VERB_VIS).map(([v, vis]) => (
                    <marker
                      key={v}
                      id={`arrow-${v}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={vis.color} />
                    </marker>
                  ))}
                </defs>
                {edges.map((e) => renderEdge(e, laid.nodes))}
              </svg>
              {laid.nodes.map((n) => (
                <NodeCard
                  key={`${n.kind}:${n.id}`}
                  n={n}
                  selected={selected?.kind === n.kind && selected?.id === n.id}
                  onSelect={() => setSelected({ kind: n.kind, id: n.id })}
                />
              ))}
            </div>
          )}
        </div>

        {/* 节点详情 panel(底部,移动端友好) */}
        {selectedNode && (
          <NodeDetail
            node={selectedNode}
            edges={edges.filter(
              (e) =>
                (e.fromKind === selectedNode.kind && e.fromId === selectedNode.id) ||
                (e.toKind === selectedNode.kind && e.toId === selectedNode.id),
            )}
            allNodes={laid.nodes}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}

function renderEdge(e: GraphEdge, nodes: LaidOutNode[]) {
  const a = nodes.find((n) => n.kind === e.fromKind && n.id === e.fromId)
  const b = nodes.find((n) => n.kind === e.toKind && n.id === e.toId)
  if (!a || !b) return null
  const vis = VERB_VIS[e.verb] ?? { color: 'var(--text-tertiary)', label: e.verb }
  const x1 = a.x + NODE_W
  const y1 = a.y + NODE_H / 2
  const x2 = b.x
  const y2 = b.y + NODE_H / 2
  // 简洁 bezier(横向 DAG)
  const mid = (x1 + x2) / 2
  const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
  const lx = (x1 + x2) / 2
  const ly = (y1 + y2) / 2 - 6
  return (
    <g key={e.id}>
      <path
        d={d}
        fill="none"
        stroke={vis.color}
        strokeWidth={1.5}
        strokeDasharray={e.verb === 'blocked_by' || e.verb === 'monitors' ? '4 3' : undefined}
        markerEnd={`url(#arrow-${e.verb})`}
        opacity={0.85}
      />
      <text
        x={lx}
        y={ly}
        textAnchor="middle"
        fontSize={10}
        fill={vis.color}
        style={{ pointerEvents: 'none', fontWeight: 600 }}
      >
        {vis.label}
      </text>
    </g>
  )
}

function NodeCard({
  n,
  selected,
  onSelect,
}: {
  n: LaidOutNode
  selected: boolean
  onSelect: () => void
}) {
  const vis = NODE_VIS[n.kind]
  const Icon = vis.icon
  // 状态色叠加(taskstatus / delivery status / pending input / approval ...)
  const statusColor = derivedStatusColor(n)
  const isLowAutonomy =
    n.kind === 'task' && typeof n.autonomy === 'number' && n.autonomy < 60
  // D 系列 token:running 状态 token + warning border for low-autonomy task(E5)
  const borderColor = isLowAutonomy
    ? 'var(--warning)'
    : selected
      ? vis.color
      : statusColor ?? 'var(--border)'
  const style: CSSProperties = {
    left: n.x,
    top: n.y,
    width: NODE_W,
    height: NODE_H,
    background: 'var(--glass-surface)',
    borderColor,
    borderWidth: selected || isLowAutonomy ? 2 : 1,
    backdropFilter: 'blur(6px)',
    boxShadow: selected ? `0 0 0 3px color-mix(in oklch, ${vis.color} 22%, transparent)` : undefined,
  }
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className="absolute flex items-center gap-2 rounded-[var(--radius-md)] border px-2 text-left transition-shadow"
      style={style}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ color: vis.color, background: `color-mix(in oklch, ${vis.color} 14%, transparent)` }}
      >
        <Icon size={14} className={n.kind === 'progress' && n.status === 'running' ? 'animate-spin' : ''} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: vis.color }}>
            {vis.label}
          </span>
          {n.status && (
            <span
              className="rounded px-1 py-px text-[8.5px] font-medium"
              style={{
                color: statusColor ?? 'var(--text-tertiary)',
                background: `color-mix(in oklch, ${statusColor ?? 'var(--text-tertiary)'} 14%, transparent)`,
              }}
            >
              {n.status}
            </span>
          )}
          {n.kind === 'task' && typeof n.autonomy === 'number' && (
            <span
              className="ml-auto rounded px-1 py-px text-[8.5px] font-bold"
              style={{
                color: n.autonomy < 60 ? 'var(--warning)' : 'var(--success)',
                background: `color-mix(in oklch, ${n.autonomy < 60 ? 'var(--warning)' : 'var(--success)'} 14%, transparent)`,
              }}
              title={`自动度:${n.autonomy}%`}
            >
              {n.autonomy}%
            </span>
          )}
          {n.kind === 'tool' && typeof n.weight === 'number' && n.weight > 1 && (
            <span className="ml-auto text-[9px] font-mono text-[var(--text-tertiary)]">×{n.weight}</span>
          )}
        </div>
        <div className="truncate text-[11px] font-medium text-[var(--text-primary)]">{n.label}</div>
      </div>
    </button>
  )
}

function derivedStatusColor(n: GraphNode): string | null {
  if (!n.status) return null
  const s = n.status.toLowerCase()
  if (s === 'running' || s === 'pending' || s === 'doing' || s === 'queued') return 'var(--info)'
  if (s === 'done' || s === 'approved' || s === 'succeeded' || s === 'resolved') return 'var(--success)'
  if (s === 'failed' || s === 'rejected' || s === 'error') return 'var(--destructive)'
  if (s === 'blocked' || s === 'needs_approval' || s === 'needs_input' || s === 'await') return 'var(--warning)'
  if (s === 'review' || s === 'needs_review') return 'var(--accent-text)'
  if (s === 'skipped') return 'var(--text-tertiary)'
  return null
}

function NodeDetail({
  node,
  edges,
  allNodes,
  onClose,
}: {
  node: LaidOutNode
  edges: GraphEdge[]
  allNodes: LaidOutNode[]
  onClose: () => void
}) {
  const vis = NODE_VIS[node.kind]
  const Icon = vis.icon
  const why = parseWhy(node.whyJson)
  return (
    <div
      className="absolute right-2 bottom-2 left-2 max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] shadow-lg md:left-auto md:w-96"
      style={{ backdropFilter: 'blur(10px)' }}
    >
      <div
        className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2"
        style={{ background: `color-mix(in oklch, ${vis.color} 6%, transparent)` }}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ color: vis.color, background: `color-mix(in oklch, ${vis.color} 14%, transparent)` }}
        >
          <Icon size={13} />
        </span>
        <span className="text-[11.5px] font-bold" style={{ color: vis.color }}>
          {vis.label}
        </span>
        <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{node.label}</span>
        <button onClick={onClose} className="ml-auto p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 py-2 text-[12px]">
        {node.status && (
          <div className="mb-1.5 flex items-center gap-2 text-[var(--text-secondary)]">
            <span className="text-[var(--text-tertiary)]">状态</span>
            <span className="font-mono">{node.status}</span>
          </div>
        )}
        {node.kind === 'task' && typeof node.autonomy === 'number' && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[var(--text-tertiary)]">自动度</span>
            <div className="flex-1 overflow-hidden rounded bg-[var(--surface-3)]">
              <div
                style={{
                  width: `${node.autonomy}%`,
                  background: node.autonomy < 60 ? 'var(--warning)' : 'var(--success)',
                }}
                className="h-1.5"
              />
            </div>
            <span className="font-mono text-[11px]">{node.autonomy}%</span>
          </div>
        )}
        {why && (
          <div className="mt-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)] p-2">
            <div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold tracking-wide text-[var(--accent-text)] uppercase">
              <Sparkles size={11} /> Why this
            </div>
            {Array.isArray(why.dataPoints) && why.dataPoints.length > 0 ? (
              <ul className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
                {why.dataPoints.map((p, i) => (
                  <li key={i} className="flex gap-1">
                    <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-[var(--success)]" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-[10.5px] text-[var(--text-tertiary)]">
                {JSON.stringify(why, null, 2)}
              </pre>
            )}
          </div>
        )}
        <div className="mt-2">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">关联</div>
          <ul className="flex flex-col gap-0.5 text-[11px]">
            {edges.length === 0 && <li className="text-[var(--text-tertiary)]">无</li>}
            {edges.map((e) => {
              const isOut = e.fromKind === node.kind && e.fromId === node.id
              const other = isOut
                ? allNodes.find((n) => n.kind === e.toKind && n.id === e.toId)
                : allNodes.find((n) => n.kind === e.fromKind && n.id === e.fromId)
              const vv = VERB_VIS[e.verb]
              return (
                <li key={e.id} className="flex items-center gap-1.5">
                  <span className="font-medium" style={{ color: vv.color }}>
                    {isOut ? '→' : '←'} {vv.label}
                  </span>
                  <span className="truncate text-[var(--text-secondary)]">{other?.label ?? `${e.toKind}:${e.toId}`}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

function parseWhy(s?: string | null): Record<string, unknown> | null {
  if (!s) return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}
