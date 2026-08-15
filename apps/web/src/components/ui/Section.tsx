type Props = {
  title: string
  children: React.ReactNode
}

export function Section({ title, children }: Props) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm text-foreground">{title}</h4>
      <div className="pl-3 border-l-2 border-muted">{children}</div>
    </div>
  )
}
