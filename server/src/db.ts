// Prisma 6.19 在 pnpm + tsc Bundler resolution 下,顶层 `@prisma/client` 的命名导出
// 会走 default.d.ts(转 .prisma/client/default 间接导出),tsc 解析不到 PrismaClient。
// 改走默认导入并解构;运行时 default 导出包含 PrismaClient 类。
import pkg from '@prisma/client'

const PrismaClient = (pkg as unknown as { PrismaClient: new () => any }).PrismaClient
export const prisma = new PrismaClient()
