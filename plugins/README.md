# Heliox Plugins(skill 文件夹)

灵感来自 nexu-io/open-design 的"Skills are files, not plugins"设计:
每个 plugin = 一个文件夹,包含 SKILL.md(YAML frontmatter + 工作流)+ prompt.md(注入 system prompt 的段)+ 可选 example.html 缩略图。

后端 `scanPlugins()` 启动时扫描这个目录,前端在 PPT Studio / Plugins 页能看到并选择启用。

## 当前分类

### `deck-*` — PPT 风格家族
派工时勾选一个或多个,prompt 会按目录里的 prompt.md 拼到 system prompt 栈(优先级低于 Deck Architect 硬规则,高于默认)。可同时叠加(主风格 + visual 强化 + 反 AI-slop)。

- `deck-zhangzara-creative` — 编辑杂志风,奶油纸 + 多色重音
- `deck-cobalt-grid` — Field report,electric cobalt + 网格底
- `deck-scatterbrain` — Post-it/便利贴风,适合头脑风暴
- `deck-modern-minimal` — Linear/Stripe/Vercel 极简
- `deck-anti-slop` — 反 AI-slop 强化(可与任一风格叠加)
- `deck-hero-elements` — Big stat / quote / before-after 表达 hooks

### `image-*`(占位,Phase R 真接)
- `image-fal-flux` — fal.ai Flux
- `image-gemini` — Google Gemini image

## 添加新 plugin

创建文件夹,加 SKILL.md(YAML frontmatter):

```markdown
---
name: deck-my-style
zh_name: 我的风格
description: 一句话描述,会显示在 PPT Studio 卡片
od:
  mode: deck
  scenario: design
  category: design-led
  preview: example.html
tags: [deck, design]
---

# 详细工作流

可选,这里写给 LLM 的工作流引导。
```

加 `prompt.md`(必需,内容会直接拼到 system prompt 栈):

```markdown
# Style: My Style

调色板:OKLch ...
字体栈:...
节奏建议:...
```

可选 `example.html`(给 modal 卡片做缩略图,后续 Phase R 接)。

重启 daemon → 自动出现在 `/api/plugins/all`。
