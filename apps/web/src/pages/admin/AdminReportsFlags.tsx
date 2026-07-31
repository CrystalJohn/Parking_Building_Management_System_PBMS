import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import {
  getAdminOperationsFlags,
  getAdminSessionEvidence,
  type AdminFlagSeverity,
  type AdminOperationFlag,
  type AdminOperationsFlags,
  type AdminSessionEvidence,
} from '../../lib/admin-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { EvidenceComparisonPanel } from '@/components/evidence/EvidenceComparisonPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

function formatAgeDuration(minutes: number): string {
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`
}

function getFlagTypeMeta(type: string) {
  switch (type) {
    case 'long_active_session':
      return {
        label: 'Long Active Session (>24h)',
        badgeColor: 'border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        recommendation: 'Recommendation: Inspect vehicle parking spot or contact owner.',
        icon: Car,
      }
    case 'checkout_pending_too_long':
      return {
        label: 'Checkout Pending (>10m)',
        badgeColor: 'border-orange-300 bg-orange-500/10 text-orange-700 dark:text-orange-300',
        recommendation: 'Recommendation: Verify POS terminal / driver app payment status.',
        icon: Clock,
      }
    case 'exit_authorized_not_exited':
      return {
        label: 'Paid - Vehicle Not Exited',
        badgeColor: 'border-rose-300 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold',
        recommendation: 'Recommendation: Check exit lane congestion or manually open barrier.',
        icon: AlertOctagon,
      }
    case 'pending_bank_qr_too_long':
      return {
        label: 'Pending Bank QR (>15m)',
        badgeColor: 'border-yellow-300 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300',
        recommendation: 'Recommendation: Guide driver to retry transfer or regenerate QR.',
        icon: CreditCard,
      }
    case 'failed_payment':
      return {
        label: 'Failed Payment',
        badgeColor: 'border-rose-300 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        recommendation: 'Recommendation: Inspect payment gateway logs and assist driver.',
        icon: CreditCard,
      }
    case 'expired_reservation':
      return {
        label: 'Expired Reservation',
        badgeColor: 'border-blue-300 bg-blue-500/10 text-blue-700 dark:text-blue-300',
        recommendation: 'Recommendation: Slot automatically released by system.',
        icon: Info,
      }
    default:
      return {
        label: type.replace(/_/g, ' ').toUpperCase(),
        badgeColor: 'border-slate-300 bg-slate-500/10 text-slate-700',
        recommendation: 'Recommendation: Check event logs.',
        icon: AlertTriangle,
      }
  }
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

export default function AdminReportsFlags() {
  const [data, setData] = useState<AdminOperationsFlags | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<AdminSessionEvidence | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<SeverityFilter>('all')

  const loadFlags = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getAdminOperationsFlags()
      setData(result)
    } catch {
      setError('Unable to load operational flags. Please check API connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFlags()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadEvidence() {
      if (!selectedSessionId) {
        setSelectedEvidence(null)
        setEvidenceError(null)
        setEvidenceLoading(false)
        return
      }

      setEvidenceLoading(true)
      setEvidenceError(null)
      try {
        const result = await getAdminSessionEvidence(selectedSessionId)
        if (!cancelled) setSelectedEvidence(result)
      } catch {
        if (!cancelled) {
          setSelectedEvidence(null)
          setEvidenceError('Unable to load OCR evidence comparison for this session.')
        }
      } finally {
        if (!cancelled) setEvidenceLoading(false)
      }
    }

    void loadEvidence()
    return () => {
      cancelled = true
    }
  }, [selectedSessionId])

  const filteredFlags = useMemo(() => {
    if (!data?.flags) return []
    if (activeFilter === 'all') return data.flags
    return data.flags.filter((f) => f.severity === activeFilter)
  }, [data?.flags, activeFilter])

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Operational Audit & Flags
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Derived operational flags from current PBMS database state for evidence-backed audit review.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadFlags()}
          disabled={loading}
          className="h-10 gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
          <CardContent className="flex items-center gap-2 p-5 pt-5 sm:pt-5 font-semibold">
            <AlertTriangle className="size-5 shrink-0" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? <ReportsLoadingState /> : null}

      {!loading && data ? (
        <>
          {/* Metrics summary */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Flags Detected"
              value={data.summary.totalFlags}
              helper="Latest 50 derived flags"
              isActive={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
              icon={<ShieldAlert className="size-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Critical"
              value={data.summary.critical}
              helper="Needs immediate review"
              variant="critical"
              isActive={activeFilter === 'critical'}
              onClick={() => setActiveFilter('critical')}
              icon={<AlertOctagon className="size-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Warning"
              value={data.summary.warning}
              helper="Operational attention required"
              variant="warning"
              isActive={activeFilter === 'warning'}
              onClick={() => setActiveFilter('warning')}
              icon={<AlertTriangle className="size-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Info"
              value={data.summary.info}
              helper="Low-risk telemetry"
              variant="info"
              isActive={activeFilter === 'info'}
              onClick={() => setActiveFilter('info')}
              icon={<CheckCircle2 className="size-5" strokeWidth={1.8} />}
            />
          </div>

          {/* Threshold rules info banner */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Flag Thresholds:</span>
            <Badge variant="secondary" className="gap-1 bg-background">
              <Clock className="size-3" /> Active &gt; {data.thresholds.longActiveSessionHours}h
            </Badge>
            <Badge variant="secondary" className="gap-1 bg-background">
              <Clock className="size-3" /> Checkout pending &gt; {data.thresholds.checkoutPendingMinutes}m
            </Badge>
            <Badge variant="secondary" className="gap-1 bg-background">
              <Clock className="size-3" /> Exit authorized &gt; {data.thresholds.exitAuthorizedMinutes}m
            </Badge>
            <Badge variant="secondary" className="gap-1 bg-background">
              <Clock className="size-3" /> Bank QR pending &gt; {data.thresholds.pendingBankQrMinutes}m
            </Badge>
          </div>

          {/* Flags list container */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">Operational Flags ({filteredFlags.length})</CardTitle>
                  <CardDescription className="text-xs">
                    {activeFilter === 'all'
                      ? 'Displaying all operational flag severities.'
                      : `Filtered by severity: ${activeFilter.toUpperCase()}`}
                  </CardDescription>
                </div>
                {activeFilter !== 'all' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveFilter('all')}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear filter
                  </Button>
                )}
              </div>
            </CardHeader>

            {filteredFlags.length === 0 ? (
              <CardContent className="p-8 pt-8 sm:pt-8">
                <AuditEmptyState
                  title="No operational flags detected."
                  description="System is operating normally or no records match the active filter."
                />
              </CardContent>
            ) : (
              <CardContent className="p-0 divide-y">
                {filteredFlags.map((flag: AdminOperationFlag, index: number) => {
                  const meta = getFlagTypeMeta(flag.type)
                  const Icon = meta.icon
                  return (
                    <article
                      key={`${flag.type}-${flag.sessionCode ?? flag.paymentId ?? index}`}
                      className="group relative p-5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        {/* Left column info */}
                        <div className="space-y-2.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={flag.severity} />
                            <Badge variant="outline" className={`gap-1 font-semibold ${meta.badgeColor}`}>
                              <Icon className="size-3.5" />
                              {meta.label}
                            </Badge>
                            {flag.plateNumber && (
                              <Badge className="font-mono text-xs font-bold tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                                {flag.plateDisplay ?? flag.plateNumber}
                              </Badge>
                            )}
                          </div>

                          <p className="text-base font-bold text-foreground leading-snug">
                            {flag.message}
                          </p>

                          {/* Action recommendation */}
                          <div className="rounded-lg border bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                            {meta.recommendation}
                          </div>

                          {/* Identifiers */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                            {flag.sessionCode && (
                              <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground font-medium">
                                Session: {flag.sessionCode}
                              </span>
                            )}
                            {flag.reservationCode && (
                              <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground font-medium">
                                Reservation: {flag.reservationCode}
                              </span>
                            )}
                            {flag.paymentId && (
                              <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground font-medium">
                                Payment ID: {shortCode(flag.paymentId)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right column: duration & CTA */}
                        <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 rounded-xl border bg-muted/20 p-3.5 lg:w-[240px] shrink-0">
                          <div className="text-left lg:text-right">
                            <div className="flex items-center gap-1.5 text-sm font-bold text-foreground lg:justify-end">
                              <Clock className="size-4 text-amber-600" />
                              {formatAgeDuration(flag.ageMinutes)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Started: {formatDateTimeVN(flag.createdAt)}
                            </p>
                          </div>

                          {flag.sessionId ? (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={() => setSelectedSessionId(flag.sessionId)}
                              className="h-9 gap-1.5 text-xs font-semibold w-full sm:w-auto"
                            >
                              <Eye className="size-4" />
                              View OCR Evidence
                              <ArrowRight className="size-3" />
                            </Button>
                          ) : (
                            <Badge variant="outline" className="h-8 px-3 text-xs text-muted-foreground">
                              No OCR Evidence
                            </Badge>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </CardContent>
            )}
          </Card>

          {/* Evidence Audit Sheet */}
          <Sheet
            open={selectedSessionId !== null}
            onOpenChange={(open) => !open && setSelectedSessionId(null)}
          >
            <SheetContent side="right" className="w-full sm:max-w-3xl">
              <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
                <SheetHeader className="border-b pb-4">
                  <SheetTitle className="text-xl font-bold">OCR Evidence Audit &amp; Comparison</SheetTitle>
                  <SheetDescription>
                    Compare check-in and check-out camera captures to verify vehicle plate &amp; flags.
                  </SheetDescription>
                </SheetHeader>

                {evidenceLoading ? <ReportsLoadingState rows={2} compact /> : null}

                {evidenceError ? (
                  <Card className="border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                    <CardContent className="py-4 text-sm font-semibold">{evidenceError}</CardContent>
                  </Card>
                ) : null}

                {selectedEvidence ? (
                  <div className="space-y-4">
                    <Card className="bg-muted/30 border">
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Parking Session Code
                            </p>
                            <p className="mt-1 font-mono text-xl font-black text-foreground">
                              {selectedEvidence.session.sessionCode}
                            </p>
                          </div>
                          <Badge className="font-mono text-base px-3 py-1 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                            {selectedEvidence.session.plateDisplay ??
                              selectedEvidence.session.plateNumberConfirmed ??
                              selectedEvidence.session.licensePlate}
                          </Badge>
                        </div>
                        {selectedEvidence.session.slotCode && (
                          <p className="mt-2 text-xs font-medium text-muted-foreground">
                            Assigned Slot: <span className="font-bold text-foreground">Slot {selectedEvidence.session.slotCode}</span>
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <EvidenceComparisonPanel
                      checkInEvidence={selectedEvidence.checkInEvidence}
                      checkOutEvidence={selectedEvidence.checkOutEvidence}
                    />
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  )
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  variant = 'default',
  isActive = false,
  onClick,
}: {
  label: string
  value: string | number
  helper?: string
  icon?: ReactNode
  variant?: 'default' | 'critical' | 'warning' | 'info'
  isActive?: boolean
  onClick?: () => void
}) {
  const borderStyles =
    variant === 'critical'
      ? 'hover:border-rose-500/50'
      : variant === 'warning'
        ? 'hover:border-amber-500/50'
        : variant === 'info'
          ? 'hover:border-blue-500/50'
          : 'hover:border-primary/50'

  const activeStyles = isActive ? 'ring-2 ring-primary ring-offset-1 border-primary bg-primary/5' : ''

  const iconBg =
    variant === 'critical'
      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
      : variant === 'warning'
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : variant === 'info'
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'bg-primary/10 text-primary'

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-all ${borderStyles} ${activeStyles}`}
    >
      <CardContent className="p-5 pt-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
          {icon ? (
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
              {icon}
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-3xl font-black tracking-tight text-foreground">{value}</p>
        {helper ? <p className="mt-1 text-xs font-medium text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  )
}

function AuditEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ReportsLoadingState({
  rows = 3,
  compact = false,
}: {
  rows?: number
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={compact ? 'h-28 rounded-2xl' : 'h-20 rounded-2xl'}
        />
      ))}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: AdminFlagSeverity }) {
  const className =
    severity === 'critical'
      ? 'border-rose-300 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold'
      : severity === 'warning'
        ? 'border-amber-300 bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold'
        : 'border-sky-300 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'

  const label = severity.toUpperCase()

  return (
    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 tracking-wider ${className}`}>
      {label}
    </Badge>
  )
}

function shortCode(value: string) {
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

