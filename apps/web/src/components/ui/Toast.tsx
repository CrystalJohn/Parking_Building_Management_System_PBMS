import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: number
  type: ToastType
  text: string
}

interface ToastProps {
  toast: ToastMessage
  onDismiss: (id: number) => void
  durationMs?: number
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-300 text-green-900',
  error: 'bg-red-50 border-red-300 text-red-900',
  warning: 'bg-yellow-50 border-yellow-300 text-yellow-900',
  info: 'bg-blue-50 border-blue-300 text-blue-900',
}

export function Toast({ toast, onDismiss, durationMs = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), durationMs)
    return () => clearTimeout(timer)
  }, [toast.id, durationMs, onDismiss])

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 px-4 py-3 rounded-md border shadow-sm min-w-[280px] max-w-md ${TYPE_STYLES[toast.type]}`}
    >
      <span className="flex-1 text-sm font-medium">{toast.text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="text-current opacity-60 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
