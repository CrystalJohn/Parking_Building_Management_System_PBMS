import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Loader2 } from 'lucide-react'

export interface TicketQRData {
  ticketCode: string
  plateNumber: string
  sessionId: string
  checkInTime: string
  [key: string]: unknown
}

export interface TicketQRCodeProps {
  data: TicketQRData | string
  size?: number
  className?: string
  margin?: number
}

export function TicketQRCode({
  data,
  size = 180,
  className = '',
  margin = 1,
}: TicketQRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const textToEncode = typeof data === 'string' ? data : JSON.stringify(data)

    setLoading(true)
    setError(null)

    QRCode.toDataURL(textToEncode, {
      width: size * 2, // 2x for sharp rendering on retina/print
      margin,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setLoading(false)
        }
      })
      .catch((_err) => {
        if (!cancelled) {
          setError('Không thể tạo mã QR')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [data, size, margin])

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-white p-2 ${className}`}
      style={{ width: size, height: size }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center text-xs text-red-500">{error}</div>
      )}

      {dataUrl && !loading && (
        <img
          src={dataUrl}
          alt="Ticket QR Code"
          className="h-full w-full object-contain"
        />
      )}
    </div>
  )
}
