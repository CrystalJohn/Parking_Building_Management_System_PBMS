import type { ReactNode } from 'react'

export interface InfoDisplayRowProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  source?: string // "từ Lane", "auto", "hệ thống"
  status?: 'normal' | 'warning' | 'error'
  errorMessage?: string
  badge?: string
  isLocked?: boolean
  className?: string
}

export const InfoDisplayRow = ({
  label,
  value,
  icon,
  source,
  status = 'normal',
  errorMessage,
  badge,
  className = '',
}: InfoDisplayRowProps) => (
  <div
    className={`flex flex-col gap-1 rounded-xl p-3 transition-colors ${
      status === 'error'
        ? 'border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30'
        : status === 'warning'
        ? 'border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30'
        : 'border border-border bg-muted/40'
    } ${className}`}
  >
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-foreground">{value}</span>
        {(source || badge) && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {source || badge}
          </span>
        )}
      </div>
    </div>
    {status === 'error' && errorMessage && (
      <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">{errorMessage}</div>
    )}
  </div>
)

export default InfoDisplayRow
