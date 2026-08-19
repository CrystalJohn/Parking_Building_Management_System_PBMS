import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TicketDisplay } from './TicketDisplay'
import { TicketQRCode } from './TicketQRCode'
import QRCode from 'qrcode'

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrcodeimage'),
  },
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrcodeimage'),
}))

const originalPrint = window.print

describe('Ticket Components', () => {
  beforeEach(() => {
    window.print = jest.fn()
    jest.clearAllMocks()
  })

  afterEach(() => {
    window.print = originalPrint
  })

  it('renders TicketQRCode and calls QRCode.toDataURL with json string', async () => {
    const qrData = {
      ticketCode: 'TKT-20260816-001',
      plateNumber: '59A1-234.56',
      sessionId: 'sess-uuid-123',
      checkInTime: '2026-08-16T16:45:00Z',
    }

    render(<TicketQRCode data={qrData} size={150} />)

    await waitFor(() => {
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        JSON.stringify(qrData),
        expect.objectContaining({
          width: 300,
          errorCorrectionLevel: 'M',
        }),
      )
      expect(screen.getByRole('img', { name: 'Ticket QR Code' })).toHaveAttribute(
        'src',
        'data:image/png;base64,mockqrcodeimage',
      )
    })
  })

  it('renders TicketDisplay on screen with metadata correctly', () => {
    render(
      <TicketDisplay
        ticketCode="TKT-20260816-001"
        plateNumber="59A1-234.56"
        vehicleType="car"
        slotCode="T1-A05"
        checkInTime="2026-08-16T16:45:00Z"
        hourlyRate={20000}
        sessionId="sess-uuid-123"
        onNextVehicle={jest.fn()}
      />,
    )

    expect(screen.getByText('Check-in Thành Công')).toBeInTheDocument()
    expect(screen.getAllByText('#TKT-20260816-001').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/59A1-234\.56/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ô tô').length).toBeGreaterThan(0)
    expect(screen.getAllByText('T1-A05').length).toBeGreaterThan(0)
    expect(screen.getByText(/20\.000 đ\/giờ/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In vé/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xe tiếp theo/i })).toBeInTheDocument()
  })

  it('triggers window.print when clicking "In vé"', async () => {
    render(
      <TicketDisplay
        ticketCode="TKT-20260816-001"
        plateNumber="59A1-234.56"
        vehicleType="car"
        checkInTime="2026-08-16T16:45:00Z"
        sessionId="sess-uuid-123"
      />,
    )

    const printButton = screen.getByRole('button', { name: /In vé/i })
    await userEvent.click(printButton)

    await waitFor(() => {
      expect(window.print).toHaveBeenCalled()
    })
  })

  it('calls onNextVehicle when clicking "Xe tiếp theo"', async () => {
    const onNextVehicle = jest.fn()
    render(
      <TicketDisplay
        ticketCode="TKT-20260816-001"
        plateNumber="59A1-234.56"
        vehicleType="car"
        checkInTime="2026-08-16T16:45:00Z"
        sessionId="sess-uuid-123"
        onNextVehicle={onNextVehicle}
      />,
    )

    const nextButton = screen.getByRole('button', { name: /Xe tiếp theo/i })
    await userEvent.click(nextButton)

    expect(onNextVehicle).toHaveBeenCalledTimes(1)
  })
})
