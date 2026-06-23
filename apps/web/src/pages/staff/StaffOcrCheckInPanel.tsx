import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { getUser } from '../../lib/auth'
import { formatDateTimeVN } from '../../lib/date-time'
import { useToasts } from '../../lib/use-toasts'
import { RecentSessionsCard } from '../../components/ui/RecentSessionsCard'
import {
  checkIn,
  issueSessionTicket,
  recognizePlateImage,
  type AssignedSlot,
  type OcrRecognizeResponse,
  type SessionTicket,
  type VehicleType,
  type Zone,
} from '../../lib/sessions-api'

type GateStatus =
  | 'CAMERA_READY'
  | 'CAPTURING'
  | 'OCR_PROCESSING'
  | 'OCR_SUCCESS'
  | 'OCR_FAILED'
  | 'REVIEW_REQUIRED'
  | 'CHECKING_IN'
  | 'CHECKIN_SUCCESS'
  | 'GENERATING_TICKET'
  | 'TICKET_READY'
  | 'PRINT_DIALOG_OPENED'
  | 'TICKET_ISSUED'
  | 'ERROR'

type CheckInServiceMode = 'walk-in' | 'reservation'

type Props = {
  toasts: ReturnType<typeof useToasts>
}

const BUILDING_NAME = import.meta.env.VITE_PBMS_BUILDING_NAME ?? 'PBMS Building'
const GATE_NAME = import.meta.env.VITE_PBMS_GATE_NAME ?? 'Main Gate'
const CAMERA_ID = import.meta.env.VITE_PLATE_RECOGNIZER_CAMERA_ID ?? 'staff-gate-camera'

const CHECK_IN_MODES: Array<{
  id: CheckInServiceMode
  title: string
  subtitle: string
}> = [
  {
    id: 'walk-in',
    title: 'No reservation',
    subtitle: 'Walk-in, no reservation',
  },
  {
    id: 'reservation',
    title: 'Reservation valid',
    subtitle: 'Customer reserved via mobile',
  },
]

export function StaffOcrCheckInPanel({ toasts }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ocrRequestIdRef = useRef(0)

  const [status, setStatus] = useState<GateStatus>('CAMERA_READY')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrRecognizeResponse | null>(null)
  const [serviceMode, setServiceMode] = useState<CheckInServiceMode>('walk-in')
  const [reservationId, setReservationId] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [ticket, setTicket] = useState<SessionTicket | null>(null)
  const [issuedAt, setIssuedAt] = useState<string | null>(null)
  const [showReservationScanner, setShowReservationScanner] = useState(false)
  const [now, setNow] = useState(new Date())
  const [checkInCount, setCheckInCount] = useState(0)

  const user = getUser()
  const activeMode = CHECK_IN_MODES.find((mode) => mode.id === serviceMode) ?? CHECK_IN_MODES[0]
  const reservationCode = reservationId.trim()
  const checkInMode =
    serviceMode === 'reservation' ? 'Reservation check-in' : 'Walk-in / no reservation'
  const canConfirm =
    Boolean(licensePlate.trim()) &&
    (serviceMode === 'walk-in' || Boolean(reservationCode)) &&
    status !== 'OCR_PROCESSING' &&
    status !== 'CHECKING_IN'
  const canPrint = Boolean(ticket) && (status === 'TICKET_READY' || status === 'PRINT_DIALOG_OPENED')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setCameraError(null)
        setStatus((current) => (current === 'ERROR' ? 'CAMERA_READY' : current))
      } catch (error) {
        setCameraError(extractErrorMessage(error))
        setStatus('ERROR')
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl)
      }
    }
    // capturedImageUrl intentionally excluded; cleanup should run for the screen lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = useCallback(() => {
    setStatus('CAMERA_READY')
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setOcrResult(null)
    setServiceMode('walk-in')
    setReservationId('')
    setLicensePlate('')
    setVehicleType('car')
    setTicket(null)
    setIssuedAt(null)
    setShowReservationScanner(false)
  }, [])

  const chooseServiceMode = useCallback((nextMode: CheckInServiceMode) => {
    setServiceMode(nextMode)
    if (nextMode === 'walk-in') {
      setReservationId('')
    }
  }, [])

  const handleReservationQrScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowReservationScanner(false)
    if (!code) {
      toasts.showError('Invalid reservation QR')
      return
    }

    setServiceMode('reservation')
    setReservationId(code)
    toasts.showSuccess('Reservation QR received')
  }, [toasts])

  const captureAndRecognize = useCallback(async () => {
    if (status === 'OCR_PROCESSING' || status === 'CHECKING_IN') return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toasts.showError('Camera is not ready yet')
      return
    }

    setStatus('CAPTURING')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')
    if (!context) {
      setStatus('ERROR')
      toasts.showError('Cannot capture camera frame')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9)
    })

    if (!blob) {
      setStatus('ERROR')
      toasts.showError('Cannot prepare image for OCR')
      return
    }

    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(blob)
    })
    setOcrResult(null)
    setStatus('OCR_PROCESSING')

    const requestId = ++ocrRequestIdRef.current
    try {
      const response = await recognizePlateImage({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
        reservationId: serviceMode === 'reservation' ? reservationCode || undefined : undefined,
      })
      if (requestId !== ocrRequestIdRef.current) return

      setOcrResult(response)
      if (response.detectedPlate) {
        setLicensePlate(response.detectedPlate)
        setStatus('OCR_SUCCESS')
        toasts.showSuccess(`Plate detected: ${response.detectedPlate}`)
      } else {
        setStatus('OCR_FAILED')
        toasts.showError(response.error ?? 'OCR failed, please enter plate manually')
      }
    } catch (error) {
      if (requestId !== ocrRequestIdRef.current) return
      setOcrResult(null)
      setStatus('OCR_FAILED')
      toasts.showError(extractErrorMessage(error))
    }
  }, [reservationCode, serviceMode, status, toasts])

  const confirmCheckIn = useCallback(async () => {
    if (serviceMode === 'reservation' && !reservationCode) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please scan or enter the Reservation QR before reservation check-in')
      return
    }

    if (!licensePlate.trim()) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please confirm or enter a license plate before check-in')
      return
    }

    setStatus('CHECKING_IN')
    try {
      const response = await checkIn({
        licensePlate: licensePlate.trim().toUpperCase(),
        vehicleType,
        reservationId: serviceMode === 'reservation' ? reservationCode : undefined,
        ocrEvidenceId: ocrResult?.ocrEvidenceId,
        identificationMethod: serviceMode === 'reservation'
          ? 'RESERVATION_QR'
          : ocrResult?.ocrEvidenceId
            ? 'OCR'
            : 'MANUAL_PLATE',
        identificationConfidence: ocrResult?.confidence ?? undefined,
      })
      toasts.showSuccess(
        serviceMode === 'reservation'
          ? `Check-in successful. Reservation fulfilled. Slot ${response.slot.code} assigned.`
          : `Check-in successful. Slot ${response.slot.code} assigned. Ticket generated.`,
      )

      if (response.ticket) {
        setTicket(normalizeSessionTicket(response.ticket, response.slot))
        setCheckInCount((c) => c + 1)
        window.setTimeout(() => setStatus('TICKET_READY'), 250)
      } else {
        setCheckInCount((c) => c + 1)
        setStatus('CHECKIN_SUCCESS')
      }
    } catch (error) {
      setStatus('ERROR')
      toasts.showError(extractErrorMessage(error))
    }
  }, [licensePlate, ocrResult, reservationCode, serviceMode, toasts, vehicleType])

  const printTicket = useCallback(() => {
    if (!ticket) return
    setStatus('PRINT_DIALOG_OPENED')
    toasts.showSuccess('Ticket ready for printing.')
    window.print()
  }, [ticket, toasts])

  const markTicketIssued = useCallback(async () => {
    if (!ticket) return
    try {
      const response = await issueSessionTicket(ticket.sessionId)
      setIssuedAt(response.ticketIssuedAt)
      setStatus('TICKET_ISSUED')
      toasts.showSuccess('Ticket issued to driver')
    } catch (error) {
      toasts.showError(extractErrorMessage(error))
    }
  }, [ticket, toasts])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (event.key === 'Escape') {
        event.preventDefault()
        reset()
        return
      }

      if (isTyping) return

      if (event.code === 'Space') {
        event.preventDefault()
        void captureAndRecognize()
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        void confirmCheckIn()
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (canPrint) printTicket()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPrint, captureAndRecognize, confirmCheckIn, printTicket, reset])

  const statusLabel = useMemo(() => {
    switch (status) {
      case 'CAPTURING':
        return 'Capturing...'
      case 'OCR_PROCESSING':
        return 'Recognizing plate...'
      case 'OCR_SUCCESS':
        return 'Plate detected'
      case 'OCR_FAILED':
        return 'OCR failed, please enter plate manually'
      case 'REVIEW_REQUIRED':
        return 'Review required'
      case 'CHECKING_IN':
        return 'Creating parking session...'
      case 'CHECKIN_SUCCESS':
        return 'Check-in successful'
      case 'GENERATING_TICKET':
        return 'Generating session ticket...'
      case 'TICKET_READY':
        return 'Ticket ready for printing'
      case 'PRINT_DIALOG_OPENED':
        return 'Print dialog opened'
      case 'TICKET_ISSUED':
        return 'Ticket issued to driver'
      case 'ERROR':
        return cameraError ?? 'Error'
      default:
        return 'Camera Ready - Press Space to capture plate'
    }
  }, [cameraError, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Check-in Service</h2>
          <p className="text-sm text-gray-500">
            Select the correct service mode before OCR. Space to capture, Enter to confirm, Esc to reset.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm">
          <span className="font-semibold">{formatDateTimeVN(now)}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
        <section className="rounded-2xl border border-gray-200 bg-slate-950 p-4 text-white shadow-sm print:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Real-time Camera + OCR Evidence</h3>
              <p className="text-xs text-slate-300">{statusLabel}</p>
            </div>
            <button
              type="button"
              onClick={captureAndRecognize}
              disabled={status === 'OCR_PROCESSING' || status === 'CHECKING_IN'}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Capture OCR
            </button>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-700 bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {cameraError && (
              <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm text-red-200">
                {cameraError}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <EvidencePreview title="Captured OCR evidence" imageUrl={capturedImageUrl} />
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
              <p className="font-semibold text-slate-100">OCR result</p>
              <dl className="mt-3 grid grid-cols-2 gap-y-2">
                <dt className="text-slate-400">Plate</dt>
                <dd className="font-mono">{ocrResult?.detectedPlate ?? 'N/A'}</dd>
                <dt className="text-slate-400">Confidence</dt>
                <dd>{ocrResult?.confidence != null ? `${Math.round(ocrResult.confidence * 100)}%` : 'N/A'}</dd>
                <dt className="text-slate-400">Duration</dt>
                <dd>{ocrResult ? `${(ocrResult.durationMs / 1000).toFixed(1)}s` : 'N/A'}</dd>
                <dt className="text-slate-400">Evidence ID</dt>
                <dd className="break-all font-mono text-xs">{ocrResult?.ocrEvidenceId ?? 'N/A'}</dd>
              </dl>
              {ocrResult?.error && (
                <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-200">
                  {ocrResult.error}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <div className="flex items-start justify-between gap-3 print:hidden">
            <div>
              <h3 className="font-semibold text-gray-900">Service Mode + Actions</h3>
              <p className="text-sm text-gray-500">{checkInMode}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                serviceMode === 'reservation'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {activeMode.title}
            </span>
          </div>

          <div className="mt-4 space-y-4 print:hidden">
            <div className="grid gap-2">
              {CHECK_IN_MODES.map((mode) => {
                const selected = serviceMode === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => chooseServiceMode(mode.id)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-black">{mode.title}</span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          selected ? 'bg-emerald-400' : 'bg-gray-300'
                        }`}
                      />
                    </span>
                    <span className={`mt-1 block text-sm ${selected ? 'text-slate-200' : 'text-gray-500'}`}>
                      {mode.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>

            {serviceMode === 'reservation' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <Field label="Reservation ID / Reservation QR input">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="input font-mono text-xs"
                      value={reservationId}
                      onChange={(event) => setReservationId(event.target.value)}
                      placeholder="Scan or paste reservation UUID/code"
                    />
                    <button
                      type="button"
                      onClick={() => setShowReservationScanner(true)}
                      className="btn-primary shrink-0"
                    >
                      Scan QR
                    </button>
                  </div>
                </Field>
              </div>
            ) : (
              null
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="OCR detected plate">
                <input className="input bg-gray-50" value={ocrResult?.detectedPlate ?? ''} readOnly />
              </Field>
              <Field label="Confirmed license plate">
                <input
                  className="input uppercase"
                  value={licensePlate}
                  onChange={(event) => setLicensePlate(event.target.value)}
                  placeholder="VD: 59A-12345"
                />
              </Field>
            </div>

            <Field label="Vehicle type">
              <div className="flex gap-3">
                {(['car', 'motorbike'] as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setVehicleType(type)}
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm font-bold capitalize ${
                      vehicleType === type
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-2 rounded-xl bg-gray-50 p-3 text-sm">
              <InfoLine label="Building" value={ocrResult?.buildingName ?? BUILDING_NAME} />
              <InfoLine label="Gate" value={ocrResult?.gateName ?? GATE_NAME} />
              <InfoLine label="Staff" value={user?.fullName || user?.phone || user?.id || 'N/A'} />
              <InfoLine label="Check-in time" value={formatDateTimeVN(now)} />
              <InfoLine
                label="Service mode"
                value={serviceMode === 'reservation' ? 'Reservation check-in' : 'Walk-in / no reservation'}
              />
              <InfoLine label="Reservation info" value={reservationCode || 'Not used'} />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={confirmCheckIn}
                disabled={!canConfirm}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {status === 'CHECKING_IN'
                  ? 'Checking in...'
                  : serviceMode === 'reservation'
                    ? 'Confirm Reservation Check-in'
                    : 'Confirm Walk-in Check-in'}
              </button>
              <button type="button" onClick={reset} className="btn-secondary">
                Reset
              </button>
            </div>
          </div>

          {ticket && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 print:mt-0 print:border-0 print:bg-white print:p-0">
              <p className="text-sm font-bold text-amber-900 print:hidden">
                {status === 'GENERATING_TICKET' ? 'Generating session ticket...' : 'Session Ticket Preview'}
              </p>
              <SessionTicketPreview ticket={ticket} issuedAt={issuedAt} />
              <div className="mt-3 flex flex-col gap-2 print:hidden sm:flex-row">
                <button type="button" onClick={printTicket} className="btn-primary">
                  Print Ticket
                </button>
                <button type="button" onClick={markTicketIssued} className="btn-secondary">
                  Mark as Issued
                </button>
                <button type="button" onClick={reset} className="btn-secondary">
                  Next Vehicle
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {showReservationScanner && (
        <QRScanner
          title="Scan Reservation QR"
          instructions="Scan the Reservation QR on the driver's mobile. QR payload is the reservation ID."
          manualToggleLabel="Cannot scan? Enter Reservation ID manually"
          manualInputLabel="Reservation ID / Code"
          manualInputPlaceholder="Reservation UUID/code"
          onScan={handleReservationQrScanned}
          onClose={() => setShowReservationScanner(false)}
          onManualInput={handleReservationQrScanned}
        />
      )}
      <RecentSessionsCard type="checkin" refreshTrigger={checkInCount} />
    </div>
  )
}

function EvidencePreview({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-100">{title}</p>
      {imageUrl ? (
        <img src={imageUrl} alt="Captured OCR evidence" className="aspect-video w-full rounded-lg object-cover" />
      ) : (
        <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-slate-600 text-sm text-slate-400">
          Press Space to capture plate
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function normalizeSessionTicket(ticket: SessionTicket, slot: AssignedSlot): SessionTicket {
  const derived = deriveLocationFromSlotCode(ticket.slotCode || slot.code)

  return {
    ...ticket,
    slotCode: ticket.slotCode || slot.code,
    floorName: ticket.floorName || slot.floor?.name || derived.floorName,
    floorNumber: ticket.floorNumber ?? slot.floor?.floorNumber ?? derived.floorNumber,
    zone: ticket.zone || slot.zone || derived.zone,
  }
}

function deriveLocationFromSlotCode(slotCode: string): {
  floorName?: string
  floorNumber?: number
  zone?: Zone
} {
  const match = slotCode.match(/^([A-Z]+\d+)-([A-Z])-/i)
  if (!match) return {}

  const floorName = match[1].toUpperCase()
  const floorNumberMatch = floorName.match(/\d+/)
  const zone = match[2].toUpperCase()

  return {
    floorName,
    floorNumber: floorNumberMatch ? Number(floorNumberMatch[0]) : undefined,
    zone: zone === 'A' || zone === 'B' ? zone : undefined,
  }
}

function SessionTicketPreview({ ticket, issuedAt }: { ticket: SessionTicket; issuedAt: string | null }) {
  const derivedLocation = deriveLocationFromSlotCode(ticket.slotCode)
  const floorDisplay = ticket.floorName || derivedLocation.floorName || '-'
  const zoneDisplay = ticket.zone || derivedLocation.zone || '-'

  return (
    <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm shadow-sm print:mx-auto print:mt-0 print:w-[80mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center">
        <p className="text-xl font-black tracking-wide text-gray-950 print:text-lg">PBMS SESSION TICKET</p>
        <p className="text-xs text-gray-500">Use this Session QR/code for checkout later.</p>
      </div>
      {ticket.qrCode && (
        <img
          src={ticket.qrCode}
          alt="Session QR"
          className="mx-auto my-4 h-40 w-40 rounded-xl border border-gray-200 bg-white p-2 print:h-36 print:w-36"
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Session Code</p>
        <p className="mt-1 font-mono text-lg font-black tracking-wide text-slate-950">
          {ticket.sessionCode}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2">
        <dt className="text-gray-500">Plate</dt>
        <dd className="text-right font-mono font-bold">{ticket.licensePlate}</dd>
        <dt className="text-gray-500">Vehicle</dt>
        <dd className="text-right capitalize">{ticket.vehicleType}</dd>
      </dl>

      <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-center text-[11px] font-black uppercase tracking-[0.2em] text-emerald-800">
          Parking Location
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase text-emerald-700">Slot</p>
            <p className="mt-1 font-mono text-lg font-black text-emerald-950">{ticket.slotCode}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-emerald-700">Floor</p>
            <p className="mt-1 font-black text-emerald-950">{floorDisplay}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-emerald-700">Zone</p>
            <p className="mt-1 font-black text-emerald-950">{zoneDisplay}</p>
          </div>
        </div>
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 border-t border-gray-200 pt-3">
        <dt className="text-gray-500">Check-in</dt>
        <dd className="text-right">{formatDateTimeVN(ticket.checkInTime)}</dd>
        <dt className="text-gray-500">Building</dt>
        <dd className="text-right">{ticket.buildingName}</dd>
        <dt className="text-gray-500">Gate</dt>
        <dd className="text-right">{ticket.gateName}</dd>
      </dl>
      {issuedAt && (
        <p className="mt-3 rounded bg-emerald-50 p-2 text-center text-xs font-bold text-emerald-700">
          Ticket issued to driver at {formatDateTimeVN(issuedAt)}
        </p>
      )}
    </div>
  )
}

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'string') return raw
    return `Request failed (${error.response?.status ?? 'network'})`
  }
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
