# Hero Elements Enhancer

每页**必须有且仅有一个 hero element** — 一个让眼睛立刻落下的视觉点。

## 4 种 hero,用 bullets 第 1 条的特殊前缀表达

服务端会识别这些前缀,把对应 bullet 渲染成专属视觉块(不是普通 li):

| 前缀 | 用途 | 例子 |
|---|---|---|
| `BIG:` | 大数字 | `"BIG: 94%"` `"BIG: ₂.₄M"` `"BIG: 3 ↑"` |
| `QUOTE:` | 一句金句 + 作者 | `"QUOTE: 让团队像一个人一样思考 — Kyle"` |
| `BEFORE:` + `AFTER:` | 对比(2 条) | `"BEFORE: 5 个人 3 周"` + `"AFTER: 1 个人 + AI 2 天"` |
| `![alt](url)` | 图片 | `"![架构图](/uploads/abc.png)"` |

## 节奏要求

- **每 3 页至少 1 个 hero**
- 同一页**只能有 1 个 hero**(big stat + 一段文字 OK,但不要 big + quote 混)
- 封面优先用 quote 或 big stat
- 末页 ask 用 quote(给一句记得住的话)

## 反例

❌ 一页全是 5 个普通 bullet:`["产品 A", "产品 B", "产品 C", "产品 D", "产品 E"]`
✅ 一页给一个 hero + 1-2 个支撑:`["BIG: 5x", "from 8 月开始测试", "已签 2 个 LOI"]`
