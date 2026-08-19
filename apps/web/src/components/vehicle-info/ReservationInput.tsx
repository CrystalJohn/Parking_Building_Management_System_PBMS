import { useState } from 'react'
import { QrCode, Search, X } from 'lucide-react'
import { Button } from '../ui/button'
import { QRScanner } from '../qr-scanner/QRScanner'

export interface ReservationInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  className?: string
}

export function ReservationInput({
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}: ReservationInputProps) {
  const [showScanner, setShowScanner] = useState(false)

  const handleScan = (decodedText: string) => {
    setShowScanner(false)
    const trimmed = decodedText.trim()
    if (trimmed) {
      onChange(trimmed)
    }
  }

  const handleManualScanInput = (manualVal: string) => {
    setShowScanner(false)
    const trimmed = manualVal.trim()
    if (trimmed) {
      onChange(trimmed)
    }
  }

  return (
    <div className={`space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 dark:border-blue-900/50 dark:bg-blue-950/20 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-foreground">
          Mã đặt chỗ trước (Reservation Code / Token)
        </label>
        <span className="text-xs text-muted-foreground">Bắt buộc</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Nhập mã đặt chỗ hoặc quét QR..."
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-8 font-mono text-sm font-medium placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowScanner(true)}
          disabled={disabled}
          className="h-10 gap-1.5 border-blue-300 bg-white font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
        >
          <QrCode className="size-4" />
          Quét QR
        </Button>
      </div>

      {error && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onManualInput={handleManualScanInput}
          onClose={() => setShowScanner(false)}
          title="Quét mã QR đặt chỗ"
          instructions="Đưa mã QR trên app của khách vào khung hình."
        />
      )}
    </div>
  )
}
