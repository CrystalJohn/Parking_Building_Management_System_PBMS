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
import { useToasts } from '../../lib/use-toasts'
import { formatDateTimeVN } from '../../lib/date-time'
import {
  lookupSessionForCheckout,
  type CheckoutWorkflowResponse,
} from '../../lib/sessions-api'

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
    <div className="bg-slate-100 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 pb-5 sm:px-6 print:max-w-none print:p-0">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-6">
          <header className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-600">
                Lost Ticket Handling
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Verify identity and apply lost ticket fee
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Use this page only when a driver cannot present the parking ticket. Staff must verify identity before recording the lost ticket surcharge.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
              Surcharge: {VND(LOST_TICKET_SURCHARGE)}
            </div>
          </header>

          {result ? (
            <ResultView result={result} checkoutSessionCode={preview?.session.sessionCode} onReset={reset} />
          ) : (
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                    <IdCard className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-950">
                      Driver identity check
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      Complete all fields, then verify the matching active session.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <Field label="License plate" required>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="input uppercase sm:flex-1"
                        placeholder="E.g. 59A-12345"
                        value={licensePlate}
                        onChange={(e) => handlePlateChange(e.target.value)}
                        autoFocus
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => void handleLookup()}
                        disabled={lookupLoading || !licensePlate.trim()}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {lookupLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                        ) : (
                          <Search className="h-4 w-4" strokeWidth={1.8} />
                        )}
                        Find session
                      </button>
                    </div>
                  </Field>

                  <Field label="Citizen ID / ID card number" required>
                    <input
                      className="input"
                      placeholder="E.g. 079123456789"
                      value={idCardNo}
                      onChange={(e) => setIdCardNo(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>

                  <Field label="Driver license number" required>
                    <input
                      className="input"
                      placeholder="E.g. B2-123456"
                      value={driverLicenseNo}
                      onChange={(e) => setDriverLicenseNo(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" strokeWidth={1.8} />
                      <div>
                        <p className="text-sm font-black text-amber-900">
                          Identity verification required
                        </p>
                        <p className="mt-1 text-sm font-medium leading-6 text-amber-800">
                          Confirm that the ID card and driver license belong to the requesting person. If identity cannot be verified, contact the manager before proceeding.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                    <button
                      type="submit"
                      className="btn-primary inline-flex min-h-11 items-center justify-center gap-2"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                      ) : (
                        <FileWarning className="h-4 w-4" strokeWidth={1.8} />
                      )}
                      {submitting ? 'Applying fee...' : 'Verify and apply lost ticket fee'}
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="btn-secondary min-h-11"
                      disabled={submitting}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </form>

              <aside className="space-y-5">
                <SessionPreviewCard preview={preview} lookupLoading={lookupLoading} />
                <PolicyCard />
              </aside>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
    </label>
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
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-950">
            Possible active session
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Read-only preview before the fee is recorded.
          </p>
        </div>
      </div>

      {lookupLoading ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">
          Searching active session...
        </div>
      ) : preview ? (
        <dl className="mt-5 grid gap-2">
          <PreviewRow label="Plate" value={preview.session.licensePlate} strong />
          <PreviewRow label="Session code" value={preview.session.sessionCode} />
          <PreviewRow label="Vehicle" value={preview.session.vehicleType === 'car' ? 'Car' : 'Motorbike'} />
          <PreviewRow label="Slot" value={`${preview.slot.code} - Floor ${preview.slot.floor.name}`} />
          <PreviewRow label="Check-in" value={formatDateTimeVN(preview.session.checkInTime)} />
          <PreviewRow label="Current fee" value={VND(preview.fee.total)} strong />
        </dl>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-medium leading-6 text-slate-500">
          Enter a plate number and select <span className="font-black text-slate-700">Find session</span> to verify the active parking session before applying the surcharge.
        </div>
      )}
    </section>
  )
}

function PolicyCard() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-950">Lost ticket policy</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            What happens after confirmation.
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-3 text-sm font-medium leading-6 text-slate-600">
        <li className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          The session is marked as lost ticket and stores the verified identity numbers.
        </li>
        <li className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          The surcharge is added to the checkout fee calculation.
        </li>
        <li className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          Payment and vehicle exit still continue on the Gate checkout workflow.
        </li>
      </ul>
    </section>
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className={`text-right text-sm ${strong ? 'font-black text-slate-950' : 'font-bold text-slate-700'}`}>
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
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
            <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-lg font-black text-emerald-900">
              Lost ticket fee recorded
            </h2>
            <p className="mt-1 text-sm font-medium text-emerald-800">
              Continue checkout and payment from the Gate page.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-2 sm:grid-cols-2">
          <ResultRow label="License plate" value={session.licensePlate} />
          <ResultRow label="Vehicle type" value={session.vehicleType === 'car' ? 'Car' : 'Motorbike'} />
          <ResultRow label="Slot" value={`${slot.code} - ${slot.floor}`} />
          <ResultRow label="Check-in time" value={formatDateTimeVN(session.checkInTime)} />
        </dl>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button onClick={onReset} className="btn-secondary min-h-11">
            Handle another case
          </button>
          <NavLink to={checkoutHref} className="btn-primary inline-flex min-h-11 items-center justify-center">
            Open Gate checkout
          </NavLink>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
            <CreditCard className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950">Fee summary</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Calculated by backend fee rules.</p>
          </div>
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <FeeRow
            label={`Base fee (${breakdown.roundedHours}h x ${VND(breakdown.hourlyRate)})`}
            value={breakdown.baseFee}
          />
          {breakdown.isOvertime ? (
            <FeeRow label="Overtime surcharge" value={breakdown.overtimePenalty} tone="warning" />
          ) : null}
          <FeeRow label="Lost ticket surcharge" value={breakdown.lostTicketPenalty} tone="danger" />
          <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-black text-slate-950">
            <span>Total</span>
            <span>{VND(breakdown.totalFee)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-white/80 p-3">
      <dt className="text-xs font-bold text-emerald-700">{label}</dt>
      <dd className="mt-1 text-sm font-black text-emerald-950">{value}</dd>
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
      ? 'text-rose-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : 'text-slate-700'

  return (
    <div className={`flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 font-bold ${toneClass}`}>
      <span>{label}</span>
      <span>{VND(value)}</span>
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
