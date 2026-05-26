import { useState } from 'react'
import {
  Loader2,
  Check,
  AlertTriangle,
  Hand,
  Cog,
  PackageCheck,
  ExternalLink,
  FileCode2,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ArrowRight,
  Hammer,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Avatar } from './Avatar'
import { InteractivePreview } from './workspace/InteractivePreview'
import { api } from '../lib/api'
import type {
  ProgressCardData,
  DeliveryCardData,
  OptimizerSuggestionCardData,
} from '../lib/types'

// Channel-First 协作卡片 —— Heliox 自有产品语言。
// AI 作为频道成员把「执行过程(Progress Card)」与「最终交付(Delivery Card)」直接发进消息流,
// 信息分层、深色克制、移动端紧凑;不是文字墙,也不是 Slack bot / 外部 UI 复制。

const PHASE_DOT: Record<string, string> = {
  understand: 'var(--info)',
  context: 'var(--info)',
  write: 'var(--accent)',
  verify: 'var(--warning)',
  deliver: 'var(--success)',
  await: 'var(--warning)',
}

function progressColor(s: ProgressCardData['status']): string {
  if (s === 'error') return 'var(--destructive)'
  if (s === 'await') return 'var(--warning)'
  if (s === 'done') return 'var(--success)'
  return 'var(--info)'
}
function progressLabel(s: ProgressCardData['status']): string {
  return s === 'done' ? '执行完成' : s === 'error' ? '执行出错' : s === 'await' ? '等待你' : '执行中'
}

export function ProgressCard({ card, onOpenCockpit }: { card: ProgressCardData; onOpenCockpit?: () => void }) {
  const [open, setOpen] = useState(false)
  const color = progressColor(card.status)
  const running = card.status === 'running'
  const steps = card.steps ?? []
  const shown = open ? steps : steps.slice(-3)

  return (
    <div
      className="mt-1 max-w-xl overflow-hidden rounded-[var(--radius-lg)] border"
      style={{
        borderColor: `color-mix(in oklch, ${color} 32%, var(--border))`,
        // D2 设计深钻:运行中改用玻璃面 + 轻模糊,凸显「正在活」的状态;终态退回稳态 surface。
        background: running ? 'var(--glass-surface)' : 'var(--surface-2)',
        backdropFilter: running ? 'blur(8px)' : undefined,
      }}
    >
      {/* 顶部状态条 */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${running ? 'agent-pulse-ring' : ''}`}
          style={{ color, background: `color-mix(in oklch, ${color} 16%, transparent)` }}
        >
          {running ? (
            <Loader2 size={12} className="animate-spin" />
          ) : card.status === 'done' ? (
            <Check size={12} />
          ) : card.status === 'error' ? (
            <AlertTriangle size={12} />
          ) : (
            <Hand size={12} />
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color }}>
          <Cog size={12} className={running ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
          {progressLabel(card.status)}
        </span>
        <span
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--text-tertiary)]"
          style={{ background: 'var(--surface-3)' }}
        >
          {card.phaseLabel}
        </span>
      </div>

      <div className="px-3 py-2">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">{card.title}</div>
        {card.note && <div className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">{card.note}</div>}

        {/* 阶段里程碑(紧凑时间线)。
            D9 设计深钻:running 时最后一行加 activity-in 入场动效(translateY -6px → 0 + opacity),
            其他历史步骤静止;终态卡片整体静态,不让 reduced-motion 用户出戏。
            key 用 phase + title,避免相邻同标题相消;新步骤进来时 key 切换 → 重播一次入场。 */}
        {shown.length > 0 && (
          <ol className="mt-2 flex flex-col gap-1">
            {shown.map((s, i) => {
              const dot = s.status === 'error' ? 'var(--destructive)' : (s.phase && PHASE_DOT[s.phase]) || 'var(--text-tertiary)'
              const isNewest = running && i === shown.length - 1
              return (
                <li
                  key={`${s.phase ?? '_'}::${s.title}::${i}`}
                  className={`flex items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)] ${isNewest ? 'activity-in' : ''}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
                  <span className="truncate">{s.title}</span>
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-2 flex items-center gap-3">
          {steps.length > 3 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
              {open ? '收起' : `展开全部 ${steps.length} 步`}
            </button>
          )}
          {onOpenCockpit && (
            <button
              onClick={onOpenCockpit}
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--accent-text)] transition-colors hover:underline"
            >
              查看完整过程 <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      {/* D2 设计深钻:运行中底部 aurora shimmer —— 频道时间线里「AI 正在做事」的核心动效。
          只在 running 出现,终态自然消失;颜色用 accent → info → accent 渐变,克制不抢主轴。 */}
      {running && <div className="aurora-bar h-1 w-full" aria-hidden />}
    </div>
  )
}

const TEST_LABEL: Record<string, { label: string; color: string }> = {
  pass: { label: '构建/测试通过', color: 'var(--success)' },
  fail: { label: '构建/测试失败', color: 'var(--destructive)' },
  skipped: { label: '未跑构建/测试', color: 'var(--text-tertiary)' },
}
const FILE_COLOR: Record<string, string> = {
  added: 'var(--success)',
  modified: 'var(--warning)',
  deleted: 'var(--destructive)',
}
const FILE_LABEL: Record<string, string> = { added: '新增', modified: '修改', deleted: '删除' }

export function DeliveryCard({
  card,
  onOpenDelivery,
  onDecide,
}: {
  card: DeliveryCardData
  onOpenDelivery?: () => void
  // D11:频道内即可完成接受/拒绝(Submit-Review-Merge 启发);未提供时按钮不显示。
  onDecide?: (status: 'approved' | 'rejected') => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  // 频道内审批反馈:点完后按钮变 disabled 标签,无需等待右侧面板状态回流
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null)
  const test = TEST_LABEL[card.testResult] ?? TEST_LABEL.skipped
  const files = card.changedFiles ?? []

  return (
    <div
      // D3 设计深钻:交付卡是「成品高潮」,加 card-lift hover 微浮强化「可点开验收」的可操作感。
      className="card-lift mt-1 max-w-xl overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-1)]"
      style={{ borderColor: 'color-mix(in oklch, var(--accent) 28%, var(--border))' }}
    >
      {/* 头部:surface-glow 让「交付」banner 在频道时间线里有视觉高潮;字号放大,「交付」二字最显眼。
          D10 设计深钻:在「交付」二字后挂贡献者(小头像 + AI 名),
          banner 信息密度:icon → 「交付」 → 头像 → 名 → 验证徽章组,从左至右形成「成果归属」节奏。 */}
      <div className="surface-glow relative flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
        >
          <PackageCheck size={12} />
        </span>
        <span className="text-[13px] font-bold text-[var(--accent-text)]">交付</span>
        {card.authorName && (
          <span className="flex shrink-0 items-center gap-1">
            <Avatar
              user={{
                name: card.authorName,
                avatarColor: card.authorColor ?? 1,
                isAssistant: true,
              }}
              size={18}
            />
            <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
              {card.authorName}
            </span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* 验证状态(诚实):build + 是否 browser 验证 */}
          <Badge color={test.color} icon={<Hammer size={10} />} label={test.label} />
          <Badge
            color={card.verifiedByBrowser ? 'var(--success)' : 'var(--text-tertiary)'}
            icon={card.verifiedByBrowser ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
            label={card.verifiedByBrowser ? '已 browser 验证' : '未经 browser 验证'}
          />
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">{card.title}</div>
        {card.summary && (
          <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">{card.summary}</p>
        )}

        {/* 可交互入口 */}
        {card.previewUrl ? (
          <div className="mt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                <PackageCheck size={13} /> {showPreview ? '收起预览' : '在频道里打开预览'}
              </button>
              <a
                href={card.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)]"
              >
                <ExternalLink size={12} /> 新窗口
              </a>
              {card.entry && (
                <code className="truncate rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                  {card.entry}
                </code>
              )}
            </div>
            {showPreview && (
              <div className="mt-2">
                <InteractivePreview
                  previewUrl={card.previewUrl}
                  entry={card.entry}
                  files={files.map((f) => f.path)}
                  buildResult={card.buildResult}
                  height={300}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-2.5 py-1.5 text-[11.5px] text-[var(--text-tertiary)]">
            <FileCode2 size={12} /> 无可交互预览,见下方代码 diff
          </div>
        )}

        {/* 改动摘要 */}
        {(files.length > 0 || card.diffSummary) && (
          <div className="mt-2.5">
            <button
              onClick={() => setFilesOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"
            >
              <FileCode2 size={12} className="text-[var(--text-tertiary)]" />
              改动摘要{files.length ? ` · ${files.length} 个文件` : ''}
              {card.diffSummary && <span className="font-mono font-normal text-[var(--text-tertiary)]">· {card.diffSummary}</span>}
              {files.length > 0 && (
                <ChevronDown size={12} className="ml-auto text-[var(--text-tertiary)]" style={{ transform: filesOpen ? 'rotate(180deg)' : 'none' }} />
              )}
            </button>
            {filesOpen && files.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1">
                {files.map((f) => {
                  const c = FILE_COLOR[f.status] ?? 'var(--text-tertiary)'
                  return (
                    <li key={f.path} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                        style={{ color: c, background: `color-mix(in oklch, ${c} 14%, transparent)` }}
                      >
                        {FILE_LABEL[f.status] ?? f.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{f.path}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* 下一步 */}
        {card.nextSteps?.length > 0 && (
          <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
            <div className="mb-1 text-[11px] font-semibold text-[var(--text-secondary)]">下一步</div>
            <ul className="flex flex-col gap-1">
              {card.nextSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
                  <ArrowRight size={11} className="mt-0.5 shrink-0 text-[var(--accent-text)]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {onOpenDelivery && (
          <button
            onClick={onOpenDelivery}
            className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--accent-text)] transition-colors hover:underline"
          >
            在交付中心查看 <ArrowRight size={11} />
          </button>
        )}
      </div>

      {/* D11 设计深钻:Submit-Review-Merge 启发 —— 频道内即可完成验收,不必去右侧 DeliveryCenter。
          已决定则按钮替换为状态徽章(乐观更新,后端回流同步无冲突)。 */}
      {onDecide && (
        <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          {decided ? (
            <span
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11.5px] font-medium"
              style={{
                color: decided === 'approved' ? 'var(--success)' : 'var(--destructive)',
                background: `color-mix(in oklch, ${decided === 'approved' ? 'var(--success)' : 'var(--destructive)'} 12%, transparent)`,
              }}
            >
              {decided === 'approved' ? (
                <ThumbsUp size={11} />
              ) : (
                <ThumbsDown size={11} />
              )}
              {decided === 'approved' ? '已接受交付' : '已拒绝(请反馈原因)'}
            </span>
          ) : (
            <>
              <button
                onClick={() => {
                  setDecided('approved')
                  onDecide('approved')
                }}
                className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--success)' }}
              >
                <ThumbsUp size={12} /> 接受交付
              </button>
              <button
                onClick={() => {
                  setDecided('rejected')
                  onDecide('rejected')
                }}
                className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2.5 py-1 text-[12px] font-medium transition-colors"
                style={{
                  color: 'var(--destructive)',
                  borderColor: 'color-mix(in oklch, var(--destructive) 32%, var(--border))',
                  background: 'transparent',
                }}
              >
                <ThumbsDown size={12} /> 拒绝
              </button>
              <span className="ml-auto text-[10.5px] text-[var(--text-tertiary)]">
                频道内即时验收 · 也可去交付中心
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// v2 Optimizer 建议卡:由后台 setInterval 扫描后 post 到频道。
// 用户在频道里直接接受 → 调 /api/optimizer/apply → 后端 resolve PendingInput 或 approve Delivery。
// 视觉与 Progress/Delivery 同体系,但 accent 用 sparkle + 紫(--accent-text),代表"主动建议"非"被动响应"。
export function OptimizerSuggestionCard({
  card,
  messageId,
  accepted,
}: {
  card: OptimizerSuggestionCardData
  messageId: string
  accepted: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [doneLocal, setDoneLocal] = useState<null | 'accepted' | 'dismissed'>(null)
  const apply = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.applyOptimizerSuggestion({
        messageId,
        type: card.action.type,
        payload: card.action.payload,
      })
      setDoneLocal('accepted')
    } catch (e) {
      console.error('[optimizer-apply]', e)
    } finally {
      setBusy(false)
    }
  }
  const dismiss = () => setDoneLocal('dismissed')
  const finalAccepted = accepted || doneLocal === 'accepted'
  return (
    <div
      className="card-lift mt-1 max-w-xl overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-1)]"
      style={{ borderColor: 'color-mix(in oklch, var(--accent-text) 32%, var(--border))' }}
    >
      <div
        className="surface-glow flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--accent-text)', background: 'color-mix(in oklch, var(--accent-text) 16%, transparent)' }}
        >
          <Sparkles size={12} />
        </span>
        <span className="text-[13px] font-bold" style={{ color: 'var(--accent-text)' }}>
          Optimizer 建议
        </span>
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
          style={{
            color: card.ageMinutes > 60 ? 'var(--destructive)' : 'var(--warning)',
            background: `color-mix(in oklch, ${card.ageMinutes > 60 ? 'var(--destructive)' : 'var(--warning)'} 14%, transparent)`,
          }}
        >
          阻塞 {card.ageMinutes}m
        </span>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{card.title}</div>
        <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">{card.body}</p>

        {/* Why this:Miessler 启发,可解释性即货币 */}
        {card.why?.dataPoints?.length > 0 && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)] p-2">
            <div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: 'var(--accent-text)' }}>
              <Sparkles size={11} /> Why this
            </div>
            <ul className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
              {card.why.dataPoints.map((p, i) => (
                <li key={i} className="flex gap-1">
                  <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-[var(--success)]" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        {finalAccepted ? (
          <span
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[11.5px] font-medium"
            style={{ color: 'var(--success)', background: 'color-mix(in oklch, var(--success) 12%, transparent)' }}
          >
            <CheckCircle2 size={11} /> 已采纳建议
          </span>
        ) : doneLocal === 'dismissed' ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-tertiary)]">
            <X size={11} /> 已忽略
          </span>
        ) : (
          <>
            <button
              onClick={apply}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-text)' }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {card.action.label}
            </button>
            <button
              onClick={dismiss}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2.5 py-1 text-[12px] font-medium"
              style={{
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              忽略
            </button>
            <span className="ml-auto text-[10.5px] text-[var(--text-tertiary)]">主动扫描 · 不接受不执行</span>
          </>
        )}
      </div>
    </div>
  )
}

function Badge({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium"
      style={{ color, background: `color-mix(in oklch, ${color} 13%, transparent)` }}
    >
      {icon}
      {label}
    </span>
  )
}
