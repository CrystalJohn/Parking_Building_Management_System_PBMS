import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GateOperationsPanel } from './GateOperationsPanel'
import { checkIn } from '../../../lib/sessions-api'

// === MOCK the real checkIn function (used by useCheckIn) ===
jest.mock('../../../lib/sessions-api', () => ({
  checkIn: jest.fn(),
}))
const mockCheckIn = checkIn as jest.Mock

// Mock child modals
jest.mock('../../../components/qr-scanner/QRScanner', () => ({
  QRScanner: () => <div>Mock QR Scanner</div>,
}))
jest.mock('../../../components/plate-scanner/LicensePlateScanner', () => ({
  LicensePlateScanner: () => <div>Mock License Plate Scanner</div>,
}))

// === TEST WRAPPER ===
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// === TESTS ===
describe('GateOperationsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hiển thị biển số từ prefill trong form', () => {
    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByDisplayValue('30A-12345')).toBeInTheDocument()
  })

  it('hiển thị biển số từ vehicle nếu có', () => {
    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        vehicle={{ plate: '51G-99999', type: 'car' }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByDisplayValue('51G-99999')).toBeInTheDocument()
    expect(screen.getByText('Ô tô')).toBeInTheDocument()
  })

  it('hiển thị thông tin reservation nếu có', () => {
    const reservation = {
      id: 'RES-001',
      slotCode: 'A-01',
      startTime: '2024-01-15T08:00:00Z',
      endTime: '2024-01-15T12:00:00Z',
    }

    render(
      <GateOperationsPanel
        prefill={{ type: 'qr', value: 'token' }}
        reservation={reservation}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText(/RES-001/i)).toBeInTheDocument()
    expect(screen.getByText(/Đã đặt trước/i)).toBeInTheDocument()
  })

  it('gọi onSuccess/onDone khi check-in thành công', async () => {
    mockCheckIn.mockResolvedValueOnce({
      session: {
        id: 'sess-001',
        sessionCode: 'TKT-001',
        licensePlate: '30A12345',
        vehicleType: 'car',
        checkInTime: new Date().toISOString(),
      },
      slot: { code: 'A-01' },
      qr_code: null,
    })
    const onSuccess = jest.fn()
    const onDone = jest.fn()

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onSuccess={onSuccess}
        onDone={onDone}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          licensePlate: '30A12345',
          vehicleType: 'car',
        }),
      )
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketCode: 'TKT-001',
          plateNumber: '30A12345',
          slotCode: 'A-01',
        }),
      )
    })
  })

  it('hiển thị error khi check-in fail', async () => {
    mockCheckIn.mockRejectedValueOnce({
      response: { data: { message: 'Slot đã đầy' } },
    })

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    await waitFor(() => {
      expect(screen.getByText('Slot đã đầy')).toBeInTheDocument()
    })
  })

  it('gọi onCancel khi bấm Hủy', async () => {
    const onCancel = jest.fn()

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={onCancel}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByRole('button', { name: /Hủy/i }))

    expect(onCancel).toHaveBeenCalled()
  })
})
