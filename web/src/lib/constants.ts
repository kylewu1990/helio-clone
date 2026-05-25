// 集中管理:跨组件复用、或与后端约定强耦合的常量,避免分散漂移。

// 反应表情面板(MessageRow)
export const EMOJI = (
  '👍 👎 ❤️ 🔥 🎉 👀 ✅ 🙏 😂 😅 😍 🤔 😎 😭 😡 🥳 ' +
  '👏 🙌 💪 🤝 🫶 💯 ✨ ⭐ 🚀 💡 ⚡ 🎯 ✔️ ❌ ❓ ❗ ' +
  '😀 😁 😄 😉 😊 🙂 😋 🤩 😴 🤯 🥺 😤 🤓 🫡 🤗 🤪 ' +
  '🍜 🍕 🍺 ☕ 🎂 🍰 🐶 🐱 🌟 🌈 ☀️ 🌧️ 💰 📈 📌 🏆'
).split(' ')

// 技能 id → 中文标签(与后端 skills.ts 的 skill id 强耦合,集中防漂移)
export const SKILL_LABELS: Record<string, string> = {
  current_datetime: '当前时间',
  search_messages: '搜索消息',
  list_channels: '列出频道',
  calculator: '计算器',
  create_task: '建任务',
  fetch_url: '读网页',
  generate_image: '生成图片',
  remember: '记笔记',
  create_event: '建日程',
  read_calendar: '看日程',
  update_event: '改日程',
  run_command: '执行命令',
  list_dir: '浏览目录',
  read_file: '读取文件',
}

// 预设职业模板档位标签
export const TIER_LABEL: Record<string, string> = {
  pro: '最强',
  balanced: '均衡',
  fast: '快省',
}

// 已知供应商(都走 OpenAI 兼容协议),选了自动带 baseURL
export const KNOWN = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'kimi', label: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
  { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'] },
  { id: 'dashscope', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max'] },
  { id: 'ollama', label: '本地 Ollama', baseUrl: 'http://localhost:11434/v1', models: ['llama3.1', 'qwen2.5'] },
  { id: 'custom', label: '自定义…', baseUrl: '', models: [] },
]
