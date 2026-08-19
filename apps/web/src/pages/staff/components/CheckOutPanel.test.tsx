import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckOutPanel } from './CheckOutPanel'

// === MOCKS ===
jest.mock('../hooks/useCheckOutFlow', () => ({
  useInitCheckOut: jest.fn(),
  useConfirmCashPayment: jest.fn(),
  useCreateBankQr: jest.fn(),
  usePaymentStatus: jest.fn(),
  useConfirmExit: jest.fn(),
}))

jest.mock('../../../components/camera', () => ({
  DualCapturePanel: () => <div data-testid="dual-capture-mock" />,
}))

import {
  useInitCheckOut,
  useConfirmCashPayment,
  useCreateBankQr,
  usePaymentStatus,
  useConfirmExit,
} from '../hooks/useCheckOutFlow'

// === TEST DATA ===
const defaultProps = {
  session: {
    id: 'sess-001',
    checkInTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    slotCode: 'A-01',
  },
  vehicle: { plate: '30A-12345', type: 'car' as const },
  fee: { amount: 50000, breakdown: { baseFee: 40000, overtimeFee: 10000 } },
  onDone: jest.fn(),
  onCancel: jest.fn(),
}

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

function setupMocks(overrides: Record<string, unknown> = {}) {
  const defaults = {
    initCheckOut: {
      mutateAsync: jest.fn().mockResolvedValue({ session: { id: 'sess-001' }, totalFee: 50000, baseFee: 40000, overtimeFee: 10000, lostTicketPenalty: 0 }),
      isPending: false,
    },
    confirmCash: {
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
    },
    createQr: {
      mutateAsync: jest.fn().mockResolvedValue({ qrData: 'data:image/png;base64,mockqr' }),
      isPending: false,
    },
    confirmExit: {
      mutateAsync: jest.fn().mockResolvedValue({}),
      isPending: false,
    },
    paymentStatus: { data: null },
  }
  const mocks = { ...defaults, ...overrides }

  ;(useInitCheckOut as jest.Mock).mockReturnValue(mocks.initCheckOut)
  ;(useConfirmCashPayment as jest.Mock).mockReturnValue(mocks.confirmCash)
  ;(useCreateBankQr as jest.Mock).mockReturnValue(mocks.createQr)
  ;(useConfirmExit as jest.Mock).mockReturnValue(mocks.confirmExit)
  ;(usePaymentStatus as jest.Mock).mockReturnValue(mocks.paymentStatus)

  return mocks
}

// === TESTS ===
describe('CheckOutPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hiển thị thông tin xe và phí', () => {
    setupMocks()
    render(<CheckOutPanel {...defaultProps} />, { wrapper: createWrapper() })

    expect(screen.getByText('30A-12345')).toBeInTheDocument()
    expect(screen.getByText('A-01')).toBeInTheDocument()
    expect(screen.getAllByText(/50.000/).length).toBeGreaterThanOrEqual(1)
  })

  it('checkout tiền mặt thành công', async () => {
    const mocks = setupMocks()
    const onDone = jest.fn()

    render(<CheckOutPanel {...defaultProps} onDone={onDone} />, { wrapper: createWrapper() })

    // Chọn tiền mặt (default) và xác nhận
    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-out/i }))

    await waitFor(() => {
      expect(mocks.confirmCash.mutateAsync).toHaveBeenCalledWith('sess-001')
      expect(mocks.confirmExit.mutateAsync).toHaveBeenCalledWith('sess-001')
      expect(onDone).toHaveBeenCalled()
    })
  })

  it('checkout QR hiển thị mã QR', async () => {
    setupMocks()
    render(<CheckOutPanel {...defaultProps} />, { wrapper: createWrapper() })

    // Chọn QR
    await userEvent.click(screen.getByRole('button', { name: /QR Chuyển khoản/i }))
    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-out/i }))

    await waitFor(() => {
      expect(screen.getByAltText('VietQR')).toBeInTheDocument()
    })
  })

  it('gọi onCancel khi bấm Quay lại tra cứu', async () => {
    setupMocks()
    const onCancel = jest.fn()

    render(<CheckOutPanel {...defaultProps} onCancel={onCancel} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /Quay lại tra cứu/i }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('hiển thị error khi API fail', async () => {
    setupMocks({
      confirmCash: {
        mutateAsync: jest.fn().mockRejectedValue({
          response: { data: { message: 'Session không hợp lệ' } },
        }),
        isPending: false,
      },
    })

    render(<CheckOutPanel {...defaultProps} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /Xác nhận Check-out/i }))

    await waitFor(() => {
      expect(screen.getByText('Session không hợp lệ')).toBeInTheDocument()
    })
  })
})
