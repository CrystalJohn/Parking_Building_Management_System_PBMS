import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Eye, Radio, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  useManagerOperations,
  isOpenIssueStatus,
} from '@/lib/ManagerOperationsContext'
import {
  type OperationIssue,
  type OperationIssueSeverity,
  type OperationIssueStatus,
  type OperationIssueType,
} from '@/lib/operation-issues-api'

type StatusFilter = OperationIssueStatus | 'all'
type SeverityFilter = OperationIssueSeverity | 'all'
type TypeFilter = OperationIssueType | 'all'

const STATUS_OPTIONS: StatusFilter[] = ['all', 'open', 'in_review', 'resolved', 'dismissed']
const SEVERITY_OPTIONS: SeverityFilter[] = ['all', 'critical', 'warning', 'info']
const TYPE_OPTIONS: TypeFilter[] = [
  'all',
  'lost_ticket_review',
  'payment_issue',
  'ocr_mismatch',
  'reservation_exception',
  'slot_state_mismatch',
  'manual_review',
]

export default function Operations() {
  const { issues, summary, loading, connected, refresh, updateIssue } = useManagerOperations()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [actionId, setActionId] = useState<string | null>(null)

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (statusFilter !== 'all' && issue.status !== statusFilter) return false
        if (severityFilter !== 'all' && issue.severity !== severityFilter) return false
        if (typeFilter !== 'all' && issue.type !== typeFilter) return false
        return true
      }),
    [issues, severityFilter, statusFilter, typeFilter],
  )

  const handleUpdate = async (issue: OperationIssue, status: OperationIssueStatus) => {
    setActionId(`${issue.id}:${status}`)
    try {
      await updateIssue(issue.id, {
        status,
        resolutionNote:
          status === 'resolved'
            ? 'Resolved from manager operations queue.'
            : status === 'dismissed'
              ? 'Dismissed from manager operations queue.'
              : undefined,
      })
      toast.success(status === 'in_review' ? 'Issue marked in review' : `Issue ${labelize(status)}`)
    } catch {
      toast.error('Unable to update operation issue')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
              Operations Queue
            </h1>
            <Badge variant={connected ? 'default' : 'secondary'} className="gap-1.5">
              <Radio className="size-3" strokeWidth={2} />
              {connected ? 'Live' : 'Fallback'}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            Staff escalations that need manager review.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void refresh()}
          className="w-full sm:w-auto"
        >
          <RefreshCw className="mr-2 size-4" strokeWidth={1.8} />
          Refresh
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Open total" value={summary.openTotal} tone="normal" />
        <SummaryCard label="Critical" value={summary.critical} tone="critical" />
        <SummaryCard label="Warning" value={summary.warning} tone="warning" />
        <SummaryCard label="Info" value={summary.info} tone="muted" />
      </section>

      <Card className="border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-black">
              <ShieldAlert className="size-5 text-cyan-700 dark:text-cyan-200" strokeWidth={1.8} />
              Review queue
            </CardTitle>
            <div className="grid gap-2 sm:grid-cols-3">
              <FilterSelect
                value={statusFilter}
                options={STATUS_OPTIONS}
                label="Status"
                onChange={(value) => setStatusFilter(value as StatusFilter)}
              />
              <FilterSelect
                value={severityFilter}
                options={SEVERITY_OPTIONS}
                label="Severity"
                onChange={(value) => setSeverityFilter(value as SeverityFilter)}
              />
              <FilterSelect
                value={typeFilter}
                options={TYPE_OPTIONS}
                label="Type"
                onChange={(value) => setTypeFilter(value as TypeFilter)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
              ))}
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-slate-950/50">
              <CheckCircle2 className="mx-auto size-8 text-emerald-600 dark:text-emerald-300" strokeWidth={1.8} />
              <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">
                No matching operation issues.
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                New staff requests will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  actionId={actionId}
                  onUpdate={(status) => void handleUpdate(issue, status)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function IssueCard({
  issue,
  actionId,
  onUpdate,
}: {
  issue: OperationIssue
  actionId: string | null
  onUpdate: (status: OperationIssueStatus) => void
}) {
  const plate = issue.plateNumber ?? issue.session?.plateNumberConfirmed ?? issue.session?.licensePlate ?? 'No plate'
  const sessionCode = issue.session?.sessionCode ?? 'No session'

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={issue.status} />
            <SeverityPill severity={issue.severity} />
            <Badge variant="outline" className="capitalize">
              {labelize(issue.type)}
            </Badge>
          </div>
          <div>
            <p className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {plate}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {sessionCode} · {formatDateTime(issue.createdAt)}
            </p>
          </div>
          <p className="max-w-3xl text-sm font-medium leading-6 text-slate-700 dark:text-slate-300">
            {issue.note}
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span>Staff: {issue.createdBy?.fullName ?? issue.createdBy?.phone ?? 'System'}</span>
            {issue.payment ? <span>Payment: {labelize(issue.payment.status)}</span> : null}
            {issue.slot?.code ? <span>Slot: {issue.slot.code}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          {issue.status === 'open' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onUpdate('in_review')}
              disabled={actionId === `${issue.id}:in_review`}
            >
              <Eye className="mr-2 size-4" strokeWidth={1.8} />
              In Review
            </Button>
          ) : null}
          {isOpenIssueStatus(issue.status) ? (
            <>
              <Button
                type="button"
                onClick={() => onUpdate('resolved')}
                disabled={actionId === `${issue.id}:resolved`}
              >
                Resolve
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onUpdate('dismissed')}
                disabled={actionId === `${issue.id}:dismissed`}
              >
                Dismiss
              </Button>
            </>
          ) : (
            <Badge variant="secondary" className="justify-center py-2">
              {labelize(issue.status)}
            </Badge>
          )}
        </div>
      </div>
      {issue.resolutionNote ? (
        <>
          <Separator className="my-3" />
          <p className="text-xs font-semibold text-slate-500">{issue.resolutionNote}</p>
        </>
      ) : null}
    </article>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'normal' | 'warning' | 'critical' | 'muted'
}) {
  const styles = {
    normal: 'text-cyan-700 dark:text-cyan-100',
    warning: 'text-amber-700 dark:text-amber-100',
    critical: 'text-rose-700 dark:text-rose-100',
    muted: 'text-slate-700 dark:text-slate-300',
  }[tone]

  return (
    <Card className="border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <CardContent className="p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className={`mt-2 text-3xl font-black ${styles}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  value,
  options,
  label,
  onChange,
}: {
  value: string
  options: string[]
  label: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-[160px]">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option === 'all' ? `All ${label.toLowerCase()}` : labelize(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SeverityPill({ severity }: { severity: OperationIssueSeverity }) {
  const className =
    severity === 'critical'
      ? 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-100'
      : severity === 'warning'
        ? 'bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-100'
        : 'bg-cyan-500/10 text-cyan-800 ring-cyan-500/20 dark:text-cyan-100'

  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${className}`}>{labelize(severity)}</span>
}

function StatusPill({ status }: { status: OperationIssueStatus }) {
  const icon = status === 'open' || status === 'in_review' ? <Clock3 className="size-3" /> : <CheckCircle2 className="size-3" />
  const className =
    status === 'open'
      ? 'bg-cyan-500/10 text-cyan-800 ring-cyan-500/20 dark:text-cyan-100'
      : status === 'in_review'
        ? 'bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-100'
        : status === 'dismissed'
          ? 'bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-200'
          : 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/20 dark:text-emerald-100'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ring-1 ${className}`}>
      {icon}
      {labelize(status)}
    </span>
  )
}

function labelize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
