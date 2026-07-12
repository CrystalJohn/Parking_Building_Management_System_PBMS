import { useEffect, useState } from 'react'
import { AlertCircle, Expand, ImageOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchEvidenceImageBlobResult, type EvidenceImageFetchStatus } from '@/lib/sessions-api'
import { formatPlateForDisplay } from '@/lib/plate-format'
import { formatDateTimeVN } from '@/lib/date-time'
import { cn } from '@/lib/utils'

export type EvidenceAuditItem = {
  id: string
  eventType: 'check_in' | 'check_out'
  thumbnailUrl: string | null
  imageUrl: string | null
  ocrPlate: string | null
  confirmedPlate: string | null
  ocrConfidence: number | null
  capturedAt: string
  providerTimestamp: string | null
  staffName: string | null
  staffPhone: string | null
  imageStatus: 'available' | 'missing' | 'expired'
}

type LoadedImageState = {
  url: string | null
  status: 'idle' | 'loading' | EvidenceImageFetchStatus
}

const EMPTY_IMAGE: LoadedImageState = { url: null, status: 'idle' }

export function EvidenceComparisonPanel({
  checkInEvidence,
  checkOutEvidence,
}: {
  checkInEvidence: EvidenceAuditItem | null
  checkOutEvidence: EvidenceAuditItem | null
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EvidenceCard title="Check-in Captured" evidence={checkInEvidence} />
      <EvidenceCard title="Check-out Captured" evidence={checkOutEvidence} />
    </div>
  )
}

function EvidenceCard({
  title,
  evidence,
}: {
  title: string
  evidence: EvidenceAuditItem | null
}) {
  const preview = useEvidenceImage(evidence?.thumbnailUrl ?? evidence?.imageUrl ?? null)
  const full = useEvidenceImage(evidence?.imageUrl ?? evidence?.thumbnailUrl ?? null)
  const [open, setOpen] = useState(false)
  const plate = formatPlateForDisplay(evidence?.confirmedPlate ?? evidence?.ocrPlate)
  const confidence = evidence?.ocrConfidence != null ? `${Math.round(evidence.ocrConfidence * 100)}%` : 'Not available'
  const capturedAt = evidence?.capturedAt ? formatDateTimeVN(evidence.capturedAt) : 'Not available'
  const staff = evidence?.staffName ?? evidence?.staffPhone ?? 'Not available'
  const statusText = getEvidenceStatusText(evidence, preview.status)

  return (
    <>
      <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <Badge variant={preview.url ? 'secondary' : 'outline'}>
            {preview.status === 'loading' ? 'Loading' : evidence ? labelImageStatus(evidence.imageStatus, preview.url) : 'No evidence'}
          </Badge>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          {preview.url ? (
            <img
              src={preview.url}
              alt={plate ? `${title} ${plate}` : title}
              className="h-36 w-full rounded-xl border object-cover"
              onError={() => preview.setFailed()}
            />
          ) : (
            <div className="grid h-36 place-items-center rounded-xl border border-dashed bg-muted/35 p-4 text-center text-xs font-medium text-muted-foreground">
              <div className="space-y-2">
                <ImageOff className="mx-auto size-5" strokeWidth={1.8} />
                <p>{statusText}</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <EvidenceFact label="Plate" value={plate || 'Not available'} mono={Boolean(plate)} />
            <EvidenceFact label="Confidence" value={confidence} />
            <EvidenceFact label="Captured at" value={capturedAt} />
            <EvidenceFact label="Staff" value={staff} />
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={!evidence || (!evidence.imageUrl && !evidence.thumbnailUrl)}
                className="gap-2"
              >
                <Expand className="size-4" strokeWidth={1.8} />
                View full image
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {plate || 'No plate'}{evidence?.providerTimestamp ? ` • Provider ${formatDateTimeVN(evidence.providerTimestamp)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="p-5">
            {full.url ? (
              <img
                src={full.url}
                alt={plate ? `${title} ${plate}` : title}
                className="max-h-[70vh] w-full rounded-xl border object-contain"
                onError={() => full.setFailed()}
              />
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                <div className="space-y-2">
                  <AlertCircle className="mx-auto size-5" strokeWidth={1.8} />
                  <p>{getEvidenceStatusText(evidence, full.status)}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EvidenceFact({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-sm font-semibold text-foreground', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  )
}

function useEvidenceImage(path: string | null) {
  const [state, setState] = useState<LoadedImageState>(EMPTY_IMAGE)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    if (!path) {
      setState({ url: null, status: 'missing' })
      return () => undefined
    }

    setState({ url: null, status: 'loading' })
    void fetchEvidenceImageBlobResult(path).then((result) => {
      if (cancelled) {
        if (result.url?.startsWith('blob:')) URL.revokeObjectURL(result.url)
        return
      }
      objectUrl = result.url
      setState(result)
    })

    return () => {
      cancelled = true
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  return {
    ...state,
    setFailed: () =>
      setState((current) => {
        if (current.url?.startsWith('blob:')) URL.revokeObjectURL(current.url)
        return { url: null, status: 'failed' }
      }),
  }
}

function labelImageStatus(imageStatus: EvidenceAuditItem['imageStatus'], hasUrl: string | null) {
  if (hasUrl) return 'Image'
  if (imageStatus === 'expired') return 'Expired'
  if (imageStatus === 'missing') return 'Missing'
  return 'No image'
}

function getEvidenceStatusText(
  evidence: EvidenceAuditItem | null,
  status: LoadedImageState['status'],
) {
  if (!evidence) return 'No evidence'
  if (status === 'loading') return 'Loading image'
  if (status === 'expired' || evidence.imageStatus === 'expired') return 'Image expired'
  if (status === 'missing' || evidence.imageStatus === 'missing') return 'Image not stored'
  if (status === 'failed') return 'Image unavailable'
  return 'Image unavailable'
}
