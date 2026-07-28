import type { ConfirmPaymentResponse } from '../../lib/sessions-api'
import { formatDateTimeVN } from '../../lib/date-time'

interface ReceiptProps {
  data: ConfirmPaymentResponse
  sessionCode?: string | null
}

const VND = (n: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))} VND`

const formatDateTime = formatDateTimeVN

function displaySessionCode(sessionId: string, sessionCode?: string | null) {
  if (sessionCode) return sessionCode
  return `PBMS-${sessionId.replace(/-/g, '').slice(0, 10).toUpperCase()}`
}

function displayPaymentMethod(method: ConfirmPaymentResponse['paymentMethod']) {
  if (method === 'cash') return 'Tiền mặt'
  if (method === 'bank_qr') return 'VNPAY / Bank QR'
  return method
}

/**
 * Printable parking receipt. Use window.print() from the parent.
 * Hides app chrome via @media print rules in App.css.
 */
export function Receipt({ data, sessionCode }: ReceiptProps) {
  return (
    <div
      id="receipt"
      className="bg-white border border-gray-200 rounded-md p-6 max-w-md mx-auto print:shadow-none print:border-0"
    >
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">PARKING RECEIPT</h2>
        <p className="text-sm text-gray-500">Parking Management System</p>
      </div>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Session Code</dt>
        <dd className="font-mono text-right font-semibold">
          {displaySessionCode(data.sessionId, sessionCode)}
        </dd>

        <dt className="text-gray-500">Plate</dt>
        <dd className="text-right font-medium">{data.licensePlate}</dd>

        <dt className="text-gray-500">Vehicle</dt>
        <dd className="text-right">
          {data.vehicleType === 'car' ? 'Car' : 'Motorbike'}
        </dd>

        <dt className="text-gray-500">Slot</dt>
        <dd className="text-right font-mono">{data.slotCode}</dd>

        <dt className="text-gray-500">Check-in</dt>
        <dd className="text-right">{formatDateTime(data.checkInTime)}</dd>

        <dt className="text-gray-500">Check-out</dt>
        <dd className="text-right">{formatDateTime(data.checkOutTime)}</dd>

        <dt className="text-gray-500">Duration</dt>
        <dd className="text-right">{data.durationHours} hr</dd>
      </dl>

      <div className="border-t border-gray-200 mt-4 pt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Base fee</span>
          <span>{VND(data.fee.originalBaseFee ?? data.fee.baseFee)}</span>
        </div>
        {Boolean(data.fee.reservationDiscountAmount && data.fee.reservationDiscountAmount > 0) && (
          <div className="flex justify-between text-emerald-600 font-medium">
            <span>Reservation discount (-{data.fee.reservationDiscountPercent ?? 20}%)</span>
            <span>-{VND(data.fee.reservationDiscountAmount!)}</span>
          </div>
        )}
        {data.fee.penalty > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">
              Surcharge
              {data.fee.isOvertime && ' (overtime)'}
              {data.fee.isLostTicket && ' (lost ticket)'}
            </span>
            <span>{VND(data.fee.penalty)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
          <span>Total</span>
          <span>{VND(data.fee.total)}</span>
        </div>
        <div className="flex justify-between text-gray-500 mt-2">
          <span>Method</span>
          <span>{displayPaymentMethod(data.paymentMethod)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Paid at</span>
          <span>{formatDateTime(data.paidAt)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Thank you. Please keep this receipt for reference.
      </p>
    </div>
  )
}
