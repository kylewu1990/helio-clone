// Inspired by shadcn/ui (MIT), see /THIRD_PARTY_LICENSES.md
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-accent)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent)] text-[oklch(15%_0.02_80)] hover:bg-[var(--accent-2)]',
        secondary:
          'bg-[var(--glass)] border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--glass-2)]',
        ghost: 'text-[var(--ink-2)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]',
        outline:
          'border border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--glass-2)]',
        destructive:
          'bg-[var(--danger)] text-white hover:opacity-90',
        link: 'text-[var(--accent)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
