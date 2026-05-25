# DECISIONS — 重要决策与原因

> 记录"为什么这么做",避免重走弯路。新决策追加在对应小节。

## 架构

1. **自建全栈**(不改原版 bundle):原版 Helio 是 Electron 瘦客户端 + SaaS 后端,业务逻辑在云端(`api.helio.im` / Clerk / Ably),bundle 只有混淆前端 + 设计 token + 33 职业目录。所以复刻逻辑只能自建后端。
2. **栈选型**:Fastify + Prisma + SQLite + WebSocket;React19 + Vite + Tailwind v4 + Geist + 原版 OKLCH 暖色 token。要扩并发:schema 的 provider 从 sqlite 改 postgresql + 换 DATABASE_URL 即可。
3. **无登录**:`x-user-id` 头 + 前端身份切换。要真鉴权再另接。
4. **助手 = 特殊 User**(`isAssistant=true`):天然复用成员/私信/消息/@/实时,无需单独 bot 系统。**这是整个助手体系的地基。**

## AI 助手

5. **多供应商走 OpenAI 兼容协议**:各家都暴露 `/chat/completions`。两种配置:`providers.json`(共享、key 在文件)或每助手 UI 自带 baseUrl+key(存 DB)。**key 绝不回传前端**(只给 hasApiKey)。
6. **技能 = 真 function-calling 工具**(不是假人设):模型自己决定调用,后端执行回传。
7. **统一流式(含工具助手)**(原「流式仅限无工具助手」,2026-05-24 已突破):占位消息 + `message-chunk` WS 分片 + `message-updated` 定稿。`streamChat` 现支持 stream+tools(流式累积 tool_calls → 执行 → 最终回答逐字流式),工具助手最终回答也流式。停止生成随之补完:**频道级硬刹车** `POST /api/channels/:id/stop`(`genControllers` Map 中断 + `stopUntil` 短期阻断窗口 + 清助手工作状态;`signal` 串进 generateReply,AbortError → 「(已停止生成)」)。
8. **上传走 markdown**:上传得 URL → 以 `![](url)`/`[name](url)` 插入正文 → 和 AI 返回的图同一套渲染路径,统一优雅。
9. **预设职业 = 本地写的 system prompt**:原版是服务端 templateRef,我们没它的服务端,自己写 prompt。

9b. **回复默认简短(2026-05-24)**:用户反映"加了简短人设还是发一堆"。**A/B/C 探针诊断**(临时端点直连代理:同一简短指令走 system 通道 vs 塞 user 通道 vs 无指令基线):system **没**被代理吞(A=B 都遵循),根因是经代理的实际模型是 Claude、**默认啰嗦且爱 Markdown 列表**(无指令 287~363 字),而第一版"自适应"措辞太软压不住。改强:`ai.ts` 注入「回复风格·默认简短」准则——默认 1-3 句口语、**禁 Markdown 标题/分点列表**,仅当用户明确要"详细/展开/步骤/方案"或问题确实复杂时才展开。**实测同一问题 287 字带列表 → 108 字纯口语**。教训:对默认啰嗦的模型,"自适应/拿不准"这类软措辞无效,要给硬约束(明确句数 + 禁列表)。注:画图机(isImageModel)走独立分支不受影响;助手可在自身 systemPrompt 覆盖(如"本助手总给详细方案");探针端点诊断后已删。

## 人设:双层人设法(2026-05-24)

10. **不写"你不准做 X"的冷冰冰禁令**,改为三段式:**核心聚焦**(专长) + **认知融合**(鼓励跨界审查/质疑、发挥涌现) + **行动边界**(认知开放,但工具/落地/拍板隔离,谁落地 @谁)。
    - **原因**:用户要 AI 是真队友——认知要高度融合(能跨界出主意),但行动必须绝对隔离(不能抢着调工具/拍板),否则会乱。
11. **拍板权隔离**:`create_task`(生成任务卡 = 拍板落地)只给 产品经理 / 项目经理 / 技术负责人;日历写权(create/update_event)只给 项目经理 / 日程管家。

## 路由与唤醒

12. **频道主动响应**(2026-05-23):复刻原版 "without waiting to be asked"。发普通消息后做一次轻量 LLM 路由(`pickResponders`:新消息 + 频道内可用助手职责 → 选 0~N 个该回的)。**四层防吵**:每助手 `autoRespond` 开关 + 单条最多 `MAX_AUTO_RESPONDERS=2` + 同助手同频道 `AUTO_COOLDOWN_MS=8000` 冷却 + 无 key 助手不进候选(`canGenerate`)。
13. **严格 @handle 路由**(2026-05-24):`parseMentions` **只认带 @ 的提及**(不再裸名字匹配,曾误触发)。规则:被 @ 必回(绕过开关/冷却)、**整条消息一旦有任何 @ 即关主动路由**(未点名助手严格静默、防抢答)、@多人按出现顺序串行依次回、`@all` 唤醒全频道助手。`MAX_ASSISTANT_DEPTH=3` 防多助手互 @ 死循环。

## 记忆

14. **分层记忆,坚决不做 L3 向量库(pgvector 太重)**:MVP 阶段过早优化没必要。
    - **L1**:每次取最近 `ASSISTANT_HISTORY=40` 条(`buildHistory`)——token 不会爆,但记性短。
    - **L2**:每助手 `memory` 字段(跨频道),以 XML(`<long_term_memory>` + `<critical_instruction>`:有记忆事实时禁止再调工具二次查)注入 system prompt(`withMemory`);UI 可编辑 + `remember` 工具自更新(末尾截断 4000 字)。**已验证生效。**
15. **代理 cloaking 根因**(踩坑记录):记忆/人设一度完全不生效,**根因不在模型也不在我们代码**,而是本地代理 CLIProxyAPI(`127.0.0.1:8317`)的 Claude OAuth executor 把业务 system "cloaking" 掉了(translator 已把 system 抽到顶层,executor 又覆盖/消毒)。排查法:① `ai.ts` 发包前打印确认 system 在 `messages[0]`;② 把 system 临时塞 user 消息测——塞 user 就生效 = 代理吞 system。用户改 `claude_executor.go` 根治。**⚠️ `brew upgrade cliproxyapi` 会覆盖该补丁,届时复发要重新合并。**

## 日历

16. **日历 = 事件驱动协作轴,不是打卡日历**(2026-05-24):
    - **事件线程化**:每个 `Event` 关联讨论(事件卡即线程根,`Message.eventId`)。
    - **技能挂载**:create_event / read_calendar / update_event。
    - **时间触发器**:Cron(`index.ts` 里 `setInterval(…, 60_000)`),事件开始前自动 @日程管家发简报(`remindedAt` 去重)。
    - **Cron @self 坑**:提醒作者若是建事件者本人,"@自己"会被当 @self 过滤掉 → 无简报。修法:`const author = (await firstHumanMember(channelId)) ?? createdById`(优先真人作者)。
    - 先手搓本地轻量 Event 库,闭环在内部。

## 工程兜底

17. **幂等 seed**:`seed.ts` 库非空就跳过、绝不 deleteMany;`setup` 不再 reset。只有显式 `pnpm db:reset` 清库。**起因:曾误删用户数据,从此防呆。**
18. **配置进 UI、对象可编辑**:内部自用优先做成 UI 表单 + 可编辑(助手 key/频道、频道设置),配置文件只作高级/共享选项。
19. **`/api/me` 只投影 6 个公开字段**(安全):不泄露 apiKey 等敏感字段。

## 前端交互

20. **聊天输入框:Enter 换行 / ⌘·Ctrl+Enter 发送(2026-05-24)**:用户要求"不要一回车就发送"。深层根因是**中文输入法误发**——用 IME 打字、或用中文输入法打英文时按回车「上屏」会被当成发送。修法:
    - **IME 保护**(关键):`onKeyDown` 首行 `if (e.nativeEvent.isComposing) return`,合成期间回车只用于上屏(Composer 与 MessageRow 消息编辑框都加)。这是中文输入法回车误发的标准修法。
    - 普通 Enter **不** `preventDefault` → textarea 自然换行;`⌘/Ctrl+Enter` 才 `submit()`。
    - @提及菜单内 Enter 仍选中候选(`⌘/Ctrl+Enter` 例外,落到发送)。
    - 有输入时显示「Enter 换行 · ⌘ + Enter 发送」提示。
    - 注:消息编辑框保留 Enter 保存 + IME 保护(行内短编辑,与 Slack 一致)。

21. **聊天图片查看/保存(2026-05-24)**:用户反映"生成的图片不能保存"。**根因**:MessageRow 整行 `onContextMenu` 被劫持成删除确认(`preventDefault`),右键图片弹不出浏览器"另存为"。修(MarkdownBody 的 `<img>`):① `onContextMenu` 只 `stopPropagation`、不 `preventDefault` → 保留原生右键菜单、且不冒泡到删除确认;② 点击开全屏 lightbox(大图 + 下载 + 关闭,Esc / 点空白关);③ hover 右上角下载按钮。下载走 `fetch → blob → a[download]`(同源 uploads 强制下载,跨源回退 `window.open`)。专业聊天工具的图片基本盘。

22. **助手只读本地文件(2026-05-24)**:用户要"让助手能看见电脑上的东西"(截图里助手回"看不到你本地代码")。加 `list_dir` + `read_file` 两个**只读**技能(skills.ts),并设为 `GLOBAL_SKILL_IDS`、在 `ai.ts` 对**所有对话助手默认开放**(不必逐个勾选,直接解决现有助手看不到)。根目录 `FILE_ROOT` 默认 = kyle-agent 工作区(`COMMAND_ROOT` 上跳一级),env 可覆盖。安全边界:`resolveInRoot` 限制路径在根内(越界拒)、过滤隐藏文件(.env/.git)与 .key/.pem、挡二进制扩展名、30000 字截断;已实测越界 / 敏感文件均被拒。**为何只读而非给所有助手开 run_command**:只读无 RCE 面、可安全普及;run_command(写 / 执行 shell)仍只限受信助手。
