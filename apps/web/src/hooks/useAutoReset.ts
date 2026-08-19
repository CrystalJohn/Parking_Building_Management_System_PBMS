import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAutoResetOptions {
  onReset: () => void
  timeoutSeconds?: number
  enabled?: boolean
}

export function useAutoReset({
  onReset,
  timeoutSeconds = 3,
  enabled = true,
}: UseAutoResetOptions) {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds)
  const [isPaused, setIsPaused] = useState(false)
  const onResetRef = useRef(onReset)

  useEffect(() => {
    onResetRef.current = onReset
  }, [onReset])

  useEffect(() => {
    if (!enabled || isPaused) return

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onResetRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [enabled, isPaused])

  const pause = useCallback(() => {
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    setIsPaused(false)
  }, [])

  const triggerNow = useCallback(() => {
    setSecondsLeft(0)
    onResetRef.current()
  }, [])

  const resetTimer = useCallback(() => {
    setSecondsLeft(timeoutSeconds)
    setIsPaused(false)
  }, [timeoutSeconds])

  return {
    secondsLeft,
    isPaused,
    pause,
    resume,
    triggerNow,
    resetTimer,
  }
}
