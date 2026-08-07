import { useState } from 'react'
import { isAxiosError } from 'axios'
import { NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeCheck,
  CreditCard,
  FileWarning,
  IdCard,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react'
import api from '../../lib/api'
import { RequestManagerReviewDialog } from '../../components/operation-issues/RequestManagerReviewDialog'
import { useToasts } from '../../lib/use-toasts'
import { formatDateTimeVN } from '../../lib/date-time'
import {
  lookupSessionForCheckout,
  type CheckoutWorkflowResponse,
} from '../../lib/sessions-api'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'

const LOST_TICKET_SURCHARGE = 100000
const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`
const normalizePlate = (value: string) => value.trim().toUpperCase()

interface LostTicketResult {
  session: {
    id: string
    licensePlate: string
    vehicleType: string
    checkInTime: string
    isLostTicket: boolean
  }
  slot: {
    code: string
    floor: string
  }
  breakdown: {
    roundedHours: number
    hourlyRate: number
    baseFee: number
    isOvertime: boolean
    overtimePenalty: number
    isLostTicket: boolean
    lostTicketPenalty: number
    totalFee: number
  }
}

export default function LostTicket() {
  const toasts = useToasts()

  const [licensePlate, setLicensePlate] = useState('')
  const [idCardNo, setIdCardNo] = useState('')
  const [driverLicenseNo, setDriverLicenseNo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [preview, setPreview] = useState<CheckoutWorkflowResponse | null>(null)
  const [result, setResult] = useState<LostTicketResult | null>(null)

  const reset = () => {
    setLicensePlate('')
    setIdCardNo('')
    setDriverLicenseNo('')
    setPreview(null)
    setResult(null)
  }

  const handlePlateChange = (value: string) => {
    setLicensePlate(value.toUpperCase())
    setPreview(null)
    setResult(null)
  }

  const handleLookup = async () => {
    const plate = normalizePlate(licensePlate)
    if (!plate) {
      toasts.showError('Enter a license plate before searching')
      return
    }

    setLookupLoading(true)
    try {
      const data = await lookupSessionForCheckout({ licensePlate: plate })
      setPreview(data)
      toasts.showSuccess('Active session found')
    } catch (err) {
      setPreview(null)
      toasts.showError(readApiError(err, 'No active session found for this plate'))
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const plate = normalizePlate(licensePlate)
    if (!plate || !idCardNo.trim() || !driverLicenseNo.trim()) {
      toasts.showError('Please fill in all required fields')
      return
    }

    const confirmed = window.confirm(
      `Apply lost ticket surcharge of ${VND(LOST_TICKET_SURCHARGE)} to plate ${plate}?`,
    )
    if (!confirmed) return

    setSubmitting(true)
    try {
      const { data } = await api.post<LostTicketResult>('/tickets/lost', {
        licensePlate: plate,
        idCardNo: idCardNo.trim(),
        driverLicenseNo: driverLicenseNo.trim(),
      })
      setResult(data)
      toasts.showSuccess('Lost ticket fee recorded')
    } catch (err) {
      toasts.showError(readApiError(err, 'Unable to process lost ticket'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[calc(100svh-5rem)] bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Lost Ticket Handling
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Verify identity and apply lost ticket fee
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Use this page only when a driver cannot present the parking ticket. Staff must verify identity before recording the lost ticket surcharge.
            </p>
          </div>
          <Badge variant="outline" className="h-10 px-4 text-sm font-bold border-amber-200 bg-amber-50 text-amber-900 shrink-0">
            Surcharge: {VND(LOST_TICKET_SURCHARGE)}
          </Badge>
        </div>

        <div>
          {result ? (
            <ResultView result={result} checkoutSessionCode={preview?.session.sessionCode} onReset={reset} />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <Card>
                <form onSubmit={handleSubmit}>
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <IdCard className="h-5 w-5" strokeWidth={1.8} />
                      </div>
                      <div>
                        <CardTitle>Driver identity check</CardTitle>
                        <CardDescription>
                          Complete all fields, then verify the matching active session.
                        </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="licensePlate">License plate <span className="text-destructive">*</span></Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            id="licensePlate"
                            className="uppercase sm:flex-1"
                            placeholder="E.g. 59A-12345"
                            value={licensePlate}
                            onChange={(e) => handlePlateChange(e.target.value)}
                            autoFocus
                            autoComplete="off"
                          />
                          <Button
                            type="button"
                            onClick={() => void handleLookup()}
                            disabled={lookupLoading || !licensePlate.trim()}
                          >
                            {lookupLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} />
                            ) : (
                              <Search className="mr-2 h-4 w-4" strokeWidth={1.8} />
                            )}
                            Find session
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="idCardNo">Citizen ID / ID card number <span className="text-destructive">*</span></Label>
                        <Input
                          id="idCardNo"
                          placeholder="E.g. 079123456789"
                          value={idCardNo}
                          onChange={(e) => setIdCardNo(e.target.value)}
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="driverLicenseNo">Driver license number <span className="text-destructive">*</span></Label>
                        <Input
                          id="driverLicenseNo"
                          placeholder="E.g. B2-123456"
                          value={driverLicenseNo}
                          onChange={(e) => setDriverLicenseNo(e.target.value)}
                          autoComplete="off"
                        />
                      </div>

                      <Alert className="border-amber-200 bg-amber-50">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-900 font-bold">Identity verification required</AlertTitle>
                        <AlertDescription className="text-amber-800 flex flex-col sm:flex-row sm:items-start gap-3 justify-between mt-2">
                          <span className="leading-relaxed">Confirm that the ID card and driver license belong to the requesting person. If identity cannot be verified, contact the manager before proceeding.</span>
                          <RequestManagerReviewDialog
                            defaultType="lost_ticket_review"
                            defaultSeverity="critical"
                            defaultNote={`Lost ticket identity review for ${licensePlate || 'unknown plate'}.`}
                            sessionId={preview?.session.id}
                            plateNumber={licensePlate}
                            trigger={
                              <Button variant="outline" size="sm" type="button" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100 shrink-0">
                                Request Manager Review
                              </Button>
                            }
                          />
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                    
                    <CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center bg-slate-50 dark:bg-slate-900/50 pt-6 rounded-b-xl border-t">
                      <Button type="submit" disabled={submitting}>
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} />
                        ) : (
                          <FileWarning className="mr-2 h-4 w-4" strokeWidth={1.8} />
                        )}
                        {submitting ? 'Applying fee...' : 'Verify and apply lost ticket fee'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={reset} disabled={submitting}>
                        Clear
                      </Button>
                    </CardFooter>
                  </form>
                </Card>

                <aside className="space-y-5">
                  <SessionPreviewCard preview={preview} lookupLoading={lookupLoading} />
                  <PolicyCard />
                </aside>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}

function SessionPreviewCard({
  preview,
  lookupLoading,
}: {
  preview: CheckoutWorkflowResponse | null
  lookupLoading: boolean
}) {
  return (
    <Card className="bg-slate-50/50">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <CardTitle>Possible active session</CardTitle>
            <CardDescription>Read-only preview before the fee is recorded.</CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {lookupLoading ? (
          <div className="rounded-xl border bg-background p-4 text-sm font-medium text-muted-foreground text-center">
            Searching active session...
          </div>
        ) : preview ? (
          <dl className="grid gap-2">
            <PreviewRow label="Plate" value={preview.session.licensePlate} strong />
            <PreviewRow label="Session code" value={preview.session.sessionCode} />
            <PreviewRow label="Vehicle" value={preview.session.vehicleType === 'car' ? 'Car' : 'Motorbike'} />
            <PreviewRow label="Exit lane" value={preview.checkOutLane ? `${preview.checkOutLane.code} (${preview.checkOutLane.vehicleType === 'car' ? 'Car' : 'Motorbike'})` : 'Ground floor'} />
            <PreviewRow label="Check-in" value={formatDateTimeVN(preview.session.checkInTime)} />
            <PreviewRow label="Current fee" value={VND(preview.fee.total)} strong />
          </dl>
        ) : (
          <div className="rounded-xl border border-dashed p-5 text-sm font-medium leading-6 text-muted-foreground text-center">
            Enter a plate number and select <span className="font-bold text-foreground">Find session</span> to verify the active parking session before applying the surcharge.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PolicyCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <CardTitle>Lost ticket policy</CardTitle>
            <CardDescription>What happens after confirmation.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm font-medium leading-6 text-muted-foreground">
          <li className="flex gap-2 items-start">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            The session is marked as lost ticket and stores the verified identity numbers.
          </li>
          <li className="flex gap-2 items-start">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            The surcharge is added to the checkout fee calculation.
          </li>
          <li className="flex gap-2 items-start">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            Payment and vehicle exit still continue on the Gate checkout workflow.
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

function PreviewRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 shadow-sm">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`text-right text-sm ${strong ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
        {value}
      </dd>
    </div>
  )
}

function ResultView({
  result,
  checkoutSessionCode,
  onReset,
}: {
  result: LostTicketResult
  checkoutSessionCode?: string
  onReset: () => void
}) {
  const { session, slot, breakdown } = result
  const checkoutLookupCode = checkoutSessionCode || session.id
  const checkoutHref = `/staff/gate?tab=check-out&sessionCode=${encodeURIComponent(checkoutLookupCode)}`

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
              <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <CardTitle className="text-emerald-900">Lost ticket fee recorded</CardTitle>
              <CardDescription className="text-emerald-800">
                Continue checkout and payment from the Gate page.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 sm:grid-cols-2">
            <ResultRow label="License plate" value={session.licensePlate} />
            <ResultRow label="Vehicle type" value={session.vehicleType === 'car' ? 'Car' : 'Motorbike'} />
            <ResultRow label="Slot" value={`${slot.code} - ${slot.floor}`} />
            <ResultRow label="Check-in time" value={formatDateTimeVN(session.checkInTime)} />
          </dl>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row bg-emerald-100/50 pt-6 rounded-b-xl border-t border-emerald-200">
          <Button variant="secondary" onClick={onReset}>
            Handle another case
          </Button>
          <Button asChild>
            <NavLink to={checkoutHref}>
              Open Gate checkout
            </NavLink>
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <CardTitle>Fee summary</CardTitle>
              <CardDescription>Calculated by backend fee rules.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <FeeRow
              label={`Base fee (${breakdown.roundedHours}h x ${VND(breakdown.hourlyRate)})`}
              value={breakdown.baseFee}
            />
            {breakdown.isOvertime ? (
              <FeeRow label="Overtime surcharge" value={breakdown.overtimePenalty} tone="warning" />
            ) : null}
            <FeeRow label="Lost ticket surcharge" value={breakdown.lostTicketPenalty} tone="danger" />
            <div className="flex justify-between border-t pt-3 text-lg font-bold text-foreground mt-4">
              <span>Total</span>
              <span>{VND(breakdown.totalFee)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
      <dt className="text-xs font-medium text-emerald-700">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-emerald-950">{value}</dd>
    </div>
  )
}

function FeeRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'warning' | 'danger'
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-700 bg-rose-50'
      : tone === 'warning'
        ? 'text-amber-700 bg-amber-50'
        : 'text-foreground bg-slate-50'

  return (
    <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 font-medium ${toneClass}`}>
      <span>{label}</span>
      <span className="font-bold">{VND(value)}</span>
    </div>
  )
}

function readApiError(err: unknown, fallback: string) {
  if (!isAxiosError(err)) return fallback
  const msg = err.response?.data?.message
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg)) return msg.join(', ')
  return fallback
}
