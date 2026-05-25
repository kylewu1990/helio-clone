/goal

你现在接手的是已有项目 `/Users/kaiwu/Documents/kyle-agent/helio-clone`。这次目标不是保守修补,而是把它大改成一个真正好用、好看、可交付的 AI Workforce / AI Team Command Center。当前用户对产品不满意,你可以更自由地重构前端、后端、数据模型、组件结构、交互流程和样式;可以删除明显无效/鸡肋/假象式代码,也可以新增依赖和模块。不要为了“保留旧壳”牺牲体验。唯一底线:不要造假执行、不要造假测试结果、不要复制 Genspark/Markus 的 UI/文案/源码/品牌。

参考方向:
- Genspark: all-in-one AI workspace、prompt -> real files -> live preview、chat/files/preview 三栏协同、Workflow 的 trigger/action/test run/run history/pending confirmation、Hub 的 shared context/files/memory。
- Markus: AI team runtime、Secretary/manager 拆解目标、按角色委派、parallel execution、skills/tools、heartbeat、persistent memory、review/delivery/audit/governance。
- 只借鉴产品逻辑和运行体验,不要做成 Markus clone 或 Genspark clone。

本地测试可用 OpenAI-compatible:
Base URL `http://127.0.0.1:8317/v1`, model `gemini-2.5-flash`, key `sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd`。内部测试阶段可写进 docs/测试脚本/本地助手配置,不要进最终分发配置。

评分标准,请反复自评并迭代到可交付:
- 设计品质 30%: Apple/Linear/Notion/Genspark 气质,深色优先,高级克制,信息清晰,不能像普通后台模板。
- 原创性 30%: 形成 Heliox 自己的产品语言,有 AI constellation / mission control / workflow cockpit 的独立表达。
- 技术执行 20%: 真实任务、真实工具调用、真实报告、真实 build/smoke/browser 验证。
- 可用性 20%: 用户发布任务后知道谁在做、做到哪、用了什么工具、卡在哪里、需要用户点什么、交付在哪里。

必须解决的核心体验:
1. 主界面大改。第一屏必须像真正的 AI Team Workspace,不是聊天应用拼一个任务看板。要有 Mission Composer、AI Team、Mission Board、Execution Cockpit、Context Vault、Activity/Audit、Delivery/Review。
2. 发布任务必须形成清晰流程:创建目标 -> AI 拆解 -> 推荐/选择执行人 -> 并行执行 -> 工具调用可视化 -> 中途需要用户时弹出交互窗口/抽屉 -> 完成后生成报告和交付物 -> 用户审批/继续/打回。
3. 像截图里那种“AI 只在聊天里说我定位了”不够。必须做可视化执行窗口:显示 TaskRun、SandboxRun、当前执行人、状态、工具调用列表、命令输出、文件变更、浏览器截图、console、diff、build/test、下一步建议。
4. 用户需要参与时,不能只发一段聊天文本。要有明确的 Pending User Action UI:输入城市/补充需求/批准命令/选择执行人/继续执行/应用交付/打回重跑。
5. 沙盒先不追求强安全,优先跑通流程。允许在本机信任沙盒里更开放地执行 node/pnpm/python/git/build/test/browser。UI 要诚实标注“本机信任沙盒”,但不要让安全限制妨碍内部测试。
6. 做一个真实触发入口:任务卡、Mission 详情、Execution Cockpit 都能开始/暂停/继续/取消/查看报告/应用交付。
7. Activity Feed 必须不是装饰,要显示真实执行轨迹:谁创建任务、谁接单、调用了什么工具、等待什么审批、生成了什么 artifact、build 是否通过。
8. Delivery Panel 必须回答“执行完的报告在哪”:最终报告、交付摘要、文件变更、测试结果、截图、风险、人工验收步骤都要可见。
9. Context Vault 要像项目记忆:可搜索 docs/ai、README、任务记录、交付报告,并能把选中的 context 绑定到 mission/task。
10. 允许做 Stage 1 可交付大版本,但不要停在文档或 mock。至少一个真实任务从发布到执行报告必须跑通。

执行顺序:
1. 快速阅读当前架构、docs/ai、关键代码和最新 smoke 报告,判断哪些可复用,哪些该推翻。
2. 写 `docs/ai/OPEN_REDESIGN_PLAN.md`:包括信息架构、关键交互、数据流、风险、验收路径。
3. 实施产品级改造。前端优先,但后端/API/数据模型可同步调整。不要害怕改大文件,但每次保证能跑。
4. 用真实本地 LLM、真实 API、真实浏览器验证。需要时创建临时测试任务/助手/文件,跑完清理。
5. build/typecheck/smoke 失败就继续修,不要编造结果。最多不设 3 轮限制,尽量修到通过;若环境阻塞,写清楚证据。

完成条件:
- 首页/工作台肉眼可见升级为 AI Team Command Center。
- 任务发布后,用户能在 UI 里完成指派/自动推荐/开始执行/查看执行窗口/处理待确认/查看交付。
- 至少一个真实任务跑通:创建 -> 指派 -> 执行 -> 工具调用记录 -> 报告 -> 交付或待审批。
- 有真实 Execution Cockpit 或等价界面,不是只靠聊天消息。
- Activity/Audit/Delivery/Context 四块都接真实数据或真实文件,无假数据。
- `pnpm -C server build`, `pnpm -C web exec tsc --noEmit`, `pnpm -C web build` 已运行并记录。
- 用 browser/headless 或人工可复现步骤验证主界面关键流程。
- 生成/更新 `docs/ai/OPEN_REDESIGN_DELIVERY.md`, `docs/ai/OPEN_REDESIGN_REVIEW.md`, `docs/ai/OPEN_REDESIGN_BUILD_RESULT.md`, `docs/ai/OPEN_REDESIGN_FINAL_REPORT.md`。
- `OPEN_REDESIGN_REVIEW.md` 最后一行必须是 `FINAL_VERDICT: PASS` 或 `FINAL_VERDICT: NEED_FIX`。

最终回复格式:
1. 一句话结论。
2. 主要改动。
3. 真实验证结果。
4. 仍需改进的问题。
5. 人工验收步骤。
