import { TicketQRCode, type TicketQRData } from './TicketQRCode'

export interface PrintableTicketProps {
  ticketCode: string
  plateNumber: string
  vehicleType: 'car' | 'motorbike'
  slotCode?: string
  checkInTime: string
  hourlyRate?: number
  buildingName?: string
  hotline?: string
  sessionId: string
  className?: string
}

export function PrintableTicket({
  ticketCode,
  plateNumber,
  vehicleType,
  slotCode = '—',
  checkInTime,
  hourlyRate = 20000,
  buildingName = 'PBMS PARKING',
  hotline = '1900-6868',
  sessionId,
  className = '',
}: PrintableTicketProps) {
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

  const formattedRate = `${hourlyRate.toLocaleString('vi-VN')}đ/h`

  return (
    <div
      id="printable-ticket"
      className={`ticket-58mm flex flex-col items-center bg-white p-3 text-center text-black font-mono ${className}`}
    >
      {/* Header */}
      <h2 className="text-base font-extrabold uppercase tracking-wider">
        {buildingName}
      </h2>
      <p className="text-xs font-semibold">═════════════════════</p>
      <p className="text-[10px] text-gray-700">VÉ GỬI XE ĐIỆN TỬ</p>

      {/* QR Code */}
      <div className="my-2 flex justify-center">
        <TicketQRCode data={qrData} size={140} margin={0} />
      </div>

      {/* Ticket Code */}
      <p className="font-bold text-xs tracking-wider">#{ticketCode}</p>

      {/* Divider */}
      <p className="text-xs text-gray-700 my-1">─────────────────────</p>

      {/* Details Table */}
      <div className="w-full space-y-1 text-left text-xs font-medium">
        <div className="flex justify-between">
          <span>Biển số:</span>
          <span className="font-bold uppercase">{plateNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Loại xe:</span>
          <span>{vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}</span>
        </div>
        <div className="flex justify-between">
          <span>Vị trí:</span>
          <span className="font-bold">{slotCode}</span>
        </div>
        <div className="flex justify-between">
          <span>Vào lúc:</span>
          <span>{formattedTime}</span>
        </div>
        <div className="flex justify-between">
          <span>Giá gửi:</span>
          <span>{formattedRate}</span>
        </div>
      </div>

      {/* Divider */}
      <p className="text-xs text-gray-700 my-1">─────────────────────</p>

      {/* Footer Instructions */}
      <div className="mt-1 space-y-0.5 text-[10px] text-gray-800">
        <p className="font-bold">⚠️ Vui lòng giữ vé để quét ra cổng</p>
        <p>📞 Hotline hỗ trợ: {hotline}</p>
      </div>
    </div>
  )
}
