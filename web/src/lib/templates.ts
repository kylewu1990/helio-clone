// D3:主页"常用工作"12 项模板真存,不是组件 inline mock。
// 对齐 docs/ai/reference/v4-opendesign-screens/01-home.png。
// J(Phase J/N1):每条加 prefilledPrompt(真派工 prompt)+ defaultExecutor(默认 AI 角色提示)。

import type { LucideIcon } from 'lucide-react'
import {
  Monitor,
  FileText,
  BarChart3,
  Files,
  Image as ImageIcon,
  Mail,
  Users as UsersIcon,
  ListChecks,
  ScrollText,
  Search,
  CalendarDays,
  Sparkles,
} from 'lucide-react'

export type HomeTemplateCard = {
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  collaborators: { initials: string; color: number }[] // 1..12 identity color
  etaMinutes: number
  // J(N1):真派工字段
  prefilledPrompt: string
  defaultExecutor: string
}

export const HOME_TEMPLATES: HomeTemplateCard[] = [
  {
    id: 'ppt',
    title: '制作 PPT / 演示稿',
    subtitle: '把要点和素材丢进来,出一份带可点动效的 keynote。',
    icon: Monitor,
    collaborators: [
      { initials: 'AR', color: 2 },
      { initials: 'FO', color: 10 },
    ],
    etaMinutes: 35,
    prefilledPrompt:
      '做一份 5-8 页 PPT 简报,主题:[填主题]。请给出 outline(每页标题 + 1-3 个 bullet)+ 关键数据 + 配图建议;若已具备 generate_pptx 工具,直接产出 .pptx 文件交付。',
    defaultExecutor: '软件工程师',
  },
  {
    id: 'weekly',
    title: '写工作汇报 / 周报',
    subtitle: '从最近交付 + 指标自动起草,口径按上次汇报。',
    icon: FileText,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'MA', color: 11 },
    ],
    etaMinutes: 8,
    prefilledPrompt:
      '写本周工作汇报。请基于本频道过去 7 天的 Delivery + AuditEvent + Task 状态变化自动起草:① 本周完成;② 进行中;③ 风险与下周计划。语气克制、数字优先,不堆形容词。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'data',
    title: '数据分析报告',
    subtitle: '指标问句 → SQL / DuckDB → 图表 + 论证。',
    icon: BarChart3,
    collaborators: [
      { initials: 'MA', color: 11 },
      { initials: 'AT', color: 7 },
    ],
    etaMinutes: 20,
    prefilledPrompt:
      '把这个数据问题转成 SQL(DuckDB 方言),跑通后给出:① SQL 原文;② 结果表前 10 行;③ 一段论证 + 图表建议。问题:[填问题]。',
    defaultExecutor: '软件工程师',
  },
  {
    id: 'sop',
    title: '文档 / SOP',
    subtitle: '把分散在频道里的决定整理成可对外的一份文档。',
    icon: Files,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'LE', color: 4 },
    ],
    etaMinutes: 12,
    prefilledPrompt:
      '把本频道近 N 条决定(默认 N=20)整理成一份对外文档:背景 → 决策 → 例外情况 → 联系人。Markdown 输出,小标题克制。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'design',
    title: '设计稿 / 海报',
    subtitle: '给 Aria 一个 brief,出 3 个方向的视觉草图。',
    icon: ImageIcon,
    collaborators: [
      { initials: 'AR', color: 2 },
      { initials: 'IK', color: 1 },
    ],
    etaMinutes: 18,
    prefilledPrompt:
      '基于 brief 给我 3 个方向的设计草图概念(每个方向:风格关键词 + 颜色 + 排版 + 一句 mood),并用 generate_image 工具各出一张概念图。brief:[填 brief]。',
    defaultExecutor: '设计师',
  },
  {
    id: 'email',
    title: '客户邮件 / 回复',
    subtitle: '把客户原话粘进来,按品牌口径出回复草稿。',
    icon: Mail,
    collaborators: [
      { initials: 'LE', color: 4 },
      { initials: 'MS', color: 9 },
    ],
    etaMinutes: 5,
    prefilledPrompt:
      '把这段客户原话改成品牌口径回复(中文,克制专业,不卑不亢)。原话:[粘贴]。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'onboard',
    title: '新人 / Agent 入职',
    subtitle: '生成职位卡 + 技能要求 + 第一周节奏。',
    icon: UsersIcon,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'AR', color: 2 },
    ],
    etaMinutes: 10,
    prefilledPrompt:
      '给这个频道做角色规划:列出还需要哪些角色(人或 AI),每个角色给出职责 + 必备技能 + 第一周入职节奏。当前频道目标:[默认读 channel.goal]。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'plan',
    title: '把目标拆成可执行计划',
    subtitle: '给 1 句话目标,出三段式计划 + Owner + 验收。',
    icon: ListChecks,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'TL', color: 4 },
    ],
    etaMinutes: 9,
    prefilledPrompt:
      '把这个目标拆成 5-8 个 task(用 create_task 工具真创建),每个 task 给:title / 默认 assignee / expectedOutput / 优先级。目标:[填目标]。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'sop2',
    title: '从频道日志写汇报',
    subtitle: '抓一段时间窗里的进度卡 / 交付卡,自动起草。',
    icon: ScrollText,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'LE', color: 4 },
    ],
    etaMinutes: 7,
    prefilledPrompt:
      '把本频道近 7 天的进度卡 / 交付卡抓出来,起草一份 README(项目背景 / 当前状态 / 关键链接 / 下一步)。Markdown 输出。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'research',
    title: '主题联网调研',
    subtitle: '抓真实公开网页,给要点 + 结论 + 可追溯来源。',
    icon: Search,
    collaborators: [
      { initials: 'MA', color: 11 },
      { initials: 'MS', color: 9 },
    ],
    etaMinutes: 22,
    prefilledPrompt:
      '跨频道找跟「[关键词]」相关的记忆 / 决定 / 交付。先 search_messages,再合并去重输出。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'calendar',
    title: '排会议 / 同步节奏',
    subtitle: '给参与方 + 议题,挑可用时段、起草 invite。',
    icon: CalendarDays,
    collaborators: [
      { initials: 'FO', color: 10 },
      { initials: 'KY', color: 5 },
    ],
    etaMinutes: 6,
    prefilledPrompt:
      '挑下周可用时段、起草会议邀请。参与方:[填人];议题:[填议题];时长:30 分钟。用 read_calendar / create_event 工具。',
    defaultExecutor: '产品经理',
  },
  {
    id: 'idea',
    title: '把想法变 Demo',
    subtitle: '从 1 句话灵感 → 单文件可运行的小页面 / 小工具。',
    icon: Sparkles,
    collaborators: [
      { initials: 'CY', color: 6 },
      { initials: 'AR', color: 2 },
    ],
    etaMinutes: 15,
    prefilledPrompt:
      '把这个灵感做成一个单文件可运行的小页面(HTML + 内联 CSS/JS),完成后用 browser_open + browser_screenshot 自检。灵感:[填灵感]。',
    defaultExecutor: '软件工程师',
  },
]
