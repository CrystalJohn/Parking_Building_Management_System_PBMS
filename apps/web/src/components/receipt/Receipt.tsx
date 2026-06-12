import type { ConfirmPaymentResponse } from '../../lib/sessions-api'
import { formatDateTimeVN } from '../../lib/date-time'

interface ReceiptProps {
  data: ConfirmPaymentResponse
}

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const formatDateTime = formatDateTimeVN

/**
 * Printable parking receipt. Use window.print() from the parent.
 * Hides app chrome via @media print rules in App.css.
 */
export function Receipt({ data }: ReceiptProps) {
  return (
    <div
      id="receipt"
      className="bg-white border border-gray-200 rounded-md p-6 max-w-md mx-auto print:shadow-none print:border-0"
    >
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">PARKING RECEIPT</h2>
        <p className="text-sm text-gray-500">Hệ thống quản lý bãi đỗ xe</p>
      </div>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Mã phiên</dt>
        <dd className="font-mono text-right break-all">{data.sessionId}</dd>

        <dt className="text-gray-500">Biển số</dt>
        <dd className="text-right font-medium">{data.licensePlate}</dd>

        <dt className="text-gray-500">Loại xe</dt>
        <dd className="text-right">
          {data.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
        </dd>

        <dt className="text-gray-500">Vị trí</dt>
        <dd className="text-right font-mono">{data.slotCode}</dd>

        <dt className="text-gray-500">Vào</dt>
        <dd className="text-right">{formatDateTime(data.checkInTime)}</dd>

        <dt className="text-gray-500">Ra</dt>
        <dd className="text-right">{formatDateTime(data.checkOutTime)}</dd>

        <dt className="text-gray-500">Thời gian gửi</dt>
        <dd className="text-right">{data.durationHours} giờ</dd>
      </dl>

      <div className="border-t border-gray-200 mt-4 pt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Phí cơ bản</span>
          <span>{VND(data.fee.baseFee)}</span>
        </div>
        {data.fee.penalty > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">
              Phụ thu
              {data.fee.isOvertime && ' (quá giờ)'}
              {data.fee.isLostTicket && ' (mất vé)'}
            </span>
            <span>{VND(data.fee.penalty)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
          <span>Tổng cộng</span>
          <span>{VND(data.fee.total)}</span>
        </div>
        <div className="flex justify-between text-gray-500 mt-2">
          <span>Hình thức</span>
          <span>{data.paymentMethod === 'cash' ? 'Tiền mặt' : data.paymentMethod}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Đã thanh toán lúc</span>
          <span>{formatDateTime(data.paidAt)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Cảm ơn quý khách. Vui lòng giữ biên lai để đối soát.
      </p>
    </div>
  )
}
