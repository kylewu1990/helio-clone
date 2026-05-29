// Phase T:一次性回填 — 把魔法前缀 '做 PPT:' 的旧任务标成 kind='deck'
// 红队 H3:这是 S3 判定从 title 前缀切到 task.kind 的硬前置,否则老 deck 任务迭代会静默退化为普通 chat。
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const r = await prisma.task.updateMany({
    where: { title: { startsWith: '做 PPT:' }, kind: null },
    data: { kind: 'deck' },
  })
  console.log(`[backfill] Task.kind='deck' 回填 ${r.count} 行`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
