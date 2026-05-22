import { useCallback, useRef, useState } from 'react'
import type { ToastMessage, ToastType } from '../components/ui/Toast'

/**
 * Lightweight toast state hook. Designed to be used at page-level
 * and passed to a <ToastContainer />.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const idRef = useRef(0)

  const show = useCallback((type: ToastType, text: string) => {
    idRef.current += 1
    const id = idRef.current
    setToasts((prev) => [...prev, { id, type, text }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return {
    toasts,
    dismiss,
    showSuccess: (text: string) => show('success', text),
    showError: (text: string) => show('error', text),
    showWarning: (text: string) => show('warning', text),
    showInfo: (text: string) => show('info', text),
  }
}
