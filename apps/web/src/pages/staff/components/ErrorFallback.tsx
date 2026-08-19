import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

// === TYPES ===
export type ErrorFallbackProps = {
  message: string
  onRetry: () => void
  onManualCheckIn: () => void
  onManualCheckOut: () => void
  onCancel: () => void
}

// === COMPONENT ===
export function ErrorFallback({
  message,
  onRetry,
  onManualCheckIn,
  onManualCheckOut,
  onCancel,
}: ErrorFallbackProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl text-destructive">Không thể tra cứu</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          Có thể do lỗi mạng hoặc hệ thống. Bạn có thể thử lại hoặc chọn thao tác thủ công:
        </p>

        <div className="grid grid-cols-1 gap-2">
          <Button onClick={onRetry} variant="outline" className="w-full">
            🔄 Thử lại
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onManualCheckIn} variant="secondary">
              Check-in thủ công
            </Button>
            <Button onClick={onManualCheckOut} variant="secondary">
              Check-out thủ công
            </Button>
          </div>
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
