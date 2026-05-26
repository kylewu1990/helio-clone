// D3:主页"常用工作"12 项模板真存,不是组件 inline mock。
// 对齐 docs/ai/reference/v4-opendesign-screens/01-home.png。
// 字段最小化:每张卡片需要的图标 / 标题 / 副文 / 协作者(头像 chip)/ 耗时。
// 注:这里只是首页展示用;真正的执行链路在 server/src/templates.ts(QUICK_TEMPLATES)。

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
  },
]
