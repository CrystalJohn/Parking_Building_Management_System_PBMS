import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VehicleInfoForm } from './VehicleInfoForm'

// Mock sessions-api
jest.mock('../../lib/sessions-api', () => ({
  scanReservationCheckIn: jest.fn().mockResolvedValue({
    reservationId: 'RES-TEST-12345',
    plateNumber: '30A99999',
    vehicleType: 'car',
  }),
}))

// Mock QRScanner dialog
jest.mock('../qr-scanner/QRScanner', () => ({
  QRScanner: ({ onScan, onClose }: any) => (
    <div data-testid="qr-scanner-modal">
      <button onClick={() => onScan?.('RES-TEST-12345')}>Mock Scan QR</button>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

describe('VehicleInfoForm (Refactored Phase 3)', () => {
  it('renders license plate as editable input and other fields as read-only rows', () => {
    render(
      <VehicleInfoForm
        laneVehicleType="motorbike"
        onSubmit={jest.fn()}
      />,
    )

    // License plate field is editable
    expect(screen.getByText(/Biển số phương tiện/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/62B-145/i)).toBeInTheDocument()

    // Read-only rows
    expect(screen.getByText('Loại xe')).toBeInTheDocument()
    expect(screen.getByText('Loại vé')).toBeInTheDocument()
    expect(screen.getByText('Người dùng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xác nhận Check-in/i })).toBeInTheDocument()
  })

  it('allows staff to edit license plate manually and submits with lane vehicle type', async () => {
    const onSubmit = jest.fn()
    render(
      <VehicleInfoForm
        initialData={{ plateNumber: '29A-11111' }}
        laneVehicleType="car"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByPlaceholderText(/62B-145/i)
    await userEvent.clear(input)
    await userEvent.type(input, '51G-99999')

    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        plateNumber: '51G99999',
        vehicleType: 'car',
      }),
    )
  })

  it('BLOCKS check-in and displays LaneMismatchBlocker when vehicle type from OCR mismatches lane assignment', async () => {
    const onSubmit = jest.fn()
    const onCancel = jest.fn()
    render(
      <VehicleInfoForm
        initialData={{ plateNumber: '30A-88888' }}
        laneVehicleType="motorbike"
        autoDetectedVehicleType="car"
        ocrConfidence={0.95}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    )

    // Warning alert is visible
    expect(screen.getByText(/Xe không đúng lane!/i)).toBeInTheDocument()
    expect(screen.getByText(/Phát hiện/i)).toBeInTheDocument()
    expect(screen.getByText(/Ô tô/i)).toBeInTheDocument()
    expect(screen.getByText(/Xe máy/i)).toBeInTheDocument()

    // Form submit button is not rendered (blocked)
    expect(screen.queryByRole('button', { name: /Xác nhận Check-in/i })).not.toBeInTheDocument()

    // Cancel button works
    await userEvent.click(screen.getByRole('button', { name: /Hủy check-in/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('handles reservation QR code scan via dedicated button', async () => {
    const onSubmit = jest.fn()
    render(
      <VehicleInfoForm
        initialData={{ plateNumber: '30A-99999' }}
        laneVehicleType="car"
        onSubmit={onSubmit}
      />,
    )

    // Open QR scanner modal
    await userEvent.click(screen.getByRole('button', { name: /Quét QR đặt trước/i }))

    // Trigger mock QR scan
    await userEvent.click(screen.getByText('Mock Scan QR'))

    // Reservation code and status should now be shown
    expect(screen.getByText('RES-TEST-12345')).toBeInTheDocument()
    expect(screen.getByText(/Đã đặt trước/i)).toBeInTheDocument()

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        plateNumber: '30A99999',
        ticketType: 'reservation',
        reservationCode: 'RES-TEST-12345',
      }),
    )
  })

  it('validates required license plate format before submitting', async () => {
    const onSubmit = jest.fn()
    render(
      <VehicleInfoForm
        laneVehicleType="car"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByPlaceholderText(/62B-145/i)
    await userEvent.type(input, '12')

    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    expect(
      screen.getByText(/Biển số xe không hợp lệ/i),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
