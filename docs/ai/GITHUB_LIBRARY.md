# Heliox 可借鉴 GitHub 项目库

> 这份是**长期参考清单**,跨多个 Phase 用。每加新依赖或抄源码时,**先翻这里**;清单里没合适的再上 GitHub 搜。
> 所有项目都是宽松协议(MIT / Apache 2.0),允许借鉴/抄源/作依赖。**抄入源码必须**:文件顶部加 `// Inspired by <repo> (<license>), see /THIRD_PARTY_LICENSES.md` + 在 `/THIRD_PARTY_LICENSES.md` 追加一行。

---

## 第一梯队(战略级,跟 Heliox 形态最贴)

### 1. nexu-io/open-design ★ 已在用
- **协议**: Apache 2.0
- **GitHub**: https://github.com/nexu-io/open-design
- **本质重合度**: 80%(本地优先 / Skills / 沙盒 preview / 设计系统目录 / artifact 生命周期)
- **可继续借**:
  - Skills protocol(`~/.helio/skills/*/SKILL.md` 加载机制)→ 对应 Phase J N8
  - MCP server 实现 → 对应 Phase J N9
  - artifact / preview 生命周期 → 已基本对齐
  - 设计系统目录 → 已抽 token
  - HTML/PDF/PPTX 导出 → 对应 Phase J N2
- **当前状态**: token + 截图已抽,代码模块借鉴在 Phase J 排期中

### 2. fastclaw-ai/chatclaw
- **协议**: MIT
- **GitHub**: https://github.com/fastclaw-ai/chatclaw
- **本质重合度**: 60%(AI 公司 / 多 Agent 聊天 / team 管理 / 工具调用展示)
- **可借**:
  - Agent 配置 / Team 管理 / 资料页(对应 v4 SidebarV4 私信段重构 + Agent profile)
  - OpenAI-compatible streaming
  - 工具调用展示组件
  - 头像系统
- **注意**: Next.js 栈,不能整仓合并(Heliox 是 Vite),按组件级抄

### 3. outsourc-e/hermes-workspace
- **协议**: MIT
- **GitHub**: https://github.com/outsourc-e/hermes-workspace
- **本质重合度**: 70%(chat / files / memory / skills / terminal / MCP / dashboard / agent view)
- **可借**:
  - 文件树 + 终端组件(对应 v4 dock editor / activity tab)
  - 记忆 / Skills 页面
- **注意**: 不建议整仓合并

### 4. OpenCoworkAI/open-cowork
- **协议**: MIT
- **GitHub**: https://github.com/OpenCoworkAI/open-cowork
- **本质重合度**: 50%(桌面端 + MCP + Skills + 沙盒隔离 + 远程控制)
- **可借**: 产品架构 + 能力组合(代码不一定直接抠,看思路即可)

---

## 第二梯队(基础设施补强)

### 5. agent-infra/sandbox 或 sandbox0-ai/sandbox0
- **协议**: Apache 2.0
- **GitHub**: https://github.com/agent-infra/sandbox / https://github.com/sandbox0-ai/sandbox0
- **用途**: 真隔离沙盒(Heliox 当前只是"本机信任沙盒",非 OS 级隔离)
- **何时用**: 当 Heliox 需要跑陌生代码(用户上传 / 第三方 plugin 触发)时,**必须**接这类
- **注意**: 当前所有 task 都是 helio-clone 自己派的内部 AI 跑,不急

### 6. thesysdev/openui
- **协议**: MIT
- **GitHub**: https://github.com/thesysdev/openui
- **用途**: 让 AI 生成**结构化 UI**(JSON schema → React 组件树),比直接吐 HTML 更可控
- **何时用**: Heliox 的 preview / artifact 生成层升级时(让设计师 AI 出更可靠的 UI 草稿)

### 7. BerriAI/litellm
- **GitHub**: https://github.com/BerriAI/litellm
- **用途**: 替换/增强 provider 层(100+ LLM 统一 OpenAI 格式 + gateway + MCP bridge + 成本/日志)
- **协议**:**需单独确认**,部分模块协议复杂
- **建议**: **直接作为服务接入,不复制代码**(避免协议风险)

---

## 第三梯队(工具组件,Phase H/I 已用)

| 用途 | 项目 | 协议 | 已用 |
|---|---|---|---|
| 富文本 Composer + @/slash | `tiptap` | MIT | ✅ Phase H |
| ⌘K 命令面板 | `cmdk` | MIT | ✅ |
| Toast | `sonner` | MIT | ✅ |
| Monaco 编辑器 | `@monaco-editor/react` | MIT | ✅ |
| 文件树 | `react-arborist` | MIT | ✅ |
| Graph DAG | `@xyflow/react` | MIT | ✅ |
| Charts / Sparkline | `recharts` | MIT | ✅ |
| 动效 | `framer-motion` | MIT | ✅ |
| iframe console proxy | `eruda` 本地 vendor | MIT | ✅ |
| Radix 基础 | `@radix-ui/*` | MIT | ✅ |
| 表单 | `react-hook-form` + `zod` | MIT | ✅ |
| 虚拟滚动 | `@tanstack/react-virtual` | MIT | ✅ |
| PPT 生成 | `pptxgenjs` | MIT | 🔄 Phase J N2 |
| DuckDB | `@duckdb/duckdb-wasm` / `duckdb` | MIT | 🔄 Phase J N2 |
| MCP SDK | `@modelcontextprotocol/sdk` | MIT | 🔄 Phase J N9 |

---

## 实施顺序建议(Phase K 起步参考)

1. **先抄 open-design 的 Skills / Artifact / Preview 闭环**:把 Plugins 页从 mock 变真实扫描(对应 V4_GAP_ANALYSIS.md G1)
2. **再借 hermes-workspace 的文件 / 终端 / Skills 工作区**:补 dock editor 真编辑(对应 G4)
3. **MCP / Connectors 接入**:抄 open-design `mcp-server.ts` 暴露 5374,加 GitHub/Notion/Linear connectors(对应 G2)
4. **强隔离沙盒**(可选,远景):agent-infra/sandbox 或 sandbox0
5. **chatclaw 的多 Agent 组件**(可选):团队 / 资料页升级

不要一次全抄。每 Phase 挑 1-2 个项目源码作为参考,保持架构不被拽散。

---

## 抄入规范(再次强调)

1. **走 npm 装的**:`pnpm add <pkg>`,在 `/THIRD_PARTY_LICENSES.md` 加一行(包名 / 协议 / 用途)。这种**无需文件级注释**(整个包是依赖,不是 copy-paste)
2. **整段抄源码到 helio-clone**:抄入的文件顶部加 `// Inspired by <repo> (<license>), see /THIRD_PARTY_LICENSES.md`,`/THIRD_PARTY_LICENSES.md` 加一节(项目名 / 协议 / URL / 借鉴文件清单)
3. **只读 README 学思路自己重写**:无需任何归属

GPL / AGPL 项目**不要直接抄**(传染条款会让 Heliox 必须开源)。如果实在要用,作为外部服务接入(不进 Heliox 进程)。
