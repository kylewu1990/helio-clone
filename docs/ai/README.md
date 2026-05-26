# Heliox AI Docs

项目处于 **v4 起步**:UI 重塑 + 产品形态校准。

## 必读(下一个 Claude 起步顺序)

1. **`CURRENT_GOAL_PROMPT.md`** — 本轮任务单
2. **`HELIOX_V4_DESIGN_DOCTRINE.md`** — v4 唯一设计指导文件
3. **`reference/v4-opendesign-screens/`** — 10 桌面 + 4 移动截图 + 用户直觉 `_notes.md`
4. **`reference/v4-source/index.html`** — 完整 vanilla 实现(3872 行,所有 OKLCH token + 动效 keyframe 在这里,**直接抽进 theme.css / index.css**)

## v4 核心校准(不可商量)

- 频道**只有一种**:项目频道(没有讨论 / DM / 私聊)
- 所有协作在项目频道发生
- AI 助手是**只读资料卡**,不能单独跟它发消息

## v4.1 最高约束(功能 > UI)

**UI 漂亮但功能跑不通 = 直接 NEED_FIX**。本轮核心:**项目频道页面**(composer + preview + 8 tab dock)**必须真能跑闭环**——派工 → 沙盒真写代码 → preview tab iframe 真显示渲染结果 → 接受交付。

**鼓励使用 GitHub 开源依赖**(MIT / Apache 2.0 / BSD):
- 完整对照表在 `CURRENT_GOAL_PROMPT.md` "工程实施推荐"段,**按截图每个功能模块都给了候选**(cmdk / sonner / shadcn-ui / radix / monaco / eruda / xyflow / tiptap / recharts / lobe-chat 参考 …)
- 直接 `npm install`,改 `package.json`,在 `/THIRD_PARTY_LICENSES.md` 追加一行
- 大段 copy-paste 加文件级 `// Inspired by ...` 注释

**核心精神**:**完整复刻截图 + 跑通功能 是本轮使命**。用别人轮子完成 80% 比自己手搓 30% 强。不要为"原创"硬写。

## 硬约束

- 不读 git history 找历史决策,以本目录现有文件为准
- DB 已清空业务数据(Channel / Message / Task / Memory / Edge / Sandbox 等全空),只保留 User + AppSetting
- 12 个 AI 助手 + 5 个真人账户保留,直接复用
- v1~v3 既有代码**不是必须保留**:跟截图 / 新 doctrine 冲突的直接删,有用且不冲突的自然留下。**不要为了保留而保留,过去的代码是工具不是教条**
- 参考截图是 helio-clone v4 的**新标准**,直接对齐视觉(色值 / 字号 / 留白 / 卡片 / 动效 / 图标)
- 唯一禁止:代码里不出现 "Open Design" / "od-" 等生成工具名(避免误以为外部依赖)
