import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoRow } from '@/components/ui'

// === TYPES ===
export type SessionSummaryItem = {
  id: string
  sessionCode?: string
  checkInTime: string
  slotCode?: string
  vehicle?: {
    plate: string
    type: 'car' | 'motorbike'
  }
  licensePlate?: string
  plateDisplay?: string | null
  vehicleType?: 'car' | 'motorbike'
}

export type SessionSelectorProps = {
  sessions: SessionSummaryItem[]
  onSelect: (session: SessionSummaryItem) => void
  onCancel: () => void
}

// === HELPERS ===
function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return isoString
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function calculateDuration(checkInTime: string): string {
  const start = new Date(checkInTime).getTime()
  if (isNaN(start)) return '0h 0m'
  const diffMs = Math.max(0, Date.now() - start)
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

// === COMPONENT ===
export function SessionSelector({ sessions, onSelect, onCancel }: SessionSelectorProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">Chọn phiên gửi xe</CardTitle>
        <CardDescription>
          Tìm thấy {sessions.length} phiên khớp với thông tin. Vui lòng chọn:
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {sessions.map((session) => {
            const plate =
              session.vehicle?.plate ??
              session.plateDisplay ??
              session.licensePlate ??
              session.id
            const vehicleType =
              session.vehicle?.type ??
              (session.vehicleType === 'motorbike' ? 'motorbike' : 'car')
            const slotCode = session.slotCode ?? '—'

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session)}
                className="w-full text-left p-4 border rounded-lg hover:bg-muted/50 hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-lg">{plate}</span>
                  <span className="text-xs bg-muted px-2 py-1 rounded">
                    {vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <InfoRow label="Slot" value={slotCode} />
                  <InfoRow label="Giờ vào" value={formatDateTime(session.checkInTime)} />
                  <InfoRow label="Đã đỗ" value={calculateDuration(session.checkInTime)} />
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>

      <CardFooter>
        <Button variant="ghost" onClick={onCancel} className="w-full">
          ← Quét xe khác
        </Button>
      </CardFooter>
    </Card>
  )
}
