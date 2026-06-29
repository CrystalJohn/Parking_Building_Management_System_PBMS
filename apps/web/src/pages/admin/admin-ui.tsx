import type { ReactNode } from 'react'

type Role = 'admin' | 'manager' | 'staff' | 'driver'
type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'slate'

const ROLE_TONES: Record<Role, string> = {
  admin: 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/15 dark:text-primary-100 dark:ring-primary-400/20',
  manager: 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-100 dark:ring-sky-400/20',
  staff: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/20',
  driver: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10',
}

const STATUS_TONES: Record<StatusTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/20',
  blue: 'bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-500/15 dark:text-primary-100 dark:ring-primary-400/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-400/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10',
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

export function AdminPageHeader({
  title,
  description,
  action,
  weight = 'strong',
}: {
  title: string
  description: string
  action?: ReactNode
  weight?: 'strong' | 'normal'
}) {
  const titleWeight = weight === 'normal' ? 'font-normal' : 'font-black'
  const descriptionWeight = weight === 'normal' ? 'font-normal' : 'font-medium'

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className={`text-2xl ${titleWeight} tracking-tight text-slate-950 dark:text-white`}>
          {title}
        </h1>
        <p className={`mt-1 max-w-2xl text-sm ${descriptionWeight} leading-6 text-slate-500 dark:text-slate-400`}>
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function StatCard({
  label,
  value,
  helper,
  icon,
  unavailable = false,
}: {
  label: string
  value: string | number
  helper?: string
  icon?: ReactNode
  unavailable?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {icon ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-100">
            {icon}
          </div>
        ) : null}
      </div>
      <p
        className={`mt-4 text-3xl font-black tracking-tight ${
          unavailable ? 'text-slate-400 dark:text-slate-500' : 'text-slate-950 dark:text-white'
        }`}
      >
        {value}
      </p>
      {helper ? (
        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

export function RoleBadge({
  role,
  weight = 'strong',
}: {
  role: Role
  weight?: 'strong' | 'normal'
}) {
  const fontWeight = weight === 'normal' ? 'font-normal' : 'font-black'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${fontWeight} ring-1 ${ROLE_TONES[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  )
}

export function StatusBadge({
  label,
  tone,
  weight = 'strong',
}: {
  label: string
  tone: StatusTone
  weight?: 'strong' | 'normal'
}) {
  const fontWeight = weight === 'normal' ? 'font-normal' : 'font-black'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${fontWeight} ring-1 ${STATUS_TONES[tone]}`}>
      {label}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  weight = 'strong',
}: {
  title: string
  description: string
  weight?: 'strong' | 'normal'
}) {
  const titleWeight = weight === 'normal' ? 'font-normal' : 'font-black'
  const descriptionWeight = weight === 'normal' ? 'font-normal' : 'font-medium'

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/15 dark:bg-white/[0.04]">
      <p className={`text-base ${titleWeight} text-slate-900 dark:text-white`}>{title}</p>
      <p className={`mx-auto mt-2 max-w-xl text-sm ${descriptionWeight} leading-6 text-slate-500 dark:text-slate-400`}>
        {description}
      </p>
    </div>
  )
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/10"
        />
      ))}
    </div>
  )
}
