// L3 PptStudioModal — 主页 PPT 模板的"零 LLM 跑通"入口。
// 视觉对齐 OD 截图(大 textarea + 示例提示词 chip + 工具栏:幻灯片 / 主题 / 页数 / 备注)。
// 提交后调 POST /api/templates/generate-pptx → server 端直接调 generate_pptx skill → 出 .pptx + HTML preview + Delivery。
// **不依赖 LLM key**,人手填表就能跑通模板真闭环。
import { useEffect, useMemo, useState } from 'react'
import { Send, X, Paperclip, Monitor, Wand2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ChannelSummary } from '../lib/types'

// 4 张 OD 风格的示例提示词卡(点击 → 填入 textarea + 选主题)
type Example = {
  id: string
  themeId: 'auto' | 'creative' | 'cobalt' | 'scatterbrain'
  label: string
  preview: string
  title: string
  outline: string
}
const EXAMPLES: Example[] = [
  {
    id: 'zhangzara-creative',
    themeId: 'creative',
    label: 'Html Ppt Zhangzara Creative Mode',
    preview: '使用这个模板完成以下任务:Creative Mode — Cream paper canvas with confident multi-color accents, design-led 风格,适合 agency pitch / 品牌设计稿评审。',
    title: 'Aurora 品牌设计评审',
    outline: `品牌愿景
- 让团队像一个人一样思考
- 视觉传达克制、有力
- 不堆 dribbble 风格

色彩系统
- 主色:奶油纸 + 自信跳色(绿/粉/橙/黄)
- 辅助色:浅灰描边
- 禁色:深红、纯白底大色块

字体阶梯
- Display:Archivo Black
- Body:Inter / SF Mono
- Caption:11px,letter-spacing 0.18em

下一步
- 把 token 落 tokens.json
- 在 Figma 同步 4 个新组件
- 给 Marketing 一份对外色卡`,
  },
  {
    id: 'guizang-ppt',
    themeId: 'auto',
    label: 'Guizang Ppt — 一人公司',
    preview: '帮我做一份杂志风的 PPT —— 关于"一人公司·被 AI 折叠的组织",25 分钟分享会用。',
    title: '一人公司:被 AI 折叠的组织',
    outline: `开场:一个独立创作者
- 在 64 天里完成 11 万行代码
- 拒绝 3 个外包
- 生活作息几乎没变

为什么能这样
- AI 把"做"压到 5 倍速
- 决策瓶颈反而显形
- 老板的工作从执行 → 判断

折叠后的组织
- 不再是金字塔
- 而是"一个人 + N 个 AI 助手"
- 协作发生在项目频道里

写给下一代创业者
- 别招人,先招 AI
- 用项目频道串协作
- 老板要学会"说人话给 AI"`,
  },
  {
    id: 'cobalt-grid',
    themeId: 'cobalt',
    label: 'Html Ppt Zhangzara Cobalt Grid',
    preview: 'Cobalt Grid — Electric cobalt italic serifs on a graph-paper background;适合 field report / 季度回顾。',
    title: 'Index 2026:Q1 field report',
    outline: `本季关键数字
- 在岗 Agent:8
- 本周交付:3
- 待审 Delivery:3
- 被卡:0

交付亮点
- pixel-2 Button v2 真沙盒预览
- invoice-flow 周报全自动
- q3-positioning 一句话定稿

风险与下季计划
- LLM key 尚未配置,模板派工依赖人工填
- Editor 评审通路验证完成
- 下季补 OAuth 真接入`,
  },
  {
    id: 'scatterbrain',
    themeId: 'scatterbrain',
    label: 'Html Ppt Zhangzara Scatterbrain',
    preview: 'Scatterbrain — Post-it inspired: pastel sticky notes 风格,适合头脑风暴 / 周会复盘。',
    title: '周会:大家在卡什么',
    outline: `本周三件最难的事
- 让营销不再每条都来对口径
- Optimizer 建议被忽略 5 次
- Editor 改完文件没人审

每个 AI 的状态
- Aria:活跃,5 次提交
- Cypher:活跃,正在跑 Button v2
- Mast:正常,周报自动跑完
- Atlas:卡住,等老板拍板事故复盘

下周一件事
- 让 Optimizer 直接跳过"提建议",直接 PR
- 老板只决策"接受 / 不接受"`,
  },
]

function parseOutline(text: string): Array<{ title: string; bullets: string[] }> {
  // 简单规则:非空行,无缩进或以非 -/* 开头 = 页 title;
  //          以 - / * / • / 数字. 开头 + 缩进 = bullet;两者间空行无所谓。
  const lines = text.split(/\r?\n/)
  const slides: Array<{ title: string; bullets: string[] }> = []
  let cur: { title: string; bullets: string[] } | null = null
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue
    const isBullet = /^[\s　]*[-*•·]\s+/.test(line) || /^\s+\S/.test(line)
    if (isBullet) {
      if (!cur) {
        // 第一行就是 bullet → 当前页缺 title,补一个占位
        cur = { title: '(无标题页)', bullets: [] }
        slides.push(cur)
      }
      const txt = line.replace(/^[\s　]*[-*•·]\s+/, '').replace(/^\s+/, '').trim()
      if (txt) cur.bullets.push(txt)
    } else {
      cur = { title: line.trim(), bullets: [] }
      slides.push(cur)
    }
  }
  return slides.filter((s) => s.title || s.bullets.length > 0)
}

export function PptStudioModal({
  open,
  channels,
  onClose,
  onDone,
}: {
  open: boolean
  channels: ChannelSummary[]
  onClose: () => void
  onDone: (res: { deliveryId: string; channelId: string | null; previewUrl: string; pptxUrl: string }) => void
}) {
  const projects = useMemo(
    () => channels.filter((c) => !c.archived && !c.isDM && (c.kind === 'project' || c.kind == null)),
    [channels],
  )
  const [title, setTitle] = useState(EXAMPLES[0].title)
  const [outline, setOutline] = useState(EXAMPLES[0].outline)
  const [themeId, setThemeId] = useState<Example['themeId']>(EXAMPLES[0].themeId)
  const [pageSize, setPageSize] = useState<'5-8' | '10-15'>('5-8')
  const [notes, setNotes] = useState(true)
  const [channelId, setChannelId] = useState<string>(projects[0]?.id ?? '')
  const [exampleId, setExampleId] = useState<string | null>(EXAMPLES[0].id)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (!channelId && projects[0]?.id) setChannelId(projects[0].id)
  }, [open, projects, channelId])

  if (!open) return null

  const slidesPreview = parseOutline(outline)
  const slideCount = slidesPreview.length

  function applyExample(e: Example) {
    setTitle(e.title)
    setOutline(e.outline)
    setThemeId(e.themeId)
    setExampleId(e.id)
  }

  async function submit() {
    if (!title.trim()) {
      toast.error('请先填一个 PPT 标题')
      return
    }
    if (slidesPreview.length === 0) {
      toast.error('outline 解析不到任何幻灯片,试着每页占一行 + 用 - 列要点')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/templates/generate-pptx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('helio.userId') || '',
        },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: notes ? `by ${new Date().toLocaleDateString('zh-CN')} · Heliox PPT Studio` : '',
          themeId,
          channelId: channelId || undefined,
          slides: slidesPreview.map((s) => ({ title: s.title, bullets: s.bullets })),
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`${res.status} ${txt.slice(0, 200)}`)
      }
      const data = (await res.json()) as { ok: true; deliveryId: string; previewUrl: string; pptxUrl: string; slideCount: number }
      toast.success(`PPT 已生成:${data.slideCount} 页,Delivery 已落地`)
      onDone({ deliveryId: data.deliveryId, channelId: channelId || null, previewUrl: data.previewUrl, pptxUrl: data.pptxUrl })
    } catch (e) {
      toast.error(`生成失败:${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-[min(820px,94vw)] max-h-[90vh] flex-col rounded-[14px] border border-[var(--line)] bg-[var(--glass-2)] shadow-[var(--shadow-2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--mute)]">
              Heliox PPT Studio · 零 LLM 直生成
            </div>
            <h2 className="mt-1 font-display text-[18px] font-semibold tracking-tight text-[var(--ink)]">
              你想做什么演示?
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">
              填表 → 后端直接调 generate_pptx 出真 .pptx · 不需要 LLM key
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--mute)] hover:bg-[var(--glass)] hover:text-[var(--ink-2)]"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 当前示例 chip(可关) */}
          {exampleId && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--ink-2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              示例提示词:{EXAMPLES.find((e) => e.id === exampleId)?.label}
              <button
                type="button"
                onClick={() => setExampleId(null)}
                className="ml-1 text-[var(--mute)] hover:text-[var(--ink)]"
                title="清除示例标记"
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* 标题 */}
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">PPT 标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如:Aurora 品牌设计评审"
              className="mt-1 block w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 text-[13.5px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--mute)] focus:border-[var(--accent)]/50"
            />
          </label>

          {/* outline textarea */}
          <label className="mt-3 block">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                outline · 每页占一行,以 - / • 开头是 bullet
              </span>
              <span className="font-mono text-[10px] text-[var(--accent)]">{slideCount} 页 / {slideCount > 0 ? slidesPreview.reduce((n, s) => n + s.bullets.length, 0) : 0} 条 bullet</span>
            </div>
            <textarea
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              rows={10}
              placeholder={`Q3 核心目标\n- 上线 pixel-2 设计系统\n- 把开票流水自动化拉到 95%\n\n进展速览\n- Aria 完成 Button v2 设计稿`}
              className="mt-1 block w-full resize-y rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--mute)] focus:border-[var(--accent)]/50"
            />
          </label>

          {/* 工具栏(OD 风格) */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <ToolChip icon={<Paperclip size={11.5} />} label="附件" disabled hint="留 v4.2" />
            <ToolChip icon={<Monitor size={11.5} />} label="幻灯片" active />
            <ThemeSelect themeId={themeId} onChange={setThemeId} />
            <PageSelect value={pageSize} onChange={setPageSize} />
            <ChannelSelect projects={projects} value={channelId} onChange={setChannelId} />
            <NotesToggle on={notes} onChange={setNotes} />
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--canvas)] hover:opacity-90 disabled:opacity-50"
              title="生成 PPT(Cmd+Enter)"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {busy ? '生成中…' : '生成'}
            </button>
          </div>

          {/* 示例卡片 */}
          <div className="mt-5">
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)]">
              示例提示词
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => applyExample(e)}
                  className={`group flex flex-col gap-2 rounded-[10px] border p-3 text-left transition-colors ${
                    exampleId === e.id
                      ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]'
                      : 'border-[var(--line-soft)] bg-[var(--bg)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  <ExamplePreview themeId={e.themeId} title={e.title} />
                  <div className="text-[12px] font-semibold text-[var(--ink)]">{e.label}</div>
                  <div className="line-clamp-2 text-[11px] text-[var(--ink-3)]">{e.preview}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolChip({
  icon,
  label,
  active,
  disabled,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  hint?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        active
          ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'border-[var(--line-soft)] bg-[var(--bg)] text-[var(--ink-2)] hover:bg-[var(--glass)]'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      title={hint}
    >
      {icon}
      <span>{label}</span>
      {hint && <span className="text-[9.5px] text-[var(--mute)]">{hint}</span>}
    </button>
  )
}

function ThemeSelect({ themeId, onChange }: { themeId: string; onChange: (v: 'auto' | 'creative' | 'cobalt' | 'scatterbrain') => void }) {
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg)] px-2 py-0.5 text-[11px]">
      <Wand2 size={11.5} className="text-[var(--ink-3)]" />
      <select
        value={themeId}
        onChange={(e) => onChange(e.target.value as 'auto' | 'creative' | 'cobalt' | 'scatterbrain')}
        className="bg-transparent text-[11px] text-[var(--ink-2)] outline-none"
      >
        <option value="auto">自动 / Clean</option>
        <option value="creative">Zhangzara Creative</option>
        <option value="cobalt">Cobalt Grid</option>
        <option value="scatterbrain">Scatterbrain</option>
      </select>
    </label>
  )
}

function PageSelect({ value, onChange }: { value: '5-8' | '10-15'; onChange: (v: '5-8' | '10-15') => void }) {
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg)] px-2 py-0.5 text-[11px]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as '5-8' | '10-15')}
        className="bg-transparent text-[11px] text-[var(--ink-2)] outline-none"
      >
        <option value="5-8">5-8 pages</option>
        <option value="10-15">10-15 pages</option>
      </select>
    </label>
  )
}

function ChannelSelect({
  projects,
  value,
  onChange,
}: {
  projects: ChannelSummary[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg)] px-2 py-0.5 text-[11px]">
      <span className="text-[var(--mute)]">落地:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[11px] text-[var(--ink-2)] outline-none"
      >
        <option value="">无</option>
        {projects.map((c) => (
          <option key={c.id} value={c.id}>#{c.name}</option>
        ))}
      </select>
    </label>
  )
}

function NotesToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        on
          ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'border-[var(--line-soft)] bg-[var(--bg)] text-[var(--ink-3)]'
      }`}
      title="副标题里加日期 + Studio 出处"
    >
      <span>备注</span>
      <span className={`relative inline-block h-3.5 w-7 rounded-full ${on ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`}>
        <span
          className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all"
          style={{ left: on ? '14px' : '2px' }}
        />
      </span>
    </button>
  )
}

function ExamplePreview({ themeId, title }: { themeId: string; title: string }) {
  const palette: Record<string, { bg: string; ink: string; accent: string }> = {
    auto: { bg: '#fafaf8', ink: '#18181b', accent: '#1c1c1c' },
    creative: { bg: '#f3ead5', ink: '#1c1c1c', accent: '#3a7e3a' },
    cobalt: { bg: '#f5f5fa', ink: '#0a1454', accent: '#1f3bd1' },
    scatterbrain: { bg: '#ebe3d2', ink: '#1c1c1c', accent: '#d97757' },
  }
  const p = palette[themeId] || palette.auto
  return (
    <div
      className="flex h-[78px] items-end justify-between rounded-md border border-[var(--line-soft)] px-2.5 py-2"
      style={{ background: p.bg, color: p.ink }}
    >
      <div>
        <div className="text-[8.5px] font-mono uppercase tracking-[0.18em] opacity-60">EXAMPLE.HTML</div>
        <div className="mt-1 max-w-[180px] text-[10.5px] font-semibold leading-tight">{title}</div>
      </div>
      <div className="flex h-full items-end gap-[3px]">
        <span className="h-[34px] w-2 rounded-sm" style={{ background: p.accent }} />
        <span className="h-[24px] w-2 rounded-sm" style={{ background: `${p.accent}80` }} />
        <span className="h-[44px] w-2 rounded-sm" style={{ background: p.accent }} />
      </div>
    </div>
  )
}
