import { Camera, CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { Button } from '../ui/button'

export interface CapturedThumbnailProps {
  label: string
  imageUrl?: string | null
  plateNumber?: string | null
  status?: 'not_captured' | 'captured'
  onCapture?: () => void
  onRetake?: () => void
  disabled?: boolean
  description?: string
  className?: string
}

export function CapturedThumbnail({
  label,
  imageUrl,
  plateNumber,
  status: statusProp,
  onCapture,
  onRetake,
  disabled = false,
  description,
  className = '',
}: CapturedThumbnailProps) {
  const isCaptured = statusProp ? statusProp === 'captured' : Boolean(imageUrl)

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-all duration-200 hover:shadow-md ${
        isCaptured ? 'border-emerald-500/40 dark:border-emerald-500/30' : 'border-border border-dashed'
      } ${className}`}
    >
      {/* Header with Title & Status Badge */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{label}</span>
        </div>

        {isCaptured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Đã chụp
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
            <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
            Chưa chụp
          </span>
        )}
      </div>

      {/* Image Preview / Placeholder Box */}
      <div
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900/5 dark:bg-slate-950/50"
      >
        {isCaptured && imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={label}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {plateNumber && (
              <div className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-1 backdrop-blur-sm">
                <span className="font-mono text-xs font-bold tracking-wider text-white">
                  {plateNumber}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 rounded-full bg-muted p-2.5 text-muted-foreground">
              <Camera className="size-5" />
            </div>
            <p className="text-xs text-muted-foreground">
              {description ?? 'Chưa có ảnh'}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end">
        {isCaptured ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetake}
            disabled={disabled}
            className="w-full gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Chụp lại
          </Button>
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onCapture}
            disabled={disabled}
            className="w-full gap-1.5 text-xs font-medium"
          >
            <Camera className="size-3.5" />
            Chụp ảnh
          </Button>
        )}
      </div>
    </div>
  )
}
