import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Bot, Check, Sparkles, User as UserIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input, Textarea } from './ui/input'
import { Badge } from './ui/badge'
import type { Assistant, User } from '../lib/types'
import { cn } from '../lib/cn'

const PHASE_OPTIONS = [
  { key: 'discovery', label: 'Discovery · 探索' },
  { key: 'build', label: 'Build · 构建' },
  { key: 'review', label: 'Review · 评审' },
  { key: 'ship', label: 'Ship · 上线' },
  { key: 'maintenance', label: 'Maintain · 维护' },
] as const

type Phase = (typeof PHASE_OPTIONS)[number]['key']

export interface NewProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  me: User
  users: User[]
  assistants: Assistant[]
  onSubmit: (data: {
    name: string
    goal: string
    scope?: string
    phase: Phase
    ownerId: string
    memberIds: string[]
  }) => Promise<void>
}

const EXEC_SKILLS = ['run_command', 'write_file', 'browser_open']

function isExecAi(a: Assistant) {
  return (a.skills ?? []).some((s) => EXEC_SKILLS.includes(s))
}

export function NewProjectModal({
  open,
  onOpenChange,
  me,
  users,
  assistants,
  onSubmit,
}: NewProjectModalProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [scope, setScope] = useState('')
  const [phase, setPhase] = useState<Phase>('discovery')
  const [ownerId, setOwnerId] = useState<string>(me.id)
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // 复位
      setTimeout(() => {
        setStep(1)
        setName('')
        setGoal('')
        setScope('')
        setPhase('discovery')
        setOwnerId(me.id)
        // 默认勾选所有 exec-skill AI 中的"软件工程师"或第一个
        const engineer = assistants.find((a) => a.name === '软件工程师' && isExecAi(a))
        const first = assistants.find(isExecAi)
        const pick = engineer ?? first
        setMemberIds(pick ? new Set([pick.id]) : new Set())
        setError(null)
        setBusy(false)
      }, 200)
    } else {
      const engineer = assistants.find((a) => a.name === '软件工程师' && isExecAi(a))
      const first = assistants.find(isExecAi)
      const pick = engineer ?? first
      setMemberIds(pick ? new Set([pick.id]) : new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const realUsers = useMemo(() => users.filter((u) => !u.isAssistant), [users])
  const execAssistants = useMemo(() => assistants.filter(isExecAi), [assistants])
  const otherAssistants = useMemo(() => assistants.filter((a) => !isExecAi(a)), [assistants])

  const canNext1 = name.trim().length > 0 && goal.trim().length > 0
  const canNext2 = !!ownerId
  const canSubmit = canNext1 && canNext2 && memberIds.size > 0

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        goal: goal.trim(),
        scope: scope.trim() || undefined,
        phase,
        ownerId,
        memberIds: Array.from(memberIds),
      })
      onOpenChange(false)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent)]" />
            新建项目频道
          </DialogTitle>
          <DialogDescription>
            v4 只有项目频道一种。3 步:基础信息 → owner → 推荐 AI 队员
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[11px]',
                n === step
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[oklch(15%_0.02_80)]'
                  : n < step
                    ? 'border-[var(--ok)] bg-[var(--ok)] text-[oklch(15%_0.02_80)]'
                    : 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--mute)]',
              )}
            >
              {n < step ? <Check size={12} /> : n}
            </div>
          ))}
          <div className="ml-2 text-[12px] text-[var(--mute)]">
            {step === 1 ? '基础信息' : step === 2 ? 'Owner 与阶段' : '推荐 AI 队员'}
          </div>
        </div>

        {/* Step content */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                项目名称 *
              </label>
              <Input
                placeholder="如:pixel-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                项目目标 *
              </label>
              <Textarea
                placeholder="一句话说清楚:本项目要解决什么问题/做出什么产物"
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                maxLength={200}
              />
              <div className="mt-0.5 text-right font-mono text-[10px] text-[var(--mute)]">
                {goal.length}/200
              </div>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                范围 / scope(可选)
              </label>
              <Textarea
                placeholder="覆盖范围、不做什么、关键约束等"
                rows={2}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                项目 Owner
              </label>
              <div className="flex flex-wrap gap-1.5">
                {realUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setOwnerId(u.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors',
                      ownerId === u.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]'
                        : 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)] hover:bg-[var(--glass)]',
                    )}
                  >
                    <UserIcon size={12} />
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                初始阶段
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PHASE_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPhase(p.key)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors',
                      phase === p.key
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[oklch(15%_0.02_80)]'
                        : 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)] hover:bg-[var(--glass)]',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-[var(--ink-3)]">
              至少勾选 1 个有 exec 技能(write_file / run_command / browser_open)的 AI,确保派工后真有人干活。
            </div>
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                有 exec 能力 · 推荐
              </div>
              <div className="flex flex-wrap gap-1.5">
                {execAssistants.length === 0 ? (
                  <div className="text-[12px] text-[var(--mute)]">没有 exec AI,创建后会自动加入软件工程师</div>
                ) : (
                  execAssistants.map((a) => {
                    const picked = memberIds.has(a.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setMemberIds((set) => {
                            const next = new Set(set)
                            if (next.has(a.id)) next.delete(a.id)
                            else next.add(a.id)
                            return next
                          })
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors',
                          picked
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]'
                            : 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)] hover:bg-[var(--glass)]',
                        )}
                      >
                        <Bot size={12} />
                        {a.name}
                        {picked && <Check size={11} />}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            {otherAssistants.length > 0 && (
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--mute)]">
                  其他 AI(选填)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {otherAssistants.map((a) => {
                    const picked = memberIds.has(a.id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setMemberIds((set) => {
                            const next = new Set(set)
                            if (next.has(a.id)) next.delete(a.id)
                            else next.add(a.id)
                            return next
                          })
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors',
                          picked
                            ? 'border-[var(--info)] bg-[color-mix(in_oklab,var(--info)_12%,var(--canvas))] text-[var(--ink)]'
                            : 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)] hover:bg-[var(--glass)]',
                        )}
                      >
                        <Bot size={12} />
                        {a.name}
                        {picked && <Check size={11} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {memberIds.size === 0 && (
              <Badge variant="warning">至少选一个 AI 队员才能创建</Badge>
            )}
          </div>
        )}

        {error && <div className="text-[12px] text-[var(--danger)]">{error}</div>}

        <DialogFooter className="mt-2">
          {step > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              <ArrowLeft size={13} />
              上一步
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
            >
              下一步 <ArrowRight size={13} />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!canSubmit || busy}>
              {busy ? '创建中…' : '创建项目'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
