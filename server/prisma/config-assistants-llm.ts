// Phase T / B 路线:给助理配本地 OpenAI-compatible 端点(127.0.0.1:8317)
// 实测可用 provider:Gemini(claude/gpt 上游无 auth)。不同角色不同模型,验证多模型编排。
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const BASE = 'http://127.0.0.1:8317/v1'
const KEY = 'sk-local-85b2c7907d827fffcb302eedd2088b5a0d5c75528a7f07fd'
const cfg: Array<[string, string]> = [
  ['aria', 'gemini-3-pro-preview'],    // 设计师 → 强模型(visual 主笔)
  ['cypher', 'gemini-2.5-flash'],      // 工程师 → 快模型
  ['foster', 'gemini-2.5-flash'],      // 产品 → 快模型(content)
  ['lex', 'gemini-3-pro-preview'],     // 内容 → 强模型
]
async function main() {
  for (const [handle, model] of cfg) {
    const u = await prisma.user.updateMany({
      where: { handle },
      data: { baseUrl: BASE, apiKey: KEY, model, provider: 'custom' },
    })
    console.log(`${handle} → ${model} (${u.count} 行)`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
