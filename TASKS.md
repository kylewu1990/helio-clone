# TASKS — 进度与待办

> 最后更新:2026-05-24。状态:主体完成,**停止新增功能**,按需维护。

## 正在做

- 无新功能开发。2026-05-24 做了一次全量代码静态检查(server/src + web/src),产出下方「代码检查待办」,等用户拍板动手范围与优先级。

## 已完成(均已浏览器验证)

- **聊天底座 + 深度**:频道/DM/实时/未读/在线/主题、反应/话题串/@补全/编辑删除/固定/搜索+定位/收件箱/任务看板/Markdown+图片上传
- **AI 助手体系**:助手=特殊 User、多供应商 + UI 配 key、流式输出、工具调用可见、选择性入群
- **频道主动响应**(2026-05-23):LLM 相关性路由 `pickResponders` + 四层防吵(开关 / 最多 2 个 / 8s 冷却 / 无 key 不进候选)
- **四条同事化增强**(2026-05-24):AI 工作状态 / cede 透明 / 任务可派 AI / L2 长期记忆
- **预设职业 12 → 34**(2026-05-24):双层人设法(核心聚焦 + 认知融合 + 行动边界),`create_task` 拍板权限隔离到 产品/项目/技术负责人
- **记忆模块 + 代理根因修复**(2026-05-24):`memory` 字段以 XML 注入 system prompt + `remember` 工具自更新;根因是本地代理 CLIProxyAPI 的 Claude executor "cloaking" 吞了业务 system,用户改 `claude_executor.go` 后真实生效(给助手记 SQLite/5373,私信问它直接答出且 tools=[])
- **严格 @handle 路由**(2026-05-24):`parseMentions` 只认带 @ 的提及;被 @ 必回、有 @ 即关主动路由(防抢答)、@多人按序依次回、`@all` 唤醒全频道助手
- **响应式布局**(2026-05-24):md(768px)断点,窄屏 Sidebar 抽屉 / ThreadPanel 全屏 / header 加汉堡
- **日历事件协作轴**(2026-05-24):`Event` 模型 + 技能(create_event/read_calendar/update_event)+ 事件卡即讨论线程根 + Cron(`setInterval` 60s)事件前自动 @日程管家发简报。已与记忆联调验证(简报用到了记忆事实)
- **终端 Terminal**(2026-05-24):Rail 第四视图。①人用交互终端:独立 WS `/ws/terminal` + node-pty + @xterm/xterm,**刷新即重建**,cwd=项目根。②AI `run_command` 技能:cwd 限项目根 / 30s 超时 / 8KB 截断 / 危险词预检,权限给 engineer/tech-lead。已浏览器端到端验证(pwd/ls、切走重建、越界/危险词拒绝)。坑:node-pty 用 N-API prebuild 免编译,但 pnpm 丢 spawn-helper 执行位 → `dev` 脚本前置 chmod 根治
- **AI 画图修复 + 画图机模式**(2026-05-24):原「调用了生成图片却没图」根因 = 工具把超长 base64 返给模型、模型无法原样贴出→丢图。修:`generate_image` 落盘 server/uploads 返**短 URL**(skills.ts)+ `ai.ts` done 兜底 append + 对带画图技能助手注入「必须调工具」强引导(防只回文字)。另加**画图机模式**:助手 model 设图像模型(gpt-image-2)→ `index.ts` `isImageModel` 走画图机分支,不对话、直接拿消息当 prompt 用该 model 画图回纯图(`ctx.imageModel`)。已端到端验证(汽车icon / 橘猫直接出图)。**配置认知**:助手 baseUrl/model 是聊天用;画图模型在 generate_image 内部,别把助手 model 填 gpt-image-2 当聊天(会 404/503)
- **停止生成 + 工具助手统一流式**(2026-05-24,代码层面完整;本次为静态核查,未跑浏览器验证运行时):突破原「流式仅限无工具助手」限制。`ai.ts` 统一走 `streamChat`(stream+tools:流式累积 tool_calls → 执行 → 最终回答逐字流式)。停止生成做成**频道级硬刹车**:`POST /api/channels/:id/stop` → `stopChannelGen` 中断该频道所有进行中 AbortController(`genControllers` Map)+ `stopUntil` 短期阻断窗口(防刚停又被主动路由触发)+ 清空助手工作状态;`signal` 串进 generateReply,AbortError → 「(已停止生成)」;前端 ChannelView 的 ActivityBar 在有 activity 时显示「停止」按钮。注:实际落地是**频道级** `/channels/:id/stop`,非当初设想的消息级 `/messages/:id/stop`。

## 公网部署前阻断项 (Blockers)

> 2026-05-24 代码检查发现的安全问题。**当前本地内部自用、无公网暴露,暂不阻塞使用,故先不改安全代码**(用户决定)。**公网部署 / 多用户开放前必须逐项解决**,否则等于把服务器交出去。

### 1. run_command 权限隔离运行时形同虚设(RCE 面)

- **现状**:`skills.ts` 的 `runTool`/`toolsFor` 只按 skill id 查表执行,**无任何角色/权限校验**;`index.ts` 创建(POST /api/assistants)/编辑(PATCH)助手接口**全盘接受**任意 `skills` 数组。
- **后果**:任何能调用助手的人,把任意助手(哪怕「翻译」)勾上 `run_command`,即可在**项目根目录跑任意 shell**。约定「只给 engineer/tech-lead」仅由 presets 默认映射体现,运行时不存在。叠加无鉴权(x-user-id 头随便填)→ 公网下等于开放 RCE。
- **修法**:在 `runTool` 执行前按「助手受信白名单/角色」校验,或在写接口拒绝把 run_command 写给非受信助手;最稳是二者都做 + 引入真实鉴权。

### 2. run_command 危险词预检可绕过

- **现状**:`skills.ts:544` 正则只挡字面量(`rm -rf`/`sudo`/`mkfs`)。
- **后果**:`shell:true` 下 `$(...)`、反引号、`bash -c '...'`、变量拼接都能绕过;且未挡 `git push`、`curl|sh`、读 `.env`/apiKey。注释自认「非安全边界」。
- **修法**:别用黑名单。改命令白名单 + 禁 shell 元字符 + 不用 `shell:true`(execFile + 参数数组);或沙箱化(容器 / 受限用户 / 只读挂载)。

### 3. 上传无类型/魔数校验(存储型 XSS)

- **现状**:`index.ts:595` `stored = randomUUID()+ext`,ext 取自用户文件名,无白名单、无 MIME/magic-number 校验;`isImage` 仅按扩展名。
- **后果**:可上传 `.html`/`.svg`(内嵌脚本)经 `/uploads/` 被浏览器当页面渲染 → 存储型 XSS。
- **修法**:扩展名白名单 + 校验真实 magic number + 非图片强制 `Content-Disposition: attachment` + 限制大小。

### 4. 画图机分支把消息原文直发外部图像 API

- **现状**:`index.ts:489` 画图机助手把触发消息原文当 prompt 直发 `/images/generations`。
- **后果**:若该助手 baseUrl 指第三方,群里任何消息(可能含敏感信息)无确认即外发第三方。
- **修法**:明确画图机助手的数据外发边界;公网多租户下对跨租户数据外发做隔离/提示。

### 5. 助手只读文件 = 数据外发面(本地自用可接受,公网前评估)

- **现状**:`list_dir`/`read_file`(2026-05-24 加,全局开放)让助手把工作区文件内容发给 LLM 供应商 / 代理。
- **后果**:本地 + 自己的代理可接受;公网 / 多租户下等于把工作区文件喂给第三方模型。
- **修法**:公网前收紧 `FILE_ROOT` 根、对敏感目录脱敏 / 黑名单、加访问审计;真鉴权后按用户隔离可见范围。

## 代码检查待办(2026-05-24 静态全量核查,均需拍板才动)

> 来源:对 server/src + web/src 的只读检查。**安全/正确性**项涉及行为变化、改后需手测;**可整理**项为纯清理、无行为变化。

### 安全

> 已抽出为独立模块 **「公网部署前阻断项 (Blockers)」**(见本文件上方)。本地自用暂不改,公网部署前必修。

### 正确性 / bug

- **Cron 重入重复提醒**:`index.ts:1619` setInterval + findMany→update 非原子;回调(含 LLM 触发)超 60s 会重入、重复 @ 提醒。修:`updateMany({where:{id,remindedAt:null}})` + count 判断。
- **两套提及解析不一致**:`extractMentions`(收件箱,裸 includes 子串误命中)vs `parseMentions`(触发,前缀匹配)→ 收件箱通知与助手触发结果可能不一致。统一为一个解析。
- **助手 @ 真人不进收件箱**:Mention 落库只在真人发消息路径(`index.ts:1183`),助手回复 @人 不写 Mention、不发 inbox 事件。
- **parseMentions 前缀误吞**:`index.ts:277` startsWith 致 `@bobby` 同时命中 `bob`;遍历依赖 members 顺序、结果不稳定。
- **停止生成竞态**:`index.ts:511-517` 占位创建与 registerGen 之间点 stop 会漏刹;工具循环(`ai.ts:165` 5 轮)两轮间不查 isStopped,abort 时机不巧会多跑一次 runTool(可能是 run_command)。
- **withMemory 禁工具指令过宽**:`index.ts:251` 有记忆就禁 search_messages/fetch_url/list_channels,会压制实时查询(记忆是快照、这些工具是实时)。
- **流式 chunk 首包兜底缺失**:`App.tsx:284` message-chunk 找不到对应消息 id 就静默丢字,无缓存兜底;需结合后端发送顺序确认。

### UI 布局

- **ThreadPanel + Sidebar 同开中间栏被挤窄**:断点不统一(Sidebar `max-md:` 768 / ThreadPanel `max-lg:` 1024)。≥1024px 时 Rail56 + Sidebar256 + Thread384 = 696px 占死,1024–1100px 笔记本宽度下中间聊天区只剩 300+px,消息行/Composer 被压窄。修:ThreadPanel 浮层断点提到 `max-xl:`、或 `<section>` 加 min-w 兜底、或开 Thread 时联动收 Sidebar。

### 可安全整理(纯清理、零行为变化)

- `#dc2626` 硬编码 7+ 处 → 统一 `var(--destructive)`(暗色顺带修对):Sidebar / ChannelView / MessageRow / TasksView。
- 抽 `AssistantInput` 类型到 types.ts:消除 4 处 10 字段重复声明(api.ts + App.tsx)。
- 常量外移:EMOJI / SKILL_LABELS(MessageRow)、KNOWN / TIER_LABEL(CreateAssistantModal)→ lib 常量文件(SKILL_LABELS 与后端 skill id 强耦合,集中防漂移)。
- 魔法数集中:STOP_BLOCK_MS / AUTO_COOLDOWN_MS / 工具轮数 5 / 30s / 8KB / 3600_000 / 86400000 等提为具名常量。
- 抽公共件:本地端点正则(ai.ts:69/89 重复)、mentionNames helper(ChannelView/ThreadPanel 重复)、DeleteConfirm 组件(Sidebar 三处重复)、未读 badge 阈值统一(Rail 9+ vs Sidebar 99+);`realtime.ts:15` broadcastPresence 去 export。

### 较大重构(价值高但 diff 大,单独排期 + 手测)

- 拆 `maybeTriggerAssistants`(index.ts ~257 行)→ routeAutoResponders / runOneAssistant / recordCede。
- 拆 App.tsx(729 行)巨石 → useChannelEvents / useAssistants 等 hook。
- 拆 MessageRow(460 行)→ EventCard / ReactionBar / MessageActions。

## 下一步候选(按建议优先级,均需用户拍板才动)

1. **用真实 key 端到端验证其余**:流式打字(含工具助手最终回答流式 + 停止生成运行时)、读网页(fetch_url)、多助手协作(生成图片闭环已于 2026-05-24 验证)。
2. **消息分页 / 虚拟滚动**:后端现 `take 200`,长频道会卡;搜索/收件箱定位只能定位已加载的消息。
3. **通知**(桌面/声音)、已读回执、链接/图片预览增强。
4. **Electron 打包**(用户已定:以后做)。前置:DB 外置到代码目录外 + dev/prod 隔离 + 启动自动迁移(`prisma migrate deploy`),覆盖更新不碰数据。

## 清理项(临时测试残留,动前确认)

- **技术负责人助手有临时日历技能**:`presets.ts` 里 `tech-lead` 技能是 `[search_messages, list_channels, current_datetime, create_task]`(**不含**日历);但用户在 DB 里的那个"技术负责人"实例测试时被加了 create_event/read_calendar/update_event。如不再需要,可在编辑助手弹窗里去掉(走 UI,别直接改库)。
- **测试数据**:公司群里有测试事件(外景地勘景 / 快速对齐会 / 项目复盘会,后两者 `remindedAt` 已置)和若干测试消息。清理走 API、删前确认。
- **run_command 对现有助手不自动生效**:`presets.ts` 只改新建助手默认技能;DB 里现有助手(技术负责人等)要用 run_command,需在编辑助手弹窗勾选「执行命令」技能(走 UI,别直接改库)。
- **设计师私信有历史报错消息**:助手 model 误填 gpt-image-2 当聊天用时留下的 503/404 消息,可走 API / 前端多选删除清理,删前确认。
- **两个「设计师」助手**:`设计师`(gemini-2.5-flash,能聊能画)+ `设计师gpt-image-2`(gpt-image-2,纯画图机)。用户保留两者各占一用途;如不需要可删其一(走 API/UI)。

## 已知小问题(非阻塞)

- **中间断点布局**:同时开 ThreadPanel + Sidebar 时中间栏会被挤窄。可考虑加 lg 断点。
- 无真实鉴权、无自动化测试。
- server 端 tsc 缺 `@types/node` 误报(运行用 tsx 不受影响;要根治 `pnpm -C server add -D @types/node`)。
