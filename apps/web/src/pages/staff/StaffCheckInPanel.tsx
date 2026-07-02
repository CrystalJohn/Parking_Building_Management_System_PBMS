import { useState } from 'react'
import { Camera, QrCode } from 'lucide-react'
import { type useToasts } from '../../lib/use-toasts'
import { StaffOcrCheckInPanel } from './StaffOcrCheckInPanel'
import { StaffReservationQrCheckInPanel } from './StaffReservationQrCheckInPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Mode = 'scan-qr' | 'capture-ocr'

type Props = {
  toasts: ReturnType<typeof useToasts>
}

export function StaffCheckInPanel({ toasts }: Props) {
  const [mode, setMode] = useState<Mode>('scan-qr')

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 shadow-sm">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Entry mode</p>
            <p className="text-sm text-muted-foreground">
              Reservation drivers use QR first. Walk-in drivers use OCR capture.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-1">
            <Button
              type="button"
              variant={mode === 'scan-qr' ? 'default' : 'ghost'}
              onClick={() => setMode('scan-qr')}
              className={cn('h-10 gap-2', mode !== 'scan-qr' && 'text-muted-foreground')}
            >
              <QrCode className="size-4" />
              Scan QR
            </Button>
            <Button
              type="button"
              variant={mode === 'capture-ocr' ? 'default' : 'ghost'}
              onClick={() => setMode('capture-ocr')}
              className={cn('h-10 gap-2', mode !== 'capture-ocr' && 'text-muted-foreground')}
            >
              <Camera className="size-4" />
              Capture OCR
            </Button>
          </div>
        </CardContent>
      </Card>

      {mode === 'scan-qr' ? (
        <StaffReservationQrCheckInPanel onSwitchToOcr={() => setMode('capture-ocr')} toasts={toasts} />
      ) : (
        <StaffOcrCheckInPanel toasts={toasts} />
      )}
    </div>
  )
}
