import { useState } from 'react'
import { isAxiosError } from 'axios'
import { NavLink, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'
import { formatDateTimeVN } from '../../lib/date-time'
import { clearAuth, getUser } from '../../lib/auth'

const STAFF_NAV = [
  { to: '/staff/gate', label: 'Gate' },
  { to: '/staff/lost-ticket', label: 'Lost Ticket' },
]

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const formatDateTime = formatDateTimeVN

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

/**
 * 24.4: Staff Lost Ticket page.
 * Form to verify driver identity and process lost ticket with penalty.
 * Req 5.6, 7.3, 7.4
 */
export default function LostTicket() {
  const toasts = useToasts()
  const navigate = useNavigate()
  const user = getUser()
  const userInitial = (user?.fullName || user?.phone || 'S')[0].toUpperCase()

  const [licensePlate, setLicensePlate] = useState('')
  const [idCardNo, setIdCardNo] = useState('')
  const [driverLicenseNo, setDriverLicenseNo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<LostTicketResult | null>(null)

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const reset = () => {
    setLicensePlate('')
    setIdCardNo('')
    setDriverLicenseNo('')
    setResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!licensePlate.trim() || !idCardNo.trim() || !driverLicenseNo.trim()) {
      toasts.showError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post('/tickets/lost', {
        licensePlate: licensePlate.trim().toUpperCase(),
        idCardNo: idCardNo.trim(),
        driverLicenseNo: driverLicenseNo.trim(),
      })
      setResult(data)
      toasts.showSuccess('Lost ticket processed — fee updated')
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status
        const msg = err.response?.data?.message
        const text = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : undefined

        if (status === 404) {
          toasts.showError(text ?? 'No parking session found for this plate')
        } else {
          toasts.showError(text ?? `Error (${status ?? 'network'})`)
        }
      } else {
        toasts.showError('Unknown error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-50 border-b border-slate-200/80 bg-slate-100/95 shadow-sm backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-2.5 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary-600 to-slate-950 text-xs font-black text-white shadow-md">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {user?.fullName || user?.phone || 'Gate Staff'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Gate Operator
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-1 lg:border-l lg:border-slate-300 lg:pl-3" aria-label="Staff navigation">
              {STAFF_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-950 hover:text-white focus:outline-none"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 print:max-w-none print:p-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-5">
          <div className="max-w-xl mx-auto space-y-6">
            <header>
              <h1 className="text-2xl font-bold text-slate-950">Lost ticket</h1>
              <p className="text-sm text-gray-500">
                Verify driver identity before processing. Surcharge: 100,000 VND.
              </p>
            </header>

            {result ? (
              <ResultView result={result} onReset={reset} />
            ) : (
              <form onSubmit={handleSubmit} className="card space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    License plate <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input uppercase"
                    placeholder="e.g. 59A-12345"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID card number <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. 079123456789"
                    value={idCardNo}
                    onChange={(e) => setIdCardNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driver license number <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. B2-123456"
                    value={driverLicenseNo}
                    onChange={(e) => setDriverLicenseNo(e.target.value)}
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                  <p className="font-medium">Note:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>Verify ID card and driver license match the requesting person</li>
                    <li>Lost ticket surcharge: 100,000 VND will be added to the fee</li>
                    <li>If identity cannot be verified, contact the manager for assistance</li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Processing...' : 'Confirm lost ticket'}
                  </button>
                </div>
              </form>
            )}

            <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
          </div>
        </div>
      </main>
    </div>
  )
}

function ResultView({
  result,
  onReset,
}: {
  result: LostTicketResult
  onReset: () => void
}) {
  const { session, slot, breakdown } = result

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold text-green-700">
        Lost ticket processed
      </h2>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">License plate</dt>
        <dd className="font-medium">{session.licensePlate}</dd>

        <dt className="text-gray-500">Vehicle type</dt>
        <dd>{session.vehicleType === 'car' ? 'Car' : 'Motorbike'}</dd>

        <dt className="text-gray-500">Slot</dt>
        <dd>{slot.code} — {slot.floor}</dd>

        <dt className="text-gray-500">Check-in time</dt>
        <dd>{formatDateTime(session.checkInTime)}</dd>
      </dl>

      <div className="border-t border-gray-200 pt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">
            Base fee ({breakdown.roundedHours}h x {VND(breakdown.hourlyRate)})
          </span>
          <span>{VND(breakdown.baseFee)}</span>
        </div>
        {breakdown.isOvertime && (
          <div className="flex justify-between text-yellow-700">
            <span>Overtime surcharge (&gt;24h)</span>
            <span>{VND(breakdown.overtimePenalty)}</span>
          </div>
        )}
        <div className="flex justify-between text-red-700">
          <span>Lost ticket surcharge</span>
          <span>{VND(breakdown.lostTicketPenalty)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
          <span>Total</span>
          <span>{VND(breakdown.totalFee)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
        Continue check-out normally via the Check-out tab (Gate page).
        The lost ticket fee has been recorded to the session.
      </p>

      <button onClick={onReset} className="btn-secondary">
        Handle another case
      </button>
    </div>
  )
}
