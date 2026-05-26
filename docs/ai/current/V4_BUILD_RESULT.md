# V4.1 构建结果

## 三构建

| 构建 | 命令 | 结果 |
|---|---|---|
| Server tsc | `pnpm -C server build` | ✅ 通过(0 错误) |
| Web tsc | `pnpm -C web exec tsc --noEmit` | ✅ 通过(0 错误) |
| Web bundle | `pnpm -C web build` | ✅ 通过 · 1.81s |

## Bundle 体积

- `dist/assets/index-*.css` — 69.02 KB(gzip 13.55 KB)
- `dist/assets/index-*.js`(主)— 1.27 MB(gzip 355 KB)
- `dist/assets/index-*.js`(Monaco 懒加载块)— 15.14 KB(gzip 5.22 KB)

> 主 bundle 超过 500 KB chunkSizeWarningLimit 是因为引入了 framer-motion / xyflow / recharts / tiptap 等重组件。后续优化方向:`build.rollupOptions.output.manualChunks` 把 react / radix / xyflow 拆出去。

## npm 依赖(Phase B 装入)

```
sonner cmdk framer-motion @monaco-editor/react react-arborist
@xyflow/react react-hook-form zod @hookform/resolvers
@radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-tooltip
@radix-ui/react-avatar @radix-ui/react-progress @radix-ui/react-accordion
@radix-ui/react-dropdown-menu @radix-ui/react-slot
clsx tailwind-merge class-variance-authority
@tiptap/react @tiptap/starter-kit @tiptap/extension-mention
recharts @tanstack/react-virtual
```

每个都按 v4 plan 装齐;`THIRD_PARTY_LICENSES.md` 已追加。

## 提交链

| Phase | Commit | 主要文件 |
|---|---|---|
| A | `48a3ca2` | server/src/index.ts(20 处 isDM 清理 + Agent API) |
| B | `16b92a0` | theme.css / index.css / 13 个 ui 组件 / 3 个 v4 组件 |
| C | `be60c38` | SidebarV4 / PluginsView / IntegrationsView |
| D | `2b44010` | HomeViewV4 / CompanyOverview + 后端聚合 2 接口 |
| E | `3f42b38` | ProjectHeaderCardV4 + 8 tab dock + EditorPanel + InspectPanel |
| F | `e434cec` | AgentProfileView + NewProjectModal |

## 已知警告(不阻塞)

1. 主 JS bundle 1.27MB(framer-motion / xyflow / recharts 等占大头),后续 manualChunks 优化
2. v1~v3 老组件文件仍在(InboxView / TasksView / TerminalView / MissionWorkspace 等),App.tsx 不再调用但文件未删,留待下一轮统一清理
3. `_xxx` 前缀变量 4 个(老 callback 弃用),与编译策略冲突已通过删除处理
