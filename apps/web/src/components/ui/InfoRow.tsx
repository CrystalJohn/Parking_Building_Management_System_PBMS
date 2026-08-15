import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: React.ReactNode
  highlight?: boolean
  className?: string
}

export function InfoRow({ label, value, highlight, className }: Props) {
  return (
    <div className={cn('flex justify-between py-1', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(highlight && 'font-semibold')}>{value}</span>
    </div>
  )
}
