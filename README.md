# Helio 同款 AI 工作区(自建 · 内部自用)

复刻 [Helio.app](https://helio.im) 的逻辑,做一个**内部自用、移除登录**的同款:团队聊天 + AI 助手是一等成员。完全自建全栈、不依赖 Helio 云。

> 原版是 Electron 瘦客户端 + SaaS 后端,业务逻辑在云端;所以"复刻逻辑"= 自建全栈后端。

## 功能一览

- **聊天底座**:频道 / 私信 / 实时(WebSocket)/ 未读 / 在线状态 / 明暗主题 / 响应式(移动端抽屉)
- **聊天深度**:emoji 反应、话题串、@提及补全、编辑删除、固定、全局搜索 + 消息定位、收件箱、任务看板、Markdown + 图片上传
- **AI 助手(招牌)**:
  - 助手 = 特殊 User,复用成员/私信/消息/实时全部机制
  - 多供应商(任意 OpenAI 兼容端点),每个助手可在 UI 配 baseURL + key + 模型
  - 34 个预设职业(双层人设法),真实 function-calling 技能(查时间/搜消息/算数/建任务/读网页/生成图片/记忆/日历)
  - 频道主动响应(无需 @,LLM 相关性路由 + 四层防吵)、严格 @handle 路由、多助手协作
  - L2 长期记忆、AI 工作状态、cede 透明、任务可派 AI
  - 日历事件协作轴(事件卡即讨论线程根 + Cron 定时提醒)

## 技术栈

- **后端**:Fastify + Prisma + SQLite + `@fastify/websocket`(`server/`,端口 5373)
- **前端**:React 19 + Vite + Tailwind v4 + Geist + lucide-react(`web/`,端口 5173)
- **无登录**:`x-user-id` 请求头 + 前端身份切换

## 运行

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm install        # 首次
pnpm dev            # concurrently 同起前后端
```

浏览器开 http://localhost:5173,左下角头像切换身份(seed:kyle / amy / leo / mia / sam)。

### 配置 AI key(两选一)

- `server/.env` 的 `OPENAI_API_KEY` / `OPENAI_BASE_URL`(单一供应商兜底),或
- 复制 `server/providers.json.example` 为 `providers.json` 填多供应商,或
- 直接在创建/编辑助手弹窗里给该助手填 baseURL + key

### 常用命令

```bash
pnpm -C server db:push           # 改 schema 后增量同步(不丢数据)
pnpm -C web exec tsc --noEmit    # 前端类型检查
curl localhost:5373/api/users    # 确认后端活着
# pnpm db:reset                  # 会清库,慎用!
```

## 数据

SQLite 文件 `server/prisma/dev.db`,持久化,改代码不丢。seed 幂等(库非空就跳过)。

## 给 AI / 新会话

**从 [AI_START.md](AI_START.md) 开始读**,再看 PROJECT_CONTEXT.md / TASKS.md / DECISIONS.md。
