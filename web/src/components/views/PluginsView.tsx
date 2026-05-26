import { useState } from 'react'
import { Plug, Globe, RefreshCw, Trash2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'

// v4.1:plugin / 订阅源系统设计留到 v5,本轮先做布局 + mock 数据。
const INSTALLED_MOCK = [
  {
    id: 'gh-pr',
    name: 'GitHub PR Sync',
    logo: '🐙',
    description: '把 deliveries tab 的卡片一键提交到 GitHub PR,带 commit / 评审链接回填',
    version: '0.4.2',
    enabled: true,
  },
  {
    id: 'linear-issue',
    name: 'Linear Issue Bridge',
    logo: '📐',
    description: 'tasks tab 同步 Linear issue,owner / status 双向更新',
    version: '0.3.1',
    enabled: false,
  },
  {
    id: 'notion-doc',
    name: 'Notion Knowledge Sync',
    logo: '📓',
    description: 'memory tab 的 L2 / L3 摘要每周固化到 Notion 数据库',
    version: '0.2.7',
    enabled: true,
  },
  {
    id: 'figma-frames',
    name: 'Figma Frames Picker',
    logo: '🎨',
    description: 'composer 里 / 命令拉 Figma 文件指定 frame,投到 sandbox 渲染前端',
    version: '0.1.4',
    enabled: false,
  },
]

const SOURCES_MOCK = [
  {
    id: 'heliox-official',
    url: 'https://plugins.heliox.io/registry.json',
    label: 'Heliox 官方源',
    lastRefresh: '2026-05-24 13:42',
    status: 'ok' as const,
  },
  {
    id: 'community',
    url: 'https://community.heliox.io/plugins.json',
    label: '社区源',
    lastRefresh: '2026-05-21 09:08',
    status: 'ok' as const,
  },
  {
    id: 'kyle-private',
    url: 'https://github.com/kyle19901208/helio-plugins/raw/main/registry.json',
    label: 'Kyle 私源',
    lastRefresh: '2026-05-18 22:15',
    status: 'stale' as const,
  },
]

export interface PluginsViewProps {
  initialTab?: 'installed' | 'sources'
}

export function PluginsView({ initialTab = 'installed' }: PluginsViewProps) {
  const [installed, setInstalled] = useState(INSTALLED_MOCK)
  const [sources, setSources] = useState(SOURCES_MOCK)
  const [tab, setTab] = useState<'installed' | 'sources'>(initialTab)

  return (
    <div className="mx-auto h-full w-full max-w-[1200px] overflow-y-auto px-10 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">
            插件
          </div>
          <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight text-[var(--ink)]">
            Plugins
          </h1>
          <p className="mt-1 max-w-[640px] text-[13px] text-[var(--ink-3)]">
            扩展 Heliox 的能力:同步 GitHub / Linear / Notion / Figma 等外部系统,或装入纯本地工具。每个插件都是独立沙盒。
          </p>
        </div>
        <Button variant="secondary">
          <Plug size={14} />
          浏览插件市场
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'installed' | 'sources')}>
        <TabsList>
          <TabsTrigger value="installed">已装({installed.length})</TabsTrigger>
          <TabsTrigger value="sources">订阅源({sources.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {installed.map((p) => (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--glass-2)] text-xl">
                      {p.logo}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2">
                        {p.name}
                        <Badge variant="default">v{p.version}</Badge>
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">{p.description}</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(checked) =>
                      setInstalled((list) =>
                        list.map((it) => (it.id === p.id ? { ...it, enabled: checked } : it)),
                      )
                    }
                  />
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[var(--mute)]">
                    {p.enabled ? '已启用 · 沙盒运行中' : '未启用'}
                  </div>
                  <Button variant="ghost" size="sm">
                    <Trash2 size={12} />
                    卸载
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sources" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b border-[var(--line-soft)] bg-[var(--glass-2)] px-5 py-3 text-[10px] font-mono uppercase tracking-wider text-[var(--mute)]">
                <span>名称 / URL</span>
                <span>状态</span>
                <span>上次刷新</span>
                <span />
              </div>
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-6 border-b border-[var(--line-soft)] px-5 py-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--ink)]">
                      <Globe size={14} className="text-[var(--mute)]" />
                      {s.label}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[var(--mute)] font-mono">{s.url}</div>
                  </div>
                  <Badge variant={s.status === 'ok' ? 'success' : 'warning'}>
                    {s.status === 'ok' ? 'OK' : 'STALE'}
                  </Badge>
                  <div className="text-[12px] text-[var(--ink-3)] tabular-nums">{s.lastRefresh}</div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" title="刷新">
                      <RefreshCw size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="移除"
                      onClick={() => setSources((list) => list.filter((it) => it.id !== s.id))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" size="sm">
              <Plug size={13} />
              添加订阅源
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
