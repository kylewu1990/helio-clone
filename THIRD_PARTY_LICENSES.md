# Third-Party Licenses & Attributions

本文件记录 helio-clone 借鉴或包含的第三方开源项目及其许可证。

---

## Open Design

- **项目**: https://github.com/nexu-io/open-design
- **License**: Apache License 2.0
- **借鉴范围**:

  | 借鉴内容 | 位置 | 借鉴深度 |
  |---|---|---|
  | v4.1 UI 设计草稿 + 完整 implementation handoff(用 Open Design 应用生成,产物归本项目所有) | `docs/ai/reference/v4-opendesign-screens/` `docs/ai/reference/v4-source/{index.html, DESIGN-HANDOFF.md, DESIGN-MANIFEST.json, tools/}` | 用户产物(不计入仓库代码借鉴) |
  | OKLCH 设计 token 表(light + dark) | `web/src/theme.css` | 整段抽取 + 改 token 命名 |
  | CSS 动效 keyframe(aurora / pulse / glow / shimmer) | `web/src/index.css` | 整段抽取 |
  | 卡片样式 / 玻璃层 / 圆角阶梯 / 字号阶梯 | `web/src/components/**` | 视觉对齐,实现自写(React) |

- **修改说明**:
  - 视觉 token、命名、信息架构**以截图与源 HTML 为准**;现有命名不冲突时可继续用,冲突时按截图改
  - 实现从 vanilla HTML+CSS+JS 转写为 React + Tailwind 4

- **Apache 2.0 协议副本**: https://www.apache.org/licenses/LICENSE-2.0

---

## v4.1 npm 依赖(Phase B 装入)

下列依赖通过 `pnpm add` 装到 `web/`,不复制源码,仅按各自 License 使用。

| 包 | License | 用途 |
|---|---|---|
| `sonner` | MIT | Toast 通知(全局挂在 main.tsx) |
| `cmdk` | MIT | ⌘K 命令面板(`components/ui/command-palette.tsx`) |
| `framer-motion` | MIT | 列表 / 时间线入场动效 |
| `@monaco-editor/react` | MIT | dock editor tab 的 Monaco 编辑器 |
| `react-arborist` | MIT | dock editor tab 的文件树 |
| `@xyflow/react` | MIT | dock graph tab 的 DAG 节点编辑器 |
| `react-hook-form` + `zod` + `@hookform/resolvers` | MIT | NewProject modal 表单 |
| `@radix-ui/react-{tabs,dialog,tooltip,avatar,progress,accordion,dropdown-menu,slot}` | MIT | shadcn 风格基础组件底层(`components/ui/*`) |
| `clsx` + `tailwind-merge` + `class-variance-authority` | MIT | cn 工具与 variant 组件 |
| `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-mention` | MIT | Composer 富文本 + @ 补全 |
| `recharts` | MIT | 公司全景 / 项目头部 Sparkline 与 KPI 图表 |
| `@tanstack/react-virtual` | MIT | activity tab 长列表虚拟滚动 |
| `eruda` (vendor 化到 `web/public/eruda.min.js`) | MIT | dock inspect tab 真注入 devtools(console / network / DOM) |
| `@dagrejs/dagre` | MIT | GraphXY tab DAG 布局算法 |

### shadcn/ui 风格 copy-paste 组件

`web/src/components/ui/*.tsx` 大部分组件 API 风格借鉴 [shadcn/ui](https://github.com/shadcn-ui/ui)(MIT)。文件顶部已加 `// Inspired by shadcn/ui (MIT), see /THIRD_PARTY_LICENSES.md` 注释。

- **项目**: https://github.com/shadcn-ui/ui
- **License**: MIT
- **借鉴范围**: Button / Card / Input / Dialog / Tabs / Tooltip / Avatar / Progress / Accordion / DropdownMenu / Switch / Sheet / Badge 的 API + 类名结构(底层封 Radix Primitive)
- **修改说明**:不依赖 shadcn CLI(项目无 next.config),所有组件手工 copy-paste 后改 className 用 v4 OKLCH token

---

## 添加新条目时的规范

借鉴新的第三方项目时,在本文件追加一节,包含:
- 项目名 / 仓库 URL
- License 类型 + 版本
- 借鉴内容清单(文件位置 + 借鉴深度:整段抽 / 实现自写但思路一致 / 单点借鉴)
- 修改说明
- 协议副本 URL

文件级借鉴(单个组件 / 大段代码从某仓库抄过来):需要在文件顶部加注释:

```
// Inspired by <project-name> (<License>), see THIRD_PARTY_LICENSES.md
// Original: <source-url-if-known>
```
