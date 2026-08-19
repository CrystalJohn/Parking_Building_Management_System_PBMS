import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DualCapturePanel } from './DualCapturePanel'

// Mock LicensePlateScanner and OverviewCaptureModal to test panel coordination
jest.mock('../plate-scanner/LicensePlateScanner', () => ({
  LicensePlateScanner: ({ onCaptured, onClose }: any) => (
    <div data-testid="plate-scanner-modal">
      <button
        onClick={() =>
          onCaptured?.(
            '30A-123.45',
            new Blob(['plate'], { type: 'image/jpeg' }),
            'blob:http://localhost/scanned-plate.jpg',
          )
        }
      >
        Mock Capture Plate
      </button>
      <button onClick={onClose}>Close Plate Modal</button>
    </div>
  ),
}))

jest.mock('./OverviewCaptureModal', () => ({
  OverviewCaptureModal: ({ isOpen, onCapture, onClose }: any) =>
    isOpen ? (
      <div data-testid="overview-modal">
        <button
          onClick={() =>
            onCapture?.(
              new Blob(['overview'], { type: 'image/jpeg' }),
              'blob:http://localhost/scanned-overview.jpg',
            )
          }
        >
          Mock Capture Overview
        </button>
        <button onClick={onClose}>Close Overview Modal</button>
      </div>
    ) : null,
}))

describe('DualCapturePanel', () => {
  it('renders both thumbnail sections with initial uncaptured status', () => {
    render(<DualCapturePanel />)

    expect(screen.getByText('1. Ảnh biển số (OCR)')).toBeInTheDocument()
    expect(screen.getByText('2. Ảnh toàn cảnh xe')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa chụp')).toHaveLength(2)
  })

  it('opens LicensePlateScanner when clicking Chụp ảnh on plate card', async () => {
    render(<DualCapturePanel autoPromptOverview={false} />)

    const captureButtons = screen.getAllByRole('button', { name: /Chụp ảnh/i })
    await userEvent.click(captureButtons[0])

    expect(screen.getByTestId('plate-scanner-modal')).toBeInTheDocument()
  })

  it('opens OverviewCaptureModal when clicking Chụp ảnh on overview card', async () => {
    render(<DualCapturePanel />)

    const captureButtons = screen.getAllByRole('button', { name: /Chụp ảnh/i })
    await userEvent.click(captureButtons[1])

    expect(screen.getByTestId('overview-modal')).toBeInTheDocument()
  })

  it('updates state and displays plate number when plate is captured', async () => {
    const onPlateCaptured = jest.fn()
    render(
      <DualCapturePanel
        onPlateCaptured={onPlateCaptured}
        autoPromptOverview={false}
      />,
    )

    const captureButtons = screen.getAllByRole('button', { name: /Chụp ảnh/i })
    await userEvent.click(captureButtons[0])

    await userEvent.click(screen.getByText('Mock Capture Plate'))

    expect(onPlateCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        plateNumber: '30A-123.45',
        dataUrl: 'blob:http://localhost/scanned-plate.jpg',
      }),
    )
    expect(screen.getByText('30A-123.45')).toBeInTheDocument()
  })

  it('updates state when overview is captured', async () => {
    const onOverviewCaptured = jest.fn()
    render(<DualCapturePanel onOverviewCaptured={onOverviewCaptured} />)

    const captureButtons = screen.getAllByRole('button', { name: /Chụp ảnh/i })
    await userEvent.click(captureButtons[1])

    await userEvent.click(screen.getByText('Mock Capture Overview'))

    expect(onOverviewCaptured).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: 'blob:http://localhost/scanned-overview.jpg',
      }),
    )
  })
})
