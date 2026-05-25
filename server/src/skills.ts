// 助手技能/工具 —— 复刻 Helio 的 plugins。
// 每个技能 = 一个 OpenAI function-calling 工具(schema + 真实 handler)。
// 模型在对话中自行决定何时调用,后端执行后把结果回传模型。

import { prisma } from './db.js'
import { sendToUsers, onlineUserIds } from './realtime.js'
import {
  classifyCommand,
  classifyCommandForSandbox,
  LOW_RISK_AUTO_APPROVE,
} from './permissions.js'
import {
  guardSandboxCommand,
  runInSandbox,
  logSandbox,
  sandboxEnv,
  SANDBOX_CMD_TIMEOUT_MS,
} from './sandbox.js'
import {
  browserOpen,
  browserScreenshot,
  browserConsole,
  browserClick,
  browserType,
  isLocalUrl,
} from './browser.js'
import { spawn } from 'node:child_process'
import { resolve as pathResolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile, readFile, readdir, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

// run_command 的根目录 = 项目根(server/src 上跳两级)。可用 HELIO_ROOT 覆盖。
const COMMAND_ROOT =
  process.env.HELIO_ROOT ||
  pathResolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// 生成图片落盘目录(= index.ts 的 UPLOAD_DIR,server/uploads)
const UPLOAD_DIR = pathResolve(process.cwd(), 'uploads')

// 助手只读文件的根目录 = kyle-agent 工作区(COMMAND_ROOT 上跳一级);env FILE_ROOT 可覆盖
const FILE_ROOT = process.env.FILE_ROOT || pathResolve(COMMAND_ROOT, '..')
// 把用户给的路径(相对工作区根 / 绝对)解析并限制在 FILE_ROOT 内;越界返回 null
function resolveInRoot(p: string): string | null {
  const t = pathResolve(FILE_ROOT, p || '.')
  if (t !== FILE_ROOT && !t.startsWith(FILE_ROOT + '/')) return null
  return t
}
function relToRoot(abs: string): string {
  return abs === FILE_ROOT ? '.' : abs.slice(FILE_ROOT.length + 1)
}

export type ToolSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

type Skill = {
  id: string
  name: string // 中文名(展示)
  description: string // 说明(展示)
  tool: ToolSchema
  run: (args: any, ctx: SkillCtx) => Promise<string>
}

export type SkillCtx = {
  channelId?: string
  userId?: string
  baseUrl?: string | null // 助手的连接(供 generate_image 调图像 API)
  apiKey?: string | null
  model?: string | null
  imageModel?: string | null // 画图机:用助手自己的图像模型(如 gpt-image-2)
  createdEventId?: string // create_event 回写:本轮新建事件 id,让助手回复消息挂成日历卡片
  // 每次工具调用后回调(供任务执行运行时把 tool call 关联到 taskId/missionId 并写审计)
  onTool?: (e: { name: string; args: unknown; result: string }) => void
  // 任务执行上下文:存在则代表「这是任务执行运行时在跑」,高危能力走人工审批门
  exec?: {
    taskId: string
    runId: string
    allowRunCommand?: boolean // 经人工批准续跑时为 true,放行 run_command
    // 请求人工审批(创建 ApprovalRequest)。调用后助手应停止,等待人类批准
    requestApproval?: (capability: string, command: string) => Promise<void>
    // 沙盒运行时:存在则 run_command/write_file 全部限制在隔离 workspace 内执行
    sandbox?: {
      sandboxRunId: string
      workspacePath: string
    }
  }
}

// 安全计算:仅允许数字与基本运算符
function safeCalc(expr: string): string {
  if (!/^[0-9+\-*/(). %eE\s]+$/.test(expr)) return '表达式含非法字符,仅支持数字与 + - * / ( ) %'
  try {
    // 已用白名单限制字符,无标识符可访问,求值安全
    const v = Function('"use strict";return (' + expr + ')')()
    return typeof v === 'number' && Number.isFinite(v) ? String(v) : '无法计算'
  } catch {
    return '无法计算该表达式'
  }
}

const LIST: Skill[] = [
  {
    id: 'current_datetime',
    name: '当前时间',
    description: '获取此刻的日期、时间与星期',
    tool: {
      type: 'function',
      function: {
        name: 'current_datetime',
        description: '返回服务器当前的日期、时间和星期(用于涉及"今天/现在/截止"的问题)',
        parameters: { type: 'object', properties: {} },
      },
    },
    run: async () => {
      const now = new Date()
      const s = now.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'full',
        timeStyle: 'short',
      })
      return `现在是 ${s}(Asia/Shanghai)`
    },
  },
  {
    id: 'search_messages',
    name: '搜索消息',
    description: '在工作区公开频道中检索历史消息',
    tool: {
      type: 'function',
      function: {
        name: 'search_messages',
        description:
          '在工作区所有公开频道(不含私信)中按关键词检索历史消息,用于查找之前讨论过的内容',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索关键词' },
            limit: { type: 'number', description: '最多返回条数,默认 8' },
          },
          required: ['query'],
        },
      },
    },
    run: async (args) => {
      const query = String(args?.query ?? '').trim()
      if (!query) return '需要提供检索关键词'
      const limit = Math.min(Math.max(Number(args?.limit) || 8, 1), 20)
      const rows = await prisma.message.findMany({
        where: { body: { contains: query }, channel: { isDM: false } },
        include: {
          author: { select: { name: true } },
          channel: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      if (!rows.length) return `没有找到包含「${query}」的消息`
      return rows
        .map((m) => {
          const t = new Date(m.createdAt).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            dateStyle: 'short',
            timeStyle: 'short',
          })
          return `[#${m.channel.name}] ${m.author.name}(${t}):${m.body}`
        })
        .join('\n')
    },
  },
  {
    id: 'list_channels',
    name: '列出频道',
    description: '查看工作区有哪些公开频道',
    tool: {
      type: 'function',
      function: {
        name: 'list_channels',
        description: '列出工作区所有公开频道及其主题与成员数',
        parameters: { type: 'object', properties: {} },
      },
    },
    run: async () => {
      const chs = await prisma.channel.findMany({
        where: { isDM: false },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'asc' },
      })
      if (!chs.length) return '暂无频道'
      return chs
        .map(
          (c) =>
            `#${c.name} — ${c.topic || '(无主题)'}(${c._count.members} 人)`,
        )
        .join('\n')
    },
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '做数值计算(加减乘除、百分比)',
    tool: {
      type: 'function',
      function: {
        name: 'calculator',
        description: '计算一个数学表达式,支持 + - * / ( ) 与百分比',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '数学表达式,如 (1200+800)*0.06',
            },
          },
          required: ['expression'],
        },
      },
    },
    run: async (args) => {
      const expr = String(args?.expression ?? '')
      return `${expr} = ${safeCalc(expr)}`
    },
  },
  {
    id: 'create_task',
    name: '建任务',
    description: '在任务看板创建一条待办',
    tool: {
      type: 'function',
      function: {
        name: 'create_task',
        description: '在团队的任务看板创建一条待办任务(状态默认 待办)',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '任务标题' },
          },
          required: ['title'],
        },
      },
    },
    run: async (args, ctx) => {
      const title = String(args?.title ?? '').trim()
      if (!title) return '需要任务标题'
      await prisma.task.create({
        data: {
          title,
          status: 'todo',
          channelId: ctx.channelId ?? null,
          createdById: ctx.userId ?? null,
        },
      })
      sendToUsers(onlineUserIds(), { type: 'tasks' })
      return `已创建任务:「${title}」(待办)`
    },
  },
  {
    id: 'fetch_url',
    name: '读网页',
    description: '抓取一个网页链接的正文内容',
    tool: {
      type: 'function',
      function: {
        name: 'fetch_url',
        description: '抓取指定 http(s) 网页并返回其纯文本正文(已去标签,截断)',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string', description: '网页地址' } },
          required: ['url'],
        },
      },
    },
    run: async (args) => {
      const url = String(args?.url ?? '').trim()
      if (!/^https?:\/\//.test(url)) return '需要 http(s) 开头的 URL'
      try {
        const res = await fetch(url, { redirect: 'follow' })
        if (!res.ok) return `抓取失败 ${res.status}`
        const html = await res.text()
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        return text.slice(0, 2500) || '(无可读文本)'
      } catch (e) {
        return `抓取出错:${(e as Error).message}`
      }
    },
  },
  {
    id: 'generate_image',
    name: '生成图片',
    description: '按描述生成一张图片(需助手配置支持图像生成的 key)',
    tool: {
      type: 'function',
      function: {
        name: 'generate_image',
        description:
          '根据文字描述生成一张真实图片(返回可直接显示的图)。当用户要求画图/生成图片/出图/做示意图/换风格时必须调用本工具实际生成,不要只用文字描述图片来代替。',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '图片内容的英文或中文描述' },
          },
          required: ['prompt'],
        },
      },
    },
    run: async (args, ctx) => {
      const prompt = String(args?.prompt ?? '').trim()
      if (!prompt) return '需要图片描述'
      const baseURL = ctx.baseUrl?.replace(/\/$/, '')
      const apiKey = ctx.apiKey
      if (!baseURL || !apiKey)
        return '(该助手未配置可用于生成图片的 baseURL/API Key)'
      try {
        const res = await fetch(`${baseURL}/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: ctx.imageModel || process.env.IMAGE_MODEL || 'gpt-image-2',
            prompt,
            n: 1,
            size: '1024x1024',
          }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => '')
          return `生成失败 ${res.status}:${t.slice(0, 200)}`
        }
        const data = (await res.json()) as {
          data?: { url?: string; b64_json?: string }[]
        }
        const item = data?.data?.[0]
        let url = item?.url || ''
        let b64 = item?.b64_json || ''
        // data: URL 也落盘:超长 base64 串塞给模型会被丢弃(模型无法原样贴出)
        if (!b64 && url.startsWith('data:image')) {
          b64 = url.split(',')[1] || ''
          url = ''
        }
        if (!url && b64) {
          const name = `gen-${randomUUID()}.png`
          await writeFile(pathResolve(UPLOAD_DIR, name), Buffer.from(b64, 'base64'))
          url = `/uploads/${name}`
        }
        if (!url) return '(模型未返回图片)'
        return `![${prompt}](${url})`
      } catch (e) {
        return `生成出错:${(e as Error).message}`
      }
    },
  },
  {
    id: 'remember',
    name: '记笔记',
    description: '把要长期记住的信息写入自己的记忆(跨对话保留)',
    tool: {
      type: 'function',
      function: {
        name: 'remember',
        description:
          '把一条需要长期记住的信息写入你自己的记忆(以后每次对话都会注入,跨频道有效)。用于记住用户偏好、长期事实、团队约定等;不要记临时性内容',
        parameters: {
          type: 'object',
          properties: {
            note: { type: 'string', description: '要长期记住的一条信息' },
          },
          required: ['note'],
        },
      },
    },
    run: async (args, ctx) => {
      const note = String(args?.note ?? '').trim()
      if (!note) return '需要要记住的内容'
      if (!ctx.userId) return '无法确定记忆归属'
      const u = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { memory: true },
      })
      const prev = (u?.memory ?? '').trim()
      const stamp = new Date().toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
      })
      // 追加并截断到末尾 4000 字符,防止无限膨胀
      const next = ((prev ? prev + '\n' : '') + `- (${stamp}) ${note}`).slice(-4000)
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { memory: next },
      })
      return `已记入长期记忆:${note}`
    },
  },
  {
    id: 'create_event',
    name: '建日程',
    description: '创建带时间的事件,在频道生成日历卡片',
    tool: {
      type: 'function',
      function: {
        name: 'create_event',
        description:
          '创建一个事件/日程,在当前频道生成一张日历卡片。涉及「约/定/安排某个时间做某事」时调用。先用 current_datetime 确认今天,再把相对时间(如「下周三下午两点」)换算成 ISO 8601。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '事件标题,如「现场勘景」' },
            startsAt: {
              type: 'string',
              description: '开始时间,ISO 8601,如 2026-05-27T14:00:00',
            },
            endsAt: { type: 'string', description: '结束时间(可选),ISO 8601' },
            location: { type: 'string', description: '地点(可选)' },
            description: { type: 'string', description: '备注(可选)' },
          },
          required: ['title', 'startsAt'],
        },
      },
    },
    run: async (args, ctx) => {
      const title = String(args?.title ?? '').trim()
      const startsAt = new Date(String(args?.startsAt ?? ''))
      if (!title) return '需要事件标题'
      if (isNaN(startsAt.getTime()))
        return '开始时间无效,请用 ISO 8601(可先调 current_datetime 确认今天再换算)'
      if (!ctx.channelId) return '无法确定事件所属频道'
      const endsAt = args?.endsAt ? new Date(String(args.endsAt)) : null
      const event = await prisma.event.create({
        data: {
          title,
          startsAt,
          endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt : null,
          location: String(args?.location ?? '').trim() || null,
          description: String(args?.description ?? '').trim() || null,
          channelId: ctx.channelId,
          createdById: ctx.userId ?? null,
        },
      })
      ctx.createdEventId = event.id // 本轮助手回复消息将挂成该事件的日历卡片
      const when = startsAt.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      return `已创建事件「${title}」,时间 ${when}${event.location ? ',地点 ' + event.location : ''}。`
    },
  },
  {
    id: 'read_calendar',
    name: '看日程',
    description: '查看频道里即将到来的事件',
    tool: {
      type: 'function',
      function: {
        name: 'read_calendar',
        description:
          '列出当前频道未来的事件(按时间升序)。回答「有什么安排/日程/下次什么时候」时调用。返回里每条带 [事件id],改事件时用',
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'number', description: '往后看多少天,默认 30' },
          },
        },
      },
    },
    run: async (args, ctx) => {
      if (!ctx.channelId) return '无法确定频道'
      const days = Math.min(Math.max(Number(args?.days) || 30, 1), 365)
      const until = new Date(Date.now() + days * 86400000)
      const events = await prisma.event.findMany({
        where: {
          channelId: ctx.channelId,
          startsAt: { gte: new Date(Date.now() - 3600000), lte: until },
        },
        orderBy: { startsAt: 'asc' },
        take: 30,
      })
      if (!events.length) return `未来 ${days} 天内这个频道没有安排。`
      return events
        .map((e) => {
          const when = e.startsAt.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            dateStyle: 'short',
            timeStyle: 'short',
          })
          return `[${e.id}] ${when} ${e.title}${e.location ? ' @ ' + e.location : ''}`
        })
        .join('\n')
    },
  },
  {
    id: 'update_event',
    name: '改日程',
    description: '修改已有事件(时间/地点/标题/备注)',
    tool: {
      type: 'function',
      function: {
        name: 'update_event',
        description:
          '按事件 id 修改事件(先用 read_calendar 拿到 id)。改时间/地点/标题/备注时调用',
        parameters: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: '事件 id(来自 read_calendar)' },
            title: { type: 'string' },
            startsAt: { type: 'string', description: 'ISO 8601' },
            endsAt: { type: 'string', description: 'ISO 8601' },
            location: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['eventId'],
        },
      },
    },
    run: async (args, ctx) => {
      const id = String(args?.eventId ?? '').trim()
      if (!id) return '需要事件 id(先用 read_calendar 查)'
      const exist = await prisma.event.findUnique({ where: { id } })
      if (!exist) return '找不到该事件'
      if (ctx.channelId && exist.channelId !== ctx.channelId)
        return '该事件不在当前频道'
      const data: Record<string, unknown> = {}
      if (args?.title) data.title = String(args.title).trim()
      if (args?.startsAt) {
        const d = new Date(String(args.startsAt))
        if (!isNaN(d.getTime())) {
          data.startsAt = d
          data.remindedAt = null // 改了时间,重置提醒
        }
      }
      if (args?.endsAt) {
        const d = new Date(String(args.endsAt))
        if (!isNaN(d.getTime())) data.endsAt = d
      }
      if (args?.location !== undefined)
        data.location = String(args.location).trim() || null
      if (args?.description !== undefined)
        data.description = String(args.description).trim() || null
      const ev = await prisma.event.update({ where: { id }, data })
      const when = ev.startsAt.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      return `已更新事件「${ev.title}」,时间 ${when}${ev.location ? ',地点 ' + ev.location : ''}。`
    },
  },
  {
    id: 'run_command',
    name: '执行命令',
    description: '在服务器项目目录执行 shell 命令并返回输出(高危,仅限受信角色)',
    tool: {
      type: 'function',
      function: {
        name: 'run_command',
        description:
          '在服务器的项目根目录执行一条 shell 命令,返回退出码与合并后的 stdout/stderr(已截断)。可用于运行构建/测试/git/查看文件等。命令约 30 秒后超时被终止。',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '要执行的完整 shell 命令,如 `ls -la` 或 `pnpm test`',
            },
            cwd: {
              type: 'string',
              description: '相对项目根的子目录(可选),如 `server`;默认项目根',
            },
          },
          required: ['command'],
        },
      },
    },
    run: async (args, ctx) => {
      const command = String(args?.command ?? '').trim()
      if (!command) return '需要提供要执行的命令'
      const rel = String(args?.cwd ?? '').trim()
      const sb = ctx.exec?.sandbox

      // 危险词硬拦截(两条路径都拦):rm -rf / sudo / shutdown / git push / npm publish / curl|bash 等。
      if (classifyCommand(command) === 'blocked') {
        if (sb)
          await logSandbox(sb.sandboxRunId, {
            type: 'error',
            command,
            content: '硬拦截:命令含高危操作(rm -rf / sudo / shutdown / git push / npm publish 等)',
          })
        return '拒绝执行:命令包含高危操作(rm -rf / sudo / shutdown / git push / npm publish 等),请人工在终端执行'
      }

      // 权限决策:
      //  - 沙盒模式(本机信任沙盒):开发命令(node/pnpm/tsx/python/build/test/git status·diff 等)免审批放行;
      //    仅「非 GET 网络 / 未识别命令」转人工审批门。隔离 workspace 内执行,主项目写入仍只能人工 apply。
      //  - 非沙盒任务执行:沿用低风险只读免审批、其余走审批门。
      //  - 聊天路径(无 ctx.exec):沿用既有边界,不走审批门。
      let autoNote = ''
      if (sb) {
        const sbClass = classifyCommandForSandbox(command)
        if (sbClass === 'needs_approval' && ctx.exec && !ctx.exec.allowRunCommand) {
          await ctx.exec.requestApproval?.('run_command', command)
          return (
            '⛔ 需要人工批准:该命令含非 GET 网络或未识别的命令,在沙盒中也需人工确认。\n' +
            `已为命令「${command.slice(0, 200)}」提交人工审批。请停止本次执行,` +
            '待人类在工作台「人工确认门」批准后,系统会自动续跑并放行该命令。'
          )
        }
        autoNote = ctx.exec?.allowRunCommand ? '' : '[本机信任沙盒 · 开发命令放行]\n'
      } else if (ctx.exec && !ctx.exec.allowRunCommand) {
        const klass = classifyCommand(command)
        if (klass === 'low_risk' && LOW_RISK_AUTO_APPROVE) {
          autoNote = '[低风险只读命令 · 免人工审批放行]\n'
        } else {
          await ctx.exec.requestApproval?.('run_command', command)
          return (
            '⛔ 需要人工批准:在任务执行中运行此 shell 命令属于高危能力。\n' +
            `已为命令「${command.slice(0, 200)}」提交人工审批。请停止本次执行,` +
            '待人类在工作台「人工确认门」批准后,系统会自动续跑并放行该命令。'
          )
        }
      }

      // —— 沙盒模式:cwd 默认为隔离 workspace,命令路径守卫挡越界读/逃逸,落 SandboxLog ——
      if (sb) {
        const guard = guardSandboxCommand(command, sb.workspacePath, rel)
        if (!guard.ok) {
          await logSandbox(sb.sandboxRunId, { type: 'error', command, content: '拒绝:' + guard.reason })
          return `拒绝:${guard.reason}(沙盒只允许在 workspace 内读写)`
        }
        const r = await runInSandbox(command, {
          cwd: guard.cwd,
          timeoutMs: SANDBOX_CMD_TIMEOUT_MS,
          maxBytes: 16 * 1024,
          env: sandboxEnv(),
        })
        await logSandbox(sb.sandboxRunId, {
          type: 'command',
          command,
          cwd: guard.cwd,
          exitCode: r.exitCode,
          durationMs: r.durationMs,
          content: r.stdout,
        })
        const status = r.killed
          ? `超时被终止(>${Math.round(SANDBOX_CMD_TIMEOUT_MS / 1000)}s)`
          : r.errored
            ? '执行出错'
            : `退出码 ${r.exitCode}`
        return `${autoNote}[沙盒 cwd: workspace]\n$ ${command}\n[${status}]\n${r.stdout || '(无输出)'}`
      }
      const lowRiskPass = autoNote.includes('低风险')

      // —— 非沙盒(聊天路径):cwd 限定在项目根内,挡 ../ 逃逸 ——
      let cwd = COMMAND_ROOT
      if (rel) {
        const resolved = pathResolve(COMMAND_ROOT, rel)
        if (resolved !== COMMAND_ROOT && !resolved.startsWith(COMMAND_ROOT + '/'))
          return '拒绝:cwd 超出项目根目录'
        cwd = resolved
      }

      return await new Promise<string>((done) => {
        const child = spawn(command, { shell: true, cwd, env: process.env })
        let out = ''
        const MAX = 8 * 1024 // 输出截断上限(字节)
        const TIMEOUT_MS = 30_000 // 命令最长执行时间
        const append = (buf: Buffer) => {
          if (out.length < MAX) out += buf.toString()
        }
        child.stdout?.on('data', append)
        child.stderr?.on('data', append)
        let killed = false
        const timer = setTimeout(() => {
          killed = true
          child.kill('SIGKILL')
        }, TIMEOUT_MS)
        child.on('error', (e) => {
          clearTimeout(timer)
          done(`执行出错:${e.message}`)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          const body =
            out.length >= MAX ? out.slice(0, MAX) + '\n…(输出已截断)' : out
          const status = killed ? `超时被终止(>${TIMEOUT_MS / 1000}s)` : `退出码 ${code}`
          const note = lowRiskPass ? '[低风险只读命令 · 免人工审批放行]\n' : ''
          done(`${note}$ ${command}\n[${status}]\n${body || '(无输出)'}`)
        })
      })
    },
  },
  {
    id: 'write_file',
    name: '写文件(沙盒)',
    description: '在隔离沙盒工作区内写入/创建文本文件(只写沙盒,经人工批准后才应用到主项目)',
    tool: {
      type: 'function',
      function: {
        name: 'write_file',
        description:
          '在隔离沙盒工作区内写入或创建一个文本文件(用于改代码/写配置)。只能写沙盒,绝不会直接落到主项目;变更会进入 diff,需人工在报告里「批准应用」后才写回主项目。仅在任务执行的沙盒运行时可用。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对沙盒工作区根的文件路径,如 server/src/foo.ts 或 notes.md',
            },
            content: { type: 'string', description: '要写入的完整文本内容(覆盖写)' },
          },
          required: ['path', 'content'],
        },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb)
        return '拒绝:write_file 仅在任务执行的沙盒运行时可用(聊天中不提供直接写盘能力)。'
      const rel = String(args?.path ?? '').trim()
      const content = String(args?.content ?? '')
      if (!rel) return '需要文件路径'
      if (content.length > 200_000) return '拒绝:单文件内容过大(>200KB)'
      if (/\.(env|key|pem|p12|pfx|db)$/i.test(rel) || /(^|\/)\.env/i.test(rel))
        return '拒绝:不允许写敏感/数据库文件'
      const target = pathResolve(sb.workspacePath, rel)
      if (target !== sb.workspacePath && !target.startsWith(sb.workspacePath + '/'))
        return '拒绝:路径超出沙盒工作区'
      try {
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content, 'utf8')
        await logSandbox(sb.sandboxRunId, {
          type: 'tool',
          command: `write_file ${rel}`,
          content: `写入 ${content.length} 字符到沙盒:${rel}`,
        })
        return `已写入沙盒文件 ${rel}(${content.length} 字符)。该改动只在沙盒内,需人工批准后才应用到主项目。`
      } catch (e) {
        return '写入失败:' + (e as Error).message
      }
    },
  },
  {
    id: 'browser_open',
    name: '浏览器打开页面',
    description: '用 headless 浏览器打开本地页面(localhost/file),用于验证交付(仅沙盒运行时)',
    tool: {
      type: 'function',
      function: {
        name: 'browser_open',
        description:
          '用本地 headless 浏览器(CDP)打开一个页面,用于验证你交付的 UI。默认只允许 localhost / 127.0.0.1 / file:// 等本地地址;' +
          '访问外站需人工批准。打开后可用 browser_screenshot 截图、browser_console 读控制台、browser_click/browser_type 交互。仅任务执行的沙盒运行时可用。',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要打开的地址,如 http://localhost:5173 或 file:///path' },
          },
          required: ['url'],
        },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb) return '拒绝:浏览器控制仅在任务执行的沙盒运行时可用(聊天中不提供)。'
      let url = String(args?.url ?? '').trim()
      if (!url) return '需要 url'
      // 模型常省略协议(localhost:5173)→ 默认补 http://,便于命中本地放行
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url
      // 外站需人工批准(本地地址直接放行)
      if (!isLocalUrl(url) && ctx.exec && !ctx.exec.allowRunCommand) {
        await ctx.exec.requestApproval?.('browser_control', `browser_open ${url}`)
        return (
          '⛔ 需要人工批准:打开非本地地址(外站)属高危浏览器动作。\n' +
          `已为「打开 ${url.slice(0, 200)}」提交人工审批。本地地址(localhost/127.0.0.1/file://)无需审批。`
        )
      }
      const r = await browserOpen(url)
      await logSandbox(sb.sandboxRunId, {
        type: 'browser',
        command: `browser_open ${url}`,
        content: r.ok ? `已打开:${r.title || '(无标题)'}` : `打开失败:${r.error}`,
      })
      return r.ok
        ? `已用本地浏览器打开 ${url}(标题:${r.title || '无'})。可继续 browser_screenshot / browser_console / browser_click。`
        : `打开失败:${r.error}`
    },
  },
  {
    id: 'browser_screenshot',
    name: '浏览器截图',
    description: '对当前浏览器页面截图并存为 artifact(仅沙盒运行时)',
    tool: {
      type: 'function',
      function: {
        name: 'browser_screenshot',
        description:
          '对当前浏览器页面截一张图,保存为 artifact(可在执行报告里查看)。先用 browser_open 打开页面。仅沙盒运行时可用。',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '截图说明(可选),如「首页加载后」' },
          },
        },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb) return '拒绝:浏览器控制仅在任务执行的沙盒运行时可用。'
      const label = String(args?.label ?? '').trim() || '页面截图'
      const r = await browserScreenshot(label)
      if (!r.ok) {
        await logSandbox(sb.sandboxRunId, { type: 'browser', command: 'browser_screenshot', content: '截图失败:' + r.error })
        return '截图失败:' + r.error
      }
      await logSandbox(sb.sandboxRunId, {
        type: 'browser',
        command: 'browser_screenshot',
        content: `截图已保存:${r.url}(${r.bytes} 字节)— ${label}`,
      })
      try {
        await prisma.sandboxArtifact.create({
          data: { sandboxRunId: sb.sandboxRunId, kind: 'screenshot', path: r.url, summary: label, sizeBytes: r.bytes ?? null },
        })
      } catch {
        /* 记录失败不影响截图结果 */
      }
      return `已截图并存为 artifact:${r.url}(${label})。可在执行报告的「浏览器截图」中查看。`
    },
  },
  {
    id: 'browser_console',
    name: '浏览器控制台',
    description: '读取当前浏览器页面的 console 与错误(仅沙盒运行时)',
    tool: {
      type: 'function',
      function: {
        name: 'browser_console',
        description:
          '读取当前浏览器页面自打开以来收集的 console 日志与 JS 错误,用于排查页面是否报错。仅沙盒运行时可用。',
        parameters: { type: 'object', properties: {} },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb) return '拒绝:浏览器控制仅在任务执行的沙盒运行时可用。'
      const r = await browserConsole()
      if (!r.ok) return r.error || '读取失败'
      const errs = r.messages.filter((m) => /error|exception|warn/i.test(m.level))
      const body = r.messages.length
        ? r.messages.map((m) => `[${m.level}] ${m.text}`).join('\n').slice(0, 3000)
        : '(无 console 输出)'
      await logSandbox(sb.sandboxRunId, {
        type: 'browser',
        command: 'browser_console',
        content: `console ${r.messages.length} 条,其中错误/警告 ${errs.length} 条`,
      })
      return `页面 console(${r.messages.length} 条,错误/警告 ${errs.length} 条):\n${body}`
    },
  },
  {
    id: 'browser_click',
    name: '浏览器点击',
    description: '点击当前页面的元素(CSS 选择器或可见文本,仅沙盒运行时)',
    tool: {
      type: 'function',
      function: {
        name: 'browser_click',
        description:
          '点击当前浏览器页面里的一个元素:可给 selector(CSS 选择器)或 text(按可见文本匹配)。用于验证交互。仅沙盒运行时可用。',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS 选择器,如 button.primary 或 #submit' },
            text: { type: 'string', description: '按钮/链接的可见文本(无 selector 时用)' },
          },
        },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb) return '拒绝:浏览器控制仅在任务执行的沙盒运行时可用。'
      const selector = String(args?.selector ?? '').trim() || undefined
      const text = String(args?.text ?? '').trim() || undefined
      if (!selector && !text) return '需要 selector 或 text'
      const r = await browserClick({ selector, text })
      await logSandbox(sb.sandboxRunId, {
        type: 'browser',
        command: `browser_click ${selector ?? `text=${text}`}`,
        content: r.ok ? (r.matched ? '已点击' : '未找到匹配元素') : '点击失败:' + r.error,
      })
      return r.ok ? (r.matched ? '已点击该元素。' : '未找到匹配的元素(可先 browser_screenshot 看页面)。') : '点击失败:' + r.error
    },
  },
  {
    id: 'browser_type',
    name: '浏览器输入',
    description: '向当前页面的输入框输入文本(仅沙盒运行时;外站输入密钥需人工)',
    tool: {
      type: 'function',
      function: {
        name: 'browser_type',
        description:
          '向当前浏览器页面的输入框输入文本:给 selector(CSS 选择器)与 text。用于本地表单验证。' +
          '在外站登录/输入密钥/支付场景必须由人类操作,不要用本工具填敏感凭据。仅沙盒运行时可用。',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: '输入框的 CSS 选择器,如 input[name=q]' },
            text: { type: 'string', description: '要输入的文本' },
          },
          required: ['selector', 'text'],
        },
      },
    },
    run: async (args, ctx) => {
      const sb = ctx.exec?.sandbox
      if (!sb) return '拒绝:浏览器控制仅在任务执行的沙盒运行时可用。'
      const selector = String(args?.selector ?? '').trim()
      const text = String(args?.text ?? '')
      if (!selector) return '需要 selector'
      const r = await browserType({ selector, text })
      await logSandbox(sb.sandboxRunId, {
        type: 'browser',
        command: `browser_type ${selector}`,
        content: r.ok ? (r.matched ? `已输入 ${text.length} 字符` : '未找到输入框') : '输入失败:' + r.error,
      })
      return r.ok ? (r.matched ? '已在该输入框输入文本。' : '未找到该输入框。') : '输入失败:' + r.error
    },
  },
  {
    id: 'list_dir',
    name: '浏览目录',
    description: '列出本地工作区某目录下的文件和子目录(只读)',
    tool: {
      type: 'function',
      function: {
        name: 'list_dir',
        description:
          '列出本地工作区(kyle-agent)内某个目录下的文件与子目录,用于了解项目结构。path 可相对工作区根或绝对,默认根目录。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '目录路径,如 helio-clone 或 helio-clone/server/src,默认工作区根',
            },
          },
        },
      },
    },
    run: async (args) => {
      const dir = resolveInRoot(String(args?.path ?? '.'))
      if (!dir) return '拒绝:路径超出允许的工作区根目录'
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        const lines = entries
          .filter((e) => !e.name.startsWith('.'))
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()))
          .slice(0, 300)
          .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
        return `目录 ${relToRoot(dir)}/:\n` + (lines.join('\n') || '(空目录)')
      } catch (e) {
        return '读取目录失败:' + (e as Error).message
      }
    },
  },
  {
    id: 'read_file',
    name: '读取文件',
    description: '读取本地工作区某个文本文件的内容(只读)',
    tool: {
      type: 'function',
      function: {
        name: 'read_file',
        description:
          '读取本地工作区(kyle-agent)内某个文本文件的内容,用于查看代码/文档。path 可相对工作区根或绝对。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                '文件路径,如 helio-clone/README.md 或 helio-clone/server/src/index.ts',
            },
          },
          required: ['path'],
        },
      },
    },
    run: async (args) => {
      const file = resolveInRoot(String(args?.path ?? ''))
      if (!file) return '拒绝:路径超出允许的工作区根目录'
      const base = (file.split('/').pop() || '').toLowerCase()
      if (base.startsWith('.') || /\.(env|key|pem|p12|pfx)$/.test(base))
        return '拒绝:敏感文件不可读'
      if (
        /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|mp4|mov|woff2?|ttf|otf|node|lock)$/.test(
          base,
        )
      )
        return '这是二进制/非文本文件,无法以文本读取'
      try {
        const buf = await readFile(file, 'utf8')
        const MAX = 30_000
        const body =
          buf.length > MAX ? buf.slice(0, MAX) + '\n…(文件过长,已截断)' : buf
        return `文件 ${relToRoot(file)}(${buf.length} 字符):\n\n` + body
      } catch (e) {
        return '读取文件失败:' + (e as Error).message
      }
    },
  },
]

const BY_ID = new Map(LIST.map((s) => [s.id, s]))
const BY_FN = new Map(LIST.map((s) => [s.tool.function.name, s]))

// 给前端的技能目录(不含 schema/handler)
export function skillCatalog() {
  return LIST.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }))
}

// 只读文件能力(list_dir/read_file)对所有对话助手默认开放(在 ai.ts 注入),无需逐个勾选
export const GLOBAL_SKILL_IDS = ['list_dir', 'read_file']

// 由助手勾选的技能 id 生成 tools 数组
export function toolsFor(ids: string[]): ToolSchema[] {
  return ids.map((id) => BY_ID.get(id)?.tool).filter((t): t is ToolSchema => !!t)
}

export async function runTool(
  fnName: string,
  args: any,
  ctx: SkillCtx,
): Promise<string> {
  const skill = BY_FN.get(fnName)
  if (!skill) return `未知工具:${fnName}`
  let result: string
  try {
    result = await skill.run(args, ctx)
  } catch (e) {
    result = `工具执行出错:${(e as Error).message}`
  }
  // 通知执行运行时:把这次工具调用(名称/参数/结果)关联到任务并写审计
  try {
    ctx.onTool?.({ name: fnName, args, result })
  } catch {
    /* 回调失败不影响工具结果 */
  }
  return result
}
