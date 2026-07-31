import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { scanGatePlate, verifyGatePlate } from '../../lib/sessions-api'
import type { GateVerifyResponse } from '../../lib/sessions-api'
import type { useToasts } from '../../lib/use-toasts'
import { GateVerificationConsole } from './GateVerificationConsole'

jest.mock('../../lib/sessions-api', () => ({
  scanGatePlate: jest.fn(),
  verifyGatePlate: jest.fn(),
}))

const mockScanGatePlate = scanGatePlate as jest.Mock
const mockVerifyGatePlate = verifyGatePlate as jest.Mock

function installCameraMocks() {
  const mediaStreamMock = {
    getTracks: () => [{ stop: jest.fn() }],
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue(mediaStreamMock) },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 2,
  })
  HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve()) as never
  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => ({ drawImage: jest.fn() }),
  ) as never
  HTMLCanvasElement.prototype.toBlob = jest.fn(
    (callback: (blob: Blob | null) => void) => callback(new Blob(['frame'], { type: 'image/jpeg' })),
  ) as never
  URL.createObjectURL = jest.fn(() => 'blob:capture') as never
  URL.revokeObjectURL = jest.fn() as never
}

function ocrScanResponse() {
  return {
    mode: 'CHECK_IN',
    source: 'OCR',
    plateConfirmed: '43A27208',
    plateDisplay: '43A-272.08',
    confidence: 0.95,
    ocrEvidenceId: 'evt-123',
    lookup: { mode: 'WALK_IN', matched: false, vehicleType: 'car' },
  }
}

function verifyResponse(overrides: Partial<GateVerifyResponse> = {}) {
  return {
    plate: '43A-272.08',
    canonicalPlate: '43A27208',
    vehicleStatus: 'ACTIVE_SESSION',
    recommendedAction: 'CHECKOUT',
    confidence: 0.95,
    sessionId: 'sess-1',
    ...overrides,
  }
}

function makeToasts(): ReturnType<typeof useToasts> {
  return {
    toasts: [],
    dismiss: jest.fn(),
    showSuccess: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showInfo: jest.fn(),
  }
}

async function renderAndScan(props: { onOpenOverride?: (payload: unknown) => void } = {}) {
  const toasts = makeToasts()
  const onConfirm = jest.fn()
  const onOpenOverride = props.onOpenOverride ?? jest.fn()
  mockScanGatePlate.mockResolvedValue(ocrScanResponse())
  render(
    <GateVerificationConsole
      toasts={toasts}
      onConfirm={onConfirm}
      onOpenOverride={onOpenOverride}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Scan Plate' }))
  await screen.findByText('Scan result')
  return { onConfirm, onOpenOverride, toasts }
}

describe('GateVerificationConsole', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    installCameraMocks()
  })

  it('renders the idle state with camera feed and scan button', () => {
    render(
      <GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Scan Plate' })).toBeTruthy()
    expect(document.querySelector('video')).toBeTruthy()
    expect(screen.queryByText('Scan result')).toBeNull()
    expect(screen.queryByText('Confirm Check-out')).toBeNull()
  })

  it.each([
    {
      vehicleStatus: 'ACTIVE_SESSION',
      recommendedAction: 'CHECKOUT',
      buttonLabel: 'Confirm Check-out',
      statusLabel: 'Active session',
      sessionId: 'sess-1',
    },
    {
      vehicleStatus: 'ACTIVE_RESERVATION',
      recommendedAction: 'CHECKIN',
      buttonLabel: 'Confirm Check-in',
      statusLabel: 'Active reservation',
      reservationId: 'res-1',
    },
    {
      vehicleStatus: 'UNKNOWN',
      recommendedAction: 'MANUAL_REVIEW',
      buttonLabel: 'Review Manually',
      statusLabel: 'Unknown',
    },
  ] as const)(
    'renders the result card for $vehicleStatus with "$buttonLabel"',
    async ({ vehicleStatus, recommendedAction, buttonLabel, statusLabel, sessionId, reservationId }) => {
      mockVerifyGatePlate.mockResolvedValueOnce(
        verifyResponse({ vehicleStatus, recommendedAction, sessionId, reservationId }),
      )
      const { onConfirm } = await renderAndScan()

      expect(screen.getByText('43A-272.08')).toBeTruthy()
      expect(screen.getByText(statusLabel)).toBeTruthy()
      expect(screen.getByText('95%')).toBeTruthy()
      expect(screen.getByRole('button', { name: buttonLabel })).toBeTruthy()
      expect(mockVerifyGatePlate).toHaveBeenCalledWith({
        canonicalPlate: '43A27208',
        ocrEvidenceId: 'evt-123',
      })
      expect(mockScanGatePlate).toHaveBeenCalledWith(
        expect.objectContaining({
          cameraId: 'staff-gate-camera',
          buildingName: 'PBMS Building',
          gateName: 'Main Gate',
        }),
      )

      fireEvent.click(screen.getByRole('button', { name: buttonLabel }))
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalPlate: '43A27208',
          recommendedAction,
          vehicleStatus,
          confidence: 0.95,
        }),
      )
      expect(screen.getByText('Confirmed')).toBeTruthy()
    },
  )

  it('renders "—" for confidence when null', async () => {
    mockVerifyGatePlate.mockResolvedValueOnce(verifyResponse({ confidence: null }))
    await renderAndScan()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('opens the override dialog via onOpenOverride with the result payload', async () => {
    const onOpenOverride = jest.fn()
    mockVerifyGatePlate.mockResolvedValueOnce(verifyResponse())
    await renderAndScan({ onOpenOverride })

    fireEvent.click(screen.getByRole('button', { name: 'Override' }))
    expect(onOpenOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlate: '43A27208',
        recommendedAction: 'CHECKOUT',
        sessionId: 'sess-1',
        ocrEvidenceId: 'evt-123',
      }),
    )
  })

  it('shows the error state with retry when verification fails', async () => {
    mockScanGatePlate.mockResolvedValue(ocrScanResponse())
    mockVerifyGatePlate.mockRejectedValue(new Error('verify failed'))
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan Plate' }))

    await screen.findByText('Verification failed')
    expect(screen.getByText('verify failed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    await waitFor(() => {
      expect(screen.queryByText('Verification failed')).toBeNull()
    })
  })

  it('verifies a manually entered plate when OCR needs manual entry', async () => {
    mockScanGatePlate.mockResolvedValue({
      mode: 'NEEDS_MANUAL_PLATE',
      source: 'OCR',
      ocrEvidenceId: 'evt-123',
    })
    mockVerifyGatePlate.mockResolvedValue(verifyResponse())
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scan Plate' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('59A-12345')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText('59A-12345'), {
      target: { value: '59a-123.45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await screen.findByRole('button', { name: 'Confirm Check-out' })
    expect(mockVerifyGatePlate).toHaveBeenCalledWith({
      canonicalPlate: '59A12345',
      ocrEvidenceId: 'evt-123',
    })
  })

  it('verifies a plate entered manually from the idle state', async () => {
    mockVerifyGatePlate.mockResolvedValue(verifyResponse())
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /enter plate manually/i }))
    fireEvent.change(screen.getByPlaceholderText('59A-12345'), {
      target: { value: '59a-123.45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await screen.findByRole('button', { name: 'Confirm Check-out' })
    expect(mockVerifyGatePlate).toHaveBeenCalledWith({ canonicalPlate: '59A12345' })
  })

  it('falls back to manual plate entry when the camera is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)

    await act(async () => {})
    await waitFor(() => {
      expect(screen.getByPlaceholderText('59A-12345')).toBeTruthy()
    })
    expect(screen.getByText('Permission denied')).toBeTruthy()
  })
})
