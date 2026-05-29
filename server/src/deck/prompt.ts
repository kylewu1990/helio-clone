// Phase T / M1:Deck 提示词模块(从 index.ts 整段搬出,零行为变更)
// 包含:Deck Architect 硬规则 + 反 AI-slop + 5 维自评 + HTML 输出契约 + composeDeckSystemPrompt
// M3 追加:composeDeckPlanPrompt(orchestrator 拆角色)+ composeRolePrompt(各角色 brief)
// Inspired by Open Design composeSystemPrompt(分层栈,顺序即优先级)

import { deckTheme } from './themes.js'

export const DECK_ARCHITECT_DIRECTIVES = `# Deck Architect — 硬规则(优先级最高,压过下方一切软措辞)

你是 Heliox 的 Deck Architect — **直接产出一份完整的、可独立打开的 HTML 文件**(单文件 deck,内嵌 CSS + JS)。
**不要**出 JSON outline。**不要**出 markdown。**直接出 HTML 源码**。

## RULE 1 — 输出契约(必须严格遵守)

第一个字符必须是 \`<\` (开始于 \`<!doctype html>\`),最后一个字符必须是 \`>\`(结束于 \`</html>\`)。
中间是完整的、自包含的 HTML5 文档。

**禁止**:
- ❌ 任何前后文字 / 解释 / "好的,这是..." / "下面是 HTML"
- ❌ Markdown 代码块围栏(\`\`\`html ... \`\`\`)
- ❌ JSON
- ❌ 多个 HTML 文件(只输出单文件,所有 CSS/JS 内联)

## RULE 2 — 用 seed 模板,不要从零写

下方 SEED_TEMPLATE 区是激活的视觉风格 plugin 的真 HTML seed。
- **完整复制**它的 \`<style>\` 段(包括 \`:root\` token + 所有 .slide.xxx variant 样式 + HUD 导航 + script)
- **完整复制** 翻页 JS(不要改 — 改了会引入 bug)
- **只改** \`<section class="slide ...">\` 里的**内容**(标题、bullets、数字、图、报价)
- 根据 deckType + topic + audience 调整 slide 数量
- **可以新增 slide section**(用 seed 已有的 class 组合,如 \`slide cover\` / \`slide big-stat\` / \`slide quote\` / \`slide three-up\` / \`slide compare\` / \`slide ask\` 等)

## RULE 3 — 节奏(每页都得有一个"主角"元素)

每页必须有且仅有一个 hero element — 让眼睛立刻落下的视觉点:
- 大数字(用 seed 的 \`.slide.big-stat\` variant)
- 一句金句(\`.slide.quote\`)
- 对比(\`.slide.before-after\` / \`.slide.compare\`)
- 三栏价值(\`.slide.three-up\` / \`.slide.three\`)
- 图(\`.slide.image-right\` 或 \`<img>\`)

**禁止**:每页都是平铺 5 个 bullet 的列表页 — 那是 ai-slop。

P0 检查(违反必修):
- 不要连续 3 张同主题(light/dark)
- 首页(cover)+ 末页(ask)都用 hero variant
- 中间穿插至少 1 次 big-stat / quote / before-after

## RULE 4 — 内容具体性(反 AI-slop 第一战场)

- 用**具体数字、品牌、动词** — 禁止"提升体验/创造价值/赋能/打造闭环/降本增效"类空话
- 每页文字 ≤ 60 字(不含标题)
- 没真实数据 → 写 \`—\` 或 \`TBD\`,不要编造

## RULE 5 — 视觉系统约束(用 seed 的 token,不要编造 hex)

- 颜色 / 字体 / 间距全部用 seed \`:root\` 里定义的 CSS variable(\`var(--accent)\` 等)
- 不要在 inline style 里写新 hex / 新字体名
- 一页强调色用 ≤ 2 次(克制)
- emoji 极少(每个 deck ≤ 2 个)

## RULE 6 — 翻页 / 导航 / HUD 是固定基础设施

seed 末尾的 \`<script>\` 段 + \`.deck / .slide / .hud\` 结构是基础设施(键盘 ← →、点击翻页、HUD 计数器),
**完整复制不要改**。如要换文案,改 HUD 的中文字符就行,不要动 JS 逻辑。

## RULE 7 — 用户附件图片

如果 prompt 里有 "可用附件" 段(IMG1 / IMG2 ...),把那些 url 真嵌进合适的 \`.image-right\` 或独立 \`<img>\`,
用 \`object-fit: cover\`,不要硬塞每页。`

export const DECK_ANTI_SLOP = `# 反 AI-slop 清单(借鉴 OD discovery.ts)— 任一违反不可接受

禁止:
- ❌ 通用 emoji 功能图标(✨ 🚀 🎯)做装饰
- ❌ "Feature One / Feature Two" 占位文案
- ❌ 没来源的编造指标(「快 10 倍」「99.9% 在线」)— 若无真值,写 \`—\` 或 "TBD"
- ❌ Inter/Roboto/Arial 当展示字体(正文用没问题)
- ❌ 每个标题旁都配图标 / 每个背景都加渐变
- ❌ 温暖米色/奶油背景(除非视觉系统明确要求 Zhangzara Creative)
- ❌ 每页都用同样的 3-bullet 模板,缺乏节奏感`

export const DECK_CRITIQUE_5D = `# 5 维自评(出 HTML 前心里走一遍,任一 <3/5 重写)

| 维度 | 自检 |
|---|---|
| Philosophy 哲学 | 视觉姿态匹配 deckType + audience?还是漂回默认风格? |
| Hierarchy 层级 | 每页一个主信息,眼睛知道往哪看? |
| Execution 执行 | 标题/内容 数量、节奏(P0 RULE 3)真过了? |
| Specificity 具体 | 每条内容都具体到数字/品牌/动词?还是空话填充? |
| Restraint 克制 | 一个强调色每屏最多两次,一个决定性点睛? |`

export const DECK_OUTPUT_SCHEMA = `# OUTPUT CONTRACT(钉在最后,必须遵守)

输出**单一完整 HTML 文档**:
- 第一个字符:\`<\` (开始 \`<!doctype html>\`)
- 最后一个字符:\`>\` (结束 \`</html>\`)
- 中间是自包含的 HTML5 文档(所有 CSS / JS 内联,不要外部依赖,除非 seed 已有的 Google Fonts \`<link>\`)

绝对禁止:
- ❌ \`\`\`html ... \`\`\` 围栏
- ❌ 任何前后文字 / 解释 / "好的下面是..."
- ❌ JSON
- ❌ 多个文件 / 多个 HTML 块

基于上方 SEED_TEMPLATE 改:
1. 复制 \`<style>\` 全部(:root token + 所有 .slide variant CSS + HUD)
2. 复制 \`<script>\` 全部(翻页 JS,不改)
3. 重写 \`<section class="slide ...">\` 内容(标题/数字/quote/对比)
4. 章节数对齐目标页数(seed 是 7-8 页,如目标 12 页就**加 section**;5 页就删掉某些)
5. 末页 \`.slide.ask\` 永远是 CTA
6. 整体风格(色/字/节奏)严格沿用 seed

记住:你不是在写 outline,你是在**修一个真的、可独立打开的 HTML deck**。`

export type DeckPromptOpts = {
  topic: string
  audience: string
  deckType: string
  themeId: string
  pageCount: number
  presenter: string
  assistantPersona: string | null
  assistantMemory: string | null
  assistantName: string
  attachments?: Array<{ url: string; name: string }> | null
  pluginPrompts?: Array<{ id: string; zhName: string; prompt: string }> | null // Q1
  seedHtml?: string | null // R2
  seedFromPluginName?: string | null
  // M3:多 AI 编排 — 各角色贡献的素材(content/visual/data brief),由 compose 阶段消化
  contributions?: Array<{ role: string; assistantName: string; content: string }> | null
}

// composeDeckSystemPrompt:visual 角色 / 单 AI 直出 HTML 用的完整分层栈
export function composeDeckSystemPrompt(opts: DeckPromptOpts): string {
  const direction = deckTheme(opts.themeId)
  const visualSpec = `# VISUAL_DIRECTION_SPEC — ${direction.name}

- 调色板:${direction.palette}
- 字体栈:${direction.fontStack}
- 视觉气质:${direction.vibe}
- 这是**已选定方向**,语气/节奏要匹配它(例:Scatterbrain → 别用太严肃的 KPI 罗列)`

  const context = `# 任务上下文

- 主题:${opts.topic}
- 受众:${opts.audience}
- 类型:${opts.deckType}
- 篇幅:${opts.pageCount} 页(±1 可接受)
- 演示者:${opts.presenter}
- 你的身份:${opts.assistantName}(由 ${opts.presenter} 指派来执行此任务)`

  const persona = opts.assistantPersona
    ? `# 助理人格(你的 charter,但 Deck Architect 硬规则优先级更高)

${opts.assistantPersona}`
    : ''

  const memory = opts.assistantMemory
    ? `# 长期记忆(过去你和 ${opts.presenter} 的协作要点)

${opts.assistantMemory.slice(0, 800)}`
    : ''

  const attachBlock =
    opts.attachments && opts.attachments.length > 0
      ? `# 可用附件(老板上传的图片,可作 slide 配图)

总共 ${opts.attachments.length} 张:
${opts.attachments.map((a, i) => `- IMG${i + 1}: ${a.url}(${a.name})`).join('\n')}

用法:把 url 真嵌进合适 slide 的 \`<img src="...">\`(用 object-fit: cover),封面优先用最具代表性的那张;没合适就不放,不要硬塞。`
      : ''

  const pluginBlock =
    opts.pluginPrompts && opts.pluginPrompts.length > 0
      ? opts.pluginPrompts
          .map((p) => `# Active Plugin: ${p.zhName}(id: ${p.id})\n\n${p.prompt}`)
          .join('\n\n---\n\n')
      : ''

  // M3:多角色贡献素材(content AI 的大纲文案 / data AI 的数字图表 / ...)
  // 作为 visual AI 直出 HTML 的"素材建议",不是必须照抄;HTML 仍以 seed 为骨架
  const contribBlock =
    opts.contributions && opts.contributions.length > 0
      ? `# CREW_CONTRIBUTIONS — 你的队友已经备好的素材(把它们消化进 HTML,但视觉与结构仍由你拍板)

${opts.contributions
          .map((c) => `## 来自 ${c.assistantName}(${c.role} 角色)\n\n${c.content}`)
          .join('\n\n---\n\n')}

注意:这些是**素材与建议**,不是要你逐字照抄。你是 visual 主笔,负责把它们编织成一份连贯、克制、有节奏的 HTML deck。`
      : ''

  const seedBlock = opts.seedHtml
    ? `# SEED_TEMPLATE — 来自 plugin: ${opts.seedFromPluginName ?? 'main style'}

下面是这套视觉风格的完整 seed HTML(可独立打开、有翻页、有多种 .slide variant)。
**完整复制 \`<style>\` 段 + \`<script>\` 翻页 JS + \`.deck/.hud\` 结构,然后只改 \`<section class="slide ...">\` 内容**。

可以新增 \`<section>\`(沿用已有 variant class)以满足目标页数 ${opts.pageCount}。

\`\`\`html
${opts.seedHtml}
\`\`\`

(seed 结束 — 你的任务是基于它出一份 *${opts.topic}* 主题的新 deck)`
    : ''

  // 顺序即优先级 — 借鉴 OD composeSystemPrompt 设计
  return [
    DECK_ARCHITECT_DIRECTIVES,
    context,
    persona,
    memory,
    pluginBlock,
    visualSpec,
    attachBlock,
    contribBlock, // M3:队友素材(在 seed 之前,让 visual 先吃素材再看骨架)
    seedBlock,
    DECK_ANTI_SLOP,
    DECK_CRITIQUE_5D,
    DECK_OUTPUT_SCHEMA,
  ]
    .filter((x) => x && x.trim())
    .join('\n\n---\n\n')
}

// ============================================================
// M3:编排式多 AI — orchestrator 与各角色的 prompt
// ============================================================

// PLAN 阶段:orchestrator 把任务拆成专精角色(确定性固定角色集,非自由发挥)
export function composeDeckPlanPrompt(opts: {
  topic: string
  audience: string
  deckType: string
  pageCount: number
  channelAssistants: Array<{ handle: string; name: string; role: string }>
  isRevision: boolean
}): string {
  return `# Deck Crew Orchestrator — 拆角色规划

你是一份演示 deck 的 orchestrator(导演)。把任务拆成专精角色,各司其职,最后由 visual 角色合成。

## 固定角色集(从中选,不要发明新角色)
- content:写大纲、文案、叙事节奏(每个 deck 必出)
- visual:拿 content + 视觉 seed 直出完整 HTML(每个 deck 必出,是主笔)
- data:整理关键数字、图表建议(仅当主题含数据/指标/对比时才出)
- critic:按 5 维自评挑刺(可选,质量要求高时出)

## 任务
- 主题:${opts.topic}
- 受众:${opts.audience}
- 类型:${opts.deckType}
- 篇幅:${opts.pageCount} 页
${opts.isRevision ? '- 这是【修订】:只选真正需要重做的角色(纯视觉改→只 visual;内容改→content+visual;数据改→data+visual)' : ''}

## 频道里可用的 AI 助理(可把角色指派给他们,用其专长 + 自带模型)
${opts.channelAssistants.length ? opts.channelAssistants.map((a) => `- @${a.handle}(${a.name} · ${a.role})`).join('\n') : '(无其他助理,所有角色由你自己兼任)'}

## 输出(严格 JSON,无围栏无前后文字)
{
  "roles": [
    { "role": "content", "focus": "这个角色具体要产出什么(一句话)", "assigneeHandle": "可选,指派给某个助理的 handle" },
    { "role": "visual", "focus": "...", "assigneeHandle": "..." }
  ],
  "reasoning": "一句话:为什么这样拆(给老板看的)"
}
content 和 visual 必须有;data/critic 按需。直接给 JSON。`
}

// 角色 brief prompt:content / data 角色产出"素材文本"(不是 HTML)
export function composeRolePrompt(opts: {
  role: 'content' | 'data'
  topic: string
  audience: string
  deckType: string
  pageCount: number
  focus: string
  assistantName: string
  prevHtml?: string | null
  revisionInstruction?: string | null
}): string {
  const roleSpec =
    opts.role === 'content'
      ? `你是 content 角色(内容/文案)。产出这份 deck 的**内容骨架**:
- 每页一个标题 + 2-4 个要点(具体数字/品牌/动词,禁空话)
- 标注叙事节奏(开场钩子 → 问题 → 价值 → 证据 → 行动)
- 不要写 HTML、不要写 CSS,只产出结构化的中文文本大纲`
      : `你是 data 角色(数据/图表)。产出这份 deck 的**关键数字与图表建议**:
- 列出该主题值得放大的 3-6 个关键数字(有就用真值,没有写 TBD 不编造)
- 每个数字建议怎么呈现(big-stat / 对比 / 趋势)
- 不要写 HTML,只产出结构化文本`

  return `${roleSpec}

# 任务
- 主题:${opts.topic}
- 受众:${opts.audience}
- 类型:${opts.deckType}
- 篇幅:${opts.pageCount} 页
- 你的聚焦:${opts.focus}
- 你的身份:${opts.assistantName}
${opts.revisionInstruction ? `\n# 这是修订\n用户要求:${opts.revisionInstruction}\n${opts.prevHtml ? '上版 deck(HTML)见下,只针对修订点调整你的素材:\n\n' + opts.prevHtml.slice(0, 6000) : ''}` : ''}

直接给文本素材,简洁、可执行,供 visual 角色编织进 HTML。`
}

// CRITIC 阶段:评审角色对产出的 HTML 挑刺
export function composeCriticPrompt(opts: {
  topic: string
  audience: string
  deckType: string
  assistantName: string
}): string {
  return `${DECK_ANTI_SLOP}

${DECK_CRITIQUE_5D}

# 你的任务
你是 critic 角色(评审)。下面会给你一份 HTML deck。针对主题「${opts.topic}」(受众 ${opts.audience},类型 ${opts.deckType})挑刺。

输出严格 JSON(无围栏):
{
  "scores": { "philosophy": 1-5, "hierarchy": 1-5, "execution": 1-5, "specificity": 1-5, "restraint": 1-5 },
  "mustFix": ["必修问题1", "必修问题2"],
  "verdict": "pass" | "needs_revision"
}
任一维度 <3 或有 ai-slop 命中 → verdict=needs_revision。直接给 JSON。`
}
