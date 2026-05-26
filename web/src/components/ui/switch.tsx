// Inspired by shadcn/ui (MIT), see /THIRD_PARTY_LICENSES.md
import * as React from 'react'
import { cn } from '../../lib/cn'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, className, id }, ref) => {
    const [internal, setInternal] = React.useState(defaultChecked ?? false)
    const value = checked !== undefined ? checked : internal
    const toggle = () => {
      if (disabled) return
      const next = !value
      if (checked === undefined) setInternal(next)
      onCheckedChange?.(next)
    }
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={value}
        data-state={value ? 'checked' : 'unchecked'}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[var(--line)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-accent)] disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'bg-[var(--accent)]' : 'bg-[var(--glass-3)]',
          className,
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'
