/* 聊天里的工具调用 → 人话动作。
   要求(#4):不要只显示工具名,归纳成「读取上下文 / 写入文件 / 运行命令 / 打开网页 / 生成截图 / 等待确认」。
   原始工具名作为次级信息(title / Debug)保留。纯函数。 */

const CHAT_TOOL_VERB: Record<string, string> = {
  list_dir: '读取上下文',
  read_file: '读取上下文',
  grep: '检索代码',
  find: '查找文件',
  glob: '匹配文件',
  search: '检索资料',
  search_messages: '搜索消息',
  list_channels: '查看频道',
  fetch_url: '联网检索',
  web_search: '联网检索',
  current_datetime: '获取时间',
  calculator: '计算',
  write_file: '写入文件',
  edit_file: '修改文件',
  apply_patch: '修改文件',
  create_file: '写入文件',
  str_replace: '修改文件',
  run_command: '运行命令',
  create_task: '拆分子任务',
  update_task: '更新任务',
  remember: '记入记忆',
  create_event: '创建日程',
  read_calendar: '查看日程',
  update_event: '更新日程',
  generate_image: '生成图片',
  browser_open: '打开网页',
  browser_navigate: '打开网页',
  browser_click: '操作网页',
  browser_type: '操作网页',
  browser_screenshot: '生成截图',
  browser_console: '读取控制台',
}

export function chatToolVerb(tool: string): string {
  return CHAT_TOOL_VERB[tool] ?? tool.replace(/_/g, ' ')
}

export interface ChatToolGroup {
  verb: string
  count: number
  raw: string[]
}

// 把一条消息用到的工具,按人话动作归并(去重计数),原始名留在 raw。
export function summarizeChatTools(tools: string[]): ChatToolGroup[] {
  const map = new Map<string, { count: number; raw: Set<string> }>()
  for (const t of tools) {
    const verb = chatToolVerb(t)
    const cur = map.get(verb) ?? { count: 0, raw: new Set<string>() }
    cur.count += 1
    cur.raw.add(t)
    map.set(verb, cur)
  }
  return [...map.entries()].map(([verb, { count, raw }]) => ({
    verb,
    count,
    raw: [...raw],
  }))
}
