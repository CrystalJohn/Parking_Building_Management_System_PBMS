import { Pause, Play } from 'lucide-react'
import { TicketDisplay } from '../../../components/ticket'
import { useAutoReset } from '../../../hooks/useAutoReset'
import { Button } from '../../../components/ui/button'

export interface CheckInSuccessProps {
  ticketCode: string
  plateNumber: string
  vehicleType: 'car' | 'motorbike'
  slotCode?: string
  checkInTime: string
  hourlyRate?: number
  buildingName?: string
  sessionId: string
  onNextVehicle: () => void
  autoResetSeconds?: number
  className?: string
}

export function CheckInSuccess({
  ticketCode,
  plateNumber,
  vehicleType,
  slotCode = '—',
  checkInTime,
  hourlyRate = 20000,
  buildingName = 'PBMS PARKING',
  sessionId,
  onNextVehicle,
  autoResetSeconds = 3,
  className = '',
}: CheckInSuccessProps) {
  const { secondsLeft, isPaused, pause, resume, triggerNow } = useAutoReset({
    onReset: onNextVehicle,
    timeoutSeconds: autoResetSeconds,
    enabled: true,
  })

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Auto Reset Countdown Banner */}
      <div className="mx-auto flex max-w-md items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/40">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex size-2.5 rounded-full bg-blue-500"></span>
          </span>
          <span className="text-xs font-medium text-blue-900 dark:text-blue-200">
            {isPaused ? (
              'Đã tạm dừng tự động chuyển xe'
            ) : (
              <>
                Tự động chuyển xe tiếp theo sau{' '}
                <strong className="font-bold text-blue-700 dark:text-blue-300">
                  {secondsLeft}s
                </strong>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isPaused ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resume}
              className="h-7 gap-1 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              <Play className="size-3" />
              Tiếp tục
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={pause}
              className="h-7 gap-1 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              <Pause className="size-3" />
              Tạm dừng
            </Button>
          )}
        </div>
      </div>

      {/* Ticket Display Card */}
      <TicketDisplay
        ticketCode={ticketCode}
        plateNumber={plateNumber}
        vehicleType={vehicleType}
        slotCode={slotCode}
        checkInTime={checkInTime}
        hourlyRate={hourlyRate}
        buildingName={buildingName}
        sessionId={sessionId}
        onNextVehicle={triggerNow}
      />
    </div>
  )
}
