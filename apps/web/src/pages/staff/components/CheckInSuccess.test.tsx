import { render, screen, act } from '@testing-library/react'
import { CheckInSuccess } from './CheckInSuccess'

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrcodeimage'),
  },
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrcodeimage'),
}))

describe('CheckInSuccess', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders ticket details and auto-reset countdown banner', () => {
    render(
      <CheckInSuccess
        ticketCode="TKT-20260816-001"
        plateNumber="59A1-234.56"
        vehicleType="car"
        slotCode="T1-A05"
        checkInTime="2026-08-16T16:45:00Z"
        hourlyRate={20000}
        sessionId="sess-123"
        onNextVehicle={jest.fn()}
        autoResetSeconds={3}
      />,
    )

    expect(screen.getByText(/Tự động chuyển xe tiếp theo/i)).toBeInTheDocument()
    expect(screen.getByText('3s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tạm dừng/i })).toBeInTheDocument()
  })

  it('auto resets after countdown completes', () => {
    const onNextVehicle = jest.fn()
    render(
      <CheckInSuccess
        ticketCode="TKT-20260816-001"
        plateNumber="59A1-234.56"
        vehicleType="car"
        slotCode="T1-A05"
        checkInTime="2026-08-16T16:45:00Z"
        sessionId="sess-123"
        onNextVehicle={onNextVehicle}
        autoResetSeconds={3}
      />,
    )

    act(() => {
      jest.advanceTimersByTime(3500)
    })
    expect(onNextVehicle).toHaveBeenCalledTimes(1)
  })
})
