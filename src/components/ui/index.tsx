import React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-sm'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const variantClass = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    }[variant]

    const sizeClass = {
      sm: 'btn-sm',
      md: '',
      lg: 'btn-lg',
      xl: 'btn-xl',
      icon: 'btn-icon',
      'icon-sm': 'btn-icon-sm',
    }[size]

    return (
      <button
        ref={ref}
        className={cn('btn', variantClass, sizeClass, className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children && <span>{children}</span>}
          </>
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    )
  }
)
Button.displayName = 'Button'

// Badge
interface BadgeProps {
  variant?: 'violet' | 'success' | 'warning' | 'error' | 'muted'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

export const Badge = ({ variant = 'muted', size = 'md', children, className }: BadgeProps) => {
  return (
    <span className={cn('badge', `badge-${variant}`, size === 'sm' && 'text-[10px] px-1.5 py-0.5', className)}>
      {children}
    </span>
  )
}

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightElement?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightElement, className, id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).slice(2)}`
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 pointer-events-none" style={{ color: 'var(--color-text-muted)' }}>
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn('input', leftIcon && 'pl-9', rightElement && 'pr-10', error && 'border-red-500 focus:shadow-none focus:border-red-500', className)}
            {...props}
          />
          {rightElement && (
            <span className="absolute right-3">{rightElement}</span>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

// Textarea
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || `textarea-${Math.random().toString(36).slice(2)}`
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn('input textarea', error && 'border-red-500', className)}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

// Toggle
interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  id?: string
}

export const Toggle = ({ checked, onChange, label, description, disabled, id }: ToggleProps) => {
  const toggleId = id || `toggle-${Math.random().toString(36).slice(2)}`
  return (
    <div className="flex items-center gap-3.5" style={{ opacity: disabled ? 0.5 : 1 }}>
      <button
        type="button"
        id={toggleId}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn('toggle shrink-0', checked && 'active')}
      />
      {(label || description) && (
        <label htmlFor={toggleId} className="cursor-pointer select-none min-w-0 flex-1">
          {label && <div className="text-sm font-medium leading-snug" style={{ color: 'var(--color-text-primary)' }}>{label}</div>}
          {description && <div className="text-xs leading-normal mt-1" style={{ color: 'var(--color-text-muted)' }}>{description}</div>}
        </label>
      )}
    </div>
  )
}

// Select
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  error?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, className, id, ...props }, ref) => {
    const selectId = id || `select-${Math.random().toString(36).slice(2)}`
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn('input appearance-none cursor-pointer', className)}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235c5c6e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: 'var(--color-surface-2)' }}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'

// Card
interface CardProps {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}

export const Card = ({ children, className, interactive, onClick, style }: CardProps) => {
  return (
    <div
      className={cn('card', interactive && 'card-interactive', className)}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}

// Modal
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'md' }: ModalProps) => {
  const maxWidthMap = { sm: '400px', md: '520px', lg: '680px', xl: '860px' }

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="animate-fade-in-scale w-full"
        style={{
          maxWidth: maxWidthMap[maxWidth],
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-2)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {title && (
          <div className="flex items-center justify-between p-6 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="btn btn-ghost btn-icon-sm" aria-label="Close modal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// Empty State
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {icon && (
        <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
      )}
      {action && (
        <Button variant="primary" className="mt-6" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  )
}

// Skeleton
export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={cn('skeleton', className)} style={style} />
)

// Typing indicator
export const TypingIndicator = () => (
  <div className="flex items-center gap-1 px-3 py-2">
    <div className="typing-dot" />
    <div className="typing-dot" />
    <div className="typing-dot" />
  </div>
)

// Avatar
interface UserAvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  ring?: boolean
  online?: boolean
}

export const UserAvatar = ({ name, src, size = 'md', ring, online }: UserAvatarProps) => {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const sizeMap = { sm: 28, md: 36, lg: 44, xl: 56 }
  const px = sizeMap[size]

  return (
    <div className="relative inline-flex shrink-0" style={{ width: px, height: px }}>
      {src ? (
        <img
          src={src}
          alt={name}
          style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover' }}
          className={ring ? 'avatar-ring' : ''}
        />
      ) : (
        <div
          style={{
            width: px,
            height: px,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: px * 0.35,
            fontWeight: 700,
            color: 'white',
          }}
          className={ring ? 'avatar-ring' : ''}
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: px * 0.28,
            height: px * 0.28,
            borderRadius: '50%',
            background: 'var(--color-success)',
            border: '2px solid var(--color-background)',
            boxShadow: '0 0 6px rgba(16,185,129,0.5)',
          }}
        />
      )}
    </div>
  )
}

// Progress bar
interface ProgressProps {
  value: number
  max?: number
  variant?: 'violet' | 'success' | 'warning'
  size?: 'sm' | 'md'
  label?: string
  showValue?: boolean
}

export const Progress = ({ value, max = 100, variant = 'violet', size = 'md', label, showValue }: ProgressProps) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const colorMap = {
    violet: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
    success: 'linear-gradient(90deg, #059669, #10b981)',
    warning: 'linear-gradient(90deg, #d97706, #f59e0b)',
  }
  const heights = { sm: 4, md: 6 }

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between mb-1.5">
          {label && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>}
          {showValue && <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{value}/{max}</span>}
        </div>
      )}
      <div style={{ height: heights[size], background: 'var(--color-surface-3)', borderRadius: 9999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: colorMap[variant],
            borderRadius: 9999,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  )
}
