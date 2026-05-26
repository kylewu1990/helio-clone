// V3B H1 单元测试 —— 验证 BUILD_INTENT_RE 词表扩展后对真实口语化建造请求的识别率。
// 跑法:cd server && pnpm exec tsx scripts/test-build-intent.ts
// 期望:正样本 100% true,负样本(评审/疑问/纯讨论)false。

// 复制 H1 词表到此处(不 import server/src 避免触发全量 import 链)。
// 任何 BUILD_INTENT_VERBS / BUILD_TARGET_RE / REVIEW_INTENT_RE 改动必须同步。
const BUILD_INTENT_VERBS = [
  '做', '搭', '搭建', '构建', '建',
  '建一?个', '来一?个', '搞一?个', '弄一?个', '整一?个', '上一?个',
  '试试', '写一?个', '生成', '开发', '创建', '实现',
  '给我做', '帮做', '帮我做', '帮.{0,3}做一?个',
  '见一?个',
  'build', 'create', 'make', 'implement', 'generate', 'develop', 'code', 'coding', 'set\\s+up',
]
const BUILD_INTENT_RE = new RegExp(`(${BUILD_INTENT_VERBS.join('|')})`, 'i')
const BUILD_TARGET_RE = /(网页|页面|网站|主页|web|html|页|组件|component|脚本|script|程序|app|应用|demo|小游戏|游戏|game|表格|图表|landing|计算器|calculator|todo|待办|动画|卡片|表单|form|站|工具|tool|小工具|系统|system|后台|面板|看板|dashboard|admin|chart|widget|site|page)/i
const REVIEW_INTENT_RE = /(review|评审|审查|检查|看一[下看]|看看|复审|过一遍|提意见|质疑|有什么问题|帮.*看)/i

function looksLikeBuildRequest(text: string): boolean {
  if (REVIEW_INTENT_RE.test(text)) return false
  return BUILD_INTENT_RE.test(text) && BUILD_TARGET_RE.test(text)
}

type Case = { text: string; expect: boolean; note?: string }

const CASES: Case[] = [
  // ===== 正样本:CURRENT_GOAL 场景 T 5 条 =====
  { text: '构建网站', expect: true, note: 'T-1' },
  { text: '搭一个 todo 应用', expect: true, note: 'T-2' },
  { text: '弄个 landing page', expect: true, note: 'T-3' },
  { text: '来一个英语学习站', expect: true, note: 'T-4' },
  { text: '给我做一个计算器', expect: true, note: 'T-5' },

  // ===== 正样本:口语扩展 =====
  { text: '搞个表单', expect: true, note: '搞个' },
  { text: '整一个 demo', expect: true, note: '整一个' },
  { text: '试试做个小游戏', expect: true, note: '试试' },
  { text: '上一个 dashboard 看板', expect: true, note: '上一个 + dashboard' },
  { text: '帮我做个 todo', expect: true, note: '帮我做' },
  { text: '帮做个登陆页', expect: true, note: '帮做' },
  { text: '让我们来见一个英语学习网站', expect: true, note: '错字 见→建' },
  { text: '开发一个后台管理系统', expect: true, note: '开发 + 系统' },
  { text: '写个组件', expect: true, note: '写一个 + 组件' },

  // ===== 正样本:英文 =====
  { text: 'build a landing page', expect: true, note: 'EN-1' },
  { text: 'make me a todo app', expect: true, note: 'EN-2' },
  { text: 'can you implement a calculator', expect: true, note: 'EN-3' },
  { text: 'set up a dashboard', expect: true, note: 'EN-4 set up' },

  // ===== 负样本:评审 / 疑问 / 纯讨论 =====
  { text: 'review 这个网站', expect: false, note: 'NEG 评审' },
  { text: '看看这个 todo 页面', expect: false, note: 'NEG 看看' },
  { text: '有什么问题', expect: false, note: 'NEG 疑问无目标' },
  { text: '什么是 todo', expect: false, note: 'NEG 问概念' },
  { text: '今天天气真好', expect: false, note: 'NEG 闲聊' },
  { text: '做下饭吧', expect: false, note: 'NEG 做+非目标' },
  { text: '你能帮我看看代码吗', expect: false, note: 'NEG 帮我看' },
]

let pass = 0
let fail = 0
const failed: Case[] = []

console.log(`\n===== H1 build intent 识别率测试(${CASES.length} 条)=====\n`)
for (const c of CASES) {
  const got = looksLikeBuildRequest(c.text)
  const ok = got === c.expect
  if (ok) pass++
  else {
    fail++
    failed.push(c)
  }
  const tag = ok ? 'PASS' : 'FAIL'
  const label = c.note ? `[${c.note}]` : ''
  console.log(`  ${tag.padEnd(4)} expect=${String(c.expect).padEnd(5)} got=${String(got).padEnd(5)} ${label} "${c.text}"`)
}

const positives = CASES.filter((c) => c.expect)
const positivesPassed = positives.filter((c) => looksLikeBuildRequest(c.text) === true).length
const recall = ((positivesPassed / positives.length) * 100).toFixed(1)

console.log(`\n----- summary -----`)
console.log(`total: ${CASES.length}  pass: ${pass}  fail: ${fail}`)
console.log(`positive recall: ${positivesPassed}/${positives.length} (${recall}%)  — 目标 ≥90%`)

if (fail > 0) {
  console.log(`\n失败项:`)
  for (const c of failed) console.log(`  - "${c.text}" expect=${c.expect} (${c.note ?? ''})`)
  process.exit(1)
}
console.log(`\n全部通过。\n`)
