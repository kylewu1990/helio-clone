import { useState, type ReactNode } from 'react'
import { Brain, CalendarClock, ChevronDown, CornerDownLeft, Eye, MessageSquare, Pencil, Pin, Play, RotateCw, SmilePlus, Trash2, Wrench } from 'lucide-react'
import { Avatar } from './Avatar'
import { MarkdownBody } from './MarkdownBody'
import { ProgressCard, DeliveryCard, OptimizerSuggestionCard, BuildProgressCard } from './ChannelCards'
import { formatTime } from '../lib/format'
import type { A2AResponseCardData, AutoAssignNoticeCardData, Message, User } from '../lib/types'
import { Sparkles } from 'lucide-react'
import { EMOJI } from '../lib/constants'
import { summarizeChatTools } from '../lib/chatTools'

// v2:Optimizer 建议卡是否已被采纳(server 接受后会把 accepted:true 写回 whyJson)
function parseAccepted(whyJson?: string | null): boolean {
  if (!whyJson) return false
  try {
    const v = JSON.parse(whyJson)
    return !!(v && typeof v === 'object' && (v as Record<string, unknown>).accepted)
  } catch {
    return false
  }
}

// D7 设计深钻:A2A 意图 → 颜色 + 动词。
// review 用 warning(橙)= 「审查中,等待判断」;
// build 用 info(蓝)= 「继续建造,有方向」;
// question 用 destructive(红)= 「卡点,需澄清」;
// general 退化到 text-secondary,不抢主轴。
const A2A_INTENT_STYLE: Record<string, { color: string; verb: string }> = {
  review: { color: 'var(--warning)', verb: '审查' },
  build: { color: 'var(--info)', verb: '继续开发' },
  question: { color: 'var(--destructive)', verb: '质疑' },
  general: { color: 'var(--text-secondary)', verb: '回应' },
}

export function MessageRow({
  message,
  grouped,
  me,
  onReact,
  onOpenThread,
  onEdit,
  onDelete,
  onPin,
  onDeleteEvent,
  selectMode = false,
  selected = false,
  onToggleSelect,
  inThread = false,
  mentionNames = [],
  onOpenCockpit,
  onOpenDelivery,
  onDecideDelivery,
  hasMemory = false,
}: {
  message: Message
  grouped: boolean
  me: User
  onReact: (messageId: string, emoji: string) => void
  onOpenThread?: (messageId: string) => void
  onEdit?: (messageId: string, body: string) => void
  onDelete?: (messageId: string) => void
  onPin?: (messageId: string) => void
  onDeleteEvent?: (eventId: string) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (messageId: string) => void
  inThread?: boolean
  mentionNames?: string[]
  onOpenCockpit?: () => void // Channel-First:进度卡「查看完整过程」→ 打开右侧 Cockpit
  onOpenDelivery?: () => void // Channel-First:交付卡「在交付中心查看」
  // D11:交付卡内嵌的接受/拒绝;签名同 ChannelView.onDecideDelivery(deliveryId, status)
  onDecideDelivery?: (deliveryId: string, status: 'approved' | 'rejected') => void
  // v3 G3:该 AI 在本频道有 L2 记忆(头像旁加 Brain 角标)
  hasMemory?: boolean
}) {
  const [palette, setPalette] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [confirmDel, setConfirmDel] = useState(false)
  const [confirmDelEvent, setConfirmDelEvent] = useState(false)
  const isMine = message.authorId === me.id
  // 任务启动指令(含沙盒前言)很长,折叠成「任务卡」,聊天保持人话可读
  const taskBrief = parseTaskBrief(message.body)
  // D1 A2A 链标线:被 @ 进频道的 AI 回应另一个 AI 的交付/进度,后端打 type='a2a_response'。
  const a2aResp =
    message.type === 'a2a_response' && message.card?.kind === 'a2a_response'
      ? (message.card as A2AResponseCardData)
      : null
  // D7 设计深钻:意图着色 + verb,协作链一眼可读(评审/继续开发/质疑/一般回应)。
  //   D8:A2A 用虚线 + intent color;普通 AI 用实线 accent;两者视觉路径完全分离。
  const a2aStyle = a2aResp ? A2A_INTENT_STYLE[a2aResp.intent ?? 'general'] : null
  // D4 设计深钻:AI 发的「普通聊天消息」 左侧加 accent 实线竖线,与人类消息一眼可分。
  //   Progress/Delivery Card 自带视觉容器、TaskBrief 是真人指派 → 都跳过,避免视觉重复。
  const isPlainAIChat = !!message.author.isAssistant && !message.type && !taskBrief
  // D8:A2A 回应行用虚线 + intent color + 极淡背景(4%),与普通 AI 实线橙划清界限
  const hasAccentLine = isPlainAIChat || !!a2aResp

  // 已删除:占位
  if (message.deletedAt) {
    return (
      <div
        data-mid={message.id}
        className="flex gap-3 px-2"
        style={{ paddingTop: grouped ? 1 : 8, paddingBottom: 1 }}
      >
        <div className="w-9 shrink-0">
          {!grouped && <Avatar user={message.author} size={36} />}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {message.author.name}
            </div>
          )}
          <div className="text-sm text-[var(--text-tertiary)] italic">
            此消息已删除
          </div>
        </div>
      </div>
    )
  }

  const saveEdit = () => {
    const v = draft.trim()
    if (v && v !== message.body) onEdit?.(message.id, v)
    setEditing(false)
  }

  return (
    <div
      data-mid={message.id}
      onContextMenu={(e) => {
        if (selectMode || !onDelete) return
        e.preventDefault()
        setConfirmDel(true)
      }}
      onClick={selectMode ? () => onToggleSelect?.(message.id) : undefined}
      className={`group relative flex gap-3 rounded-[var(--radius-md)] px-2 transition-colors ${
        selectMode
          ? `cursor-pointer ${selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]'}`
          : 'hover:bg-[var(--hover)]'
      } ${hasAccentLine ? 'border-l-2 pl-2.5' : ''}`}
      style={{
        paddingTop: grouped ? 1 : 8,
        paddingBottom: 1,
        // D8:普通 AI 聊天 = 实线 accent;A2A 回应 = 虚线 + intent color + 4% 极淡背景。
        ...(a2aResp && a2aStyle
          ? {
              borderLeftColor: a2aStyle.color,
              borderLeftStyle: 'dashed' as const,
              background: `color-mix(in oklch, ${a2aStyle.color} 4%, transparent)`,
            }
          : isPlainAIChat
            ? { borderLeftColor: 'var(--accent)', borderLeftStyle: 'solid' as const }
            : null),
      }}
    >
      {selectMode && (
        <div className="flex w-5 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="h-4 w-4"
            style={{ accentColor: 'var(--accent)' }}
          />
        </div>
      )}
      <div className="relative w-9 shrink-0">
        {!grouped && <Avatar user={message.author} size={36} />}
        {/* v3 G3:AI 头像右上角 Brain 角标(该 AI 在本频道有 L2 项目记忆) */}
        {!grouped && hasMemory && message.author.isAssistant && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full"
            style={{
              background: 'var(--accent-text)',
              color: 'white',
              boxShadow: '0 0 0 2px var(--canvas)',
            }}
            title="该 AI 在本频道有 L2 项目记忆"
          >
            <Brain size={9} strokeWidth={2.5} />
          </span>
        )}
        {grouped && (
          <span className="hidden pt-0.5 text-right text-[10px] leading-5 text-[var(--text-tertiary)] group-hover:block">
            {formatTime(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {message.author.name}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}

        {/* D1+D7 A2A 协作链:↩ verb (按 intent 着色) [AI名] 的交付/进度,协作链 0.5 秒可读。 */}
        {a2aResp && a2aStyle && (
          <div
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium"
            style={{ color: a2aStyle.color }}
          >
            <CornerDownLeft size={11} />
            {a2aStyle.verb} <span className="font-semibold">{a2aResp.respondTo}</span> 的
            {a2aResp.respondToKind === 'delivery' ? '交付' : a2aResp.respondToKind === 'progress' ? '进度' : '消息'}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // 输入法合成中:交给输入法上屏,不触发保存
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  saveEdit()
                }
                if (e.key === 'Escape') {
                  setDraft(message.body)
                  setEditing(false)
                }
              }}
              rows={2}
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--paper-mid)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
            />
            <div className="mt-1 flex gap-2 text-xs text-[var(--text-tertiary)]">
              <button onClick={saveEdit} className="text-[var(--accent-text)]">
                保存
              </button>
              <button
                onClick={() => {
                  setDraft(message.body)
                  setEditing(false)
                }}
              >
                取消
              </button>
              <span>Enter 保存 · Esc 取消</span>
            </div>
          </div>
        ) : message.type === 'progress_card' && (message.card as any)?.kind === 'progress_card' ? (
          <BuildProgressCard card={message.card as any} />
        ) : message.type === 'progress_card' && message.card?.kind === 'progress' ? (
          <ProgressCard card={message.card} onOpenCockpit={onOpenCockpit} />
        ) : message.type === 'delivery_card' && message.card?.kind === 'delivery' ? (
          (() => {
            // D11:把 card 拿到本地常量,闭包内 narrowing 不丢失;deliveryId 必为 string。
            const dc = message.card
            return (
              <DeliveryCard
                card={dc}
                onOpenDelivery={onOpenDelivery}
                onDecide={
                  onDecideDelivery && dc.deliveryId
                    ? (status) => onDecideDelivery(dc.deliveryId, status)
                    : undefined
                }
              />
            )
          })()
        ) : message.type === 'optimizer_suggestion' && message.card?.kind === 'optimizer_suggestion' ? (
          // v2 Optimizer 建议卡:后台扫描后主动 post,用户在频道里直接接受/忽略。
          // accepted 状态从 message.whyJson.accepted 解析(server apply 后写回);本地接受走乐观更新。
          (() => {
            const oc = message.card
            const acceptedFromWhy = !!parseAccepted(message.whyJson)
            return <OptimizerSuggestionCard card={oc} messageId={message.id} accepted={acceptedFromWhy} />
          })()
        ) : message.type === 'auto_assign_notice' && message.card?.kind === 'auto_assign_notice' ? (
          // H2(v3 Phase B):项目频道自动派任务的轻量提示卡(灰色细条,不抢主视觉)
          (() => {
            const nc = message.card as AutoAssignNoticeCardData
            const isNoExecutor = nc.reason === 'no_executor'
            return (
              <div
                className="mt-0.5 inline-flex items-start gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--paper-mid)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Sparkles size={12} style={{ marginTop: 2, color: 'var(--accent-text)', flexShrink: 0 }} />
                <span>
                  {isNoExecutor ? (
                    <>
                      <span className="font-medium text-[var(--text-primary)]">想自动派 </span>
                      <span>但这个频道里没有具备执行技能的助手(需要 write_file 或 run_command)。</span>
                      <span>去 Settings 给某个助手勾上,或邀请一个工程师/浏览器型助手进频道,我就能直接开工。</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-[var(--text-primary)]">已自动派</span>
                      <span> · 收到 </span>
                      <span className="font-medium text-[var(--text-primary)]">{nc.triggerAuthorName}</span>
                      <span> 的需求,我开工。进度看下方进度卡,Tasks 标签也能看到。</span>
                    </>
                  )}
                </span>
              </div>
            )
          })()
        ) : message.type === 'a2a_response' ? (
          // A2A 回应消息体本身就是 AI 的对话回复(评审/质疑/补充),用普通 Markdown 渲染;
          // 上方的 ↩ header 已展示协作链上下文,这里只负责文本内容。
          <div>
            <MarkdownBody body={message.body} mentionNames={mentionNames} />
            {message.editedAt && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                (已编辑)
              </span>
            )}
          </div>
        ) : taskBrief ? (
          <TaskBriefCard brief={taskBrief} />
        ) : (
          <div>
            <MarkdownBody body={message.body} mentionNames={mentionNames} />
            {message.editedAt && (
              <span className="text-[10px] text-[var(--text-tertiary)]">
                (已编辑)
              </span>
            )}
          </div>
        )}

        {/* 事件:日历卡片(该消息是某事件的卡片 + 讨论线程根) */}
        {message.event && (
          <div
            onContextMenu={(e) => {
              if (!onDeleteEvent) return
              e.preventDefault()
              e.stopPropagation()
              setConfirmDelEvent(true)
            }}
            className="relative mt-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--paper-mid)] p-3"
          >
            <div className="flex items-center gap-2">
              <CalendarClock size={16} style={{ color: 'var(--accent-text)' }} />
              <span className="font-semibold text-[var(--text-primary)]">
                {message.event.title}
              </span>
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">
              {formatEventTime(message.event.startsAt, message.event.endsAt)}
              {message.event.location && ` · ${message.event.location}`}
            </div>
            {message.event.description && (
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                {message.event.description}
              </div>
            )}
            {!inThread && onOpenThread && (
              <button
                onClick={() => onOpenThread(message.id)}
                className="mt-2 text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                {message.replyCount > 0
                  ? `${message.replyCount} 条讨论 ›`
                  : '进入讨论 ›'}
              </button>
            )}
            {confirmDelEvent && (
              <div className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-2 text-xs">
                <span className="text-[var(--text-secondary)]">
                  删除该事件?(连同卡片)
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteEvent?.(message.event!.id)
                    setConfirmDelEvent(false)
                  }}
                  className="font-medium"
                  style={{ color: 'var(--destructive)' }}
                >
                  删除
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDelEvent(false)
                  }}
                  className="text-[var(--text-tertiary)]"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}

        {/* 工具调用:归纳成人话动作(原始工具名作为 hover 次级信息) */}
        {message.toolsUsed.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Wrench size={11} />
            <span className="text-[var(--text-tertiary)]">AI 做了</span>
            {summarizeChatTools(message.toolsUsed).map((g) => (
              <span
                key={g.verb}
                title={g.raw.join(', ')}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ring-1 ring-[var(--border)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {g.verb}
                {g.count > 1 && <span className="text-[var(--text-tertiary)]">×{g.count}</span>}
              </span>
            ))}
          </div>
        )}

        {/* cede:已读但本轮选择不回的助手(主动响应透明) */}
        {message.cededBy.length > 0 && (
          <div
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]"
            title={`${message.cededBy.join('、')} 看到了但本轮选择不回应`}
          >
            <Eye size={11} />
            {message.cededBy.length} 位助手已读未回
          </div>
        )}

        {/* 反应条 */}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(me.id)
              return (
                <button
                  key={r.emoji}
                  onClick={() => onReact(message.id, r.emoji)}
                  className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors"
                  style={{
                    borderColor: mine ? 'var(--accent)' : 'var(--border)',
                    background: mine ? 'var(--accent-soft)' : 'var(--paper-mid)',
                    color: mine ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  <span>{r.emoji}</span>
                  <span className="font-medium">{r.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* 话题串入口 */}
        {!inThread && message.replyCount > 0 && onOpenThread && (
          <button
            onClick={() => onOpenThread(message.id)}
            className="mt-1 flex items-center gap-1.5 rounded-[var(--radius-md)] px-1 py-0.5 text-xs font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-soft)]"
          >
            <span className="flex -space-x-1">
              {message.replyParticipants.map((p) => (
                <Avatar key={p.id} user={p} size={16} />
              ))}
            </span>
            {message.replyCount} 条回复
          </button>
        )}
      </div>

      {/* 悬浮操作条 */}
      {!editing && !selectMode && (
        <div
          className={`absolute -top-3 right-2 z-10 items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-0.5 shadow-sm ${confirmDel ? 'flex' : 'hidden group-hover:flex'}`}
        >
          {confirmDel ? (
            <div className="flex items-center gap-1 px-1 text-xs">
              <span className="text-[var(--text-secondary)]">删除?</span>
              <button
                onClick={() => {
                  onDelete?.(message.id)
                  setConfirmDel(false)
                }}
                className="font-medium"
                style={{ color: 'var(--destructive)' }}
              >
                删除
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="text-[var(--text-tertiary)]"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <ActionButton
                  title="添加反应"
                  onClick={() => setPalette((v) => !v)}
                >
                  <SmilePlus size={16} />
                </ActionButton>
                {palette && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setPalette(false)}
                    />
                    <div className="absolute top-7 right-0 z-20 grid max-h-48 w-64 grid-cols-8 gap-0.5 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-1.5 shadow-lg">
                      {EMOJI.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            onReact(message.id, e)
                            setPalette(false)
                          }}
                          className="rounded-[var(--radius-md)] py-1 text-base transition-colors hover:bg-[var(--hover)]"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {!inThread && onOpenThread && (
                <ActionButton
                  title="在话题串中回复"
                  onClick={() => onOpenThread(message.id)}
                >
                  <MessageSquare size={16} />
                </ActionButton>
              )}
              {onPin && (
                <ActionButton
                  title={message.pinnedAt ? '取消固定' : '固定'}
                  onClick={() => onPin(message.id)}
                >
                  <Pin
                    size={15}
                    style={{
                      fill: message.pinnedAt ? 'currentColor' : 'none',
                      color: message.pinnedAt ? 'var(--accent-text)' : undefined,
                    }}
                  />
                </ActionButton>
              )}
              {isMine && onEdit && (
                <ActionButton
                  title="编辑"
                  onClick={() => {
                    setDraft(message.body)
                    setEditing(true)
                  }}
                >
                  <Pencil size={15} />
                </ActionButton>
              )}
              {onDelete && (
                <ActionButton title="删除" onClick={() => setConfirmDel(true)}>
                  <Trash2 size={15} />
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// 解析任务启动 brief:首行为【任务执行】/【继续执行】时,抽出任务标题/预期交付物,其余作为可折叠的执行说明。
type TaskBrief = { mode: 'run' | 'continue'; title?: string; expected?: string; rest: string }
function parseTaskBrief(body: string): TaskBrief | null {
  const head = body.slice(0, 12)
  const isRun = head.startsWith('【任务执行】')
  const isCont = head.startsWith('【继续执行】')
  if (!isRun && !isCont) return null
  const lines = body.split('\n')
  let title: string | undefined
  let expected: string | undefined
  const rest: string[] = []
  for (const ln of lines.slice(1)) {
    if (ln.startsWith('任务:') && !title) title = ln.slice(3).trim()
    else if (ln.startsWith('预期交付物:') && !expected) expected = ln.slice(6).trim()
    else if (ln.trim()) rest.push(ln)
  }
  return { mode: isCont ? 'continue' : 'run', title, expected, rest: rest.join('\n') }
}

function TaskBriefCard({ brief }: { brief: TaskBrief }) {
  const [open, setOpen] = useState(false)
  const isCont = brief.mode === 'continue'
  return (
    <div className="mt-1 max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
        >
          {isCont ? <RotateCw size={12} /> : <Play size={12} />}
        </span>
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          {isCont ? '继续执行任务' : '指派任务给 AI'}
        </span>
      </div>
      <div className="px-3 py-2">
        {brief.title && (
          <div className="text-[13px] font-medium text-[var(--text-primary)]">{brief.title}</div>
        )}
        {brief.expected && (
          <div className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            <span className="text-[var(--text-tertiary)]">预期交付物 · </span>
            {brief.expected}
          </div>
        )}
        {brief.rest && (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
              {open ? '收起执行说明' : '查看执行说明(沙盒 / 工具规则)'}
            </button>
            {open && (
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
                {brief.rest}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function formatEventTime(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const str = s.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  if (endsAt) {
    const e = new Date(endsAt)
    return `${str} – ${e.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  return str
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  )
}
