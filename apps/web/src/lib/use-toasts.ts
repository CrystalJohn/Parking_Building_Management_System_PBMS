import { useCallback } from 'react'
import { toast } from 'sonner'
import type { ToastMessage } from '../components/ui/Toast'

/**
 * Backwards-compatible adapter over Sonner.
 * Keeps the previous API shape so older pages can migrate without
 * touching their local toast call sites.
 */
export function useToasts() {
  const dismiss = useCallback((id?: number) => {
    if (typeof id === 'number') {
      toast.dismiss(id)
      return
    }
    toast.dismiss()
  }, [])

  return {
    toasts: [] as ToastMessage[],
    dismiss,
    showSuccess: (text: string) => toast.success(text),
    showError: (text: string) => toast.error(text),
    showWarning: (text: string) => toast.warning(text),
    showInfo: (text: string) => toast.info(text),
  }
}
