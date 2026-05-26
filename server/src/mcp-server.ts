// Phase J/N9:Heliox MCP 服务器(5374 端口,@modelcontextprotocol/sdk MIT)
// Inspired by Open Design `mcp-server.ts` (Apache 2.0) + 官方 MCP SDK 示例(MIT),
// see /THIRD_PARTY_LICENSES.md。
//
// 5 个 tool:
//   - create_project_channel(name, goal)
//   - dispatch_task(channelId, prompt)
//   - get_delivery(deliveryId)
//   - list_channels()
//   - read_memory(agentId, channelId, level)
//
// 启动:由 server/src/index.ts 在 PORT_MCP=5374 上拉起;HELIO_NO_MCP=1 可关闭。

import { createServer as createHttpServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { prisma } from './db.js'

const MCP_PORT = Number(process.env.PORT_MCP || 5374)

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'heliox-clone',
    version: '0.1.0',
  })

  server.registerTool(
    'list_channels',
    {
      description: '列出所有未归档的项目频道,返回 id / name / phase / goal',
      inputSchema: {},
    },
    async () => {
      const rows = await prisma.channel.findMany({
        where: { kind: 'project', archivedAt: null },
        select: { id: true, name: true, phase: true, goal: true, ownerId: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
      }
    },
  )

  server.registerTool(
    'create_project_channel',
    {
      description: '新建一个项目频道(kind=project),返回新频道 id',
      inputSchema: {
        name: z.string().describe('频道名(英文短词,如 pixel-2)'),
        goal: z.string().describe('项目目标 — 一句话说清楚要做啥'),
        ownerId: z.string().optional().describe('owner 用户 id(可选)'),
      },
    },
    async ({ name, goal, ownerId }) => {
      const ch = await prisma.channel.create({
        data: {
          name,
          goal,
          kind: 'project',
          phase: 'discovery',
          ownerId: ownerId ?? null,
        },
        select: { id: true, name: true, phase: true, goal: true },
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(ch, null, 2) }],
      }
    },
  )

  server.registerTool(
    'dispatch_task',
    {
      description: '把一段 prompt 派工到指定项目频道(创建一条普通 Message,触发 AI 自动应答)',
      inputSchema: {
        channelId: z.string(),
        prompt: z.string(),
        authorId: z.string().optional().describe('发言人 id;默认取频道第一个真人成员'),
      },
    },
    async ({ channelId, prompt, authorId }) => {
      let aid = authorId
      if (!aid) {
        const member = await prisma.channelMember.findFirst({
          where: { channelId, user: { isAssistant: false } },
          select: { userId: true },
        })
        aid = member?.userId
      }
      if (!aid) {
        return {
          content: [{ type: 'text', text: `ERR: 找不到 channelId=${channelId} 的真人发言人` }],
          isError: true,
        }
      }
      const msg = await prisma.message.create({
        data: { channelId, authorId: aid, body: prompt },
        select: { id: true, channelId: true, body: true, createdAt: true },
      })
      return {
        content: [{ type: 'text', text: JSON.stringify(msg, null, 2) }],
      }
    },
  )

  server.registerTool(
    'get_delivery',
    {
      description: '按 id 拉一条 Delivery(包含 artifactJson / status / testResult)',
      inputSchema: {
        deliveryId: z.string(),
      },
    },
    async ({ deliveryId }) => {
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId } })
      if (!d) {
        return {
          content: [{ type: 'text', text: `ERR: delivery ${deliveryId} not found` }],
          isError: true,
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(d, null, 2) }],
      }
    },
  )

  server.registerTool(
    'read_memory',
    {
      description: 'AI 助手在某频道里的层级记忆(L2=项目摘要 / L3=滚动情节)。L1 = 人格不在本表。',
      inputSchema: {
        agentId: z.string(),
        channelId: z.string().optional(),
        level: z.union([z.literal(2), z.literal(3)]).optional().default(3 as const),
      },
    },
    async ({ agentId, channelId, level }) => {
      const row = await prisma.memory.findFirst({
        where: {
          agentId,
          level: level ?? 3,
          ...(channelId ? { channelId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      })
      if (!row) {
        return {
          content: [
            {
              type: 'text',
              text: `(空)${agentId} 在 ${channelId ?? '(无频道)'}/L${level ?? 3} 还没有记忆`,
            },
          ],
        }
      }
      return {
        content: [{ type: 'text', text: row.content }],
      }
    },
  )

  return server
}

export async function startMcpHttpServer(): Promise<{ close: () => Promise<void> }> {
  // 简化 stateless 模式:每个请求新建 transport;5 tool 调用不需要长连接会话
  const httpServer = createHttpServer(async (req, res) => {
    // CORS / OPTIONS 优雅处理(本地开发)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.url === '/healthz') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, name: 'heliox-clone-mcp', tools: 5 }))
      return
    }
    try {
      const server = buildMcpServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      // 收集 body(stateless 无需 session,直接转发)
      let body: any = undefined
      if (req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const text = Buffer.concat(chunks).toString('utf8')
        try { body = text ? JSON.parse(text) : undefined } catch { body = undefined }
      }
      await server.connect(transport)
      await transport.handleRequest(req as any, res as any, body)
      res.on('close', () => {
        transport.close().catch(() => {})
        server.close().catch(() => {})
      })
    } catch (e) {
      try {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: (e as Error).message }))
      } catch { /* ignore */ }
    }
  })
  await new Promise<void>((resolve) => httpServer.listen(MCP_PORT, '127.0.0.1', resolve))
  console.log(`[helio-clone] mcp on http://127.0.0.1:${MCP_PORT}`)
  return {
    close: () =>
      new Promise((resolve) => httpServer.close(() => resolve())),
  }
}
