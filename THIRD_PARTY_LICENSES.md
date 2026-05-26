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
