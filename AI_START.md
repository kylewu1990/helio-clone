# AI_START — 新会话唯一入口

> 新会话从这里开始。读完这一份 + 它指向的 3 份,就能接着干活。
> 项目:自建的 Helio 同款 AI 工作区(团队聊天 + AI 助手),内部自用、无登录。
> 位置:`/Users/kaiwu/Documents/kyle-agent/helio-clone`

---

## 第 0 步:当前状态(重要)

**主体功能已完成,处于"停止新增、按需维护"阶段。** 不要主动开发新功能。
只做用户这次明确要求的事。要做新功能,先确认。

---

## 第 1 步:怎么跑

```bash
cd /Users/kaiwu/Documents/kyle-agent/helio-clone
pnpm dev          # concurrently 同起前后端
# 前端 http://localhost:5173  后端 :5373
```

- **后端通常已在用户自己的终端跑着**(`pnpm dev`),不要重复起一个后台进程抢端口。先 `curl localhost:5373/api/users` 确认是否活着。
- 用 Claude 自己起后台后端会被**沙箱周期回收**(curl 000、前端卡"正在进入工作区…"),这是沙箱限制不是 bug、不丢数据。能用用户终端那个就用那个。
- **AI key 与本地代理**:多数助手指向**本地 LLM 代理 CLIProxyAPI(`127.0.0.1:8317`,OpenAI→Claude OAuth)**。代理由用户在外部跑。
  - ⚠️ **`brew upgrade cliproxyapi` 会覆盖用户给 `claude_executor.go` 打的补丁**,届时"AI 不读记忆/人设、像裸模型只会调工具"会复发。复发先怀疑代理吞 system,而不是改我们的代码。详见 DECISIONS.md。
- **终端依赖 node-pty(原生模块)**:已装,用 N-API prebuild 免编译。若终端报 `posix_spawnp failed`,是 spawn-helper 丢了执行位(pnpm 重装会复发);`server` 的 `dev` 脚本已前置 `chmod +x` 兜底,手动修:`chmod +x server/node_modules/node-pty/prebuilds/*/spawn-helper`。

---

## 第 2 步:硬性约束(违反会丢数据 / 踩坑)

1. **绝不删/重置用户建的数据**(助手、消息、频道、事件)。只动自己明确建且标注的测试对象,**删前确认**。
2. **绝不跑 `pnpm db:reset`**(会 `--force-reset` 清空整库)。加字段用 `pnpm -C server db:push`(增量、不丢数据)。
3. **别直接对 `dev.db` 跑 DELETE/UPDATE**(绕过 API → 前端 WS 不同步 + auto-mode 会拦)。删测试数据走 API 或精确全文条件,删前确认。
4. **无 body 的 fetch 不要带 `Content-Type: application/json`**(Fastify 会 400)。沿用 `web/src/lib/api.ts` 的 `req()`。
5. **校验类型用 `pnpm -C web exec tsc --noEmit`**;server 端 tsc 因缺 `@types/node` 会误报,别被吓到。
6. **助手 key 绝不回传前端**(只给 `hasApiKey` 布尔)。
7. 控制台 "changed size between renders" / "hook order" 多是 **HMR 陈旧日志**,以截图为准。
8. 弹窗在 create/edit 间切换要加 `key` prop,否则表单不刷新。
9. 中文沟通、回复简洁、不加 emoji。

---

## 第 3 步:接着读这 3 份

| 文件 | 看它干嘛 |
|---|---|
| **PROJECT_CONTEXT.md** | 当前已有哪些功能 + 文件在哪 + 数据模型/接口导航 |
| **TASKS.md** | 已完成什么、还剩什么、清理项(临时测试残留) |
| **DECISIONS.md** | 为什么这么设计(架构/人设/记忆/路由/日历/代理坑根因) |

读完按用户这次的具体需求动手。
