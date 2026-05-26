// Inspired by shadcn/ui (MIT), see /THIRD_PARTY_LICENSES.md
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-[var(--line)] bg-[var(--glass-2)] text-[var(--ink-2)]',
        accent:
          'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]',
        success: 'border-[var(--ok)]/30 bg-[color-mix(in_oklab,var(--ok)_12%,var(--canvas))] text-[var(--ok)]',
        warning: 'border-[var(--warn)]/30 bg-[color-mix(in_oklab,var(--warn)_12%,var(--canvas))] text-[var(--warn)]',
        danger: 'border-[var(--danger)]/30 bg-[color-mix(in_oklab,var(--danger)_12%,var(--canvas))] text-[var(--danger)]',
        info: 'border-[var(--info)]/30 bg-[color-mix(in_oklab,var(--info)_12%,var(--canvas))] text-[var(--info)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
