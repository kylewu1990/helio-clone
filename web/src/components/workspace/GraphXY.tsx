// Inspired by xyflow/xyflow examples/Overview (MIT), see /THIRD_PARTY_LICENSES.md
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as dagre from '@dagrejs/dagre'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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
} from 'lucide-react'
import { api } from '../../lib/api'
import type { GraphEdge, GraphNode, NodeKind, EdgeVerb } from '../../lib/types'

const NODE_W = 180
const NODE_H = 56

const NODE_VIS: Record<NodeKind, { icon: typeof Cog; color: string }> = {
  task: { icon: Cog, color: 'var(--accent)' },
  agent: { icon: UserIcon, color: 'var(--info)' },
  delivery: { icon: PackageCheck, color: 'var(--success)' },
  progress: { icon: Loader2, color: 'var(--info)' },
  a2a_response: { icon: CornerDownLeft, color: 'var(--warning)' },
  tool: { icon: Wrench, color: 'var(--text-tertiary)' },
  approval: { icon: HelpCircle, color: 'var(--destructive)' },
  optimizer: { icon: Sparkles, color: 'var(--accent-text)' },
}

const VERB_COLOR: Record<EdgeVerb, string> = {
  assigns: 'var(--accent)',
  delegates: 'var(--info)',
  reviews: 'var(--warning)',
  approves: 'var(--success)',
  supplies: 'var(--success)',
  feeds: 'var(--text-tertiary)',
  depends_on: 'var(--text-secondary)',
  blocked_by: 'var(--destructive)',
  delivers_to: 'var(--success)',
  monitors: 'var(--accent-text)',
}

const VERB_LABEL: Record<EdgeVerb, string> = {
  assigns: '派',
  delegates: '委托',
  reviews: '评审',
  approves: '批准',
  supplies: '产出',
  feeds: '喂入',
  depends_on: '依赖',
  blocked_by: '被卡',
  delivers_to: '交付到',
  monitors: '监控',
}

function NodeCard({ data }: { data: { node: GraphNode } }) {
  const n = data.node
  const vis = NODE_VIS[n.kind] ?? NODE_VIS.task
  const Icon = vis.icon
  return (
    <div
      className="flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-1)] px-3 py-2 shadow-sm"
      style={{ width: NODE_W, height: NODE_H, borderColor: 'var(--border)' }}
    >
      <Handle type="target" position={Position.Left} style={{ background: vis.color, width: 6, height: 6 }} />
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        style={{ background: `color-mix(in oklch, ${vis.color} 18%, transparent)`, color: vis.color }}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text-primary)]">{n.label || n.id}</div>
        <div className="text-[9.5px] text-[var(--text-tertiary)]">{n.kind}</div>
      </div>
      {n.status === 'done' && <CheckCircle2 size={12} className="text-[var(--success)]" />}
      <Handle type="source" position={Position.Right} style={{ background: vis.color, width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { card: NodeCard }

function layout(nodes: GraphNode[], edges: GraphEdge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 30, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))
  const key = (kind: NodeKind, id: string) => `${kind}:${id}`
  for (const n of nodes) g.setNode(key(n.kind, n.id), { width: NODE_W, height: NODE_H })
  const ids = new Set(nodes.map((n) => key(n.kind, n.id)))
  for (const e of edges) {
    const a = key(e.fromKind, e.fromId)
    const b = key(e.toKind, e.toId)
    if (ids.has(a) && ids.has(b)) g.setEdge(a, b)
  }
  dagre.layout(g)

  const rfNodes: Node[] = nodes.map((n) => {
    const p = g.node(key(n.kind, n.id))
    return {
      id: key(n.kind, n.id),
      type: 'card',
      data: { node: n },
      position: { x: p ? p.x - NODE_W / 2 : 0, y: p ? p.y - NODE_H / 2 : 0 },
    }
  })

  const rfEdges: Edge[] = edges
    .filter((e) => ids.has(key(e.fromKind, e.fromId)) && ids.has(key(e.toKind, e.toId)))
    .map((e, i) => ({
      id: `e${i}-${e.fromKind}:${e.fromId}->${e.toKind}:${e.toId}`,
      source: key(e.fromKind, e.fromId),
      target: key(e.toKind, e.toId),
      label: VERB_LABEL[e.verb],
      animated: e.verb === 'assigns' || e.verb === 'delegates',
      style: { stroke: VERB_COLOR[e.verb], strokeWidth: 1.5 },
      labelStyle: { fill: VERB_COLOR[e.verb], fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: 'var(--surface-1)' },
    }))
  return { nodes: rfNodes, edges: rfEdges }
}

export function GraphXY({ channelId, refreshKey }: { channelId: string; refreshKey: number }) {
  const [raw, setRaw] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await api.channelGraph(channelId)
      setRaw({ nodes: r.nodes ?? [], edges: r.edges ?? [] })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => { void load() }, [load, refreshKey])

  const laid = useMemo(() => (raw ? layout(raw.nodes, raw.edges) : { nodes: [], edges: [] }), [raw])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-tertiary)]">
        <Loader2 size={14} className="mr-1.5 animate-spin" /> 加载 Algorithm Graph…
      </div>
    )
  }
  if (err) {
    return <div className="p-4 text-[12px] text-[var(--destructive)]">加载失败:{err}</div>
  }
  if (!raw || raw.nodes.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-8 text-center text-[12.5px] text-[var(--text-secondary)]">
        <Brain className="mx-auto mb-2 text-[var(--accent-text)]" size={20} />
        本频道还没产生过任务 / 交付,Algorithm Graph 暂时为空。派一个工就会看到节点。
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-[11px] text-[var(--text-tertiary)]">
        <Brain size={13} className="text-[var(--accent-text)]" />
        <span className="font-semibold text-[var(--text-secondary)]">Algorithm Graph</span>
        <span>· {raw.nodes.length} 节点 / {raw.edges.length} 边</span>
        <button
          onClick={() => void load()}
          className="ml-auto rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--hover)]"
          title="刷新"
        >
          刷新
        </button>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={laid.nodes}
          edges={laid.edges}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
          minZoom={0.4}
          maxZoom={2.2}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} size={1} color="var(--border)" />
          <Controls position="top-right" showInteractive={false} />
          <MiniMap pannable zoomable position="bottom-right" maskColor="rgba(0,0,0,0.06)" />
        </ReactFlow>
      </div>
    </div>
  )
}
