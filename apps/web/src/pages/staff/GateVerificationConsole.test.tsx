import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { scanGatePlate, verifyGatePlate, getCheckoutPreview } from '../../lib/sessions-api'
import type { GateVerifyResponse } from '../../lib/sessions-api'
import type { useToasts } from '../../lib/use-toasts'
import { GateVerificationConsole } from './GateVerificationConsole'

jest.mock('../../lib/sessions-api', () => ({
  scanGatePlate: jest.fn(),
  verifyGatePlate: jest.fn(),
  getCheckoutPreview: jest.fn(),
}))

const mockScanGatePlate = scanGatePlate as jest.Mock
const mockVerifyGatePlate = verifyGatePlate as jest.Mock
const mockGetCheckoutPreview = getCheckoutPreview as jest.Mock

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

// OCR scan response. The scan endpoint returns the decision directly, so this
// must carry vehicleStatus / recommendedAction / sessionId (used by the
// captureAndRecognize branch). Defaults to an ACTIVE_SESSION + CHECKOUT result.
function ocrScanResponse(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'CHECK_IN',
    source: 'OCR',
    plateConfirmed: '43A27208',
    canonicalPlate: '43A27208',
    plateDisplay: '43A-272.08',
    displayPlate: '43A-272.08',
    vehicleType: 'car',
    confidence: 0.95,
    ocrEvidenceId: 'evt-123',
    lookup: { mode: 'WALK_IN', matched: false, vehicleType: 'car' },
    vehicleStatus: 'ACTIVE_SESSION',
    recommendedAction: 'CHECKOUT',
    sessionId: 'sess-1',
    ...overrides,
  }
}

function verifyResponse(overrides: Partial<GateVerifyResponse> = {}) {
  return {
    displayPlate: '43A-272.08',
    canonicalPlate: '43A27208',
    vehicleType: 'car',
    vehicleStatus: 'ACTIVE_SESSION',
    recommendedAction: 'CHECKOUT',
    confidence: 0.95,
    sessionId: 'sess-1',
    ...overrides,
  }
}

// Minimal checkout preview so the ACTIVE_SESSION + CHECKOUT branch can resolve.
function checkoutPreview(sessionId = 'sess-1') {
  return {
    session: {
      id: sessionId,
      sessionCode: 'S-0001',
      licensePlate: '43A27208',
      plateDisplay: '43A-272.08',
      vehicleType: 'car',
      checkInTime: new Date().toISOString(),
      checkOutTime: null,
      status: 'ACTIVE',
      isPaid: false,
      feeAmount: 15000,
      penaltyAmount: 0,
      isOvertime: false,
      isLostTicket: false,
      plateNumberOcr: null,
      plateNumberConfirmed: null,
      floorId: null,
      zone: null,
      floor: null,
    },
    checkOutLane: { id: 'LANE-1', code: 'CAR-001', vehicleType: 'car' },
    fee: {
      durationHours: 2,
      baseFee: 15000,
      penalty: 0,
      total: 15000,
      isOvertime: false,
      isLostTicket: false,
    },
    payment: null,
    checkInEvidence: {
      status: 'UNLINKED',
      thumbnailUrl: null,
      imageUrl: null,
      capturedAt: null,
      ocrPlate: null,
      ocrConfidence: null,
      vehicleType: null,
    },
    exitEvidence: null,
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

// Renders the console and clicks the scan button. Callers await their own
// assertion target because the post-scan state differs per decision
// (CHECKOUT auto-advances to the preview modal; CHECKIN/MANUAL_REVIEW stop at
// the result card).
async function renderAndScan() {
  const toasts = makeToasts()
  const onConfirm = jest.fn()
  const onOpenOverride = jest.fn()
  mockScanGatePlate.mockResolvedValue(ocrScanResponse())
  mockVerifyGatePlate.mockResolvedValue(verifyResponse())
  mockGetCheckoutPreview.mockResolvedValue(checkoutPreview())
  render(
    <GateVerificationConsole
      toasts={toasts}
      onConfirm={onConfirm}
      onOpenOverride={onOpenOverride}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Scan Plate/i }))
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
    expect(screen.getByRole('button', { name: /Scan Plate/i })).toBeTruthy()
    expect(document.querySelector('video')).toBeTruthy()
    expect(screen.queryByText('Vehicle Status')).toBeNull()
    expect(screen.queryByText(/Complete Checkout/i)).toBeNull()
  })

  it('auto-advances ACTIVE_SESSION + CHECKOUT to the preview with "Complete Checkout"', async () => {
    mockScanGatePlate.mockResolvedValueOnce(
      ocrScanResponse({ vehicleStatus: 'ACTIVE_SESSION', recommendedAction: 'CHECKOUT', sessionId: 'sess-1' }),
    )
    mockGetCheckoutPreview.mockResolvedValueOnce(checkoutPreview('sess-1'))
    const { onConfirm } = await renderAndScan()

    expect((await screen.findAllByText('43A-272.08', {}, { timeout: 3000 })).length).toBeGreaterThan(0)
    const checkoutBtn = await screen.findByRole('button', { name: /Complete Checkout/i })
    expect(checkoutBtn).toBeTruthy()
    expect(mockScanGatePlate).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraId: 'staff-gate-camera',
        buildingName: 'PBMS Building',
        gateName: 'Main Gate',
      }),
    )

    fireEvent.click(checkoutBtn)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlate: '43A27208',
        recommendedAction: 'CHECKOUT',
        vehicleStatus: 'ACTIVE_SESSION',
        confidence: 0.95,
      }),
      'CHECKOUT',
    )
  })

  it('renders the result card for ACTIVE_RESERVATION with "Complete Check-in"', async () => {
    mockScanGatePlate.mockResolvedValueOnce(
      ocrScanResponse({ vehicleStatus: 'ACTIVE_RESERVATION', recommendedAction: 'CHECKIN', reservationId: 'res-1', sessionId: undefined }),
    )
    const { onConfirm } = await renderAndScan()

    expect((await screen.findAllByText('43A-272.08', {}, { timeout: 3000 })).length).toBeGreaterThan(0)
    expect(await screen.findByText('ACTIVE RESERVATION', {}, { timeout: 3000 })).toBeTruthy()
    expect(await screen.findByText('95%', {}, { timeout: 3000 })).toBeTruthy()
    const confirmBtn = await screen.findByRole('button', { name: /Complete Check-in/i }, { timeout: 3000 })
    expect(confirmBtn).toBeTruthy()

    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlate: '43A27208',
        recommendedAction: 'CHECKIN',
        vehicleStatus: 'ACTIVE_RESERVATION',
        confidence: 0.95,
      }),
    )
    expect(await screen.findByText('Confirmed')).toBeTruthy()
  })

  it('renders the result card for UNKNOWN with "Manual Review"', async () => {
    mockScanGatePlate.mockResolvedValueOnce(
      ocrScanResponse({ vehicleStatus: 'UNKNOWN', recommendedAction: 'MANUAL_REVIEW', sessionId: undefined }),
    )
    const { onConfirm } = await renderAndScan()

    expect((await screen.findAllByText('43A-272.08', {}, { timeout: 3000 })).length).toBeGreaterThan(0)
    expect(await screen.findByText('UNKNOWN VEHICLE', {}, { timeout: 3000 })).toBeTruthy()
    const manualBtn = await screen.findByRole('button', { name: /Manual Review/i }, { timeout: 3000 })
    expect(manualBtn).toBeTruthy()

    fireEvent.click(manualBtn)
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlate: '43A27208',
        recommendedAction: 'MANUAL_REVIEW',
        vehicleStatus: 'UNKNOWN',
        confidence: 0.95,
      }),
    )
    expect(await screen.findByText('Confirmed')).toBeTruthy()
  })

  it('renders "—" for confidence when null', async () => {
    mockScanGatePlate.mockResolvedValueOnce(
      ocrScanResponse({ vehicleStatus: 'UNKNOWN', recommendedAction: 'MANUAL_REVIEW', confidence: null, sessionId: undefined }),
    )
    await renderAndScan()
    expect(await screen.findByText('—')).toBeTruthy()
  })

  it('opens the override dialog via onOpenOverride with the result payload', async () => {
    const onOpenOverride = jest.fn()
    // Use a non-checkout branch so the result card (with Override) is shown.
    mockScanGatePlate.mockResolvedValueOnce(
      ocrScanResponse({ vehicleStatus: 'UNKNOWN', recommendedAction: 'MANUAL_REVIEW', sessionId: undefined }),
    )
    const toasts = makeToasts()
    const onConfirm = jest.fn()
    mockVerifyGatePlate.mockResolvedValue(verifyResponse())
    mockGetCheckoutPreview.mockResolvedValue(checkoutPreview())
    render(
      <GateVerificationConsole toasts={toasts} onConfirm={onConfirm} onOpenOverride={onOpenOverride} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Scan Plate/i }))
    const overrideBtn = await screen.findByRole('button', { name: 'Override' }, { timeout: 3000 })
    fireEvent.click(overrideBtn)
    expect(onOpenOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlate: '43A27208',
        recommendedAction: 'MANUAL_REVIEW',
        ocrEvidenceId: 'evt-123',
      }),
    )
  })

  it('shows the error state with retry when scan fails', async () => {
    mockScanGatePlate.mockRejectedValue(new Error('verify failed'))
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Scan Plate/i }))

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
    mockGetCheckoutPreview.mockResolvedValue(checkoutPreview())
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Scan Plate/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('59A-12345')).toBeTruthy()
    })
    fireEvent.change(screen.getByPlaceholderText('59A-12345'), {
      target: { value: '59a-123.45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('button', { name: /Complete Checkout/i }, { timeout: 3000 })).toBeTruthy()
    expect(mockVerifyGatePlate).toHaveBeenCalledWith({
      canonicalPlate: '59A12345',
      ocrEvidenceId: 'evt-123',
    })
  })

  it('verifies a plate entered manually from the idle state', async () => {
    mockVerifyGatePlate.mockResolvedValue(verifyResponse())
    mockGetCheckoutPreview.mockResolvedValue(checkoutPreview())
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /enter plate manually/i }))
    fireEvent.change(screen.getByPlaceholderText('59A-12345'), {
      target: { value: '59a-123.45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('button', { name: /Complete Checkout/i }, { timeout: 3000 })).toBeTruthy()
    expect(mockVerifyGatePlate).toHaveBeenCalledWith({ canonicalPlate: '59A12345' })
  })

  it('falls back to manual plate entry when the camera is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    render(<GateVerificationConsole toasts={makeToasts()} onConfirm={jest.fn()} />)

    await act(async () => { })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('59A-12345')).toBeTruthy()
    })
    expect(screen.getByText('Permission denied')).toBeTruthy()
  })
})
