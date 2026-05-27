# V4 Phase L — PPT 模板真闭环(零 LLM 直生成)

## 上下文

用户报告:Phase J 把 12 模板做成"点 → ChannelPicker → @AI 派工"路径,**但没有 LLM key 时点 PPT 模板根本不生成 .pptx**。

调研 Open Design(`nexu-io/open-design`)做同款 PPT 模板的方式:
- OD 也强依赖 LLM(`/api/chat` → agent),示例提示词卡只是把预设 prompt 灌进 textarea
- OD 的 BYOK proxy 路径:粘 Anthropic/OpenAI/Azure/Google/Ollama 的 baseUrl+apiKey+model → daemon 帮转发
- 没 key 一样跑不通

**Heliox 比 OD 更激进的路径(Phase L)**:
- 不要 LLM 也能跑通 PPT
- 用户填表 → 后端**直接调** Phase J/N2 已经做好的 `generate_pptx` skill
- 出真 .pptx + HTML 预览 + Delivery 卡 + audit + postDeliveryCard

将来 LLM key 上 → 同一接口可以"用 LLM 出 outline 后再调 generate_pptx"渐进升级。

---

## L1. 调研 OD PPT 跑通方式 ✅

通过 general-purpose agent 拉 `nexu-io/open-design` 仓库(Apache 2.0),验证 OD:
- 产物 = **HTML 网页(`example.html`)**,`.pptx` 是衍生导出(agent 调 pptx-generator skill 出)
- 强依赖 LLM:`/api/chat` → daemon → agent CLI 或 BYOK proxy
- 4 张示例卡片本质 = 预生成的 `example.html` + 关联 prompt;点 → 灌 textarea → 走完整 chat 流程
- 关键文件:`apps/daemon/src/chat-routes.ts` / `skills/<name>/example.html` / `templates/deck-framework.html`

结论:**OD 也没有"零 key 跑通"**。Heliox Phase L 比 OD 更激进。

---

## L2. 后端 `POST /api/templates/generate-pptx` ✅

**做了**:
- `server/src/index.ts` 新增路由 + helper:
  - `renderPptDeckHtml(opts)` 把 `slides[]` 渲一份单页 HTML(多 section,每页一个 card,带主题色)
  - `PPT_THEMES`:auto / creative / cobalt / scatterbrain 4 个预设(对应 OD 4 张示例卡)
  - 路由流程:
    1. 校验 title + slides[]+ themeId + 可选 channelId(必须是 member)
    2. 调 `runTool('generate_pptx', { title, subtitle, slides }, ctx)` 出真 .pptx → 落 `server/uploads/deck-<uuid>.pptx`
    3. 渲 HTML preview 写 `.helio/sandboxes/ppt-studio-<n>/workspace/index.html`
    4. 建 `SandboxRun(ready_for_review)` + `SandboxArtifact(web_preview, metadata 带 pptxUrl)`
    5. 建 `Delivery(status: pending, artifactJson 含 previewUrl + pptxUrl)`
    6. 若传 channelId → `postDeliveryCard` 发到该频道
    7. `writeAudit { type: 'template.ppt_generated' }`
    8. `broadcastWorkspace()`
  - 返回 `{ ok, deliveryId, sandboxRunId, previewUrl, pptxUrl, slideCount, themeId }`

**curl 验收**:
```
POST /api/templates/generate-pptx
  -d {title, subtitle, themeId:'cobalt', channelId:<pixel-2>,
      slides:[{title, bullets[], notes?}, ...]}
→ {ok:true, deliveryId, sandboxRunId, previewUrl, pptxUrl:/uploads/deck-<uuid>.pptx, slideCount:3, themeId:'cobalt'}

ls server/uploads/deck-*.pptx → 65027 bytes Zip archive ✅
curl /api/sandbox-runs/<id>/preview → HTML 真渲染 + 顺带 K2 eruda bridge ✅
curl /api/deliveries → "PPT:Aurora 2026 Q3 战略评审" pending ✅
curl /api/audit-events → "template.ppt_generated · Kyle 生成 3 页 PPT" ✅
```

---

## L3. 前端 `PptStudioModal`(OD 截图风格) ✅

**做了**:
- 新建 `web/src/components/PptStudioModal.tsx`(550+ 行)
- 视觉对齐 OD 截图:
  - Header:"你想做什么演示?" + "Heliox PPT Studio · 零 LLM 直生成"标签
  - 示例提示词 chip(可关闭)
  - PPT 标题 input
  - outline textarea(每页占一行,以 `-`/`•` 开头是 bullet,实时显示"N 页 / M 条 bullet")
  - 工具栏:📎附件(disabled v4.2)/ 🖥幻灯片 / 主题 select(auto/creative/cobalt/scatterbrain)/ 5-8|10-15 pages select / 落地频道 select / 备注 toggle / ⬆️生成按钮
  - 4 张示例卡(EXAMPLE.HTML 风格 mini preview + 标题 + label + 描述)
- `parseOutline(text)` 解析器:非缩进行 = 页 title,`-`/`*`/`•`/`·`/缩进 = bullet
- `EXAMPLES` 4 条:Html Ppt Zhangzara Creative Mode / Guizang Ppt(一人公司)/ Html Ppt Zhangzara Cobalt Grid / Html Ppt Zhangzara Scatterbrain — 每条带 themeId + title + outline + preview 描述
- 提交 → `fetch('/api/templates/generate-pptx', POST)` → `onDone({ deliveryId, channelId, previewUrl, pptxUrl })`

**视觉**(浏览器实测截图):
- 4 张示例卡布局正确(2 列网格)
- mini preview 用 3 根色柱模拟 PPT 视觉,主题色随 themeId 切换
- 工具栏一行 9 个 chip 全显示

---

## L4. 主页 PPT 卡接入 Studio + 跳 Delivery ✅

**做了**:
- `web/src/App.tsx`:
  - import `PptStudioModal`
  - state `showPptStudio` boolean
  - `onUseTemplate(t)`:if `t.id === 'ppt'` → `setShowPptStudio(true)`;else 走原 `ChannelPicker` → @AI 派工
  - 挂载 `<PptStudioModal />`,`onDone` 回调:
    - 若选了 channelId → `setView('channel') + selectChannel + setChatFocus({tab:'deliveries'})`
    - 若无 channelId → `window.open(pptxUrl, '_blank')` 直接下载

**浏览器实测**(完整闭环):
1. 主页 → 点"制作 PPT / 演示稿"卡
2. Modal 弹出,自带 Aurora 品牌设计评审 example + Zhangzara Creative 主题
3. 点"生成"按钮
4. **服务端**:.pptx 真落地(65KB Zip) + HTML preview 真渲染 + Delivery 真新增
5. **客户端**:toast 提示 + 跳到 #pixel-2 频道 + dock 切到"交付" tab
6. iframe 内打开 preview HTML:奶油纸背景 + 4 张幻灯片(品牌愿景 / 色彩系统 / 字体阶梯 / 下一步)+ 顶部"下载 .pptx ↓"链接

---

## L5. 三构建 + curl 验收 + commit + push ✅

**三构建**(server tsc / web tsc --noEmit / web build):全过 ✅

**curl 验收(连续两次 POST)**:
```
Delivery 总数:3 → 5(两次提交各 +1)
   - PPT:Aurora 品牌设计评审       · pending · 2026-05-27T05:02
   - PPT:Aurora 2026 Q3 战略评审   · pending · 2026-05-27T04:57
   - Q3 对外一句话 · 第二稿          · pending(seed:demo)
   - Button · v2 设计稿                · pending(seed:demo)
   - 本周开票流水报告                  · pending(seed:demo)

audit `template.ppt_generated` × 2:
   - Kyle 通过 PPT Studio 生成 4 页 PPT「Aurora 品牌设计评审」
   - Kyle 通过 PPT Studio 生成 3 页 PPT「Aurora 2026 Q3 战略评审」

server/uploads/*.pptx × 2(各 65KB Zip archive) ✅
```

---

## 总结表

| 项 | 状态 |
|---|---|
| L1 OD 调研(产物 = HTML 网页,强依赖 LLM) | ✅ |
| L2 后端 `POST /api/templates/generate-pptx` | ✅ |
| L3 前端 PptStudioModal(OD 截图风格) | ✅ |
| L4 主页 PPT 卡接入 Studio + 跳 Delivery | ✅ |
| 三构建(server tsc / web tsc / web build) | ✅ |
| 红线 γ(点 PPT 卡 → 真出 PPT,零 LLM) | ✅ |
| 红线 δ(.pptx 真生成 + 可下载) | ✅(65KB Zip × 2) |
| 红线 ε(HTML preview 真渲染 + Delivery + audit) | ✅ |

**FINAL_VERDICT: PASS**

---

## 与 OD 的对比

| 维度 | Open Design | Heliox Phase L |
|---|---|---|
| 主产物 | HTML 网页(`example.html`) | HTML preview + **真 .pptx** 双产物 |
| 是否需 LLM key | 是(CLI 或 BYOK proxy) | **不需要** |
| 模板填充方式 | 示例 prompt → textarea → LLM | 示例 outline → textarea → 直接 parser → skill |
| 渐进升级路径 | 已是终态 | 同接口可加 LLM 路径(LLM 出 outline → 仍调 generate_pptx) |
| 主题切换 | 多 skill / 多 example | 4 个 themeId,server 端渲染时切色 |
| 落地存储 | sqlite projects/conversations | SandboxRun + Delivery + AuditEvent(沿用 Phase H/I/J 闭环) |

Heliox Phase L 的核心价值:**人手填表也能跑通模板真闭环**,LLM key 是可选的"提速器",不是必需的"启动器"。
