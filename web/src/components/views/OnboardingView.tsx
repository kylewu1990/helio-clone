import { useState } from 'react'
import {
  Sparkles,
  Network,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react'

// K4 OnboardingView — 4 张卡介绍主要概念,末张"开始使用"跳主页。
// 静态内容,无 API 依赖;后端任何 Channel/Assistant 不需要预先存在。
type Step = {
  title: string
  subtitle: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'Heliox 是什么',
    subtitle: '本地优先的 AI 公司指挥中心',
    body: (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FeatureCard
          icon={<LayoutGrid size={16} />}
          title="项目频道"
          desc="所有正式协作在此发生 — 老板与 AI 在同一上下文里推进目标。"
        />
        <FeatureCard
          icon={<Network size={16} />}
          title="Algorithm Graph"
          desc="把 task / agent / delivery 织成有向图,Optimizer 据此找瓶颈、给建议。"
        />
        <FeatureCard
          icon={<Sparkles size={16} />}
          title="Optimizer"
          desc="每条建议都带 #optimize tag,老板可一键执行 / 归档 / 询问 Why。"
        />
      </div>
    ),
  },
  {
    title: '派工的两种方式',
    subtitle: '主页 composer · 项目频道 @AI',
    body: (
      <ul className="flex flex-col gap-3 text-[13px] text-[var(--ink-2)]">
        <li className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-3">
          <span className="font-medium text-[var(--ink)]">A · 主页 Composer</span>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            在主页搜索框直接写一句"帮我做 X" → 选择落到哪个项目频道。适合临时性、跨项目的小任务。
          </p>
        </li>
        <li className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-3">
          <span className="font-medium text-[var(--ink)]">B · 项目频道 @AI</span>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            进 #某项目,在 composer 里 @某个 AI(例如 <code>@aria 把 button 的圆角统一 8px</code>)→ 该 AI 接,产物落沙盒 + Delivery。
          </p>
        </li>
        <li className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-3">
          <span className="font-medium text-[var(--ink)]">C · 12 模板卡</span>
          <p className="mt-1 text-[12px] text-[var(--ink-3)]">
            主页中段有 12 张能力模板("写 PPT" / "跑 SQL" / "网页 demo"…),点 → 选频道 → 真派工(走真 skills,不走 mock)。
          </p>
        </li>
      </ul>
    ),
  },
  {
    title: 'AI 团队',
    subtitle: '12 个 AI 各司其职,@ 谁谁来',
    body: (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {[
          ['Aria', '设计师 AI', '#fbbf24'],
          ['Cypher', '工程师 AI', '#22d3ee'],
          ['Foster', '产品 AI', '#a78bfa'],
          ['Marlow', '研究 AI', '#34d399'],
          ['Atlas', '运维 AI', '#fb7185'],
          ['Lex', '内容 AI', '#60a5fa'],
          ['Mast', '财务 AI', '#f97316'],
          ['Ikon', '视觉 AI', '#94a3b8'],
        ].map(([name, role, color]) => (
          <div
            key={name}
            className="flex items-center gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-2.5"
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold text-white"
              style={{ background: color }}
            >
              {name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--ink)]">{name}</div>
              <div className="truncate text-[10.5px] text-[var(--mute)]">{role}</div>
            </div>
          </div>
        ))}
        <div className="col-span-2 rounded-md border border-dashed border-[var(--line-soft)] bg-transparent p-2.5 text-[11px] text-[var(--mute)] md:col-span-3">
          点 AI 名字进 <code>/agent/:id</code> 资料页,看角色 / 记忆 / 信任 / 当前任务(<b>不能直接对它发消息</b>)。
        </div>
      </div>
    ),
  },
  {
    title: '看效果 · Dock 8 tab',
    subtitle: '项目频道右辅 dock,从交付证据到调试一应俱全',
    body: (
      <ul className="grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
        {[
          ['预览', '可交互 Web 交付 + 截图证据'],
          ['任务', '当前任务 / 状态 / 执行人'],
          ['图', 'Algorithm Graph DAG 视图'],
          ['交付', 'Delivery Center 决策入口'],
          ['记忆', 'AI 在本项目沉淀的要点'],
          ['活动', '本项目活动流'],
          ['编辑', 'Monaco 改沙盒文件 + 提交评审'],
          ['Inspect', 'preview iframe 真 console / error'],
        ].map(([k, v]) => (
          <li
            key={k}
            className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-2.5"
          >
            <div className="font-medium text-[var(--ink)]">{k}</div>
            <div className="mt-0.5 text-[10.5px] text-[var(--ink-3)]">{v}</div>
          </li>
        ))}
      </ul>
    ),
  },
]

export function OnboardingView({ onFinish }: { onFinish?: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const isLast = i === STEPS.length - 1

  return (
    <div className="mx-auto h-full w-full max-w-[920px] overflow-y-auto px-10 py-10">
      <div className="mb-2 flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--mute)]">
        <Sparkles size={11} /> Onboarding · {i + 1} / {STEPS.length}
      </div>
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-[var(--ink)]">
        {step.title}
      </h1>
      <p className="mt-1 text-[13px] text-[var(--ink-3)]">{step.subtitle}</p>

      <div className="mt-6 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-2)] p-5">
        {step.body}
      </div>

      {/* 步骤指示器 */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {STEPS.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => setI(k)}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              k === i
                ? 'bg-[var(--accent)]'
                : k < i
                  ? 'bg-[var(--accent)]/40'
                  : 'bg-[var(--line)]'
            }`}
            aria-label={`步骤 ${k + 1}`}
          />
        ))}
      </div>

      {/* 行动按钮 */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          disabled={i === 0}
          onClick={() => setI((k) => Math.max(0, k - 1))}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--line-soft)] px-3 py-1.5 text-[12px] text-[var(--ink-2)] hover:bg-[var(--glass)] disabled:opacity-40"
        >
          <ChevronLeft size={13} /> 上一步
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={() => setI((k) => Math.min(STEPS.length - 1, k + 1))}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            下一步 <ChevronRight size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinish}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            <CheckCircle2 size={13} /> 开始使用
          </button>
        )}
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--glass-2)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--accent)]">
        {icon}
        <span className="text-[12px] font-medium text-[var(--ink)]">{title}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-[var(--ink-3)]">{desc}</p>
    </div>
  )
}

