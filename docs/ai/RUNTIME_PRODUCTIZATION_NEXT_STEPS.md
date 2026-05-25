# Runtime Productization Next Steps

> 日期: 2026-05-25  
> 目标: 把当前“能跑但不好用”的 Task/Sandbox Runtime,升级成用户能自然发布任务、指派 AI、看见执行、验收交付的产品体验。  
> 原则: 内部测试阶段可以更松,但必须清楚标注执行模式、权限边界、日志证据和人工接管点。

## 1. 当前体验问题

### 1.1 发布任务后不好指派 AI

工作台首页的 MissionBoard 里,未指派任务只显示“未指派”,没有明显的“指派给 AI”入口。完整任务页 `TasksView` 里有 `+ 指派`,但用户在工作台主界面自然看不到,所以会感觉“发布任务后没人接”。

应改为:

- MissionBoard 卡片上直接显示“指派 AI”按钮/下拉。
- TaskBreakdown 子任务行也能直接指派 AI。
- 新建任务时支持选择执行人,并提供“自动选择合适 AI”。
- 对命令/代码/联网任务,系统应推荐具备对应技能的助手,例如软件工程师、测试工程师、市场研究。

### 1.2 沙盒存在感弱

当前沙盒只藏在“执行报告”里。用户不知道:

- 沙盒是否创建了。
- AI 正在沙盒里做什么。
- 沙盒路径在哪。
- 什么情况下可以 apply/discard。
- 为什么有些任务 build/test skipped。

应改为:

- Task 卡片直接显示沙盒状态:准备中 / 执行中 / 测试中 / 待验收 / 已应用 / 已丢弃。
- 工作台右侧新增“沙盒运行”小面板,展示最新 TaskRun 的 live log、cwd、diff 摘要、build/test。
- 报告面板里给“打开沙盒路径 / 在终端打开沙盒目录 / 复制路径”。
- 真实用户运行产生的沙盒不要自动清理,直到用户 apply/discard。测试脚本才自动清理。

### 1.3 限制太紧,代码任务不够能干

当前策略把“安全”理解成尽量不让 AI 做事,结果用户让 AI 写代码/跑程序时会觉得鸡肋。更好的方案是分模式:

| 模式 | 用途 | 权限 |
|---|---|---|
| 只读模式 | 查资料、读代码、分析 | read_file/list_dir/fetch_url |
| 代码沙盒模式 | 写代码、跑 build/test | 沙盒内 write_file/run_command/pnpm/node/tsx/python/git diff/status 可用 |
| 本机信任模式 | 内部测试快速推进 | 明确标注“非强隔离”,允许更多命令,但只在沙盒 cwd,apply 仍需人工 |
| 电脑/浏览器实验模式 | UI 验证、打开 localhost、截图、点击 | 可见会话、可审计、一键停止、默认只限本地 app/browser |
| 主项目写入 | 真正改主项目 | 只能人工 apply,拒敏感文件 |

重点:不要把 `node/pnpm/tsx/python` 一刀切封死。代码任务必须能运行这些命令。安全边界应靠 Docker/Colima/macOS sandbox 或“本机信任模式”清晰提示,而不是假装路径守卫是强隔离。

### 1.4 “工具调用过多停止”太早

`server/src/ai.ts` 当前 `MAX_TOOL_ROUNDS = 5`。对聊天够用,但对代码任务太低。读文件、写文件、跑 build、修一次报错很容易超过 5 轮,然后出现“工具调用轮数过多,已停止”。

应改为:

- 聊天默认 5 轮。
- 任务执行默认 20-30 轮。
- 代码沙盒任务默认 40 轮。
- 支持 env 配置: `MAX_TOOL_ROUNDS_CHAT`、`MAX_TOOL_ROUNDS_TASK`、`MAX_TOOL_ROUNDS_CODE`。
- 达到 80% 时给模型注入提醒:总结已完成、减少探索、尽快产出报告。
- 达到上限时不要只返回一句“停止”,而是保存 TaskRun 为 `needs_review` 或 `needs_fix`,报告里写明最后工具、已完成步骤、下一步建议,并提供“继续执行”。

## 2. 电脑控制应该怎么放开

不建议一上来给 AI 完整鼠标键盘控制整台电脑。推荐先做“可见、可撤销、可审计”的局部能力:

### Stage A: Browser Control for Local App

先让 AI 控制浏览器验证本地项目:

- `browser_open(url)` 仅允许 `localhost/127.0.0.1/file://` 或用户批准的域名。
- `browser_screenshot()` 截图并保存 artifact。
- `browser_click(selector/text)`、`browser_type(selector,text)`。
- `browser_console()`、`browser_network()` 读取错误。
- 所有动作写 `SandboxLog`/`AuditEvent`。
- 外站登录、提交表单、上传文件、输入 key 前必须人工批准。

这比 OS 级电脑控制安全,也更符合“写程序交付后验证 UI”的需求。

### Stage B: Terminal Session in Sandbox

AI 可在沙盒里维持一个 shell session:

- `run_command` 支持 sessionId。
- build/dev server 可后台启动,报告里显示 PID/端口。
- 用户可点“停止进程”。
- 只允许在沙盒 cwd。

### Stage C: Visible Desktop Control

作为实验模式:

- 用户手动开启“电脑控制实验模式”。
- 页面明确显示红/黄状态条:AI 正在控制鼠标/键盘。
- 有“一键停止”。
- 默认只允许当前浏览器窗口或 Simulator,不允许系统设置、Keychain、密码输入框、支付、删除文件。
- 每一步截图入 artifact,可回放。

## 3. 下一轮给 Claude 的方向

优先级:

1. **补指派体验**: 工作台卡片/任务拆解直接指派 AI,并支持“自动选择执行人”。
2. **沙盒可见化**: 卡片、右侧面板、报告入口都能看见沙盒状态和路径。
3. **放宽代码沙盒模式**: 允许代码任务在沙盒内使用 node/pnpm/tsx/python/git status/diff/build/test;不要默认卡死。
4. **修工具轮数**: 任务执行和代码执行使用更高 tool round budget,并有“继续执行”。
5. **浏览器控制 MVP**: 先做本地 app/browser 验证工具,支持截图 artifact 和控制日志。
6. **诚实安全文案**: 当前无 Docker 时叫“本机信任沙盒”,不要叫“强沙盒”。有 Docker/Colima 时再显示“强隔离沙盒”。

## 4. 验收标准

- 用户在工作台首页新建任务后,不用跳到完整任务页,即可指派给某个 AI。
- 未指派任务有明显 CTA:指派 AI / 自动指派 / 只保存。
- 指派后可直接开始执行,或开启“指派后自动执行”开关。
- 执行开始后,工作台可见沙盒路径、live logs、命令、diff、build/test。
- 代码任务不会因 5 轮工具调用过早停止。
- 沙盒报告可一键继续执行、apply、discard。
- 浏览器控制能打开 `http://localhost:5173`,截图,读取 console,并把截图作为 artifact。
- build/test/smoke 真实通过,不编造。
