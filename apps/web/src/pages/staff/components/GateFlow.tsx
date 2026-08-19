import { useState, useCallback, type ReactNode } from 'react'
import { SmartGateInput, type ResolvedInput } from './SmartGateInput'
import { GateOperationsPanel, type CheckInSuccessResult } from './GateOperationsPanel'
import { CheckOutPanel } from './CheckOutPanel'
import { SessionSelector, type SessionSummaryItem } from './SessionSelector'
import { ErrorFallback } from './ErrorFallback'
import { CheckInSuccess } from './CheckInSuccess'
import { useSessionLookup } from '../hooks/useSessionLookup'
import { scanReservationCheckIn } from '../../../lib/sessions-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { useToasts } from '../../../lib/use-toasts'

// Session QR encodes the session UUID directly.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// === TYPES ===
export type InputResult = ResolvedInput

export type SessionData = {
  id: string
  sessionCode?: string
  checkInTime: string
  slotCode: string
}

export type VehicleData = {
  plate: string
  type: 'car' | 'motorbike'
}

export type FeeData = {
  amount: number
  breakdown?: {
    baseFee: number
    overtimeFee?: number
    lostTicketPenalty?: number
  }
}

export type ReservationData = {
  id: string
  slotCode: string
  startTime: string
  endTime: string
}

export type FlowState =
  | { step: 'idle' }
  | { step: 'looking-up' }
  | {
      step: 'check-in'
      prefill: InputResult
      vehicle?: VehicleData
      reservation?: ReservationData
      laneVehicleType?: 'car' | 'motorbike'
      initialPlateImage?: {
        blob: Blob
        dataUrl: string
        plateNumber: string
      } | null
    }
  | {
      step: 'check-in-success'
      ticket: CheckInSuccessResult
    }
  | {
      step: 'check-out'
      session: SessionData
      vehicle: VehicleData
      fee?: FeeData
      laneVehicleType?: 'car' | 'motorbike'
      laneMismatchWarning?: string
    }
  | {
      step: 'ambiguous'
      sessions: Array<SessionData & { vehicle: VehicleData }>
    }
  | {
      step: 'error'
      message: string
      lastInput: InputResult
    }

export interface GateFlowProps {
  toasts?: ReturnType<typeof useToasts>
  /** Optional custom check-in workspace render override */
  checkInPanel?: (args: {
    prefill: InputResult
    vehicle?: VehicleData
    reservation?: ReservationData
    laneVehicleType?: 'car' | 'motorbike'
    onDone: () => void
    onCancel: () => void
  }) => ReactNode
  /** Optional custom check-out workspace render override */
  checkOutPanel?: (args: {
    session: SessionData
    vehicle: VehicleData
    fee?: FeeData
    laneVehicleType?: 'car' | 'motorbike'
    laneMismatchWarning?: string
    onDone: () => void
    onCancel: () => void
  }) => ReactNode
  laneVehicleType?: 'car' | 'motorbike'
}

// === COMPONENT ===
export function GateFlow({ toasts, checkInPanel, checkOutPanel, laneVehicleType }: GateFlowProps) {
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const lookup = useSessionLookup()

  const resolveReservationQr = useCallback(
    async (token: string) => {
      try {
        const res = await scanReservationCheckIn(token)
        setState({
          step: 'check-in',
          prefill: { type: 'plate', value: res.plateNumber },
          vehicle: {
            plate: res.plateDisplay ?? res.plateNumber,
            type: res.vehicleType,
          },
          reservation: {
            id: res.reservationId,
            slotCode: res.slotCode,
            startTime: res.expiresAt,
            endTime: res.expiresAt,
          },
          laneVehicleType,
        })
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Không tìm thấy đặt trước với mã này.'
        setState({
          step: 'error',
          message,
          lastInput: { type: 'qr', value: token },
        })
      }
    },
    [laneVehicleType],
  )

  // === HANDLERS ===
  const handleInputResolved = useCallback(
    async (input: InputResult) => {
      setState({ step: 'looking-up' })

      // Reservation QR is not a session UUID -> resolve via reservation scan
      if (input.type === 'qr' && !UUID_RE.test(input.value)) {
        await resolveReservationQr(input.value)
        return
      }

      try {
        const result = await lookup.mutateAsync(input.value)

        switch (result.status) {
          case 'none':
            // Không có session active -> Check-in
            setState({
              step: 'check-in',
              prefill: input,
              vehicle: {
                plate: result.vehicle?.plate ?? input.value,
                type:
                  (result.vehicle as unknown as { type?: 'car' | 'motorbike' } | undefined)?.type ??
                  laneVehicleType ??
                  'car',
              },
              reservation: (result as unknown as { reservation?: ReservationData }).reservation,
              laneVehicleType,
              initialPlateImage: input.capturedImage ?? null,
            })
            break

          case 'active':
            // Có session active -> Check-out
            if (!result.session) {
              throw new Error('Không tìm thấy thông tin phiên gửi xe.')
            }
            // eslint-disable-next-line no-case-declarations
            const sessionVehicleType = result.session.vehicleType ?? 'car'
            // eslint-disable-next-line no-case-declarations
            const isLaneMismatch =
              laneVehicleType && sessionVehicleType !== laneVehicleType
            setState({
              step: 'check-out',
              session: {
                id: result.session.id,
                sessionCode: result.session.id,
                checkInTime: result.session.checkInTime,
                slotCode:
                  (result.session as unknown as { slotCode?: string; slot?: { code: string } }).slotCode ??
                  (result.session as unknown as { slot?: { code: string } }).slot?.code ??
                  '—',
              },
              vehicle: {
                plate:
                  result.vehicle?.plate ??
                  result.session.plateDisplay ??
                  result.session.licensePlate,
                type: sessionVehicleType,
              },
              fee: (result as unknown as { fee?: FeeData }).fee,
              laneVehicleType,
              laneMismatchWarning: isLaneMismatch
                ? `Xe ${sessionVehicleType === 'car' ? 'ô tô' : 'xe máy'} không khớp làn ${laneVehicleType === 'car' ? 'ô tô' : 'xe máy'}`
                : undefined,
            })
            break

          case 'ambiguous':
            // Nhiều session khớp -> Cho chọn
            if (!result.sessions || result.sessions.length === 0) {
              throw new Error('Danh sách phiên trùng khớp trống.')
            }
            setState({
              step: 'ambiguous',
              sessions: result.sessions.map((s) => ({
                id: s.id,
                sessionCode: s.id,
                checkInTime: s.checkInTime,
                slotCode:
                  (s as unknown as { slotCode?: string; slot?: { code: string } }).slotCode ??
                  (s as unknown as { slot?: { code: string } }).slot?.code ??
                  '—',
                vehicle: {
                  plate: s.plateDisplay ?? s.licensePlate,
                  type: s.vehicleType ?? 'car',
                },
              })),
            })
            break

          default:
            throw new Error('Trạng thái tra cứu không hợp lệ.')
        }
      } catch (err: unknown) {
        let message = 'Lỗi tra cứu phương tiện'
        if (err && typeof err === 'object') {
          const resErr = err as { response?: { data?: { message?: string } }; message?: string }
          message = resErr.response?.data?.message ?? resErr.message ?? message
        }
        setState({
          step: 'error',
          message,
          lastInput: input,
        })
      }
    },
    [lookup, resolveReservationQr, laneVehicleType],
  )

  const handleReset = useCallback(() => {
    lookup.reset()
    setState({ step: 'idle' })
  }, [lookup])

  const handleDone = useCallback(() => {
    lookup.reset()
    setState({ step: 'idle' })
  }, [lookup])

  const handleCheckInSuccess = useCallback((ticket: CheckInSuccessResult) => {
    lookup.reset()
    setState({
      step: 'check-in-success',
      ticket,
    })
  }, [lookup])

  const handleSessionSelect = useCallback((session: SessionSummaryItem) => {
    setState({
      step: 'check-out',
      session: {
        id: session.id,
        sessionCode: session.sessionCode ?? session.id,
        checkInTime: session.checkInTime,
        slotCode: session.slotCode ?? '—',
      },
      vehicle: session.vehicle ?? {
        plate: session.plateDisplay ?? session.licensePlate ?? session.id,
        type: session.vehicleType ?? 'car',
      },
    })
  }, [])

  const handleManualCheckIn = useCallback(() => {
    if (state.step === 'error') {
      setState({
        step: 'check-in',
        prefill: state.lastInput,
      })
    }
  }, [state])

  const handleManualCheckOut = useCallback(() => {
    setState({ step: 'idle' })
    toasts?.showWarning?.('Chọn thủ công: vui lòng quét mã hoặc nhập biển số để check-out.')
  }, [toasts])

  const handleRetry = useCallback(() => {
    if (state.step === 'error') {
      void handleInputResolved(state.lastInput)
    }
  }, [state, handleInputResolved])

  // === RENDER ===
  switch (state.step) {
    case 'idle':
    case 'looking-up':
      return (
        <SmartGateInput
          onResolved={handleInputResolved}
          isLoading={state.step === 'looking-up'}
          onError={toasts?.showError}
          laneVehicleType={laneVehicleType}
        />
      )

    case 'check-in':
      if (checkInPanel) {
        return checkInPanel({
          prefill: state.prefill,
          vehicle: state.vehicle,
          reservation: state.reservation,
          laneVehicleType: state.laneVehicleType,
          onDone: handleDone,
          onCancel: handleReset,
        })
      }
      return (
        <GateOperationsPanel
          prefill={state.prefill}
          vehicle={state.vehicle}
          reservation={state.reservation}
          laneVehicleType={state.laneVehicleType}
          initialPlateImage={state.initialPlateImage}
          onSuccess={handleCheckInSuccess}
          onDone={handleDone}
          onCancel={handleReset}
        />
      )

    case 'check-in-success':
      return (
        <CheckInSuccess
          ticketCode={state.ticket.ticketCode}
          plateNumber={state.ticket.plateNumber}
          vehicleType={state.ticket.vehicleType}
          slotCode={state.ticket.slotCode}
          checkInTime={state.ticket.checkInTime}
          hourlyRate={state.ticket.hourlyRate}
          sessionId={state.ticket.sessionId}
          onNextVehicle={handleDone}
          autoResetSeconds={3}
        />
      )

    case 'check-out':
      if (checkOutPanel) {
        return checkOutPanel({
          session: state.session,
          vehicle: state.vehicle,
          fee: state.fee,
          laneVehicleType: state.laneVehicleType,
          laneMismatchWarning: state.laneMismatchWarning,
          onDone: handleDone,
          onCancel: handleReset,
        })
      }
      return (
        <div className="space-y-3">
          {state.laneMismatchWarning && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertDescription className="text-amber-800">
                {state.laneMismatchWarning}
              </AlertDescription>
            </Alert>
          )}
          <CheckOutPanel
            session={state.session}
            vehicle={state.vehicle}
            fee={state.fee}
            onDone={handleDone}
            onCancel={handleReset}
          />
        </div>
      )

    case 'ambiguous':
      return (
        <SessionSelector
          sessions={state.sessions}
          onSelect={handleSessionSelect}
          onCancel={handleReset}
        />
      )

    case 'error':
      return (
        <ErrorFallback
          message={state.message}
          onRetry={handleRetry}
          onManualCheckIn={handleManualCheckIn}
          onManualCheckOut={handleManualCheckOut}
          onCancel={handleReset}
        />
      )

    default:
      return null
  }
}
