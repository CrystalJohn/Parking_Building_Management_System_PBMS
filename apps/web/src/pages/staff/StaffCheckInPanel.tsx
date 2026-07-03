import { useState } from 'react'
import { Camera, QrCode } from 'lucide-react'
import { type useToasts } from '../../lib/use-toasts'
import { StaffOcrCheckInPanel } from './StaffOcrCheckInPanel'
import { StaffReservationQrCheckInPanel } from './StaffReservationQrCheckInPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Mode = 'scan-qr' | 'capture-ocr'

type Props = {
  toasts: ReturnType<typeof useToasts>
}

export function StaffCheckInPanel({ toasts }: Props) {
  const [mode, setMode] = useState<Mode>('scan-qr')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Check-in mode</p>
          <p className="text-sm text-muted-foreground">
            Scan QR for reservations. Capture OCR for walk-in and fallback.
          </p>
        </div>
        <div className="inline-flex w-full rounded-xl border bg-muted/30 p-1 sm:w-auto">
          <Button
            type="button"
            variant={mode === 'scan-qr' ? 'default' : 'ghost'}
            onClick={() => setMode('scan-qr')}
            className={cn(
              'h-10 flex-1 gap-2 whitespace-nowrap sm:min-w-[132px]',
              mode !== 'scan-qr' && 'text-muted-foreground',
            )}
          >
            <QrCode className="size-4" />
            Scan QR
          </Button>
          <Button
            type="button"
            variant={mode === 'capture-ocr' ? 'default' : 'ghost'}
            onClick={() => setMode('capture-ocr')}
            className={cn(
              'h-10 flex-1 gap-2 whitespace-nowrap sm:min-w-[140px]',
              mode !== 'capture-ocr' && 'text-muted-foreground',
            )}
          >
            <Camera className="size-4" />
            Capture OCR
          </Button>
        </div>
      </div>

      {mode === 'scan-qr' ? (
        <StaffReservationQrCheckInPanel onSwitchToOcr={() => setMode('capture-ocr')} toasts={toasts} />
      ) : (
        <StaffOcrCheckInPanel toasts={toasts} />
      )}
    </div>
  )
}
