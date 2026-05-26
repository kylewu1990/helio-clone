// K5 Connectors:统一改成"未连接占位 + 一键 OAuth toast"。
// 真 OAuth 流留 v4.2(见 docs/ai/GITHUB_LIBRARY.md 第 1 项 — open-design)。
// connector schema 借鉴 open-design (Apache 2.0):id / name / status / scopes / authUrlPlaceholder。
import { useEffect, useState } from 'react'
import { Globe, Github, Cpu, Plus, RefreshCw, Sparkles, Zap, Construction } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { api } from '../../lib/api'
import type { ProvidersResponse } from '../../lib/types'

// connector schema(open-design Apache 2.0 启发):
//   id / name / logo / description / scopes / status / authUrlPlaceholder
type ConnectorStatus = 'disconnected' | 'coming-soon'
type ConnectorDef = {
  id: string
  name: string
  logo: React.ReactNode
  description: string
  status: ConnectorStatus
  scopes: string[]
  authUrlPlaceholder: string
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    logo: <Github size={20} />,
    description: 'PR / issue 双向同步;deliveries 可一键提交 PR',
    status: 'disconnected',
    scopes: ['repo', 'pull_request', 'issue'],
    authUrlPlaceholder: 'https://github.com/login/oauth/authorize?…(v4.2)',
  },
  {
    id: 'notion',
    name: 'Notion',
    logo: <span className="text-lg">📓</span>,
    description: 'memory 自动归档到指定数据库',
    status: 'disconnected',
    scopes: ['databases.read', 'pages.write'],
    authUrlPlaceholder: 'https://api.notion.com/v1/oauth/authorize?…(v4.2)',
  },
  {
    id: 'linear',
    name: 'Linear',
    logo: <span className="text-lg">📐</span>,
    description: 'tasks tab 与 Linear issue 双向同步',
    status: 'coming-soon',
    scopes: ['issues:read', 'issues:write'],
    authUrlPlaceholder: 'https://linear.app/oauth/authorize?…(v4.2)',
  },
  {
    id: 'slack',
    name: 'Slack',
    logo: <span className="text-lg">💬</span>,
    description: 'Delivery accept / reject 推送到 Slack 频道',
    status: 'coming-soon',
    scopes: ['chat:write'],
    authUrlPlaceholder: 'https://slack.com/oauth/v2/authorize?…(v4.2)',
  },
]

export interface IntegrationsViewProps {
  initialTab?: 'mcp' | 'connectors' | 'anywhere'
}

export function IntegrationsView({ initialTab = 'mcp' }: IntegrationsViewProps) {
  const [tab, setTab] = useState(initialTab)
  const [providers, setProviders] = useState<ProvidersResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    api
      .providers()
      .then((r) => mounted && setProviders(r))
      .catch(() => mounted && setProviders({ default: '', providers: [] }))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="mx-auto h-full w-full max-w-[1200px] overflow-y-auto px-10 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">
            集成
          </div>
          <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight text-[var(--ink)]">
            Integrations
          </h1>
          <p className="mt-1 max-w-[640px] text-[13px] text-[var(--ink-3)]">
            MCP 服务器、第三方连接器、桌面端 Anywhere 浮窗。Heliox 不锁定生态,本地优先 + 标准协议。
          </p>
        </div>
        <Button variant="secondary">
          <Plus size={14} />
          手动添加
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="connectors">连接器</TabsTrigger>
          <TabsTrigger value="anywhere">Anywhere</TabsTrigger>
        </TabsList>

        <TabsContent value="mcp" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu size={16} />
                MCP 服务器
              </CardTitle>
              <CardDescription>
                Model Context Protocol — 所有 AI 助手共享的工具池。已配置的 provider 显示在下方,数据来自后端 publicProviders() 真接口。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              {loading && (
                <div className="px-5 py-6 text-[13px] text-[var(--mute)]">加载 provider 中…</div>
              )}
              {!loading && providers && providers.providers.length === 0 && (
                <div className="px-5 py-6 text-[13px] text-[var(--mute)]">
                  暂未配置任何 provider。可在设置里添加。
                </div>
              )}
              {!loading && providers && providers.providers.length > 0 && (
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-t border-[var(--line-soft)]">
                  <div className="contents text-[10px] font-mono uppercase tracking-wider text-[var(--mute)]">
                    <span className="px-5 py-3 bg-[var(--glass-2)]">Provider</span>
                    <span className="px-2 py-3 bg-[var(--glass-2)]">Base URL</span>
                    <span className="px-2 py-3 bg-[var(--glass-2)]">默认模型</span>
                    <span className="px-5 py-3 bg-[var(--glass-2)] text-right">状态</span>
                  </div>
                  {providers.providers.map((p) => (
                    <div key={p.id} className="contents">
                      <div className="border-t border-[var(--line-soft)] px-5 py-3.5">
                        <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--ink)]">
                          {p.label}
                          {providers.default === p.id && (
                            <Badge variant="accent">默认</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                          {p.id}
                        </div>
                      </div>
                      <div className="border-t border-[var(--line-soft)] px-2 py-3.5 font-mono text-[12px] text-[var(--ink-3)] truncate">
                        {p.models.length} 个模型
                      </div>
                      <div className="border-t border-[var(--line-soft)] px-2 py-3.5 font-mono text-[12px] text-[var(--ink-3)] truncate">
                        {p.models[0] ?? '—'}
                      </div>
                      <div className="border-t border-[var(--line-soft)] px-5 py-3.5 text-right">
                        <Badge variant={p.configured ? 'success' : 'warning'}>
                          {p.configured ? '已配置' : '缺密钥'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connectors" className="mt-6">
          <div className="mb-3 rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] p-3 text-[12px] text-[var(--ink-3)]">
            <div className="flex items-center gap-1.5 text-[var(--ink-2)]">
              <Construction size={13} /> <b>Connectors v4.1 占位</b>
            </div>
            <p className="mt-1">
              真 OAuth 流(GitHub / Notion / Linear / Slack)留 <code>v4.2</code> 接入。
              下方 4 张卡显示 connector schema(open-design Apache 2.0 启发的 <code>id / name / scopes / authUrl</code> 字段),
              点 "Connect" 会弹一条 toast 说明,不发起真 OAuth。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {CONNECTORS.map((c) => (
              <Card key={c.id} className="border-dashed">
                <CardHeader className="flex flex-row items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)]">
                    {c.logo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {c.name}
                      <Badge variant={c.status === 'coming-soon' ? 'warning' : 'default'}>
                        {c.status === 'coming-soon' ? '即将上线' : '未连接'}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">{c.description}</CardDescription>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded border border-[var(--line)] bg-[var(--glass-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-3)]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1.5 truncate font-mono text-[10px] text-[var(--mute)]" title={c.authUrlPlaceholder}>
                      {c.authUrlPlaceholder}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      toast.message(`${c.name} OAuth 接入留 v4.2`, {
                        description: '详见 docs/ai/GITHUB_LIBRARY.md 第 1 项(open-design connector schema)。',
                      })
                    }
                  >
                    <Globe size={13} />
                    Connect(v4.2 占位)
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="anywhere" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap size={16} />
                Anywhere 浮窗
              </CardTitle>
              <CardDescription>
                Heliox 桌面端独有功能:全局快捷键唤起浮窗,任何应用里都能给 AI 团队派工。本地优先,不上云。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-md border border-[var(--line)] bg-[var(--glass-2)] p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                  快捷键
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[12px]">
                    ⌘
                  </kbd>
                  <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[12px]">
                    ⇧
                  </kbd>
                  <kbd className="rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[12px]">
                    Space
                  </kbd>
                </div>
                <Button variant="ghost" size="sm" className="mt-3">
                  <Sparkles size={13} />
                  自定义快捷键
                </Button>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-[var(--glass-2)] p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                  状态
                </div>
                <div className="mt-1 text-[14px] text-[var(--ink)]">桌面端浮窗服务未运行</div>
                <Button variant="default" size="sm" className="mt-3">
                  <RefreshCw size={13} />
                  启动桌面服务
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
