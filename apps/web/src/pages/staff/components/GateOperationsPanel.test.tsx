import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GateOperationsPanel } from './GateOperationsPanel'
import { checkIn } from '../../../lib/sessions-api'

// === MOCK the real checkIn function (used by useCheckIn) ===
// Mock the whole module so we don't load `api.ts` (which uses import.meta.env)
// under ts-jest's CommonJS runtime.
jest.mock('../../../lib/sessions-api', () => ({
  checkIn: jest.fn(),
}))
const mockCheckIn = checkIn as jest.Mock

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

  it('hiển thị biển số từ prefill', () => {
    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('30A-12345')).toBeInTheDocument()
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

    expect(screen.getByText('51G-99999')).toBeInTheDocument()
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

    expect(screen.getByText('RES-001')).toBeInTheDocument()
    expect(screen.getByText('A-01')).toBeInTheDocument()
    expect(screen.getByText('Thông tin đặt chỗ')).toBeInTheDocument()
  })

  it('gọi onDone khi check-in thành công', async () => {
    mockCheckIn.mockResolvedValueOnce({
      session: { id: 'sess-001' },
      slot: { code: 'A-01' },
      qr_code: null,
    })
    const onDone = jest.fn()

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={onDone}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByText('Xác nhận Check-in'))

    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledWith({
        licensePlate: '30A-12345',
        vehicleType: 'car',
        reservationId: undefined,
      })
      expect(onDone).toHaveBeenCalled()
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

    await userEvent.click(screen.getByText('Xác nhận Check-in'))

    await waitFor(() => {
      expect(screen.getByText('Slot đã đầy')).toBeInTheDocument()
    })
  })

  it('gọi onCancel khi bấm Quét xe khác', async () => {
    const onCancel = jest.fn()

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={onCancel}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByText('← Quét xe khác'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('disable buttons khi đang loading', async () => {
    // Mock API chậm (không bao giờ resolve)
    mockCheckIn.mockImplementation(() => new Promise(() => {}))

    render(
      <GateOperationsPanel
        prefill={{ type: 'plate', value: '30A-12345' }}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByText('Xác nhận Check-in'))

    await waitFor(() => {
      expect(screen.getByText('← Quét xe khác')).toBeDisabled()
    })
  })
})
