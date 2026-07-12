import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Info, ShieldAlert } from 'lucide-react'
import {
  getAdminOperationsFlags,
  getAdminSessionEvidence,
  type AdminFlagSeverity,
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

export default function AdminReportsFlags() {
  const [data, setData] = useState<AdminOperationsFlags | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<AdminSessionEvidence | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadFlags() {
      setLoading(true)
      setError(null)
      try {
        const result = await getAdminOperationsFlags()
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setError('Unable to load operational flags')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadFlags()
    return () => {
      cancelled = true
    }
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
          setEvidenceError('Unable to load OCR evidence')
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Reports & Flags
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Derived operational flags from current PBMS database state. This screen stays read-only
          and focuses on evidence-backed audit review.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/10 text-destructive">
          <CardContent className="flex items-center gap-2 py-4 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? <ReportsLoadingState /> : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total flags"
              value={data.summary.totalFlags}
              helper="Latest 50 derived flags"
              icon={<ShieldAlert className="h-5 w-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Critical"
              value={data.summary.critical}
              helper="Needs immediate review"
              icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Warning"
              value={data.summary.warning}
              helper="Operational attention"
              icon={<Info className="h-5 w-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Info"
              value={data.summary.info}
              helper="Low-risk telemetry"
              icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle>Operational flags</CardTitle>
              <CardDescription>
                Thresholds: active session over {data.thresholds.longActiveSessionHours}h,
                checkout pending over {data.thresholds.checkoutPendingMinutes}m, exit authorized
                over {data.thresholds.exitAuthorizedMinutes}m, Bank QR pending over{' '}
                {data.thresholds.pendingBankQrMinutes}m.
              </CardDescription>
            </CardHeader>

            {data.flags.length === 0 ? (
              <CardContent className="p-5">
                <AuditEmptyState
                  title="No operational flags detected."
                  description="This list only shows flags derived from current database state."
                />
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="divide-y">
                  {data.flags.map((flag, index) => (
                    <article
                      key={`${flag.type}-${flag.sessionCode ?? flag.paymentId ?? index}`}
                      className="p-5"
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={flag.severity} />
                            <Badge variant="outline" className="uppercase tracking-[0.12em]">
                              {formatFlagType(flag.type)}
                            </Badge>
                            {flag.sessionId ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSessionId(flag.sessionId)}
                                className="h-8 gap-2 lg:hidden"
                              >
                                <Eye className="size-4" strokeWidth={1.8} />
                                View evidence
                              </Button>
                            ) : (
                              <Badge variant="outline" className="lg:hidden">
                                No linked session
                              </Badge>
                            )}
                          </div>

                          <p className="mt-3 text-sm font-semibold leading-6 text-foreground">
                            {flag.message}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                            {flag.sessionCode ? <span>Session {flag.sessionCode}</span> : null}
                            {flag.reservationCode ? <span>Reservation {flag.reservationCode}</span> : null}
                            {flag.plateNumber ? <span>Plate {flag.plateNumber}</span> : null}
                            {flag.paymentId ? <span>Payment {shortCode(flag.paymentId)}</span> : null}
                          </div>
                        </div>

                        <div className="flex min-h-full flex-col justify-between gap-3 rounded-2xl border bg-muted/25 p-3">
                          <div className="text-left text-xs font-medium text-muted-foreground lg:text-right">
                            <p>{flag.ageMinutes} minutes old</p>
                            <p className="mt-1">{formatDateTimeVN(flag.createdAt)}</p>
                          </div>

                          <div className="flex lg:justify-end">
                            {flag.sessionId ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedSessionId(flag.sessionId)}
                                className="hidden h-8 gap-2 lg:inline-flex"
                              >
                                <Eye className="size-4" strokeWidth={1.8} />
                                View evidence
                              </Button>
                            ) : (
                              <Badge variant="outline" className="h-8 px-3">
                                No linked session
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          <Sheet
            open={selectedSessionId !== null}
            onOpenChange={(open) => !open && setSelectedSessionId(null)}
          >
            <SheetContent side="right" className="w-full sm:max-w-3xl">
              <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
                <SheetHeader className="border-b pb-4">
                  <SheetTitle>Evidence audit</SheetTitle>
                  <SheetDescription>
                    Compare check-in and check-out OCR captures for the selected flagged session.
                  </SheetDescription>
                </SheetHeader>

                {evidenceLoading ? <ReportsLoadingState rows={2} compact /> : null}

                {evidenceError ? (
                  <Card className="border-destructive/30 bg-destructive/10 text-destructive">
                    <CardContent className="py-4 text-sm font-semibold">{evidenceError}</CardContent>
                  </Card>
                ) : null}

                {selectedEvidence ? (
                  <div className="space-y-4">
                    <Card className="bg-muted/25">
                      <CardContent className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Session
                        </p>
                        <p className="mt-2 font-mono text-xl font-black text-foreground">
                          {selectedEvidence.session.sessionCode}
                        </p>
                        <p className="mt-2 text-sm font-medium text-muted-foreground">
                          Plate{' '}
                          {selectedEvidence.session.plateNumberConfirmed ??
                            selectedEvidence.session.licensePlate}
                          {selectedEvidence.session.slotCode
                            ? ` • Slot ${selectedEvidence.session.slotCode}`
                            : ''}
                        </p>
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
}: {
  label: string
  value: string | number
  helper?: string
  icon?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          {icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-3xl font-black tracking-tight text-foreground">{value}</p>
        {helper ? <p className="mt-2 text-xs font-medium text-muted-foreground">{helper}</p> : null}
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
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
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
          className={compact ? 'h-28 rounded-2xl' : 'h-16 rounded-2xl'}
        />
      ))}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: AdminFlagSeverity }) {
  const className =
    severity === 'critical'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100'
      : severity === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100'
        : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100'

  return (
    <Badge variant="outline" className={className}>
      {severity.toUpperCase()}
    </Badge>
  )
}

function formatFlagType(type: string) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function shortCode(value: string) {
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}
