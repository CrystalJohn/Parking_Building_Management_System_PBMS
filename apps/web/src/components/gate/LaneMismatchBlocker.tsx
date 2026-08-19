import { ArrowRight, X } from 'lucide-react'
import { Button } from '../ui/button'

export interface LaneMismatchBlockerProps {
  detectedType: 'car' | 'motorbike'
  laneType: 'car' | 'motorbike'
  onRedirect?: () => void // Chuyển xe sang lane đúng
  onCancel?: () => void // Hủy check-in
  className?: string
}

export const LaneMismatchBlocker = ({
  detectedType,
  laneType,
  onRedirect,
  onCancel,
  className = '',
}: LaneMismatchBlockerProps) => {
  const detectedLabel = detectedType === 'car' ? 'Ô tô' : 'Xe máy'
  const laneLabel = laneType === 'car' ? 'Ô tô' : 'Xe máy'

  return (
    <div
      className={`rounded-2xl border-2 border-red-500 bg-red-100/90 p-6 text-center shadow-md dark:border-red-800 dark:bg-red-950/50 ${className}`}
    >
      <div className="mb-3 text-4xl">🚫</div>
      <h3 className="mb-2 text-lg font-bold text-red-700 dark:text-red-300">
        Xe không đúng lane!
      </h3>
      <p className="mb-5 text-sm text-red-600 dark:text-red-400">
        Phát hiện <strong>{detectedLabel}</strong>, nhưng lane này chỉ dành cho{' '}
        <strong>{laneLabel}</strong>.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRedirect && (
          <Button
            type="button"
            onClick={onRedirect}
            className="gap-2 bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500"
          >
            <ArrowRight className="size-4" />
            Hướng dẫn xe sang lane đúng ({detectedLabel})
          </Button>
        )}
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="gap-1.5 border-red-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <X className="size-4" />
            Hủy check-in
          </Button>
        )}
      </div>
    </div>
  )
}

export default LaneMismatchBlocker
