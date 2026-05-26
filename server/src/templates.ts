// 快速任务模板 —— Heliox 自己的「模板 → 执行链路」语言。
// 每个模板是一段可控的工作流:目标、默认模式、步骤、每步所需能力 + 角色偏好、
// 是否写文件/跑命令/开浏览器/需人工确认、交付物、失败与缺信息处理、交付位置。
//
// 设计要点:
// - 步骤 requiredAny:满足任一技能即可胜任该步(空=无特殊能力要求,任何可用助手都能跑)。
// - prefer:角色偏好。代码步骤偏好「工程师」、测试/截图偏好「浏览器能力」、PRD/调研偏好「产品/研究/文案」。
//   解析执行人时,代码/测试步骤会给「产品/项目经理」降权——产品经理不该默认写代码/跑测试。
// - 不复制任何第三方 UI/文案/源码;这是 Heliox 自有的模板词汇。

export type StepPrefer = 'engineer' | 'browser' | 'research' | 'writer' | 'pm' | 'any'

export type TemplateStep = {
  title: string
  detail: string
  requiredAny: string[] // 满足任一技能即可胜任
  prefer: StepPrefer
  tool?: string // 主要能力(人话,展示用)
  writesFiles?: boolean
  runsCommands?: boolean
  opensBrowser?: boolean
  needsApproval?: boolean
  deliverable?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
}

export type TemplateMissingInfo = {
  field: string
  question: string
  reason: string
  defaultValue: string
  options: { label: string; value: string; hint?: string }[]
  recommended: number
}

export type QuickTemplate = {
  id: string
  title: string
  subtitle: string
  icon: string // lucide 图标名(前端解析)
  category: string
  goalTemplate: string // 含 [槽位] 的目标模板
  defaultMode: 'auto' | 'confirm' | 'plan'
  steps: TemplateStep[]
  failureHandling: string // 失败/缺信息时怎么办(展示给用户)
  deliveryLocation: string // 最终交付落在哪
  missingInfo?: TemplateMissingInfo // 执行前可能需要补的关键信息(如查天气缺城市)
}

const BROWSER_ANY = ['browser_open', 'browser_screenshot', 'browser_console', 'browser_click', 'browser_type']

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'write-prd',
    title: '写产品需求文档',
    subtitle: '结构化 PRD · 目标到验收',
    icon: 'FileText',
    category: '产品',
    goalTemplate: '为 [产品 / 功能] 写一份结构化 PRD,包含目标、目标用户、范围、关键流程、指标与验收标准',
    defaultMode: 'auto',
    failureHandling: '若产品定位不清,会创建一个「需要你补充」的结构化提问(给推荐默认 + 可按 MVP 假设继续),不会假装写完。',
    deliveryLocation: '交付沉淀在执行频道的 Delivery 面板;PRD 正文随 AI 汇报与沙盒文件可见。',
    steps: [
      {
        title: '明确目标、范围与目标用户',
        detail: '把模糊需求拆成可写的产品问题:要解决谁的什么问题、边界在哪。',
        requiredAny: [],
        prefer: 'pm',
        tool: '理解需求',
        deliverable: '一句话产品定义 + 范围清单',
        priority: 'high',
      },
      {
        title: '撰写 PRD 正文',
        detail: '产出结构化 PRD:背景、目标、用户、范围、关键流程、指标、验收标准。',
        requiredAny: [],
        prefer: 'pm',
        tool: '写作',
        writesFiles: true,
        deliverable: '一份可评审的 PRD',
        priority: 'high',
      },
      {
        title: '自检验收标准与风险',
        detail: '回读 PRD,列出验收清单与已知风险/待确认项。',
        requiredAny: [],
        prefer: 'pm',
        tool: '复核',
        deliverable: '验收清单 + 风险列表',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'web-research',
    title: '联网调研主题',
    subtitle: '真实来源 · 要点 + 结论',
    icon: 'Globe',
    category: '研究',
    goalTemplate: '联网调研「[主题]」,输出关键要点摘要、结论,并附上可追溯的信息来源链接',
    defaultMode: 'auto',
    failureHandling: '若联网失败,如实报告失败原因,不编造资料;关键事实不足时创建结构化补充提问。',
    deliveryLocation: '调研结论与来源链接沉淀在执行频道 Delivery 面板。',
    steps: [
      {
        title: '拆解调研问题',
        detail: '把主题拆成 3-5 个可检索的子问题。',
        requiredAny: [],
        prefer: 'research',
        tool: '理解需求',
        deliverable: '调研问题清单',
        priority: 'high',
      },
      {
        title: '联网检索真实来源',
        detail: '用 fetch_url 抓取公开网页获取真实信息,不凭空作答。',
        requiredAny: ['fetch_url', 'run_command'],
        prefer: 'research',
        tool: '联网检索',
        deliverable: '原始资料 + 来源链接',
        priority: 'high',
      },
      {
        title: '汇总要点与结论',
        detail: '提炼关键要点、给出结论,逐条标注来源。',
        requiredAny: [],
        prefer: 'research',
        tool: '写作',
        deliverable: '要点摘要 + 结论 + 来源',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'build-feature',
    title: '实现并验证功能',
    subtitle: '写代码 · 跑构建/测试',
    icon: 'Code2',
    category: '工程',
    goalTemplate: '在本项目沙盒里实现 [功能],写好代码并运行构建 / 测试验证可用',
    defaultMode: 'confirm',
    failureHandling: '在隔离沙盒里执行;构建/测试失败会如实记录退出码与日志,可点「继续执行」修复后再验。写回主项目需人工 apply。',
    deliveryLocation: '改动落在隔离沙盒(可查 diff / build·test),人工批准后才 apply 到主项目;交付在 Delivery 面板。',
    steps: [
      {
        title: '读取相关上下文',
        detail: '查看项目结构与相关文件,确认改动点。',
        requiredAny: ['run_command'],
        prefer: 'engineer',
        tool: '读取上下文',
        runsCommands: true,
        deliverable: '改动点定位',
        priority: 'high',
      },
      {
        title: '实现功能(写代码)',
        detail: '在沙盒里写入/修改代码实现功能。',
        requiredAny: ['write_file', 'run_command'],
        prefer: 'engineer',
        tool: '写入文件',
        writesFiles: true,
        runsCommands: true,
        deliverable: '可运行的代码改动',
        priority: 'high',
      },
      {
        title: '运行构建 / 测试验证',
        detail: '跑 build / test 确认可用,失败则定位修复。',
        requiredAny: ['run_command'],
        prefer: 'engineer',
        tool: '运行验证',
        runsCommands: true,
        deliverable: 'build/test 结果',
        priority: 'high',
      },
    ],
  },
  {
    id: 'web-screenshot',
    title: '做网页并交互验收',
    subtitle: '可交互预览 · 截图为证据',
    icon: 'MonitorPlay',
    category: '工程',
    goalTemplate: '做一个 [页面 / 小工具 / 小游戏],产出可在工作区内嵌打开、直接交互验收的网页;截图只作为验证证据',
    defaultMode: 'confirm',
    failureHandling: '页面在沙盒里实现;识别 HTML 入口后生成可交互 Web 预览(主交付),再用浏览器打开本地页面截图存证。若无具备浏览器能力的助手,会提示去 Settings 配置。',
    deliveryLocation: '主交付 = 可交互 Web 预览,在 Chat Preview / Delivery 面板可内嵌打开、刷新、新窗口体验;截图作为验证证据同列。页面源码在沙盒,人工 apply 后落主项目。',
    steps: [
      {
        title: '实现页面 / 小工具',
        detail: '在沙盒里写出单文件可运行的页面(HTML + 内联 CSS/JS 优先,便于直接内嵌预览)。',
        requiredAny: ['write_file', 'run_command'],
        prefer: 'engineer',
        tool: '写入文件',
        writesFiles: true,
        runsCommands: true,
        deliverable: '可交互页面源码(HTML 入口)',
        priority: 'high',
      },
      {
        title: '本地打开并截图存证',
        detail: '用浏览器打开本地页面、做一两步交互、截图,检查 console 有无报错。',
        requiredAny: BROWSER_ANY,
        prefer: 'browser',
        tool: '打开网页 / 截图',
        runsCommands: true,
        opensBrowser: true,
        deliverable: '页面截图证据 + console 状态',
        priority: 'high',
      },
      {
        title: '交互验收与汇报',
        detail: '对照需求确认页面可交互可用,汇报可交互预览入口在哪、改了哪些文件、验证结果。',
        requiredAny: BROWSER_ANY,
        prefer: 'browser',
        tool: '交互验证',
        opensBrowser: true,
        deliverable: '可交互交付 + 验收结论 + 截图证据',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'weather',
    title: '查实时天气',
    subtitle: '真实数据源 · 不编造',
    icon: 'CloudSun',
    category: '生活',
    goalTemplate: '查询 [城市] 今天的实时天气',
    defaultMode: 'auto',
    failureHandling: '没识别到城市时弹出结构化补充提问(可选推荐城市 / 按默认假设 / 自定义);联网失败如实报告,不编天气。',
    deliveryLocation: '天气结论在 AI 汇报与执行频道可见。',
    missingInfo: {
      field: 'city',
      question: '要查哪个城市的天气?',
      reason: '天气必须用真实数据源按城市查询,没有城市无法获取准确结果。',
      defaultValue: '北京',
      options: [
        { label: '北京', value: '北京', hint: '默认推荐' },
        { label: '上海', value: '上海' },
        { label: 'Tokyo', value: 'Tokyo' },
      ],
      recommended: 0,
    },
    steps: [
      {
        title: '用真实数据源查天气',
        detail: '抓取 wttr.in 等公开数据源获取真实天气,不只看当前时间。',
        requiredAny: ['fetch_url', 'run_command'],
        prefer: 'research',
        tool: '联网检索',
        deliverable: '该城市实时天气',
        priority: 'high',
      },
    ],
  },
]

export function getTemplate(id: string): QuickTemplate | undefined {
  return QUICK_TEMPLATES.find((t) => t.id === id)
}
