# PROJECT_CONTEXT — 当前状态与导航

> 这份只写"现在有什么 + 东西在哪"。入口看 **AI_START.md**;进度/待办看 **TASKS.md**;为什么这么设计看 **DECISIONS.md**。
> 位置:`/Users/kaiwu/Documents/kyle-agent/helio-clone`

## 已完成功能(均已浏览器验证)

**聊天**:频道 / DM / 实时(WS)/ 未读 / 在线 / 明暗主题 / 响应式抽屉;反应、话题串、@补全、编辑删除、固定、搜索+定位、收件箱、任务看板、Markdown + 图片上传。

**AI 助手(招牌)**:助手 = 特殊 User(复用全部机制);多供应商(UI 配 baseURL+key,key 不回传);34 预设职业(双层人设法);真 function-calling 技能(时间/搜消息/算数/建任务/读网页/生成图片/记忆/日历/读本地文件 list_dir+read_file 全局只读);统一流式(含工具助手最终回答)+ 停止生成硬刹车;工具调用可见;选择性入群。

- **频道主动响应**:无需 @,LLM 路由 `pickResponders` + 四层防吵(开关/最多2个/8s冷却/无key不进候选)。
- **严格 @handle 路由**:被 @ 必回、整条有 @ 即关主动路由(防抢答)、@多人按序依次回、@all;多助手协作(`MAX_ASSISTANT_DEPTH=3` 防循环)。
- **L2 长期记忆**(`memory` 字段 XML 注入 + `remember` 工具)、AI 工作状态、cede 透明、任务可派 AI。
- **日历事件协作轴**:`Event` 模型 + 日历技能 + 事件卡即讨论线程根 + Cron 提醒。
- **终端 Terminal**:Rail 第四视图。人用交互终端(独立 WS `/ws/terminal` + node-pty + @xterm/xterm,刷新即重建,cwd=项目根)+ AI `run_command` 技能(cwd 限项目根/超时/截断/危险词预检,权限隔离给 engineer/tech-lead)。

## 文件导航

后端 `server/src/`:
- **index.ts**(★1695 行)= 全部 REST + WS + `maybeTriggerAssistants`(触发/路由/统一流式/工具/多助手)+ 停止生成(`genControllers`/`stopChannelGen` + `POST /channels/:id/stop`)+ `parseMentions` + `withMemory` + `shapeMessage` + Cron(`setInterval` 60s)
- **ai.ts** = `generateReply`(供应商解析/SSE流式/工具循环)+ `pickResponders` + `canGenerate`
- **skills.ts** = 技能 schema+handler + `runTool/toolsFor`;**presets.ts** = 34 职业 + `PRESET_SKILLS` 映射
- **realtime.ts** = WS 连接表;**db.ts** = Prisma 单例;**prisma/{schema.prisma,seed.ts}**

前端 `web/src/`:
- **App.tsx**(★)= 顶层状态机 + 所有 handler + `onEvent`(WS)
- `lib/{api,types,ws,identity,format}.ts`;`components/`(Rail/Sidebar/ChannelView/MessageRow/MarkdownBody/Composer/ThreadPanel/Avatar/InboxView/TasksView/TerminalView/CreateAssistantModal/ChannelSettingsModal)
- 终端:后端 index.ts `/ws/terminal`(node-pty)+ skills.ts `run_command`;前端 TerminalView(@xterm/xterm)。node-pty 原生模块,spawn-helper 执行位由 server `dev` 脚本前置 chmod 兜底

## 数据模型(`schema.prisma`)

- **User**:handle/name/avatarColor/status + 助手:isAssistant/autoRespond/systemPrompt/memory/provider/baseUrl/apiKey/model/skills(JSON)/createdById
- **Channel**:name/topic/isDM/isPrivate/archivedAt;**Message**:channelId/authorId/body/parentId/editedAt/deletedAt/pinnedAt/toolsUsed/cededBy/eventId
- **Event**:title/startsAt/endsAt/location/description/channelId/createdById/remindedAt;**Reaction/ReadCursor/Mention/ChannelMember/Task**

## 接口

REST(都需 `x-user-id` 头):channels(+members)、messages(发/历史/编辑删/反应/pin/thread)、dms、search、inbox、tasks、assistants、events、upload。
WS `/ws?userId=`:presence、message、message-updated、message-chunk(流式)、channel-created/updated、reaction、thread-reply、typing、assistant-status、inbox、tasks。
WS `/ws/terminal?userId=`:交互式终端独立通道,每连接一个 node-pty;出站 data/exit,入站 input/resize(JSON 文本帧)。
