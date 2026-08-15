import { useCallback, useState, type ReactNode } from 'react'
import { CircleAlert, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import {
  lookupSession,
  scanReservationCheckIn,
  type LookupResult,
  type SessionSummary,
} from '../../../lib/sessions-api'
import { useSessionLookup } from '../hooks/useSessionLookup'
import { SmartGateInput, type ResolvedInput } from './SmartGateInput'

// Session QR encodes the session UUID directly.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FlowState =
  | { step: 'idle' }
  | { step: 'looking-up' }
  | { step: 'check-in'; prefill: ResolvedInput }
  | { step: 'check-out'; session: SessionSummary; vehicle: { plate: string } }
  | { step: 'ambiguous'; sessions: SessionSummary[] }
  | { step: 'error'; message: string; lastQuery: string }

export interface GateFlowProps {
  toasts: ReturnType<typeof useToasts>
  /** Renders the check-in workspace. Gate.tsx owns the real panel instance. */
  checkInPanel: (args: { prefill: ResolvedInput; onDone: () => void }) => ReactNode
  /** Renders the check-out workspace. Gate.tsx owns the real panel instance. */
  checkOutPanel: (args: {
    session: SessionSummary
    vehicle: { plate: string }
    onDone: () => void
  }) => ReactNode
  laneVehicleType?: 'car' | 'motorbike'
}

function FlowSkeleton() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Đang tra cứu phương tiện…
    </div>
  )
}

export function GateFlow({ toasts, checkInPanel, checkOutPanel }: GateFlowProps) {
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const lookup = useSessionLookup()

  const resolveReservationQr = useCallback(
    async (token: string) => {
      try {
        const res = await scanReservationCheckIn(token)
        setState({
          step: 'check-in',
          prefill: { type: 'plate', value: res.plateNumber },
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Không tìm thấy đặt trước với mã này.'
        setState({ step: 'error', message, lastQuery: token })
      }
    },
    [],
  )

  const handleResolved = useCallback(
    async (input: ResolvedInput) => {
      setState({ step: 'looking-up' })

      // Reservation QR is not a session id -> resolve via the reservation scan.
      if (input.type === 'qr' && !UUID_RE.test(input.value)) {
        await resolveReservationQr(input.value)
        return
      }

      try {
        const data: LookupResult = await lookupSession(input.value)
        if (data.status === 'none') {
          setState({ step: 'check-in', prefill: input })
        } else if (data.status === 'active' && data.session) {
          setState({
            step: 'check-out',
            session: data.session,
            vehicle: { plate: data.session.plateDisplay ?? data.session.licensePlate },
          })
        } else if (data.status === 'ambiguous' && data.sessions) {
          setState({ step: 'ambiguous', sessions: data.sessions })
        } else {
          setState({ step: 'error', message: 'Không xác định được trạng thái phiên.', lastQuery: input.value })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Không thể tra cứu. Kiểm tra kết nối mạng.'
        setState({ step: 'error', message, lastQuery: input.value })
      }
    },
    [resolveReservationQr],
  )

  const reset = useCallback(() => {
    lookup.reset()
    setState({ step: 'idle' })
  }, [lookup])

  const goCheckInManually = useCallback(() => {
    setState({ step: 'check-in', prefill: { type: 'plate', value: '' } })
  }, [])

  const goCheckOutManually = useCallback(() => {
    // Manual check-out fallback: staff will enter a session code / plate in the panel.
    setState({ step: 'check-in', prefill: { type: 'plate', value: '' } })
    toasts.showWarning('Chọn thủ công: vui lòng nhập mã phiên hoặc biển số để checkout.')
  }, [toasts])

  switch (state.step) {
    case 'idle':
      return (
        <Card>
          <CardContent className="space-y-4 p-5">
            <SmartGateInput onResolved={handleResolved} isLoading={false} onError={toasts.showError} />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-4" />
                Quét xe tiếp theo
              </Button>
            </div>
          </CardContent>
        </Card>
      )

    case 'looking-up':
      return (
        <Card>
          <CardContent className="p-5">
            <SmartGateInput onResolved={handleResolved} isLoading isError={toasts.showError} />
            <FlowSkeleton />
          </CardContent>
        </Card>
      )

    case 'check-in':
      return (
        <div className="space-y-3">
          {checkInPanel({ prefill: state.prefill, onDone: reset })}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-4" />
              Quét xe tiếp theo
            </Button>
          </div>
        </div>
      )

    case 'check-out':
      return (
        <div className="space-y-3">
          {checkOutPanel({ session: state.session, vehicle: state.vehicle, onDone: reset })}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="size-4" />
              Quét xe tiếp theo
            </Button>
          </div>
        </div>
      )

    case 'ambiguous':
      return (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold">Có nhiều phiên đang mở cho biển số này:</p>
            <ul className="space-y-2">
              {state.sessions.map((s) => (
                <li key={s.id}>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() =>
                      setState({
                        step: 'check-out',
                        session: s,
                        vehicle: { plate: s.plateDisplay ?? s.licensePlate },
                      })
                    }
                  >
                    <span>{s.plateDisplay ?? s.licensePlate}</span>
                    <span className="text-xs text-muted-foreground">{s.status}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-4" />
                Quét xe tiếp theo
              </Button>
            </div>
          </CardContent>
        </Card>
      )

    case 'error':
      return (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Không thể tra cứu</p>
                <p className="text-sm">{state.message}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={reset}>
                <RotateCcw className="size-4" />
                Thử lại
              </Button>
              <Button variant="outline" onClick={goCheckInManually}>
                Check-in thủ công
              </Button>
              <Button variant="outline" onClick={goCheckOutManually}>
                Check-out thủ công
              </Button>
            </div>
          </CardContent>
        </Card>
      )

    default:
      return null
  }
}
