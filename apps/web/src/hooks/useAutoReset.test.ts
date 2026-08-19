import { renderHook, act } from '@testing-library/react'
import { useAutoReset } from './useAutoReset'

describe('useAutoReset', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('counts down and triggers onReset when timeout expires', () => {
    const onReset = jest.fn()
    const { result } = renderHook(() =>
      useAutoReset({ onReset, timeoutSeconds: 3 }),
    )

    expect(result.current.secondsLeft).toBe(3)

    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(2)

    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('pauses and resumes timer', () => {
    const onReset = jest.fn()
    const { result } = renderHook(() =>
      useAutoReset({ onReset, timeoutSeconds: 3 }),
    )

    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(result.current.secondsLeft).toBe(2)

    // Pause
    act(() => {
      result.current.pause()
    })
    expect(result.current.isPaused).toBe(true)

    // Advance time while paused -> should not change
    act(() => {
      jest.advanceTimersByTime(5000)
    })
    expect(result.current.secondsLeft).toBe(2)
    expect(onReset).not.toHaveBeenCalled()

    // Resume
    act(() => {
      result.current.resume()
    })
    expect(result.current.isPaused).toBe(false)

    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(0)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('triggerNow triggers onReset immediately', () => {
    const onReset = jest.fn()
    const { result } = renderHook(() =>
      useAutoReset({ onReset, timeoutSeconds: 5 }),
    )

    act(() => {
      result.current.triggerNow()
    })

    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
