import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GateFlow } from './GateFlow'
import { lookupSession, checkIn } from '../../../lib/sessions-api'

// === MOCKS ===
jest.mock('../../../lib/sessions-api', () => ({
  lookupSession: jest.fn(),
  checkIn: jest.fn(),
  scanReservationCheckIn: jest.fn(),
}))

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrdata'),
  },
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrdata'),
}))

jest.mock('../../../components/camera', () => ({
  DualCapturePanel: ({ onPlateCaptured, onOverviewCaptured }: any) => (
    <div data-testid="dual-capture-mock">
      <button
        onClick={() =>
          onPlateCaptured?.({
            plateNumber: '51G-88888',
            blob: new Blob(),
            previewUrl: 'blob:plate',
          })
        }
      >
        Mock Capture Plate Success
      </button>
      <button
        onClick={() =>
          onOverviewCaptured?.({
            blob: new Blob(),
            previewUrl: 'blob:overview',
          })
        }
      >
        Mock Capture Overview Success
      </button>
    </div>
  ),
  CapturedThumbnail: () => <div>Thumbnail</div>,
}))

jest.mock('../../../components/qr-scanner/QRScanner', () => ({
  QRScanner: () => <div>Mock QR Scanner</div>,
}))

const mockLookupSession = lookupSession as jest.Mock
const mockCheckIn = checkIn as jest.Mock

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

describe('GateFlow Integration Tests', () => {
  const originalPrint = window.print

  beforeEach(() => {
    jest.clearAllMocks()
    window.print = jest.fn()
  })

  afterEach(() => {
    window.print = originalPrint
  })

  it('Flow 1: Input plate -> not found in active sessions -> navigates to Check-in panel', async () => {
    mockLookupSession.mockResolvedValueOnce({
      status: 'none',
      vehicle: { plate: '30A-11111', type: 'car' },
    })

    render(<GateFlow />, { wrapper: createWrapper() })

    const input = screen.getByPlaceholderText(/Nhập biển số/i)
    await userEvent.type(input, '30A-11111')

    await userEvent.click(screen.getByRole('button', { name: /Tra cứu/i }))

    await waitFor(() => {
      expect(screen.getByText('Thông tin Check-in phương tiện')).toBeInTheDocument()
      expect(screen.getByDisplayValue('30A-11111')).toBeInTheDocument()
    })
  })

  it('Flow 2: Dual photo capture updates plate number and overview state', async () => {
    mockLookupSession.mockResolvedValueOnce({
      status: 'none',
    })

    render(<GateFlow />, { wrapper: createWrapper() })

    const input = screen.getByPlaceholderText(/Nhập biển số/i)
    await userEvent.type(input, '29A-12345')
    await userEvent.click(screen.getByRole('button', { name: /Tra cứu/i }))

    await waitFor(() => {
      expect(screen.getByTestId('dual-capture-mock')).toBeInTheDocument()
    })

    // Simulate OCR Plate capture success
    await userEvent.click(screen.getByText('Mock Capture Plate Success'))
    await userEvent.click(screen.getByText('Mock Capture Overview Success'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('51G-88888')).toBeInTheDocument()
    })
  })

  it('Flow 3: Check-in API success -> transitions to CheckInSuccess ticket -> prints and manual resets', async () => {
    mockLookupSession.mockResolvedValueOnce({
      status: 'none',
    })

    mockCheckIn.mockResolvedValueOnce({
      session: {
        id: 'sess-abc-123',
        sessionCode: 'TKT-2026-001',
        licensePlate: '30A-99999',
        vehicleType: 'car',
        checkInTime: '2026-08-16T16:45:00Z',
      },
      slot: { id: 1, code: 'T1-A05' },
      qr_code: null,
    })

    render(<GateFlow />, { wrapper: createWrapper() })

    const input = screen.getByPlaceholderText(/Nhập biển số/i)
    await userEvent.type(input, '30A-99999')
    await userEvent.click(screen.getByRole('button', { name: /Tra cứu/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận Check-in/i })).toBeInTheDocument()
    })

    // Submit Check-in
    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    await waitFor(() => {
      expect(screen.getByText('Check-in Thành Công')).toBeInTheDocument()
      expect(screen.getAllByText('#TKT-2026-001').length).toBeGreaterThan(0)
      expect(screen.getAllByText('T1-A05').length).toBeGreaterThan(0)
    })

    // Print button works
    await userEvent.click(screen.getByRole('button', { name: /In vé/i }))
    await waitFor(() => {
      expect(window.print).toHaveBeenCalled()
    })

    // Click "Xe tiếp theo" to reset
    await userEvent.click(screen.getByRole('button', { name: /Xe tiếp theo/i }))

    // Reset back to idle input
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Nhập biển số/i)).toBeInTheDocument()
    })
  })

  it('Flow 4: Check-in API failure displays error message', async () => {
    mockLookupSession.mockResolvedValueOnce({
      status: 'none',
    })

    mockCheckIn.mockRejectedValueOnce({
      response: { data: { message: 'Bãi đỗ đã hết chỗ cho loại xe này.' } },
    })

    render(<GateFlow />, { wrapper: createWrapper() })

    const input = screen.getByPlaceholderText(/Nhập biển số/i)
    await userEvent.type(input, '29A-88888')
    await userEvent.click(screen.getByRole('button', { name: /Tra cứu/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận Check-in/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-in/i }))

    await waitFor(() => {
      expect(screen.getByText('Bãi đỗ đã hết chỗ cho loại xe này.')).toBeInTheDocument()
    })
  })
})
