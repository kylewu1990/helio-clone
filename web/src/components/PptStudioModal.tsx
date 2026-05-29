// L3 PptStudioModal — 主页 PPT 模板的"零 LLM 跑通"入口。
// 视觉对齐 OD 截图(大 textarea + 示例提示词 chip + 工具栏:幻灯片 / 主题 / 页数 / 备注)。
// 提交后调 POST /api/templates/generate-pptx → server 端直接调 generate_pptx skill → 出 .pptx + HTML preview + Delivery。
// **不依赖 LLM key**,人手填表就能跑通模板真闭环。
import { useEffect, useMemo, useState } from 'react'
import { Send, X, Paperclip, Monitor, Wand2, Loader2, Sparkles, AlertCircle, ChevronDown, Image as ImageIcon, Trash2, FolderPlus, Folder, Puzzle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { getUserId } from '../lib/identity'
import type { ChannelSummary, Assistant } from '../lib/types'

// Q2:repo plugin meta(从 /api/plugins/all 拉)
type RepoPlugin = {
  id: string
  name: string
  zhName: string
  description: string
  category: string
  scenario: string
  tags: string[]
  stackable: boolean
  defaultThemeId: string | null
}

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
  assistants,
  onClose,
  onDone,
  onChannelsRefresh,
}: {
  open: boolean
  channels: ChannelSummary[]
  assistants: Assistant[]
  onClose: () => void
  onDone: (res: { deliveryId: string; channelId: string | null; previewUrl: string; pptxUrl: string }) => void
  onChannelsRefresh?: () => Promise<unknown> | void
}) {
  const projects = useMemo(
    () => channels.filter((c) => !c.archived && !c.isDM && (c.kind === 'project' || c.kind == null)),
    [channels],
  )
  // N4:可用助理列表(优先排有自带 LLM 配置的 — 真能跑通 AI 路径)
  const eligibleAssistants = useMemo(() => {
    const ok: Assistant[] = []
    const noKey: Assistant[] = []
    for (const a of assistants) {
      if (a.hasApiKey && a.baseUrl && a.model) ok.push(a)
      else noKey.push(a)
    }
    return { ok, noKey, all: [...ok, ...noKey] }
  }, [assistants])
  const defaultAssistantId = useMemo(() => {
    // 默认优先 Aria(设计师 AI)→ Foster(产品 AI)→ 第一个 OK 助理 → 第一个助理
    const byHandle = (h: string) => eligibleAssistants.all.find((a) => a.handle === h)
    return (
      byHandle('aria')?.id ??
      byHandle('foster')?.id ??
      eligibleAssistants.ok[0]?.id ??
      eligibleAssistants.all[0]?.id ??
      ''
    )
  }, [eligibleAssistants])
  const [assistantId, setAssistantId] = useState<string>(defaultAssistantId)
  useEffect(() => {
    if (!assistantId && defaultAssistantId) setAssistantId(defaultAssistantId)
  }, [defaultAssistantId, assistantId])
  const selectedAssistant = eligibleAssistants.all.find((a) => a.id === assistantId) ?? null
  // M2:双模式 — AI 一句话(主推,LLM 自动出 outline → 调 generate_pptx)
  //          人手填(零 LLM 兜底,L2 路径)
  const [mode] = useState<'ai' | 'manual'>('ai') // Phase T / M2:manual 已退,锁定 AI 单路径
  // AI 模式专属字段
  const [aiTopic, setAiTopic] = useState('Creative Mode — 把品牌设计系统当成可授权产品卖给 decision makers')
  const [aiAudience, setAiAudience] = useState('decision makers / 投资人 / 客户高管')
  const [aiDeckType, setAiDeckType] = useState<'pitch deck' | 'field report' | 'weekly review' | 'brand brief'>('pitch deck')
  // O2:附件(图片)— 上传后让 AI 在 outline 里建议哪页用哪张图,pptxgenjs 嵌入
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string }>>([])
  const [uploadingAttach, setUploadingAttach] = useState(false)
  // 公共字段
  const [title, setTitle] = useState(EXAMPLES[0].title)
  const [outline, setOutline] = useState(EXAMPLES[0].outline)
  const [themeId, setThemeId] = useState<Example['themeId']>(EXAMPLES[0].themeId)
  const [pageSize, setPageSize] = useState<'5-8' | '10-15'>('10-15')
  const [notes, setNotes] = useState(true)
  const [channelId, setChannelId] = useState<string>(projects[0]?.id ?? '')
  // P3:落地频道两段 — existing(已有项目) / new(新建)
  const [channelMode, setChannelMode] = useState<'existing' | 'new'>('existing')
  const [newProjectName, setNewProjectName] = useState('')
  const [exampleId, setExampleId] = useState<string | null>(EXAMPLES[0].id)
  const [busy, setBusy] = useState(false)
  // Q2:repo plugins(SKILL.md 文件夹) + 用户勾选的 id
  const [plugins, setPlugins] = useState<RepoPlugin[]>([])
  const [skillIds, setSkillIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!open) return
    api.repoPlugins()
      .then((r) => {
        setPlugins(r.items)
        // 默认:按当前 themeId 选对应主风格 + 自动叠两个 enhancer
        const def = new Set<string>()
        const main = r.items.find((p) => !p.stackable && p.defaultThemeId === themeId)
        if (main) def.add(main.id)
        for (const p of r.items) if (p.stackable) def.add(p.id)
        setSkillIds(def)
      })
      .catch(() => setPlugins([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // 切主题时同步切对应主风格 plugin(stackable 不变)
  useEffect(() => {
    if (!plugins.length) return
    setSkillIds((prev) => {
      const next = new Set(prev)
      // 移除所有 non-stackable
      for (const p of plugins) if (!p.stackable) next.delete(p.id)
      const main = plugins.find((p) => !p.stackable && p.defaultThemeId === themeId)
      if (main) next.add(main.id)
      return next
    })
  }, [themeId, plugins])

  useEffect(() => {
    if (!open) return
    if (!channelId && projects[0]?.id) setChannelId(projects[0].id)
  }, [open, projects, channelId])

  if (!open) return null

  const slidesPreview = parseOutline(outline)
  const slideCount = slidesPreview.length

  function applyExample(e: Example) {
    if (mode === 'ai') {
      // AI 模式:灌一句话主题 + 切主题
      setAiTopic(e.preview.replace(/^使用这个模板完成以下任务:/, '').replace(/^帮我做/, ''))
    } else {
      setTitle(e.title)
      setOutline(e.outline)
    }
    setThemeId(e.themeId)
    setExampleId(e.id)
  }

  async function uploadAttachments(files: FileList) {
    if (!files.length) return
    setUploadingAttach(true)
    const next: Array<{ url: string; name: string }> = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} 不是图片,跳过(暂只支持图片附件)`)
        continue
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} 超过 5MB,跳过`)
        continue
      }
      try {
        const fd = new FormData()
        fd.append('file', f)
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'x-user-id': getUserId() ?? '' },
          body: fd,
        })
        if (!res.ok) throw new Error(`${res.status}`)
        const data = (await res.json()) as { url: string; name: string; isImage: boolean }
        if (data.isImage) next.push({ url: data.url, name: data.name })
      } catch (e) {
        toast.error(`${f.name} 上传失败:${(e as Error).message}`)
      }
    }
    if (next.length) {
      setAttachments((prev) => [...prev, ...next])
      toast.success(`已上传 ${next.length} 张图,AI 会在 outline 里建议哪页用哪张`)
    }
    setUploadingAttach(false)
  }
  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url))
  }

  async function submit() {
    if (mode === 'ai') {
      // AI 一句话路径(N2 后端 /api/templates/generate-pptx-ai · 用助理身份)
      if (!aiTopic.trim()) {
        toast.error('请填一句话主题')
        return
      }
      if (!assistantId || !selectedAssistant) {
        toast.error('请先选一位 AI 助理来执行任务')
        return
      }
      if (!selectedAssistant.hasApiKey || !selectedAssistant.baseUrl || !selectedAssistant.model) {
        toast.error(`${selectedAssistant.name} 还没配置 LLM`, {
          description: `请在「设置 → 助理 → ${selectedAssistant.name}」里填 baseUrl + apiKey + model,或换一位已配好的助理`,
        })
        return
      }
      setBusy(true)
      try {
        // P3:若选了"新建项目",先创建一个 project channel
        let targetChannelId = channelId
        if (channelMode === 'new') {
          const cleanName = newProjectName.trim().replace(/^#/, '')
          if (!cleanName) {
            toast.error('请填项目频道名(英文小写、连字符)')
            setBusy(false)
            return
          }
          try {
            const ch = await api.createChannel({
              name: cleanName,
              kind: 'project',
              goal: aiTopic.trim().slice(0, 200),
              phase: 'discovery',
            })
            targetChannelId = ch.id
            await onChannelsRefresh?.()
            toast.success(`项目频道 #${cleanName} 已创建`)
          } catch (e) {
            toast.error(`创建项目频道失败:${(e as Error).message}`)
            setBusy(false)
            return
          }
        }
        const pageCount = pageSize === '5-8' ? 7 : 12
        const res = await fetch('/api/templates/generate-pptx-ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': getUserId() ?? '',
          },
          body: JSON.stringify({
            topic: aiTopic.trim(),
            audience: aiAudience.trim() || undefined,
            deckType: aiDeckType,
            pageCount,
            themeId,
            channelId: targetChannelId || undefined,
            assistantId, // N2:必传
            attachments: attachments.length ? attachments : undefined, // O2:图片附件
            skillIds: skillIds.size ? [...skillIds] : undefined, // Q2:启用的 plugins
          }),
        })
        if (!res.ok) {
          let detail: any
          try { detail = await res.json() } catch { detail = await res.text() }
          if (detail?.error === 'assistant_no_llm_config' || detail?.error === 'no_llm_key') {
            toast.error(`${selectedAssistant.name} 还没配 LLM`, {
              description: detail.hint || '在助理设置里配 baseUrl + apiKey + model',
            })
          } else if (detail?.error === 'assistant_required') {
            toast.error('请选一位 AI 助理')
          } else {
            throw new Error(typeof detail === 'string' ? detail : detail?.error || `${res.status}`)
          }
          return
        }
        // O3:后端立即返回 queued + 已发派工/收到消息;前端马上关 modal 跳频道
        const data = (await res.json()) as {
          ok: true
          jobId: string
          channelId: string | null
          status: 'queued'
          assistant: { id: string; name: string; avatarColor: number; role: string }
          pending: true
        }
        toast.success(`${data.assistant.name} 收到任务,开始做 PPT`, {
          description: '已跳到频道,看对话流 + 等 Delivery 落地(约 30 秒)',
        })
        onDone({
          deliveryId: data.jobId,         // 用 jobId 暂作引用(实际 deliveryId 后续 ws 推过来)
          channelId: data.channelId ?? targetChannelId,
          previewUrl: '',                  // 还没生成,先空
          pptxUrl: '',
        })
      } catch (e) {
        toast.error(`派工失败:${(e as Error).message}`)
      } finally {
        setBusy(false)
      }
      return
    }

    // Phase T / M2(红队 H2):人手填表路径(原 POST /api/templates/generate-pptx)已删除。
    // Modal 只保留 AI 单路径(一句话 → 助理 LLM 直出 HTML deck);后端旧路由同步删除,mode 锁定 'ai'。
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
              Heliox PPT Studio · Deck Architect 智能体
            </div>
            <h2 className="mt-1 font-display text-[18px] font-semibold tracking-tight text-[var(--ink)]">
              你想做什么演示?
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--ink-3)]">
              {mode === 'ai'
                ? '一句话主题 → 多角色 AI 协同(内容 / 数据 / 视觉)直出一份完整 HTML deck'
                : '人手填 outline(零 LLM 兜底)→ generate_pptx 出真 .pptx'}
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

        {/* Phase T / M2(红队 H2):manual 路径已删,Modal 只保留 AI 单路径 —— 不再需要模式切换 toggle。 */}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === 'ai' ? (
            <div className="flex flex-col gap-4">
              {/* O1:让谁做(AI 助理)— 弹出式 Popover */}
              <div className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">让谁做(AI 助理)</span>
                <AssistantPicker
                  assistants={eligibleAssistants.all}
                  okIds={new Set(eligibleAssistants.ok.map((a) => a.id))}
                  value={assistantId}
                  onChange={setAssistantId}
                />
                {selectedAssistant && !selectedAssistant.hasApiKey && (
                  <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-md border border-[var(--warn)]/30 bg-[var(--warn)]/8 px-2.5 py-1.5 text-[11px] text-[var(--warn)]">
                    <AlertCircle size={11} className="mt-px shrink-0" />
                    <span>
                      {selectedAssistant.name} 还没配 LLM key。在「设置 → 助理 → {selectedAssistant.name}」里填 baseUrl + apiKey + model 后才能跑 AI 路径。
                    </span>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">描述你想要的 PPT(主题 / 场景 / 关键点)</span>
                <textarea
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  rows={6}
                  placeholder={`告诉 AI 你想要什么 PPT,越具体效果越好。例如:

主题:Creative Mode — 把品牌设计系统当成可授权产品卖给 decision makers
场景:25 分钟分享会,投资人不熟 SaaS 但懂品牌
关键点:
- 用 Aurora pixel-2 设计稿做案例
- 强调 Token + Tailwind v4 的工程闭环
- 末页留"约 30 分钟 discovery call"CTA`}
                  className="mt-1 block w-full resize-y rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 text-[13.5px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[11.5px] placeholder:leading-relaxed placeholder:text-[var(--mute)] focus:border-[var(--accent)]/50"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">受众(可选)</span>
                  <input
                    value={aiAudience}
                    onChange={(e) => setAiAudience(e.target.value)}
                    placeholder="decision makers / 投资人 / 客户高管"
                    className="mt-1 block w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--mute)] focus:border-[var(--accent)]/50"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">类型</span>
                  <select
                    value={aiDeckType}
                    onChange={(e) => setAiDeckType(e.target.value as typeof aiDeckType)}
                    className="mt-1 block w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                  >
                    <option value="pitch deck">Pitch deck(募资 / 提案)</option>
                    <option value="field report">Field report(季度回顾)</option>
                    <option value="weekly review">Weekly review(周复盘)</option>
                    <option value="brand brief">Brand brief(品牌简报)</option>
                  </select>
                </label>
              </div>
              {/* Q2:启用的 Skill plugins(多选,可叠加) */}
              <div className="block">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">
                    <Puzzle size={11} className="mr-1 inline" /> 启用的 Skill plugins
                    <span className="ml-1 text-[var(--accent)]">{skillIds.size} 选中</span>
                  </span>
                  <span className="font-mono text-[10px] text-[var(--mute)]">从 plugins/ 文件夹自动扫</span>
                </div>
                <SkillPicker
                  plugins={plugins}
                  value={skillIds}
                  onChange={setSkillIds}
                />
              </div>

              {/* P3:落地频道两段选择 — 新建项目 vs 落已有 */}
              <div className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--mute)]">落地到哪个项目</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannelMode('existing')}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${
                      channelMode === 'existing'
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--ink)]'
                        : 'border-[var(--line-soft)] bg-[var(--bg)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                    }`}
                  >
                    <Folder size={13} />
                    落到已有项目
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannelMode('new')}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-left text-[12px] transition-colors ${
                      channelMode === 'new'
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--ink)]'
                        : 'border-[var(--line-soft)] bg-[var(--bg)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                    }`}
                  >
                    <FolderPlus size={13} />
                    新建项目频道
                  </button>
                </div>
                {channelMode === 'existing' ? (
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="mt-2 block w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]/50"
                  >
                    {projects.length === 0 ? (
                      <option value="">(没有项目频道,请新建)</option>
                    ) : (
                      projects.map((c) => (
                        <option key={c.id} value={c.id}>#{c.name} · {c.phase ?? '—'}</option>
                      ))
                    )}
                  </select>
                ) : (
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="项目频道名,英文小写连字符 · 例:aurora-pitch-2026"
                    className="mt-2 block w-full rounded-md border border-[var(--line-soft)] bg-[var(--bg)] px-3 py-2 font-mono text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--mute)] focus:border-[var(--accent)]/50"
                  />
                )}
              </div>

              <div className="rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] p-2.5 text-[11px] text-[var(--ink-3)]">
                <b className="text-[var(--ink-2)]">流程:</b> 一句话 → {selectedAssistant?.name ?? '助理'}(自带 model+apiKey)拆角色 → 多 AI 协同(内容 / 数据 / 视觉)→ 视觉主笔直出完整 HTML deck → 落 Delivery。
                <br />
                <b className="text-[var(--ink-2)]">绑定式协作:</b> 派工后 {selectedAssistant?.name ?? '该助理'} = 该频道这个 PPT 任务的负责人。后续你直接发"再做一版""不够精美" 不用 @,她会自动接住。其他 AI 要 @ 才能进。
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* O2:附件预览(若有)*/}
          {mode === 'ai' && attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div
                  key={a.url}
                  className="group relative h-16 w-16 overflow-hidden rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)]"
                  title={a.name}
                >
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.url)}
                    className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
                    title="移除"
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              ))}
              <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] text-[var(--mute)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => e.target.files && uploadAttachments(e.target.files)}
                  className="hidden"
                />
                {uploadingAttach ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
              </label>
            </div>
          )}

          {/* 工具栏(OD 风格) */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {mode === 'ai' ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--bg)] px-2.5 py-1 text-[11px] text-[var(--ink-2)] hover:bg-[var(--glass)]">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => e.target.files && uploadAttachments(e.target.files)}
                  className="hidden"
                />
                {uploadingAttach ? <Loader2 size={11.5} className="animate-spin" /> : <Paperclip size={11.5} />}
                <span>附件</span>
                {attachments.length > 0 && (
                  <span className="rounded-full bg-[var(--accent)] px-1.5 py-px font-mono text-[9px] text-white">
                    {attachments.length}
                  </span>
                )}
              </label>
            ) : (
              <ToolChip icon={<Paperclip size={11.5} />} label="附件" disabled hint="仅 AI 模式可用" />
            )}
            <ToolChip icon={<Monitor size={11.5} />} label="幻灯片" active />
            <ThemeSelect themeId={themeId} onChange={setThemeId} />
            <PageSelect value={pageSize} onChange={setPageSize} />
            {mode === 'manual' && <ChannelSelect projects={projects} value={channelId} onChange={setChannelId} />}
            {mode === 'manual' && <NotesToggle on={notes} onChange={setNotes} />}
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50 ${
                mode === 'ai'
                  ? 'bg-gradient-to-r from-[var(--accent)] to-[oklch(70%_0.2_40)]'
                  : 'bg-[var(--ink)] text-[var(--canvas)]'
              }`}
              title={mode === 'ai' ? 'AI 一句话生成 PPT' : '人手填表生成 PPT'}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : mode === 'ai' ? <Sparkles size={12} /> : <Send size={12} />}
              {busy ? '生成中…' : mode === 'ai' ? 'AI 生成' : '生成'}
            </button>
          </div>

          {/* 示例卡片 */}
          <div className="mt-5">
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)]">
              示例提示词 {mode === 'ai' ? '· 点击灌入一句话主题' : '· 点击灌入 outline'}
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

// Q2:Skill 多选(主风格 + 可叠加的 enhancer)
function SkillPicker({
  plugins,
  value,
  onChange,
}: {
  plugins: RepoPlugin[]
  value: Set<string>
  onChange: (next: Set<string>) => void
}) {
  if (plugins.length === 0) {
    return (
      <div className="mt-1 rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] px-3 py-2 text-[11.5px] text-[var(--mute)]">
        plugins/ 目录还没扫到任何 deck-*。在仓库根 plugins/ 加文件夹 + SKILL.md/prompt.md 即可。
      </div>
    )
  }
  const mains = plugins.filter((p) => !p.stackable)
  const enhancers = plugins.filter((p) => p.stackable)
  const toggle = (id: string, isMain: boolean) => {
    const next = new Set(value)
    if (isMain) {
      for (const p of mains) next.delete(p.id)
      if (!value.has(id)) next.add(id)
    } else {
      if (next.has(id)) next.delete(id)
      else next.add(id)
    }
    onChange(next)
  }
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--mute)]">主风格(单选)</div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {mains.map((p) => (
            <PluginCard key={p.id} plugin={p} active={value.has(p.id)} onClick={() => toggle(p.id, true)} />
          ))}
        </div>
      </div>
      {enhancers.length > 0 && (
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--mute)]">增强(可叠加)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {enhancers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id, false)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  value.has(p.id)
                    ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-soft)] bg-[var(--bg)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                }`}
                title={p.description}
              >
                {value.has(p.id) && <Check size={11} />}
                {p.zhName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
function PluginCard({ plugin, active, onClick }: { plugin: RepoPlugin; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        active
          ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]'
          : 'border-[var(--line-soft)] bg-[var(--bg)] hover:border-[var(--ink-3)]'
      }`}
      title={plugin.description}
    >
      <div className="flex items-center gap-1 truncate text-[12px] font-medium text-[var(--ink)]">
        {active && <Check size={11} className="text-[var(--accent)]" />}
        {plugin.zhName}
      </div>
      <div className="truncate text-[10px] text-[var(--ink-3)]">{plugin.description}</div>
    </button>
  )
}

function AssistantPicker({
  assistants,
  okIds,
  value,
  onChange,
}: {
  assistants: Assistant[]
  okIds: Set<string>
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const selected = assistants.find((a) => a.id === value) ?? assistants[0]

  if (assistants.length === 0) {
    return (
      <div className="mt-1 rounded-md border border-dashed border-[var(--line)] bg-[var(--glass-2)] px-3 py-2 text-[11.5px] text-[var(--mute)]">
        还没创建任何 AI 助理。在「设置 → 助理」里创建一位再回来。
      </div>
    )
  }

  const list = q
    ? assistants.filter(
        (a) =>
          a.name.toLowerCase().includes(q.toLowerCase()) ||
          (a.status ?? '').toLowerCase().includes(q.toLowerCase()) ||
          (a.handle ?? '').toLowerCase().includes(q.toLowerCase()),
      )
    : assistants

  const selectedOk = selected ? okIds.has(selected.id) : false

  return (
    <div className="relative mt-1">
      {/* 选中态 — 单卡 + 切换按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
          open ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]' : 'border-[var(--line-soft)] bg-[var(--bg)] hover:border-[var(--ink-3)]'
        }`}
      >
        {selected && (
          <>
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[11.5px] font-semibold text-white"
              style={{ background: `var(--identity-${((selected.avatarColor || 1) % 12) + 1})` }}
            >
              {selected.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--ink)]">
                {selected.name}
                {selectedOk ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" title="LLM 已配" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" title="缺 LLM 配" />
                )}
              </div>
              <div className="truncate text-[11px] text-[var(--mute)]">
                {selected.status || '—'}
                {selectedOk && selected.model && <span> · {selected.model}</span>}
                {!selectedOk && <span> · 缺 LLM 配置</span>}
              </div>
            </div>
          </>
        )}
        <span className="text-[var(--mute)]">
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* 背板点击关闭 */}
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-[81] mt-1 max-h-[360px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg)] shadow-[var(--shadow-2)]">
            <div className="border-b border-[var(--line-soft)] p-2">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索助理(名字 / 角色)…"
                className="w-full rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] px-2.5 py-1.5 text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--mute)]"
              />
            </div>
            <ul className="max-h-[300px] overflow-y-auto p-1">
              {list.length === 0 ? (
                <li className="px-2 py-3 text-center text-[11.5px] text-[var(--mute)]">没找到</li>
              ) : (
                list.map((a) => {
                  const ok = okIds.has(a.id)
                  const active = a.id === value
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(a.id)
                          setOpen(false)
                          setQ('')
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                          active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--glass-2)]'
                        }`}
                      >
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold text-white"
                          style={{ background: `var(--identity-${((a.avatarColor || 1) % 12) + 1})` }}
                        >
                          {a.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-2)]">
                          {a.name}
                          <span className="ml-1 text-[var(--mute)]">· {a.status || '—'}</span>
                        </span>
                        {ok ? (
                          <span className="text-[10px] font-mono text-[var(--accent)]" title={a.model ?? ''}>
                            {(a.model || '').slice(0, 16) || '—'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--warn)]">缺 LLM</span>
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        </>
      )}
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
