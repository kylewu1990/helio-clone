# Anti AI-slop Enhancer(发布前清单 + 5 维自评)

借鉴 nexu-io/open-design 的 `discovery.ts`,任一违反 → 该页重写。

## 发布前禁止清单(P0)

- ❌ 通用 emoji 功能图标(✨ 🚀 🎯 💡)
- ❌ "Feature One / Feature Two" / lorem ipsum 占位
- ❌ **没来源的编造指标**(「快 10 倍」「99.9% 在线」)— 无真值就写 `—` 或 `TBD`
- ❌ Inter/Roboto/Arial 当**展示字体**(正文可用)
- ❌ 每个标题旁都配图标 / 每个背景都加渐变
- ❌ 温暖米色/奶油/桃色背景(除非 Zhangzara Creative 主题明示)
- ❌ 每页都是同样的 3-5 bullet 模板,没节奏
- ❌ 标题用"打造闭环 / 赋能业务 / 全方位优化"这种空话

## 5 维自评(任一 <3/5 → 重写该页)

| 维度 | 自检 |
|---|---|
| Philosophy | 视觉姿态匹配 deckType + audience?还是漂回默认风格? |
| Hierarchy | 每页一个主信息,眼睛知道往哪看? |
| Execution | 节奏(每 3 页一个 hero)真过了? |
| Specificity | 每条 bullet 都到具体数字 / 品牌 / 动词? |
| Restraint | 一个强调色每屏 ≤ 2 次,一个决定性点睛? |

## 用法

把这个 plugin 叠加在任一风格 plugin 上,LLM 会在出 outline 后**在心里**走一遍清单
(不输出自评过程,直接出 outline 时回避问题)。
