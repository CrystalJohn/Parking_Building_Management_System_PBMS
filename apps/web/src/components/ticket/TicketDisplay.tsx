import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { TicketQRCode, type TicketQRData } from './TicketQRCode'
import { PrintableTicket } from './PrintableTicket'
import { TicketPrintButton } from './TicketPrintButton'
import '../../styles/print-ticket.css'

export interface TicketDisplayProps {
  ticketCode: string
  plateNumber: string
  vehicleType: 'car' | 'motorbike'
  slotCode?: string
  checkInTime: string
  hourlyRate?: number
  buildingName?: string
  sessionId: string
  onNextVehicle?: () => void
  onClose?: () => void
  className?: string
}

export function TicketDisplay({
  ticketCode,
  plateNumber,
  vehicleType,
  slotCode = '—',
  checkInTime,
  hourlyRate = 20000,
  buildingName = 'PBMS PARKING',
  sessionId,
  onNextVehicle,
  className = '',
}: TicketDisplayProps) {
  const qrData: TicketQRData = {
    ticketCode,
    plateNumber,
    sessionId,
    checkInTime,
  }

  const formattedTime = new Date(checkInTime).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className={`space-y-4 ${className}`}>
      {/* On-screen Ticket Card */}
      <Card className="w-full max-w-md mx-auto overflow-hidden border-2 border-emerald-500/30 bg-card shadow-lg">
        <CardHeader className="bg-emerald-50/60 pb-3 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              <CardTitle className="text-lg font-bold text-foreground">
                Check-in Thành Công
              </CardTitle>
            </div>
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              #{ticketCode}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-5">
          {/* QR Code Center Box */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-slate-50/80 p-4 dark:bg-slate-900/40">
            <TicketQRCode data={qrData} size={180} />
            <p className="mt-2 font-mono text-xs font-semibold text-muted-foreground">
              Mã vé: {ticketCode}
            </p>
          </div>

          {/* Ticket Metadata Grid */}
          <div className="divide-y divide-border rounded-xl border bg-muted/20 text-sm">
            <div className="flex justify-between p-3">
              <span className="text-muted-foreground">Biển số xe</span>
              <span className="font-mono font-bold text-foreground uppercase">
                {plateNumber}
              </span>
            </div>

            <div className="flex justify-between p-3">
              <span className="text-muted-foreground">Loại phương tiện</span>
              <span className="font-medium text-foreground">
                {vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
              </span>
            </div>

            <div className="flex justify-between p-3">
              <span className="text-muted-foreground">Vị trí đỗ (Slot)</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {slotCode}
              </span>
            </div>

            <div className="flex justify-between p-3">
              <span className="text-muted-foreground">Thời gian vào cổng</span>
              <span className="font-medium text-foreground">
                {formattedTime}
              </span>
            </div>

            <div className="flex justify-between p-3">
              <span className="text-muted-foreground">Đơn giá gửi xe</span>
              <span className="font-semibold text-foreground">
                {hourlyRate.toLocaleString('vi-VN')} đ/giờ
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2.5 border-t bg-muted/10 p-4 sm:flex-row">
          <TicketPrintButton className="w-full sm:flex-1" />

          {onNextVehicle && (
            <Button
              type="button"
              variant="outline"
              onClick={onNextVehicle}
              className="w-full gap-2 sm:flex-1 font-semibold"
            >
              Xe tiếp theo
              <ArrowRight className="size-4" />
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Hidden 58mm Thermal Print Layout Container */}
      <div className="hidden">
        <PrintableTicket
          ticketCode={ticketCode}
          plateNumber={plateNumber}
          vehicleType={vehicleType}
          slotCode={slotCode}
          checkInTime={checkInTime}
          hourlyRate={hourlyRate}
          buildingName={buildingName}
          sessionId={sessionId}
        />
      </div>
    </div>
  )
}
