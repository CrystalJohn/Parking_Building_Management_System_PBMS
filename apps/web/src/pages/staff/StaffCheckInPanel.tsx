import { useState } from 'react'
import { type useToasts } from '../../lib/use-toasts'
import { StaffOcrCheckInPanel } from './StaffOcrCheckInPanel'
import { StaffReservationQrCheckInPanel } from './StaffReservationQrCheckInPanel'

type Mode = 'scan-qr' | 'capture-ocr'

type Props = {
  toasts: ReturnType<typeof useToasts>
}

export function StaffCheckInPanel({ toasts }: Props) {
  const [mode, setMode] = useState<Mode>('scan-qr')

  return mode === 'scan-qr' ? (
    <StaffReservationQrCheckInPanel onSwitchToOcr={() => setMode('capture-ocr')} toasts={toasts} />
  ) : (
    <StaffOcrCheckInPanel toasts={toasts} />
  )
}
