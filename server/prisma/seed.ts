import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USERS = [
  { handle: 'kyle', name: 'Kyle', avatarColor: 5, status: '造同款 Helio' },
  { handle: 'amy', name: 'Amy Chen', avatarColor: 1, status: '设计中' },
  { handle: 'leo', name: 'Leo Wang', avatarColor: 4, status: '' },
  { handle: 'mia', name: 'Mia Zhang', avatarColor: 6, status: 'PM' },
  { handle: 'sam', name: 'Sam Liu', avatarColor: 8, status: '后端' },
]

const CHANNELS = [
  { name: 'general', topic: '全员公告与日常' },
  { name: 'engineering', topic: '工程讨论' },
  { name: 'design', topic: '设计评审' },
  { name: 'random', topic: '摸鱼水群' },
]

const SEED_MESSAGES: Record<string, [string, string][]> = {
  general: [
    ['kyle', '欢迎来到我们内部自建的 Helio 同款 👋'],
    ['mia', '界面跟原版一个味道,橙色 accent 很顶'],
    ['amy', '字体也是 Geist,细节到位'],
    ['kyle', '没有登录,选个身份就能用,完全内部跑'],
  ],
  engineering: [
    ['sam', '后端用 Fastify + Prisma,实时走 WebSocket'],
    ['leo', 'SQLite 起步,要扩就切 Postgres,一行配置'],
    ['sam', '消息只推给频道成员,私信不外泄'],
  ],
  design: [['amy', '配色用的是 OKLCH 暖色纸感,light/dark 双主题都还原了']],
  random: [['mia', '午饭吃啥 🍜'], ['leo', '+1']],
}

async function main() {
  // 幂等:库里已有数据就跳过,绝不清空(避免误删用户建的助手等)。
  // 真要从零重置请显式跑 `pnpm db:reset`(会 --force-reset 后重新 seed)。
  const existing = await prisma.user.count()
  if (existing > 0) {
    console.log(`已有 ${existing} 个用户,跳过 seed(要从零重置用 pnpm db:reset)`)
    return
  }

  const users = await Promise.all(
    USERS.map((u) => prisma.user.create({ data: u })),
  )
  const byHandle = Object.fromEntries(users.map((u) => [u.handle, u]))

  for (const ch of CHANNELS) {
    const channel = await prisma.channel.create({
      data: {
        name: ch.name,
        topic: ch.topic,
        isDM: false,
        members: { create: users.map((u) => ({ userId: u.id })) },
      },
    })
    const msgs = SEED_MESSAGES[ch.name] ?? []
    let t = Date.now() - msgs.length * 60_000
    for (const [handle, body] of msgs) {
      await prisma.message.create({
        data: {
          channelId: channel.id,
          authorId: byHandle[handle].id,
          body,
          createdAt: new Date(t),
        },
      })
      t += 60_000
    }
  }

  // 一个示例私信:kyle <-> amy
  const dm = await prisma.channel.create({
    data: {
      name: '',
      isDM: true,
      members: {
        create: [
          { userId: byHandle.kyle.id },
          { userId: byHandle.amy.id },
        ],
      },
    },
  })
  await prisma.message.create({
    data: {
      channelId: dm.id,
      authorId: byHandle.amy.id,
      body: '侧栏的未读小圆点也做了吗?',
    },
  })
  await prisma.message.create({
    data: {
      channelId: dm.id,
      authorId: byHandle.kyle.id,
      body: '做了,跟 Helio 的 lastSeen 一个逻辑',
    },
  })

  console.log(
    `seeded: ${users.length} 用户, ${CHANNELS.length} 频道, 1 私信。默认身份 handle=kyle`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
