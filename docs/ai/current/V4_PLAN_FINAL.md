# V4.1 一口气跑完计划(夜间自动执行版)

> 本计划是 Claude Code 本地执行入口。**主干用 V4_PLAN_B_.md(7 phase A→G),现状摸底借 V4_PLAN.md 第 9-17 行**。本文件只补"夜间自动模式约定"和睡前用户能看到什么。

---

## 0. 夜间自动模式约定(本轮专属)

**用户睡了,你独自跑完整套**。以下规则**硬约束**:

1. **不停顿等审批**:从 Phase A 顺序跑到 G,**不要等"OK 进下一段"** —— 一段做完立即下一段
2. **每个 phase 完成立即 git 留痕**:
   ```bash
   git add -A
   git commit -m "Phase <X>: <一句话总结>"
   git push origin main
   ```
   push 失败重试 3 次(网络抖动);3 次都失败就只 commit 不 push,继续下一 phase
3. **遇到失败按 V4_PLAN_B_.md "风险/已知妥协"段降级,不卡住**:
   - eruda postMessage 跨域读不到 → inspect tab 退化"打开原生 devtools"按钮
   - editor monaco 集成失败 → 退化为只读 codemirror 或纯 textarea
   - graph @xyflow/react 与现有 dagre 冲突 → graph tab 暂留 v2 AlgorithmGraph
   - 沙盒 preview 失败(场景 α 红线) → **必须**先修通,不允许降级跳过
   - 任何 npm install 失败 → 换备选包,**不要回头删功能**
4. **3 构建必须过**:每个 phase 结束前跑 `pnpm -C server build && pnpm -C web build && pnpm -C web exec tsc --noEmit`,失败立即修;修不好降级该 phase 的最新改动,**不允许带破坏的状态进下一段**
5. **场景 α 跑不通就停下**:Phase E 结束后必须跑一次 smoke(在项目频道派工 → preview iframe 真渲染),不通就**反复修到通**,这是唯一允许卡住的地方
6. **场景 β 跑不通可以降级**:点 AI 名字若仍创建 DM,在 V4_REVIEW.md 标 NEED_FIX,继续下一段
7. **token 节省**:执行阶段用 Sonnet,不切 Opus

---

## 1. 终态报告(用户睡醒会看的东西)

跑完所有 phase 后,在 `docs/ai/current/` 写:

- **V4_BUILD_RESULT.md**:每个 phase 的 git commit hash + 3 构建结果 + 装了哪些 npm
- **V4_LOGIC_VALIDATION.md**:5 场景(α/β/γ/δ/ε)实测结果,**每个场景要带 curl/sqlite 命令输出或截图证据**,不允许只写"通过"
- **V4_REVIEW.md**:自评分(UI/可用/技术/原创),诚实标 PASS 或 NEED_FIX。**自评 PASS 但场景 α 没真跑过 = 自动判 NEED_FIX**
- **V4_DELIVERY.md**:人工验收路径(必含两条:点 AI 名字不创建 DM、项目频道发"构建 X" 真开工)

最后 git commit + push 这四份报告,然后终端打印一行:

```
=== DONE ===  α=PASS|FAIL  β=PASS|FAIL  builds=3/3
等用户睡醒看 docs/ai/current/V4_DELIVERY.md
```

---

## 2. 执行入口

**Phase A 开工前先做现状摸底(借 V4_PLAN.md 第 9-17 行)**:
- 扫 `server/src/index.ts` 里 `isDM` 出现位置(预期 ~20 处)
- 确认 `/api/sandbox-runs/:id/preview/*` 路由在 `index.ts:4942` 附近
- 跑 `git status`(应该是干净的,baseline = `6c3e834e`)

**Phase A 第一步(借 V4_PLAN.md 第 341-358 行 bash)**:
```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone/web
pnpm add @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip \
  @radix-ui/react-accordion @radix-ui/react-avatar @radix-ui/react-dropdown-menu \
  @radix-ui/react-progress \
  cmdk sonner framer-motion \
  class-variance-authority clsx tailwind-merge \
  @monaco-editor/react react-arborist \
  @xyflow/react recharts \
  react-hook-form zod @hookform/resolvers \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-mention \
  react-dropzone @tanstack/react-virtual
```

每装一组在 `/THIRD_PARTY_LICENSES.md` 追加一行(包名 / 协议 / 用途)。

**之后**:按 V4_PLAN_B_.md 的 Phase A → B → C → D → E → F → G 顺序跑,每段完成 commit + push。

---

## 3. 主干 plan(详细内容)

**详见 `docs/ai/current/V4_PLAN_B_.md`**,7 个 phase 全部细节都在那。本文件不重复。

关键 phase 时长(来自 PLAN_B,**乐观估计**;实际可能 ×1.5):
- A 后端校准 1.5h
- B token + npm + 三组件 + shadcn 基底 2h
- C Sidebar + Plugins + Integrations 1.5h
- D HomeView + CompanyOverview 2h
- E ChannelView + 8 tab dock + 闭环 **3.5h ★**(场景 α 红线)
- F Agent profile + NewProject modal + 清理 1.5h
- G 三构建 + 5 场景验证 + 文档 1h
- **合计 13h(乐观) / 20h(现实)**

---

## 4. 红线再次重申

- **场景 α**(Phase E 闭环):项目频道派工 → sandbox 真写 → **preview iframe 真渲染** → Delivery Card 出现。**这是 PASS 的唯一必要条件**
- **场景 β**(Phase F):点 AI 名字不创建 DM。**允许降级但要诚实标**
- 不允许:UI 漂亮但 preview 是空白 / 闭环走 mock / 假 PASS

---

## 5. 跑完前最后做的事

```bash
# 1. 最终 git push 所有改动
git add -A
git commit -m "v4.1 complete (or NEED_FIX with details)"
git push origin main

# 2. 终端打印 DONE 标记(让用户一眼看到状态)
echo "=== DONE ==="
echo "α=PASS  β=PASS  builds=3/3"
echo "→ 看 docs/ai/current/V4_DELIVERY.md"
```

如果跑到一半失败且无法降级:
- 把当前进度 commit + push(留痕)
- 在 `V4_BUILD_RESULT.md` 标"卡在 Phase X,原因:Y"
- 终端打印 `=== STUCK ===  Phase X / 原因 / 看 V4_BUILD_RESULT.md`

---

## 6. 不允许的偷懒

- ❌ 跑到 Phase B 就开始写 "其他 phase 后续 TODO" — **必须跑完 G**
- ❌ 场景 α 没真跑过就写 PASS — **必须有 curl/screenshot 证据**
- ❌ 用 mock 数据糊 preview tab — **必须接 `/api/sandbox-runs/:id/preview/*`**
- ❌ 因 "时间不够" 跳过 Phase F 清理 — **该删的 v1~v3 残留必须删**
- ❌ 自评分都 90+ 但实际场景失败 — **诚实就行,NEED_FIX 不丢人,假 PASS 才丢人**

---

去跑。
