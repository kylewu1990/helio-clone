// Phase T / M1:Deck 主题单一真相源(消灭 PPT_THEMES 与 DECK_DIRECTIONS 双份漂移)
//
// 历史问题(6 维审计 + 红队点名):
//   - index.ts 的 PPT_THEMES.creative.accent = '#3a7e3a'(旧 .pptx 模板渲染用)
//   - index.ts 的 DECK_DIRECTIONS.creative palette 含 '#ff6b00'(LLM prompt 用)
//   同一个 creative 主题在两处表达且已不一致。本模块合并为唯一 DECK_THEMES。
//   creative 统一收敛为 #ff6b00(以 plugin example.html + DECK_DIRECTIONS 为准,模板路径将在 M2 删除)。
//
// 字段:
//   - 结构色值(bg/accent/ink/sub):给模板渲染 / 前端预览色块用(兼容旧 PPT_THEMES 形状)
//   - 描述性(palette/fontStack/vibe):给 LLM system prompt 用(兼容旧 DECK_DIRECTIONS 形状)

export type DeckTheme = {
  name: string
  // 结构色值(原 PPT_THEMES)
  bg: string
  accent: string
  ink: string
  sub: string
  // 描述性(原 DECK_DIRECTIONS)
  palette: string
  fontStack: string
  vibe: string
}

export const DECK_THEMES: Record<string, DeckTheme> = {
  auto: {
    name: '自动 / Clean',
    bg: '#fafaf8',
    accent: '#1c1c1c',
    ink: '#18181b',
    sub: '#6b6b6b',
    palette: 'bg #fafaf8 · ink #18181b · sub #6b6b6b · accent oklch(70% 0.17 50)',
    fontStack: 'display = system-ui · body = system-ui',
    vibe: '中性安全选项,适合不确定主题',
  },
  creative: {
    name: 'Zhangzara Creative — 编辑杂志风',
    bg: '#fff8d7',
    accent: '#ff6b00', // 单源收敛:旧 PPT_THEMES 的 #3a7e3a 漂移已废弃
    ink: '#1d1836',
    sub: '#796f91',
    palette: 'bg #fff8d7(奶油纸) · ink #1d1836 · sub #796f91 · accent: 橙 #ff6b00 / 绿 #2e9d57 / 黄 #ffb020 / 红 #e5484d',
    fontStack: 'display = Archivo Black · body = Inter · mono = IBM Plex Mono',
    vibe: '设计为先(design-led),自信、克制、不堆 dribbble。适合 agency pitch / 品牌评审 / 创意作品集',
  },
  cobalt: {
    name: 'Cobalt Grid — Field Report',
    bg: '#f5f5fa',
    accent: '#1f3bd1',
    ink: '#0a1454',
    sub: '#52559d',
    palette: 'bg #f5f5fa · ink oklch(15% 0.12 270) · sub oklch(50% 0.08 270) · accent #1f3bd1 + #d97757',
    fontStack: 'display = italic serif(Source Serif Pro)· body = Inter · mono = IBM Plex Mono',
    vibe: '电报感蓝、刻意的 graph-paper 网格,适合 季度回顾 / index / quarterly report',
  },
  scatterbrain: {
    name: 'Scatterbrain — Post-it / Sticky Notes',
    bg: '#ebe3d2',
    accent: '#d97757',
    ink: '#1c1c1c',
    sub: '#6b5b3e',
    palette: 'bg #ebe3d2 · ink #1c1c1c · sub #6b5b3e · accent: pastel(黄 #fcd34d / 粉 #fda4af / 绿 #86efac)',
    fontStack: 'display = handwritten(Permanent Marker)· body = Inter · mono = monospace',
    vibe: '便利贴风、轻松,适合 头脑风暴 / 周会复盘 / 团队碰撞',
  },
  modern: {
    name: 'Modern Minimal — Linear / Stripe / Vercel',
    bg: '#fafafa',
    accent: '#2d6ae0',
    ink: '#0f1419',
    sub: '#5b6470',
    palette: 'bg #fafafa · ink oklch(15% 0.02 270) · sub oklch(60% 0.02 270) · accent oklch(60% 0.18 250)',
    fontStack: 'display = system-ui(SF Pro Display)· body = Inter · mono = SF Mono',
    vibe: '现代极简,系统字体 + 精准中性底,适合 产品文档 / SaaS pitch / dashboard',
  },
}

export function deckTheme(themeId: string | null | undefined): DeckTheme {
  return DECK_THEMES[themeId ?? ''] ?? DECK_THEMES.auto
}
