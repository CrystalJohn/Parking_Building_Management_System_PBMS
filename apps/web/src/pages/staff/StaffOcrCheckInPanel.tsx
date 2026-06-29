import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { QRScanner } from '../../components/qr-scanner/QRScanner'

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
          <h2 className="text-lg font-bold text-gray-900">Staff Check-in Service</h2>
          <p className="text-xs text-gray-500">
            Select the correct service mode before OCR. Space to capture, Enter to confirm, Esc to reset.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs">
          <span className="font-semibold">{formatDateTimeVN(now)}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
        <section className="self-start rounded-2xl border border-primary-100 bg-primary-50 p-4 text-slate-900 shadow-sm print:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">Real-time Camera + OCR Evidence</h3>
              <p className="text-[10px] font-semibold text-primary-700">{statusLabel}</p>
            </div>
            <button
              type="button"
              onClick={captureAndRecognize}
              disabled={status === 'OCR_PROCESSING' || status === 'CHECKING_IN'}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 disabled:opacity-50"
            >
              Capture OCR
            </button>
          </div>

          <div className="relative aspect-video overflow-hidden rounded-xl border border-primary-100 bg-white">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {cameraError && (
              <div className="absolute inset-0 grid place-items-center bg-white/90 p-6 text-center text-sm font-semibold text-red-600">
                {cameraError}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <EvidencePreview title="Captured OCR evidence" imageUrl={capturedImageUrl} />
            {ticket ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-slate-900 print:mt-0 print:border-0 print:bg-white print:p-0">
                <div className="flex items-center justify-between gap-2 mb-2 print:hidden">
                  <span className="text-[10px] font-bold text-amber-950">
                    {status === 'GENERATING_TICKET' ? 'Generating ticket...' : 'Session Ticket Preview'}
                  </span>
                </div>
                <SessionTicketPreview ticket={ticket} issuedAt={issuedAt} />
                <div className="mt-3 flex flex-col gap-1.5 print:hidden">
                  <button type="button" onClick={printTicket} className="btn-primary py-1.5 px-3 text-xs">
                    Print Ticket
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={markTicketIssued} className="btn-secondary flex-1 py-1 px-2.5 text-xs">
                      Mark Issued
                    </button>
                    <button type="button" onClick={reset} className="btn-secondary flex-1 py-1 px-2.5 text-xs">
                      Next Vehicle
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-primary-200 bg-white/70 p-4 flex flex-col items-center justify-center text-center text-slate-500 min-h-[160px]">
                <span className="text-xl mb-1.5">🎫</span>
                <p className="text-[10px] font-bold text-primary-700">Ticket Preview</p>
                <p className="text-[9px] text-slate-500 mt-1 max-w-[160px]">
                  Awaiting check-in confirmation to generate ticket
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-4 print:hidden">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <div className="flex items-start justify-between gap-3 print:hidden">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Service Mode + Actions</h3>
              <p className="text-xs text-gray-500">{checkInMode}</p>
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
            <Field label="Service mode">
              <div className="flex gap-3">
                {CHECK_IN_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => chooseServiceMode(mode.id)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                      serviceMode === mode.id
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
                    }`}
                  >
                    {mode.title}
                  </button>
                ))}
              </div>
            </Field>

            {serviceMode === 'reservation' && (
              <Field label="Reservation ID / QR">
                <div className="flex gap-2">
                  <input
                    className="input font-mono text-xs"
                    value={reservationId}
                    onChange={(event) => setReservationId(event.target.value)}
                    placeholder="Scan/paste UUID/code"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReservationScanner(true)}
                    className="btn-primary shrink-0 text-xs py-1.5 px-3"
                  >
                    Scan QR
                  </button>
                </div>
              </Field>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Confirmed license plate</span>
                {ocrResult ? (
                  <span className="text-[10px] font-mono text-gray-500">
                    OCR: <span className="font-bold text-gray-900">{ocrResult.detectedPlate || 'no plate detected'}</span>
                    {ocrResult.confidence != null && ` (${Math.round(ocrResult.confidence * 100)}%)`}
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400 font-medium">OCR: not run yet</span>
                )}
              </div>
              <input
                className="input uppercase font-mono text-sm font-bold"
                value={licensePlate}
                onChange={(event) => setLicensePlate(event.target.value)}
                placeholder="VD: 59A-12345"
              />
            </div>

            <Field label="Vehicle type">
              <div className="flex gap-3">
                {(['car', 'motorbike'] as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setVehicleType(type)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                      vehicleType === type
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-slate-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={confirmCheckIn}
                disabled={!canConfirm}
                className="btn-primary flex-1 py-1.5 text-xs disabled:opacity-50"
              >
                {status === 'CHECKING_IN'
                  ? 'Checking in...'
                  : serviceMode === 'reservation'
                    ? 'Confirm Reservation Check-in'
                    : 'Confirm Walk-in Check-in'}
              </button>
              <button type="button" onClick={reset} className="btn-secondary py-1.5 text-xs">
                Reset
              </button>
            </div>
          </div>
        </section>
        <RecentSessionsCard type="checkin" refreshTrigger={checkInCount} />
      </div>
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
    </div>
  )
}

function EvidencePreview({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <p className="mb-2 text-xs font-bold text-slate-100">{title}</p>
      {imageUrl ? (
        <img src={imageUrl} alt="Captured OCR evidence" className="aspect-video w-full rounded-lg object-cover" />
      ) : (
        <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-primary-200 bg-white/70 text-xs text-slate-500">
          Press Space to capture plate
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-gray-700">{label}</span>
      {children}
    </label>
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
  const toasts = useToasts()

  const copySessionCode = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ticket.sessionCode)
      } else {
        copyTextFallback(ticket.sessionCode)
      }
      toasts.showSuccess('Session code copied')
    } catch {
      toasts.showError('Unable to copy session code')
    }
  }, [ticket.sessionCode, toasts])

  return (
    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-3 text-xs shadow-sm print:mx-auto print:mt-0 print:w-[80mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center hidden print:block">
        <p className="text-lg font-black tracking-wider text-gray-950 print:text-base">PBMS PARKING TICKET</p>
        <p className="text-[10px] text-gray-400">Keep this ticket for checkout</p>
      </div>

      <div className="mt-1 flex flex-col items-center justify-center gap-1 print:mt-3">
        <div className="rounded border border-slate-800 bg-slate-50 px-3 py-1 text-center font-mono text-base font-bold tracking-widest text-slate-900 shadow-sm">
          {ticket.licensePlate}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hidden print:inline-block">
          {ticket.vehicleType}
        </span>
      </div>

      <div className="my-2 border-t border-dashed border-gray-200 hidden print:block print:my-3" />

      {ticket.qrCode && (
        <img
          src={ticket.qrCode}
          alt="Session QR"
          className="mx-auto my-3 h-48 w-48 rounded-xl border border-gray-200 bg-white p-3 print:my-2 print:h-40 print:w-40 print:p-2"
        />
      )}

      <button
        type="button"
        onClick={copySessionCode}
        className="mx-auto -mt-1 mb-2 flex max-w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-center font-mono text-[11px] font-bold tracking-wider text-slate-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 print:hidden"
        title="Copy session code"
      >
        {ticket.sessionCode}
      </button>

      <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-center hidden print:block print:mt-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Session Code</p>
        <p className="font-mono text-sm font-bold text-slate-800">{ticket.sessionCode}</p>
      </div>

      <div className="my-2 border-t border-dashed border-gray-200 hidden print:block print:my-3" />

      <section className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-2.5 print:p-3 mt-2">
        <p className="text-center text-[9px] font-extrabold uppercase tracking-[0.15em] text-emerald-800">
          Assigned space
        </p>
        <div className="mt-1.5 grid grid-cols-1 gap-1 text-center print:mt-2 print:grid-cols-3">
          <div>
            <p className="text-[9px] font-bold uppercase text-emerald-600">Slot</p>
            <p className="font-mono text-xs font-bold text-emerald-950">{ticket.slotCode}</p>
          </div>
          <div className="hidden print:block">
            <p className="text-[9px] font-bold uppercase text-emerald-600">Floor</p>
            <p className="text-sm font-black text-emerald-950">{floorDisplay}</p>
          </div>
          <div className="hidden print:block">
            <p className="text-[9px] font-bold uppercase text-emerald-600">Zone</p>
            <p className="text-sm font-black text-emerald-950">{zoneDisplay}</p>
          </div>
        </div>
      </section>

      <div className="mt-3 space-y-1 text-xs border-t border-dashed border-gray-200 pt-2 hidden print:block print:mt-4 print:pt-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Check-in:</span>
          <span className="font-medium text-gray-800">{formatDateTimeVN(ticket.checkInTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Location:</span>
          <span className="font-medium text-gray-800">{ticket.gateName} ({ticket.buildingName})</span>
        </div>
      </div>

      {issuedAt && (
        <p className="mt-2.5 rounded bg-emerald-50/50 p-2 text-center text-[11px] font-bold text-emerald-700 print:mt-3">
          Issued at {formatDateTimeVN(issuedAt)}
        </p>
      )}
    </div>
  )
}

function copyTextFallback(value: string) {
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
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
